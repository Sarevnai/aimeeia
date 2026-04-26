import React, { useEffect, useState } from 'react';
import {
    MessageSquare,
    Users,
    Clock,
    CheckCircle2,
    Zap,
    Ticket,
    Building2,
    Activity,
    RefreshCw,
    AlertTriangle,
    AlertOctagon,
} from 'lucide-react';
import AdminMetricCard from '@/components/admin/AdminMetricCard';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { supabase } from '@/integrations/supabase/client';
import {
    computeTenantHealth,
    HEALTH_CLASSES,
    HEALTH_LABELS,
    type TenantHealthLevel,
} from '@/lib/tenant-health';

interface TenantHealthRow {
    id: string;
    name: string;
    level: TenantHealthLevel;
    reasons: string[];
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
    tenantHealth: TenantHealthRow[];
}

const DAYS_PT = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab'];

function formatLastUpdated(date: Date | null): string {
    if (!date) return '—';
    const diffMs = Date.now() - date.getTime();
    const diffSec = Math.floor(diffMs / 1000);
    if (diffSec < 5) return 'agora';
    if (diffSec < 60) return `${diffSec}s atrás`;
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin}m atrás`;
    const diffHour = Math.floor(diffMin / 60);
    return `${diffHour}h atrás`;
}

const AdminMetricsPage: React.FC = () => {
    const [metrics, setMetrics] = useState<Metrics | null>(null);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
    const [, setTick] = useState(0);

    useEffect(() => {
        loadMetrics();
    }, []);

    // Tick every 15s so "atualizado há X" stays accurate
    useEffect(() => {
        const id = window.setInterval(() => setTick((n) => n + 1), 15_000);
        return () => window.clearInterval(id);
    }, []);

    const loadMetrics = async (isRefresh = false) => {
        if (isRefresh) setRefreshing(true);
        else setLoading(true);
        try {
            const sevenDaysAgo = new Date(Date.now() - 7 * 86_400_000).toISOString();
            const thirtyDaysAgo = new Date(Date.now() - 30 * 86_400_000).toISOString();
            const todayStart = new Date(new Date().setHours(0, 0, 0, 0)).toISOString();

            // Pre-fetch terminal stage IDs for open ticket counting
            const { data: terminalStages } = await supabase
                .from('ticket_stages')
                .select('id')
                .eq('is_terminal', true);
            const terminalIds = (terminalStages || []).map((s) => s.id);

            // All metrics queries in parallel — including signals for unified health
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
                recentConvsRes,
                tenantConvs30dRes,
                tenantContactsRes,
                tenantUsersRes,
                tenantConv7dRes,
                tenantLastConvRes,
                settingsRes,
                agentConfigRes,
            ] = await Promise.all([
                supabase.from('conversations').select('id', { count: 'exact', head: true }),
                supabase.from('conversations').select('id', { count: 'exact', head: true })
                    .gte('created_at', thirtyDaysAgo),
                supabase.from('conversations').select('id', { count: 'exact', head: true })
                    .gte('created_at', sevenDaysAgo),
                supabase.from('conversations').select('id', { count: 'exact', head: true })
                    .gte('created_at', todayStart),
                supabase.from('conversations').select('id', { count: 'exact', head: true })
                    .eq('status', 'active'),
                supabase.from('conversations').select('id', { count: 'exact', head: true })
                    .eq('status', 'closed'),
                supabase.from('messages').select('id', { count: 'exact', head: true }),
                supabase.from('contacts').select('id', { count: 'exact', head: true }),
                supabase.from('lead_qualification').select('id', { count: 'exact', head: true }),
                supabase.from('tickets').select('id', { count: 'exact', head: true }),
                terminalIds.length > 0
                    ? supabase.from('tickets').select('id', { count: 'exact', head: true })
                        .not('stage_id', 'in', `(${terminalIds.join(',')})`)
                    : supabase.from('tickets').select('id', { count: 'exact', head: true }),
                supabase.from('tenants').select('id, company_name, is_active, wa_phone_number_id'),
                supabase.from('tenants').select('id', { count: 'exact', head: true }).eq('is_active', true),
                supabase.from('profiles').select('id', { count: 'exact', head: true }),
                supabase.from('conversations').select('created_at').gte('created_at', thirtyDaysAgo),
                supabase.from('conversations').select('tenant_id').gte('created_at', thirtyDaysAgo),
                supabase.from('contacts').select('tenant_id'),
                supabase.from('profiles').select('tenant_id'),
                supabase.from('conversations').select('tenant_id').gte('created_at', sevenDaysAgo),
                supabase.from('conversations').select('tenant_id, created_at').order('created_at', { ascending: false }).limit(2000),
                supabase.from('system_settings').select('tenant_id, setting_key, setting_value'),
                supabase.from('ai_agent_config').select('tenant_id, vista_integration_enabled'),
            ]);

            // Conversations by day of week (last 30d)
            const dayBuckets = [0, 0, 0, 0, 0, 0, 0];
            for (const c of recentConvsRes.data || []) {
                dayBuckets[new Date(c.created_at).getDay()]++;
            }
            const conversationsByDayOfWeek = DAYS_PT.map((day, i) => ({ day, count: dayBuckets[i] }));

            // Aggregate per-tenant counts via Map (no N+1)
            const conv30dByTenant = new Map<string, number>();
            for (const c of tenantConvs30dRes.data || []) {
                conv30dByTenant.set(c.tenant_id, (conv30dByTenant.get(c.tenant_id) || 0) + 1);
            }
            const contactsByTenant = new Map<string, number>();
            for (const c of tenantContactsRes.data || []) {
                contactsByTenant.set(c.tenant_id, (contactsByTenant.get(c.tenant_id) || 0) + 1);
            }
            const usersByTenant = new Map<string, number>();
            for (const p of tenantUsersRes.data || []) {
                if (p.tenant_id) usersByTenant.set(p.tenant_id, (usersByTenant.get(p.tenant_id) || 0) + 1);
            }
            const conv7dByTenant = new Map<string, number>();
            for (const c of tenantConv7dRes.data || []) {
                conv7dByTenant.set(c.tenant_id, (conv7dByTenant.get(c.tenant_id) || 0) + 1);
            }
            const lastConvByTenant = new Map<string, string>();
            for (const c of tenantLastConvRes.data || []) {
                if (!lastConvByTenant.has(c.tenant_id)) {
                    lastConvByTenant.set(c.tenant_id, c.created_at);
                }
            }

            // Integration signals
            const c2sByTenant = new Map<string, boolean>();
            const canalProByTenant = new Map<string, boolean>();
            for (const s of settingsRes.data || []) {
                if (s.setting_key === 'c2s_config') {
                    const v = s.setting_value as { api_key?: string } | null;
                    if (v?.api_key) c2sByTenant.set(s.tenant_id, true);
                } else if (s.setting_key === 'canal_pro_secret') {
                    if (s.setting_value) canalProByTenant.set(s.tenant_id, true);
                }
            }
            const vistaByTenant = new Map<string, boolean>();
            for (const a of agentConfigRes.data || []) {
                if (a.vista_integration_enabled) vistaByTenant.set(a.tenant_id, true);
            }

            const tenantHealth: TenantHealthRow[] = (tenantsRes.data || []).map((t) => {
                const conversations = conv30dByTenant.get(t.id) || 0;
                const contacts = contactsByTenant.get(t.id) || 0;
                const users = usersByTenant.get(t.id) || 0;

                const health = computeTenantHealth({
                    isActive: t.is_active ?? true,
                    hasWhatsApp: !!t.wa_phone_number_id,
                    hasVista: vistaByTenant.get(t.id) === true,
                    hasC2S: c2sByTenant.get(t.id) === true,
                    hasCanalPro: canalProByTenant.get(t.id) === true,
                    conversations7d: conv7dByTenant.get(t.id) || 0,
                    lastConversationAt: lastConvByTenant.get(t.id) || null,
                });

                return {
                    id: t.id,
                    name: t.company_name || t.id,
                    level: health.level,
                    reasons: health.reasons,
                    score: health.score,
                    conversations,
                    contacts,
                    users,
                };
            });

            // Sort: critical → warning → healthy, then by score desc within each
            const order: Record<TenantHealthLevel, number> = { critical: 0, warning: 1, healthy: 2 };
            tenantHealth.sort((a, b) => {
                const ord = order[a.level] - order[b.level];
                if (ord !== 0) return ord;
                return b.score - a.score;
            });

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
            setLastUpdated(new Date());
        } catch (err) {
            console.error('Error loading metrics:', err);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    };

    if (loading) {
        return (
            <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto">
                <div className="space-y-1">
                    <div className="skeleton h-7 w-56" />
                    <div className="skeleton h-4 w-72" />
                </div>
                <div className="space-y-3">
                    <div className="skeleton h-3 w-24" />
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                        {[1, 2, 3, 4].map((i) => (
                            <div key={i} className="skeleton h-28 rounded-xl" />
                        ))}
                    </div>
                </div>
                <div className="space-y-3">
                    <div className="skeleton h-3 w-32" />
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                        {[1, 2, 3, 4].map((i) => (
                            <div key={i} className="skeleton h-28 rounded-xl" />
                        ))}
                    </div>
                </div>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    <div className="skeleton h-56 rounded-xl" />
                    <div className="skeleton h-56 rounded-xl" />
                </div>
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
        <TooltipProvider delayDuration={150}>
            <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto animate-fade-in">
                {/* Header */}
                <div className="flex items-start justify-between gap-3">
                    <div>
                        <h1 className="font-display text-2xl font-bold text-foreground">Metricas do Produto</h1>
                        <p className="text-sm text-muted-foreground mt-1">
                            Indicadores de saude da plataforma (dados reais)
                            <span className="ml-2 text-xs">· atualizado {formatLastUpdated(lastUpdated)}</span>
                        </p>
                    </div>
                    <Button
                        size="sm"
                        variant="outline"
                        onClick={() => loadMetrics(true)}
                        disabled={refreshing}
                        className="gap-1.5"
                    >
                        <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
                        Atualizar
                    </Button>
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

                    {/* Health Scores — unified with tenant-health helper */}
                    <div className="bg-card border border-border rounded-xl p-5">
                        <h3 className="text-sm font-semibold text-foreground mb-1">Saúde por Tenant</h3>
                        <p className="text-xs text-muted-foreground mb-4">
                            Mesmo sinal do cockpit: integrações + atividade + estado do tenant
                        </p>
                        {metrics.tenantHealth.length > 0 ? (
                            <div className="space-y-3">
                                {metrics.tenantHealth.map((tenant) => (
                                    <div key={tenant.id} className="flex items-center gap-3">
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center justify-between mb-1 gap-2">
                                                <div className="flex items-center gap-2 min-w-0">
                                                    <span className="text-sm font-medium text-foreground truncate">{tenant.name}</span>
                                                    <Tooltip>
                                                        <TooltipTrigger asChild>
                                                            <span
                                                                className={`inline-flex items-center gap-1 text-[10px] font-semibold rounded-full px-1.5 py-0.5 border shrink-0 ${HEALTH_CLASSES[tenant.level]}`}
                                                            >
                                                                {tenant.level === 'healthy' && <CheckCircle2 className="h-2.5 w-2.5" />}
                                                                {tenant.level === 'warning' && <AlertTriangle className="h-2.5 w-2.5" />}
                                                                {tenant.level === 'critical' && <AlertOctagon className="h-2.5 w-2.5" />}
                                                                {HEALTH_LABELS[tenant.level]}
                                                            </span>
                                                        </TooltipTrigger>
                                                        <TooltipContent side="left" className="max-w-xs">
                                                            <ul className="text-xs space-y-0.5">
                                                                {tenant.reasons.map((r, i) => (
                                                                    <li key={i}>• {r}</li>
                                                                ))}
                                                            </ul>
                                                        </TooltipContent>
                                                    </Tooltip>
                                                </div>
                                                <span className={`text-xs font-bold shrink-0 ${tenant.level === 'healthy' ? 'text-emerald-500' : tenant.level === 'warning' ? 'text-amber-500' : 'text-red-500'}`}>
                                                    {tenant.score}
                                                </span>
                                            </div>
                                            <div className="h-2 bg-muted rounded-full overflow-hidden">
                                                <div
                                                    className="h-full rounded-full transition-all duration-700"
                                                    style={{
                                                        width: `${tenant.score}%`,
                                                        background: tenant.level === 'healthy' ? 'hsl(142 71% 45%)' : tenant.level === 'warning' ? 'hsl(38 92% 50%)' : 'hsl(0 84% 60%)',
                                                        minWidth: tenant.score > 0 ? '8px' : '0',
                                                    }}
                                                />
                                            </div>
                                            <div className="flex gap-3 mt-1">
                                                <span className="text-[10px] text-muted-foreground">{tenant.conversations} conversas (30d)</span>
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
        </TooltipProvider>
    );
};

export default AdminMetricsPage;
