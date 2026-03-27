// ========== AIMEE.iA - SHARED ANALYSIS MODULE ==========
// Shared AI analysis logic used by both ai-agent-analyze (per-turn)
// and ai-agent-analyze-batch (full conversation).
// Model: GPT 5.4 Mini (OpenAI)

export interface AnalysisCriterion {
  name: string;
  score: number; // 1-10
  comment: string;
  severity?: 'high' | 'medium' | 'low';
}

export interface AnalysisError {
  type: string;
  severity: 'high' | 'medium' | 'low';
  description: string;
  suggestion: string;
  affected_file?: string;
}

export interface AnalysisResult {
  score: number;
  max_score: number;
  criteria: AnalysisCriterion[];
  errors: AnalysisError[];
  summary: string;
  is_production_ready: boolean;
}

export interface TurnContext {
  user_message: string;
  ai_response: string;
  action?: string;
  triage_stage?: string;
  active_module?: { name: string; slug: string } | null;
  qualification?: Record<string, any>;
  tools_executed?: string[];
  property_cards?: any[];
}

export interface AnalysisInput {
  conversation_history?: { role: string; content: string }[];
  current_turn: TurnContext;
  flow_type?: string;
  agent_config?: { agent_name?: string; tone?: string; custom_instructions?: string };
  turn_number?: number;
}

