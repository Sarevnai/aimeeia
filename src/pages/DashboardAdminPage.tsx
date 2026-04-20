// Sprint 6.2 — Dashboard do Setor Administrativo de Locação.
// Substitui o Dashboard C2S (que é de leads de vendas) pro contexto admin.
// Métricas do setor: chamados abertos, TTFR médio, demandas órfãs, NPS médio,
// distribuição por categoria, responsáveis.

import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useTenant } from '@/contexts/TenantContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import {
  Ticket,
  Clock,
  AlertTriangle,
  Star,
  Users,
  TrendingUp,
  ArrowRight,
  Loader2,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface Metrics {
  totalOpen: number;
  urgentOpen: number;
  orphanCount: number;
  resolvedLast7d: number;
  avgFirstResponseMin: number | null;
  avgNps: number | null;
  npsResponses: number;
  byCategory: Record<string, number>;
  byStage: Record<string, { count: number; color: string }>;
  byPriority: Record<string, number>;
  slaExpiring: number;
  slaBreached: number;
}

interface TopOperator {
  id: string;
  full_name: string | null;
  resolved_count: number;
  avg_nps: number | null;
}

const DashboardAdminPage: React.FC = () => {
  const { tenantId } = useTenant();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [topOperators, setTopOperators] = useState<TopOperator[]>([]);

  useEffect(() => {
    if (!tenantId) return;
    const run = async () => {
      setLoading(true);
      const now = new Date();
      const last7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const slaExpiringAt = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();

      const [tickets, stagesRes, catsRes] = await Promise.all([
        supabase
          .from('tickets')
          .select(
            'id, category, category_id, stage, stage_id, priority, first_response_at, sla_deadline, resolved_at, created_at, nps_score, assigned_to',
          )
          .eq('tenant_id', tenantId)
          .eq('department_code', 'administrativo')
          .order('created_at', { ascending: false })
          .limit(500),
        supabase.from('ticket_stages').select('id, name, color').eq('tenant_id', tenantId),
        supabase
          .from('ticket_categories')
          .select('id, name, risk_level')
          .eq('tenant_id', tenantId)
          .eq('is_active', true),
      ]);

      const rows = tickets.data || [];
      const stageMap: Record<string, { name: string; color: string }> = {};
      (stagesRes.data || []).forEach((s: any) => {
        stageMap[s.id] = { name: s.name, color: s.color };
      });

      const open = rows.filter((t: any) => !t.resolved_at);
      const resolved7d = rows.filter(
        (t: any) => t.resolved_at && new Date(t.resolved_at) >= new Date(last7d),
      );
      const orphan = open.filter((t: any) => !t.assigned_to);
      const urgentOpen = open.filter((t: any) => t.priority === 'urgente' || t.priority === 'alta');
      const slaBreached = open.filter(
        (t: any) => t.sla_deadline && new Date(t.sla_deadline) < now,
      );
      const slaExpiring = open.filter(
        (t: any) =>
          t.sla_deadline &&
          new Date(t.sla_deadline) >= now &&
          new Date(t.sla_deadline) <= new Date(slaExpiringAt),
      );

      const byCategory: Record<string, number> = {};
      const byStage: Record<string, { count: number; color: string }> = {};
      const byPriority: Record<string, number> = {};
      open.forEach((t: any) => {
        byCategory[t.category] = (byCategory[t.category] || 0) + 1;
        const s = stageMap[t.stage_id];
        const stageName = s?.name || t.stage;
        if (!byStage[stageName]) byStage[stageName] = { count: 0, color: s?.color || '#888' };
        byStage[stageName].count += 1;
        byPriority[t.priority] = (byPriority[t.priority] || 0) + 1;
      });

      // TTFR — média em minutos (tickets com first_response_at dos últimos 7 dias)
      const respTickets = rows.filter(
        (t: any) => t.first_response_at && new Date(t.created_at) >= new Date(last7d),
      );
      const avgFirstResponseMin =
        respTickets.length === 0
          ? null
          : respTickets.reduce((s: number, t: any) => {
              return (
                s + (new Date(t.first_response_at).getTime() - new Date(t.created_at).getTime()) / 60000
              );
            }, 0) / respTickets.length;

      // NPS
      const withNps = rows.filter((t: any) => t.nps_score != null);
      const avgNps =
        withNps.length === 0
          ? null
          : withNps.reduce((s: number, t: any) => s + (t.nps_score || 0), 0) / withNps.length;

      setMetrics({
        totalOpen: open.length,
        urgentOpen: urgentOpen.length,
        orphanCount: orphan.length,
        resolvedLast7d: resolved7d.length,
        avgFirstResponseMin,
        avgNps,
        npsResponses: withNps.length,
        byCategory,
        byStage,
        byPriority,
        slaExpiring: slaExpiring.length,
        slaBreached: slaBreached.length,
      });

      // Top operadores (últimos 30 dias, resolvidos)
      const last30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const { data: recentResolved } = await supabase
        .from('tickets')
        .select('assigned_to, nps_score, resolved_at')
        .eq('tenant_id', tenantId)
        .eq('department_code', 'administrativo')
        .not('resolved_at', 'is', null)
        .gte('resolved_at', last30d);

      const perOp: Record<string, { resolved: number; sumNps: number; countNps: number }> = {};
      (recentResolved || []).forEach((t: any) => {
        if (!t.assigned_to) return;
        const row = perOp[t.assigned_to] || { resolved: 0, sumNps: 0, countNps: 0 };
        row.resolved += 1;
        if (t.nps_score != null) {
          row.sumNps += t.nps_score;
          row.countNps += 1;
        }
        perOp[t.assigned_to] = row;
      });
      const opIds = Object.keys(perOp);
      if (opIds.length > 0) {
        const { data: profs } = await supabase
          .from('profiles')
          .select('id, full_name')
          .in('id', opIds);
        const topOps: TopOperator[] = opIds
          .map((id) => {
            const p = (profs || []).find((x: any) => x.id === id);
            const stats = perOp[id];
            return {
              id,
              full_name: p?.full_name || null,
              resolved_count: stats.resolved,
              avg_nps: stats.countNps > 0 ? stats.sumNps / stats.countNps : null,
            };
          })
          .sort((a, b) => b.resolved_count - a.resolved_count)
          .slice(0, 5);
        setTopOperators(topOps);
      } else {
        setTopOperators([]);
      }

      setLoading(false);
    };
    run();
  }, [tenantId]);

  if (loading || !metrics) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const ttfrLabel =
    metrics.avgFirstResponseMin == null
      ? '—'
      : metrics.avgFirstResponseMin < 60
        ? `${Math.round(metrics.avgFirstResponseMin)}min`
        : `${(metrics.avgFirstResponseMin / 60).toFixed(1)}h`;
  const ttfrGood = metrics.avgFirstResponseMin != null && metrics.avgFirstResponseMin <= 10;

  const npsColor =
    metrics.avgNps == null
      ? 'text-muted-foreground'
      : metrics.avgNps >= 4
        ? 'text-emerald-600'
        : metrics.avgNps >= 3
          ? 'text-amber-600'
          : 'text-red-600';

  const totalByCategory = Object.values(metrics.byCategory).reduce((s, c) => s + c, 0) || 1;

  return (
    <div className="p-6 space-y-6 max-w-[1400px] mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">Setor Administrativo</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Panorama das demandas de inquilinos e proprietários.
          </p>
        </div>
        <Button onClick={() => navigate('/chamados')} variant="default" size="sm">
          Ver todos os chamados
          <ArrowRight className="h-4 w-4 ml-1" />
        </Button>
      </div>

      {/* Top row — 4 main KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
              <Ticket className="h-3.5 w-3.5" /> Chamados abertos
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{metrics.totalOpen}</div>
            {metrics.urgentOpen > 0 && (
              <p className="text-[11px] text-red-600 mt-1">
                {metrics.urgentOpen} urgente{metrics.urgentOpen === 1 ? '' : 's'} ou alta prioridade
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5" /> TTFR últimos 7d
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className={cn('text-3xl font-bold', ttfrGood ? 'text-emerald-600' : '')}>
              {ttfrLabel}
            </div>
            <p className="text-[11px] text-muted-foreground mt-1">
              Meta MVP: ≤10 min em horário comercial
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
              <AlertTriangle className="h-3.5 w-3.5" /> Demandas órfãs
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className={cn('text-3xl font-bold', metrics.orphanCount > 0 ? 'text-amber-600' : 'text-emerald-600')}>
              {metrics.orphanCount}
            </div>
            <p className="text-[11px] text-muted-foreground mt-1">
              Sem responsável atribuído
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
              <Star className="h-3.5 w-3.5" /> NPS médio
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className={cn('text-3xl font-bold flex items-baseline gap-1', npsColor)}>
              {metrics.avgNps == null ? '—' : metrics.avgNps.toFixed(1)}
              {metrics.avgNps != null && <span className="text-sm text-muted-foreground">/5</span>}
            </div>
            <p className="text-[11px] text-muted-foreground mt-1">
              {metrics.npsResponses} avaliação{metrics.npsResponses === 1 ? '' : 'ões'} coletada{metrics.npsResponses === 1 ? '' : 's'}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* SLA row */}
      {(metrics.slaBreached > 0 || metrics.slaExpiring > 0) && (
        <Card className="border-amber-200 bg-amber-50/50">
          <CardContent className="p-4 flex items-center gap-4 flex-wrap">
            <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-semibold text-amber-900">Atenção ao SLA</p>
              <p className="text-xs text-amber-800">
                {metrics.slaBreached > 0 && (
                  <span>{metrics.slaBreached} chamado{metrics.slaBreached === 1 ? '' : 's'} estourou o prazo · </span>
                )}
                {metrics.slaExpiring > 0 && (
                  <span>{metrics.slaExpiring} vai expirar nas próximas 2h</span>
                )}
              </p>
            </div>
            <Button
              size="sm"
              variant="outline"
              className="border-amber-400"
              onClick={() => navigate('/chamados')}
            >
              Priorizar agora
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Second row — Category + Stage breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Distribuição por categoria</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {Object.keys(metrics.byCategory).length === 0 ? (
              <p className="text-xs text-muted-foreground italic">Sem chamados abertos.</p>
            ) : (
              Object.entries(metrics.byCategory)
                .sort(([, a], [, b]) => b - a)
                .map(([cat, count]) => {
                  const pct = (count / totalByCategory) * 100;
                  return (
                    <div key={cat}>
                      <div className="flex items-center justify-between text-xs mb-1">
                        <span className="font-medium">{cat}</span>
                        <span className="text-muted-foreground">{count}</span>
                      </div>
                      <Progress value={pct} className="h-2" />
                    </div>
                  );
                })
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Funil de estágios</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {Object.keys(metrics.byStage).length === 0 ? (
              <p className="text-xs text-muted-foreground italic">Sem chamados abertos.</p>
            ) : (
              Object.entries(metrics.byStage).map(([stage, info]) => (
                <div key={stage} className="flex items-center gap-3">
                  <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: info.color }} />
                  <span className="text-xs flex-1">{stage}</span>
                  <Badge variant="outline" className="text-[10px]">
                    {info.count}
                  </Badge>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      {/* Third row — Top operadores + Produtividade */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              <TrendingUp className="h-4 w-4" /> Resolvidos últimos 7d
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{metrics.resolvedLast7d}</div>
            <p className="text-[11px] text-muted-foreground mt-1">
              chamados encerrados
            </p>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              <Users className="h-4 w-4" /> Top operadores (30d)
            </CardTitle>
          </CardHeader>
          <CardContent>
            {topOperators.length === 0 ? (
              <p className="text-xs text-muted-foreground italic">
                Nenhum chamado resolvido com responsável atribuído nos últimos 30 dias.
              </p>
            ) : (
              <div className="space-y-2">
                {topOperators.map((op, idx) => (
                  <div
                    key={op.id}
                    className="flex items-center gap-3 py-1.5 border-b last:border-0"
                  >
                    <span className="text-[10px] font-bold text-muted-foreground w-5">#{idx + 1}</span>
                    <span className="text-xs font-medium flex-1 truncate">
                      {op.full_name || 'Sem nome'}
                    </span>
                    <Badge variant="secondary" className="text-[10px]">
                      {op.resolved_count} resolvido{op.resolved_count === 1 ? '' : 's'}
                    </Badge>
                    {op.avg_nps != null && (
                      <span className="flex items-center gap-0.5 text-[11px]">
                        <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                        {op.avg_nps.toFixed(1)}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default DashboardAdminPage;
