import React, { useEffect, useState } from 'react';
import {
    Building2,
    DollarSign,
    MessageSquare,
    Users,
    TrendingUp,
    AlertTriangle,
    Crown,
    Loader2,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import AdminMetricCard from '@/components/admin/AdminMetricCard';
import TenantStatusBadge from '@/components/admin/TenantStatusBadge';

// ── Types ────────────────────────────────────────────────────────────

interface PlatformMetrics {
    totalTenants: number;
    activeTenants: number;
    totalConversations: number;
    leadsQualified: number;
}

interface TopTenant {
    id: string;
    company_name: string;
    city: string;
    state: string;
    is_active: boolean;
    conversations_count: number;
    contacts_count: number;
}

// ── Component ────────────────────────────────────────────────────────

const AdminDashboardPage: React.FC = () => {
    const [loading, setLoading] = useState(true);
    const [metrics, setMetrics] = useState<PlatformMetrics>({
        totalTenants: 0,
        activeTenants: 0,
        totalConversations: 0,
        leadsQualified: 0,
    });
    const [topTenants, setTopTenants] = useState<TopTenant[]>([]);

    useEffect(() => {
        loadDashboardData();
    }, []);

    const loadDashboardData = async () => {
        setLoading(true);
        try {
            // Count all tenants
            const { count: totalTenants } = await supabase
                .from('tenants')
                .select('id', { count: 'exact', head: true });

            // Count active tenants
            const { count: activeTenants } = await supabase
                .from('tenants')
                .select('id', { count: 'exact', head: true })
                .eq('is_active', true);

            // Count conversations this month
            const monthStart = new Date();
            monthStart.setDate(1);
            monthStart.setHours(0, 0, 0, 0);

            const { count: totalConversations } = await supabase
                .from('conversations')
                .select('id', { count: 'exact', head: true })
                .gte('created_at', monthStart.toISOString());

            // Count qualified leads
            const { count: leadsQualified } = await supabase
                .from('lead_qualification')
                .select('id', { count: 'exact', head: true });

            setMetrics({
                totalTenants: totalTenants ?? 0,
                activeTenants: activeTenants ?? 0,
                totalConversations: totalConversations ?? 0,
                leadsQualified: leadsQualified ?? 0,
            });

            // Load top tenants with conversation counts
            const { data: tenants } = await supabase
                .from('tenants')
                .select('id, company_name, city, state, is_active');

            if (tenants && tenants.length > 0) {
                const tenantsWithMetrics: TopTenant[] = [];

                for (const t of tenants) {
                    const { count: convCount } = await supabase
                        .from('conversations')
                        .select('id', { count: 'exact', head: true })
                        .eq('tenant_id', t.id)
                        .gte('created_at', monthStart.toISOString());

                    const { count: contactCount } = await supabase
                        .from('contacts')
                        .select('id', { count: 'exact', head: true })
                        .eq('tenant_id', t.id);

                    tenantsWithMetrics.push({
                        id: t.id,
                        company_name: t.company_name,
                        city: t.city || '',
                        state: t.state || '',
                        is_active: t.is_active ?? true,
                        conversations_count: convCount ?? 0,
                        contacts_count: contactCount ?? 0,
                    });
                }

                // Sort by conversations desc
                tenantsWithMetrics.sort((a, b) => b.conversations_count - a.conversations_count);
                setTopTenants(tenantsWithMetrics.slice(0, 5));
            }
        } catch (error) {
            console.error('Error loading dashboard data:', error);
        } finally {
            setLoading(false);
        }
    };

    if (loading) {
        return (
            <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto">
                <div className="space-y-1">
                    <div className="skeleton h-7 w-48" />
                    <div className="skeleton h-4 w-64" />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    {[1, 2, 3, 4].map(i => (
                        <div key={i} className="rounded-xl bg-card border border-border p-5 space-y-3">
                            <div className="skeleton h-4 w-28" />
                            <div className="skeleton h-8 w-14" />
                            <div className="skeleton h-2 w-full" />
                        </div>
                    ))}
                </div>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    <div className="skeleton h-64 w-full rounded-xl" />
                    <div className="skeleton h-64 w-full rounded-xl" />
                </div>
            </div>
        );
    }

    const qualificationRate = metrics.totalConversations > 0
        ? ((metrics.leadsQualified / metrics.totalConversations) * 100).toFixed(1)
        : '0';

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
                    value={metrics.activeTenants}
                    subtitle={`${metrics.totalTenants} total`}
                    icon={Building2}
                    accentColor="hsl(250 70% 60%)"
                />
                <AdminMetricCard
                    title="MRR"
                    value="A definir"
                    subtitle="Sistema de billing pendente"
                    icon={DollarSign}
                    accentColor="hsl(142 71% 45%)"
                />
                <AdminMetricCard
                    title="Conversas (mês)"
                    value={metrics.totalConversations.toLocaleString('pt-BR')}
                    subtitle="Todos os tenants"
                    icon={MessageSquare}
                    accentColor="hsl(207 65% 44%)"
                />
                <AdminMetricCard
                    title="Leads Qualificados"
                    value={metrics.leadsQualified}
                    subtitle={`Taxa: ${qualificationRate}%`}
                    icon={Users}
                    accentColor="hsl(38 92% 50%)"
                />
            </div>

            {/* Charts Row */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* MRR Growth - Placeholder */}
                <div className="bg-card border border-border rounded-xl p-5">
                    <div className="flex items-center justify-between mb-4">
                        <div>
                            <h3 className="text-sm font-semibold text-foreground">Evolução do MRR</h3>
                            <p className="text-xs text-muted-foreground">Disponível após implementação do billing</p>
                        </div>
                        <div className="flex items-center gap-1.5 text-muted-foreground">
                            <TrendingUp className="h-4 w-4" />
                            <span className="text-xs font-semibold">—</span>
                        </div>
                    </div>
                    <div className="flex items-center justify-center h-40 text-sm text-muted-foreground">
                        <div className="text-center">
                            <DollarSign className="h-8 w-8 mx-auto mb-2 opacity-30" />
                            <p>Gráfico de MRR será exibido após</p>
                            <p>implementação do sistema de billing</p>
                        </div>
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
                        {metrics.totalTenants === 0 ? (
                            <div className="flex items-center gap-3 p-3 rounded-lg border border-border bg-muted/30">
                                <div className="w-2 h-2 rounded-full shrink-0 bg-blue-500" />
                                <span className="text-sm text-foreground flex-1">Nenhum tenant cadastrado ainda</span>
                            </div>
                        ) : (
                            <>
                                {metrics.activeTenants < metrics.totalTenants && (
                                    <div className="flex items-center gap-3 p-3 rounded-lg border border-border bg-muted/30">
                                        <div className="w-2 h-2 rounded-full shrink-0 bg-amber-500" />
                                        <span className="text-sm text-foreground flex-1">
                                            {metrics.totalTenants - metrics.activeTenants} tenant(s) inativo(s)
                                        </span>
                                        <span className="text-xs font-semibold text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                                            {metrics.totalTenants - metrics.activeTenants}
                                        </span>
                                    </div>
                                )}
                                {metrics.leadsQualified === 0 && metrics.totalConversations > 0 && (
                                    <div className="flex items-center gap-3 p-3 rounded-lg border border-border bg-muted/30">
                                        <div className="w-2 h-2 rounded-full shrink-0 bg-amber-500" />
                                        <span className="text-sm text-foreground flex-1">Nenhum lead qualificado ainda</span>
                                    </div>
                                )}
                                <div className="flex items-center gap-3 p-3 rounded-lg border border-border bg-muted/30">
                                    <div className="w-2 h-2 rounded-full shrink-0 bg-blue-500" />
                                    <span className="text-sm text-foreground flex-1">
                                        {metrics.totalConversations} conversa(s) este mês
                                    </span>
                                    <span className="text-xs font-semibold text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                                        {metrics.totalConversations}
                                    </span>
                                </div>
                            </>
                        )}
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
                {topTenants.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-8">
                        <Building2 className="h-8 w-8 text-muted-foreground/30 mb-2" />
                        <p className="text-sm text-muted-foreground">Nenhum tenant cadastrado</p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead>
                                <tr className="border-b border-border">
                                    <th className="text-left text-xs font-medium text-muted-foreground pb-3 pr-4">#</th>
                                    <th className="text-left text-xs font-medium text-muted-foreground pb-3 pr-4">Empresa</th>
                                    <th className="text-left text-xs font-medium text-muted-foreground pb-3 pr-4">Status</th>
                                    <th className="text-right text-xs font-medium text-muted-foreground pb-3 pr-4">Conversas</th>
                                    <th className="text-right text-xs font-medium text-muted-foreground pb-3">Contatos</th>
                                </tr>
                            </thead>
                            <tbody>
                                {topTenants.map((tenant, i) => (
                                    <tr key={tenant.id} className="border-b border-border/50 last:border-0 hover:bg-muted/30 transition-colors">
                                        <td className="py-3 pr-4">
                                            <span className="text-xs font-bold text-muted-foreground">{i + 1}</span>
                                        </td>
                                        <td className="py-3 pr-4">
                                            <div>
                                                <span className="text-sm font-medium text-foreground">{tenant.company_name}</span>
                                                <p className="text-xs text-muted-foreground">{tenant.city}/{tenant.state}</p>
                                            </div>
                                        </td>
                                        <td className="py-3 pr-4">
                                            <TenantStatusBadge status={tenant.is_active ? 'active' : 'inactive'} />
                                        </td>
                                        <td className="py-3 pr-4 text-right">
                                            <span className="text-sm font-semibold text-foreground">{tenant.conversations_count}</span>
                                        </td>
                                        <td className="py-3 text-right">
                                            <span className="text-sm text-muted-foreground">{tenant.contacts_count}</span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
};

export default AdminDashboardPage;
