// ========== AIMEE.iA - C2S UPDATE LEAD STATUS ==========
// Reflete no C2S a mudança de status do lead arrastado no pipeline.
// Transições suportadas:
//   - Novo ↔ Em negociação  → PATCH /leads/:id  (attributes.status = alias)
//   - Arquivado             → POST  /leads/:id/update_status  (status=3, message)
//   - Negócio fechado       → POST  /leads/:id/done_deal      (value, date, type)

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getSupabaseClient, corsResponse, jsonResponse, errorResponse } from '../_shared/supabase.ts';

const C2S_BASE = 'https://api.contact2sale.com/integration';

// Map Novo / Em negociação → alias do endpoint PATCH
const NAME_TO_ALIAS: Record<string, string> = {
  'Novo': 'new',
  'Em negociação': 'under_negotiation',
};

// "Venda"/"Compra" → sale; "Aluguel"/"Locação" → rent
function resolveDoneDealType(natureza: string | null): string {
  if (!natureza) return 'sale';
  const n = natureza.toLowerCase();
  if (n.includes('alug') || n.includes('loca') || n.includes('tempor')) return 'rent';
  return 'sale';
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return corsResponse();

  const supabase = getSupabaseClient();

  try {
    const body = await req.json();
    const {
      tenant_id,
      contact_id,
      new_status,
      // Extras para Arquivado:
      archive_message,
      lost_reason_ids,
      // Extras para Negócio fechado:
      deal_value,
      deal_date,
      deal_info,
    } = body || {};

    if (!tenant_id || !contact_id || !new_status) {
      return errorResponse('Missing tenant_id, contact_id or new_status', 400);
    }

    const { data: contact, error: cErr } = await supabase
      .from('contacts')
      .select('id, c2s_lead_id, crm_status, crm_property_ref, crm_natureza')
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

    const authHeaders = {
      'Authentication': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    };

    let res: Response;

    if (NAME_TO_ALIAS[new_status]) {
      // PATCH /leads/:id com alias
      res = await fetch(`${C2S_BASE}/leads/${contact.c2s_lead_id}`, {
        method: 'PATCH',
        headers: authHeaders,
        body: JSON.stringify({ data: { type: 'lead', attributes: { status: NAME_TO_ALIAS[new_status] } } }),
      });
    } else if (new_status === 'Arquivado') {
      const payload: any = {
        status: 3,
        message: archive_message?.toString().trim() || 'Arquivado via Aimee',
      };
      if (Array.isArray(lost_reason_ids) && lost_reason_ids.length > 0) {
        payload.lost_reason_ids = lost_reason_ids;
      }
      res = await fetch(`${C2S_BASE}/leads/${contact.c2s_lead_id}/update_status`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify(payload),
      });
    } else if (new_status === 'Negócio fechado') {
      // Extrai prop_ref bruto de "[PROP] descrição" se existir
      let propRef: string | null = null;
      if (contact.crm_property_ref) {
        const m = contact.crm_property_ref.match(/^\[([^\]]+)\]/);
        propRef = m ? m[1] : null;
      }
      const payload: any = {
        date: deal_date || new Date().toISOString().slice(0, 10),
        done_type_negotiation: resolveDoneDealType(contact.crm_natureza),
      };
      if (propRef) payload.prop_ref = propRef;
      if (deal_value !== undefined && deal_value !== null && String(deal_value).trim() !== '') {
        payload.value = String(deal_value).replace(/[^\d.]/g, '');
      }
      if (deal_info?.toString().trim()) payload.info = deal_info.toString().trim();

      res = await fetch(`${C2S_BASE}/leads/${contact.c2s_lead_id}/done_deal`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify(payload),
      });
    } else {
      return jsonResponse({
        success: false,
        reason: 'unsupported_transition',
        message: `Transição para "${new_status}" não reconhecida.`,
      }, 400);
    }

    if (!res.ok) {
      const errText = await res.text();
      return jsonResponse({
        success: false,
        reason: 'c2s_api_error',
        status: res.status,
        details: errText.slice(0, 400),
      }, 502);
    }

    // Read back pra confirmar. C2S agora tem os 3 caminhos, reuso endpoint GET.
    const verifyRes = await fetch(
      `${C2S_BASE}/leads/${contact.c2s_lead_id}`,
      { headers: authHeaders },
    );
    const verifyData = await verifyRes.json();
    const confirmedStatus = verifyData?.data?.attributes?.lead_status?.name;
    const confirmedFunnel = verifyData?.data?.attributes?.funnel_status?.status;
    const archiveDetails = verifyData?.data?.attributes?.archive_details;

    if (confirmedStatus !== new_status) {
      return jsonResponse({
        success: false,
        reason: 'c2s_did_not_accept',
        requested: new_status,
        actual: confirmedStatus,
      }, 502);
    }

    // Update local. crm_archive_reason atualiza quando arquiva.
    const update: any = {
      crm_status: confirmedStatus,
      crm_funnel_status: confirmedFunnel || null,
      c2s_lead_synced_at: new Date().toISOString(),
    };
    if (new_status === 'Arquivado') {
      update.crm_archive_reason = archive_details?.archive_notes || archive_message || 'arquivado';
      update.status = 'arquivado';
    }

    await supabase
      .from('contacts')
      .update(update)
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
