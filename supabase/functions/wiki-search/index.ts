// ========== AIMEE.iA — WIKI SEARCH ==========
// Consulta full-text na tabela wiki_pages.
// Modos:
//   { tenant_id, query, type?, limit? } → busca BM25 (ts_rank) + headline
//   { tenant_id, mode: 'read', type, slug } → lê página inteira por slug
//
// Convenções:
//   - Inclui tanto páginas do tenant quanto páginas globais (tenant_id IS NULL).
//   - Usa websearch_to_tsquery; se não der match, faz fallback OR com plainto.
//   - Retorna top-N com snippet curto pra não estourar contexto da Aimee.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getSupabaseClient, corsResponse, jsonResponse, errorResponse } from '../_shared/supabase.ts';

const DEFAULT_LIMIT = 3;
const MAX_LIMIT = 10;
const SNIPPET_OPTS = 'StartSel=«,StopSel=»,MaxFragments=2,MaxWords=22,MinWords=8,ShortWord=2';

interface SearchHit {
  slug: string;
  type: string;
  title: string;
  snippet: string;
  rank: number;
  confidence: string;
  sources: string[];
  related: string[];
  scope: 'tenant' | 'global';
  updated_at: string;
}

async function searchWiki(
  supabase: any,
  params: { tenant_id: string | null; query: string; type?: string; limit: number }
): Promise<SearchHit[]> {
  const { tenant_id, query, type, limit } = params;

  // RPC encapsula 2 queries: websearch primeiro, plainto OR como fallback.
  const { data, error } = await supabase.rpc('wiki_search_pages', {
    p_tenant_id: tenant_id,
    p_query: query,
    p_type: type || null,
    p_limit: limit,
    p_snippet_opts: SNIPPET_OPTS,
  });

  if (error) {
    console.error('❌ wiki_search_pages RPC failed:', error.message);
    throw new Error(`wiki_search RPC failed: ${error.message}`);
  }

  return (data || []).map((row: any) => ({
    slug: row.slug,
    type: row.page_type,
    title: row.title,
    snippet: row.snippet || row.title,
    rank: Number(row.rank) || 0,
    confidence: row.confidence,
    sources: row.sources || [],
    related: row.related || [],
    scope: row.tenant_id ? 'tenant' : 'global',
    updated_at: row.updated_at,
  }));
}

async function readPage(
  supabase: any,
  params: { tenant_id: string | null; type: string; slug: string }
) {
  const { tenant_id, type, slug } = params;
  let q = supabase
    .from('wiki_pages')
    .select('id, tenant_id, page_type, slug, title, content, sources, related, confidence, metadata, updated_at')
    .eq('page_type', type)
    .eq('slug', slug);

  // Aceita match no tenant ou global (tenant_id IS NULL)
  if (tenant_id) {
    q = q.or(`tenant_id.eq.${tenant_id},tenant_id.is.null`);
  } else {
    q = q.is('tenant_id', null);
  }

  const { data, error } = await q.limit(1).maybeSingle();
  if (error) throw new Error(`wiki read failed: ${error.message}`);
  if (!data) return null;

  return {
    slug: data.slug,
    type: data.page_type,
    title: data.title,
    content: data.content,
    sources: data.sources || [],
    related: data.related || [],
    confidence: data.confidence,
    metadata: data.metadata || {},
    scope: data.tenant_id ? 'tenant' : 'global',
    updated_at: data.updated_at,
  };
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return corsResponse();

  try {
    const body = await req.json().catch(() => ({}));
    const supabase = getSupabaseClient();

    if (body.mode === 'read') {
      const { tenant_id, type, slug } = body;
      if (!type || !slug) return errorResponse('Missing type or slug', 400);
      const page = await readPage(supabase, { tenant_id: tenant_id || null, type, slug });
      if (!page) return jsonResponse({ found: false, page: null }, 200);
      return jsonResponse({ found: true, page });
    }

    const tenantId: string | null = body.tenant_id || null;
    const query: string = (body.query || '').toString().trim();
    const type: string | undefined = body.type || undefined;
    const limit: number = Math.min(Math.max(Number(body.limit) || DEFAULT_LIMIT, 1), MAX_LIMIT);

    if (!query) return errorResponse('Missing query', 400);

    const results = await searchWiki(supabase, { tenant_id: tenantId, query, type, limit });
    return jsonResponse({ query, type: type || null, count: results.length, results });
  } catch (err) {
    console.error('❌ wiki-search failed:', (err as Error).message);
    return errorResponse((err as Error).message, 500);
  }
});
