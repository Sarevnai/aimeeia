// ========== AIMEE.iA v3 - ANTI-LOOP ==========
// Persistence in DB (fixes v1 bug where in-memory Map reset on cold start).
// Checks last AI messages to detect repetitive behavior.
// v3: Fixes meta-loop bug — fallbacks are NOT saved to last_ai_messages,
//     getRotatingFallback avoids ALL recent messages (not just last),
//     expanded pool to 8 messages per category + remarketing-specific pool.

import { QualificationData } from './types.ts';

// ========== FIX J2: REASONING LEAK DETECTOR ==========
// Heuristic patterns that indicate the LLM leaked internal reasoning to the client.
// These phrases are typical of chain-of-thought that should never reach the user.

const REASONING_LEAK_PATTERNS: RegExp[] = [
  /\bpreciso\s+(ser|fazer|perguntar|iniciar|seguir|manter|conduzir|ter\s+cuidado)/i,
  /\bvou\s+(seguir|começar|iniciar|perguntar|conduzir|analisar|manter)/i,
  /\btenho\s+os\s+dados/i,
  /\bfalta\s+(tipo|bairro|orçamento|nome|localização|finalidade)/i,
  /\ba\s+próxima\s+pergunta\s+(mais\s+)?natural/i,
  /\besse\s+contexto\s+é\s+(delicado|sensível)/i,
  /\bminha\s+análise/i,
  /\b(provavelmente|possivelmente)\s+(separação|herança|divórcio|perda)/i,
  /\bmotivação\s+real\s+(é|seria)/i,
  /\bvou\s+seguir\s+(a\s+)?anamnese/i,
  /\b(pode\s+envolver|pode\s+ser)\s+(uma?\s+)?(separação|divórcio|herança|perda)/i,
  /\bvirada\s+de\s+vida\s+significativa/i,
  /\bsem\s+forçar\s+(nenhuma?\s+)?interpretação/i,
  /\brecomeço,\s+novo\s+lar/i,
];

/**
 * Detects if a response contains leaked internal reasoning.
 * Returns the index of the first leak pattern match, or -1 if clean.
 */
export function detectReasoningLeak(response: string): { leaked: boolean; truncateAt: number; pattern?: string } {
  for (const pattern of REASONING_LEAK_PATTERNS) {
    const match = response.match(pattern);
    if (match && match.index !== undefined) {
      console.log(`🚨 [ReasoningLeak] Detected: "${match[0]}" at index ${match.index}`);
      return { leaked: true, truncateAt: match.index, pattern: match[0] };
    }
  }
  return { leaked: false, truncateAt: -1 };
}

/**
 * Sanitizes a response by removing reasoning leak content.
 * Tries to preserve the conversational part before the leak.
 * Falls back to a qualification question if nothing remains.
 */
export function sanitizeReasoningLeak(response: string, qualData?: QualificationData | null): string {
  const detection = detectReasoningLeak(response);
  if (!detection.leaked) return response;

  // Try to keep content before the leak
  const beforeLeak = response.substring(0, detection.truncateAt).trim();

  // If there's meaningful content before the leak (>20 chars), keep it
  if (beforeLeak.length > 20) {
    console.log(`🔧 [ReasoningLeak] Truncated at index ${detection.truncateAt}, keeping ${beforeLeak.length} chars`);
    return beforeLeak;
  }

  // Otherwise, generate a contextual fallback based on what qualification data is missing
  if (!qualData?.detected_interest) {
    return 'Me conta: você está buscando um imóvel para comprar ou alugar?';
  }
  if (!qualData?.detected_property_type) {
    return 'Que tipo de imóvel você tem em mente? Apartamento, casa, terreno?';
  }
  if (!qualData?.detected_neighborhood) {
    return 'Tem preferência de bairro ou região?';
  }
  if (!qualData?.detected_budget_max) {
    return 'E qual faixa de valor você considera?';
  }
  return 'Me conta mais sobre o que você procura.';
}

