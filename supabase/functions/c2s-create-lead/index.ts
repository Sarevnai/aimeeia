// ========== AIMEE.iA v2 - C2S CREATE LEAD ==========
// Sends qualified leads to C2S (Construtor de Vendas) CRM.
// Also handles generic lead handoff to operator.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getSupabaseClient, corsHeaders, corsResponse, jsonResponse, errorResponse } from '../_shared/supabase.ts';
import { logActivity } from '../_shared/utils.ts';

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
      shown_properties,
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
    // Table columns: setting_key, setting_value (not key/value)
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
        reason: reason || 'Lead qualificado via Aimee.iA',
        qualification: qualification_data || {},
        development_id: development_id || null,
        shown_properties: shown_properties || [],
      });
    } else {
      console.log('⚠️ C2S not configured for tenant, logging lead only');
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

    console.log(`✅ Lead handoff complete: ${phone_number} → ${c2sResult ? 'C2S' : 'operator only'}`);

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
// Docs: https://api.contact2sale.com/docs/api#leads-item-post-2
// Payload format: { data: { type: "lead", attributes: { ... } } }

function getTemperature(score: number): string {
  if (score >= 70) return '🔥 QUENTE';
  if (score >= 40) return '🌡️ MORNO';
  return '❄️ FRIO';
}

function formatPhone(phone: string): string {
  // Remove + prefix, keep digits only
  return phone.replace(/\D/g, '');
}

async function sendToC2S(config: any, leadData: any): Promise<any> {
  try {
    const qual = leadData.qualification || {};
    const typeNegotiation = qual.detected_interest === 'locacao' ? 'Locação' : 'Compra';
    const score = qual.qualification_score || 0;
    const temperature = getTemperature(score);

    // ========== PERFIL DO LEAD ==========
    const profileLines: string[] = [];
    profileLines.push(`• Interesse: ${typeNegotiation}`);
    if (qual.detected_property_type) profileLines.push(`• Tipo: ${qual.detected_property_type}`);
    if (qual.detected_neighborhood) profileLines.push(`• Bairro/Região: ${qual.detected_neighborhood}`);
    if (qual.detected_bedrooms) profileLines.push(`• Quartos: ${qual.detected_bedrooms}`);
    if (qual.detected_budget_max) profileLines.push(`• Orçamento: até R$ ${qual.detected_budget_max.toLocaleString('pt-BR')}`);
    profileLines.push(`• Temperatura: ${temperature} (${score}/100)`);

    // ========== IMÓVEIS APRESENTADOS ==========
    const shownProps: any[] = leadData.shown_properties || [];
    let propertiesSection = '';
    if (shownProps.length > 0) {
      const propLines = shownProps.map((p: any) => {
        const parts: string[] = [];
        if (p.codigo) parts.push(`Cód. ${p.codigo}`);
        if (p.tipo) parts.push(p.tipo);
        if (p.quartos) parts.push(`${p.quartos} dorms`);
        if (p.area_util) parts.push(`${p.area_util}m²`);
        if (p.preco) parts.push(`R$ ${Number(p.preco).toLocaleString('pt-BR')}`);
        if (p.bairro) parts.push(p.bairro);
        const line = `• ${parts.join(' | ')}`;
        const linkLine = p.link ? `  ${p.link}` : '';
        return linkLine ? `${line}\n${linkLine}` : line;
      });
      propertiesSection = `\n\n🏠 IMÓVEIS APRESENTADOS\n${propLines.join('\n')}`;
    }

    // ========== BODY FINAL ==========
    const waLink = `https://wa.me/${formatPhone(leadData.phone)}`;
    const body = [
      `📋 LEAD QUALIFICADO - AIMEE.IA`,
      ``,
      `👤 Cliente: ${leadData.name}`,
      `📱 WhatsApp: ${waLink}`,
      ``,
      `🎯 PERFIL`,
      profileLines.join('\n'),
      propertiesSection,
      ``,
      `💬 MOTIVO: ${leadData.reason}`,
    ].join('\n').trim();

    const payload = {
      data: {
        type: 'lead',
        attributes: {
          name: leadData.name,
          phone: leadData.phone,
          email: leadData.email || undefined,
          source: 'Aimee.iA WhatsApp',
          body,
          type_negotiation: typeNegotiation,
          neighbourhood: qual.detected_neighborhood || undefined,
          prop_ref: leadData.development_id || undefined,
        },
      },
    };

    const response = await fetch(config.api_url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.api_key}`,
      },
      body: JSON.stringify(payload),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('❌ C2S API error:', response.status, JSON.stringify(data).slice(0, 300));
      return { error: data, status: response.status };
    }

    console.log('✅ C2S response:', JSON.stringify(data).slice(0, 300));
    return data;

  } catch (error) {
    console.error('❌ C2S API error:', error);
    return { error: (error as Error).message };
  }
}
