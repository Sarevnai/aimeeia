// ========== AIMEE.iA v2 - PORTAL LEADS WEBHOOK ==========
// Receives leads from real estate portals (ZAP, VivaReal, OLX, etc.)
// and initiates proactive WhatsApp outreach.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getSupabaseClient, corsHeaders, corsResponse, jsonResponse, errorResponse } from '../_shared/supabase.ts';
import { sendWhatsAppMessage, saveOutboundMessage } from '../_shared/whatsapp.ts';
import { logActivity, logError } from '../_shared/utils.ts';
import { Tenant } from '../_shared/types.ts';

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return corsResponse();

  const supabase = getSupabaseClient();

  try {
    const body = await req.json();
    const {
      tenant_id,
      source,         // 'zap', 'vivareal', 'olx', 'imovelweb', 'custom'
      lead_name,
      lead_phone,
      lead_email,
      property_code,
      property_title,
      development_id,
      message,
    } = body;

    if (!tenant_id || !lead_phone) {
      return errorResponse('Missing tenant_id or lead_phone', 400);
    }

    // Load tenant
    const { data: tenant } = await supabase
      .from('tenants')
      .select('*')
      .eq('id', tenant_id)
      .single();

    if (!tenant) return errorResponse('Tenant not found', 404);

    const t = tenant as Tenant;

    // Normalize phone
    let phone = lead_phone.replace(/\D/g, '');
    if (!phone.startsWith('55') && phone.length <= 11) phone = '55' + phone;

    // Log the portal lead
    const { data: logEntry } = await supabase
      .from('portal_leads_log')
      .insert({
        tenant_id,
        source: source || 'portal',
        phone,
        contact_name: lead_name || null,
        development_id: development_id || null,
        raw_payload: body,
        created_at: new Date().toISOString(),
      })
      .select('id')
      .single();

    // Find or create contact
    let { data: contact } = await supabase
      .from('contacts')
      .select('id, name')
      .eq('tenant_id', tenant_id)
      .eq('phone', phone)
      .maybeSingle();

    if (!contact) {
      const { data: newContact } = await supabase
        .from('contacts')
        .insert({
          tenant_id,
          phone,
          name: lead_name || null,
          status: 'ativo',
        })
        .select('id, name')
        .single();
      contact = newContact;
    }

    // Create conversation
    const { data: conversation } = await supabase
      .from('conversations')
      .insert({
        tenant_id,
        phone_number: phone,
        contact_id: contact?.id,
        department_code: 'vendas',
        status: 'active',
        last_message_at: new Date().toISOString(),
      })
      .select('id')
      .single();

    // Initialize conversation state (skip triage for portal leads)
    await supabase
      .from('conversation_states')
      .upsert({
        tenant_id,
        phone_number: phone,
        triage_stage: 'completed',
        is_ai_active: true,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'tenant_id,phone_number' });

    // Build proactive greeting
    let greeting = '';
    if (lead_name && property_title) {
      greeting = `Olá ${lead_name}! 👋 Vi que você demonstrou interesse no ${property_title}. Sou a Aimee, assistente virtual da ${t.company_name}. Posso te ajudar com mais informações sobre esse imóvel! 🏠`;
    } else if (lead_name) {
      greeting = `Olá ${lead_name}! 👋 Vi que você entrou em contato pelo portal. Sou a Aimee da ${t.company_name}. Como posso te ajudar? 😊`;
    } else {
      greeting = `Olá! 👋 Vi que você demonstrou interesse em um de nossos imóveis. Sou a Aimee da ${t.company_name}. Como posso te ajudar? 😊`;
    }

    // Send proactive message
    const { success, messageId } = await sendWhatsAppMessage(phone, greeting, t);

    if (success && conversation) {
      await saveOutboundMessage(
        supabase, tenant_id, conversation.id, phone, greeting, messageId, 'vendas'
      );
    }

    await logActivity(supabase, tenant_id, 'portal_lead_received', 'portal_leads_log', logEntry?.id, {
      source,
      property_code,
      proactive_sent: success,
    });

    return jsonResponse({
      success: true,
      conversation_id: conversation?.id,
      proactive_sent: success,
    });

  } catch (error) {
    console.error('❌ Portal leads webhook error:', error);
    return errorResponse(error.message);
  }
});
