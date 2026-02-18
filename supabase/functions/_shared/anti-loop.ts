// ========== AIMEE.iA v2 - ANTI-LOOP ==========
// Persistence in DB (fixes v1 bug where in-memory Map reset on cold start).
// Checks last AI messages to detect repetitive behavior.

import { QualificationData } from './types.ts';

const MAX_STORED_MESSAGES = 5;

// ========== CHECK IF AI IS LOOPING ==========

export function isLoopingQuestion(
  aiResponse: string,
  qualificationData: QualificationData | null
): boolean {
  if (!qualificationData) return false;

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
      last_ai_message_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }, { onConflict: 'tenant_id,phone_number' });
}
