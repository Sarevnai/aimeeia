// ========== AIMEE.iA - C2S IMPORT ALL LEADS ==========
// Paginates GET /integration/leads and upserts every lead into contacts
// (one page per invocation, orchestrated by client). Maps seller → brokers,
// and fills crm_* columns. Idempotent: safe to re-run.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getSupabaseClient, corsResponse, jsonResponse, errorResponse } from '../_shared/supabase.ts';

const DEPARTMENT_BY_NEGOTIATION: Record<string, string> = {
  'Compra': 'vendas',
  'Venda': 'vendas',
  'Aluguel': 'locacao',
  'Locação': 'locacao',
  'Locacao': 'locacao',
  'Temporada': 'locacao',
};

function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let p = String(raw).replace(/\D/g, '');
  if (!p) return null;
  if (!p.startsWith('55') && p.length <= 11) p = '55' + p;
  return p;
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return corsResponse();

  const supabase = getSupabaseClient();

  try {
    const { tenant_id, page = 1, perpage = 50, dry_run = false } = await req.json().catch(() => ({}));
    if (!tenant_id) return errorResponse('Missing tenant_id', 400);

    const { data: c2sSetting } = await supabase
      .from('system_settings')
      .select('setting_value')
      .eq('tenant_id', tenant_id)
      .eq('setting_key', 'c2s_config')
      .maybeSingle();
    const apiKey = (c2sSetting?.setting_value as any)?.api_key;
    if (!apiKey) return errorResponse('C2S not configured for tenant', 400);

    // Load broker map once
    const { data: brokers } = await supabase
      .from('brokers')
      .select('id, c2s_seller_id')
      .eq('tenant_id', tenant_id);
    const brokerByC2sId = new Map<string, string>(
      (brokers || []).map((b) => [b.c2s_seller_id, b.id]),
    );

    // Fetch one page from C2S
    const res = await fetch(
      `https://api.contact2sale.com/integration/leads?page=${page}&perpage=${perpage}`,
      { headers: { 'Authentication': `Bearer ${apiKey}`, 'Content-Type': 'application/json' } },
    );
    if (!res.ok) return errorResponse(`C2S API ${res.status}`, 502);
    const data = await res.json();
    const items: any[] = data?.data || [];
    const meta = data?.meta || {};
    const total = meta.total || null;
    const totalPages = total ? Math.ceil(total / perpage) : null;

    const stats = {
      page,
      perpage,
      total,
      total_pages: totalPages,
      items: items.length,
      inserted: 0,
      updated: 0,
      skipped_no_phone: 0,
      linked_broker: 0,
      errors: 0,
      error_samples: [] as any[],
    };

    for (const lead of items) {
      try {
        const attrs = lead.attributes || {};
        const customer = attrs.customer || {};
        const seller = attrs.seller || {};
        const product = attrs.product || {};
        const leadStatus = attrs.lead_status || {};
        const leadSource = attrs.lead_source || {};
        const archiveDetails = attrs.archive_details || {};
        const realEstate = product.real_estate_detail || {};

        const phone = normalizePhone(customer.phone) || normalizePhone(customer.phone_global);
        if (!phone) { stats.skipped_no_phone++; continue; }

        const sellerId = seller.id || null;
        const assignedBrokerId = sellerId ? (brokerByC2sId.get(sellerId) || null) : null;
        if (assignedBrokerId) stats.linked_broker++;

        const negotiation = realEstate.negotiation_name || null;
        const department = negotiation ? (DEPARTMENT_BY_NEGOTIATION[negotiation] || null) : null;

        // product.description frequently already starts with [prop_ref], so avoid duplicating
        const desc = (product.description || '').trim();
        const propRef = product.prop_ref
          ? (desc.startsWith('[') ? desc : `[${product.prop_ref}] ${desc}`.trim())
          : (desc || null);

        const contactPayload = {
          tenant_id,
          phone,
          name: customer.name || null,
          email: customer.email || null,
          department_code: department,
          channel_source: 'c2s_import',
          contact_type: 'lead',
          status: archiveDetails.archived ? 'arquivado' : 'ativo',

          c2s_lead_id: lead.id,
          c2s_lead_internal_id: lead.internal_id || null,
          c2s_lead_synced_at: new Date().toISOString(),
          assigned_broker_id: assignedBrokerId,

          crm_status: leadStatus.name || null,
          crm_source: leadSource.name || null,
          crm_property_ref: propRef,
          crm_neighborhood: product.neighbourhood || null,
          crm_price_hint: product.price || null,
          crm_natureza: negotiation,
          crm_archive_reason: archiveDetails.archived ? (archiveDetails.archive_notes || 'arquivado') : null,
        };

        if (dry_run) continue;

        // Prefer update when phone exists; insert otherwise. Do NOT overwrite user-edited name/email when already set.
        const { data: existing } = await supabase
          .from('contacts')
          .select('id, name, email, channel_source')
          .eq('tenant_id', tenant_id)
          .eq('phone', phone)
          .maybeSingle();

        if (existing) {
          const update: any = { ...contactPayload };
          // preserve locally edited name/email if already present
          if (existing.name) delete update.name;
          if (existing.email) delete update.email;
          // keep original channel_source for non-imports
          if (existing.channel_source && existing.channel_source !== 'c2s_import') {
            delete update.channel_source;
          }
          const { error } = await supabase.from('contacts').update(update).eq('id', existing.id);
          if (error) throw new Error(error.message);
          stats.updated++;
        } else {
          const { error } = await supabase.from('contacts').insert(contactPayload);
          if (error) throw new Error(error.message);
          stats.inserted++;
        }
      } catch (err) {
        stats.errors++;
        if (stats.error_samples.length < 5) {
          stats.error_samples.push({ lead_id: lead.id, error: (err as Error).message });
        }
      }
    }

    return jsonResponse({ success: true, ...stats });

  } catch (error) {
    console.error('❌ c2s-import-all-leads error:', error);
    return errorResponse((error as Error).message);
  }
});
