import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { BarChart3 } from 'lucide-react';
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

export default function LabAnalysisPage() {
  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('simulation_runs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);
      setRuns((data as RunSummary[]) || []);
      setLoading(false);
    })();
  }, []);

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center gap-3">
        <BarChart3 className="h-5 w-5 text-primary" />
        <h1 className="text-lg font-semibold">Histórico de Análises</h1>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Carregando...</p>
      ) : runs.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground text-sm">
            Nenhuma análise registrada. Use o Simulador para gerar análises.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
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
                  <span className="text-sm">Média: {run.avg_score}</span>
                  <span className="text-sm">Min: {run.min_score}</span>
                  {run.is_perfect && (
                    <Badge className="text-xs bg-emerald-100 text-emerald-800">Perfeito</Badge>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
