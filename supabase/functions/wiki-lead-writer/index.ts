// ========== AIMEE.iA — WIKI LEAD WRITER ==========
// Sincroniza contacts.lead_memory (JSONB gerado pelo lead-memory-updater) pra
// uma página markdown em wiki_pages (page_type='lead', slug=contact_id).
//
// Por que separar:
//   - lead_memory JSONB: leitura síncrona no caminho crítico (já injetado no prompt)
//   - wiki_pages tipo lead: leitura sob demanda via tool wiki_read_lead, formato
//     markdown legível pra humano (operador da imobiliária + Aimee em contexto extra)
//
// Não chama LLM. Reusa o JSONB já gerado + qualification + CRM fields → markdown.
//
// Modos:
//   - { tenant_id, contact_id }: escreve 1 contato específico
//   - { mode: 'stale', limit?: 50 }: batch — pega contatos com lead_memory mais
//     recente que a página atual da wiki (ou sem página ainda).

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getSupabaseClient, corsResponse, jsonResponse, errorResponse } from '../_shared/supabase.ts';

const BATCH_LIMIT_DEFAULT = 50;

interface LeadMemoryJson {
  narrative?: string;
  key_facts?: string[];
  concerns?: string[];
  closed_loops?: string[];
  generated_at?: string;
  model?: string;
}

function fmtList(items: string[] | undefined, prefix = '- '): string {
  if (!items || items.length === 0) return '_(nenhum)_';
  return items.map(i => `${prefix}${i}`).join('\n');
}

function fmtCurrency(n: number | null | undefined): string {
  if (!n) return '?';
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(n);
}

function buildLeadMarkdown(ctx: {
  contact: any;
  qualification: any;
  memory: LeadMemoryJson;
}): { title: string; content: string; sources: string[]; confidence: 'high' | 'medium' | 'low' } {
  const { contact, qualification, memory } = ctx;
  const name = contact?.name || `Lead ${(contact?.phone || '').slice(-4)}`;
  const title = `Lead: ${name}`;

  const lines: string[] = [];
  if (memory.narrative) {
    lines.push('## Resumo', memory.narrative.trim(), '');
  }

  // Qualification atual
  if (qualification) {
    const q: string[] = [];
    if (qualification.detected_interest) q.push(`- Finalidade: ${qualification.detected_interest}`);
    if (qualification.detected_property_type) q.push(`- Tipo: ${qualification.detected_property_type}`);
    if (qualification.detected_neighborhood) q.push(`- Bairro: ${qualification.detected_neighborhood}`);
    if (qualification.detected_bedrooms) q.push(`- Quartos: ${qualification.detected_bedrooms}`);
    if (qualification.detected_budget_max) q.push(`- Orçamento máx: ${fmtCurrency(qualification.detected_budget_max)}`);
    if (qualification.detected_timeline) q.push(`- Prazo: ${qualification.detected_timeline}`);
    if (qualification.qualification_score != null) q.push(`- Score: ${qualification.qualification_score}/10`);
    if (q.length) {
      lines.push('## Qualificação atual', q.join('\n'), '');
    }
  }

  if (memory.key_facts && memory.key_facts.length) {
    lines.push('## Fatos-chave', fmtList(memory.key_facts), '');
  }
  if (memory.concerns && memory.concerns.length) {
    lines.push('## Preocupações / objeções', fmtList(memory.concerns), '');
  }
  if (memory.closed_loops && memory.closed_loops.length) {
    lines.push('## Já descartado / resolvido (não reabrir)', fmtList(memory.closed_loops), '');
  }

  // CRM context (remarketing C2S)
  const crm: string[] = [];
  if (contact?.crm_natureza) crm.push(`- Natureza CRM: ${contact.crm_natureza}`);
  if (contact?.crm_neighborhood) crm.push(`- Bairro CRM: ${contact.crm_neighborhood}`);
  if (contact?.crm_property_ref) crm.push(`- Imóvel visto: ${contact.crm_property_ref}`);
  if (contact?.crm_price_hint) crm.push(`- Faixa CRM: ${contact.crm_price_hint}`);
  if (contact?.crm_source) crm.push(`- Portal origem: ${contact.crm_source}`);
  if (contact?.crm_archive_reason) crm.push(`- Motivo arquivamento: ${contact.crm_archive_reason}`);
  if (contact?.crm_broker_notes) crm.push(`- Anotação corretor: ${contact.crm_broker_notes}`);
  if (crm.length) {
    lines.push('## Contexto CRM (herdado)', crm.join('\n'), '');
  }

  // Imóveis apresentados
  if (Array.isArray(contact?.shown_property_codes) && contact.shown_property_codes.length) {
    const codes = contact.shown_property_codes
      .slice(-15)
      .map((e: any) => `- \`${e.code}\` em ${e.shown_at?.slice(0, 10) || '?'}${e.reaction && e.reaction !== 'unknown' ? ` (${e.reaction})` : ''}`)
      .join('\n');
    lines.push('## Imóveis já apresentados', codes, '');
  }

  // Metadata de geração
  lines.push('---');
  lines.push(`_Gerado a partir de \`contacts.lead_memory\` v${contact?.lead_memory_version || 0}, modelo \`${memory.model || 'unknown'}\`, em ${memory.generated_at || 'data desconhecida'}._`);

  // Confidence: alta se tem narrativa + key_facts + qualificação parcial; média senão
  const hasNarrative = !!memory.narrative;
  const hasFacts = (memory.key_facts || []).length >= 2;
  const hasQual = !!(qualification?.detected_interest || qualification?.detected_neighborhood);
  const confidence = (hasNarrative && hasFacts && hasQual) ? 'high' : (hasNarrative || hasQual) ? 'medium' : 'low';

  const sources = [
    'contacts.lead_memory',
    qualification ? 'lead_qualification' : null,
    contact?.crm_source ? `CRM ${contact.crm_source}` : null,
  ].filter(Boolean) as string[];

  return { title, content: lines.join('\n').trim(), sources, confidence };
}

