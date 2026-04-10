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
  // C3-FIX: Qualificação mínima obrigatória antes de buscar imóveis:
  // Exige: finalidade (venda/locação) + tipo de imóvel + orçamento (OBRIGATÓRIO) + bairro (desejável)
  // Orçamento é obrigatório para evitar mostrar imóveis fora da faixa do cliente.
  if (!data) return false;
  if (!data.detected_interest) return false;
  if (!data.detected_property_type) return false;
  if (!data.detected_budget_max) return false;
  return calculateQualificationScore(data) >= 60;
}

// C3-FIX: Retorna quais dados obrigatórios ainda faltam para qualificação mínima
export function getMissingQualificationFields(data: QualificationData | null): string[] {
  const missing: string[] = [];
  if (!data?.detected_interest) missing.push('finalidade'); // venda ou locação
  if (!data?.detected_property_type) missing.push('tipo_imovel'); // casa, apto, etc
  if (!data?.detected_budget_max) missing.push('orcamento'); // obrigatório
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
  const sources: Record<string, 'client_explicit'> = {};

  // C5: Always extract from text — allow updates to already-filled fields
  // when the client provides new/different values (implicit corrections).
  // The merge logic will handle overwriting.
  // F1: All extractions from user text are marked as client_explicit.

  // Neighborhood/Region detection
  const neighborhood = detectNeighborhood(lower, regions);
  if (neighborhood && neighborhood !== currentData?.detected_neighborhood) {
    extracted.detected_neighborhood = neighborhood;
    sources.detected_neighborhood = 'client_explicit';
  }

  // Property type detection
  const type = detectPropertyType(lower);
  if (type && type !== currentData?.detected_property_type) {
    extracted.detected_property_type = type;
    sources.detected_property_type = 'client_explicit';
  }

  // Bedrooms detection
  const bedrooms = detectBedrooms(lower);
  if (bedrooms && bedrooms !== currentData?.detected_bedrooms) {
    extracted.detected_bedrooms = bedrooms;
    sources.detected_bedrooms = 'client_explicit';
  }

  // Budget detection
  const budget = detectBudget(lower);
  if (budget && budget !== currentData?.detected_budget_max) {
    extracted.detected_budget_max = budget;
    sources.detected_budget_max = 'client_explicit';
  }

  // Interest detection — always check, allow correction
  const interest = detectInterest(lower);
  if (interest && interest !== currentData?.detected_interest) {
    extracted.detected_interest = interest;
    sources.detected_interest = 'client_explicit';
  }

  // C3: Timeline detection (prazo de decisão)
  const timeline = detectTimeline(lower);
  if (timeline && timeline !== currentData?.detected_timeline) {
    extracted.detected_timeline = timeline;
    sources.detected_timeline = 'client_explicit';
  }

  if (Object.keys(sources).length > 0) {
    extracted.field_sources = sources;
  }

  return extracted;
}

// Detect interest (venda/locação/ambos) from text
function detectInterest(lower: string): string | null {
  const hasLocacao = /\b(alug|locar|loca[çc][aã]o|pra\s+alugar|para\s+alugar|quero\s+alugar)\b/i.test(lower);
  const hasVenda = /\b(comprar|compra|investir|adquirir|pra\s+comprar|para\s+comprar|quero\s+comprar)\b/i.test(lower);

  // Dual interest: "compra ou locação", "venda e locação", etc.
  if (hasLocacao && hasVenda) return 'ambos';
  if (hasLocacao) return 'locacao';
  if (hasVenda) return 'venda';
  return null;
}

// ========== MERGE QUALIFICATION DATA ==========

