// ========== AIMEE.iA v2 - PORTAL LEADS WEBHOOK ==========
// Receives leads from Canal Pro (Grupo ZAP/OLX) and other portals.
// Supports BOTH native Canal Pro format AND custom Aimee format.
// Creates lead in C2S for broker distribution, then initiates WhatsApp outreach.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getSupabaseClient, corsHeaders, corsResponse, jsonResponse, errorResponse } from '../_shared/supabase.ts';
import { sendWhatsAppMessage, saveOutboundMessage } from '../_shared/whatsapp.ts';
import { logActivity, logError } from '../_shared/utils.ts';
import { Tenant } from '../_shared/types.ts';

// Canal Pro leadType → readable label
const LEAD_TYPE_LABELS: Record<string, string> = {
  CONTACT_FORM: 'Formulário',
  CONTACT_CHAT: 'Chat',
  CLICK_WHATSAPP: 'Clique WhatsApp',
  PHONE_VIEW: 'Clique Telefone',
  CLICK_SCHEDULE: 'Agendamento',
  VISIT_REQUEST: 'Pedido de Visita',
};

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return corsResponse();

  const supabase = getSupabaseClient();

  try {
    // ---- 1. Parse payload (detect format: Canal Pro native vs custom) ----
    const body = await req.json();
    const isCanalPro = !!body.leadOrigin || !!body.originLeadId;

    let tenant_id: string;
    let lead_name: string | null;
    let lead_phone: string | null;
    let lead_email: string | null;
    let property_code: string | null;
    let message: string | null;
    let source: string;
    let transactionType: string | null = null;
    let leadType: string | null = null;
    let temperature: string | null = null;
    let originLeadId: string | null = null;
    let originListingId: string | null = null;

    if (isCanalPro) {
      // ---- CANAL PRO NATIVE FORMAT ----
      // Canal Pro does NOT send tenant_id — we resolve it via URL path or SECRET_KEY
      lead_name = body.name || null;
      lead_email = body.email || null;
      message = body.message || null;
      property_code = body.clientListingId || null;
      transactionType = body.transactionType || null; // "RENT" or "SELL"
      temperature = body.temperature || null; // "Baixa", "Média", "Alta"
      originLeadId = body.originLeadId || null;
      originListingId = body.originListingId || null;
      leadType = body.extraData?.leadType || null;

      // Phone: Canal Pro sends ddd + phone separately
      const ddd = body.ddd || '';
      const phonePart = body.phone || '';
      const phoneNumber = body.phoneNumber || ''; // deprecated but fallback
      lead_phone = ddd && phonePart ? `${ddd}${phonePart}` : phoneNumber || null;

      // Source from leadOrigin
      source = 'grupozap';

      // Resolve tenant_id from URL path or from config
      // URL format: .../portal-leads-webhook/TENANT_ID or .../portal-leads-webhook?tenant=TENANT_ID
      const url = new URL(req.url);
      const pathParts = url.pathname.split('/').filter(Boolean);
      const tenantFromPath = pathParts.length > 1 ? pathParts[pathParts.length - 1] : null;
      const tenantFromQuery = url.searchParams.get('tenant');
      tenant_id = tenantFromPath || tenantFromQuery || '';

      // If no tenant in URL, try to resolve by SECRET_KEY
      if (!tenant_id) {
        const authHeader = req.headers.get('Authorization') || '';
        if (authHeader.startsWith('Basic ')) {
          const decoded = atob(authHeader.slice(6));
          const secretKey = decoded.split(':')[1] || '';
          if (secretKey) {
            const { data: setting } = await supabase
              .from('system_settings')
              .select('tenant_id')
              .eq('setting_key', 'canal_pro_secret')
              .eq('setting_value', secretKey)
              .maybeSingle();
            tenant_id = setting?.tenant_id || '';
          }
        }
        // Last resort: if only one active tenant, use it (dev/single-tenant mode)
        if (!tenant_id) {
          const { data: tenants } = await supabase
            .from('tenants')
            .select('id')
            .eq('is_active', true)
            .limit(2);
          if (tenants?.length === 1) {
            tenant_id = tenants[0].id;
            console.log(`⚠️ portal-leads-webhook: single-tenant fallback → ${tenant_id}`);
          }
        }
      }

      // Validate Basic Auth if configured
      const authHeader = req.headers.get('Authorization') || '';
      if (authHeader.startsWith('Basic ') && tenant_id) {
        const { data: secretSetting } = await supabase
          .from('system_settings')
          .select('setting_value')
          .eq('tenant_id', tenant_id)
          .eq('setting_key', 'canal_pro_secret')
          .maybeSingle();
        if (secretSetting?.setting_value) {
          const decoded = atob(authHeader.slice(6));
          const receivedSecret = decoded.split(':')[1] || '';
          if (receivedSecret !== secretSetting.setting_value) {
            console.warn('❌ portal-leads-webhook: Basic Auth SECRET_KEY mismatch');
            return errorResponse('Unauthorized', 401);
          }
        }
      }

      console.log(`📥 Canal Pro lead: ${lead_name} | ${lead_phone} | listing:${property_code} | type:${leadType} | temp:${temperature} | tx:${transactionType}`);

    } else {
      // ---- CUSTOM AIMEE FORMAT (backward compatible) ----
      tenant_id = body.tenant_id;
      lead_name = body.lead_name || null;
      lead_phone = body.lead_phone || null;
      lead_email = body.lead_email || null;
      property_code = body.property_code || null;
      message = body.message || null;
      source = body.source || 'portal';
    }

    // ---- 2. Validate required fields ----
    if (!tenant_id) {
      return errorResponse('Could not resolve tenant_id. Use URL path, query param, or Basic Auth.', 400);
    }
    if (!lead_phone) {
      return errorResponse('Missing phone number', 400);
    }

    // Load tenant
    const { data: tenant } = await supabase
      .from('tenants')
      .select('*')
      .eq('id', tenant_id)
      .single();

    if (!tenant) return errorResponse('Tenant not found', 404);
    const t = tenant as Tenant;

    // ---- 3. Normalize phone ----
    let phone = lead_phone.replace(/\D/g, '');
    if (!phone.startsWith('55') && phone.length <= 11) phone = '55' + phone;

    // ---- 4. Deduplication via originLeadId ----
    if (originLeadId) {
      const { data: existing } = await supabase
        .from('portal_leads_log')
        .select('id')
        .eq('tenant_id', tenant_id)
        .eq('origin_lead_id', originLeadId)
        .maybeSingle();
      if (existing) {
        console.log(`⚠️ portal-leads-webhook: duplicate originLeadId ${originLeadId}, skipping`);
        return jsonResponse({ success: true, duplicate: true, originLeadId });
      }
    }

    // ---- 5. Determine department from transactionType ----
    const department = transactionType === 'RENT' ? 'locacao' : 'vendas';

    // ---- 6. Log the portal lead ----
    const { data: logEntry } = await supabase
      .from('portal_leads_log')
      .insert({
        tenant_id,
        source,
        phone,
        contact_name: lead_name || null,
        development_id: property_code || null,
        raw_payload: body,
        origin_lead_id: originLeadId,
        origin_listing_id: originListingId,
        lead_type: leadType,
        temperature,
        transaction_type: transactionType === 'RENT' ? 'locacao' : 'venda',
        created_at: new Date().toISOString(),
      })
      .select('id')
      .single();

    // ---- 7. Find or create contact ----
    let { data: contact } = await supabase
      .from('contacts')
      .select('id, name, dnc, dnc_reason')
      .eq('tenant_id', tenant_id)
      .eq('phone', phone)
      .maybeSingle();

    // ---- 7b. Hard block: contato já marcado DNC (opt-out prévio) ----
    // LGPD: portal pode reenviar um lead cujo dono pediu pra sair da lista.
    // Se ignorar aqui, a Aimee dispara greeting e violamos o opt-out. Log,
    // registramos no portal_leads_log como filtrado, e NÃO disparamos nada.
    if (contact?.dnc) {
      console.log(`🚫 portal-leads-webhook: contact ${contact.id} é DNC (${contact.dnc_reason}), bloqueando greeting.`);
      await supabase.from('portal_leads_log')
        .update({ raw_payload: { ...body, _dnc_blocked: true, _dnc_reason: contact.dnc_reason } })
        .eq('id', logEntry?.id);
      await logActivity(supabase, tenant_id, 'portal_lead_dnc_blocked', 'contacts', contact.id, {
        source, phone, origin_lead_id: originLeadId, dnc_reason: contact.dnc_reason,
      });
      return jsonResponse({ success: true, dnc_blocked: true, contact_id: contact.id });
    }

    if (!contact) {
      const { data: newContact } = await supabase
        .from('contacts')
        .insert({
          tenant_id,
          phone,
          name: lead_name || null,
          email: lead_email || null,
          status: 'ativo',
          channel_source: source === 'grupozap' ? 'canal_pro' : source,
          contact_type: 'lead',
        })
        .select('id, name')
        .single();
      contact = newContact;
    } else if (lead_name && !contact.name) {
      // Update name if we have one and contact didn't
      await supabase.from('contacts').update({ name: lead_name }).eq('id', contact.id);
    }

    // ---- 8. Create lead in C2S for broker distribution (plantão) ----
    let assignedBrokerId: string | null = null;
    let c2sLeadId: string | null = null;
    let c2sSellerId: string | null = null;
    try {
      const { data: c2sConfig } = await supabase
        .from('system_settings')
        .select('setting_value')
        .eq('tenant_id', tenant_id)
        .eq('setting_key', 'c2s_config')
        .maybeSingle();

      const config = c2sConfig?.setting_value as any;
      if (config?.api_url && config?.api_key) {
        const leadTypeLabel = leadType ? (LEAD_TYPE_LABELS[leadType] || leadType) : 'Portal';
        const tags = ['Aimee', 'Canal Pro', leadTypeLabel].filter(Boolean);
        if (temperature) tags.push(`Temp: ${temperature}`);

        const c2sPayload = {
          data: {
            type: 'lead',
            attributes: {
              name: lead_name || 'Lead Portal',
              phone,
              email: lead_email || null,
              source: `canal_pro_${(leadType || 'form').toLowerCase()}`,
              body: [
                '━━━ LEAD VIA CANAL PRO ━━━',
                '',
                `📱 Canal: ${leadTypeLabel}`,
                `🌡️ Temperatura: ${temperature || 'N/A'}`,
                `📋 Transação: ${transactionType === 'RENT' ? 'Locação' : 'Venda'}`,
                property_code ? `🏠 Imóvel: ${property_code}` : null,
                message ? `💬 Mensagem: ${message}` : null,
                originLeadId ? `🔗 ID Portal: ${originLeadId}` : null,
              ].filter(Boolean).join('\n'),
              tags,
              type_negotiation: transactionType === 'RENT' ? 'Aluguel' : 'Compra',
              prop_ref: property_code || null,
            },
          },
        };

        console.log('📤 portal-leads-webhook → C2S:', JSON.stringify(c2sPayload).slice(0, 500));

        const c2sRes = await fetch(config.api_url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authentication': `Bearer ${config.api_key}`,
          },
          body: JSON.stringify(c2sPayload),
        });

        if (c2sRes.ok) {
          const c2sData = await c2sRes.json();
          const created = c2sData?.data || c2sData;
          c2sLeadId = created?.id || null;

          c2sSellerId = created?.attributes?.seller?.id
            || created?.relationships?.seller?.data?.id
            || null;

          // Enrich via GET if seller not in create response
          if (!c2sSellerId && c2sLeadId) {
            try {
              const detailRes = await fetch(
                `https://api.contact2sale.com/integration/leads/${c2sLeadId}`,
                { headers: { 'Authentication': `Bearer ${config.api_key}`, 'Content-Type': 'application/json' } },
              );
              if (detailRes.ok) {
                const detail = await detailRes.json();
                c2sSellerId = detail?.data?.attributes?.seller?.id || null;
              }
            } catch (_) { /* non-blocking */ }
          }

          // Resolve broker in Aimee
          if (c2sSellerId) {
            const { data: broker } = await supabase
              .from('brokers')
              .select('id')
              .eq('tenant_id', tenant_id)
              .eq('c2s_seller_id', c2sSellerId)
              .maybeSingle();
            assignedBrokerId = broker?.id || null;
          }

          console.log(`✅ portal-leads-webhook: C2S lead ${c2sLeadId}, seller ${c2sSellerId}, broker ${assignedBrokerId}`);
        } else {
          console.warn(`⚠️ portal-leads-webhook: C2S create failed [${c2sRes.status}]`);
        }
      }
    } catch (err) {
      console.warn('⚠️ portal-leads-webhook: C2S create failed (non-blocking):', err);
    }

    // Update contact with C2S link + broker
    if (contact?.id) {
      const contactUpdate: any = {};
      if (assignedBrokerId) contactUpdate.assigned_broker_id = assignedBrokerId;
      if (c2sLeadId) contactUpdate.c2s_lead_id = c2sLeadId;
      if (Object.keys(contactUpdate).length > 0) {
        await supabase.from('contacts').update(contactUpdate).eq('id', contact.id);
      }
    }

    // ---- 9. Create conversation ----
    const { data: conversation } = await supabase
      .from('conversations')
      .insert({
        tenant_id,
        phone_number: phone,
        contact_id: contact?.id,
        department_code: department,
        status: 'active',
        source: source === 'grupozap' ? 'canal_pro' : source,
        last_message_at: new Date().toISOString(),
        assigned_broker_id: assignedBrokerId,
      })
      .select('id')
      .single();

    // ---- 10. Initialize conversation state (skip triage for portal leads) ----
    await supabase
      .from('conversation_states')
      .upsert({
        tenant_id,
        phone_number: phone,
        triage_stage: 'completed',
        is_ai_active: true,
        portal_property_code: property_code || null,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'tenant_id,phone_number' });

    // ---- 11. Match property by clientListingId (Vista external_id) ----
    let propertyTitle: string | null = null;
    if (property_code) {
      const { data: prop } = await supabase
        .from('properties')
        .select('id, tipo, bairro, cidade, preco')
        .eq('tenant_id', tenant_id)
        .eq('external_id', property_code)
        .maybeSingle();
      if (prop) {
        propertyTitle = [prop.tipo, prop.bairro ? `no ${prop.bairro}` : null, prop.cidade].filter(Boolean).join(' ');
        console.log(`🏠 portal-leads-webhook: matched property ${property_code} → ${propertyTitle}`);
      } else {
        console.warn(`⚠️ portal-leads-webhook: property ${property_code} NOT found in Vista`);
      }
    }

    // ---- 12. Build proactive greeting ----
    let greeting = '';
    const contactName = lead_name || contact?.name || null;

    if (leadType === 'PHONE_VIEW' || leadType === 'CLICK_WHATSAPP') {
      // Phone click / WA click — more direct approach
      if (contactName && propertyTitle) {
        greeting = `Olá ${contactName}! Vi que você se interessou pelo ${propertyTitle}. Sou a ${t.agent_name || 'Aimee'}, assistente da ${t.company_name}. Posso te passar mais detalhes sobre esse imóvel?`;
      } else if (contactName) {
        greeting = `Olá ${contactName}! Vi seu interesse em nossos imóveis. Sou a ${t.agent_name || 'Aimee'} da ${t.company_name}. Como posso te ajudar?`;
      } else {
        greeting = `Olá! Vi que você se interessou em um de nossos imóveis. Sou a ${t.agent_name || 'Aimee'} da ${t.company_name}. Posso te ajudar com mais informações?`;
      }
    } else {
      // Form / Chat / Visit — lead already engaged
      if (contactName && propertyTitle) {
        greeting = `Olá ${contactName}! Recebi sua mensagem sobre o ${propertyTitle}. Sou a ${t.agent_name || 'Aimee'}, assistente da ${t.company_name}. Vou te ajudar com todas as informações!`;
      } else if (contactName && message) {
        greeting = `Olá ${contactName}! Recebi sua mensagem pelo portal. Sou a ${t.agent_name || 'Aimee'} da ${t.company_name}. Vou te ajudar!`;
      } else {
        greeting = `Olá! Recebi seu contato pelo portal. Sou a ${t.agent_name || 'Aimee'} da ${t.company_name}. Como posso te ajudar?`;
      }
    }

    // ---- 13. Send proactive message ----
    const { success, messageId } = await sendWhatsAppMessage(phone, greeting, t);

    if (success && conversation) {
      await saveOutboundMessage(
        supabase, tenant_id, conversation.id, phone, greeting, messageId, department
      );
    }

    // ---- 14. If lead sent a message, save it as inbound ----
    if (message && conversation) {
      await supabase.from('messages').insert({
        tenant_id,
        conversation_id: conversation.id,
        direction: 'inbound',
        body: message,
        sender_type: 'customer',
        department_code: department,
      });
    }

    await logActivity(supabase, tenant_id, 'portal_lead_received', 'portal_leads_log', logEntry?.id, {
      source,
      property_code,
      lead_type: leadType,
      temperature,
      transaction_type: transactionType,
      origin_lead_id: originLeadId,
      c2s_lead_id: c2sLeadId,
      assigned_broker_id: assignedBrokerId,
      proactive_sent: success,
      is_canal_pro: isCanalPro,
    });

    console.log(`✅ Portal lead processed: ${phone} | dept:${department} | broker:${assignedBrokerId} | proactive:${success}`);

    // Canal Pro expects simple 2xx — body is ignored
    return jsonResponse({
      success: true,
      conversation_id: conversation?.id,
      proactive_sent: success,
      c2s_lead_id: c2sLeadId,
      assigned_broker_id: assignedBrokerId,
    });

  } catch (error) {
    console.error('❌ Portal leads webhook error:', error);
    return errorResponse((error as Error).message);
  }
});
