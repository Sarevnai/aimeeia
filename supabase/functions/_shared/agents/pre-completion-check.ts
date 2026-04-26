// ========== PRE-COMPLETION VERIFICATION ==========
// Rule-based checklist that runs BEFORE sending AI response to the client.
// Inspired by Harness Engineering's PreCompletionChecklistMiddleware.
// No extra LLM call — purely deterministic checks.

import { AgentContext } from './agent-interface.ts';
import { stripDashes, stripTourLinks, numeralizeMonetaryAndMetric } from '../utils.ts';

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

// Common English words — used to detect response language
const ENGLISH_MARKERS = [
  'the', 'and', 'for', 'are', 'but', 'not', 'you', 'all', 'can', 'had',
  'her', 'was', 'one', 'our', 'out', 'has', 'his', 'how', 'its', 'may',
  'would', 'could', 'should', 'about', 'which', 'their', 'there', 'these',
  'property', 'apartment', 'bedroom', 'looking', 'neighborhood', 'budget',
];

// Common Portuguese words — used to detect when client is clearly writing in PT-BR
const PORTUGUESE_MARKERS = [
  'você', 'voce', 'não', 'nao', 'está', 'esta', 'é', 'com', 'para', 'pra',
  'uma', 'meu', 'minha', 'seu', 'sua', 'tem', 'que', 'mas', 'também', 'tambem',
  'muito', 'bom', 'quero', 'gostaria', 'preciso', 'obrigado', 'obrigada',
  'apartamento', 'casa', 'bairro', 'quartos', 'aluguel', 'compra', 'venda',
];

