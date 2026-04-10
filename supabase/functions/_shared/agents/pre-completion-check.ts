// ========== PRE-COMPLETION VERIFICATION ==========
// Rule-based checklist that runs BEFORE sending AI response to the client.
// Inspired by Harness Engineering's PreCompletionChecklistMiddleware.
// No extra LLM call — purely deterministic checks.

import { AgentContext } from './agent-interface.ts';

export interface PreCheckResult {
  passed: boolean;
  hasCriticalIssue: boolean;
  issues: string[];
  sanitizedResponse: string;
}

// Internal data patterns that must NEVER reach the client
const INTERNAL_PATTERNS = [
  /\[\s*MODULO\s*:\s*[^\]\n]*?\s*\]/gi,
  /<an[aá]li[sz]e>[\s\S]*?<\/an[aá]li[sz]e>/gi,
  /<\/?an[aá]li[sz]e>/gi,
  /<invoke\s+name="an[aá]li[sz]e"[^>]*>[\s\S]*?<\/invoke>/gi,
  /<invoke\s+name="an[aá]li[sz]e"[^>]*>/gi,
  /<\/invoke>/gi,
  /tenant_id\s*[:=]\s*[0-9a-f-]{36}/gi,
  /conversation_id\s*[:=]\s*[0-9a-f-]{36}/gi,
  /\bsupabase\b.*\bfrom\b.*\bselect\b/gi,
];

// Common English words — if many appear, response may be in wrong language
const ENGLISH_MARKERS = [
  'the', 'and', 'for', 'are', 'but', 'not', 'you', 'all', 'can', 'had',
  'her', 'was', 'one', 'our', 'out', 'has', 'his', 'how', 'its', 'may',
  'would', 'could', 'should', 'about', 'which', 'their', 'there', 'these',
  'property', 'apartment', 'bedroom', 'looking', 'neighborhood', 'budget',
];

// Qualification-related keywords in user messages
const QUAL_KEYWORDS_BAIRRO = /\b(centro|ingleses|jurere|canasvieiras|campeche|cacupe|lagoa|trindade|itacorubi|coqueiros|estreito|corrego|barra da lagoa|rio tavares|santo antonio|pantanal|agronomica|saco dos limoes|ribeirao|costeira|capoeiras|kobrasol|barreiros|campinas|praia brava|lagoinha|ponta das canas|daniela|ratones|santo amaro|vargem|monte verde|saco grande)\b/i;
const QUAL_KEYWORDS_TIPO = /\b(apartamento|apto|casa|cobertura|terreno|sala comercial|loja|kitnet|studio|flat)\b/i;
const QUAL_KEYWORDS_ORCAMENTO = /\b(mil|milhao|milhoes|reais|r\$|\d{3,}[.,]\d{3})\b/i;

// Search-related words in AI responses
const SEARCH_MENTION = /\b(buscar|procurar|pesquisar|encontrar|procuro|busco|pesquiso|vou buscar|vou procurar|vou pesquisar)\b/i;

