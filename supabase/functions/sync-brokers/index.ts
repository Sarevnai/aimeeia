// ========== AIMEE.iA - SYNC BROKERS (C2S + Vista) ==========
// Pulls sellers from C2S and corretores from Vista, merges them into `brokers`.
// C2S is the primary source (richer: email/phone). Vista validates `codigo`.
// Match: c2s.external_id == vista.Codigo (when the imobiliária keeps them aligned).

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getSupabaseClient, corsResponse, jsonResponse, errorResponse } from '../_shared/supabase.ts';

interface C2SSeller {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  company: string | null;
  external_id: string | null;
  is_master: boolean;
}

interface VistaCorretor {
  Codigo: string;
  Nome: string;
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return corsResponse();

  const supabase = getSupabaseClient();

  try {
    const { tenant_id, dry_run } = await req.json().catch(() => ({}));
    if (!tenant_id) return errorResponse('Missing tenant_id', 400);

    const { data: tenant } = await supabase
      .from('tenants')
      .select('id, crm_type, crm_api_url, crm_api_key')
      .eq('id', tenant_id)
      .single();
    if (!tenant) return errorResponse('Tenant not found', 404);

    const { data: c2sSetting } = await supabase
      .from('system_settings')
      .select('setting_value')
      .eq('tenant_id', tenant_id)
      .eq('setting_key', 'c2s_config')
      .maybeSingle();

    const c2sConfig = (c2sSetting?.setting_value as any) || null;

    // 1) Fetch C2S sellers (primary source)
    const c2sSellers: C2SSeller[] = c2sConfig?.api_key
      ? await fetchAllC2SSellers(c2sConfig.api_key)
      : [];

    // 2) Fetch Vista corretores (for codigo validation)
    const vistaCorretores: VistaCorretor[] = (tenant.crm_type === 'vista' && tenant.crm_api_key && tenant.crm_api_url)
      ? await fetchAllVistaCorretores(tenant.crm_api_url, tenant.crm_api_key)
      : [];

    console.log(`📊 Fetched: ${c2sSellers.length} C2S sellers, ${vistaCorretores.length} Vista corretores`);

    // 3) Build merge: keyed by c2s_seller_id; enrich with vista data when external_id matches Codigo
    const vistaByCodigo = new Map(vistaCorretores.map((v) => [String(v.Codigo), v]));
    const now = new Date().toISOString();

    // BUG FIX 2026-04-25: NÃO sobrescrever 'active' no upsert.
    // Antes: hardcoded `active: true` zerava o flag manual pra qualquer broker que
    // o admin tinha desativado. Agora preserva o valor existente; novas rows herdam
    // o default true da coluna. Deactivation explícita acontece logo abaixo.
    const rows = c2sSellers.map((s) => {
      const vista = s.external_id ? vistaByCodigo.get(String(s.external_id)) : null;
      return {
        tenant_id,
        full_name: s.name || 'Sem nome',
        email: s.email,
        phone: s.phone,
        team: s.company,
        c2s_seller_id: s.id,
        c2s_external_id: s.external_id,
        c2s_is_master: !!s.is_master,
        c2s_payload: s,
        vista_codigo: vista?.Codigo || null,
        vista_nome: vista?.Nome || null,
        last_synced_c2s: now,
        last_synced_vista: vista ? now : null,
      };
    });

    // Orphan Vista corretores (no C2S match) — insert read-only rows so they show up in audit
    const c2sExternalIds = new Set(c2sSellers.map((s) => s.external_id).filter(Boolean));
    const orphanVista = vistaCorretores.filter((v) => !c2sExternalIds.has(String(v.Codigo)));

    if (dry_run) {
      return jsonResponse({
        dry_run: true,
        c2s_count: c2sSellers.length,
        vista_count: vistaCorretores.length,
        matched: rows.filter((r) => r.vista_codigo).length,
        c2s_only: rows.filter((r) => !r.vista_codigo).length,
        vista_only: orphanVista.length,
        sample: rows.slice(0, 3),
        orphan_vista_sample: orphanVista.slice(0, 3),
      });
    }

    // 4) Upsert C2S-origin rows
    let upserted = 0;
    if (rows.length > 0) {
      const { error, count } = await supabase
        .from('brokers')
        .upsert(rows, { onConflict: 'tenant_id,c2s_seller_id', count: 'exact' });
      if (error) throw new Error(`Upsert brokers failed: ${error.message}`);
      upserted = count || rows.length;
    }

    // 5) Insert Vista-only brokers (no C2S link yet) — generate synthetic c2s_seller_id placeholder
    // Mesma regra: não tocar em 'active' no upsert (preserva valor manual).
    let vistaOnly = 0;
    for (const v of orphanVista) {
      const placeholder = `vista-only:${v.Codigo}`;
      const { error } = await supabase.from('brokers').upsert({
        tenant_id,
        full_name: v.Nome || `Corretor ${v.Codigo}`,
        c2s_seller_id: placeholder,
        c2s_external_id: null,
        c2s_is_master: false,
        c2s_payload: null,
        vista_codigo: v.Codigo,
        vista_nome: v.Nome,
        last_synced_vista: now,
      }, { onConflict: 'tenant_id,c2s_seller_id' });
      if (!error) vistaOnly++;
    }

    // 6) Deactivation: brokers que existiam no DB mas sumiram da resposta C2S devem
    // ficar inativos automaticamente. Não toca em vista-only (placeholder começa com 'vista-only:').
    const c2sSellerIds = c2sSellers.map((s) => s.id);
    let deactivated = 0;
    if (c2sSellerIds.length > 0) {
      const { count: deactCount, error: deactErr } = await supabase
        .from('brokers')
        .update({ active: false, updated_at: now }, { count: 'exact' })
        .eq('tenant_id', tenant_id)
        .not('c2s_seller_id', 'like', 'vista-only:%')
        .not('c2s_seller_id', 'in', `(${c2sSellerIds.map((id) => `"${id}"`).join(',')})`)
        .eq('active', true);
      if (deactErr) console.warn('⚠️ deactivation update failed:', deactErr.message);
      else deactivated = deactCount || 0;
    }

    return jsonResponse({
      success: true,
      c2s_count: c2sSellers.length,
      vista_count: vistaCorretores.length,
      upserted_c2s: upserted,
      upserted_vista_only: vistaOnly,
      deactivated_missing_from_c2s: deactivated,
      matched: rows.filter((r) => r.vista_codigo).length,
    });

  } catch (error) {
    console.error('❌ sync-brokers error:', error);
    return errorResponse((error as Error).message);
  }
});

