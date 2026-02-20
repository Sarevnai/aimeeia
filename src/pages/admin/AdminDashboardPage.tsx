import React from 'react';
import {
    Building2,
    DollarSign,
    MessageSquare,
    Users,
    TrendingUp,
    AlertTriangle,
    Crown,
} from 'lucide-react';
import AdminMetricCard from '@/components/admin/AdminMetricCard';
import TenantStatusBadge from '@/components/admin/TenantStatusBadge';

// ── Mock data (will be replaced by Supabase queries) ─────────────────

const platformMetrics = {
    totalTenants: 12,
    activeTenants: 9,
    mrr: 4773,
    totalConversations: 1847,
    leadsQualified: 342,
};

const mrrHistory = [
    { month: 'Set', value: 2100 },
    { month: 'Out', value: 2800 },
    { month: 'Nov', value: 3200 },
    { month: 'Dez', value: 3800 },
    { month: 'Jan', value: 4200 },
    { month: 'Fev', value: 4773 },
];

const topTenants = [
    { name: 'Smolka Imóveis', conversations: 423, leads: 89, plan: 'Pro', status: 'active' as const },
    { name: 'Casa Verde Imobiliária', conversations: 312, leads: 67, plan: 'Enterprise', status: 'active' as const },
    { name: 'Porto Seguro Realty', conversations: 287, leads: 54, plan: 'Pro', status: 'active' as const },
    { name: 'Horizonte Imóveis', conversations: 198, leads: 41, plan: 'Starter', status: 'active' as const },
    { name: 'Nova Era Construtora', conversations: 145, leads: 28, plan: 'Pro', status: 'trial' as const },
];

const alerts = [
    { type: 'warning', message: '3 tenants com trial expirando em 7 dias', count: 3 },
    { type: 'error', message: '1 tenant com pagamento em atraso', count: 1 },
    { type: 'info', message: '2 novos tenants esta semana', count: 2 },
];

// ── Component ────────────────────────────────────────────────────────

