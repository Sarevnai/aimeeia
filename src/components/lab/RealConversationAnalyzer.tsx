import React, { useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { supabase } from '@/integrations/supabase/client';
import { Play, Loader2, RotateCcw } from 'lucide-react';
import RealConversationThread from './RealConversationThread';
import { AnalysisPanel } from './AnalysisPanel';
import AnalysisReportHistory from './AnalysisReportHistory';
import AnalysisComparison from './AnalysisComparison';

interface Message {
  id: number;
  direction: 'inbound' | 'outbound';
  body: string | null;
  sender_type: string | null;
  created_at: string | null;
}

interface Report {
  id: string;
  version: number;
  avg_score: number | null;
  min_score: number | null;
  max_score: number | null;
  total_turns: number;
  is_production_ready: boolean;
  error_patterns: Record<string, number> | null;
  recommendations: string | null;
  created_at: string;
}

interface TurnAnalysis {
  turn_number: number;
  score: number;
  criteria: any[];
  errors: any[];
  summary: string;
  sender_type: string;
}

interface RealConversationAnalyzerProps {
  tenantId: string;
  conversationId: string;
  messages: Message[];
  messagesLoading: boolean;
  onAnalysisComplete?: () => void;
}

export default function RealConversationAnalyzer({
  tenantId,
  conversationId,
  messages,
  messagesLoading,
  onAnalysisComplete,
}: RealConversationAnalyzerProps) {
  const [analyzing, setAnalyzing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [reports, setReports] = useState<Report[]>([]);
  const [selectedReportId, setSelectedReportId] = useState<string | null>(null);
  const [turnAnalyses, setTurnAnalyses] = useState<TurnAnalysis[]>([]);
  const [selectedTurn, setSelectedTurn] = useState<number | null>(null);
  const [reportsLoading, setReportsLoading] = useState(false);
  const [showComparison, setShowComparison] = useState(false);

  // Load existing reports for this conversation
  const loadReports = useCallback(async () => {
    setReportsLoading(true);
    const { data } = await supabase
      .from('analysis_reports')
      .select('*')
      .eq('conversation_id', conversationId)
      .order('version', { ascending: false });

    const typedData = (data || []) as Report[];
    setReports(typedData);
    if (typedData.length > 0 && !selectedReportId) {
      setSelectedReportId(typedData[0].id);
      await loadTurnAnalyses(typedData[0].id);
    }
    setReportsLoading(false);
  }, [conversationId, selectedReportId]);

  // Load turn analyses for a specific report
  const loadTurnAnalyses = useCallback(async (reportId: string) => {
    const { data } = await supabase
      .from('conversation_analyses')
      .select('*')
      .eq('report_id', reportId)
      .order('turn_number', { ascending: true });

    setTurnAnalyses((data || []) as TurnAnalysis[]);
    setSelectedTurn(null);
  }, []);

  // Run analysis
  const handleAnalyze = useCallback(async () => {
    setAnalyzing(true);
    setProgress(10);

    try {
      const { data, error } = await supabase.functions.invoke('ai-agent-analyze-batch', {
        body: { tenant_id: tenantId, conversation_id: conversationId },
      });

      if (error) throw error;

      setProgress(100);

      // Reload reports
      await loadReports();
      onAnalysisComplete?.();
    } catch (err) {
      console.error('Analysis error:', err);
    } finally {
      setAnalyzing(false);
      setProgress(0);
    }
  }, [tenantId, conversationId, loadReports, onAnalysisComplete]);

  // Select a report version
  const handleSelectReport = useCallback(async (reportId: string) => {
    setSelectedReportId(reportId);
    await loadTurnAnalyses(reportId);
    setShowComparison(false);
  }, [loadTurnAnalyses]);

  // Load reports on mount / conversation change
  React.useEffect(() => {
    if (conversationId) loadReports();
  }, [conversationId]);

  const selectedAnalysis = selectedTurn != null
    ? turnAnalyses.find(ta => ta.turn_number === selectedTurn)
    : null;

  // Aggregate analysis for overview (when no turn selected)
  const selectedReport = reports.find(r => r.id === selectedReportId);

  const overviewAnalysis = selectedReport && turnAnalyses.length > 0 ? {
    score: selectedReport.avg_score || 0,
    maxScore: 10,
    criteria: aggregateCriteria(turnAnalyses),
    errors: turnAnalyses.flatMap(ta => (ta.errors || []).map((e: any) => ({ ...e, turn: ta.turn_number }))),
    summary: selectedReport.recommendations || '',
    loading: false,
  } : null;

  const currentAnalysis = selectedAnalysis ? {
    score: selectedAnalysis.score,
    maxScore: 10,
    criteria: selectedAnalysis.criteria,
    errors: selectedAnalysis.errors,
    summary: selectedAnalysis.summary,
    loading: false,
  } : overviewAnalysis;

  return (
    <div className="flex h-full overflow-hidden">
      {/* Main: Thread */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Toolbar */}
        <div className="flex items-center gap-2 px-3 py-2 border-b bg-muted/20 shrink-0">
          <Button
            size="sm"
            onClick={handleAnalyze}
            disabled={analyzing || messages.length === 0}
            className="h-7 text-xs gap-1.5"
          >
            {analyzing ? (
              <><Loader2 className="h-3 w-3 animate-spin" /> Analisando...</>
            ) : (
              <><Play className="h-3 w-3" /> Analisar Conversa</>
            )}
          </Button>

          {reports.length >= 2 && (
            <Button
              size="sm"
              variant={showComparison ? 'default' : 'outline'}
              onClick={() => setShowComparison(!showComparison)}
              className="h-7 text-xs gap-1.5"
            >
              Comparar Versoes
            </Button>
          )}

          {selectedTurn && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setSelectedTurn(null)}
              className="h-7 text-xs gap-1"
            >
              <RotateCcw className="h-3 w-3" /> Ver Geral
            </Button>
          )}

          {analyzing && (
            <div className="flex-1 max-w-xs">
              <Progress value={progress} className="h-1.5" />
            </div>
          )}

          {selectedTurn && (
            <span className="text-xs text-muted-foreground ml-auto">Turno {selectedTurn}/{turnAnalyses.length}</span>
          )}
        </div>

        {/* Thread or Comparison */}
        {showComparison && reports.length >= 2 ? (
          <AnalysisComparison
            reportA={reports[1]}
            reportB={reports[0]}
            onClose={() => setShowComparison(false)}
          />
        ) : (
          <RealConversationThread
            messages={messages}
            loading={messagesLoading}
            turnAnalyses={turnAnalyses.map(ta => ({
              turn_number: ta.turn_number,
              score: ta.score,
              summary: ta.summary,
            }))}
            selectedTurn={selectedTurn}
            onTurnSelect={setSelectedTurn}
          />
        )}
      </div>

      {/* Sidebar: Analysis */}
      <div className="w-64 border-l overflow-y-auto shrink-0 bg-muted/10">
        <div className="p-3 space-y-3">
          {/* Report History */}
          <AnalysisReportHistory
            reports={reports}
            selectedReportId={selectedReportId}
            onSelectReport={handleSelectReport}
            loading={reportsLoading}
          />

          {/* Analysis Panel */}
          {currentAnalysis ? (
            <AnalysisPanel
              score={currentAnalysis.score}
              maxScore={currentAnalysis.maxScore}
              criteria={currentAnalysis.criteria}
              errors={currentAnalysis.errors}
              summary={currentAnalysis.summary}
              loading={analyzing}
            />
          ) : (
            <div className="text-xs text-muted-foreground text-center py-8">
              {messages.length > 0
                ? 'Clique em "Analisar Conversa" para iniciar'
                : 'Selecione uma conversa'}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Aggregate criteria across all turns (average each criterion).
 */
function aggregateCriteria(turnAnalyses: TurnAnalysis[]): any[] {
  if (turnAnalyses.length === 0) return [];

  const criteriaMap = new Map<string, { total: number; count: number; comments: string[] }>();

  for (const ta of turnAnalyses) {
    for (const c of (ta.criteria || [])) {
      const existing = criteriaMap.get(c.name) || { total: 0, count: 0, comments: [] };
      existing.total += c.score;
      existing.count += 1;
      if (c.comment && c.comment !== 'N/A — critério não aplicável neste turno') {
        existing.comments.push(`T${ta.turn_number}: ${c.comment}`);
      }
      criteriaMap.set(c.name, existing);
    }
  }

  return Array.from(criteriaMap.entries()).map(([name, data]) => ({
    name,
    score: Math.round((data.total / data.count) * 10) / 10,
    comment: data.comments.length > 0 ? data.comments[data.comments.length - 1] : 'N/A',
  }));
}
