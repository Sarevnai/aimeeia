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

    // Check if C2S integration is configured
    const { data: c2sConfig } = await supabase
      .from('system_settings')
      .select('setting_value')
      .eq('tenant_id', tenant_id)
      .eq('setting_key', 'c2s_config')
      .maybeSingle();

    let c2sResult = null;

    if (c2sConfig?.setting_value?.api_url && c2sConfig?.setting_value?.api_key) {
      // Send to C2S
      c2sResult = await sendToC2S(c2sConfig.setting_value, {
        name: contact?.name || 'Lead WhatsApp',
        phone: phone_number,
        email: contact?.email || null,
        origin: 'whatsapp_ai',
        notes: reason || 'Lead qualificado via Aimee.iA',
        qualification: qualification_data || {},
        development_id: development_id || null,
      });
    }

    // Log the lead
    await supabase.from('portal_leads_log').insert({
      tenant_id,
      source: 'whatsapp_ai',
      phone: phone_number,
      contact_name: contact?.name || null,
      development_id: development_id || null,
      qualification_data: qualification_data || null,
      c2s_response: c2sResult || null,
      created_at: new Date().toISOString(),
    });

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
      c2s_sent: !!c2sResult,
      qualification_score: qualification_data?.qualification_score,
    });

    console.log(`✅ Lead handoff complete: ${phone_number} → ${c2sResult ? 'C2S' : 'operator'}`);

    return jsonResponse({
      success: true,
      c2s_sent: !!c2sResult,
      c2s_response: c2sResult,
    });

  } catch (error) {
    console.error('❌ C2S create lead error:', error);
    return errorResponse((error as Error).message);
  }
});

// ========== C2S API ==========

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

    const response = await fetch(config.api_url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.api_key}`,
      },
      body: JSON.stringify({
        name: leadData.name,
        phone: leadData.phone,
        email: leadData.email,
        source: leadData.origin,
        body: leadData.notes,
        tags,
        type_negotiation: qualification.detected_interest === 'locacao' ? 'Aluguel' : 'Compra',
        neighbourhood: qualification.detected_neighborhood || null,
        price: qualification.detected_budget_max?.toString() || null,
        prop_ref: leadData.development_id || null,
      }),
    });

    const data = await response.json();
    console.log('✅ C2S response:', JSON.stringify(data).slice(0, 300));
    return data;

  } catch (error) {
    console.error('❌ C2S API error:', error);
    return { error: (error as Error).message };
  }
}
