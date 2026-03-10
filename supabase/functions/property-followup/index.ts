// ========== AIMEE.iA - PROPERTY FOLLOW-UP ==========
// Called by a pg_cron job every minute.
// Sends "Gostou dessa opção ou posso te mostrar o próximo?" to leads
// who have been shown a property but haven't responded in 3 minutes.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';

const FOLLOWUP_MESSAGE = 'Gostou dessa opção ou posso te mostrar o próximo?';

const META_API_VERSION = 'v21.0';
const META_API_BASE = 'https://graph.facebook.com';

async function sendWhatsAppText(phoneNumber: string, message: string, tenant: any): Promise<boolean> {
  if (!tenant.wa_phone_number_id || !tenant.wa_access_token) {
    console.error('❌ Tenant missing WhatsApp credentials:', tenant.id);
    return false;
  }

  const url = `${META_API_BASE}/${META_API_VERSION}/${tenant.wa_phone_number_id}/messages`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${tenant.wa_access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: phoneNumber,
        type: 'text',
        text: { body: message },
      }),
    });

    if (!response.ok) {
      const err = await response.json();
      console.error('❌ WhatsApp API error:', JSON.stringify(err));
      return false;
    }

    console.log(`✅ Follow-up sent to ${phoneNumber}`);
    return true;
  } catch (error) {
    console.error('❌ WhatsApp send error:', error);
    return false;
  }
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: { 'Access-Control-Allow-Origin': '*' } });
  }

  try {
    const { tenant_id, phone_number } = await req.json();

    if (!tenant_id || !phone_number) {
      return new Response(JSON.stringify({ error: 'tenant_id and phone_number are required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Double-check that the conversation still needs a follow-up
    const { data: state } = await supabase
      .from('conversation_states')
      .select('awaiting_property_feedback, last_property_shown_at')
      .eq('tenant_id', tenant_id)
      .eq('phone_number', phone_number)
      .maybeSingle();

    if (!state?.awaiting_property_feedback || !state?.last_property_shown_at) {
      // Lead already responded or state changed — nothing to do
      return new Response(JSON.stringify({ skipped: true }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Fetch tenant credentials
    const { data: tenant } = await supabase
      .from('tenants')
      .select('id, wa_phone_number_id, wa_access_token')
      .eq('id', tenant_id)
      .maybeSingle();

    if (!tenant) {
      console.error('❌ Tenant not found:', tenant_id);
      return new Response(JSON.stringify({ error: 'Tenant not found' }), { status: 404 });
    }

    // Send follow-up message
    const sent = await sendWhatsAppText(phone_number, FOLLOWUP_MESSAGE, tenant);

    if (sent) {
      // Save to messages table so AI has context when lead replies
      const { data: conversation } = await supabase
        .from('conversations')
        .select('id, department_code')
        .eq('tenant_id', tenant_id)
        .eq('phone_number', phone_number)
        .eq('status', 'active')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      await supabase.from('messages').insert({
        tenant_id,
        conversation_id: conversation?.id || null,
        wa_from: 'system',
        wa_to: phone_number,
        direction: 'outbound',
        body: FOLLOWUP_MESSAGE,
        department_code: conversation?.department_code || null,
        sender_type: 'ai',
        created_at: new Date().toISOString(),
      });
    }

    return new Response(JSON.stringify({ sent }), {
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('❌ property-followup error:', error);
    return new Response(JSON.stringify({ error: String(error) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});
