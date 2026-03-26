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

    if (c2sConfig?.setting_value?.api_url && c2sConfig?.setting_value?.api_key) {
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
      });
      // Only consider sent if no error in response
      c2sSent = c2sResult && !c2sResult.error;
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

    // Disable AI for this conversation (operator takeover)
    await supabase
      .from('conversation_states')
      .upsert({
        tenant_id,
        phone_number,
        is_ai_active: false,
        operator_takeover_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }, { onConflict: 'tenant_id,phone_number' });

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

function buildLeadBody(leadData: any): string {
  const qualification = leadData.qualification || {};
  const lines: string[] = [];

  // Header
  lines.push('━━━ LEAD QUALIFICADO VIA AIMEE.IA ━━━');
  lines.push('');

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
  if (perfilItems.length > 0) {
    lines.push('📋 PERFIL DO CLIENTE');
    perfilItems.forEach(item => lines.push(`  • ${item}`));
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
        'Authorization': `Bearer ${config.api_key}`,
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
