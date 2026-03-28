import React, { useEffect, useState } from 'react';
import { Brain, Clock, DollarSign, CheckCircle, AlertCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

interface TraceRow {
  tenant_id: string;
  model: string;
  provider: string;
  latency_ms: number;
  cost_usd: number;
  total_tokens: number;
  tool_calls_count: number;
  tool_names: string[];
  success: boolean;
  error_message: string | null;
  created_at: string;
}

interface DayStat {
  date: string;
  cost: number;
  count: number;
}

interface ModelStat {
  model: string;
  count: number;
  cost: number;
}

interface ErrorStat {
  message: string;
  count: number;
}

const AIMetricsPanel: React.FC = () => {
  const [traces, setTraces] = useState<TraceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<7 | 30>(7);

  useEffect(() => {
    loadTraces();
  }, [period]);

  async function loadTraces() {
    setLoading(true);
    const since = new Date();
    since.setDate(since.getDate() - period);

    const { data, error } = await supabase
      .from('ai_traces' as any)
      .select('tenant_id, model, provider, latency_ms, cost_usd, total_tokens, tool_calls_count, tool_names, success, error_message, created_at')
      .gte('created_at', since.toISOString())
      .order('created_at', { ascending: false })
      .limit(5000);

    if (error) {
      console.error('Error loading traces:', error);
    } else {
      setTraces((data as any[]) || []);
    }
    setLoading(false);
  }

  // KPIs
  const totalCost = traces.reduce((s, t) => s + (Number(t.cost_usd) || 0), 0);
  const avgLatency = traces.length > 0
    ? Math.round(traces.reduce((s, t) => s + (t.latency_ms || 0), 0) / traces.length)
    : 0;
  const successRate = traces.length > 0
    ? Math.round((traces.filter(t => t.success).length / traces.length) * 100)
    : 100;
  const uniqueConversations = new Set(traces.map(t => t.tenant_id)).size;
  const costPerTenant = uniqueConversations > 0 ? totalCost / uniqueConversations : 0;

  // Cost by day
  const dayStats: DayStat[] = [];
  const dayMap = new Map<string, { cost: number; count: number }>();
  for (const t of traces) {
    const day = t.created_at?.slice(0, 10) || '';
    if (!day) continue;
    const existing = dayMap.get(day) || { cost: 0, count: 0 };
    existing.cost += Number(t.cost_usd) || 0;
    existing.count += 1;
    dayMap.set(day, existing);
  }
  for (const [date, stat] of Array.from(dayMap.entries()).sort()) {
    dayStats.push({ date, ...stat });
  }

  // Model distribution
  const modelMap = new Map<string, { count: number; cost: number }>();
  for (const t of traces) {
    const m = t.model || 'unknown';
    const existing = modelMap.get(m) || { count: 0, cost: 0 };
    existing.count += 1;
    existing.cost += Number(t.cost_usd) || 0;
    modelMap.set(m, existing);
  }
  const modelStats: ModelStat[] = Array.from(modelMap.entries())
    .map(([model, stat]) => ({ model, ...stat }))
    .sort((a, b) => b.count - a.count);

  // Top errors
  const errorMap = new Map<string, number>();
  for (const t of traces) {
    if (t.error_message) {
      const key = t.error_message.slice(0, 80);
      errorMap.set(key, (errorMap.get(key) || 0) + 1);
    }
  }
  const errorStats: ErrorStat[] = Array.from(errorMap.entries())
    .map(([message, count]) => ({ message, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  const maxDayCost = Math.max(...dayStats.map(d => d.cost), 0.001);

  if (loading) {
    return (
      <div className="bg-card border border-border rounded-xl p-5">
        <h3 className="text-sm font-semibold text-foreground mb-2">Metricas de AI</h3>
        <p className="text-xs text-muted-foreground">Carregando traces...</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Section Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Brain className="h-5 w-5 text-purple-500" />
          <h2 className="text-lg font-semibold text-foreground">Metricas de AI</h2>
        </div>
        <div className="flex gap-1 bg-muted rounded-lg p-0.5">
          <button
            onClick={() => setPeriod(7)}
            className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${period === 7 ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
          >
            7 dias
          </button>
          <button
            onClick={() => setPeriod(30)}
            className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${period === 30 ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
          >
            30 dias
          </button>
        </div>
      </div>

      {traces.length === 0 ? (
        <div className="bg-card border border-border rounded-xl p-8 text-center">
          <Brain className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">Nenhum trace registrado nos ultimos {period} dias.</p>
          <p className="text-xs text-muted-foreground mt-1">Traces aparecerao aqui assim que o agente AI processar mensagens.</p>
        </div>
      ) : (
        <>
          {/* KPI Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-card border border-border rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <DollarSign className="h-4 w-4 text-emerald-500" />
                <span className="text-xs text-muted-foreground">Custo Total AI</span>
              </div>
              <p className="text-xl font-bold text-foreground">${totalCost.toFixed(4)}</p>
              <p className="text-xs text-muted-foreground mt-1">{traces.length} chamadas</p>
            </div>

            <div className="bg-card border border-border rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <DollarSign className="h-4 w-4 text-blue-500" />
                <span className="text-xs text-muted-foreground">Custo/Tenant</span>
              </div>
              <p className="text-xl font-bold text-foreground">${costPerTenant.toFixed(4)}</p>
              <p className="text-xs text-muted-foreground mt-1">{uniqueConversations} tenants</p>
            </div>

            <div className="bg-card border border-border rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <Clock className="h-4 w-4 text-amber-500" />
                <span className="text-xs text-muted-foreground">Latencia Media</span>
              </div>
              <p className="text-xl font-bold text-foreground">{avgLatency.toLocaleString()}ms</p>
              <p className="text-xs text-muted-foreground mt-1">{avgLatency > 5000 ? 'Acima do ideal' : 'Saudavel'}</p>
            </div>

            <div className="bg-card border border-border rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <CheckCircle className="h-4 w-4 text-emerald-500" />
                <span className="text-xs text-muted-foreground">Taxa de Sucesso</span>
              </div>
              <p className="text-xl font-bold text-foreground">{successRate}%</p>
              <p className="text-xs text-muted-foreground mt-1">
                {traces.filter(t => !t.success).length} erros
              </p>
            </div>
          </div>

          {/* Charts Row */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Cost by Day */}
            <div className="bg-card border border-border rounded-xl p-5">
              <h3 className="text-sm font-semibold text-foreground mb-1">Custo por Dia</h3>
              <p className="text-xs text-muted-foreground mb-4">Ultimos {period} dias</p>
              {dayStats.length > 0 ? (
                <div className="flex items-end gap-1 h-32">
                  {dayStats.slice(-14).map((day) => (
                    <div key={day.date} className="flex-1 flex flex-col items-center gap-0.5">
                      <span className="text-[9px] text-muted-foreground">
                        ${day.cost.toFixed(3)}
                      </span>
                      <div
                        className="w-full rounded-t-sm"
                        style={{
                          height: `${Math.max((day.cost / maxDayCost) * 100, 2)}px`,
                          background: 'linear-gradient(180deg, hsl(270 70% 60%) 0%, hsl(270 50% 45%) 100%)',
                        }}
                      />
                      <span className="text-[9px] text-muted-foreground">
                        {day.date.slice(8)}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">Sem dados</p>
              )}
            </div>

            {/* Model Distribution */}
            <div className="bg-card border border-border rounded-xl p-5">
              <h3 className="text-sm font-semibold text-foreground mb-1">Distribuicao por Modelo</h3>
              <p className="text-xs text-muted-foreground mb-4">Chamadas e custo</p>
              <div className="space-y-3">
                {modelStats.map((m) => {
                  const pct = Math.round((m.count / traces.length) * 100);
                  return (
                    <div key={m.model}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-medium text-foreground truncate max-w-[180px]">
                          {m.model}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {m.count}x (${m.cost.toFixed(4)})
                        </span>
                      </div>
                      <div className="h-2 bg-muted rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${pct}%`,
                            background: 'linear-gradient(90deg, hsl(270 70% 60%), hsl(200 70% 50%))',
                          }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Top Errors */}
          {errorStats.length > 0 && (
            <div className="bg-card border border-border rounded-xl p-5">
              <div className="flex items-center gap-2 mb-3">
                <AlertCircle className="h-4 w-4 text-red-500" />
                <h3 className="text-sm font-semibold text-foreground">Top Erros</h3>
              </div>
              <div className="space-y-2">
                {errorStats.map((e, i) => (
                  <div key={i} className="flex items-center gap-3 p-2 rounded-lg bg-muted/30">
                    <span className="text-xs font-bold text-red-500 bg-red-500/10 px-2 py-0.5 rounded-full">
                      {e.count}x
                    </span>
                    <span className="text-xs text-foreground truncate">{e.message}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default AIMetricsPanel;
