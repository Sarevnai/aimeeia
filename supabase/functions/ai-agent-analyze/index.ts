// ========== AIMEE.iA - AI AGENT ANALYZE ==========
// Analyzes simulation turns using Google Gemini via REST API.
// Returns a 0-10 score with detailed criteria breakdown and error detection.
// Used by the AI Lab to validate agent quality before production.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getSupabaseClient, corsHeaders, corsResponse, jsonResponse, errorResponse } from '../_shared/supabase.ts';

interface AnalysisCriterion {
  name: string;
  score: 0 | 1;
  comment: string;
  severity?: 'high' | 'medium' | 'low';
}

interface AnalysisError {
  type: string;
  severity: 'high' | 'medium' | 'low';
  description: string;
  suggestion: string;
  affected_file?: string;
}

interface AnalysisResult {
  score: number;
  max_score: number;
  criteria: AnalysisCriterion[];
  errors: AnalysisError[];
  summary: string;
  is_production_ready: boolean;
}

const ANALYSIS_SYSTEM_PROMPT = `Você é um avaliador especialista de agentes de IA conversacionais para o mercado imobiliário brasileiro. Sua função é analisar cada turno de uma conversa simulada e atribuir uma pontuação de qualidade de 0 a 10.

CRITÉRIOS DE AVALIAÇÃO (cada um vale 1 ponto):

1. NATURALIDADE — A resposta soa como uma pessoa real conversando por WhatsApp? O tom é adequado à configuração (friendly/professional)? Sem linguagem robótica?

2. ADEQUAÇÃO AO MÓDULO — Se um módulo está ativo (anamnese, busca-imoveis, contrato-parceria, etc.), a resposta segue as instruções daquele módulo? Está no escopo correto?

3. EXTRAÇÃO DE DADOS — Se o cliente mencionou informações de qualificação (bairro, tipo de imóvel, orçamento, quartos, prazo), elas foram detectadas e registradas corretamente? Algum dado foi perdido?

4. PROGRESSÃO DO FLUXO — O fluxo avançou corretamente? (triage → qualificação → busca → handoff). Não ficou preso em loop? Não pulou etapas?

5. CONSISTÊNCIA — A resposta não contradiz informações anteriores da conversa? Não inventou dados que o cliente não forneceu?

6. COMPLETUDE — Respondeu ao que o cliente perguntou ou pediu? Não ignorou a mensagem? Não desviou do assunto?

7. GUARDRAILS — Não inventou imóveis, preços ou características? Não prometeu o que não pode cumprir? Não saiu do escopo imobiliário?

8. APRESENTAÇÃO DE IMÓVEIS — (se aplicável, caso contrário dê 1) O imóvel apresentado condiz com os critérios do cliente? O caption é personalizado e não genérico?

9. HANDOFF — (se aplicável, caso contrário dê 1) O handoff ocorreu no momento certo? O dossiê está completo? Se não houve handoff, o agente manteve a conversa sem encaminhar prematuramente?

10. FORMATAÇÃO — Mensagem no tamanho adequado para WhatsApp? Sem emojis excessivos? Sem formatação quebrada? Sem listas quando deveria ser texto corrido?

REGRAS:
- Se um critério não se aplica ao turno (ex: "Apresentação de Imóveis" quando não houve busca), dê score 1 automaticamente e comente "N/A — critério não aplicável neste turno".
- Seja rigoroso mas justo. Score 10 significa PERFEITO.
- Para cada critério com score 0, OBRIGATORIAMENTE inclua um objeto em "errors" com: type, severity, description detalhada, suggestion de como corrigir, e affected_file se souber qual arquivo do backend causa o problema.
- Arquivos comuns de problemas: qualification.ts (extração), triage.ts (fluxo de triage), comercial.ts/admin.ts/remarketing.ts (agentes), prompts.ts (system prompt), tool-executors.ts (busca/handoff).

RESPONDA EXCLUSIVAMENTE em JSON válido, sem markdown, sem backticks. O formato exato:
{
  "score": <0-10>,
  "max_score": 10,
  "criteria": [
    {"name": "Naturalidade", "score": <0|1>, "comment": "..."},
    {"name": "Adequação ao Módulo", "score": <0|1>, "comment": "..."},
    {"name": "Extração de Dados", "score": <0|1>, "comment": "...", "severity": "high|medium|low"},
    {"name": "Progressão do Fluxo", "score": <0|1>, "comment": "..."},
    {"name": "Consistência", "score": <0|1>, "comment": "..."},
    {"name": "Completude", "score": <0|1>, "comment": "..."},
    {"name": "Guardrails", "score": <0|1>, "comment": "..."},
    {"name": "Apresentação de Imóveis", "score": <0|1>, "comment": "..."},
    {"name": "Handoff", "score": <0|1>, "comment": "..."},
    {"name": "Formatação", "score": <0|1>, "comment": "..."}
  ],
  "errors": [
    {"type": "...", "severity": "high|medium|low", "description": "...", "suggestion": "...", "affected_file": "..."}
  ],
  "summary": "Resumo de 1-2 frases da avaliação geral.",
  "is_production_ready": <true|false>
}`;

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return corsResponse();

  try {
    const {
      tenant_id,
      conversation_id,
      run_id,
      conversation_history,
      current_turn,
      flow_type,
      agent_config,
      turn_number,
    } = await req.json();

    if (!tenant_id || !conversation_id || !current_turn) {
      return errorResponse('Missing required fields', 400);
    }

    // Use Google Gemini API key
    const apiKey = Deno.env.get('GOOGLE_API_KEY') || Deno.env.get('GEMINI_API_KEY');
    if (!apiKey) {
      return errorResponse('Google API key not configured (GOOGLE_API_KEY or GEMINI_API_KEY)', 500);
    }

    // Build analysis context
    const historyText = (conversation_history || [])
      .map((m: any) => `${m.role === 'user' ? 'CLIENTE' : 'AGENTE'}: ${m.content}`)
      .join('\n');

    const turnContext = [
      `MENSAGEM DO CLIENTE: ${current_turn.user_message}`,
      `RESPOSTA DO AGENTE: ${current_turn.ai_response}`,
      `AÇÃO: ${current_turn.action || 'ai_response'}`,
      current_turn.triage_stage ? `TRIAGE STAGE: ${current_turn.triage_stage}` : null,
      current_turn.active_module ? `MÓDULO ATIVO: ${current_turn.active_module.name} (${current_turn.active_module.slug})` : null,
      current_turn.qualification ? `QUALIFICAÇÃO: ${JSON.stringify(current_turn.qualification)}` : null,
      current_turn.tools_executed?.length > 0 ? `TOOLS EXECUTADAS: ${current_turn.tools_executed.join(', ')}` : null,
      current_turn.property_cards?.length > 0 ? `IMÓVEIS APRESENTADOS: ${current_turn.property_cards.map((p: any) => `${p.tipo} em ${p.bairro} - ${p.preco_formatado}`).join('; ')}` : null,
    ].filter(Boolean).join('\n');

    const agentInfo = agent_config ? [
      `NOME DO AGENTE: ${agent_config.agent_name || 'Aimee'}`,
      `TOM: ${agent_config.tone || 'friendly'}`,
      agent_config.custom_instructions ? `INSTRUÇÕES CUSTOM: ${agent_config.custom_instructions.slice(0, 300)}` : null,
    ].filter(Boolean).join('\n') : '';

    const userMessage = `FLUXO: ${flow_type || 'vendas'}
TURNO: ${turn_number || 1}

${agentInfo}

--- HISTÓRICO DA CONVERSA ---
${historyText || '(primeiro turno)'}

--- TURNO ATUAL ---
${turnContext}

Analise este turno e retorne a avaliação em JSON.`;

    // Call Google Gemini via REST API
    // Use gemini-2.0-flash-lite: fastest, cheapest, sufficient for evaluation tasks
    const geminiModel = 'gemini-2.0-flash-lite';
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${apiKey}`;

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: ANALYSIS_SYSTEM_PROMPT }] },
        contents: [{ role: 'user', parts: [{ text: userMessage }] }],
        generationConfig: {
          maxOutputTokens: 2000,
          temperature: 0.3,
          responseMimeType: 'application/json',
        },
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('Gemini API error:', error);
      return jsonResponse({
        score: 0,
        max_score: 10,
        criteria: [],
        errors: [{ type: 'api_error', severity: 'high', description: `Gemini API error: ${response.status}`, suggestion: 'Verificar API key e modelo', affected_file: 'ai-agent-analyze/index.ts' }],
        summary: `Erro na API de análise (${response.status}). Verifique a configuração.`,
        is_production_ready: false,
      });
    }

    const data = await response.json();

    // --- Robust text extraction from Gemini response ---
    // Gemini 2.5 models return thinking parts (thought: true) before actual content.
    // With responseMimeType: 'application/json', the JSON is in non-thought parts.
    const parts = data.candidates?.[0]?.content?.parts || [];

    // Strategy 1: Get all non-thought text parts
    const nonThoughtParts = parts.filter((p: any) => !p.thought && p.text);
    // Strategy 2: If no non-thought parts, try all text parts
    const textParts = nonThoughtParts.length > 0 ? nonThoughtParts : parts.filter((p: any) => p.text);
    // Combine all text (some models split JSON across multiple parts)
    const rawText = textParts.map((p: any) => p.text).join('').trim();

    console.log('[analyze] Model response length:', rawText.length, 'parts:', parts.length, 'nonThought:', nonThoughtParts.length);

    if (!rawText) {
      console.error('[analyze] Empty response. Full data:', JSON.stringify(data).slice(0, 1000));
      return jsonResponse({
        score: 0,
        max_score: 10,
        criteria: [],
        errors: [{ type: 'empty_response', severity: 'high', description: 'Resposta vazia do modelo de análise', suggestion: 'Verificar modelo e prompt', affected_file: 'ai-agent-analyze/index.ts' }],
        summary: 'Modelo retornou resposta vazia.',
        is_production_ready: false,
      });
    }

    // --- Robust JSON parsing with multiple fallback strategies ---
    let analysis: AnalysisResult;
    try {
      // Strategy 1: Direct parse (responseMimeType should give clean JSON)
      analysis = JSON.parse(rawText);
    } catch (_e1) {
      try {
        // Strategy 2: Strip markdown code fences
        let jsonStr = rawText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
        analysis = JSON.parse(jsonStr);
      } catch (_e2) {
        try {
          // Strategy 3: Extract JSON object from text (find first { to last })
          const firstBrace = rawText.indexOf('{');
          const lastBrace = rawText.lastIndexOf('}');
          if (firstBrace !== -1 && lastBrace > firstBrace) {
            const jsonStr = rawText.slice(firstBrace, lastBrace + 1);
            analysis = JSON.parse(jsonStr);
          } else {
            throw new Error('No JSON object found');
          }
        } catch (_e3) {
          try {
            // Strategy 4: Sanitize control chars inside string values and retry
            let jsonStr = rawText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
            const firstBrace = jsonStr.indexOf('{');
            const lastBrace = jsonStr.lastIndexOf('}');
            if (firstBrace !== -1 && lastBrace > firstBrace) {
              jsonStr = jsonStr.slice(firstBrace, lastBrace + 1);
            }
            // Replace unescaped control chars inside JSON strings
            jsonStr = jsonStr.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, '');
            // Fix unescaped newlines/tabs inside string values
            jsonStr = jsonStr.replace(/(?<=":[\s]*"[^"]*)\n/g, '\\n');
            jsonStr = jsonStr.replace(/(?<=":[\s]*"[^"]*)\t/g, '\\t');
            analysis = JSON.parse(jsonStr);
          } catch (finalErr) {
            console.error('[analyze] All parse strategies failed. Raw:', rawText.slice(0, 500));
            analysis = {
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
    }

    // Persist analysis to DB
    const supabase = getSupabaseClient();
    await supabase.from('simulation_analyses').insert({
      tenant_id,
      run_id: run_id || null,
      conversation_id,
      flow_type: flow_type || 'vendas',
      turn_number: turn_number || 1,
      user_message: current_turn.user_message,
      ai_response: current_turn.ai_response,
      action: current_turn.action || 'ai_response',
      score: analysis.score,
      criteria: analysis.criteria,
      errors: analysis.errors || [],
      summary: analysis.summary,
    });

    // Update run stats if run_id provided
    if (run_id) {
      const { data: allAnalyses } = await supabase
        .from('simulation_analyses')
        .select('score')
        .eq('run_id', run_id);

      if (allAnalyses && allAnalyses.length > 0) {
        const scores = allAnalyses.map((a: any) => a.score);
        const avgScore = scores.reduce((a: number, b: number) => a + b, 0) / scores.length;
        const minScore = Math.min(...scores);

        await supabase
          .from('simulation_runs')
          .update({
            total_turns: scores.length,
            avg_score: Math.round(avgScore * 10) / 10,
            min_score: minScore,
            is_perfect: minScore === 10,
          })
          .eq('id', run_id);
      }
    }

    return jsonResponse(analysis);

  } catch (error) {
    console.error('❌ Analysis error:', error);
    return errorResponse((error as Error).message);
  }
});
