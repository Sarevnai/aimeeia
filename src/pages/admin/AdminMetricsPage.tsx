import React from 'react';
import {
    MessageSquare,
    Users,
    Clock,
    Brain,
    AlertTriangle,
    Activity,
    CheckCircle2,
    TrendingUp,
    BarChart3,
    Zap,
} from 'lucide-react';
import AdminMetricCard from '@/components/admin/AdminMetricCard';

// ── Mock data ─────────────────────────────────────────────────────────

const engagementMetrics = {
    conversationsPerDay: 62,
    avgResponseTime: '8.3s',
    avgSessionDuration: '4m 12s',
    messagesPerConversation: 11.2,
};

const conversionMetrics = {
    qualificationRate: 38.2,
    leadsToClm: 28.5,
    visitScheduleRate: 12.4,
    avgQualificationTime: '2m 45s',
};

const retentionMetrics = {
    activeRate: 75,
    churnRate: 2.1,
    npsProxy: 82,
    avgTenantAge: '4.2 meses',
};

const infraMetrics = {
    errorRate: 0.3,
    totalErrors30d: 47,
    tokensUsed30d: '2.4M',
    avgLatency: '1.2s',
};

const errorBreakdown = [
    { type: 'API Timeout', count: 18, pct: 38.3 },
    { type: 'Token Limit', count: 12, pct: 25.5 },
    { type: 'Parse Error', count: 9, pct: 19.1 },
    { type: 'CRM Sync Fail', count: 5, pct: 10.6 },
    { type: 'Outros', count: 3, pct: 6.4 },
];

const dailyConversations = [
    { day: 'Seg', count: 82 },
    { day: 'Ter', count: 95 },
    { day: 'Qua', count: 78 },
    { day: 'Qui', count: 103 },
    { day: 'Sex', count: 91 },
    { day: 'Sáb', count: 34 },
    { day: 'Dom', count: 12 },
];

const tenantHealthScores = [
    { name: 'Casa Verde Imobiliária', score: 96, trend: 'up' },
    { name: 'Smolka Imóveis', score: 92, trend: 'up' },
    { name: 'Porto Seguro Realty', score: 88, trend: 'stable' },
    { name: 'Horizonte Imóveis', score: 74, trend: 'down' },
    { name: 'Real Estate SP', score: 45, trend: 'down' },
];

// ── Component ─────────────────────────────────────────────────────────

