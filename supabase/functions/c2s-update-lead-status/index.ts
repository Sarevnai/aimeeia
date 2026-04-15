// ========== AIMEE.iA - C2S UPDATE LEAD STATUS ==========
// Muda o lead_status via PATCH /integration/leads/{id}.
// Suporta apenas 'new' ↔ 'under_negotiation' (endpoints dedicados /archive
// e /done precisam de payload específico ainda desconhecido — TODO).

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getSupabaseClient, corsResponse, jsonResponse, errorResponse } from '../_shared/supabase.ts';

// C2S name → alias
const NAME_TO_ALIAS: Record<string, string> = {
  'Novo': 'new',
  'Em negociação': 'under_negotiation',
};

const SUPPORTED_NAMES = new Set(Object.keys(NAME_TO_ALIAS));

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return corsResponse();

  const supabase = getSupabaseClient();

  try {
    const { tenant_id, contact_id, new_status } = await req.json();
    if (!tenant_id || !contact_id || !new_status) {
      return errorResponse('Missing tenant_id, contact_id or new_status', 400);
    }

    if (!SUPPORTED_NAMES.has(new_status)) {
      return jsonResponse({
        success: false,
        reason: 'unsupported_transition',
        message: `Transição para "${new_status}" ainda não mapeada na API do C2S (endpoints /archive e /done exigem payload dedicado).`,
      }, 400);
    }

    const { data: contact, error: cErr } = await supabase
      .from('contacts')
      .select('id, c2s_lead_id, crm_status')
      .eq('id', contact_id)
      .eq('tenant_id', tenant_id)
      .single();
    if (cErr || !contact) return errorResponse('Contact not found', 404);
    if (!contact.c2s_lead_id) return errorResponse('Contact has no c2s_lead_id', 400);

    const { data: c2sSetting } = await supabase
      .from('system_settings')
      .select('setting_value')
      .eq('tenant_id', tenant_id)
      .eq('setting_key', 'c2s_config')
      .maybeSingle();
    const apiKey = (c2sSetting?.setting_value as any)?.api_key;
    if (!apiKey) return errorResponse('C2S not configured for tenant', 400);

    const alias = NAME_TO_ALIAS[new_status];

    // PATCH C2S
    const res = await fetch(
      `https://api.contact2sale.com/integration/leads/${contact.c2s_lead_id}`,
      {
        method: 'PATCH',
        headers: { 'Authentication': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: { type: 'lead', attributes: { status: alias } } }),
      },
    );
    if (!res.ok) {
      const errText = await res.text();
      return jsonResponse({
        success: false,
        reason: 'c2s_api_error',
        status: res.status,
        details: errText.slice(0, 300),
      }, 502);
    }

    // Read back to confirm
    const verifyRes = await fetch(
      `https://api.contact2sale.com/integration/leads/${contact.c2s_lead_id}`,
      { headers: { 'Authentication': `Bearer ${apiKey}`, 'Content-Type': 'application/json' } },
    );
    const verifyData = await verifyRes.json();
    const confirmedStatus = verifyData?.data?.attributes?.lead_status?.name;
    const confirmedFunnel = verifyData?.data?.attributes?.funnel_status?.status;

    if (confirmedStatus !== new_status) {
      return jsonResponse({
        success: false,
        reason: 'c2s_did_not_accept',
        requested: new_status,
        actual: confirmedStatus,
      }, 502);
    }

    // Update local
    await supabase
      .from('contacts')
      .update({
        crm_status: confirmedStatus,
        crm_funnel_status: confirmedFunnel || null,
        c2s_lead_synced_at: new Date().toISOString(),
      })
      .eq('id', contact_id);

    return jsonResponse({
      success: true,
      contact_id,
      old_status: contact.crm_status,
      new_status: confirmedStatus,
      funnel_status: confirmedFunnel || null,
    });

  } catch (error) {
    console.error('❌ c2s-update-lead-status error:', error);
    return errorResponse((error as Error).message);
  }
});
