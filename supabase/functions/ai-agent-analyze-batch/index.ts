// ========== AIMEE.iA - AI AGENT ANALYZE BATCH ==========
// Analyzes an entire real conversation (all turns) using GPT 5.4 Mini (OpenAI).
// Groups messages into turns, runs analysis on each AI response,
// creates a versioned analysis_report with aggregated scores.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getSupabaseClient, corsHeaders, corsResponse, jsonResponse, errorResponse } from '../_shared/supabase.ts';
import { buildAnalysisUserMessage, callAnalysis } from '../_shared/analyze.ts';
import type { AnalysisResult } from '../_shared/analyze.ts';

interface Turn {
  turn_number: number;
  user_message: string;
  ai_response: string;
  sender_type: 'ai' | 'operator';
}

/**
 * Groups raw messages into analyzable turns.
 * Consecutive customer messages are merged into one.
 * Each AI/operator response becomes one turn.
 */
function groupMessagesIntoTurns(messages: any[]): Turn[] {
  const turns: Turn[] = [];
  let pendingCustomerMessages: string[] = [];
  let turnNumber = 0;

  for (const msg of messages) {
    if (msg.direction === 'inbound') {
      // Customer message - accumulate
      if (msg.body) pendingCustomerMessages.push(msg.body);
    } else if (msg.direction === 'outbound' && msg.body) {
      // AI or operator response
      const senderType = msg.sender_type === 'operator' ? 'operator' : 'ai';

      // Only analyze if there's a preceding customer message (or it's the first message like a template)
      const userMessage = pendingCustomerMessages.length > 0
        ? pendingCustomerMessages.join('\n')
        : '(mensagem inicial do agente / template)';

      turnNumber++;
      turns.push({
        turn_number: turnNumber,
        user_message: userMessage,
        ai_response: msg.body,
        sender_type: senderType,
      });

      pendingCustomerMessages = [];
    }
  }

  return turns;
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return corsResponse();

  try {
    const { tenant_id, conversation_id } = await req.json();

    if (!tenant_id || !conversation_id) {
      return errorResponse('Missing tenant_id or conversation_id', 400);
    }

    const supabase = getSupabaseClient();

    // 1. Load conversation metadata
    const { data: conversation, error: convError } = await supabase
      .from('conversations')
      .select('id, phone_number, department_code, source, status')
      .eq('id', conversation_id)
      .eq('tenant_id', tenant_id)
      .single();

    if (convError || !conversation) {
      return errorResponse(`Conversa não encontrada: ${convError?.message || 'not found'}`, 404);
    }

    // 2. Load all messages
    const { data: messages, error: msgError } = await supabase
      .from('messages')
      .select('id, direction, body, sender_type, sender_id, created_at')
      .eq('conversation_id', conversation_id)
      .eq('tenant_id', tenant_id)
      .order('created_at', { ascending: true });

    if (msgError || !messages?.length) {
      return errorResponse(`Sem mensagens: ${msgError?.message || 'vazio'}`, 404);
    }

    // 3. Load qualification data
    const { data: qualification } = await supabase
      .from('lead_qualification')
      .select('*')
      .eq('phone_number', conversation.phone_number)
      .eq('tenant_id', tenant_id)
      .maybeSingle();

    // 4. Load agent config
    const { data: agentConfig } = await supabase
      .from('ai_agent_config')
      .select('agent_name, tone')
      .eq('tenant_id', tenant_id)
      .maybeSingle();

    // 5. Group messages into turns
    const turns = groupMessagesIntoTurns(messages);

    if (turns.length === 0) {
      return errorResponse('Nenhum turno analisável encontrado', 400);
    }

    // 6. Determine next version
    const { data: existingReports } = await supabase
      .from('analysis_reports')
      .select('version')
      .eq('conversation_id', conversation_id)
      .order('version', { ascending: false })
      .limit(1);

    const nextVersion = (existingReports?.[0]?.version || 0) + 1;

    // 7. Create the report
    const { data: report, error: reportError } = await supabase
      .from('analysis_reports')
      .insert({
        tenant_id,
        conversation_id,
        version: nextVersion,
        source: conversation.source === 'simulation' ? 'simulation' : 'real',
        flow_type: conversation.department_code || 'vendas',
        total_turns: turns.length,
      })
      .select('id')
      .single();

    if (reportError || !report) {
      return errorResponse(`Erro ao criar report: ${reportError?.message}`, 500);
    }

    // 8. Analyze each turn
    const analyses: (AnalysisResult & { turn_number: number; sender_type: string })[] = [];
    const conversationHistory: { role: string; content: string }[] = [];

    for (const turn of turns) {
      // Build conversation history up to this point
      const analysis = await callAnalysis(
        buildAnalysisUserMessage({
          conversation_history: [...conversationHistory],
          current_turn: {
            user_message: turn.user_message,
            ai_response: turn.ai_response,
            qualification: qualification || undefined,
          },
          flow_type: conversation.department_code || 'vendas',
          agent_config: agentConfig ? { agent_name: agentConfig.agent_name, tone: agentConfig.tone } : undefined,
          turn_number: turn.turn_number,
        })
      );

      // Persist per-turn analysis
      await supabase.from('conversation_analyses').insert({
        tenant_id,
        report_id: report.id,
        turn_number: turn.turn_number,
        user_message: turn.user_message,
        ai_response: turn.ai_response,
        sender_type: turn.sender_type,
        action: 'ai_response',
        score: analysis.score,
        criteria: analysis.criteria,
        errors: analysis.errors || [],
        summary: analysis.summary,
      });

      analyses.push({ ...analysis, turn_number: turn.turn_number, sender_type: turn.sender_type });

      // Update conversation history for next turn
      conversationHistory.push(
        { role: 'user', content: turn.user_message },
        { role: 'assistant', content: turn.ai_response }
      );

      // Small delay to respect rate limits (Gemini free tier)
      if (turn.turn_number < turns.length) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }

    // 9. Compute aggregates
    const scores = analyses.filter(a => a.score > 0).map(a => a.score);
    const avgScore = scores.length > 0
      ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10
      : 0;
    const minScore = scores.length > 0 ? Math.round(Math.min(...scores) * 10) / 10 : 0;
    const maxScore = scores.length > 0 ? Math.round(Math.max(...scores) * 10) / 10 : 0;

    // Count error patterns
    const errorPatterns: Record<string, number> = {};
    for (const a of analyses) {
      for (const err of (a.errors || [])) {
        const key = err.type || 'unknown';
        errorPatterns[key] = (errorPatterns[key] || 0) + 1;
      }
    }

    // Generate recommendations
    const allErrors = analyses.flatMap(a => a.errors || []);
    const highErrors = allErrors.filter(e => e.severity === 'high');
    const recommendations = highErrors.length > 0
      ? `Priorizar correção de ${highErrors.length} erro(s) críticos: ${[...new Set(highErrors.map(e => e.type))].join(', ')}.`
      : avgScore >= 9.0
        ? 'Conversa com qualidade de produção. Manter padrão atual.'
        : `Score médio ${avgScore}/10. Revisar critérios com scores baixos.`;

    // 10. Update report with aggregates
    await supabase
      .from('analysis_reports')
      .update({
        avg_score: avgScore,
        min_score: minScore,
        max_score: maxScore,
        is_production_ready: minScore >= 9.0,
        error_patterns: errorPatterns,
        recommendations,
      })
      .eq('id', report.id);

    // 11. Return complete report
    return jsonResponse({
      report_id: report.id,
      version: nextVersion,
      conversation_id,
      total_turns: turns.length,
      avg_score: avgScore,
      min_score: minScore,
      max_score: maxScore,
      is_production_ready: minScore >= 9.0,
      error_patterns: errorPatterns,
      recommendations,
      analyses: analyses.map(a => ({
        turn_number: a.turn_number,
        sender_type: a.sender_type,
        score: a.score,
        criteria: a.criteria,
        errors: a.errors,
        summary: a.summary,
      })),
    });

  } catch (error) {
    console.error('❌ Batch analysis error:', error);
    return errorResponse((error as Error).message);
  }
});