function ratioOfMarkers(text: string, markers: string[]): number {
  const words = text.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return 0;
  const hit = words.filter(w => markers.includes(w)).length;
  return hit / words.length;
}

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

  // 1. Empty / too short / truncated response (CRITICAL — blocks send)
  // Incidente A-03 (20/04 21:54): LLM enviou "Olá, Roberto" sozinho como
  // última mensagem, sem nenhuma continuação. 12 chars passava no antigo
  // threshold de 10, mas a resposta era claramente incompleta — uma vocativa
  // de abertura sem corpo. Se o caller manda isso ao cliente, Smolka perde
  // credibilidade com um proprietário de 8 anos esperando resposta sobre
  // repasse atrasado. Agora bloqueamos como crítico com fallback seguro.
  //
  // Stress test 25/04 (Beatriz T6/T7): regra `endsMidClause` com threshold 80 chars
  // estava sanitizando respostas curtas LEGÍTIMAS tipo "Não precisa de fiador, temos
  // outras opções:" como se fossem truncamento. Lead idoso de pergunta substantiva
  // perdia atendimento. Threshold reduzido pra 30 chars + safety net pra despedidas.
  const trimmedResponse = (aiResponse || '').trim();
  const isEmpty = trimmedResponse.length < 10;
  const looksLikeNakedGreeting = /^(ol[áa]|oi|bom\s+dia|boa\s+tarde|boa\s+noite|e\s+a[ií]|opa|prezad[oa]|sr\.?|sra\.?|senhor\s*a?)\s*[,.!?]?\s*[a-záàâãéêíóôõú\s.-]{2,40}\s*[!.]?\s*$/i
    .test(trimmedResponse) && trimmedResponse.length < 40;
  // Mid-clause REAL: termina em vírgula/dois-pontos E é muito curto (< 30 chars).
  // Acima disso é provavelmente uma resposta legítima curta (ex: "Não, fiador não é obrigatório, temos outras opções:")
  const endsMidClause = /[,;:]\s*$/.test(trimmedResponse) && trimmedResponse.length < 30;

  // Pós-handoff: despedida curta ("Obrigada, até breve!") é esperada e NÃO é truncamento.
  // Não aplicar fallback "me perdi aqui" porque o handoff já executou e reinvocaria a Aimee.
  const handoffJustExecuted = ctx.toolsExecuted?.some(t =>
    t === 'enviar_lead_c2s' || t === 'executar_handoff' || t === 'encaminhar_humano' || t === 'transferir_administrativo'
  );

  // Safety net: se cliente está se DESPEDINDO ("vou pensar", "ligo depois", "tchau", "obrigad"),
  // resposta curta da Aimee é apropriada. Não substituir por fallback "me perdi aqui".
  // Caso Clelia 25/04: "Obrigado por esta procurando, mas a casa que procuro é pé na areia..."
  // batia em obrigad[oa] e silenciava a Aimee. Polidez antes de uma correção/continuação
  // ("mas|porém|só que|na verdade") NÃO é despedida — não pode ativar a safety net.
  const userClosingMatch = /\b(vou\s+pensar|ligo\s+(amanh|depois|outro)|tchau|valeu|obrigad[oa]|at[eé]\s+(mais|breve|logo)|fica\s+pra\s+pr[oó]xima|outra\s+hora|n[aã]o\s+tenho\s+pressa)\b/i.test(userMessage || '');
  const userHasContinuation = /\b(mas|por[eé]m|contudo|todavia|entretanto|s[oó]\s+que|na\s+verdade|por[eé]m)\b/i.test(userMessage || '');
  const userIsClosing = userClosingMatch && !userHasContinuation;

  if ((isEmpty || looksLikeNakedGreeting || endsMidClause) && !handoffJustExecuted && !userIsClosing) {
    hasCritical = true;
    const reason = isEmpty ? 'vazia ou curta demais'
      : looksLikeNakedGreeting ? 'apenas saudação sem conteúdo (provável truncamento do LLM)'
      : 'termina em vírgula ou dois-pontos (provável corte mid-clause)';
    issues.push(`TRUNCATED_RESPONSE: ${reason} — "${trimmedResponse.slice(0, 60)}"`);
    sanitized = 'Desculpe, me perdi aqui. Pode repetir sua última mensagem que eu te respondo direitinho?';
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

  // 3. Language mismatch — só flaga quando a última mensagem do cliente é
  //    claramente em português mas a resposta caiu em inglês (regressão),
  //    para não penalizar respostas legítimas em inglês/espanhol/russo/chinês
  //    quando o cliente estrangeiro escreveu no próprio idioma.
  const responseWords = aiResponse.toLowerCase().split(/\s+/).filter(Boolean);
  if (responseWords.length > 15) {
    const userMsgPtRatio = ratioOfMarkers(userMessage || '', PORTUGUESE_MARKERS);
    const userMsgEnRatio = ratioOfMarkers(userMessage || '', ENGLISH_MARKERS);
    const userWrotePortuguese = userMsgPtRatio > 0.15 && userMsgPtRatio > userMsgEnRatio;

    if (userWrotePortuguese) {
      const englishRatio = ratioOfMarkers(aiResponse, ENGLISH_MARKERS);
      if (englishRatio > 0.25) {
        issues.push(`WRONG_LANGUAGE: cliente escreveu em português mas resposta tem ${Math.round(englishRatio * 100)}% palavras em inglês`);
      }
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

  // 4b. Bug #2 fix: Property mentioned WITHOUT property_search tool call
  const searchExecutedEarly = ctx.toolsExecuted?.includes('buscar_imoveis');
  if (!searchExecutedEarly) {
    // Check if response mentions a specific property (code, price, bedrooms in property context)
    const mentionsProperty = /(?:apartamento|casa|cobertura|terreno|imóvel|garden|studio)\s+(?:no|na|em|de|do)\s+/i.test(sanitized)
      && /(?:R\$\s*\d|quartos?|dormitório|suíte|m²|vagas?|código|cód)/i.test(sanitized);

    if (mentionsProperty) {
      hasCritical = true;
      issues.push('FABRICATED_PROPERTY: resposta descreve imóvel específico sem ter chamado buscar_imoveis');
      sanitized = 'Entendi seu interesse! Me conte mais sobre o que você busca — região, tipo de imóvel e faixa de valor — pra eu encontrar as melhores opções pra você.';
    }
  }

  // 4c. Bug #6+#7 fix: Template leak and metadata leak
  const LEAK_PATTERNS = [
    /\[Template:\s*[^\]]+\]/gi,
    /\bAÇÃO\b\s*[:=]/gi,
    /\bQUALIFICAÇÃO\b\s*[:=]/gi,
    /\bMÓDULO\b\s*[:=]/gi,
    /\btool_call\b/gi,
    /\bfunction_call\b/gi,
  ];
  for (const pat of LEAK_PATTERNS) {
    if (pat.test(sanitized)) {
      issues.push(`METADATA_LEAK: padrão interno vazou: ${pat.source.slice(0, 30)}`);
      sanitized = sanitized.replace(pat, '').replace(/\n{3,}/g, '\n\n').trim();
    }
    pat.lastIndex = 0;
  }

  // 4d. Naturalização: travessão é marca de texto IA. Brasileiro em WhatsApp não usa.
  // Lógica extraída pra _shared/utils.ts:stripDashes — também aplicada em
  // send-wa-message direto desde caso Terezinha (2026-04-25).
  const dashResult = stripDashes(sanitized);
  if (dashResult.count > 0) {
    sanitized = dashResult.sanitized;
    issues.push(`STYLE_DASH_REMOVED: ${dashResult.count} travessão(ões) substituído(s) por pontuação natural`);
  }

  // 4e. Tour virtual NUNCA pode ir pro cliente (decisão Ian, caso Terezinha
  // 2026-04-25). YouTube/Vimeo/Matterport/etc. são bloqueados em qualquer
  // resposta da Aimee.
  const tourResult = stripTourLinks(sanitized);
  if (tourResult.count > 0) {
    sanitized = tourResult.sanitized;
    issues.push(`STYLE_TOUR_LINKS_REMOVED: ${tourResult.count} link(s) de tour virtual removido(s)`);
  }

  // 4f. Valores monetários e medidas por extenso → numeral. Caso Erick
  // (2026-04-26): caption do card "R$ 3.200.000,00" + descrição "três milhões
  // e duzentos mil reais" na mesma mensagem é inconsistência de redação que
  // dificulta cliente comparar preços e soa não-profissional. Regra primária
  // tá no buildHumanStyleDirective; este é safety net determinístico.
  const moneyResult = numeralizeMonetaryAndMetric(sanitized);
  if (moneyResult.count > 0) {
    sanitized = moneyResult.sanitized;
    issues.push(`STYLE_MONEY_NUMERALIZED: ${moneyResult.count} valor(es) por extenso convertido(s) em numeral`);
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
