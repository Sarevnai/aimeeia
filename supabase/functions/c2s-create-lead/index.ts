// ========== AIMEE.iA v2 - C2S CREATE LEAD ==========
// Sends qualified leads to C2S (Construtor de Vendas) CRM.
// Also handles generic lead handoff to operator.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getSupabaseClient, corsHeaders, corsResponse, jsonResponse, errorResponse } from '../_shared/supabase.ts';
import { logActivity, logError } from '../_shared/utils.ts';

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return corsResponse();

  const supabase = getSupabaseClient();

  try {
    const {
      tenant_id,
      phone_number,
      conversation_id,
      contact_id,
      reason,
      qualification_data,
      development_id,
      development_title,
    } = await req.json();

    if (!tenant_id || !phone_number) {
      return errorResponse('Missing required fields', 400);
    }

    // Load tenant
    const { data: tenant } = await supabase
      .from('tenants')
      .select('*')
      .eq('id', tenant_id)
      .single();

    if (!tenant) return errorResponse('Tenant not found', 404);

    // Load contact
    const { data: contact } = await supabase
      .from('contacts')
      .select('*')
      .eq('id', contact_id)
      .maybeSingle();

    // Sprint 6.2 — SETOR ADMINISTRATIVO NÃO SE INTEGRA COM C2S.
    // Defesa em profundidade: mesmo que alguém chame c2s-create-lead partindo
    // de um contexto admin (bug, UI legada, script), bloqueia na origem.
    if (contact?.contact_type === 'inquilino' || contact?.contact_type === 'proprietario') {
      console.warn(`⛔ c2s-create-lead bloqueado: contact_type=${contact.contact_type} pertence ao setor admin`);
      await logActivity(supabase, tenant_id, 'c2s_create_blocked_admin', 'contacts', contact_id || null, {
        reason: 'admin_sector_no_c2s',
        contact_type: contact?.contact_type,
      });
      return jsonResponse({ success: false, blocked: true, reason: 'Setor administrativo não integra com C2S' }, 403);
    }

    // Também bloqueia se a conversa é do setor administrativo
    if (conversation_id) {
      const { data: conv } = await supabase
        .from('conversations')
        .select('department_code')
        .eq('id', conversation_id)
        .maybeSingle();
      if (conv?.department_code === 'administrativo') {
        console.warn('⛔ c2s-create-lead bloqueado: conversation.department_code=administrativo');
        await logActivity(supabase, tenant_id, 'c2s_create_blocked_admin', 'conversations', conversation_id, {
          reason: 'admin_sector_no_c2s',
          department: 'administrativo',
        });
        return jsonResponse({ success: false, blocked: true, reason: 'Setor administrativo não integra com C2S' }, 403);
      }
    }

    // Load property details from pending_properties (source of truth)
    let propertyDetails: any = null;
    let finalDevId = development_id || null;
    let finalDevTitle = development_title || null;

    if (!finalDevId) {
      try {
        const { data: convState } = await supabase
          .from('conversation_states')
          .select('pending_properties, current_property_index, last_property_shown_at')
          .eq('tenant_id', tenant_id)
          .eq('phone_number', phone_number)
          .maybeSingle();

        if (convState?.pending_properties?.length) {
          const idx = convState.current_property_index > 0
            ? convState.current_property_index - 1
            : 0;
          const prop = convState.pending_properties[idx] || convState.pending_properties[0];
          if (prop?.codigo) {
            finalDevId = prop.codigo;
            const tipo = prop.tipo?.replace(/s$/, '') || 'Imóvel';
            const quartos = prop.quartos ? `com ${prop.quartos} dormitórios` : '';
            const bairro = prop.bairro || '';
            const cidade = prop.cidade || '';
            const localStr = [bairro, cidade].filter(Boolean).join(', ');
            finalDevTitle = [tipo, quartos, localStr ? `no ${localStr}` : ''].filter(Boolean).join(' ');
            propertyDetails = prop;
            console.log(`📦 c2s-create-lead: prop_ref from pending_properties: [${finalDevId}] ${finalDevTitle}`);
          }
        }
      } catch (err) {
        console.warn('⚠️ c2s-create-lead: failed to load pending_properties:', err);
      }
    }

    // If we have development_id but no property details yet, try to load them
    if (finalDevId && !propertyDetails) {
      try {
        const { data: convState } = await supabase
          .from('conversation_states')
          .select('pending_properties')
          .eq('tenant_id', tenant_id)
          .eq('phone_number', phone_number)
          .maybeSingle();
        if (convState?.pending_properties?.length) {
          propertyDetails = convState.pending_properties.find((p: any) => p.codigo === finalDevId) || null;
        }
      } catch (_) { /* ok */ }
    }

    // Check if C2S integration is configured
    const { data: c2sConfig } = await supabase
      .from('system_settings')
      .select('setting_value')
      .eq('tenant_id', tenant_id)
      .eq('setting_key', 'c2s_config')
      .maybeSingle();

    let c2sResult = null;
    let c2sSent = false;
    let c2sLeadId: string | null = null;
    let c2sLeadInternalId: number | null = null;
    let c2sSellerId: string | null = null;
    let assignedBrokerId: string | null = null;

    if (c2sConfig?.setting_value?.api_url && c2sConfig?.setting_value?.api_key) {
      // Build link direto pra conversa na Aimee (corretor abre via C2S)
      const panelBase = (tenant as any).panel_base_url || 'https://app.aimee.ia';
      const aimeeConversationLink = conversation_id ? `${panelBase}/chat/${conversation_id}` : null;

      // Send to C2S
      c2sResult = await sendToC2S(c2sConfig.setting_value, {
        name: contact?.name || 'Lead WhatsApp',
        phone: phone_number,
        email: contact?.email || null,
        origin: 'whatsapp_ai',
        notes: reason || 'Lead qualificado via Aimee.iA',
        qualification: qualification_data || {},
        development_id: finalDevId,
        development_title: finalDevTitle,
        property_details: propertyDetails,
        aimee_link: aimeeConversationLink, // link pro corretor abrir a conversa na Aimee
      });
      c2sSent = c2sResult && !c2sResult.error;

      // Capture lead_id + seller from response
      const created = c2sResult?.data || c2sResult;
      if (c2sSent && created) {
        c2sLeadId = created.id || null;
        c2sLeadInternalId = created.internal_id || null;
        const sellerInAttrs = created.attributes?.seller?.id || null;
        const sellerInRel = created.relationships?.seller?.data?.id || null;
        c2sSellerId = sellerInAttrs || sellerInRel;

        // Enrich via GET if seller not in create response
        if (!c2sSellerId && c2sLeadId) {
          try {
            const detailRes = await fetch(
              `https://api.contact2sale.com/integration/leads/${c2sLeadId}`,
              { headers: { 'Authentication': `Bearer ${c2sConfig.setting_value.api_key}`, 'Content-Type': 'application/json' } },
            );
            if (detailRes.ok) {
              const detail = await detailRes.json();
              c2sSellerId = detail?.data?.attributes?.seller?.id || null;
            }
          } catch (err) {
            console.warn('⚠️ c2s-create-lead: seller detail fetch failed', err);
          }
        }

        // Resolve broker_id in our DB
        if (c2sSellerId) {
          const { data: broker } = await supabase
            .from('brokers')
            .select('id')
            .eq('tenant_id', tenant_id)
            .eq('c2s_seller_id', c2sSellerId)
            .maybeSingle();
          assignedBrokerId = broker?.id || null;
        }
      }

      // Fallback plantão local — se C2S não resolveu broker, pega próximo do round-robin
      if (!assignedBrokerId) {
        // BUG FIX 2026-04-25: coluna é 'active', não 'is_active'.
        // O filtro errado fazia a query falhar silenciosamente — plantão NUNCA selecionava broker.
        const { data: dutyBroker } = await supabase
          .from('brokers')
          .select('id, c2s_seller_id, full_name')
          .eq('tenant_id', tenant_id)
          .eq('on_duty', true)
          .eq('active', true)
          .order('last_assigned_at', { ascending: true, nullsFirst: true })
          .limit(1)
          .maybeSingle();

        if (dutyBroker) {
          assignedBrokerId = dutyBroker.id;
          console.log(`🎯 Plantão fallback: lead atribuído a ${dutyBroker.full_name} (${dutyBroker.id})`);
          await supabase.from('brokers')
            .update({ last_assigned_at: new Date().toISOString() })
            .eq('id', dutyBroker.id);

          // Força atribuição no C2S também (se broker tem seller_id e já existe lead no C2S)
          if (dutyBroker.c2s_seller_id && c2sLeadId) {
            try {
              const forwardRes = await fetch(
                `https://api.contact2sale.com/integration/leads/${c2sLeadId}/forward`,
                {
                  method: 'PATCH',
                  headers: {
                    'Authentication': `Bearer ${c2sConfig.setting_value.api_key}`,
                    'Content-Type': 'application/json',
                  },
                  body: JSON.stringify({ seller_to_id: dutyBroker.c2s_seller_id }),
                },
              );
              if (forwardRes.ok) {
                c2sSellerId = dutyBroker.c2s_seller_id;
                console.log(`✅ C2S forward para seller ${dutyBroker.c2s_seller_id} concluído`);
              } else {
                console.warn(`⚠️ C2S forward falhou (${forwardRes.status})`);
              }
            } catch (err) {
              console.warn('⚠️ C2S forward exception:', err);
            }
          }
        } else {
          console.warn(`⚠️ Nenhum corretor em plantão no tenant ${tenant_id} — lead sem dono`);
        }
      }

      // Persist on contact + conversation (broker pode vir do fallback mesmo sem c2sLeadId)
      if (contact_id && (c2sLeadId || assignedBrokerId)) {
        const contactUpdate: any = { assigned_broker_id: assignedBrokerId };
        if (c2sLeadId) {
          contactUpdate.c2s_lead_id = c2sLeadId;
          contactUpdate.c2s_lead_internal_id = c2sLeadInternalId;
          contactUpdate.c2s_lead_synced_at = new Date().toISOString();
        }
        await supabase.from('contacts').update(contactUpdate).eq('id', contact_id);
      }
      if (conversation_id && (c2sLeadId || assignedBrokerId)) {
        const convUpdate: any = { assigned_broker_id: assignedBrokerId };
        if (c2sLeadId) convUpdate.c2s_lead_id = c2sLeadId;
        await supabase.from('conversations').update(convUpdate).eq('id', conversation_id);
      }
    }

    // Notificar corretor atribuído (fire-and-forget)
    if (assignedBrokerId && conversation_id) {
      supabase.functions.invoke('notify-broker-new-lead', {
        body: {
          tenant_id,
          broker_id: assignedBrokerId,
          conversation_id,
          contact_name: contact?.name || null,
          contact_phone: phone_number,
          property_code: finalDevId,
          property_title: finalDevTitle,
          neighborhood: qualification_data?.detected_neighborhood || propertyDetails?.bairro || null,
        },
      }).catch((err: any) => console.warn('⚠️ notify-broker-new-lead failed:', err));
    }

    // Log the lead to portal_leads_log
    const { error: logError_ } = await supabase.from('portal_leads_log').insert({
      tenant_id,
      portal_origin: 'whatsapp_ai',
      lead_source_type: 'ai_handoff',
      contact_phone: phone_number,
      contact_name: contact?.name || null,
      contact_email: contact?.email || null,
      development_id: development_id || null,
      message: reason || null,
      status: c2sSent ? 'sent' : 'pending',
      crm_status: c2sSent ? 'sent' : 'failed',
      crm_sent_at: c2sSent ? new Date().toISOString() : null,
      transaction_type: qualification_data?.detected_interest === 'locacao' ? 'locacao' : 'venda',
      created_at: new Date().toISOString(),
    });
    if (logError_) console.error('⚠️ portal_leads_log insert error:', logError_.message);

    // NOTE: Aimee KEEPS attending after handoff (per transcript 2026-04-14).
    // AI only pauses when: (a) broker clicks pause on panel, or (b) visit is confirmed.
    // Previously we set is_ai_active=false here, which broke the E3 flow.

    // Log activity
    await logActivity(supabase, tenant_id, 'lead_handoff', 'conversations', conversation_id, {
      reason,
      c2s_sent: c2sSent,
      c2s_error: c2sResult?.error || null,
      qualification_score: qualification_data?.qualification_score,
    });

    console.log(`✅ Lead handoff complete: ${phone_number} → ${c2sSent ? 'C2S' : 'operator only'}`);

    return jsonResponse({
      success: true,
      c2s_sent: c2sSent,
      c2s_lead_id: c2sLeadId,
      c2s_seller_id: c2sSellerId,
      assigned_broker_id: assignedBrokerId,
      c2s_response: c2sResult,
    });

  } catch (error) {
    console.error('❌ C2S create lead error:', error);
    return errorResponse((error as Error).message);
  }
});

