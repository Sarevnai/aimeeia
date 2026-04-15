// ========== AIMEE.iA - C2S BACKFILL LEAD BROKERS ==========
// For each contact flagged as remarketing_c2s (or a filtered subset),
// queries C2S by phone, captures the seller, and writes:
//   contacts.c2s_lead_id, c2s_lead_internal_id, assigned_broker_id
// Runs in batches of 50 with throttling to respect C2S rate limit.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getSupabaseClient, corsResponse, jsonResponse, errorResponse } from '../_shared/supabase.ts';

interface C2SLeadAttrs {
  seller?: { id?: string; external_id?: string | null; name?: string };
  customer?: { phone?: string; name?: string };
  lead_status?: { alias?: string; name?: string };
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return corsResponse();

  const supabase = getSupabaseClient();

  try {
    const body = await req.json().catch(() => ({}));
    const {
      tenant_id,
      channel_source = 'remarketing_c2s',
      limit = 100,
      offset = 0,
      dry_run = false,
      only_missing = true, // skip contacts already linked
    } = body;

    if (!tenant_id) return errorResponse('Missing tenant_id', 400);

    const { data: c2sSetting } = await supabase
      .from('system_settings')
      .select('setting_value')
      .eq('tenant_id', tenant_id)
      .eq('setting_key', 'c2s_config')
      .maybeSingle();
    const apiKey = (c2sSetting?.setting_value as any)?.api_key;
    if (!apiKey) return errorResponse('C2S not configured for tenant', 400);

    let query = supabase
      .from('contacts')
      .select('id, name, phone, c2s_lead_id, assigned_broker_id')
      .eq('tenant_id', tenant_id)
      .eq('channel_source', channel_source)
      .range(offset, offset + limit - 1);

    if (only_missing) query = query.is('assigned_broker_id', null);

    const { data: contacts, error: qErr } = await query;
    if (qErr) throw new Error(`Query contacts failed: ${qErr.message}`);
    if (!contacts || contacts.length === 0) {
      return jsonResponse({ processed: 0, message: 'Nenhum contato pendente nesse range' });
    }

    // Preload brokers map for this tenant (c2s_seller_id → brokers.id)
    const { data: brokers } = await supabase
      .from('brokers')
      .select('id, c2s_seller_id')
      .eq('tenant_id', tenant_id);
    const brokerByC2sId = new Map<string, string>(
      (brokers || []).map((b) => [b.c2s_seller_id, b.id]),
    );

    const stats = {
      processed: 0,
      matched_broker: 0,
      no_lead_found: 0,
      no_seller: 0,
      unknown_broker: 0,
      errors: 0,
      samples: [] as any[],
    };

    for (const c of contacts) {
      stats.processed++;
      try {
        const lead = await fetchC2SLeadByPhone(apiKey, c.phone);
        if (!lead) {
          stats.no_lead_found++;
          if (stats.samples.length < 5) stats.samples.push({ phone: c.phone, name: c.name, result: 'no_lead' });
          await sleep(250);
          continue;
        }

        const attrs = (lead.attributes || {}) as C2SLeadAttrs;
        const sellerId = attrs.seller?.id || null;

        if (!sellerId) {
          stats.no_seller++;
          await sleep(250);
          continue;
        }

        const brokerId = brokerByC2sId.get(sellerId);
        if (!brokerId) {
          stats.unknown_broker++;
          if (stats.samples.length < 5) {
            stats.samples.push({
              phone: c.phone,
              c2s_seller_id: sellerId,
              seller_name: attrs.seller?.name,
              result: 'broker_not_in_db_run_sync_brokers_first',
            });
          }
          await sleep(250);
          continue;
        }

        if (!dry_run) {
          const { error: updErr } = await supabase
            .from('contacts')
            .update({
              c2s_lead_id: lead.id,
              c2s_lead_internal_id: lead.internal_id || null,
              c2s_lead_synced_at: new Date().toISOString(),
              assigned_broker_id: brokerId,
              crm_status: attrs.lead_status?.name || null,
            })
            .eq('id', c.id);
          if (updErr) {
            stats.errors++;
            console.error('Update failed for', c.id, updErr.message);
          } else {
            stats.matched_broker++;
          }
        } else {
          stats.matched_broker++;
          if (stats.samples.length < 5) {
            stats.samples.push({
              phone: c.phone,
              name: c.name,
              c2s_lead_id: lead.id,
              seller: attrs.seller?.name,
              would_assign_broker_id: brokerId,
            });
          }
        }

        await sleep(50); // quick spacing — the API call itself takes ~1s
      } catch (err) {
        stats.errors++;
        console.error('Lead fetch error for', c.phone, (err as Error).message);
        await sleep(200);
      }
    }

    return jsonResponse({
      success: true,
      tenant_id,
      channel_source,
      offset,
      limit,
      dry_run,
      ...stats,
    });

  } catch (error) {
    console.error('❌ c2s-backfill-lead-brokers error:', error);
    return errorResponse((error as Error).message);
  }
});

async function fetchC2SLeadByPhone(apiKey: string, phone: string): Promise<any | null> {
  // The list response already includes attributes.seller — no need for a second detail call.
  const url = `https://api.contact2sale.com/integration/leads?phone=${encodeURIComponent(phone)}&perpage=1`;
  const res = await fetch(url, {
    headers: { 'Authentication': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
  });
  if (!res.ok) return null;
  const data = await res.json();
  const items = data?.data || [];
  return items.length ? items[0] : null;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
