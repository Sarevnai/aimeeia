// ========== AIMEE.iA v2 - ANTI-LOOP ==========
// Persistence in DB (fixes v1 bug where in-memory Map reset on cold start).
// Checks last AI messages to detect repetitive behavior.
// v2.1: Fallback rotation to prevent infinite fallback loops.
//        Property-detail responses are never intercepted.

import { QualificationData } from './types.ts';

const MAX_STORED_MESSAGES = 5;

// Rotating fallback pool — never send the same fallback twice in a row
const FALLBACK_POOL_QUALIFIED = [
  'Vou buscar novas opções pra você com base no que conversamos.',
  'Deixa eu procurar mais alternativas com o perfil que você descreveu.',
  'Com base no que já conversamos, vou trazer outras opções.',
];

const FALLBACK_POOL_UNQUALIFIED = [
  'Me ajuda a entender melhor o que você procura?',
  'Pra eu buscar algo certeiro, preciso de mais alguns detalhes.',
  'Me conta mais sobre o que é importante pra você no imóvel?',
];

// ========== CHECK IF RESPONSE CONTAINS PROPERTY DETAILS ==========

export function containsPropertyDetails(aiResponse: string): boolean {
  const lower = aiResponse.toLowerCase();
  // Response mentions specific property data: codes, prices, suites, area — don't intercept
  if (/c[oó]digo\s+\d|r\$\s*[\d.,]+|su[ií]te|quartos?\s+sendo|metros?\s+quadrados?|m²|\d+\s*m²/i.test(lower)) {
    return true;
  }
  // Response references a specific property the client asked about
  if (/essa?\s+(casa|apartamento|im[oó]vel|op[çc][aã]o)|a\s+que\s+te\s+mostrei|último\s+im[oó]vel/i.test(lower)) {
    return true;
  }
  return false;
}

// ========== CHECK IF AI IS LOOPING ==========

export function isLoopingQuestion(
  aiResponse: string,
  qualificationData: QualificationData | null
): boolean {
  if (!qualificationData) return false;

  // Never intercept responses with property details
  if (containsPropertyDetails(aiResponse)) return false;

  const lower = aiResponse.toLowerCase();

  if (qualificationData.detected_neighborhood) {
    if (/qual\s+(regi[aã]o|bairro)|onde\s+voc[eê]|localiza[cç][aã]o|prefer[eê]ncia.*regi|que\s+regi/i.test(lower)) {
      console.log('⚠️ Loop detected: asking region again');
      return true;
    }
  }

  if (qualificationData.detected_bedrooms) {
    if (/quantos?\s+quartos?|n[uú]mero\s+de\s+(quartos?|dormit[oó]rios?)/i.test(lower)) {
      console.log('⚠️ Loop detected: asking bedrooms again');
      return true;
    }
  }

  if (qualificationData.detected_budget_max) {
    if (/faixa\s+de\s+(valor|pre[cç]o)|or[cç]amento|quanto\s+(quer|pode)\s+pagar|qual.*valor/i.test(lower)) {
      console.log('⚠️ Loop detected: asking budget again');
      return true;
    }
  }

  if (qualificationData.detected_property_type) {
    if (/que\s+tipo|qual\s+tipo|tipo\s+de\s+im[oó]vel|apartamento.*casa.*ou/i.test(lower)) {
      console.log('⚠️ Loop detected: asking property type again');
      return true;
    }
  }

  return false;
}

// ========== CHECK REPETITIVE MESSAGES ==========

export function isRepetitiveMessage(
  aiResponse: string,
  lastAiMessages: string[]
): boolean {
  if (!lastAiMessages || lastAiMessages.length === 0) return false;

  // Never intercept responses with property details
  if (containsPropertyDetails(aiResponse)) return false;

  const normalized = aiResponse.toLowerCase().trim().slice(0, 200);

  for (const prev of lastAiMessages) {
    const prevNorm = prev.toLowerCase().trim().slice(0, 200);
    if (normalized === prevNorm) return true;

    // Check similarity (simple Jaccard on words)
    const wordsA = new Set(normalized.split(/\s+/));
    const wordsB = new Set(prevNorm.split(/\s+/));
    const intersection = [...wordsA].filter(w => wordsB.has(w));
    const union = new Set([...wordsA, ...wordsB]);
    const similarity = intersection.length / union.size;

    if (similarity > 0.85) {
      console.log(`⚠️ Repetitive message detected (${(similarity * 100).toFixed(0)}% similar)`);
      return true;
    }
  }

  return false;
}

// ========== GET ROTATING FALLBACK (never same as last) ==========

export function getRotatingFallback(
  isQualified: boolean,
  lastAiMessages: string[]
): string {
  const pool = isQualified ? FALLBACK_POOL_QUALIFIED : FALLBACK_POOL_UNQUALIFIED;
  const lastMsg = lastAiMessages.length > 0
    ? lastAiMessages[lastAiMessages.length - 1]?.toLowerCase().trim() || ''
    : '';

  // Pick a fallback that doesn't match the last message
  for (const fb of pool) {
    if (fb.toLowerCase().trim() !== lastMsg.slice(0, 200)) {
      return fb;
    }
  }
  // Ultimate fallback: pick the first from the pool
  return pool[0];
}

// ========== UPDATE ANTI-LOOP STATE ==========

export async function updateAntiLoopState(
  supabase: any,
  tenantId: string,
  phoneNumber: string,
  aiResponse: string
) {
  // Get current state
  const { data: state } = await supabase
    .from('conversation_states')
    .select('last_ai_messages')
    .eq('tenant_id', tenantId)
    .eq('phone_number', phoneNumber)
    .maybeSingle();

  const messages = state?.last_ai_messages || [];
  messages.push(aiResponse.slice(0, 300));

  // Keep only last N messages
  while (messages.length > MAX_STORED_MESSAGES) {
    messages.shift();
  }

  await supabase
    .from('conversation_states')
    .upsert({
      tenant_id: tenantId,
      phone_number: phoneNumber,
      last_ai_messages: messages,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'tenant_id,phone_number' });
}
