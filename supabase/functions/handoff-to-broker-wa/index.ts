// ========== AIMEE.iA v2 — HANDOFF TO BROKER WA (PESSOAL) ==========
// Encaminha a conversa do cliente pro WhatsApp pessoal do corretor.
// Pausa Aimee, marca handoff_mode=broker_wa_personal, avisa o cliente.
//
// Payload:
//   tenant_id, conversation_id, broker_id, operator_id

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getSupabaseClient, corsHeaders, corsResponse, jsonResponse, errorResponse } from '../_shared/supabase.ts';
import { sendWhatsAppMessage, saveOutboundMessage } from '../_shared/whatsapp.ts';
import { Tenant } from '../_shared/types.ts';

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return corsResponse();

  const supabase = getSupabaseClient();

  try {
    const { tenant_id, conversation_id, broker_id, operator_id } = await req.json();
    if (!tenant_id || !conversation_id || !broker_id) {
      return errorResponse('Missing tenant_id, conversation_id ou broker_id', 400);
    }

    const [{ data: tenant }, { data: broker }, { data: conv }] = await Promise.all([
      supabase.from('tenants').select('*').eq('id', tenant_id).single(),
      supabase.from('brokers').select('*').eq('id', broker_id).single(),
      supabase.from('conversations').select('*, contacts(name, phone)').eq('id', conversation_id).single(),
    ]);

    if (!tenant || !broker || !conv) {
      return errorResponse('Tenant, broker ou conversation não encontrado', 404);
    }

    const clientPhone: string = (conv as any).phone_number;
    const clientName: string = (conv as any).contacts?.name || 'Cliente';
    const firstName = clientName.split(' ')[0];
    const brokerName: string = (broker as any).full_name || 'nosso consultor';

    const handshakeMsg =
      `Oi ${firstName}! A partir de agora quem continua com você é o ${brokerName}, ` +
      `nosso consultor da ${(tenant as any).company_name || 'imobiliária'}. ` +
      `Em instantes ele te chama direto pelo WhatsApp dele pra combinar os próximos passos. 🤝`;

    // 1. Enviar mensagem ao cliente
    const sendRes = await sendWhatsAppMessage(clientPhone, handshakeMsg, tenant as Tenant);
    if (sendRes?.success) {
      await saveOutboundMessage(
        supabase,
        tenant_id,
        conversation_id,
        clientPhone,
        handshakeMsg,
        sendRes.messageId,
        (conv as any).department_code || undefined,
        undefined,
        undefined,
        'operator',
        operator_id || null,
        'handoff_handshake',
      );
    } else {
      console.warn('⚠️ handshake WhatsApp send falhou');
    }

    const nowIso = new Date().toISOString();

    // 2. Atualizar conversation_states: pausa Aimee + marca handoff
    await supabase.from('conversation_states').upsert({
      tenant_id,
      phone_number: clientPhone,
      is_ai_active: false,
      operator_id: operator_id || null,
      operator_takeover_at: nowIso,
      handoff_mode: 'broker_wa_personal',
      handoff_broker_id: broker_id,
      handoff_at: nowIso,
      updated_at: nowIso,
    }, { onConflict: 'tenant_id,phone_number' });

    // 3. Atualizar conversations status
    await supabase.from('conversations').update({
      status: 'forwarded',
      assigned_broker_id: broker_id,
    }).eq('id', conversation_id);

    // 4. Registrar evento
    await supabase.from('conversation_events').insert({
      tenant_id,
      conversation_id,
      event_type: 'handoff_to_broker_wa',
      actor_id: operator_id || null,
      target_id: broker_id,
      metadata: {
        broker_name: brokerName,
        broker_phone: (broker as any).phone,
        client_phone: clientPhone,
        handshake_sent: !!sendRes?.success,
      },
    });

    return jsonResponse({
      success: true,
      handshake_sent: !!sendRes?.success,
      broker_phone: (broker as any).phone,
      client_phone: clientPhone,
      broker_name: brokerName,
    });

  } catch (error) {
    console.error('❌ handoff-to-broker-wa error:', error);
    return errorResponse((error as Error).message);
  }
});
