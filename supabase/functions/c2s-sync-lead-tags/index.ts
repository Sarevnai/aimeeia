// ========== AIMEE.iA v2 — C2S SYNC LEAD TAGS ==========
// Sincroniza dinamicamente as tags de qualificação do lead no C2S conforme a
// Aimee detecta novos campos. Política: SUBSTITUIR (remove tag antiga do mesmo
// prefixo, adiciona a nova). Mantém tags manuais/estáticas que não usam prefixo.
//
// Payload:
//   tenant_id: string
//   c2s_lead_id: string
//   qualification_data: QualificationData (estado atual)

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getSupabaseClient, corsHeaders, corsResponse, jsonResponse, errorResponse } from '../_shared/supabase.ts';
import { generateTagsFromQualification } from '../_shared/qualification.ts';

const C2S_BASE = 'https://api.contact2sale.com';
const TAG_PREFIXES = ['Interesse:', 'Tipo:', 'Bairro:', 'Quartos:', 'Orçamento:', 'Prazo:'];

function tagPrefix(tag: string): string | null {
  for (const p of TAG_PREFIXES) {
    if (tag.startsWith(p)) return p;
  }
  return null;
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return corsResponse();

  const supabase = getSupabaseClient();

  try {
    const { tenant_id, c2s_lead_id, qualification_data } = await req.json();

    if (!tenant_id || !c2s_lead_id) {
      return errorResponse('Missing tenant_id ou c2s_lead_id', 400);
    }

    const { data: cfgRow } = await supabase
      .from('system_settings')
      .select('setting_value')
      .eq('tenant_id', tenant_id)
      .eq('setting_key', 'c2s_config')
      .maybeSingle();

    const apiKey = cfgRow?.setting_value?.api_key;
    if (!apiKey) return errorResponse('C2S não configurado pra esse tenant', 400);

    const headers = {
      'Authentication': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    };

    // Tags desejadas (estado atual da qualificação)
    const desired = generateTagsFromQualification(qualification_data || {});
    const desiredByPrefix = new Map<string, string>();
    for (const t of desired) {
      const p = tagPrefix(t);
      if (p) desiredByPrefix.set(p, t);
    }

    // Tags atuais no C2S
    const tagsRes = await fetch(`${C2S_BASE}/integration/leads/${c2s_lead_id}/tags`, { headers });
    if (!tagsRes.ok) {
      return jsonResponse({
        success: false,
        step: 'get_tags',
        status: tagsRes.status,
        details: await tagsRes.text().catch(() => ''),
      }, 200);
    }
    const tagsJson = await tagsRes.json();
    const current: Array<{ id: string; name?: string; attributes?: { name?: string } }> =
      Array.isArray(tagsJson?.data) ? tagsJson.data : (Array.isArray(tagsJson) ? tagsJson : []);

    const currentByPrefix = new Map<string, { id: string; name: string }>();
    const currentNames = new Set<string>();
    for (const t of current) {
      const name = t?.attributes?.name || t?.name || '';
      if (!name) continue;
      currentNames.add(name);
      const p = tagPrefix(name);
      if (p) currentByPrefix.set(p, { id: String(t.id), name });
    }

    const toAdd: string[] = [];
    const toRemove: Array<{ id: string; name: string }> = [];

    // Para cada prefixo desejado: adicionar se novo OU diferente do atual
    for (const [prefix, desiredTag] of desiredByPrefix.entries()) {
      const cur = currentByPrefix.get(prefix);
      if (!cur) {
        if (!currentNames.has(desiredTag)) toAdd.push(desiredTag);
      } else if (cur.name !== desiredTag) {
        toRemove.push(cur);
        toAdd.push(desiredTag);
      }
    }

    // Remover tags com prefixo conhecido que não existem mais no estado atual
    for (const [prefix, cur] of currentByPrefix.entries()) {
      if (!desiredByPrefix.has(prefix)) {
        toRemove.push(cur);
      }
    }

    const results = { added: [] as string[], removed: [] as string[], errors: [] as string[] };

    for (const rem of toRemove) {
      try {
        const delRes = await fetch(
          `${C2S_BASE}/integration/leads/${c2s_lead_id}/tags/${rem.id}`,
          { method: 'DELETE', headers },
        );
        if (delRes.ok) {
          results.removed.push(rem.name);
        } else {
          results.errors.push(`delete ${rem.name}: ${delRes.status}`);
        }
      } catch (err) {
        results.errors.push(`delete ${rem.name}: ${(err as Error).message}`);
      }
    }

    for (const add of toAdd) {
      try {
        const addRes = await fetch(
          `${C2S_BASE}/integration/leads/${c2s_lead_id}/create_tag`,
          {
            method: 'POST',
            headers,
            body: JSON.stringify({ data: { type: 'tag', attributes: { name: add } } }),
          },
        );
        if (addRes.ok) {
          results.added.push(add);
        } else {
          results.errors.push(`add ${add}: ${addRes.status}`);
        }
      } catch (err) {
        results.errors.push(`add ${add}: ${(err as Error).message}`);
      }
    }

    console.log(`🏷️ C2S tag sync lead=${c2s_lead_id}: +[${results.added.join(', ')}] -[${results.removed.join(', ')}]`);

    return jsonResponse({ success: true, ...results });

  } catch (error) {
    console.error('❌ c2s-sync-lead-tags error:', error);
    return errorResponse((error as Error).message);
  }
});
