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

export function runPreCompletionChecks(
  ctx: AgentContext,
  userMessage: string,
  aiResponse: string,
): PreCheckResult {
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
