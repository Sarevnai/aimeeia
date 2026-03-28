import React, { useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { BarChart3, AlertCircle, CheckCircle2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

interface RunSummary {
  id: string;
  tenant_id: string;
  flow_type: string;
  total_turns: number;
  avg_score: number;
  min_score: number;
  is_perfect: boolean;
  created_at: string;
}

interface ReportSummary {
  id: string;
  conversation_id: string;
  version: number;
  source: string;
  flow_type: string;
  total_turns: number;
  avg_score: number | null;
  min_score: number | null;
  max_score: number | null;
  is_production_ready: boolean;
  error_patterns: Record<string, number> | null;
  recommendations: string | null;
  created_at: string;
}

function scoreColor(score: number | null) {
  if (score == null) return 'text-muted-foreground';
  if (score >= 9) return 'text-green-600';
  if (score >= 7) return 'text-yellow-600';
  if (score >= 5) return 'text-orange-600';
  return 'text-red-600';
}

function errorCount(patterns: Record<string, number> | null) {
  if (!patterns) return 0;
  return Object.values(patterns).reduce((a, b) => a + b, 0);
}

export default function LabAnalysisPage() {
  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [reports, setReports] = useState<ReportSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const [runsRes, reportsRes] = await Promise.all([
        supabase
          .from('simulation_runs')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(50),
        supabase
          .from('analysis_reports')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(50),
      ]);
      setRuns((runsRes.data as RunSummary[]) || []);
      setReports((reportsRes.data as ReportSummary[]) || []);
      setLoading(false);
    })();
  }, []);

  const realReports = reports.filter(r => r.source !== 'simulation');
  const simReports = reports.filter(r => r.source === 'simulation');

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center gap-3">
        <BarChart3 className="h-5 w-5 text-primary" />
        <h1 className="text-lg font-semibold">Historico de Analises</h1>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Carregando...</p>
      ) : (
        <Tabs defaultValue="real" className="w-full">
          <TabsList>
            <TabsTrigger value="real" className="text-xs">
              Atendimentos Reais ({realReports.length})
            </TabsTrigger>
            <TabsTrigger value="simulation" className="text-xs">
              Simulacoes ({runs.length + simReports.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="real" className="space-y-2 mt-3">
            {realReports.length === 0 ? (
              <Card>
                <CardContent className="py-8 text-center text-muted-foreground text-sm">
                  Nenhuma analise de atendimento real. Va em "Atendimentos Reais" e clique "Analisar Conversa".
                </CardContent>
              </Card>
            ) : (
              realReports.map(report => {
                const errors = errorCount(report.error_patterns);
                return (
                  <Card key={report.id}>
                    <CardContent className="py-3 px-4 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <Badge variant="outline" className="text-xs">{report.flow_type}</Badge>
                        <span className="text-xs font-mono text-muted-foreground">
                          {report.conversation_id.slice(0, 8)}...
                        </span>
                        <Badge variant="secondary" className="text-[10px]">v{report.version}</Badge>
                        <span className="text-sm">{report.total_turns} turnos</span>
                        <span className="text-xs text-muted-foreground">
                          {new Date(report.created_at).toLocaleDateString('pt-BR')}
                        </span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className={`text-sm font-medium ${scoreColor(report.avg_score)}`}>
                          Media: {report.avg_score ?? '—'}
                        </span>
                        <span className={`text-sm ${scoreColor(report.min_score)}`}>
                          Min: {report.min_score ?? '—'}
                        </span>
                        {errors > 0 && (
                          <Badge variant="destructive" className="text-[10px] gap-1">
                            <AlertCircle className="h-3 w-3" />
                            {errors} erro{errors > 1 ? 's' : ''}
                          </Badge>
                        )}
                        {report.is_production_ready && (
                          <Badge className="text-[10px] bg-emerald-100 text-emerald-800 gap-1">
                            <CheckCircle2 className="h-3 w-3" />
                            Producao
                          </Badge>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                );
              })
            )}
          </TabsContent>

          <TabsContent value="simulation" className="space-y-2 mt-3">
            {runs.length === 0 && simReports.length === 0 ? (
              <Card>
                <CardContent className="py-8 text-center text-muted-foreground text-sm">
                  Nenhuma simulacao registrada. Use o Simulador para gerar analises.
                </CardContent>
              </Card>
            ) : (
              <>
                {runs.map(run => (
                  <Card key={run.id}>
                    <CardContent className="py-3 px-4 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <Badge variant="outline" className="text-xs">{run.flow_type}</Badge>
                        <span className="text-sm">{run.total_turns} turnos</span>
                        <span className="text-xs text-muted-foreground">
                          {new Date(run.created_at).toLocaleDateString('pt-BR')}
                        </span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className={`text-sm ${scoreColor(run.avg_score)}`}>
                          Media: {run.avg_score}
                        </span>
                        <span className={`text-sm ${scoreColor(run.min_score)}`}>
                          Min: {run.min_score}
                        </span>
                        {run.is_perfect && (
                          <Badge className="text-xs bg-emerald-100 text-emerald-800">Perfeito</Badge>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
                {simReports.map(report => (
                  <Card key={report.id}>
                    <CardContent className="py-3 px-4 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <Badge variant="outline" className="text-xs">{report.flow_type}</Badge>
                        <Badge variant="secondary" className="text-[10px]">v{report.version}</Badge>
                        <span className="text-sm">{report.total_turns} turnos</span>
                        <span className="text-xs text-muted-foreground">
                          {new Date(report.created_at).toLocaleDateString('pt-BR')}
                        </span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className={`text-sm ${scoreColor(report.avg_score)}`}>
                          Media: {report.avg_score ?? '—'}
                        </span>
                        <span className={`text-sm ${scoreColor(report.min_score)}`}>
                          Min: {report.min_score ?? '—'}
                        </span>
                        {report.is_production_ready && (
                          <Badge className="text-xs bg-emerald-100 text-emerald-800">Producao</Badge>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </>
            )}
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
