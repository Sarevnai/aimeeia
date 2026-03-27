import React, { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { X, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { cn } from '@/lib/utils';

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
  criteria: { name: string; score: number; comment: string }[];
  errors: { type: string; severity: string; description: string }[];
  summary: string;
}

interface AnalysisComparisonProps {
  reportA: Report; // older version
  reportB: Report; // newer version
  onClose: () => void;
}

function getScoreColor(score: number): string {
  if (score >= 9) return 'text-green-600';
  if (score >= 7) return 'text-yellow-600';
  if (score >= 5) return 'text-orange-600';
  return 'text-red-600';
}

function getDeltaIcon(delta: number) {
  if (Math.abs(delta) < 0.1) return <Minus className="h-3 w-3 text-muted-foreground" />;
  if (delta > 0) return <TrendingUp className="h-3 w-3 text-green-500" />;
  return <TrendingDown className="h-3 w-3 text-red-500" />;
}

export default function AnalysisComparison({ reportA, reportB, onClose }: AnalysisComparisonProps) {
  const [analysesA, setAnalysesA] = useState<TurnAnalysis[]>([]);
  const [analysesB, setAnalysesB] = useState<TurnAnalysis[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const [resA, resB] = await Promise.all([
        supabase.from('conversation_analyses').select('*').eq('report_id', reportA.id).order('turn_number'),
        supabase.from('conversation_analyses').select('*').eq('report_id', reportB.id).order('turn_number'),
      ]);
      setAnalysesA((resA.data || []) as TurnAnalysis[]);
      setAnalysesB((resB.data || []) as TurnAnalysis[]);
      setLoading(false);
    }
    load();
  }, [reportA.id, reportB.id]);

  if (loading) {
    return <div className="flex-1 flex items-center justify-center text-xs text-muted-foreground">Carregando comparacao...</div>;
  }

  // Aggregate criteria for each version
  const criteriaA = aggregateCriteria(analysesA);
  const criteriaB = aggregateCriteria(analysesB);

  const scoreA = reportA.avg_score || 0;
  const scoreB = reportB.avg_score || 0;
  const delta = scoreB - scoreA;

  // Error count comparison
  const errorsA = analysesA.flatMap(a => a.errors || []);
  const errorsB = analysesB.flatMap(a => a.errors || []);

  return (
    <div className="flex-1 overflow-y-auto p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold">Comparacao v{reportA.version} vs v{reportB.version}</h3>
        <Button size="sm" variant="ghost" onClick={onClose} className="h-6 w-6 p-0">
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Score Overview */}
      <div className="grid grid-cols-3 gap-3 mb-4">
        <div className="bg-muted/50 rounded-lg p-3 text-center">
          <div className="text-[10px] text-muted-foreground mb-1">v{reportA.version}</div>
          <div className={cn('text-xl font-bold font-mono', getScoreColor(scoreA))}>{scoreA.toFixed(1)}</div>
          <div className="text-[10px] text-muted-foreground">{errorsA.length} erros</div>
        </div>
        <div className="flex flex-col items-center justify-center">
          {getDeltaIcon(delta)}
          <span className={cn('text-sm font-mono font-bold', delta > 0 ? 'text-green-600' : delta < 0 ? 'text-red-600' : 'text-muted-foreground')}>
            {delta > 0 ? '+' : ''}{delta.toFixed(1)}
          </span>
        </div>
        <div className="bg-muted/50 rounded-lg p-3 text-center">
          <div className="text-[10px] text-muted-foreground mb-1">v{reportB.version}</div>
          <div className={cn('text-xl font-bold font-mono', getScoreColor(scoreB))}>{scoreB.toFixed(1)}</div>
          <div className="text-[10px] text-muted-foreground">{errorsB.length} erros</div>
        </div>
      </div>

      {/* Criteria Comparison */}
      <div className="space-y-1.5">
        <h4 className="text-xs font-semibold text-muted-foreground">Criterios</h4>
        {criteriaB.map((cb) => {
          const ca = criteriaA.find(c => c.name === cb.name);
          const d = ca ? cb.score - ca.score : 0;

          return (
            <div key={cb.name} className="flex items-center gap-2 text-xs">
              <span className="w-36 truncate text-muted-foreground">{cb.name}</span>
              <span className={cn('w-8 text-right font-mono', ca ? getScoreColor(ca.score) : 'text-muted-foreground')}>
                {ca ? ca.score.toFixed(1) : '-'}
              </span>
              <span className="text-muted-foreground">→</span>
              <span className={cn('w-8 text-right font-mono', getScoreColor(cb.score))}>
                {cb.score.toFixed(1)}
              </span>
              <span className="flex items-center gap-0.5 w-12">
                {getDeltaIcon(d)}
                <span className={cn('text-[10px] font-mono', d > 0 ? 'text-green-500' : d < 0 ? 'text-red-500' : 'text-muted-foreground')}>
                  {d > 0 ? '+' : ''}{d.toFixed(1)}
                </span>
              </span>
            </div>
          );
        })}
      </div>

      {/* Error Diff */}
      <div className="mt-4 space-y-1.5">
        <h4 className="text-xs font-semibold text-muted-foreground">Erros</h4>

        {errorsB.length === 0 && errorsA.length === 0 ? (
          <div className="text-xs text-muted-foreground">Nenhum erro em ambas versoes</div>
        ) : (
          <>
            {/* Errors resolved (in A but not B) */}
            {errorsA.filter(ea => !errorsB.some(eb => eb.type === ea.type)).map((e, i) => (
              <div key={`resolved-${i}`} className="flex items-start gap-1.5 text-xs">
                <Badge className="bg-green-100 text-green-700 text-[9px] px-1 py-0 h-4 shrink-0">RESOLVIDO</Badge>
                <span className="text-muted-foreground">{e.type}: {e.description}</span>
              </div>
            ))}

            {/* Errors persisting */}
            {errorsB.filter(eb => errorsA.some(ea => ea.type === eb.type)).map((e, i) => (
              <div key={`persist-${i}`} className="flex items-start gap-1.5 text-xs">
                <Badge variant="outline" className="text-[9px] px-1 py-0 h-4 shrink-0">PERSISTE</Badge>
                <span className="text-muted-foreground">{e.type}: {e.description}</span>
              </div>
            ))}

            {/* New errors (in B but not A) */}
            {errorsB.filter(eb => !errorsA.some(ea => ea.type === eb.type)).map((e, i) => (
              <div key={`new-${i}`} className="flex items-start gap-1.5 text-xs">
                <Badge variant="destructive" className="text-[9px] px-1 py-0 h-4 shrink-0">NOVO</Badge>
                <span className="text-muted-foreground">{e.type}: {e.description}</span>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}

function aggregateCriteria(analyses: TurnAnalysis[]) {
  if (analyses.length === 0) return [];
  const map = new Map<string, { total: number; count: number }>();
  for (const ta of analyses) {
    for (const c of (ta.criteria || [])) {
      const existing = map.get(c.name) || { total: 0, count: 0 };
      existing.total += c.score;
      existing.count += 1;
      map.set(c.name, existing);
    }
  }
  return Array.from(map.entries()).map(([name, data]) => ({
    name,
    score: Math.round((data.total / data.count) * 10) / 10,
  }));
}
