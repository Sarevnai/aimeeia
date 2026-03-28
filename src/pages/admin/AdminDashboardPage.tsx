import React, { useEffect, useState } from 'react';
import {
    Building2,
    MessageSquare,
    Users,
    TrendingUp,
    AlertTriangle,
    Crown,
    Loader2,
    Home,
} from 'lucide-react';
import AdminMetricCard from '@/components/admin/AdminMetricCard';
import TenantStatusBadge from '@/components/admin/TenantStatusBadge';
import type { TenantStatus } from '@/components/admin/TenantStatusBadge';
import AIMetricsPanel from '@/components/admin/AIMetricsPanel';
import { supabase } from '@/integrations/supabase/client';

// ── Types ────────────────────────────────────────────────────────────

interface TopTenant {
    name: string;
    conversations: number;
    leads: number;
    status: TenantStatus;
}

interface MonthStat {
    month: string;
    conversations: number;
}

interface Alert {
    type: 'warning' | 'error' | 'info';
    message: string;
    count: number;
}

interface DashboardData {
    totalTenants: number;
    activeTenants: number;
    conversationsThisMonth: number;
    conversationsLastMonth: number;
    leadsThisMonth: number;
    leadsLastMonth: number;
    totalProperties: number;
    topTenants: TopTenant[];
    conversationHistory: MonthStat[];
    alerts: Alert[];
}

// ── Helpers ──────────────────────────────────────────────────────────

function startOfMonth(date: Date): string {
    return new Date(date.getFullYear(), date.getMonth(), 1).toISOString();
}

function monthLabel(date: Date): string {
    return date.toLocaleString('pt-BR', { month: 'short' }).replace('.', '');
}

function calcTrend(current: number, previous: number): number {
    if (previous === 0) return current > 0 ? 100 : 0;
    return Math.round(((current - previous) / previous) * 100 * 10) / 10;
}

// ── Component ────────────────────────────────────────────────────────

