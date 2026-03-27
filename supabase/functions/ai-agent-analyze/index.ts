// ========== AIMEE.iA - AI AGENT ANALYZE ==========
// Analyzes simulation/real turns using GPT 5.4 Mini (OpenAI).
// Returns a 0-10 score with detailed criteria breakdown and error detection.
// Used by the AI Lab to validate agent quality before production.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getSupabaseClient, corsHeaders, corsResponse, jsonResponse, errorResponse } from '../_shared/supabase.ts';
import { buildAnalysisUserMessage, callAnalysis } from '../_shared/analyze.ts';
import type { AnalysisResult } from '../_shared/analyze.ts';

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

    // Build analysis context and call OpenAI
    const userMessage = buildAnalysisUserMessage({
      conversation_history,
      current_turn,
      flow_type,
      agent_config,
      turn_number,
    });

    const analysis: AnalysisResult = await callAnalysis(userMessage);

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
            min_score: Math.round(minScore * 10) / 10,
            is_perfect: minScore >= 9.0,
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
