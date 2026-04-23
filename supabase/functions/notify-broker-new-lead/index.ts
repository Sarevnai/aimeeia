// ========== AIMEE.iA v2 — NOTIFY BROKER NEW LEAD ==========
// Dispara notificação in-app (tabela notifications) + opcional WhatsApp pro
// número pessoal do corretor quando um novo lead é atribuído a ele.
//
// Payload:
//   tenant_id: string
//   broker_id: string
//   conversation_id: string
//   contact_name?: string
//   contact_phone?: string
//   property_code?: string
//   property_title?: string
//   neighborhood?: string

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getSupabaseClient, corsHeaders, corsResponse, jsonResponse, errorResponse } from '../_shared/supabase.ts';

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return corsResponse();

  const supabase = getSupabaseClient();

  try {
    const {
      tenant_id,
      broker_id,
      conversation_id,
      contact_name,
      contact_phone,
      property_code,
      property_title,
      neighborhood,
    } = await req.json();

    if (!tenant_id || !broker_id || !conversation_id) {
      return errorResponse('Missing tenant_id, broker_id ou conversation_id', 400);
    }

    // Load broker (precisa de profile_id pra in-app + phone pra WA)
    const { data: broker, error: brokerErr } = await supabase
      .from('brokers')
      .select('id, full_name, email, phone, profile_id')
      .eq('id', broker_id)
      .maybeSingle();

    if (brokerErr || !broker) {
      console.warn('⚠️ broker não encontrado:', broker_id, brokerErr);
      return errorResponse('Broker not found', 404);
    }

    const leadDisplay = contact_name || contact_phone || 'Novo lead';
    const propRef = property_code
      ? (property_title ? `${property_title} (cód. ${property_code})` : `cód. ${property_code}`)
      : (property_title || 'sem imóvel específico');

    // 1. Notificação in-app
    let inAppSent = false;
    if (broker.profile_id) {
      const { error: notifErr } = await supabase.from('notifications').insert({
        tenant_id,
        recipient_profile_id: broker.profile_id,
        type: 'new_lead_assigned',
        title: `Novo lead · ${leadDisplay}`,
        body: [
          `Imóvel: ${propRef}`,
          neighborhood ? `Bairro: ${neighborhood}` : null,
          `Aimee está atendendo. Acompanhe pra assumir a qualquer momento.`,
        ].filter(Boolean).join('\n'),
        link: `/chat/${conversation_id}`,
        metadata: {
          conversation_id,
          contact_phone,
          property_code,
          property_title,
          neighborhood,
        },
      });
      if (notifErr) {
        console.error('❌ notifications insert error:', notifErr);
      } else {
        inAppSent = true;
      }
    } else {
      console.warn(`⚠️ broker ${broker_id} sem profile_id — notificação in-app não enviada`);
    }

    // 2. WhatsApp pessoal do corretor (se tenant tiver habilitado + broker tiver phone)
    let waSent = false;
    if (broker.phone) {
      const { data: tenant } = await supabase
        .from('tenants')
        .select('*')
        .eq('id', tenant_id)
        .maybeSingle();

      const notifyViaWa = (tenant as any)?.notify_broker_via_wa !== false; // default true
      const templateName = (tenant as any)?.broker_notify_template || 'aimee_novo_lead';

      if (notifyViaWa && tenant && (tenant as any).wa_access_token) {
        try {
          // Normaliza phone do broker
          let brokerPhone = String(broker.phone).replace(/\D/g, '');
          if (!brokerPhone.startsWith('55') && brokerPhone.length <= 11) brokerPhone = '55' + brokerPhone;

          const panelBase = (tenant as any).panel_base_url || 'https://app.aimee.ia';
          const link = `${panelBase}/chat/${conversation_id}`;

          const tplRes = await supabase.functions.invoke('send-wa-template', {
            body: {
              tenant_id,
              phone_number: brokerPhone,
              template_name: templateName,
              language_code: 'pt_BR',
              body_params: [
                leadDisplay,
                propRef,
                neighborhood || 'não informado',
                link,
              ],
            },
          });
          waSent = !tplRes?.error;
          if (tplRes?.error) console.warn('⚠️ send-wa-template error:', tplRes.error);
        } catch (err) {
          console.warn('⚠️ WA notify broker exception:', err);
        }
      }
    }

    return jsonResponse({
      success: true,
      broker_id,
      in_app_sent: inAppSent,
      wa_sent: waSent,
    });

  } catch (error) {
    console.error('❌ notify-broker-new-lead error:', error);
    return errorResponse((error as Error).message);
  }
});
