// ========== AIMEE.iA v2 - CLASSIFY ADM PROPERTIES ==========
// Sprint 6.2 — One-off backfill: marca imóveis como management_type='adm' quando
// o corretor Vista vinculado é o "usuário ADM" (código 1 por convenção Smolka).
// Demais ficam como 'broker'.
//
// Input (POST):
//   { tenant_id: string, adm_user_code?: string (default "1"), dry_run?: boolean }
//
// Paginates Vista /imoveis/listar filtrado por Corretor = adm_user_code.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getSupabaseClient, corsResponse, jsonResponse, errorResponse } from '../_shared/supabase.ts';
import { Tenant } from '../_shared/types.ts';

const PAGE_SIZE = 200;
const MAX_PAGES = 50; // failsafe

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return corsResponse();

  const supabase = getSupabaseClient();

  try {
    const body = await req.json().catch(() => ({}));
    const tenantId: string = body.tenant_id;
    const admUserCode: string = String(body.adm_user_code || '1');
    const dryRun: boolean = !!body.dry_run;

    if (!tenantId) return errorResponse('Missing tenant_id', 400);

    const { data: tenant } = await supabase
      .from('tenants')
      .select('*')
      .eq('id', tenantId)
      .single();

    if (!tenant) return errorResponse('Tenant not found', 404);
    const t = tenant as Tenant;

    if (t.crm_type !== 'vista' || !t.crm_api_key || !t.crm_api_url) {
      return errorResponse('Vista CRM not configured for tenant', 400);
    }

    // 1. Busca no Vista todos os imóveis onde Corretor = admUserCode
    const admCodes: string[] = [];
    let page = 1;

    while (page <= MAX_PAGES) {
      const url = `${t.crm_api_url}/imoveis/listar`;
      const reqBody = {
        fields: ['Codigo'],
        filter: [`Corretor = '${admUserCode}'`],
        limit: PAGE_SIZE,
        offset: (page - 1) * PAGE_SIZE,
        pesquisa: 'imovel',
      };

      const vistaResp = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'Authorization': `Bearer ${t.crm_api_key}`,
        },
        body: JSON.stringify(reqBody),
      });

      if (!vistaResp.ok) {
        const errText = await vistaResp.text();
        return jsonResponse({
          ok: false,
          error: `Vista listar error (p.${page}): ${vistaResp.status} ${errText.slice(0, 300)}`,
          codes_collected_so_far: admCodes.length,
        }, 502);
      }

      const vistaData = await vistaResp.json();
      const items: any[] = [];
      if (Array.isArray(vistaData)) {
        items.push(...vistaData);
      } else if (vistaData && typeof vistaData === 'object') {
        for (const k of Object.keys(vistaData)) {
          if (!isNaN(Number(k)) && vistaData[k]?.Codigo) items.push(vistaData[k]);
        }
      }

      if (items.length === 0) break;

      for (const it of items) {
        if (it?.Codigo) admCodes.push(String(it.Codigo));
      }

      if (items.length < PAGE_SIZE) break;
      page++;
    }

    const uniqueAdmCodes = Array.from(new Set(admCodes));

    if (dryRun) {
      return jsonResponse({
        ok: true,
        dry_run: true,
        adm_codes_found: uniqueAdmCodes.length,
        sample: uniqueAdmCodes.slice(0, 20),
      });
    }

    // 2. Marcar ADM: UPDATE em batches
    let admUpdated = 0;
    const batchSize = 500;
    for (let i = 0; i < uniqueAdmCodes.length; i += batchSize) {
      const batch = uniqueAdmCodes.slice(i, i + batchSize);
      const { count } = await supabase
        .from('properties')
        .update({ management_type: 'adm' }, { count: 'exact' })
        .eq('tenant_id', tenantId)
        .in('external_id', batch);
      admUpdated += count || 0;
    }

    // 3. Marcar demais como broker (onde ainda é NULL)
    const { count: brokerUpdated } = await supabase
      .from('properties')
      .update({ management_type: 'broker' }, { count: 'exact' })
      .eq('tenant_id', tenantId)
      .is('management_type', null);

    return jsonResponse({
      ok: true,
      adm_codes_found_in_vista: uniqueAdmCodes.length,
      adm_properties_classified: admUpdated,
      broker_properties_classified: brokerUpdated || 0,
      pages_scanned: page,
    });
  } catch (error) {
    console.error('❌ classify-adm-properties error:', error);
    return errorResponse((error as Error).message);
  }
});