const MAX_STORED_MESSAGES = 5;

// ========== FALLBACK POOLS (expanded to avoid exhaustion) ==========

const FALLBACK_POOL_QUALIFIED = [
  'Vou buscar novas opções pra você com base no que conversamos.',
  'Deixa eu procurar mais alternativas com o perfil que você descreveu.',
  'Com base no que já conversamos, vou trazer outras opções.',
  'Vou ampliar a busca pra encontrar algo ainda mais alinhado ao que você precisa.',
  'Tenho mais algumas opções que podem fazer sentido pra você. Deixa eu buscar.',
  'Vou verificar se apareceram novidades que combinem com o que você procura.',
  'Posso buscar em outras regiões similares pra aumentar as opções. Quer que eu faça isso?',
  'Vou dar uma olhada em imóveis com perfil parecido. Já volto com novidades.',
];

const FALLBACK_POOL_UNQUALIFIED = [
  'Me ajuda a entender melhor o que você procura?',
  'Pra eu buscar algo certeiro, preciso de mais alguns detalhes.',
  'Me conta mais sobre o que é importante pra você no imóvel?',
  'Qual região da cidade faz mais sentido pra você?',
  'Você tem uma faixa de valor em mente?',
  'O que é indispensável pra você no imóvel?',
  'Pra eu te ajudar da melhor forma, me conta: é pra comprar ou alugar?',
  'Me fala um pouco mais do que seria ideal pra você.',
];

const FALLBACK_POOL_REMARKETING_QUALIFIED = [
  'Vou buscar opções alinhadas ao perfil que traçamos juntos.',
  'Deixa eu procurar alternativas que façam mais sentido pro que você descreveu.',
  'Vou ampliar a busca com base no que conversamos até aqui.',
  'Tenho mais opções que podem se encaixar. Vou buscar pra você.',
  'Vou verificar novidades que combinem com o que você precisa.',
  'Posso explorar outras regiões com o mesmo perfil. Quer que eu faça isso?',
  'Vou olhar com mais cuidado o que temos disponível pra você.',
  'Deixa eu buscar com critérios um pouco mais flexíveis pra ampliar as possibilidades.',
];

const FALLBACK_POOL_REMARKETING_UNQUALIFIED = [
  'Pra eu fazer uma busca certeira, me conta um pouco mais do que você procura.',
  'Qual região da cidade faz mais sentido pra você hoje?',
  'Você já tem uma ideia do tipo de imóvel que seria ideal?',
  'Me conta: qual a faixa de valor que funciona pra você?',
  'Antes de buscar, me ajuda com mais um detalhe sobre o que você precisa.',
  'Pra eu te atender da melhor forma, preciso entender melhor suas prioridades.',
  'O que é mais importante pra você na hora de escolher o imóvel?',
  'Me fala mais sobre o que seria ideal — isso vai fazer toda a diferença na busca.',
];

// Set of all fallback texts (lowercase) for quick lookup
const ALL_FALLBACKS = new Set([
  ...FALLBACK_POOL_QUALIFIED,
  ...FALLBACK_POOL_UNQUALIFIED,
  ...FALLBACK_POOL_REMARKETING_QUALIFIED,
  ...FALLBACK_POOL_REMARKETING_UNQUALIFIED,
].map(f => f.toLowerCase().trim()));

export function isFallbackMessage(text: string): boolean {
  return ALL_FALLBACKS.has(text.toLowerCase().trim());
}

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

  if (qualificationData.detected_interest) {
    if (/comprar\s+ou\s+alugar|alugar\s+ou\s+comprar|loca[cç][aã]o\s+ou\s+venda|venda\s+ou\s+loca/i.test(lower)) {
      console.log('⚠️ Loop detected: asking interest/finalidade again');
      return true;
    }
  }

  return false;
}

// ========== CHECK REPETITIVE MESSAGES ==========

