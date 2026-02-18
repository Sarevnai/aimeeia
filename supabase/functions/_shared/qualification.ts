// ========== AIMEE.iA v2 - QUALIFICATION ==========
// Extracts and scores lead qualification data from conversation.
// Used by ai-agent to determine when a lead is ready for property search.

import { QualificationData, ExtractedQualificationData } from './types.ts';

// ========== QUALIFICATION SCORE ==========

export function calculateQualificationScore(data: QualificationData | null): number {
  if (!data) return 0;

  let score = 0;
  if (data.detected_neighborhood) score += 25;
  if (data.detected_property_type) score += 20;
  if (data.detected_bedrooms) score += 20;
  if (data.detected_budget_max) score += 25;
  if (data.detected_interest) score += 10;

  return Math.min(score, 100);
}

export function isQualificationComplete(data: QualificationData | null): boolean {
  return calculateQualificationScore(data) >= 45;
}

export function getNextQualificationQuestion(
  data: QualificationData | null,
  department: string
): string | null {
  if (!data) return null;

  // Priority order for qualification
  if (!data.detected_neighborhood) {
    return department === 'locacao'
      ? 'Qual região ou bairro você prefere para morar?'
      : 'Qual região ou bairro você está buscando?';
  }

  if (!data.detected_property_type) {
    return 'Que tipo de imóvel você procura? (apartamento, casa, terreno...)';
  }

  if (!data.detected_bedrooms) {
    return 'Quantos quartos você precisa?';
  }

  if (!data.detected_budget_max) {
    return department === 'locacao'
      ? 'Qual sua faixa de valor para aluguel?'
      : 'Qual sua faixa de investimento?';
  }

  return null; // All collected
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

function detectNeighborhood(
  lower: string,
  regions: Array<{ region_name: string; neighborhoods: string[] }>
): string | null {
  for (const region of regions) {
    for (const neighborhood of region.neighborhoods) {
      if (lower.includes(neighborhood.toLowerCase())) {
        return neighborhood;
      }
    }
    if (lower.includes(region.region_name.toLowerCase())) {
      return region.region_name;
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
  const match = lower.match(/(\d+)\s*(?:quartos?|dormit[oó]rios?|dorms?|suites?)/i);
  if (match) return parseInt(match[1]);

  // Word to number
  const wordMap: Record<string, number> = {
    'um': 1, 'uma': 1, 'dois': 2, 'duas': 2, 'tr[eê]s': 3,
    'quatro': 4, 'cinco': 5,
  };
  for (const [word, num] of Object.entries(wordMap)) {
    if (new RegExp(`${word}\\s*(?:quartos?|dormit)`, 'i').test(lower)) return num;
  }

  return null;
}

function detectBudget(lower: string): number | null {
  // R$ patterns
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
  return count;
}