export function mergeQualificationData(
  current: QualificationData | null,
  extracted: ExtractedQualificationData
): QualificationData {
  const merged: QualificationData = { ...(current || {}) };

  // F1: Propagate field_sources — new extractions overwrite previous sources
  const currentSources = { ...(merged.field_sources || {}) };

  if (extracted.detected_neighborhood) merged.detected_neighborhood = extracted.detected_neighborhood;
  if (extracted.detected_property_type) merged.detected_property_type = extracted.detected_property_type;
  if (extracted.detected_bedrooms) merged.detected_bedrooms = extracted.detected_bedrooms;
  if (extracted.detected_budget_max) merged.detected_budget_max = extracted.detected_budget_max;
  if (extracted.detected_interest) merged.detected_interest = extracted.detected_interest;
  if (extracted.detected_timeline) merged.detected_timeline = extracted.detected_timeline;

  if (extracted.field_sources) {
    Object.assign(currentSources, extracted.field_sources);
  }
  merged.field_sources = currentSources;

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

  // C5: Expanded correction patterns — also match "mas eu queria", "isso é pra", "não, quero"
  const correctionPatterns = /na\s+verdade|mudei\s+de\s+ideia|prefiro|ao\s+inv[eé]s|quero\s+mudar|pode\s+ser|pensando\s+melhor|corrig|mas\s+(eu\s+)?quer|n[aã]o[,.]?\s+(eu\s+)?quer|isso\s+[eé]\s+pra|[eé]\s+pra\s+(comprar|alugar|locar|locação)/i;

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

    // C5: Also detect interest corrections (was missing entirely)
    const interest = detectInterest(lower);
    if (interest && interest !== currentData?.detected_interest) {
      corrections.detected_interest = interest;
      detected = true;
    }
  }

  return { detected, corrections };
}

// ========== SAVE TO DB ==========

