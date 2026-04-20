// ========== AIMEE.iA - C2S DELTA SYNC ==========
// Polls C2S for leads updated since last cursor, upserts into contacts.
// Designed to be invoked every 1 min by pg_cron via pg_net.
// Idempotent. Walks pages until it finds leads older than cursor, then stops.

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

const SOURCE = 'c2s';
const PERPAGE = 50;
const MAX_PAGES = 20; // hard cap per run = 1000 leads max — protects against runaway
const OVERLAP_SECONDS = 60; // re-fetch last minute to handle clock skew

import { normalizePhone as canonicalBR, phoneVariants } from '../_shared/phone.ts';

function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let p = String(raw).replace(/\D/g, '');
  if (!p) return null;
  if (!p.startsWith('55') && p.length <= 11) p = '55' + p;
  return canonicalBR(p) || p;
}

async function syncTenant(supabase: any, tenant_id: string) {
  const { data: c2sSetting } = await supabase
    .from('system_settings')
    .select('setting_value')
    .eq('tenant_id', tenant_id)
    .eq('setting_key', 'c2s_config')
    .maybeSingle();
  const apiKey = (c2sSetting?.setting_value as any)?.api_key;
  if (!apiKey) return { tenant_id, skipped: 'no_c2s_config' };

  // Read cursor
  const { data: cursorRow } = await supabase
    .from('sync_cursors')
    .select('cursor_at')
    .eq('tenant_id', tenant_id)
    .eq('source', SOURCE)
    .maybeSingle();

  const cursorAt = cursorRow?.cursor_at || '1970-01-01T00:00:00Z';
  // Apply overlap to absorb clock skew; C2S rejects ISO with milliseconds, strip to YYYY-MM-DDTHH:MM:SSZ
  const fetchSince = new Date(new Date(cursorAt).getTime() - OVERLAP_SECONDS * 1000)
    .toISOString()
    .replace(/\.\d{3}Z$/, 'Z');

  // Load broker map
  const { data: brokers } = await supabase
    .from('brokers')
    .select('id, c2s_seller_id')
    .eq('tenant_id', tenant_id);
  const brokerByC2sId = new Map<string, string>(
    (brokers || []).map((b: any) => [b.c2s_seller_id, b.id]),
  );

  const stats = {
    tenant_id,
    cursor_from: cursorAt,
    fetch_since: fetchSince,
    pages: 0,
    items: 0,
    inserted: 0,
    updated: 0,
    skipped_no_phone: 0,
    linked_broker: 0,
    errors: 0,
    error_samples: [] as any[],
    next_cursor: cursorAt,
  };

  let maxUpdatedAt = cursorAt;

  for (let page = 1; page <= MAX_PAGES; page++) {
    const url = `https://api.contact2sale.com/integration/leads?page=${page}&perpage=${PERPAGE}&sort=-updated_at&updated_gte=${encodeURIComponent(fetchSince)}`;
    const res = await fetch(url, {
      headers: { 'Authentication': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    });
    if (!res.ok) {
      stats.errors++;
      stats.error_samples.push({ page, http: res.status });
      break;
    }
    const data = await res.json();
    const items: any[] = data?.data || [];
    if (items.length === 0) break;

    stats.pages++;
    stats.items += items.length;

    for (const lead of items) {
      try {
        const attrs = lead.attributes || {};
        const updatedAt = attrs.updated_at || lead.updated_at || null;
        if (updatedAt && updatedAt > maxUpdatedAt) maxUpdatedAt = updatedAt;

        const customer = attrs.customer || {};
        const seller = attrs.seller || {};
        const product = attrs.product || {};
        const leadStatus = attrs.lead_status || {};
        const funnelStatus = attrs.funnel_status || {};
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

        const desc = (product.description || '').trim();
        const propRef = product.prop_ref
          ? (desc.startsWith('[') ? desc : `[${product.prop_ref}] ${desc}`.trim())
          : (desc || null);

        const contactPayload: any = {
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
          crm_funnel_status: funnelStatus.status || null,
          crm_source: leadSource.name || null,
          crm_property_ref: propRef,
          crm_neighborhood: product.neighbourhood || null,
          crm_price_hint: product.price || null,
          crm_natureza: negotiation,
          crm_archive_reason: archiveDetails.archived ? (archiveDetails.archive_notes || 'arquivado') : null,
        };

        // Try by c2s_lead_id first (authoritative), fallback to phone (todas variantes BR)
        const variants = phoneVariants(phone);
        const phoneOr = variants.map((v) => `phone.eq.${v}`).join(',');
        const { data: existing } = await supabase
          .from('contacts')
          .select('id, name, email, channel_source')
          .eq('tenant_id', tenant_id)
          .or(`c2s_lead_id.eq.${lead.id},${phoneOr}`)
          .order('created_at', { ascending: true })
          .limit(1)
          .maybeSingle();

        if (existing) {
          const update: any = { ...contactPayload };
          if (existing.name) delete update.name;
          if (existing.email) delete update.email;
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

    // If page was not full, we got everything
    if (items.length < PERPAGE) break;
  }

  stats.next_cursor = maxUpdatedAt;

  // Persist cursor
  await supabase
    .from('sync_cursors')
    .upsert({
      tenant_id,
      source: SOURCE,
      cursor_at: maxUpdatedAt,
      last_run_at: new Date().toISOString(),
      last_status: stats.errors > 0 ? 'partial' : 'ok',
      last_stats: stats,
    }, { onConflict: 'tenant_id,source' });

  return stats;
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return corsResponse();

  const supabase = getSupabaseClient();

  try {
    const body = await req.json().catch(() => ({}));
    const { tenant_id } = body;

    let tenantIds: string[] = [];
    if (tenant_id) {
      tenantIds = [tenant_id];
    } else {
      // Auto-discover all tenants with c2s_config
      const { data } = await supabase
        .from('system_settings')
        .select('tenant_id')
        .eq('setting_key', 'c2s_config');
      tenantIds = (data || []).map((r: any) => r.tenant_id).filter(Boolean);
    }

    const results = [];
    for (const tid of tenantIds) {
      try {
        results.push(await syncTenant(supabase, tid));
      } catch (err) {
        results.push({ tenant_id: tid, error: (err as Error).message });
      }
    }

    return jsonResponse({ success: true, tenants_processed: results.length, results });
  } catch (error) {
    console.error('❌ c2s-delta-sync error:', error);
    return errorResponse((error as Error).message);
  }
});
