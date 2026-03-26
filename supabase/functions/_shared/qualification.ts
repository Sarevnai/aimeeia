// ========== AIMEE.iA v2 - QUALIFICATION ==========
// Extracts and scores lead qualification data from conversation.
// Used by ai-agent to determine when a lead is ready for property search.

import { QualificationData, ExtractedQualificationData } from './types.ts';

// ========== QUALIFICATION SCORE ==========

export function calculateQualificationScore(data: QualificationData | null): number {
  if (!data) return 0;

  let score = 0;
  if (data.detected_neighborhood) score += 20;
  if (data.detected_property_type) score += 20;
  if (data.detected_bedrooms) score += 10;
  if (data.detected_budget_max) score += 25;
  if (data.detected_interest) score += 20;  // C3: Finalidade (venda/locação) agora pesa mais
  if (data.detected_timeline) score += 5;   // C3: Timeline de compra (bonus)

  return Math.min(score, 100);
}

export function isQualificationComplete(data: QualificationData | null): boolean {
  // C3: Qualificação mínima obrigatória antes de buscar imóveis:
  // Exige pelo menos finalidade (venda/locação) + tipo de imóvel + orçamento OU bairro
  // Score mínimo: interest(20) + type(20) + budget(25) ou neighborhood(20) = 60-65
  return calculateQualificationScore(data) >= 60;
}

// C3: Retorna quais dados obrigatórios ainda faltam para qualificação mínima
export function getMissingQualificationFields(data: QualificationData | null): string[] {
  const missing: string[] = [];
  if (!data?.detected_interest) missing.push('finalidade'); // venda ou locação
  if (!data?.detected_property_type) missing.push('tipo_imovel'); // casa, apto, etc
  if (!data?.detected_budget_max && !data?.detected_neighborhood) missing.push('orcamento_ou_bairro'); // pelo menos 1
  return missing;
}

export function getNextQualificationQuestion(
  data: QualificationData | null,
  department: string
): string | null {
  if (!data) return null;

  // Let the AI use its judgment instead of forcing a strict flow.
  // The system prompt should handle asking natural questions.
  return null;
}

// ========== EXTRACT QUALIFICATION FROM TEXT ==========

export function extractQualificationFromText(
  text: string,
  currentData: QualificationData | null,
  regions: Array<{ region_name: string; neighborhoods: string[] }>
): ExtractedQualificationData {
  const lower = text.toLowerCase();
  const extracted: ExtractedQualificationData = {};

  // Neighborhood/Region detection
  if (!currentData?.detected_neighborhood) {
    const neighborhood = detectNeighborhood(lower, regions);
    if (neighborhood) extracted.detected_neighborhood = neighborhood;
  }

  // Property type detection
  if (!currentData?.detected_property_type) {
    const type = detectPropertyType(lower);
    if (type) extracted.detected_property_type = type;
  }

  // Bedrooms detection
  if (!currentData?.detected_bedrooms) {
    const bedrooms = detectBedrooms(lower);
    if (bedrooms) extracted.detected_bedrooms = bedrooms;
  }

  // Budget detection
  if (!currentData?.detected_budget_max) {
    const budget = detectBudget(lower);
    if (budget) extracted.detected_budget_max = budget;
  }

  // Interest detection
  if (!currentData?.detected_interest) {
    if (/alug|locar|locação/i.test(lower)) extracted.detected_interest = 'locacao';
    else if (/comprar|compra|investir/i.test(lower)) extracted.detected_interest = 'venda';
  }

  // C3: Timeline detection (prazo de decisão)
  if (!currentData?.detected_timeline) {
    const timeline = detectTimeline(lower);
    if (timeline) extracted.detected_timeline = timeline;
  }

  return extracted;
}

// ========== MERGE QUALIFICATION DATA ==========

export function mergeQualificationData(
  current: QualificationData | null,
  extracted: ExtractedQualificationData
): QualificationData {
  const merged: QualificationData = { ...(current || {}) };

  if (extracted.detected_neighborhood) merged.detected_neighborhood = extracted.detected_neighborhood;
  if (extracted.detected_property_type) merged.detected_property_type = extracted.detected_property_type;
  if (extracted.detected_bedrooms) merged.detected_bedrooms = extracted.detected_bedrooms;
  if (extracted.detected_budget_max) merged.detected_budget_max = extracted.detected_budget_max;
  if (extracted.detected_interest) merged.detected_interest = extracted.detected_interest;
  if (extracted.detected_timeline) merged.detected_timeline = extracted.detected_timeline;

  merged.qualification_score = calculateQualificationScore(merged);
  merged.questions_answered = countAnswered(merged);

  return merged;
}