async function writePageForContact(supabase: any, tenantId: string, contactId: string): Promise<{ ok: boolean; reason?: string }> {
  const { data: contact } = await supabase
    .from('contacts')
    .select('id, tenant_id, name, phone, lead_memory, lead_memory_updated_at, lead_memory_version, shown_property_codes, crm_natureza, crm_neighborhood, crm_property_ref, crm_price_hint, crm_source, crm_archive_reason, crm_broker_notes')
    .eq('id', contactId)
    .eq('tenant_id', tenantId)
    .maybeSingle();

  if (!contact) return { ok: false, reason: 'contact_not_found' };
  if (!contact.lead_memory) return { ok: false, reason: 'no_lead_memory_yet' };

  const { data: qualification } = await supabase
    .from('lead_qualification')
    .select('detected_interest, detected_property_type, detected_neighborhood, detected_bedrooms, detected_budget_max, detected_timeline, qualification_score')
    .eq('tenant_id', tenantId)
    .eq('phone_number', contact.phone)
    .maybeSingle();

  const { title, content, sources, confidence } = buildLeadMarkdown({
    contact,
    qualification,
    memory: contact.lead_memory as LeadMemoryJson,
  });

  const payload = {
    tenant_id: tenantId,
    page_type: 'lead',
    slug: contactId,
    title,
    content,
    sources,
    related: [] as string[],
    confidence,
    metadata: {
      lead_memory_version: contact.lead_memory_version,
      lead_memory_updated_at: contact.lead_memory_updated_at,
      phone: contact.phone,
    },
  };

  // Update-or-insert manual (índice unique é funcional, supabase-js upsert não casa)
  const { data: existing } = await supabase
    .from('wiki_pages')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('page_type', 'lead')
    .eq('slug', contactId)
    .maybeSingle();

  let dbErr: any;
  if (existing?.id) {
    const { error } = await supabase.from('wiki_pages').update(payload).eq('id', existing.id);
    dbErr = error;
  } else {
    const { error } = await supabase.from('wiki_pages').insert(payload);
    dbErr = error;
  }

  if (dbErr) {
    console.error(`❌ wiki-lead-writer write failed for ${contactId}:`, dbErr.message);
    return { ok: false, reason: `db_write_failed: ${dbErr.message}` };
  }

  console.log(`📚 wiki page lead/${contactId} sincronizada (v${contact.lead_memory_version})`);
  return { ok: true };
}

async function pickStale(supabase: any, limit: number): Promise<Array<{ id: string; tenant_id: string }>> {
  // Pega contatos com lead_memory mais recente que a página da wiki (ou sem página).
  // Usa SQL direto pra evitar N+1.
  const { data, error } = await supabase.rpc('pick_stale_wiki_lead_pages', { p_limit: limit });
  if (!error && Array.isArray(data)) return data;

  // Fallback JS (custo maior, mas funciona sem RPC):
  const { data: stale } = await supabase
    .from('contacts')
    .select('id, tenant_id, lead_memory_updated_at')
    .not('lead_memory', 'is', null)
    .order('lead_memory_updated_at', { ascending: false })
    .limit(limit * 5);

  if (!stale) return [];
  const picks: Array<{ id: string; tenant_id: string }> = [];
  for (const c of stale) {
    const { data: page } = await supabase
      .from('wiki_pages')
      .select('metadata')
      .eq('tenant_id', c.tenant_id)
      .eq('page_type', 'lead')
      .eq('slug', c.id)
      .maybeSingle();
    const wikiUpdatedAt: string | undefined = page?.metadata?.lead_memory_updated_at;
    if (!page || !wikiUpdatedAt || wikiUpdatedAt < c.lead_memory_updated_at) {
      picks.push({ id: c.id, tenant_id: c.tenant_id });
      if (picks.length >= limit) break;
    }
  }
  return picks;
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return corsResponse();

  try {
    const body = await req.json().catch(() => ({}));
    const supabase = getSupabaseClient();

    if (body.mode === 'stale') {
      const limit = Math.min(Number(body.limit) || BATCH_LIMIT_DEFAULT, 200);
      const picks = await pickStale(supabase, limit);
      const results: any[] = [];
      for (const p of picks) {
        const r = await writePageForContact(supabase, p.tenant_id, p.id);
        results.push({ contact_id: p.id, ...r });
      }
      return jsonResponse({ mode: 'stale', processed: picks.length, results });
    }

    const { tenant_id, contact_id } = body;
    if (!tenant_id || !contact_id) return errorResponse('Missing tenant_id or contact_id', 400);

    const result = await writePageForContact(supabase, tenant_id, contact_id);
    return jsonResponse(result);
  } catch (err) {
    console.error('❌ wiki-lead-writer failed:', (err as Error).message);
    return errorResponse((err as Error).message, 500);
  }
});
