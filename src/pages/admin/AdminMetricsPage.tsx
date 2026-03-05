import React, { useEffect, useState } from 'react';
import {
    MessageSquare,
    Users,
    Clock,
    CheckCircle2,
    Zap,
    Loader2,
    Ticket,
    Building2,
    Activity,
} from 'lucide-react';
import AdminMetricCard from '@/components/admin/AdminMetricCard';
import { supabase } from '@/integrations/supabase/client';

interface TenantHealth {
    name: string;
    score: number;
    conversations: number;
    contacts: number;
    users: number;
}

interface Metrics {
    totalConversations: number;
    conversations30d: number;
    conversations7d: number;
    conversationsToday: number;
    activeConversations: number;
    closedConversations: number;
    totalMessages: number;
    avgMsgsPerConversation: number;
    totalContacts: number;
    totalLeadsQualified: number;
    totalTickets: number;
    openTickets: number;
    totalTenants: number;
    activeTenants: number;
    totalUsers: number;
    conversationsByDayOfWeek: { day: string; count: number }[];
    tenantHealth: TenantHealth[];
}

const DAYS_PT = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab'];

const AdminMetricsPage: React.FC = () => {
    const [metrics, setMetrics] = useState<Metrics | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        loadMetrics();
    }, []);

    const loadMetrics = async () => {
        setLoading(true);
        try {
            // Parallel queries for all metrics
            const [
                convRes,
                conv30dRes,
                conv7dRes,
                convTodayRes,
                activeConvRes,
                closedConvRes,
                msgCountRes,
                contactsRes,
                leadsRes,
                ticketsRes,
                openTicketsRes,
                tenantsRes,
                activeTenantsRes,
                usersRes,
                tenantListRes,
            ] = await Promise.all([
                supabase.from('conversations').select('id', { count: 'exact', head: true }),
                supabase.from('conversations').select('id', { count: 'exact', head: true })
                    .gte('created_at', new Date(Date.now() - 30 * 86400000).toISOString()),
                supabase.from('conversations').select('id', { count: 'exact', head: true })
                    .gte('created_at', new Date(Date.now() - 7 * 86400000).toISOString()),
                supabase.from('conversations').select('id', { count: 'exact', head: true })
                    .gte('created_at', new Date(new Date().setHours(0, 0, 0, 0)).toISOString()),
                supabase.from('conversations').select('id', { count: 'exact', head: true })
                    .eq('status', 'active'),
                supabase.from('conversations').select('id', { count: 'exact', head: true })
                    .eq('status', 'closed'),
                supabase.from('messages').select('id', { count: 'exact', head: true }),
                supabase.from('contacts').select('id', { count: 'exact', head: true }),
                supabase.from('lead_qualification').select('id', { count: 'exact', head: true }),
                supabase.from('tickets').select('id', { count: 'exact', head: true }),
                supabase.from('tickets').select('id', { count: 'exact', head: true })
                    .not('stage_id', 'is', null),
                supabase.from('tenants').select('id, company_name, is_active'),
                supabase.from('tenants').select('id', { count: 'exact', head: true })
                    .eq('is_active', true),
                supabase.from('profiles').select('id', { count: 'exact', head: true }),
                supabase.from('tenants').select('id, company_name'),
            ]);

            // Compute conversations by day of week from recent conversations
            const { data: recentConvs } = await supabase
                .from('conversations')
                .select('created_at')
                .gte('created_at', new Date(Date.now() - 30 * 86400000).toISOString());

            const dayBuckets = [0, 0, 0, 0, 0, 0, 0]; // Sun-Sat
            (recentConvs || []).forEach((c) => {
                const dow = new Date(c.created_at).getDay();
                dayBuckets[dow]++;
            });
            const conversationsByDayOfWeek = DAYS_PT.map((day, i) => ({ day, count: dayBuckets[i] }));

            // Compute per-tenant health
            const tenantIds = (tenantListRes.data || []).map((t) => t.id);
            const tenantHealth: TenantHealth[] = [];

            for (const tenant of (tenantsRes.data || [])) {
                const [tConvs, tContacts, tUsers] = await Promise.all([
                    supabase.from('conversations').select('id', { count: 'exact', head: true })
                        .eq('tenant_id', tenant.id)
                        .gte('created_at', new Date(Date.now() - 30 * 86400000).toISOString()),
                    supabase.from('contacts').select('id', { count: 'exact', head: true })
                        .eq('tenant_id', tenant.id),
                    supabase.from('profiles').select('id', { count: 'exact', head: true })
                        .eq('tenant_id', tenant.id),
                ]);
                const conversations = tConvs.count ?? 0;
                const contacts = tContacts.count ?? 0;
                const users = tUsers.count ?? 0;
                // Health score: weighted by conversations (50%), contacts (30%), users (20%)
                // Normalized: max 100
                const score = Math.min(100, Math.round(
                    (Math.min(conversations, 50) / 50) * 50 +
                    (Math.min(contacts, 100) / 100) * 30 +
                    (Math.min(users, 5) / 5) * 20
                ));
                tenantHealth.push({
                    name: tenant.company_name || tenant.id,
                    score,
                    conversations,
                    contacts,
                    users,
                });
            }
            tenantHealth.sort((a, b) => b.score - a.score);

            const totalConv = convRes.count ?? 0;
            const avgMsgs = totalConv > 0
                ? Math.round(((msgCountRes.count ?? 0) / totalConv) * 10) / 10
                : 0;

            setMetrics({
                totalConversations: totalConv,
                conversations30d: conv30dRes.count ?? 0,
                conversations7d: conv7dRes.count ?? 0,
                conversationsToday: convTodayRes.count ?? 0,
                activeConversations: activeConvRes.count ?? 0,
                closedConversations: closedConvRes.count ?? 0,
                totalMessages: msgCountRes.count ?? 0,
                avgMsgsPerConversation: avgMsgs,
                totalContacts: contactsRes.count ?? 0,
                totalLeadsQualified: leadsRes.count ?? 0,
                totalTickets: ticketsRes.count ?? 0,
                openTickets: openTicketsRes.count ?? 0,
                totalTenants: (tenantsRes.data || []).length,
                activeTenants: activeTenantsRes.count ?? 0,
                totalUsers: usersRes.count ?? 0,
                conversationsByDayOfWeek,
                tenantHealth,
            });
        } catch (err) {
            console.error('Error loading metrics:', err);
        }
        setLoading(false);
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
        );
    }

    if (!metrics) {
        return (
            <div className="p-6 text-center text-muted-foreground">
                Erro ao carregar metricas.
            </div>
        );
    }

    const maxDailyConv = Math.max(...metrics.conversationsByDayOfWeek.map((d) => d.count), 1);
    const convPerDay30d = metrics.conversations30d > 0
        ? Math.round((metrics.conversations30d / 30) * 10) / 10
        : 0;

    return (
        <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto animate-fade-in">
            {/* Header */}
            <div>
                <h1 className="font-display text-2xl font-bold text-foreground">Metricas do Produto</h1>
                <p className="text-sm text-muted-foreground mt-1">Indicadores de saude da plataforma (dados reais)</p>
            </div>

            {/* Section: Engagement */}
            <div>
                <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Engagement</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    <AdminMetricCard
                        title="Conversas / dia (30d)"
                        value={convPerDay30d}
                        icon={MessageSquare}
                        accentColor="hsl(207 65% 44%)"
                    />
                    <AdminMetricCard
                        title="Conversas esta semana"
                        value={metrics.conversations7d}
                        icon={Clock}
                        accentColor="hsl(142 71% 45%)"
                    />
                    <AdminMetricCard
                        title="Total mensagens"
                        value={metrics.totalMessages.toLocaleString('pt-BR')}
                        icon={Activity}
                        accentColor="hsl(250 70% 60%)"
                    />
                    <AdminMetricCard
                        title="Msgs / conversa"
                        value={metrics.avgMsgsPerConversation}
                        icon={MessageSquare}
                        accentColor="hsl(38 92% 50%)"
                    />
                </div>
            </div>

            {/* Section: Conversion */}
            <div>
                <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Conversao e Qualificacao</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    <AdminMetricCard
                        title="Total conversas"
                        value={metrics.totalConversations}
                        icon={MessageSquare}
                        subtitle={`${metrics.activeConversations} ativas / ${metrics.closedConversations} fechadas`}
                        accentColor="hsl(207 65% 44%)"
                    />
                    <AdminMetricCard
                        title="Leads qualificados"
                        value={metrics.totalLeadsQualified}
                        icon={CheckCircle2}
                        accentColor="hsl(142 71% 45%)"
                    />
                    <AdminMetricCard
                        title="Total contatos"
                        value={metrics.totalContacts}
                        icon={Users}
                        accentColor="hsl(250 70% 60%)"
                    />
                    <AdminMetricCard
                        title="Chamados"
                        value={metrics.totalTickets}
                        subtitle={`${metrics.openTickets} abertos`}
                        icon={Ticket}
                        accentColor="hsl(38 92% 50%)"
                    />
                </div>
            </div>

            {/* Charts Row */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* Daily conversations */}
                <div className="bg-card border border-border rounded-xl p-5">
                    <h3 className="text-sm font-semibold text-foreground mb-1">Conversas por dia da semana</h3>
                    <p className="text-xs text-muted-foreground mb-4">Ultimos 30 dias</p>
                    <div className="flex items-end gap-3 h-32">
                        {metrics.conversationsByDayOfWeek.map((item) => (
                            <div key={item.day} className="flex-1 flex flex-col items-center gap-1">
                                <span className="text-[10px] font-medium text-muted-foreground">{item.count}</span>
                                <div
                                    className="w-full rounded-t-md transition-all duration-500"
                                    style={{
                                        height: `${Math.max((item.count / maxDailyConv) * 100, 4)}px`,
                                        background: item.count > 0
                                            ? 'linear-gradient(180deg, hsl(250 70% 60%) 0%, hsl(250 50% 45%) 100%)'
                                            : 'hsl(250 20% 85%)',
                                    }}
                                />
                                <span className="text-[10px] text-muted-foreground">{item.day}</span>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Platform Overview */}
                <div className="bg-card border border-border rounded-xl p-5">
                    <h3 className="text-sm font-semibold text-foreground mb-1">Visao Geral da Plataforma</h3>
                    <p className="text-xs text-muted-foreground mb-4">Resumo de uso</p>
                    <div className="space-y-3">
                        {[
                            { label: 'Tenants ativos', value: metrics.activeTenants, total: metrics.totalTenants, color: 'hsl(142 71% 45%)' },
                            { label: 'Usuarios cadastrados', value: metrics.totalUsers, total: Math.max(metrics.totalUsers, 1), color: 'hsl(207 65% 44%)' },
                            { label: 'Conversas ativas', value: metrics.activeConversations, total: Math.max(metrics.totalConversations, 1), color: 'hsl(250 70% 60%)' },
                            { label: 'Contatos registrados', value: metrics.totalContacts, total: Math.max(metrics.totalContacts, 1), color: 'hsl(38 92% 50%)' },
                        ].map((item) => (
                            <div key={item.label} className="space-y-1">
                                <div className="flex items-center justify-between">
                                    <span className="text-xs font-medium text-foreground">{item.label}</span>
                                    <span className="text-xs text-muted-foreground">
                                        {item.value}{item.label.includes('Tenants') ? ` / ${item.total}` : ''}
                                    </span>
                                </div>
                                <div className="h-2 bg-muted rounded-full overflow-hidden">
                                    <div
                                        className="h-full rounded-full transition-all duration-500"
                                        style={{
                                            width: `${Math.min((item.value / item.total) * 100, 100)}%`,
                                            background: item.color,
                                            minWidth: item.value > 0 ? '8px' : '0',
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
                {/* Tenant Stats */}
                <div>
                    <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Tenants</h2>
                    <div className="grid grid-cols-2 gap-4">
                        <AdminMetricCard
                            title="Total tenants"
                            value={metrics.totalTenants}
                            icon={Building2}
                            accentColor="hsl(207 65% 44%)"
                        />
                        <AdminMetricCard
                            title="Tenants ativos"
                            value={metrics.activeTenants}
                            icon={CheckCircle2}
                            accentColor="hsl(142 71% 45%)"
                        />
                        <AdminMetricCard
                            title="Total usuarios"
                            value={metrics.totalUsers}
                            icon={Users}
                            accentColor="hsl(250 70% 60%)"
                        />
                        <AdminMetricCard
                            title="Conversas hoje"
                            value={metrics.conversationsToday}
                            icon={Zap}
                            accentColor="hsl(38 92% 50%)"
                        />
                    </div>
                </div>

                {/* Health Scores */}
                <div className="bg-card border border-border rounded-xl p-5">
                    <h3 className="text-sm font-semibold text-foreground mb-1">Health Score por Tenant</h3>
                    <p className="text-xs text-muted-foreground mb-4">Baseado em conversas (50%) + contatos (30%) + usuarios (20%)</p>
                    {metrics.tenantHealth.length > 0 ? (
                        <div className="space-y-3">
                            {metrics.tenantHealth.map((tenant) => (
                                <div key={tenant.name} className="flex items-center gap-3">
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center justify-between mb-1">
                                            <span className="text-sm font-medium text-foreground truncate">{tenant.name}</span>
                                            <span className={`text-xs font-bold ${tenant.score >= 80 ? 'text-emerald-500' : tenant.score >= 60 ? 'text-amber-500' : 'text-red-500'}`}>
                                                {tenant.score}
                                            </span>
                                        </div>
                                        <div className="h-2 bg-muted rounded-full overflow-hidden">
                                            <div
                                                className="h-full rounded-full transition-all duration-700"
                                                style={{
                                                    width: `${tenant.score}%`,
                                                    background: tenant.score >= 80 ? 'hsl(142 71% 45%)' : tenant.score >= 60 ? 'hsl(38 92% 50%)' : 'hsl(0 84% 60%)',
                                                    minWidth: tenant.score > 0 ? '8px' : '0',
                                                }}
                                            />
                                        </div>
                                        <div className="flex gap-3 mt-1">
                                            <span className="text-[10px] text-muted-foreground">{tenant.conversations} conversas</span>
                                            <span className="text-[10px] text-muted-foreground">{tenant.contacts} contatos</span>
                                            <span className="text-[10px] text-muted-foreground">{tenant.users} usuarios</span>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <p className="text-sm text-muted-foreground text-center py-4">Nenhum tenant encontrado.</p>
                    )}
                </div>
            </div>
        </div>
    );
};

export default AdminMetricsPage;