export async function saveQualificationData(
  supabase: any,
  tenantId: string,
  phoneNumber: string,
  contactId: string | null,
  data: QualificationData
) {
  // Always recalculate score before persisting
  const freshScore = calculateQualificationScore(data);
  data.qualification_score = freshScore;

  // Save to lead_qualification (unique constraint: tenant_id + phone_number)
  const { error } = await supabase.from('lead_qualification').upsert({
    tenant_id: tenantId,
    phone_number: phoneNumber,
    detected_neighborhood: data.detected_neighborhood || null,
    detected_property_type: data.detected_property_type || null,
    detected_bedrooms: data.detected_bedrooms || null,
    detected_budget_max: data.detected_budget_max || null,
    detected_interest: data.detected_interest || null,
    detected_timeline: data.detected_timeline || null,
    qualification_score: freshScore,
    field_sources: data.field_sources || {},
    updated_at: new Date().toISOString(),
  }, { onConflict: 'tenant_id,phone_number' });

  if (error) {
    console.error(`❌ saveQualificationData failed for ${phoneNumber}:`, error.message, error.details);
  } else {
    console.log(`✅ Qualification saved for ${phoneNumber} (score: ${freshScore})`);
  }
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

  // Helper: find all matching neighborhoods in text
  function findAllMatches(text: string): string[] {
    const matches: string[] = [];
    for (const region of regions) {
      for (const neighborhood of region.neighborhoods) {
        const norm = removeAccents(neighborhood.toLowerCase());
        if (text.includes(norm)) {
          matches.push(neighborhood);
        }
      }
      const normRegion = removeAccents(region.region_name.toLowerCase());
      if (text.includes(normRegion)) {
        matches.push(region.region_name);
      }
    }
    // Also check aliases
    for (const region of regions) {
      for (const neighborhood of region.neighborhoods) {
        const aliases = NEIGHBORHOOD_ALIASES[neighborhood.toLowerCase()];
        if (aliases) {
          for (const alias of aliases) {
            if (text.includes(removeAccents(alias))) {
              if (!matches.includes(neighborhood)) matches.push(neighborhood);
            }
          }
        }
      }
    }
    return matches;
  }

  const allMatches = findAllMatches(normalizedInput);

  // If only one match, return it directly
  if (allMatches.length <= 1) {
    return allMatches[0] || null;
  }

  // Multiple matches: use context to disambiguate
  // Patterns that indicate DESIRED neighborhood (higher priority)
  const desiredPatterns = [
    /(?:quero|gostaria|prefiro|busco|procuro|preciso|desejo)\s+(?:morar|um\s+im[oó]vel|uma?\s+casa|um\s+ap(?:to|artamento)?)\s+(?:em|no|na|n[oa]s?)\s+/i,
    /(?:morar|residir|viver)\s+(?:em|no|na)\s+/i,
    /(?:regiao|bairro|zona)\s+(?:de|do|da)\s+/i,
    /(?:gost[oa]|ador[oa]|curto)\s+(?:muito\s+)?(?:d[oa]|a\s+regiao)\s+/i,
  ];

  // Patterns that indicate WORKPLACE/non-desired context (lower priority)
  const workPatterns = [
    /(?:trabalh[oa]|atuo|fa[cç]o\s+est[aá]gio|emprego|escrit[oó]rio|servi[cç]o)\s+(?:em|no|na|n[oa]s?|pel[oa])\s+/i,
    /(?:meu\s+trabalho|minha\s+empresa|meu\s+escrit[oó]rio)\s+(?:[eé]|fica)\s+(?:em|no|na)\s+/i,
  ];

  // Check which neighborhoods appear in desired context
  const desiredContextMatches: string[] = [];
  for (const match of allMatches) {
    const normMatch = removeAccents(match.toLowerCase());
    for (const pattern of desiredPatterns) {
      const regex = new RegExp(pattern.source + '[^.!?]*' + normMatch, 'i');
      if (regex.test(normalizedInput)) {
        if (!desiredContextMatches.includes(match)) desiredContextMatches.push(match);
        break;
      }
    }
  }
  // If we found neighborhoods in desired context, use those (may be multiple)
  if (desiredContextMatches.length > 0) {
    return desiredContextMatches.join(', ');
  }

  // Filter out neighborhoods that only appear in work context
  const workContextMatches: string[] = [];
  for (const match of allMatches) {
    const normMatch = removeAccents(match.toLowerCase());
    for (const pattern of workPatterns) {
      const regex = new RegExp(pattern.source + '[^.!?]*' + normMatch, 'i');
      if (regex.test(normalizedInput)) {
        workContextMatches.push(match);
      }
    }
  }

  // Return all matches that are NOT in work context, joined by comma
  const nonWorkMatches = allMatches.filter(m => !workContextMatches.includes(m));
  if (nonWorkMatches.length > 0) {
    // Multiple desired neighborhoods: join them (e.g., "Centro, Agronômica")
    return nonWorkMatches.join(', ');
  }

  // Fallback: return first match
  return allMatches[0];
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
  // Match "3 quartos", "3 dormitórios", "de 3 quartos", "com 3 quartos"
  // Also "3 quartos sendo 2 suítes" — always extract TOTAL bedrooms count
  const match = lower.match(/(?:de\s+|com\s+)?(\d+)\s*(?:quartos?|dormit[oó]rios?|dorms?)/i);
  if (match) return parseInt(match[1]);

  // Fallback: "2 suítes" without explicit quartos count — treat suítes as bedrooms hint
  const suitesMatch = lower.match(/(?:de\s+|com\s+)?(\d+)\s*su[ií]tes?/i);
  if (suitesMatch) return parseInt(suitesMatch[1]);

  // Word to number: "três quartos", "dois dormitórios"
  const wordMap: Record<string, number> = {
    'um': 1, 'uma': 1, 'dois': 2, 'duas': 2, 'tr[eê]s': 3, 'tres': 3,
    'quatro': 4, 'cinco': 5,
  };
  for (const [word, num] of Object.entries(wordMap)) {
    if (new RegExp(`(?:de\\s+|com\\s+)?${word}\\s*(?:quartos?|dormit|su[ií]tes?)`, 'i').test(lower)) return num;
  }

  return null;
}

