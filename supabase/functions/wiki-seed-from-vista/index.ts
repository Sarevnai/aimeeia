// ========== AIMEE.iA — WIKI SEED FROM VISTA ==========
// Popula wiki_pages a partir de dados reais de brokers + properties.
// Roda sob demanda (admin) ou em cron baixa frequência (1x/dia).
//
// Modos:
//   { tenant_id, mode: 'corretores' } → 1 página por broker ativo
//   { tenant_id, mode: 'bairros',  min_listings?: 5 } → 1 página por bairro
//   { tenant_id, mode: 'all', min_listings?: 5 } → executa os dois
//
// Empreendimentos: Vista da Smolka não populá os campos Edificio/Empreendimento
// no raw_data, então essa fase fica de fora. Quando o dado vier, adicionar modo
// 'empreendimentos'.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getSupabaseClient, corsResponse, jsonResponse, errorResponse } from '../_shared/supabase.ts';

const SLUG_RX = /[^a-z0-9]+/g;
function slugify(s: string): string {
  return (s || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(SLUG_RX, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

function fmtCurrency(n: number | null | undefined): string {
  if (!n || isNaN(Number(n))) return '?';
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(Number(n));
}

async function upsertPage(supabase: any, payload: any): Promise<void> {
  const { data: existing } = await supabase
    .from('wiki_pages')
    .select('id')
    .eq('tenant_id', payload.tenant_id)
    .eq('page_type', payload.page_type)
    .eq('slug', payload.slug)
    .maybeSingle();

  if (existing?.id) {
    const { error } = await supabase.from('wiki_pages').update(payload).eq('id', existing.id);
    if (error) throw new Error(`update wiki page failed (${payload.slug}): ${error.message}`);
  } else {
    const { error } = await supabase.from('wiki_pages').insert(payload);
    if (error) throw new Error(`insert wiki page failed (${payload.slug}): ${error.message}`);
  }
}

// ---------- CORRETORES ----------

async function seedCorretores(supabase: any, tenantId: string): Promise<{ written: number; skipped: number }> {
  const { data: brokers, error } = await supabase
    .from('brokers')
    .select('id, full_name, vista_nome, vista_codigo, c2s_seller_id, c2s_is_master, team, email, phone, active, on_duty, last_synced_vista, last_synced_c2s')
    .eq('tenant_id', tenantId)
    .eq('active', true);

  if (error) throw new Error(`brokers select failed: ${error.message}`);

  let written = 0, skipped = 0;
  for (const b of brokers || []) {
    const name = (b.vista_nome || b.full_name || '').trim();
    if (!name) { skipped++; continue; }

    // Conta imóveis associados via assigned_broker_id ou raw_data
    let propsCount = 0;
    let topNeighborhoods: string[] = [];
    if (b.vista_codigo) {
      // Vista guarda corretor em raw_data.Corretor (CodigoCorretor) — não há FK direta em properties.
      // Usa contacts.assigned_broker_id como proxy de carteira ativa.
      const { count } = await supabase
        .from('contacts')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', tenantId)
        .eq('assigned_broker_id', b.id);
      propsCount = count || 0;
    }

    // Bairros mais frequentes nos contatos atribuídos a esse broker
    const { data: contactRows } = await supabase
      .from('contacts')
      .select('crm_neighborhood')
      .eq('tenant_id', tenantId)
      .eq('assigned_broker_id', b.id)
      .not('crm_neighborhood', 'is', null)
      .limit(200);
    const counts = new Map<string, number>();
    for (const r of contactRows || []) {
      const n = (r.crm_neighborhood || '').trim();
      if (!n) continue;
      counts.set(n, (counts.get(n) || 0) + 1);
    }
    topNeighborhoods = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(e => `${e[0]} (${e[1]})`);

    const lines: string[] = [];
    lines.push(`Corretor da Smolka Imóveis. ${b.c2s_is_master ? 'Master broker no C2S.' : ''}`.trim());
    lines.push('');
    lines.push('## Identificação');
    if (b.vista_codigo) lines.push(`- Código Vista: \`${b.vista_codigo}\``);
    if (b.c2s_seller_id) lines.push(`- C2S seller_id: \`${b.c2s_seller_id}\``);
    if (b.team) lines.push(`- Equipe: ${b.team}`);
    if (b.email) lines.push(`- Email: ${b.email}`);
    if (b.phone) lines.push(`- Telefone: ${b.phone}`);
    if (b.on_duty) lines.push('- Status: em plantão');
    lines.push('');
    if (propsCount > 0) {
      lines.push('## Carteira ativa');
      lines.push(`- Contatos atribuídos: ${propsCount}`);
      if (topNeighborhoods.length) lines.push(`- Bairros recorrentes: ${topNeighborhoods.join(', ')}`);
      lines.push('');
    }
    lines.push('## Sincronização');
    if (b.last_synced_vista) lines.push(`- Última sync Vista: ${b.last_synced_vista}`);
    if (b.last_synced_c2s) lines.push(`- Última sync C2S: ${b.last_synced_c2s}`);

    const slug = b.vista_codigo ? `vista-${b.vista_codigo}` : slugify(name);
    if (!slug) { skipped++; continue; }

    await upsertPage(supabase, {
      tenant_id: tenantId,
      page_type: 'corretor',
      slug,
      title: name,
      content: lines.join('\n').trim(),
      sources: ['brokers (Vista + C2S)'],
      related: [],
      confidence: (propsCount > 0 ? 'high' : 'medium') as 'high' | 'medium',
      metadata: {
        broker_id: b.id,
        vista_codigo: b.vista_codigo,
        c2s_seller_id: b.c2s_seller_id,
        contacts_count: propsCount,
      },
    });
    written++;
  }
  return { written, skipped };
}

// ---------- BAIRROS ----------

async function seedBairros(supabase: any, tenantId: string, minListings: number): Promise<{ written: number; skipped: number }> {
  const { data: agg, error } = await supabase.rpc('wiki_neighborhood_stats', {
    p_tenant_id: tenantId,
    p_min_listings: minListings,
  });
  if (error) throw new Error(`wiki_neighborhood_stats failed: ${error.message}`);

  let written = 0, skipped = 0;
  for (const row of agg || []) {
    const name = (row.neighborhood || '').trim();
    if (!name) { skipped++; continue; }
    const slug = slugify(name);
    if (!slug) { skipped++; continue; }

    const lines: string[] = [];
    lines.push(`Bairro da carteira Smolka. ${row.total_listings} imóveis no catálogo (${row.cities_csv || 'Florianópolis'}).`);
    lines.push('');
    lines.push('## Preço médio (carteira atual)');
    if (row.venda_2q_avg) lines.push(`- Venda 2 quartos: ${fmtCurrency(row.venda_2q_avg)} (${row.venda_2q_n} imóveis)`);
    if (row.venda_3q_avg) lines.push(`- Venda 3 quartos: ${fmtCurrency(row.venda_3q_avg)} (${row.venda_3q_n} imóveis)`);
    if (row.locacao_2q_avg) lines.push(`- Locação 2 quartos: ${fmtCurrency(row.locacao_2q_avg)}/mês (${row.locacao_2q_n} imóveis)`);
    if (row.locacao_3q_avg) lines.push(`- Locação 3 quartos: ${fmtCurrency(row.locacao_3q_avg)}/mês (${row.locacao_3q_n} imóveis)`);
    if (!row.venda_2q_avg && !row.venda_3q_avg && !row.locacao_2q_avg && !row.locacao_3q_avg) {
      lines.push('_(sem distribuição suficiente por número de quartos pra média)_');
    }
    lines.push('');
    lines.push('## Distribuição');
    lines.push(`- Total: ${row.total_listings} imóvel(is)`);
    if (row.venda_total) lines.push(`- Venda: ${row.venda_total}`);
    if (row.locacao_total) lines.push(`- Locação: ${row.locacao_total}`);
    lines.push('');
    lines.push('---');
    lines.push(`_Estatísticas geradas a partir de \`properties\` em ${new Date().toISOString().slice(0, 10)}._`);

    await upsertPage(supabase, {
      tenant_id: tenantId,
      page_type: 'bairro',
      slug,
      title: name,
      content: lines.join('\n').trim(),
      sources: ['properties (Vista cache)'],
      related: [],
      confidence: row.total_listings >= 20 ? 'high' : 'medium',
      metadata: {
        total_listings: row.total_listings,
        venda_total: row.venda_total,
        locacao_total: row.locacao_total,
      },
    });
    written++;
  }
  return { written, skipped };
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return corsResponse();

  try {
    const body = await req.json().catch(() => ({}));
    const tenantId: string = body.tenant_id;
    const mode: string = body.mode || 'all';
    const minListings: number = Math.max(Number(body.min_listings) || 5, 1);
    if (!tenantId) return errorResponse('Missing tenant_id', 400);

    const supabase = getSupabaseClient();
    const out: any = { tenant_id: tenantId, mode };

    if (mode === 'corretores' || mode === 'all') {
      out.corretores = await seedCorretores(supabase, tenantId);
    }
    if (mode === 'bairros' || mode === 'all') {
      out.bairros = await seedBairros(supabase, tenantId, minListings);
    }

    return jsonResponse(out);
  } catch (err) {
    console.error('❌ wiki-seed-from-vista failed:', (err as Error).message);
    return errorResponse((err as Error).message, 500);
  }
});