const AdminDashboardPage: React.FC = () => {
    const maxBarValue = Math.max(...mrrHistory.map((m) => m.value));

    return (
        <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto animate-fade-in">
            {/* Header */}
            <div>
                <h1 className="font-display text-2xl font-bold text-foreground">Platform Dashboard</h1>
                <p className="text-sm text-muted-foreground mt-1">Visão geral da plataforma Aimee IA</p>
            </div>

            {/* KPI Row */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <AdminMetricCard
                    title="Tenants Ativos"
                    value={platformMetrics.activeTenants}
                    subtitle={`${platformMetrics.totalTenants} total`}
                    icon={Building2}
                    trend={{ value: 12, label: 'vs mês anterior' }}
                    accentColor="hsl(250 70% 60%)"
                />
                <AdminMetricCard
                    title="MRR"
                    value={`R$ ${platformMetrics.mrr.toLocaleString('pt-BR')}`}
                    subtitle="Monthly Recurring Revenue"
                    icon={DollarSign}
                    trend={{ value: 13.6, label: 'vs mês anterior' }}
                    accentColor="hsl(142 71% 45%)"
                />
                <AdminMetricCard
                    title="Conversas (mês)"
                    value={platformMetrics.totalConversations.toLocaleString('pt-BR')}
                    subtitle="Todos os tenants"
                    icon={MessageSquare}
                    trend={{ value: 8.2, label: 'vs mês anterior' }}
                    accentColor="hsl(207 65% 44%)"
                />
                <AdminMetricCard
                    title="Leads Qualificados"
                    value={platformMetrics.leadsQualified}
                    subtitle="Taxa: 18.5%"
                    icon={Users}
                    trend={{ value: 5.1, label: 'vs mês anterior' }}
                    accentColor="hsl(38 92% 50%)"
                />
            </div>

            {/* Charts Row */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* MRR Growth */}
                <div className="bg-card border border-border rounded-xl p-5">
                    <div className="flex items-center justify-between mb-4">
                        <div>
                            <h3 className="text-sm font-semibold text-foreground">Evolução do MRR</h3>
                            <p className="text-xs text-muted-foreground">Últimos 6 meses</p>
                        </div>
                        <div className="flex items-center gap-1.5 text-emerald-500">
                            <TrendingUp className="h-4 w-4" />
                            <span className="text-xs font-semibold">+127%</span>
                        </div>
                    </div>
                    <div className="flex items-end gap-2 h-40">
                        {mrrHistory.map((item) => (
                            <div key={item.month} className="flex-1 flex flex-col items-center gap-1">
                                <span className="text-[10px] font-medium text-muted-foreground">
                                    {(item.value / 1000).toFixed(1)}k
                                </span>
                                <div
                                    className="w-full rounded-t-md transition-all duration-500"
                                    style={{
                                        height: `${(item.value / maxBarValue) * 120}px`,
                                        background: `linear-gradient(180deg, hsl(250 70% 60%) 0%, hsl(250 50% 45%) 100%)`,
                                    }}
                                />
                                <span className="text-[10px] text-muted-foreground">{item.month}</span>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Alerts & Notifications */}
                <div className="bg-card border border-border rounded-xl p-5">
                    <div className="flex items-center justify-between mb-4">
                        <div>
                            <h3 className="text-sm font-semibold text-foreground">Alertas</h3>
                            <p className="text-xs text-muted-foreground">Ações pendentes</p>
                        </div>
                        <div className="flex items-center justify-center w-6 h-6 rounded-full bg-amber-500/10">
                            <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
                        </div>
                    </div>
                    <div className="space-y-3">
                        {alerts.map((alert, i) => (
                            <div
                                key={i}
                                className="flex items-center gap-3 p-3 rounded-lg border border-border bg-muted/30"
                            >
                                <div
                                    className={`w-2 h-2 rounded-full shrink-0 ${alert.type === 'error'
                                            ? 'bg-red-500'
                                            : alert.type === 'warning'
                                                ? 'bg-amber-500'
                                                : 'bg-blue-500'
                                        }`}
                                />
                                <span className="text-sm text-foreground flex-1">{alert.message}</span>
                                <span className="text-xs font-semibold text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                                    {alert.count}
                                </span>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* Top Tenants */}
            <div className="bg-card border border-border rounded-xl p-5">
                <div className="flex items-center justify-between mb-4">
                    <div>
                        <h3 className="text-sm font-semibold text-foreground">Top Tenants</h3>
                        <p className="text-xs text-muted-foreground">Por volume de conversas este mês</p>
                    </div>
                    <Crown className="h-4 w-4 text-amber-500" />
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead>
                            <tr className="border-b border-border">
                                <th className="text-left text-xs font-medium text-muted-foreground pb-3 pr-4">#</th>
                                <th className="text-left text-xs font-medium text-muted-foreground pb-3 pr-4">Empresa</th>
                                <th className="text-left text-xs font-medium text-muted-foreground pb-3 pr-4">Plano</th>
                                <th className="text-left text-xs font-medium text-muted-foreground pb-3 pr-4">Status</th>
                                <th className="text-right text-xs font-medium text-muted-foreground pb-3 pr-4">Conversas</th>
                                <th className="text-right text-xs font-medium text-muted-foreground pb-3">Leads</th>
                            </tr>
                        </thead>
                        <tbody>
                            {topTenants.map((tenant, i) => (
                                <tr key={tenant.name} className="border-b border-border/50 last:border-0 hover:bg-muted/30 transition-colors">
                                    <td className="py-3 pr-4">
                                        <span className="text-xs font-bold text-muted-foreground">{i + 1}</span>
                                    </td>
                                    <td className="py-3 pr-4">
                                        <span className="text-sm font-medium text-foreground">{tenant.name}</span>
                                    </td>
                                    <td className="py-3 pr-4">
                                        <span className="text-xs font-medium text-muted-foreground bg-muted px-2 py-0.5 rounded">
                                            {tenant.plan}
                                        </span>
                                    </td>
                                    <td className="py-3 pr-4">
                                        <TenantStatusBadge status={tenant.status} />
                                    </td>
                                    <td className="py-3 pr-4 text-right">
                                        <span className="text-sm font-semibold text-foreground">{tenant.conversations}</span>
                                    </td>
                                    <td className="py-3 text-right">
                                        <span className="text-sm text-muted-foreground">{tenant.leads}</span>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

export default AdminDashboardPage;