export async function runPreCompletionChecks(
  ctx: AgentContext,
  userMessage: string,
  aiResponse: string,
): Promise<PreCheckResult> {
  const issues: string[] = [];
  let sanitized = aiResponse;
  let hasCritical = false;

  // 1. Empty or too short response
  if (!aiResponse || aiResponse.trim().length < 10) {
    issues.push('EMPTY_RESPONSE: resposta vazia ou muito curta');
  }

  // 2. Internal data leaking (CRITICAL — sanitize)
  for (const pattern of INTERNAL_PATTERNS) {
    if (pattern.test(sanitized)) {
      hasCritical = true;
      issues.push(`INTERNAL_LEAK: padrão interno detectado: ${pattern.source.slice(0, 40)}`);
      sanitized = sanitized.replace(pattern, '').replace(/\n{3,}/g, '\n\n').trim();
    }
    // Reset lastIndex for global regexes
    pattern.lastIndex = 0;
  }

  // 3. Wrong language detection (PT-BR expected)
  const words = aiResponse.toLowerCase().split(/\s+/);
  if (words.length > 15) {
    const englishCount = words.filter(w => ENGLISH_MARKERS.includes(w)).length;
    const englishRatio = englishCount / words.length;
    if (englishRatio > 0.25) {
      issues.push(`WRONG_LANGUAGE: ${Math.round(englishRatio * 100)}% palavras em inglês detectadas`);
    }
  }

  // 4. Qualification data in user message but not acknowledged
  const userHasBairro = QUAL_KEYWORDS_BAIRRO.test(userMessage);
  const userHasTipo = QUAL_KEYWORDS_TIPO.test(userMessage);
  const userHasOrcamento = QUAL_KEYWORDS_ORCAMENTO.test(userMessage);
  const userHasQualData = userHasBairro || userHasTipo || userHasOrcamento;

  if (userHasQualData && aiResponse.length > 20) {
    // Check if response acknowledges at least one qualification keyword
    const responseAcknowledges =
      QUAL_KEYWORDS_BAIRRO.test(aiResponse) ||
      QUAL_KEYWORDS_TIPO.test(aiResponse) ||
      QUAL_KEYWORDS_ORCAMENTO.test(aiResponse) ||
      /\b(anotei|anotado|entendi|registrei|perfeito|ótimo|certo|beleza)\b/i.test(aiResponse);

    if (!responseAcknowledges) {
      issues.push('QUAL_IGNORED: usuário informou dados de qualificação mas resposta não reconheceu');
    }
  }

  // 5. Qualified lead without search offer
  const qualScore = ctx.qualificationData?.qualification_score || 0;
  const searchExecuted = ctx.toolsExecuted?.includes('buscar_imoveis');
  if (qualScore >= 60 && !searchExecuted && !SEARCH_MENTION.test(aiResponse)) {
    issues.push(`QUAL_NO_SEARCH: lead qualificado (score=${qualScore}) mas busca não oferecida`);
  }

  // 6. Anti-hallucination: if buscar_imoveis was called, validate that prices/types
  //    mentioned in the response match actual pending_properties.
  if (searchExecuted) {
    const priceMatches = sanitized.match(/(?:R\$\s*|por\s+)(\d[\d.,]*)\s*(mil(?:hões|hão)?|milh[oõ]es|reais)?/gi);
    if (priceMatches && priceMatches.length > 0) {
      // Try to load pending_properties from conversation_states
      try {
        const { data: convState } = await ctx.supabase
          .from('conversation_states')
          .select('pending_properties')
          .eq('tenant_id', ctx.tenantId)
          .eq('phone_number', ctx.phoneNumber)
          .maybeSingle();

        const pendingProps = convState?.pending_properties;
        if (pendingProps && Array.isArray(pendingProps) && pendingProps.length > 0) {
          const realPrices = pendingProps.map((p: any) => p.preco || p.price || 0);

          for (const match of priceMatches) {
            const numericValue = parsePriceFromText(match);
            if (numericValue > 0) {
              const matchesAnyReal = realPrices.some((rp: number) => {
                if (rp === 0) return false;
                const ratio = numericValue / rp;
                return ratio >= 0.5 && ratio <= 2.0; // 50%-200% tolerance
              });
              if (!matchesAnyReal) {
                hasCritical = true;
                issues.push(`FABRICATED_PRICE: preço mencionado (${match.trim()}) não corresponde a nenhum imóvel real. Preços reais: ${realPrices.map((p: number) => `R$ ${p.toLocaleString('pt-BR')}`).join(', ')}`);
                // Replace the fabricated response with a safe fallback
                sanitized = `Encontrei algumas opções na região que você pediu! Vou te mandar os detalhes agora.`;
                break;
              }
            }
          }
        }
      } catch (e) {
        console.warn('⚠️ [PRE-CHECK] Erro ao verificar pending_properties:', e);
      }
    }
  }

  if (issues.length > 0) {
    console.log(`🔍 [PRE-CHECK] ${issues.length} issue(s):`, issues);
  }

  return {
    passed: issues.length === 0,
    hasCriticalIssue: hasCritical,
    issues,
    sanitizedResponse: sanitized,
  };
}

// Helper: extract numeric price value from text like "R$ 3.500.000" or "três milhões"
function parsePriceFromText(text: string): number {
  const clean = text.replace(/R\$\s*/g, '').replace(/\s+/g, ' ').trim();

  // "3.500.000" or "3,5 milhões" or "350 mil"
  const milhoes = clean.match(/([\d.,]+)\s*milh[oõ](?:es|ão|ões)/i);
  if (milhoes) {
    return parseFloat(milhoes[1].replace(/\./g, '').replace(',', '.')) * 1_000_000;
  }

  const mil = clean.match(/([\d.,]+)\s*mil/i);
  if (mil) {
    return parseFloat(mil[1].replace(/\./g, '').replace(',', '.')) * 1_000;
  }

  // Direct numeric: "3.500.000" or "15.000"
  const direct = clean.match(/([\d.]+(?:,\d+)?)/);
  if (direct) {
    const num = direct[1].replace(/\./g, '').replace(',', '.');
    return parseFloat(num);
  }

  return 0;
}