function detectBudget(lower: string): number | null {
  // -2. Compound addition: "X milhão e Y" / "X milhão e Y mil" → X*1M + Y*1k
  // Handles: "1 milhão e 200", "1 milhão e 200 mil", "2 milhões e 500 mil"
  const compoundAddPattern = /([\d.,]+)\s*milh[aãoõ][oe]?s?\s+e\s+([\d.,]+)\s*(?:mil|k)?/i;
  const compoundAddMatch = lower.match(compoundAddPattern);
  if (compoundAddMatch) {
    const millions = parseFloat(compoundAddMatch[1].replace(/\./g, '').replace(',', '.'));
    let additional = parseFloat(compoundAddMatch[2].replace(/\./g, '').replace(',', '.'));
    if (!isNaN(millions) && !isNaN(additional)) {
      // "e 200 mil" → 200*1000; "e 200" (bare, <1000) → 200*1000 (contextual: milhão+small = thousands)
      if (additional < 1000) additional *= 1000;
      const total = millions * 1_000_000 + additional;
      if (total >= 100_000 && total <= 50_000_000) return total;
    }
  }

  // -1. Compound pattern: "X à vista + Y financiado" → SUM both values
  const compoundPattern = /([\d.,]+)\s*milh[aãoõ][oe]?s?\s*(?:[aà]\s*vista|de\s*entrada).*?([\d.,]+)\s*milh[aãoõ][oe]?s?\s*(?:financiad|parcelad)/i;
  const compoundMatch = lower.match(compoundPattern);
  if (compoundMatch) {
    const v1 = parseFloat(compoundMatch[1].replace(/\./g, '').replace(',', '.'));
    const v2 = parseFloat(compoundMatch[2].replace(/\./g, '').replace(',', '.'));
    if (!isNaN(v1) && !isNaN(v2)) {
      const total = (v1 + v2) * 1_000_000;
      if (total >= 100_000 && total <= 50_000_000) return total;
    }
  }

  // 0. Range detection: "500 mil a 700 mil", "de 400k a 600k", "entre 300 e 500 mil"
  // Always take the UPPER bound of the range (detected_budget_max)
  const rangePatterns = [
    // "500 mil a 700 mil", "500k a 700k", "500 mil até 700 mil"
    /([\d.,]+)\s*(?:mil|k)\s*(?:a|até|e|ou)\s*([\d.,]+)\s*(?:mil|k)/i,
    // "de 500 a 700 mil", "entre 500 e 700 mil"
    /(?:de|entre)\s*([\d.,]+)\s*(?:a|até|e)\s*([\d.,]+)\s*(?:mil|k)/i,
    // "R$ 500.000 a R$ 700.000"
    /r\$\s*([\d.,]+)\s*(?:a|até|e)\s*r?\$?\s*([\d.,]+)/i,
    // "500 a 700 mil"
    /([\d.,]+)\s*(?:a|até|e)\s*([\d.,]+)\s*(?:mil|k)/i,
  ];

  for (const pattern of rangePatterns) {
    const match = lower.match(pattern);
    if (match) {
      // Take the SECOND value (upper bound) as budget_max
      let rawMax = match[2].replace(/\./g, '').replace(',', '.');
      let numMax = parseFloat(rawMax);
      if (isNaN(numMax)) continue;

      // Apply "mil"/"k" multiplier
      if (/mil|k/i.test(match[0])) {
        if (numMax < 1000) numMax *= 1000;
      }

      if (numMax >= 100 && numMax <= 50_000_000) return numMax;
    }
  }

  // 1. Check "milhão/milhões" patterns (highest priority — natural speech)
  const milhaoPatterns = [
    /r?\$?\s*([\d.,]+)\s*milh[aãoõ][oe]?s?/i,           // "5 milhões", "R$ 2,5 milhões", "1 milhão"
    /([\d.,]+)\s*milh[aãoõ][oe]?s?\s*(?:de\s+)?(?:reais)?/i, // "5 milhões de reais"
    /(\d+)[.,](\d+)\s*(?:mi|M)\b/i,                       // "2.3M", "1,5 mi"
    /(\d+)\s*(?:mi|M)\b/i,                                // "1M", "2M", "5 mi"
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

  // 3. Bare numbers in Brazilian thousands format: "8.000", "22.000", "1.500.000"
  // Common when client replies just the number without R$, "mil", or "reais"
  const bareBrMatch = lower.match(/\b(\d{1,3}(?:\.\d{3})+)\b/);
  if (bareBrMatch) {
    const num = parseFloat(bareBrMatch[1].replace(/\./g, ''));
    if (!isNaN(num) && num >= 500 && num <= 50_000_000) return num;
  }

  // 4. Plain bare numbers: "8000", "22000" (no thousands separator)
  const plainMatch = lower.match(/\b(\d{4,8})\b/);
  if (plainMatch) {
    const num = parseInt(plainMatch[1]);
    if (!isNaN(num) && num >= 500 && num <= 50_000_000) return num;
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
