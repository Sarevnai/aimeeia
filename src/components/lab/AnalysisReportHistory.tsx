import React from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { FileText, TrendingUp, TrendingDown, Minus } from 'lucide-react';

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

interface AnalysisReportHistoryProps {
  reports: Report[];
  selectedReportId: string | null;
  onSelectReport: (reportId: string) => void;
  loading: boolean;
}

function getScoreColor(score: number): string {
  if (score >= 9) return 'text-green-600';
  if (score >= 7) return 'text-yellow-600';
  if (score >= 5) return 'text-orange-600';
  return 'text-red-600';
}

function getDelta(current: Report, previous: Report | undefined): { value: number; icon: React.ReactNode } | null {
  if (!previous || current.avg_score == null || previous.avg_score == null) return null;
  const delta = current.avg_score - previous.avg_score;
  if (Math.abs(delta) < 0.1) return { value: 0, icon: <Minus className="h-3 w-3 text-muted-foreground" /> };
  if (delta > 0) return { value: delta, icon: <TrendingUp className="h-3 w-3 text-green-500" /> };
  return { value: delta, icon: <TrendingDown className="h-3 w-3 text-red-500" /> };
}

export default function AnalysisReportHistory({
  reports,
  selectedReportId,
  onSelectReport,
  loading,
}: AnalysisReportHistoryProps) {
  if (loading) return <div className="text-xs text-muted-foreground p-2">Carregando...</div>;
  if (reports.length === 0) return null;

  return (
    <div className="space-y-1">
      <h4 className="text-xs font-semibold text-muted-foreground px-1">Versoes do Report</h4>
      {reports.map((report, idx) => {
        const prev = idx < reports.length - 1 ? reports[idx + 1] : undefined;
        const delta = getDelta(report, prev);
        const isSelected = selectedReportId === report.id;
        const totalErrors = report.error_patterns
          ? Object.values(report.error_patterns).reduce((a, b) => a + b, 0)
          : 0;

        return (
          <button
            key={report.id}
            onClick={() => onSelectReport(report.id)}
            className={cn(
              'w-full text-left px-2 py-1.5 rounded-md text-xs transition-colors',
              isSelected ? 'bg-primary/10 border border-primary/20' : 'hover:bg-muted'
            )}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <FileText className="h-3 w-3 text-muted-foreground" />
                <span className="font-medium">v{report.version}</span>
                {report.avg_score != null && (
                  <span className={cn('font-mono font-bold', getScoreColor(report.avg_score))}>
                    {report.avg_score.toFixed(1)}
                  </span>
                )}
                {delta && (
                  <span className="flex items-center gap-0.5">
                    {delta.icon}
                    <span className={cn('text-[10px] font-mono', delta.value > 0 ? 'text-green-500' : delta.value < 0 ? 'text-red-500' : 'text-muted-foreground')}>
                      {delta.value > 0 ? '+' : ''}{delta.value.toFixed(1)}
                    </span>
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1">
                {report.is_production_ready && (
                  <Badge className="text-[9px] px-1 py-0 h-3.5 bg-green-100 text-green-700">OK</Badge>
                )}
                {totalErrors > 0 && (
                  <Badge variant="destructive" className="text-[9px] px-1 py-0 h-3.5">
                    {totalErrors} erros
                  </Badge>
                )}
              </div>
            </div>
            <div className="text-[10px] text-muted-foreground mt-0.5">
              {report.total_turns} turnos &middot; {new Date(report.created_at).toLocaleDateString('pt-BR')}
            </div>
          </button>
        );
      })}
    </div>
  );
}