// ========== C2S API ==========

function formatCurrencyBR(value: number | string | null | undefined): string | null {
  if (!value) return null;
  const num = typeof value === 'string' ? parseFloat(value) : value;
  if (isNaN(num)) return null;
  return num.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 0 });
}

function formatDateBR(iso: string | null | undefined): string {
  if (!iso) return '';
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return iso;
  return `${m[3]}/${m[2]}/${m[1]}`;
}

function buildLeadBody(leadData: any): string {
  const qualification = leadData.qualification || {};
  const lines: string[] = [];

  // Header
  lines.push('━━━ LEAD QUALIFICADO VIA AIMEE.IA ━━━');
  lines.push('');

  // Link pra acompanhar conversa na Aimee — pra o corretor responsável continuar o atendimento
  if (leadData.aimee_link) {
    lines.push('💬 ACOMPANHAR ATENDIMENTO');
    lines.push(`  ${leadData.aimee_link}`);
    lines.push('  (acesse pra ver toda a conversa e assumir quando quiser)');
    lines.push('');
  }

  // Perfil do cliente
  const perfilItems: string[] = [];
  const interest = qualification.detected_interest === 'locacao' ? 'Locação' : 'Venda';
  perfilItems.push(`Finalidade: ${interest}`);
  if (qualification.detected_property_type) {
    perfilItems.push(`Tipo: ${qualification.detected_property_type.charAt(0).toUpperCase() + qualification.detected_property_type.slice(1)}`);
  }
  if (qualification.detected_neighborhood) {
    perfilItems.push(`Bairro: ${qualification.detected_neighborhood}`);
  }
  if (qualification.detected_budget_max) {
    perfilItems.push(`Orçamento: até ${formatCurrencyBR(qualification.detected_budget_max)}`);
  }
  if (qualification.detected_bedrooms) {
    perfilItems.push(`Quartos: ${qualification.detected_bedrooms}`);
  }
  // Locação v1: campos pré-visita
  if (qualification.detected_income_monthly) {
    perfilItems.push(`Renda mensal aprox.: ${formatCurrencyBR(qualification.detected_income_monthly)}`);
  }
  if (typeof qualification.detected_has_pets === 'boolean') {
    if (qualification.detected_has_pets) {
      perfilItems.push(`Pets: Sim${qualification.detected_pet_type ? ` (${qualification.detected_pet_type})` : ''}`);
    } else {
      perfilItems.push(`Pets: Não`);
    }
  }
  if (qualification.detected_move_in_date) {
    perfilItems.push(`Data alvo de mudança: ${formatDateBR(qualification.detected_move_in_date)}`);
  }
  if (perfilItems.length > 0) {
    lines.push('📋 PERFIL DO CLIENTE');
    perfilItems.forEach(item => lines.push(`  • ${item}`));
    lines.push('');
  }

  if (Array.isArray(qualification.detected_features) && qualification.detected_features.length > 0) {
    lines.push('🌟 CARACTERÍSTICAS DESEJADAS');
    qualification.detected_features.forEach((f: string) => lines.push(`  • ${f}`));
    lines.push('');
  }

  // Imóvel de interesse
  if (leadData.development_id) {
    lines.push('🏠 IMÓVEL DE INTERESSE');
    lines.push(`  • Código: ${leadData.development_id}`);
    if (leadData.development_title) {
      lines.push(`  • ${leadData.development_title}`);
    }
    if (leadData.property_details) {
      const pd = leadData.property_details;
      if (pd.preco) lines.push(`  • Preço: ${formatCurrencyBR(pd.preco)}`);
      if (pd.quartos) lines.push(`  • Quartos: ${pd.quartos}`);
      if (pd.area_util) lines.push(`  • Área: ${pd.area_util}m²`);
      if (pd.link) lines.push(`  • Link: ${pd.link}`);
    }
    lines.push('');
  }

  // Motivo do handoff
  if (leadData.notes && leadData.notes !== 'Lead qualificado via Aimee.iA') {
    lines.push('💬 CONTEXTO');
    lines.push(`  ${leadData.notes}`);
    lines.push('');
  }

  // Score
  if (qualification.qualification_score) {
    lines.push(`⭐ Score: ${qualification.qualification_score}/100`);
  }

  return lines.join('\n');
}