export function isRepetitiveMessage(
  aiResponse: string,
  lastAiMessages: string[],
  options?: { qualChangedThisTurn?: boolean; moduleChangedThisTurn?: boolean; userMessage?: string }
): boolean {
  if (!lastAiMessages || lastAiMessages.length === 0) return false;

  // Fix B: Se qualificação mudou neste turno OU módulo mudou, skip anti-loop.
  // Dados novos = contexto novo — a resposta pode parecer similar mas é pertinente.
  if (options?.qualChangedThisTurn) {
    console.log('ℹ️ Anti-loop: SKIP — qualificação mudou neste turno');
    return false;
  }
  if (options?.moduleChangedThisTurn) {
    console.log('ℹ️ Anti-loop: SKIP — módulo mudou neste turno');
    return false;
  }

  // Stress test 25/04 (Beatriz T3 fiador): user fez pergunta substantiva e Aimee respondeu
  // com info correta + frase de transição que ficou similar ao turno anterior. Anti-loop
  // disparou e substituiu por fallback genérico — Beatriz não recebeu resposta sobre fiador.
  // Skip anti-loop quando user fez pergunta direta (`?` no fim ou keyword interrogativa).
  if (options?.userMessage) {
    const um = options.userMessage.toLowerCase();
    const userAskedQuestion = /\?\s*$/.test(um.trim()) ||
      /\b(como|quando|por\s+que|porque|onde|qual|quais|preciso|devo|tenho\s+que|aceita|tem|posso|funciona|garantia|fiador|seguro|cartão)\b/.test(um);
    if (userAskedQuestion) {
      console.log('ℹ️ Anti-loop: SKIP — user fez pergunta direta, resposta substantiva permitida mesmo se similar');
      return false;
    }
  }

  // Never intercept responses with property details
  if (containsPropertyDetails(aiResponse)) return false;

  const normalized = aiResponse.toLowerCase().trim().slice(0, 200);

  const checkSimilarity = (a: string, b: string): number => {
    const wordsA = new Set(a.split(/\s+/));
    const wordsB = new Set(b.split(/\s+/));
    const intersection = [...wordsA].filter(w => wordsB.has(w));
    const union = new Set([...wordsA, ...wordsB]);
    return intersection.length / union.size;
  };

  // Check against recent AI messages
  for (const prev of lastAiMessages) {
    const prevNorm = prev.toLowerCase().trim().slice(0, 200);
    if (normalized === prevNorm) return true;

    const similarity = checkSimilarity(normalized, prevNorm);
    if (similarity > 0.70) {
      console.log(`⚠️ Repetitive message detected (${(similarity * 100).toFixed(0)}% similar to previous)`);
      return true;
    }
  }

  // Also check if LLM naturally generated text too similar to a fallback message
  // (prevents the LLM from producing its own version of generic fallbacks)
  if (ALL_FALLBACKS.size > 0) {
    for (const fb of ALL_FALLBACKS) {
      const similarity = checkSimilarity(normalized, fb);
      if (similarity > 0.75) {
        // Only flag if this same fallback-like message appeared in history
        for (const prev of lastAiMessages) {
          const prevSim = checkSimilarity(prev.toLowerCase().trim().slice(0, 200), fb);
          if (prevSim > 0.60) {
            console.log(`⚠️ Repetitive: LLM generated fallback-like text already seen in history`);
            return true;
          }
        }
      }
    }
  }

  return false;
}

// ========== CONTEXT-AWARE FALLBACK ==========
// When the lead has already provided data but the AI loops, generate a fallback
// that acknowledges what was collected and asks for what's STILL missing.