// ========== DETECT CORRECTIONS ==========

export function detectCorrections(
  text: string,
  currentData: QualificationData | null,
  regions: Array<{ region_name: string; neighborhoods: string[] }>
): { detected: boolean; corrections: ExtractedQualificationData } {
  const lower = text.toLowerCase();
  const corrections: ExtractedQualificationData = {};
  let detected = false;

  // Check for correction patterns
  const correctionPatterns = /na\s+verdade|mudei\s+de\s+ideia|prefiro|ao\s+inv[eé]s|quero\s+mudar|pode\s+ser|pensando\s+melhor|corrig/i;

  if (correctionPatterns.test(lower)) {
    // Re-extract everything and override
    const neighborhood = detectNeighborhood(lower, regions);
    if (neighborhood && neighborhood !== currentData?.detected_neighborhood) {
      corrections.detected_neighborhood = neighborhood;
      detected = true;
    }

    const type = detectPropertyType(lower);
    if (type && type !== currentData?.detected_property_type) {
      corrections.detected_property_type = type;
      detected = true;
    }

    const bedrooms = detectBedrooms(lower);
    if (bedrooms && bedrooms !== currentData?.detected_bedrooms) {
      corrections.detected_bedrooms = bedrooms;
      detected = true;
    }

    const budget = detectBudget(lower);
    if (budget && budget !== currentData?.detected_budget_max) {
      corrections.detected_budget_max = budget;
      detected = true;
    }
  }

  return { detected, corrections };
}

// ========== SAVE TO DB ==========

export async function saveQualificationData(
  supabase: any,
  tenantId: string,
  conversationId: string,
  contactId: string | null,
  data: QualificationData
) {
  // Save to lead_qualification
  await supabase.from('lead_qualification').upsert({
    tenant_id: tenantId,
    conversation_id: conversationId,
    contact_id: contactId,
    detected_neighborhood: data.detected_neighborhood || null,
    detected_property_type: data.detected_property_type || null,
    detected_bedrooms: data.detected_bedrooms || null,
    detected_budget_min: data.detected_budget_min || null,
    detected_budget_max: data.detected_budget_max || null,
    detected_interest: data.detected_interest || null,
    detected_timeline: data.detected_timeline || null,
    qualification_score: data.qualification_score || 0,
    questions_answered: data.questions_answered || 0,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'conversation_id' });

  // Also update conversation
  await supabase
    .from('conversations')
    .update({ qualification_data: data })
    .eq('id', conversationId);
}

// ========== PRIVATE HELPERS ==========

// Common abbreviations and aliases for neighborhoods in Florianópolis
const NEIGHBORHOOD_ALIASES: Record<string, string[]> = {
  'santo antônio de lisboa': ['santo antônio', 'santo antonio', 'sto antônio', 'sto antonio', 'sto. antônio', 'sto. antonio'],
  'ingleses do rio vermelho': ['ingleses', 'praia dos ingleses', 'centrinho dos ingleses'],
  'cachoeira do bom jesus': ['cachoeira', 'cachoeira do bom jesus'],
  'ponta das canas': ['ponta das canas'],
  'são joão do rio vermelho': ['são joão', 'sao joao'],
  'armação do pântano do sul': ['armação', 'armacao'],
  'lagoa da conceição': ['lagoa', 'lagoa da conceição', 'lagoa da conceicao'],
  'ribeirão da ilha': ['ribeirão', 'ribeirao'],
  'jurerê internacional': ['jurerê internacional', 'jurere internacional'],
  'jurerê tradicional': ['jurerê tradicional', 'jurere tradicional'],
  'jurerê': ['jurere', 'jurerê'],
  'canasvieiras': ['canasvieiras', 'canas vieiras', 'canasvierias', 'canas'],
  'saco dos limões': ['saco dos limões', 'saco dos limoes'],
  'costeira do pirajubaé': ['costeira', 'pirajubaé', 'pirajubae'],
  'vargem do bom jesus': ['vargem do bom jesus'],
  'balneário do estreito': ['balneário estreito'],
};