const AdminMetricsPage: React.FC = () => {
    const maxDailyConv = Math.max(...dailyConversations.map((d) => d.count));

    return (
        <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto animate-fade-in">
            {/* Header */}
            <div>
                <h1 className="font-display text-2xl font-bold text-foreground">Métricas do Produto</h1>
                <p className="text-sm text-muted-foreground mt-1">Indicadores de sucesso e saúde da plataforma</p>
            </div>

            {/* Section: Engagement */}
            <div>
                <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">📊 Engagement</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    <AdminMetricCard
                        title="Conversas / dia"
                        value={engagementMetrics.conversationsPerDay}
                        icon={MessageSquare}
                        trend={{ value: 8.2, label: 'vs semana anterior' }}
                        accentColor="hsl(207 65% 44%)"
                    />
                    <AdminMetricCard
                        title="Tempo médio resposta"
                        value={engagementMetrics.avgResponseTime}
                        icon={Clock}
                        trend={{ value: -15.3, label: 'mais rápido' }}
                        accentColor="hsl(142 71% 45%)"
                    />
                    <AdminMetricCard
                        title="Duração média sessão"
                        value={engagementMetrics.avgSessionDuration}
                        icon={Activity}
                        accentColor="hsl(250 70% 60%)"
                    />
                    <AdminMetricCard
                        title="Msgs / conversa"
                        value={engagementMetrics.messagesPerConversation}
                        icon={MessageSquare}
                        accentColor="hsl(38 92% 50%)"
                    />
                </div>
            </div>

            {/* Section: Conversion */}
            <div>
                <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">🎯 Conversão</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    <AdminMetricCard
                        title="Taxa qualificação"
                        value={`${conversionMetrics.qualificationRate}%`}
                        icon={CheckCircle2}
                        trend={{ value: 2.1, label: 'vs mês anterior' }}
                        accentColor="hsl(142 71% 45%)"
                    />
                    <AdminMetricCard
                        title="Leads → CRM"
                        value={`${conversionMetrics.leadsToClm}%`}
                        icon={Users}
                        accentColor="hsl(207 65% 44%)"
                    />
                    <AdminMetricCard
                        title="Visitas agendadas"
                        value={`${conversionMetrics.visitScheduleRate}%`}
                        icon={TrendingUp}
                        accentColor="hsl(250 70% 60%)"
                    />
                    <AdminMetricCard
                        title="Tempo até qualificação"
                        value={conversionMetrics.avgQualificationTime}
                        icon={Zap}
                        accentColor="hsl(38 92% 50%)"
                    />
                </div>
            </div>

            {/* Charts Row */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* Daily conversations */}
                <div className="bg-card border border-border rounded-xl p-5">
                    <h3 className="text-sm font-semibold text-foreground mb-1">Conversas por dia da semana</h3>
                    <p className="text-xs text-muted-foreground mb-4">Média dos últimos 30 dias</p>
                    <div className="flex items-end gap-3 h-32">
                        {dailyConversations.map((item) => (
                            <div key={item.day} className="flex-1 flex flex-col items-center gap-1">
                                <span className="text-[10px] font-medium text-muted-foreground">{item.count}</span>
                                <div
                                    className="w-full rounded-t-md transition-all duration-500"
                                    style={{
                                        height: `${(item.count / maxDailyConv) * 100}px`,
                                        background: item.count > 80
                                            ? 'linear-gradient(180deg, hsl(250 70% 60%) 0%, hsl(250 50% 45%) 100%)'
                                            : 'hsl(250 20% 85%)',
                                    }}
                                />
                                <span className="text-[10px] text-muted-foreground">{item.day}</span>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Error Breakdown */}
                <div className="bg-card border border-border rounded-xl p-5">
                    <div className="flex items-center justify-between mb-4">
                        <div>
                            <h3 className="text-sm font-semibold text-foreground">Erros de IA</h3>
                            <p className="text-xs text-muted-foreground">Últimos 30 dias — {infraMetrics.totalErrors30d} total</p>
                        </div>
                        <AlertTriangle className="h-4 w-4 text-amber-500" />
                    </div>
                    <div className="space-y-3">
                        {errorBreakdown.map((err) => (
                            <div key={err.type} className="space-y-1">
                                <div className="flex items-center justify-between">
                                    <span className="text-xs font-medium text-foreground">{err.type}</span>
                                    <span className="text-xs text-muted-foreground">{err.count} ({err.pct}%)</span>
                                </div>
                                <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                                    <div
                                        className="h-full rounded-full transition-all duration-500"
                                        style={{
                                            width: `${err.pct}%`,
                                            background: err.pct > 30 ? 'hsl(0 84% 60%)' : err.pct > 15 ? 'hsl(38 92% 50%)' : 'hsl(250 70% 60%)',
                                        }}
                                    />
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* Retention + Health */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* Retention Metrics */}
                <div>
                    <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">🔄 Retenção</h2>
                    <div className="grid grid-cols-2 gap-4">
                        <AdminMetricCard
                            title="Taxa ativa"
                            value={`${retentionMetrics.activeRate}%`}
                            icon={Users}
                            accentColor="hsl(142 71% 45%)"
                        />
                        <AdminMetricCard
                            title="Churn"
                            value={`${retentionMetrics.churnRate}%`}
                            icon={TrendingUp}
                            accentColor="hsl(0 84% 60%)"
                        />
                        <AdminMetricCard
                            title="NPS Proxy"
                            value={retentionMetrics.npsProxy}
                            icon={BarChart3}
                            accentColor="hsl(250 70% 60%)"
                        />
                        <AdminMetricCard
                            title="Idade média"
                            value={retentionMetrics.avgTenantAge}
                            icon={Clock}
                            accentColor="hsl(207 65% 44%)"
                        />
                    </div>
                </div>

                {/* Health Scores */}
                <div className="bg-card border border-border rounded-xl p-5">
                    <h3 className="text-sm font-semibold text-foreground mb-1">Health Score por Tenant</h3>
                    <p className="text-xs text-muted-foreground mb-4">Baseado em engagement + conversão + uso</p>
                    <div className="space-y-3">
                        {tenantHealthScores.map((tenant) => (
                            <div key={tenant.name} className="flex items-center gap-3">
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center justify-between mb-1">
                                        <span className="text-sm font-medium text-foreground truncate">{tenant.name}</span>
                                        <span className={`text-xs font-bold ${tenant.score >= 80 ? 'text-emerald-500' : tenant.score >= 60 ? 'text-amber-500' : 'text-red-500'
                                            }`}>
                                            {tenant.score}
                                        </span>
                                    </div>
                                    <div className="h-2 bg-muted rounded-full overflow-hidden">
                                        <div
                                            className="h-full rounded-full transition-all duration-700"
                                            style={{
                                                width: `${tenant.score}%`,
                                                background: tenant.score >= 80 ? 'hsl(142 71% 45%)' : tenant.score >= 60 ? 'hsl(38 92% 50%)' : 'hsl(0 84% 60%)',
                                            }}
                                        />
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* Infra */}
            <div>
                <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">⚡ Infraestrutura</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    <AdminMetricCard
                        title="Taxa de erro"
                        value={`${infraMetrics.errorRate}%`}
                        icon={AlertTriangle}
                        accentColor="hsl(0 84% 60%)"
                    />
                    <AdminMetricCard
                        title="Erros (30d)"
                        value={infraMetrics.totalErrors30d}
                        icon={Brain}
                        accentColor="hsl(38 92% 50%)"
                    />
                    <AdminMetricCard
                        title="Tokens (30d)"
                        value={infraMetrics.tokensUsed30d}
                        icon={Zap}
                        accentColor="hsl(250 70% 60%)"
                    />
                    <AdminMetricCard
                        title="Latência média"
                        value={infraMetrics.avgLatency}
                        icon={Activity}
                        trend={{ value: -8.5, label: 'mais rápido' }}
                        accentColor="hsl(142 71% 45%)"
                    />
                </div>
            </div>
        </div>
    );
};

export default AdminMetricsPage;