export const ANALYSIS_SYSTEM_PROMPT = `Você é um avaliador especialista de agentes de IA conversacionais para o mercado imobiliário brasileiro. Sua função é analisar cada turno de uma conversa e atribuir uma pontuação de qualidade para cada critério.

CRITÉRIOS DE AVALIAÇÃO (cada um recebe nota de 1 a 10):

1. NATURALIDADE — A resposta soa como uma pessoa real conversando por WhatsApp? O tom é adequado à configuração (friendly/professional)? Sem linguagem robótica?
   - 10: Indistinguível de humano, tom perfeito
   - 7-9: Natural com pequenas falhas de tom ou expressão
   - 4-6: Parcialmente robótico ou tom desalinhado
   - 1-3: Muito artificial, robótico ou tom totalmente inadequado

2. ADEQUAÇÃO AO MÓDULO — Se um módulo está ativo (anamnese, busca-imoveis, contrato-parceria, etc.), a resposta segue as instruções daquele módulo? Está no escopo correto?
   - 10: Segue perfeitamente o módulo ativo
   - 7-9: Segue o módulo com desvios menores
   - 4-6: Parcialmente fora do escopo do módulo
   - 1-3: Ignora completamente o módulo ativo

3. EXTRAÇÃO DE DADOS — Se o cliente mencionou informações de qualificação (bairro, tipo de imóvel, orçamento, quartos, prazo), elas foram detectadas e registradas corretamente? Algum dado foi perdido?
   - 10: Todos os dados extraídos corretamente
   - 7-9: Extraiu maioria dos dados, perdeu detalhes menores
   - 4-6: Perdeu dados importantes ou extraiu incorretamente
   - 1-3: Falhou em extrair dados críticos fornecidos pelo cliente

4. PROGRESSÃO DO FLUXO — O fluxo avançou corretamente? (triage → qualificação → busca → handoff). Não ficou preso em loop? Não pulou etapas?
   - 10: Progressão perfeita e natural
   - 7-9: Progrediu bem com hesitação menor
   - 4-6: Progrediu mas com atraso ou repetição parcial
   - 1-3: Preso em loop, pulou etapas ou regrediu

5. CONSISTÊNCIA — A resposta não contradiz informações anteriores da conversa? Não inventou dados que o cliente não forneceu?
   - 10: Totalmente consistente com o histórico
   - 7-9: Consistente com imprecisões menores
   - 4-6: Contradição menor ou dado levemente distorcido
   - 1-3: Contradição grave ou inventou informações

6. COMPLETUDE — Respondeu ao que o cliente perguntou ou pediu? Não ignorou a mensagem? Não desviou do assunto?
   - 10: Respondeu completamente a tudo que foi perguntado
   - 7-9: Respondeu a maioria, faltou um detalhe
   - 4-6: Resposta parcial ou desviou parcialmente
   - 1-3: Ignorou a pergunta ou desviou completamente

7. GUARDRAILS — Não inventou imóveis, preços ou características? Não prometeu o que não pode cumprir? Não saiu do escopo imobiliário?
   - 10: Guardrails perfeitos, nenhuma fabricação
   - 7-9: Guardrails bons, talvez uma imprecisão leve
   - 4-6: Fabricou ou prometeu algo questionável
   - 1-3: Inventou informações ou fez promessas falsas

8. APRESENTAÇÃO DE IMÓVEIS — (se não aplicável, dê 10) O imóvel apresentado condiz com os critérios do cliente? O caption é personalizado e não genérico?
   - 10: Imóveis perfeitamente filtrados, captions personalizados (ou N/A)
   - 7-9: Bons imóveis, captions poderiam ser melhores
   - 4-6: Imóveis parcialmente desalinhados ou captions genéricos
   - 1-3: Imóveis totalmente fora dos critérios do cliente

9. HANDOFF — (se não aplicável, dê 10) O handoff ocorreu no momento certo? O dossiê está completo? Se não houve handoff, o agente manteve a conversa sem encaminhar prematuramente?
   - 10: Handoff no momento perfeito com dossiê completo (ou N/A)
   - 7-9: Handoff bom, dossiê com falhas menores
   - 4-6: Handoff prematuro/tardio ou dossiê incompleto
   - 1-3: Handoff totalmente errado ou dossiê inútil

10. FORMATAÇÃO — Mensagem no tamanho adequado para WhatsApp? Sem emojis excessivos? Sem formatação quebrada? Sem listas quando deveria ser texto corrido?
   - 10: Formatação perfeita para WhatsApp
   - 7-9: Boa formatação com falhas menores
   - 4-6: Mensagem longa demais ou formatação inadequada
   - 1-3: Formatação totalmente quebrada ou ilegível

REGRAS:
- Cada critério recebe nota de 1 a 10 (nunca 0).
- Se um critério não se aplica ao turno (ex: "Apresentação de Imóveis" quando não houve busca), dê score 10 e comente "N/A — critério não aplicável neste turno".
- O score final é a MÉDIA ARITMÉTICA das notas dos 10 critérios, arredondada para 1 casa decimal.
- Seja rigoroso mas justo. Score 10.0 significa PERFEITO em todos os critérios.
- Para cada critério com score <= 5, OBRIGATORIAMENTE inclua um objeto em "errors" com: type, severity, description detalhada, suggestion de como corrigir, e affected_file se souber qual arquivo do backend causa o problema.
- Para critérios com score 6-7, inclua em "errors" com severity "low" se houver algo relevante a melhorar.
- Arquivos comuns de problemas: qualification.ts (extração), triage.ts (fluxo de triage), comercial.ts/admin.ts/remarketing.ts (agentes), prompts.ts (system prompt), tool-executors.ts (busca/handoff).

RESPONDA EXCLUSIVAMENTE em JSON válido, sem markdown, sem backticks. O formato exato:
{
  "score": <média aritmética dos 10 critérios, 1 casa decimal>,
  "max_score": 10,
  "criteria": [
    {"name": "Naturalidade", "score": <1-10>, "comment": "..."},
    {"name": "Adequação ao Módulo", "score": <1-10>, "comment": "..."},
    {"name": "Extração de Dados", "score": <1-10>, "comment": "...", "severity": "high|medium|low"},
    {"name": "Progressão do Fluxo", "score": <1-10>, "comment": "..."},
    {"name": "Consistência", "score": <1-10>, "comment": "..."},
    {"name": "Completude", "score": <1-10>, "comment": "..."},
    {"name": "Guardrails", "score": <1-10>, "comment": "..."},
    {"name": "Apresentação de Imóveis", "score": <1-10>, "comment": "..."},
    {"name": "Handoff", "score": <1-10>, "comment": "..."},
    {"name": "Formatação", "score": <1-10>, "comment": "..."}
  ],
  "errors": [
    {"type": "...", "severity": "high|medium|low", "description": "...", "suggestion": "...", "affected_file": "..."}
  ],
  "summary": "Resumo de 1-2 frases da avaliação geral.",
  "is_production_ready": <true se score >= 9.0, false caso contrário>
}`;

/**
 * Build the user message that will be sent to Gemini for analysis.
 */