// ========== C2S ==========

async function fetchAllC2SSellers(apiKey: string): Promise<C2SSeller[]> {
  // C2S /integration/sellers does NOT paginate (verified 2026-04-14):
  // pagination params are ignored, response is always capped at ~50 items.
  const res = await fetch(
    `https://api.contact2sale.com/integration/sellers?perpage=50`,
    { headers: { 'Authentication': `Bearer ${apiKey}`, 'Content-Type': 'application/json' } },
  );
  if (!res.ok) {
    console.error(`C2S sellers fetch failed: ${res.status}`);
    return [];
  }
  const data = await res.json();
  const items: C2SSeller[] = Array.isArray(data) ? data : (data.data || []);
  const seen = new Set<string>();
  return items.filter((s) => (s.id && !seen.has(s.id) && seen.add(s.id)));
}

// ========== Vista ==========

async function fetchAllVistaCorretores(apiUrl: string, apiKey: string): Promise<VistaCorretor[]> {
  const base = apiUrl.startsWith('http') ? apiUrl : `https://${apiUrl}`;
  const out: VistaCorretor[] = [];
  const seen = new Set<string>();
  let page = 1;
  while (true) {
    const pesquisa = JSON.stringify({
      fields: ['Codigo', 'Nome'],
      paginacao: { pagina: page, quantidade: 50 },
    });
    const url = `${base}/corretores/listar?key=${encodeURIComponent(apiKey)}&pesquisa=${encodeURIComponent(pesquisa)}&showtotal=1`;
    const res = await fetch(url, { headers: { 'Accept': 'application/json' } });
    if (!res.ok) {
      console.error(`Vista corretores page ${page} failed: ${res.status}`);
      break;
    }
    const data = await res.json();
    const items: VistaCorretor[] = data.items || [];
    const meta = data.meta || {};
    if (!items.length) break;
    for (const it of items) {
      const k = String(it.Codigo);
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(it);
    }
    const totalPages = meta.totalPages || 1;
    if (page >= totalPages) break;
    page++;
    if (page > 20) break;
    await sleep(200);
  }
  return out;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