const AdminDashboardPage: React.FC = () => {
    const [data, setData] = useState<DashboardData | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        loadDashboard();
    }, []);

    async function loadDashboard() {
        setLoading(true);
        try {
            const now = new Date();
            const thisMonthStart = startOfMonth(now);
            const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
            const lastMonthStart = startOfMonth(lastMonth);

            // Parallel queries
            const [
                tenantsRes,
                convsThisMonthRes,
                convsLastMonthRes,
                leadsThisMonthRes,
                leadsLastMonthRes,
                propertiesRes,
            ] = await Promise.all([
                supabase.from('tenants').select('id, company_name, is_active, created_at'),
                supabase.from('conversations').select('id, tenant_id', { count: 'exact' })
                    .gte('created_at', thisMonthStart),
                supabase.from('conversations').select('id', { count: 'exact', head: true })
                    .gte('created_at', lastMonthStart)
                    .lt('created_at', thisMonthStart),
                supabase.from('lead_qualification').select('id', { count: 'exact', head: true })
                    .gte('created_at', thisMonthStart),
                supabase.from('lead_qualification').select('id', { count: 'exact', head: true })
                    .gte('created_at', lastMonthStart)
                    .lt('created_at', thisMonthStart),
                supabase.from('properties').select('id', { count: 'exact', head: true }),
            ]);

            const tenants = tenantsRes.data || [];
            const totalTenants = tenants.length;
            const activeTenants = tenants.filter(t => t.is_active).length;
            const conversationsThisMonth = convsThisMonthRes.count ?? 0;
            const conversationsLastMonth = convsLastMonthRes.count ?? 0;
            const leadsThisMonth = leadsThisMonthRes.count ?? 0;
            const leadsLastMonth = leadsLastMonthRes.count ?? 0;
            const totalProperties = propertiesRes.count ?? 0;

            // Top tenants: count conversations per tenant this month
            const tenantConvMap = new Map<string, number>();
            for (const conv of (convsThisMonthRes.data || [])) {
                const tid = conv.tenant_id;
                tenantConvMap.set(tid, (tenantConvMap.get(tid) || 0) + 1);
            }

            // Count leads per tenant
            const { data: leadsData } = await supabase
                .from('lead_qualification')
                .select('tenant_id')
                .gte('created_at', thisMonthStart);

            const tenantLeadMap = new Map<string, number>();
            for (const lead of (leadsData || [])) {
                const tid = lead.tenant_id;
                tenantLeadMap.set(tid, (tenantLeadMap.get(tid) || 0) + 1);
            }

            const topTenants: TopTenant[] = tenants
                .map(t => ({
                    name: t.company_name || 'Sem nome',
                    conversations: tenantConvMap.get(t.id) || 0,
                    leads: tenantLeadMap.get(t.id) || 0,
                    status: (t.is_active ? 'active' : 'inactive') as TenantStatus,
                }))
                .sort((a, b) => b.conversations - a.conversations)
                .slice(0, 5);

            // Conversation history: last 6 months
            const conversationHistory: MonthStat[] = [];
            for (let i = 5; i >= 0; i--) {
                const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
                const mStart = startOfMonth(d);
                const nextMonth = new Date(d.getFullYear(), d.getMonth() + 1, 1);
                const mEnd = nextMonth.toISOString();

                const { count } = await supabase
                    .from('conversations')
                    .select('id', { count: 'exact', head: true })
                    .gte('created_at', mStart)
                    .lt('created_at', mEnd);

                conversationHistory.push({
                    month: monthLabel(d),
                    conversations: count ?? 0,
                });
            }

            // Alerts — derived from real data
            const alerts: Alert[] = [];

            // New tenants this week
            const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString();
            const newTenantsThisWeek = tenants.filter(t => t.created_at && t.created_at >= weekAgo).length;
            if (newTenantsThisWeek > 0) {
                alerts.push({ type: 'info', message: `${newTenantsThisWeek} novo(s) tenant(s) esta semana`, count: newTenantsThisWeek });
            }

            // Inactive tenants
            const inactiveTenants = tenants.filter(t => !t.is_active).length;
            if (inactiveTenants > 0) {
                alerts.push({ type: 'warning', message: `${inactiveTenants} tenant(s) inativo(s)`, count: inactiveTenants });
            }

            // No conversations this month
            const tenantsWithNoConvs = tenants.filter(t => t.is_active && !tenantConvMap.has(t.id)).length;
            if (tenantsWithNoConvs > 0) {
                alerts.push({ type: 'warning', message: `${tenantsWithNoConvs} tenant(s) ativo(s) sem conversas este mes`, count: tenantsWithNoConvs });
            }

            if (alerts.length === 0) {
                alerts.push({ type: 'info', message: 'Nenhum alerta no momento', count: 0 });
            }

            setData({
                totalTenants,
                activeTenants,
                conversationsThisMonth,
                conversationsLastMonth,
                leadsThisMonth,
                leadsLastMonth,
                totalProperties,
                topTenants,
                conversationHistory,
                alerts,
            });
        } catch (err) {
            console.error('Error loading dashboard:', err);
        }
        setLoading(false);
    }

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
        );
    }

    if (!data) {
        return (
            <div className="p-6 text-center text-muted-foreground">
                Erro ao carregar dashboard.
            </div>
        );
    }

    const convTrend = calcTrend(data.conversationsThisMonth, data.conversationsLastMonth);
    const leadsTrend = calcTrend(data.leadsThisMonth, data.leadsLastMonth);
    const qualRate = data.conversationsThisMonth > 0
        ? Math.round((data.leadsThisMonth / data.conversationsThisMonth) * 100 * 10) / 10
        : 0;

    const maxBarValue = Math.max(...data.conversationHistory.map(m => m.conversations), 1);
    const firstMonth = data.conversationHistory[0]?.conversations ?? 0;
    const lastMonth = data.conversationHistory[data.conversationHistory.length - 1]?.conversations ?? 0;
    const historyGrowth = firstMonth > 0
        ? Math.round(((lastMonth - firstMonth) / firstMonth) * 100)
        : lastMonth > 0 ? 100 : 0;

    return (
        <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto animate-fade-in">
            {/* Header */}
            <div>
                <h1 className="font-display text-2xl font-bold text-foreground">Platform Dashboard</h1>
                <p className="text-sm text-muted-foreground mt-1">Visao geral da plataforma Aimee IA (dados reais)</p>
            </div>

            {/* KPI Row */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <AdminMetricCard
                    title="Tenants Ativos"
                    value={data.activeTenants}
                    subtitle={`${data.totalTenants} total`}
                    icon={Building2}
                    accentColor="hsl(250 70% 60%)"
                />
                <AdminMetricCard
                    title="Imoveis Cadastrados"
                    value={data.totalProperties.toLocaleString('pt-BR')}
                    subtitle="Base de imoveis"
                    icon={Home}
                    accentColor="hsl(142 71% 45%)"
                />
                <AdminMetricCard
                    title="Conversas (mes)"
                    value={data.conversationsThisMonth.toLocaleString('pt-BR')}
                    subtitle="Todos os tenants"
                    icon={MessageSquare}
                    trend={data.conversationsLastMonth > 0 ? { value: convTrend, label: 'vs mes anterior' } : undefined}
                    accentColor="hsl(207 65% 44%)"
                />
                <AdminMetricCard
                    title="Leads Qualificados"
                    value={data.leadsThisMonth}
                    subtitle={`Taxa: ${qualRate}%`}
                    icon={Users}
                    trend={data.leadsLastMonth > 0 ? { value: leadsTrend, label: 'vs mes anterior' } : undefined}
                    accentColor="hsl(38 92% 50%)"
                />
            </div>

            {/* Charts Row */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* Conversations Growth */}
                <div className="bg-card border border-border rounded-xl p-5">
                    <div className="flex items-center justify-between mb-4">
                        <div>
                            <h3 className="text-sm font-semibold text-foreground">Evolucao de Conversas</h3>
                            <p className="text-xs text-muted-foreground">Ultimos 6 meses</p>
                        </div>
                        {historyGrowth !== 0 && (
                            <div className={`flex items-center gap-1.5 ${historyGrowth > 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                                <TrendingUp className="h-4 w-4" />
                                <span className="text-xs font-semibold">{historyGrowth > 0 ? '+' : ''}{historyGrowth}%</span>
                            </div>
                        )}
                    </div>
                    <div className="flex items-end gap-2 h-40">
                        {data.conversationHistory.map((item) => (
                            <div key={item.month} className="flex-1 flex flex-col items-center gap-1">
                                <span className="text-[10px] font-medium text-muted-foreground">
                                    {item.conversations}
                                </span>
                                <div
                                    className="w-full rounded-t-md transition-all duration-500"
                                    style={{
                                        height: `${Math.max((item.conversations / maxBarValue) * 120, 4)}px`,
                                        background: item.conversations > 0
                                            ? 'linear-gradient(180deg, hsl(250 70% 60%) 0%, hsl(250 50% 45%) 100%)'
                                            : 'hsl(250 20% 85%)',
                                    }}
                                />
                                <span className="text-[10px] text-muted-foreground capitalize">{item.month}</span>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Alerts & Notifications */}
                <div className="bg-card border border-border rounded-xl p-5">
                    <div className="flex items-center justify-between mb-4">
                        <div>
                            <h3 className="text-sm font-semibold text-foreground">Alertas</h3>
                            <p className="text-xs text-muted-foreground">Acoes pendentes</p>
                        </div>
                        <div className="flex items-center justify-center w-6 h-6 rounded-full bg-amber-500/10">
                            <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
                        </div>
                    </div>
                    <div className="space-y-3">
                        {data.alerts.map((alert, i) => (
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
                                {alert.count > 0 && (
                                    <span className="text-xs font-semibold text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                                        {alert.count}
                                    </span>
                                )}
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
                        <p className="text-xs text-muted-foreground">Por volume de conversas este mes</p>
                    </div>
                    <Crown className="h-4 w-4 text-amber-500" />
                </div>
                {data.topTenants.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-4">Nenhum tenant cadastrado.</p>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead>
                                <tr className="border-b border-border">
                                    <th className="text-left text-xs font-medium text-muted-foreground pb-3 pr-4">#</th>
                                    <th className="text-left text-xs font-medium text-muted-foreground pb-3 pr-4">Empresa</th>
                                    <th className="text-left text-xs font-medium text-muted-foreground pb-3 pr-4">Status</th>
                                    <th className="text-right text-xs font-medium text-muted-foreground pb-3 pr-4">Conversas</th>
                                    <th className="text-right text-xs font-medium text-muted-foreground pb-3">Leads</th>
                                </tr>
                            </thead>
                            <tbody>
                                {data.topTenants.map((tenant, i) => (
                                    <tr key={tenant.name} className="border-b border-border/50 last:border-0 hover:bg-muted/30 transition-colors">
                                        <td className="py-3 pr-4">
                                            <span className="text-xs font-bold text-muted-foreground">{i + 1}</span>
                                        </td>
                                        <td className="py-3 pr-4">
                                            <span className="text-sm font-medium text-foreground">{tenant.name}</span>
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
                )}
            </div>

            {/* AI Metrics */}
            <AIMetricsPanel />
        </div>
    );
};

export default AdminDashboardPage;