export function buildAnalysisUserMessage(input: AnalysisInput): string {
  const { conversation_history, current_turn, flow_type, agent_config, turn_number } = input;

  const historyText = (conversation_history || [])
    .map((m) => `${m.role === 'user' ? 'CLIENTE' : 'AGENTE'}: ${m.content}`)
    .join('\n');

  const turnContext = [
    `MENSAGEM DO CLIENTE: ${current_turn.user_message}`,
    `RESPOSTA DO AGENTE: ${current_turn.ai_response}`,
    `AÇÃO: ${current_turn.action || 'ai_response'}`,
    current_turn.triage_stage ? `TRIAGE STAGE: ${current_turn.triage_stage}` : null,
    current_turn.active_module ? `MÓDULO ATIVO: ${current_turn.active_module.name} (${current_turn.active_module.slug})` : null,
    current_turn.qualification ? `QUALIFICAÇÃO: ${JSON.stringify(current_turn.qualification)}` : null,
    current_turn.tools_executed?.length ? `TOOLS EXECUTADAS: ${current_turn.tools_executed.join(', ')}` : null,
    current_turn.property_cards?.length ? `IMÓVEIS APRESENTADOS: ${current_turn.property_cards.map((p: any) => `${p.tipo} em ${p.bairro} - ${p.preco_formatado}`).join('; ')}` : null,
  ].filter(Boolean).join('\n');

  const agentInfo = agent_config ? [
    `NOME DO AGENTE: ${agent_config.agent_name || 'Aimee'}`,
    `TOM: ${agent_config.tone || 'friendly'}`,
    agent_config.custom_instructions ? `INSTRUÇÕES CUSTOM: ${agent_config.custom_instructions.slice(0, 300)}` : null,
  ].filter(Boolean).join('\n') : '';

  return `FLUXO: ${flow_type || 'vendas'}
TURNO: ${turn_number || 1}

${agentInfo}

--- HISTÓRICO DA CONVERSA ---
${historyText || '(primeiro turno)'}

--- TURNO ATUAL ---
${turnContext}

Analise este turno e retorne a avaliação em JSON.`;
}

/**
 * Call OpenAI API (GPT 5.4 Mini) and return the analysis result.
 */
export async function callAnalysis(userMessage: string): Promise<AnalysisResult> {
  const apiKey = Deno.env.get('OPENAI_API_KEY');
  if (!apiKey) {
    throw new Error('OpenAI API key not configured (OPENAI_API_KEY)');
  }

  const model = 'gpt-5.4-mini';
  const endpoint = 'https://api.openai.com/v1/chat/completions';

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: ANALYSIS_SYSTEM_PROMPT },
        { role: 'user', content: userMessage },
      ],
      temperature: 0.3,
      max_tokens: 8192,
      response_format: { type: 'json_object' },
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    console.error('OpenAI API error:', error);
    return {
      score: 0,
      max_score: 10,
      criteria: [],
      errors: [{ type: 'api_error', severity: 'high', description: `OpenAI API error: ${response.status}`, suggestion: 'Verificar API key e modelo', affected_file: 'ai-agent-analyze/index.ts' }],
      summary: `Erro na API de análise (${response.status}). Verifique a configuração.`,
      is_production_ready: false,
    };
  }

  const data = await response.json();
  return parseAnalysisResponse(data);
}

/** @deprecated Use callAnalysis instead */
export const callGeminiAnalysis = callAnalysis;

/**
 * Parse OpenAI response into AnalysisResult.
 */
export function parseAnalysisResponse(data: any): AnalysisResult {
  const rawText = data.choices?.[0]?.message?.content || '';

  console.log('[analyze] Model response length:', rawText.length);

  if (!rawText) {
    console.error('[analyze] Empty response. Full data:', JSON.stringify(data).slice(0, 1000));
    return {
      score: 0,
      max_score: 10,
      criteria: [],
      errors: [{ type: 'empty_response', severity: 'high', description: 'Resposta vazia do modelo de análise', suggestion: 'Verificar modelo e prompt', affected_file: 'ai-agent-analyze/index.ts' }],
      summary: 'Modelo retornou resposta vazia.',
      is_production_ready: false,
    };
  }

  try {
    return JSON.parse(rawText);
  } catch (_e) {
    // Fallback: extract JSON object from string
    try {
      const firstBrace = rawText.indexOf('{');
      const lastBrace = rawText.lastIndexOf('}');
      if (firstBrace !== -1 && lastBrace > firstBrace) {
        return JSON.parse(rawText.slice(firstBrace, lastBrace + 1));
      }
      throw new Error('No JSON object found');
    } catch (finalErr) {
      console.error('[analyze] Parse failed. Raw:', rawText.slice(0, 500));
      return {
        score: 0,
        max_score: 10,
        criteria: [],
        errors: [{ type: 'parse_error', severity: 'high', description: 'Falha ao parsear resposta do avaliador', suggestion: 'Verificar formato do response', affected_file: 'ai-agent-analyze/index.ts' }],
        summary: rawText.slice(0, 200),
        is_production_ready: false,
      };
    }
  }
}

/** @deprecated Use parseAnalysisResponse instead */
export const parseGeminiResponse = parseAnalysisResponse;