// Normalize accented characters for accent-insensitive matching
function removeAccents(str: string): string {
  return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function detectNeighborhood(
  lower: string,
  regions: Array<{ region_name: string; neighborhoods: string[] }>
): string | null {
  // Normalize input for accent-insensitive comparison
  const normalizedInput = removeAccents(lower);

  // 1. Direct match against neighborhoods list (accent-insensitive)
  for (const region of regions) {
    for (const neighborhood of region.neighborhoods) {
      const normalizedNeighborhood = removeAccents(neighborhood.toLowerCase());
      if (normalizedInput.includes(normalizedNeighborhood)) {
        return neighborhood;
      }
    }
    const normalizedRegion = removeAccents(region.region_name.toLowerCase());
    if (normalizedInput.includes(normalizedRegion)) {
      return region.region_name;
    }
  }

  // 2. Alias/fuzzy match — check abbreviations and common misspellings
  for (const region of regions) {
    for (const neighborhood of region.neighborhoods) {
      const aliases = NEIGHBORHOOD_ALIASES[neighborhood.toLowerCase()];
      if (aliases) {
        for (const alias of aliases) {
          if (normalizedInput.includes(removeAccents(alias))) {
            return neighborhood;
          }
        }
      }
    }
  }

  return null;
}

function detectPropertyType(lower: string): string | null {
  if (/apartamento|apto|ap\b/i.test(lower)) return 'apartamento';
  if (/\bcasa\b/i.test(lower)) return 'casa';
  if (/cobertura/i.test(lower)) return 'cobertura';
  if (/terreno|lote/i.test(lower)) return 'terreno';
  if (/kitnet|kit\b|studio|est[uú]dio/i.test(lower)) return 'kitnet';
  if (/sobrado/i.test(lower)) return 'sobrado';
  if (/sala\s+comercial|comercial|loja/i.test(lower)) return 'comercial';
  return null;
}

function detectBedrooms(lower: string): number | null {
  // Match "3 quartos", "3 dormitórios", but also "3 quartos sendo 2 suítes"
  // Always extract the TOTAL bedrooms count (first number before quartos/dormitórios)
  const match = lower.match(/(\d+)\s*(?:quartos?|dormit[oó]rios?|dorms?)/i);
  if (match) return parseInt(match[1]);

  // Fallback: "2 suítes" without explicit quartos count — treat suítes as bedrooms hint
  const suitesMatch = lower.match(/(\d+)\s*su[ií]tes?/i);
  if (suitesMatch) return parseInt(suitesMatch[1]);

  // Word to number
  const wordMap: Record<string, number> = {
    'um': 1, 'uma': 1, 'dois': 2, 'duas': 2, 'tr[eê]s': 3,
    'quatro': 4, 'cinco': 5,
  };
  for (const [word, num] of Object.entries(wordMap)) {
    if (new RegExp(`${word}\\s*(?:quartos?|dormit|su[ií]tes?)`, 'i').test(lower)) return num;
  }

  return null;
}

function detectBudget(lower: string): number | null {
  // 1. Check "milhão/milhões" patterns FIRST (highest priority — natural speech)
  const milhaoPatterns = [
    /r?\$?\s*([\d.,]+)\s*milh[aãoõ][oe]?s?/i,           // "5 milhões", "R$ 2,5 milhões", "1 milhão"
    /([\d.,]+)\s*milh[aãoõ][oe]?s?\s*(?:de\s+)?(?:reais)?/i, // "5 milhões de reais"
    /(\d+)[.,](\d+)\s*(?:mi|M)\b/i,                       // "2.3M", "1,5 mi"
  ];

  for (const pattern of milhaoPatterns) {
    const match = lower.match(pattern);
    if (match) {
      let value = match[1].replace(/\./g, '').replace(',', '.');
      let num = parseFloat(value);
      if (isNaN(num)) continue;
      num *= 1_000_000;
      if (num >= 100_000 && num <= 50_000_000) return num;
    }
  }

  // 2. Standard R$ patterns
  const patterns = [
    /r\$\s*([\d.,]+)\s*(?:mil|k)/i,
    /r\$\s*([\d.,]+)/i,
    /([\d.,]+)\s*(?:mil|k)\s*(?:reais)?/i,
    /at[eé]\s*r?\$?\s*([\d.,]+)/i,
    /([\d.,]+)\s*reais/i,
  ];

  for (const pattern of patterns) {
    const match = lower.match(pattern);
    if (match) {
      let value = match[1].replace(/\./g, '').replace(',', '.');
      let num = parseFloat(value);
      if (isNaN(num)) continue;

      // "mil" / "k" multiplier
      if (/mil|k/i.test(lower.slice(match.index || 0, (match.index || 0) + match[0].length + 5))) {
        if (num < 1000) num *= 1000;
      }

      if (num >= 100 && num <= 50000000) return num;
    }
  }

  return null;
}

function countAnswered(data: QualificationData): number {
  let count = 0;
  if (data.detected_neighborhood) count++;
  if (data.detected_property_type) count++;
  if (data.detected_bedrooms) count++;
  if (data.detected_budget_max) count++;
  if (data.detected_interest) count++;
  if (data.detected_timeline) count++;
  return count;
}

// ========== AUTO-TAGGING ==========

// Known prefixes for auto-generated tags (used to identify and replace them)
const AUTO_TAG_PREFIXES = ['Interesse:', 'Tipo:', 'Bairro:', 'Quartos:', 'Orçamento:', 'Prazo:'];

function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function formatBudgetBucket(value: number): string {
  if (value <= 100000) return 'até 100k';
  if (value <= 300000) return '100k-300k';
  if (value <= 500000) return '300k-500k';
  if (value <= 1000000) return '500k-1M';
  if (value <= 2500000) return '1M-2.5M';
  if (value <= 5000000) return '2.5M-5M';
  return 'acima de 5M';
}

function formatTimeline(timeline: string): string {
  if (timeline === '0-3m') return 'Curto prazo';
  if (timeline === '3-6m') return 'Médio prazo';
  if (timeline === '6m+') return 'Longo prazo';
  return timeline;
}

/**
 * Converts qualification data into human-readable tags.
 * Tags use known prefixes (e.g., "Interesse:", "Bairro:") so they can be
 * identified and replaced on subsequent updates without touching manual tags.
 */
export function generateTagsFromQualification(data: QualificationData | null): string[] {
  if (!data) return [];

  const tags: string[] = [];
  if (data.detected_interest) {
    tags.push(`Interesse: ${data.detected_interest === 'locacao' ? 'Locação' : 'Venda'}`);
  }
  if (data.detected_property_type) {
    tags.push(`Tipo: ${capitalize(data.detected_property_type)}`);
  }
  if (data.detected_neighborhood) {
    tags.push(`Bairro: ${data.detected_neighborhood}`);
  }
  if (data.detected_bedrooms) {
    tags.push(`Quartos: ${data.detected_bedrooms}`);
  }
  if (data.detected_budget_max) {
    tags.push(`Orçamento: ${formatBudgetBucket(data.detected_budget_max)}`);
  }
  if (data.detected_timeline) {
    tags.push(`Prazo: ${formatTimeline(data.detected_timeline)}`);
  }
  return tags;
}

/**
 * Syncs auto-generated tags to contacts.tags without overwriting manual tags.
 * Removes old auto-tags (identified by known prefixes), merges new ones, preserves manual tags.
 */
export async function syncContactTags(
  supabase: any,
  contactId: string,
  newAutoTags: string[]
): Promise<void> {
  try {
    const { data: contact } = await supabase
      .from('contacts')
      .select('tags')
      .eq('id', contactId)
      .single();

    const existingTags: string[] = contact?.tags || [];

    // Keep only manual tags (those that DON'T start with a known auto-prefix)
    const manualTags = existingTags.filter(
      (t: string) => !AUTO_TAG_PREFIXES.some(prefix => t.startsWith(prefix))
    );

    // Merge manual + new auto tags
    const mergedTags = [...manualTags, ...newAutoTags];

    await supabase
      .from('contacts')
      .update({ tags: mergedTags, updated_at: new Date().toISOString() })
      .eq('id', contactId);

    console.log(`🏷️ Tags synced for contact ${contactId}: [${newAutoTags.join(', ')}]`);
  } catch (err) {
    console.error(`⚠️ Failed to sync tags for contact ${contactId}:`, err);
    // Non-blocking: tag sync failure should not break the conversation
  }
}

// C3: Detecta prazo de decisão/compra do cliente
function detectTimeline(lower: string): string | null {
  // Imediato / urgente / até 3 meses
  if (/\b(imediato|urgente|agora|j[aá]|o\s+mais\s+r[aá]pido|esse\s+m[eê]s|pr[oó]ximo\s+m[eê]s|1\s*m[eê]s|2\s*meses?|3\s*meses?|curto\s+prazo|nos\s+pr[oó]ximos\s+3)\b/i.test(lower)) {
    return '0-3m';
  }
  // 3 a 6 meses
  if (/\b(4\s*meses?|5\s*meses?|6\s*meses?|meio\s+ano|primeiro\s+semestre|m[eé]dio\s+prazo|3\s*a\s*6)\b/i.test(lower)) {
    return '3-6m';
  }
  // Acima de 6 meses / sem pressa
  if (/\b(sem\s+pressa|n[aã]o\s+tenho\s+pressa|longo\s+prazo|mais\s+de\s+6|acima\s+de\s+6|1\s*ano|pr[oó]ximo\s+ano|ano\s+que\s+vem|quando\s+achar|sem\s+urg[eê]ncia)\b/i.test(lower)) {
    return '6m+';
  }
  return null;
}