async function sendToC2S(config: any, leadData: any): Promise<any> {
  try {
    const configTags: string[] = config.tags || ['Aimee'];
    const qualification = leadData.qualification || {};

    // Enrich with auto-generated qualification tags
    const qualTags: string[] = [];
    if (qualification.detected_interest) {
      qualTags.push(qualification.detected_interest === 'locacao' ? 'Interesse: Locação' : 'Interesse: Venda');
    }
    if (qualification.detected_property_type) {
      qualTags.push(`Tipo: ${qualification.detected_property_type.charAt(0).toUpperCase() + qualification.detected_property_type.slice(1)}`);
    }
    if (qualification.detected_neighborhood) {
      qualTags.push(`Bairro: ${qualification.detected_neighborhood}`);
    }
    // Locação v1: tag de pets é a mais útil pro corretor filtrar imóveis compatíveis
    if (typeof qualification.detected_has_pets === 'boolean') {
      qualTags.push(qualification.detected_has_pets ? 'Tem pets' : 'Sem pets');
    }
    const tags = [...configTags, ...qualTags];

    const body = buildLeadBody(leadData);

    // C2S API requires JSON API format: { data: { type, attributes } }
    const payload = {
      data: {
        type: 'lead',
        attributes: {
          name: leadData.name,
          phone: leadData.phone,
          email: leadData.email,
          source: leadData.origin,
          body,
          tags,
          type_negotiation: qualification.detected_interest === 'locacao' ? 'Aluguel' : 'Compra',
          neighbourhood: qualification.detected_neighborhood || null,
          price: qualification.detected_budget_max?.toString() || null,
          prop_ref: leadData.development_id
            ? (leadData.development_title ? `[${leadData.development_id}] ${leadData.development_title}` : leadData.development_id)
            : null,
        },
      },
    };

    console.log('📤 C2S payload:', JSON.stringify(payload).slice(0, 800));

    const response = await fetch(config.api_url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authentication': `Bearer ${config.api_key}`,
      },
      body: JSON.stringify(payload),
    });

    const data = await response.json();
    console.log(`📥 C2S response [${response.status}]:`, JSON.stringify(data).slice(0, 500));

    if (!response.ok) {
      console.error(`❌ C2S API returned ${response.status}`);
      return { error: `C2S API ${response.status}`, details: data };
    }

    return data;

  } catch (error) {
    console.error('❌ C2S API error:', error);
    return { error: (error as Error).message };
  }
}
