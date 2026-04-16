// ========== AIMEE.iA - C2S SUBSCRIBE WEBHOOKS ==========
// Assina os 3 webhooks do C2S (on_create_lead, on_update_lead, on_close_lead) pra um tenant.
// - Gera um secret opaco, salva em tenants.c2s_webhook_secret
// - Monta a URL pública do c2s-webhook com ?tenant=<id>&secret=<s>
// - Chama POST https://api.contact2sale.com/integration/api/subscribe 3 vezes
//
// Body da request:
//   { tenant_id: string, action?: 'subscribe' | 'unsubscribe' }
// Default = subscribe.
//
// Importante: o C2S só aceita 1 endpoint por token. Assinar aqui APAGA qualquer
// outro endpoint que estivesse registrado.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getSupabaseClient, corsResponse, jsonResponse, errorResponse } from '../_shared/supabase.ts';

const C2S_BASE = 'https://api.contact2sale.com/integration';
const HOOK_ACTIONS = ['on_create_lead', 'on_update_lead', 'on_close_lead'] as const;

function randomSecret(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return corsResponse();

  const supabase = getSupabaseClient();

  try {
    const { tenant_id, action = 'subscribe' } = await req.json();
    if (!tenant_id) return errorResponse('Missing tenant_id', 400);
    if (action !== 'subscribe' && action !== 'unsubscribe') {
      return errorResponse('action must be subscribe or unsubscribe', 400);
    }

    // Carrega token C2S
    const { data: c2sSetting } = await supabase
      .from('system_settings')
      .select('setting_value')
      .eq('tenant_id', tenant_id)
      .eq('setting_key', 'c2s_config')
      .maybeSingle();
    const apiKey = (c2sSetting?.setting_value as any)?.api_key;
    if (!apiKey) return errorResponse('C2S not configured for this tenant', 400);

    // Carrega tenant atual (pra saber se já tem secret)
    const { data: tenant } = await supabase
      .from('tenants')
      .select('id, c2s_webhook_secret')
      .eq('id', tenant_id)
      .single();
    if (!tenant) return errorResponse('Tenant not found', 404);

    if (action === 'unsubscribe') {
      // Cancela os 3 hooks
      const results: any[] = [];
      for (const hook_action of HOOK_ACTIONS) {
        const res = await fetch(`${C2S_BASE}/api/unsubscribe`, {
          method: 'POST',
          headers: { 'Authentication': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ hook_action }),
        });
        const txt = await res.text();
        results.push({ hook_action, ok: res.ok, status: res.status, body: txt.slice(0, 200) });
      }
      await supabase
        .from('tenants')
        .update({ c2s_webhook_subscribed_at: null })
        .eq('id', tenant_id);
      return jsonResponse({ success: true, action: 'unsubscribe', results });
    }

    // Subscribe: gera/reusa secret e monta URL
    const secret = tenant.c2s_webhook_secret || randomSecret();
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const hookUrl = `${supabaseUrl}/functions/v1/c2s-webhook?tenant=${tenant_id}&secret=${secret}`;

    // Persiste secret antes de assinar
    await supabase
      .from('tenants')
      .update({ c2s_webhook_secret: secret })
      .eq('id', tenant_id);

    const results: any[] = [];
    for (const hook_action of HOOK_ACTIONS) {
      const res = await fetch(`${C2S_BASE}/api/subscribe`, {
        method: 'POST',
        headers: { 'Authentication': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ hook_action, hook_url: hookUrl }),
      });
      const txt = await res.text();
      results.push({ hook_action, ok: res.ok, status: res.status, body: txt.slice(0, 200) });
    }

    const allOk = results.every((r) => r.ok);

    if (allOk) {
      await supabase
        .from('tenants')
        .update({ c2s_webhook_subscribed_at: new Date().toISOString() })
        .eq('id', tenant_id);
    }

    return jsonResponse({
      success: allOk,
      action: 'subscribe',
      hook_url: hookUrl,
      results,
    });
  } catch (error) {
    console.error('❌ c2s-subscribe-webhooks error:', error);
    return errorResponse((error as Error).message);
  }
});
