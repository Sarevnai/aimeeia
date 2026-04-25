// ========== AIMEE.iA — CULTURAL PROFILES (Wiki LLM) ==========
// Carrega perfis culturais do banco e injeta no system prompt da Aimee
// quando há sinais (texto, bairro, sobrenome) de que o lead pertence ao perfil.
// Multi-tenant: perfis globais (tenant_id null) + perfis customizados do tenant.

export interface CulturalProfile {
  id: string;
  tenant_id: string | null;
  profile_key: string;
  display_name: string;
  summary: string;
  origin_history: string | null;
  geography: string[] | null;
  language_markers: string[] | null;
  surnames_common: string[] | null;
  values_core: string[] | null;
  customs: string[] | null;
  cuisine: string[] | null;
  music_arts: string[] | null;
  religion: string | null;
  tastes_property: string[] | null;
  pain_points: string[] | null;
  do_list: string[] | null;
  dont_list: string[] | null;
  sample_phrases: string[] | null;
  detection_keywords: string[] | null;
  detection_neighborhoods: string[] | null;
  notes: string | null;
  active: boolean;
}

export async function loadCulturalProfiles(
  supabase: any,
  tenantId: string
): Promise<CulturalProfile[]> {
  try {
    const { data, error } = await supabase
      .from('cultural_profiles')
      .select('*')
      .or(`tenant_id.is.null,tenant_id.eq.${tenantId}`)
      .eq('active', true);

    if (error) {
      console.error('❌ loadCulturalProfiles error:', error);
      return [];
    }
    return (data || []) as CulturalProfile[];
  } catch (e) {
    console.error('❌ loadCulturalProfiles exception:', e);
    return [];
  }
}

interface DetectionSignals {
  contactName?: string | null;
  neighborhood?: string | null;
  recentMessages?: string[];
}

// Heurística: pontua cada perfil contra os sinais e devolve só os perfis com score > 0
export function pickRelevantProfiles(
  profiles: CulturalProfile[],
  signals: DetectionSignals
): CulturalProfile[] {
  if (profiles.length === 0) return [];

  const haystack = (
    (signals.contactName || '') + ' ' +
    (signals.neighborhood || '') + ' ' +
    (signals.recentMessages || []).join(' ')
  ).toLowerCase();

  const scored = profiles.map(p => {
    let score = 0;

    for (const kw of p.detection_keywords || []) {
      if (kw && haystack.includes(kw.toLowerCase())) score += 2;
    }
    for (const nb of p.detection_neighborhoods || []) {
      if (nb && haystack.includes(nb.toLowerCase())) score += 3;
    }
    for (const sn of p.surnames_common || []) {
      if (sn && (signals.contactName || '').toLowerCase().includes(sn.toLowerCase())) score += 1;
    }

    return { profile: p, score };
  });

  return scored
    .filter(s => s.score >= 2) // pelo menos 1 keyword OU 1 bairro
    .sort((a, b) => b.score - a.score)
    .slice(0, 2) // no máx 2 perfis (evita poluir o prompt)
    .map(s => s.profile);
}

function bullets(items: string[] | null | undefined, max = 8): string {
  if (!items || items.length === 0) return '';
  return items.slice(0, max).map(i => `  • ${i}`).join('\n');
}

export function renderCulturalProfileForPrompt(p: CulturalProfile): string {
  const sections: string[] = [];
  sections.push(`### ${p.display_name}`);
  sections.push(p.summary);

  if (p.language_markers?.length) sections.push(`**Como ele fala:**\n${bullets(p.language_markers)}`);
  if (p.values_core?.length) sections.push(`**Valores:**\n${bullets(p.values_core)}`);
  if (p.tastes_property?.length) sections.push(`**O que valoriza num imóvel:**\n${bullets(p.tastes_property)}`);
  if (p.pain_points?.length) sections.push(`**Sensibilidades (cuidado):**\n${bullets(p.pain_points)}`);
  if (p.do_list?.length) sections.push(`**FAÇA:**\n${bullets(p.do_list)}`);
  if (p.dont_list?.length) sections.push(`**NÃO FAÇA:**\n${bullets(p.dont_list)}`);
  if (p.sample_phrases?.length) sections.push(`**Frases de rapport (use ou inspire-se):**\n${bullets(p.sample_phrases, 6)}`);
  if (p.notes) sections.push(`_${p.notes}_`);

  return sections.join('\n\n');
}

export function generateCulturalKnowledge(
  profiles: CulturalProfile[],
  signals: DetectionSignals
): string {
  const relevant = pickRelevantProfiles(profiles, signals);
  if (relevant.length === 0) return '';

  const blocks = relevant.map(renderCulturalProfileForPrompt).join('\n\n---\n\n');
  return `\n\n🧭 PERFIL CULTURAL DO LEAD (use pra criar conexão genuína, NUNCA pra estereotipar):\n\n${blocks}\n\n`;
}