function buildContextAwareFallback(qualData: QualificationData): string | null {
  const known: string[] = [];
  const missing: string[] = [];

  if (qualData.detected_interest) {
    known.push(qualData.detected_interest === 'locacao' ? 'locação' : 'compra');
  } else {
    missing.push('se é pra comprar ou alugar');
  }
  if (qualData.detected_property_type) {
    known.push(qualData.detected_property_type);
  } else {
    missing.push('o tipo de imóvel');
  }
  if (qualData.detected_neighborhood) {
    known.push(`região ${qualData.detected_neighborhood}`);
  } else {
    missing.push('a região de preferência');
  }
  if (qualData.detected_budget_max) {
    known.push(`orçamento até R$ ${Number(qualData.detected_budget_max).toLocaleString('pt-BR')}`);
  } else {
    missing.push('a faixa de valor');
  }

  // Only use context-aware fallback when there's something known AND something missing
  if (known.length === 0 || missing.length === 0) return null;

  // If everything is known, prompt action instead of re-asking
  if (missing.length === 0) {
    return `Já tenho as informações que preciso: ${known.join(', ')}. Vou buscar as melhores opções pra você.`;
  }

  return `Anotado: ${known.join(', ')}. Pra eu fazer uma busca precisa, só me falta ${missing[0]}.`;
}

// ========== GET ROTATING FALLBACK (avoids ALL recent messages) ==========

export function getRotatingFallback(
  isQualified: boolean,
  lastAiMessages: string[],
  isRemarketing: boolean = false,
  qualificationData?: QualificationData | null
): string {
  // v4: Try context-aware fallback first — acknowledges what the lead already said
  if (qualificationData) {
    const contextFb = buildContextAwareFallback(qualificationData);
    if (contextFb) {
      const recentCheck = new Set(lastAiMessages.map(m => m.toLowerCase().trim().slice(0, 200)));
      if (!recentCheck.has(contextFb.toLowerCase().trim().slice(0, 200))) {
        console.log('🎯 Anti-loop: using context-aware fallback');
        return contextFb;
      }
    }
  }

  // Select the right pool based on context
  let pool: string[];
  if (isRemarketing) {
    pool = isQualified ? FALLBACK_POOL_REMARKETING_QUALIFIED : FALLBACK_POOL_REMARKETING_UNQUALIFIED;
  } else {
    pool = isQualified ? FALLBACK_POOL_QUALIFIED : FALLBACK_POOL_UNQUALIFIED;
  }

  // Build set of recent messages (lowercase) to avoid ALL of them
  const recentSet = new Set(
    lastAiMessages.map(m => m.toLowerCase().trim().slice(0, 200))
  );

  // Pick a fallback that doesn't match ANY recent message
  for (const fb of pool) {
    if (!recentSet.has(fb.toLowerCase().trim().slice(0, 200))) {
      return fb;
    }
  }

  // All fallbacks in the primary pool were used recently — try the other pool as overflow
  const overflowPool = isRemarketing
    ? (isQualified ? FALLBACK_POOL_QUALIFIED : FALLBACK_POOL_UNQUALIFIED)
    : (isQualified ? FALLBACK_POOL_REMARKETING_QUALIFIED : FALLBACK_POOL_REMARKETING_UNQUALIFIED);

  for (const fb of overflowPool) {
    if (!recentSet.has(fb.toLowerCase().trim().slice(0, 200))) {
      return fb;
    }
  }

  // Ultimate fallback: pick index based on messages count to cycle deterministically
  return pool[lastAiMessages.length % pool.length];
}

// ========== UPDATE ANTI-LOOP STATE ==========
// v3: Does NOT save fallback messages to last_ai_messages.
// Fallbacks are synthetic responses — saving them pollutes the history
// and causes the system to detect its own fallbacks as repetition.

export async function updateAntiLoopState(
  supabase: any,
  tenantId: string,
  phoneNumber: string,
  aiResponse: string
) {
  // Don't save fallback messages — they would pollute the history
  // and be detected as repetition on the next turn.
  if (isFallbackMessage(aiResponse)) {
    console.log('ℹ️ Anti-loop: skipping fallback save to last_ai_messages');
    return;
  }

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
