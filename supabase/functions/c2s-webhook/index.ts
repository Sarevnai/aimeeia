// ========== AIMEE.iA - C2S WEBHOOK RECEIVER ==========
// Endpoint público acionado pelo C2S nos gatilhos on_create_lead, on_update_lead, on_close_lead.
// URL registrada no C2S: {supabase_functions_url}/c2s-webhook?tenant=<uuid>&secret=<hex>
// - O C2S aceita só 1 endpoint por token, então usamos query string pra rotear por tenant.
// - Validamos ?secret= contra tenants.c2s_webhook_secret pra evitar spoofing.
// - Payload esperado: { data: { id, attributes: {...} } } (mesmo formato do GET /leads/:id).
//
// Não processa response do C2S (não espera). Retorna 200 mesmo em erros não-fatais
// pra evitar retries agressivos do C2S (aceitamos perder eventos e reconciliar via delta-sync).

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getSupabaseClient, corsResponse, jsonResponse } from '../_shared/supabase.ts';
import { loadBrokerMap, mapC2sLeadToContactPayload, upsertContactFromC2sPayload } from '../_shared/c2s-lead-mapper.ts';

// Constant-time compare (evita timing attack na validação do secret)
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return corsResponse();
  if (req.method !== 'POST') return jsonResponse({ error: 'POST only' }, 405);

  const supabase = getSupabaseClient();
  const url = new URL(req.url);
  const tenant_id = url.searchParams.get('tenant');
  const secret = url.searchParams.get('secret');

  // Log headers básicos (debug)
  const event = req.headers.get('x-webhook-event') || url.searchParams.get('event') || 'unknown';

  if (!tenant_id || !secret) {
    console.warn('⚠️  c2s-webhook missing tenant or secret');
    return jsonResponse({ error: 'missing tenant or secret' }, 400);
  }

  // Valida secret contra tenants
  const { data: tenant } = await supabase
    .from('tenants')
    .select('id, c2s_webhook_secret')
    .eq('id', tenant_id)
    .maybeSingle();

  if (!tenant?.c2s_webhook_secret || !timingSafeEqual(tenant.c2s_webhook_secret, secret)) {
    console.warn(`⚠️  c2s-webhook invalid secret for tenant ${tenant_id}`);
    // 200 + no-op pra não vazar se o tenant existe
    return jsonResponse({ ok: true, ignored: 'auth' }, 200);
  }

  let body: any = null;
  try {
    body = await req.json();
  } catch {
    console.error('❌ c2s-webhook invalid JSON body');
    await supabase.from('c2s_webhook_events').insert({
      tenant_id, event_type: event, action: 'ignored_invalid_json',
      error_message: 'JSON parse failed',
    });
    return jsonResponse({ ok: true, ignored: 'invalid_json' }, 200);
  }

  // O C2S pode mandar { data: {...} } ou { lead: {...} } ou direto {...}. Tentamos os 3.
  const lead = body?.data || body?.lead || body;
  const leadId = lead?.id || lead?.data?.id || null;

  if (!leadId) {
    console.warn('⚠️  c2s-webhook payload without lead id', JSON.stringify(body).slice(0, 300));
    await supabase.from('c2s_webhook_events').insert({
      tenant_id, event_type: event, action: 'ignored_no_lead_id',
      raw_payload: body,
    });
    return jsonResponse({ ok: true, ignored: 'no_lead_id' }, 200);
  }

  try {
    const brokerMap = await loadBrokerMap(supabase, tenant_id);
    const { payload, phone } = mapC2sLeadToContactPayload(lead, tenant_id, brokerMap);
    let action = 'skipped_no_phone';
    if (payload && phone) {
      action = await upsertContactFromC2sPayload(supabase, tenant_id, payload, String(leadId), phone);
      console.log(`✅ c2s-webhook event=${event} lead=${leadId} action=${action}`);
    } else {
      console.warn(`⚠️  c2s-webhook lead ${leadId} has no phone, skipping`);
    }

    await supabase.from('c2s_webhook_events').insert({
      tenant_id, event_type: event, lead_id: String(leadId), action,
      raw_payload: body,
    });

    await supabase
      .from('tenants')
      .update({ c2s_webhook_last_event_at: new Date().toISOString() })
      .eq('id', tenant_id);

    return jsonResponse({ ok: true, event, lead_id: leadId, action }, 200);
  } catch (error) {
    const msg = (error as Error).message;
    console.error('❌ c2s-webhook processing error:', msg);
    await supabase.from('c2s_webhook_events').insert({
      tenant_id, event_type: event, lead_id: String(leadId), action: 'error',
      error_message: msg, raw_payload: body,
    });
    // Retorna 200 mesmo assim (não queremos retry do C2S). Reconciliação pelo delta-sync.
    return jsonResponse({ ok: true, error: msg }, 200);
  }
});
