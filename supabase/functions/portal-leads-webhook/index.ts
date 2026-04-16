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

    // ---- Create lead in C2S for broker distribution (plantão) ----
    // Canal Pro does NOT create leads in C2S — it only sends a webhook to the configured CRM.
    // We create the lead in C2S so the plantão queue distributes to the correct broker.
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
        const tags = ['Aimee', 'Portal', source || 'zap'].filter(Boolean);

        const c2sPayload = {
          data: {
            type: 'lead',
            attributes: {
              name: lead_name || 'Lead Portal',
              phone,
              email: lead_email || null,
              source: source || 'portal',
              body: [
                '━━━ LEAD VIA PORTAL ━━━',
                '',
                `📱 Origem: ${source || 'portal'}`,
                property_code ? `🏠 Imóvel: ${property_code}` : null,
                property_title ? `📋 ${property_title}` : null,
                message ? `💬 Mensagem: ${message}` : null,
              ].filter(Boolean).join('\n'),
              tags,
              prop_ref: property_code || null,
            },
          },
        };

        console.log('📤 portal-leads-webhook → C2S:', JSON.stringify(c2sPayload).slice(0, 500));

        const c2sRes = await fetch(config.api_url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${config.api_key}`,
          },
          body: JSON.stringify(c2sPayload),
        });

        if (c2sRes.ok) {
          const c2sData = await c2sRes.json();
          const created = c2sData?.data || c2sData;
          c2sLeadId = created?.id || null;

          // Get seller from create response
          c2sSellerId = created?.attributes?.seller?.id
            || created?.relationships?.seller?.data?.id
            || null;

          // If seller not in response, try GET detail
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
        assigned_broker_id: assignedBrokerId,
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
    return errorResponse((error as Error).message);
  }
});
