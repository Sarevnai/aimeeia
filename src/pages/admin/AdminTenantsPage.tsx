import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Search,
    Building2,
    MessageSquare,
    Users,
    Filter,
    Activity,
    CheckCircle2,
    AlertTriangle,
    AlertOctagon,
    Plug,
    Smartphone,
    Home,
    Megaphone,
    RefreshCw,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { supabase } from '@/integrations/supabase/client';
import {
    computeTenantHealth,
    formatLastActivity,
    HEALTH_CLASSES,
    HEALTH_LABELS,
    type TenantHealthLevel,
} from '@/lib/tenant-health';
import EmptyState from '@/components/EmptyState';

// ── Types ─────────────────────────────────────────────────────────────

interface TenantRow {
    id: string;
    company_name: string;
    city: string;
    state: string;
    is_active: boolean;
    created_at: string;
    has_whatsapp: boolean;
    has_vista: boolean;
    has_c2s: boolean;
    has_canal_pro: boolean;
    conversations_7d: number;
    contacts_count: number;
    users_count: number;
    last_conversation_at: string | null;
    health_level: TenantHealthLevel;
    health_reasons: string[];
}

type HealthFilter = 'all' | TenantHealthLevel | 'inactive' | 'no_activity_7d';

// ── Component ─────────────────────────────────────────────────────────

const AdminTenantsPage: React.FC = () => {
    const navigate = useNavigate();
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [tenants, setTenants] = useState<TenantRow[]>([]);
    const [search, setSearch] = useState('');
    const [healthFilter, setHealthFilter] = useState<HealthFilter>('all');

    useEffect(() => {
        loadTenants();
    }, []);

    async function loadTenants(isRefresh = false) {
        if (isRefresh) setRefreshing(true);
        else setLoading(true);
        try {
            const sevenDaysAgo = new Date(Date.now() - 7 * 86_400_000).toISOString();

            const [tenantsRes, settingsRes, agentRes, conv7dRes, contactsRes, profilesRes, lastConvRes] = await Promise.all([
                supabase
                    .from('tenants')
                    .select('id, company_name, city, state, is_active, created_at, wa_phone_number_id')
                    .order('company_name'),
                supabase
                    .from('system_settings')
                    .select('tenant_id, setting_key, setting_value'),
                supabase
                    .from('ai_agent_config')
                    .select('tenant_id, vista_integration_enabled'),
                supabase
                    .from('conversations')
                    .select('tenant_id')
                    .gte('created_at', sevenDaysAgo),
                supabase
                    .from('contacts')
                    .select('tenant_id'),
                supabase
                    .from('profiles')
                    .select('tenant_id'),
                supabase
                    .from('conversations')
                    .select('tenant_id, created_at')
                    .order('created_at', { ascending: false })
                    .limit(2000),
            ]);

            const tenantsData = tenantsRes.data || [];
            if (tenantsData.length === 0) {
                setTenants([]);
                return;
            }

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
            for (const a of agentRes.data || []) {
                if (a.vista_integration_enabled) vistaByTenant.set(a.tenant_id, true);
            }

            const conv7dByTenant = new Map<string, number>();
            for (const c of conv7dRes.data || []) {
                conv7dByTenant.set(c.tenant_id, (conv7dByTenant.get(c.tenant_id) || 0) + 1);
            }

            const contactsByTenant = new Map<string, number>();
            for (const c of contactsRes.data || []) {
                contactsByTenant.set(c.tenant_id, (contactsByTenant.get(c.tenant_id) || 0) + 1);
            }

            const usersByTenant = new Map<string, number>();
            for (const p of profilesRes.data || []) {
                if (p.tenant_id) usersByTenant.set(p.tenant_id, (usersByTenant.get(p.tenant_id) || 0) + 1);
            }

            const lastConvByTenant = new Map<string, string>();
            for (const c of lastConvRes.data || []) {
                if (!lastConvByTenant.has(c.tenant_id)) {
                    lastConvByTenant.set(c.tenant_id, c.created_at);
                }
            }

            const enriched: TenantRow[] = tenantsData.map((t) => {
                const isActive = t.is_active ?? true;
                const hasWhatsApp = !!t.wa_phone_number_id;
                const hasVista = vistaByTenant.get(t.id) === true;
                const hasC2S = c2sByTenant.get(t.id) === true;
                const hasCanalPro = canalProByTenant.get(t.id) === true;
                const conv7d = conv7dByTenant.get(t.id) || 0;
                const lastConvAt = lastConvByTenant.get(t.id) || null;

                const health = computeTenantHealth({
                    isActive,
                    hasWhatsApp,
                    hasVista,
                    hasC2S,
                    hasCanalPro,
                    conversations7d: conv7d,
                    lastConversationAt: lastConvAt,
                });

                return {
                    id: t.id,
                    company_name: t.company_name,
                    city: t.city || '',
                    state: t.state || '',
                    is_active: isActive,
                    created_at: t.created_at,
                    has_whatsapp: hasWhatsApp,
                    has_vista: hasVista,
                    has_c2s: hasC2S,
                    has_canal_pro: hasCanalPro,
                    conversations_7d: conv7d,
                    contacts_count: contactsByTenant.get(t.id) || 0,
                    users_count: usersByTenant.get(t.id) || 0,
                    last_conversation_at: lastConvAt,
                    health_level: health.level,
                    health_reasons: health.reasons,
                };
            });

            const healthOrder: Record<TenantHealthLevel, number> = { critical: 0, warning: 1, healthy: 2 };
            enriched.sort((a, b) => {
                const hd = healthOrder[a.health_level] - healthOrder[b.health_level];
                if (hd !== 0) return hd;
                return b.conversations_7d - a.conversations_7d;
            });
            setTenants(enriched);
        } catch (error) {
            console.error('Error loading tenants:', error);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }

    const stats = useMemo(() => {
        return {
            total: tenants.length,
            healthy: tenants.filter((t) => t.health_level === 'healthy').length,
            warning: tenants.filter((t) => t.health_level === 'warning').length,
            critical: tenants.filter((t) => t.health_level === 'critical').length,
            inactive: tenants.filter((t) => !t.is_active).length,
        };
    }, [tenants]);

    const filtered = useMemo(() => {
        const sevenDaysAgo = Date.now() - 7 * 86_400_000;
        return tenants.filter((t) => {
            const matchesSearch =
                t.company_name.toLowerCase().includes(search.toLowerCase()) ||
                t.city.toLowerCase().includes(search.toLowerCase());
            if (!matchesSearch) return false;
            switch (healthFilter) {
                case 'all':
                    return true;
                case 'healthy':
                case 'warning':
                case 'critical':
                    return t.health_level === healthFilter;
                case 'inactive':
                    return !t.is_active;
                case 'no_activity_7d': {
                    if (!t.last_conversation_at) return true;
                    return new Date(t.last_conversation_at).getTime() < sevenDaysAgo;
                }
                default:
                    return true;
            }
        });
    }, [tenants, search, healthFilter]);

    if (loading) {
        return (
            <div className="flex flex-col h-[calc(100vh-4rem)]">
                <div className="p-4 md:px-6 border-b border-border bg-card space-y-4">
                    <div className="space-y-1">
                        <div className="skeleton h-7 w-32" />
                        <div className="skeleton h-4 w-56" />
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        {[1, 2, 3, 4].map((i) => (
                            <div key={i} className="skeleton h-20 rounded-xl" />
                        ))}
                    </div>
                </div>
                <div className="flex-1 p-4 space-y-3">
                    {[1, 2, 3, 4, 5].map((i) => (
                        <div key={i} className="flex items-center gap-4 p-3 rounded-lg">
                            <div className="skeleton h-9 w-9 rounded-lg" />
                            <div className="flex-1 space-y-1">
                                <div className="skeleton h-4 w-40" />
                                <div className="skeleton h-3 w-24" />
                            </div>
                            <div className="skeleton h-5 w-20 rounded-full" />
                        </div>
                    ))}
                </div>
            </div>
        );
    }

    return (
        <TooltipProvider delayDuration={150}>
            <div className="flex flex-col h-[calc(100vh-4rem)]">
                {/* Header */}
                <div className="p-4 md:px-6 border-b border-border bg-card space-y-4">
                    <div className="flex items-center justify-between gap-3">
                        <div>
                            <h1 className="font-display text-2xl font-bold text-foreground">Tenants</h1>
                            <p className="text-sm text-muted-foreground mt-1">
                                {stats.total} cliente{stats.total !== 1 ? 's' : ''} na plataforma
                            </p>
                        </div>
                        <Button
                            size="sm"
                            variant="outline"
                            onClick={() => loadTenants(true)}
                            disabled={refreshing}
                            className="gap-1.5"
                        >
                            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
                            Atualizar
                        </Button>
                    </div>

                    {/* Stats bar (clickable filters) */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        <StatTile
                            label="Total"
                            value={stats.total}
                            icon={<Building2 className="h-4 w-4" />}
                            active={healthFilter === 'all'}
                            onClick={() => setHealthFilter('all')}
                        />
                        <StatTile
                            label="Saudáveis"
                            value={stats.healthy}
                            icon={<CheckCircle2 className="h-4 w-4 text-emerald-600" />}
                            active={healthFilter === 'healthy'}
                            onClick={() => setHealthFilter('healthy')}
                            tone="emerald"
                        />
                        <StatTile
                            label="Atenção"
                            value={stats.warning}
                            icon={<AlertTriangle className="h-4 w-4 text-amber-600" />}
                            active={healthFilter === 'warning'}
                            onClick={() => setHealthFilter('warning')}
                            tone="amber"
                        />
                        <StatTile
                            label="Críticos"
                            value={stats.critical}
                            icon={<AlertOctagon className="h-4 w-4 text-red-600" />}
                            active={healthFilter === 'critical'}
                            onClick={() => setHealthFilter('critical')}
                            tone="red"
                        />
                    </div>

                    {/* Filters */}
                    <div className="flex flex-wrap items-center gap-3">
                        <div className="relative flex-1 min-w-[200px] max-w-sm">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <Input
                                placeholder="Buscar por nome ou cidade..."
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                className="pl-9 h-9 text-sm"
                            />
                        </div>
                        <Select value={healthFilter} onValueChange={(v) => setHealthFilter(v as HealthFilter)}>
                            <SelectTrigger className="w-[180px] h-9 text-sm">
                                <Filter className="h-3.5 w-3.5 mr-1.5 text-muted-foreground" />
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">Todos</SelectItem>
                                <SelectItem value="critical">Críticos</SelectItem>
                                <SelectItem value="warning">Precisam atenção</SelectItem>
                                <SelectItem value="healthy">Saudáveis</SelectItem>
                                <SelectItem value="no_activity_7d">Sem atividade 7d</SelectItem>
                                <SelectItem value="inactive">Inativos</SelectItem>
                            </SelectContent>
                        </Select>
                        {(healthFilter !== 'all' || search) && (
                            <Button
                                size="sm"
                                variant="ghost"
                                className="h-9 text-xs"
                                onClick={() => {
                                    setHealthFilter('all');
                                    setSearch('');
                                }}
                            >
                                Limpar
                            </Button>
                        )}
                        <span className="text-xs text-muted-foreground ml-auto">
                            {filtered.length} de {stats.total}
                        </span>
                    </div>
                </div>

                {/* Table */}
                <div className="flex-1 overflow-auto">
                    {filtered.length === 0 ? (
                        <EmptyState
                            icon={<Building2 className="h-7 w-7 text-muted-foreground/60" />}
                            title="Nenhum tenant encontrado"
                            description={
                                healthFilter === 'all' && !search
                                    ? 'Ainda não há tenants cadastrados na plataforma.'
                                    : 'Tente ajustar os filtros ou a busca.'
                            }
                            action={
                                (healthFilter !== 'all' || search) && (
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={() => {
                                            setHealthFilter('all');
                                            setSearch('');
                                        }}
                                    >
                                        Limpar filtros
                                    </Button>
                                )
                            }
                        />
                    ) : (
                        <table className="w-full">
                            <thead className="sticky top-0 bg-card z-10">
                                <tr className="border-b border-border">
                                    <th className="text-left text-xs font-medium text-muted-foreground py-3 px-4 md:px-6">Empresa</th>
                                    <th className="text-left text-xs font-medium text-muted-foreground py-3 px-4">Saúde</th>
                                    <th className="text-left text-xs font-medium text-muted-foreground py-3 px-4 hidden md:table-cell">Integrações</th>
                                    <th className="text-right text-xs font-medium text-muted-foreground py-3 px-4 hidden md:table-cell">
                                        <div className="flex items-center justify-end gap-1">
                                            <Activity className="h-3 w-3" /> Atividade 7d
                                        </div>
                                    </th>
                                    <th className="text-right text-xs font-medium text-muted-foreground py-3 px-4 hidden lg:table-cell">
                                        <div className="flex items-center justify-end gap-1">
                                            <Users className="h-3 w-3" /> Contatos
                                        </div>
                                    </th>
                                    <th className="text-right text-xs font-medium text-muted-foreground py-3 px-4 hidden lg:table-cell">Última atividade</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filtered.map((tenant) => (
                                    <tr
                                        key={tenant.id}
                                        className="border-b border-border/50 hover:bg-muted/30 transition-colors cursor-pointer"
                                        onClick={() => navigate(`/admin/tenants/${tenant.id}`)}
                                    >
                                        <td className="py-3 px-4 md:px-6">
                                            <div className="flex items-center gap-3">
                                                <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-muted text-xs font-bold text-foreground shrink-0">
                                                    {tenant.company_name.charAt(0)}
                                                </div>
                                                <div className="min-w-0">
                                                    <p className="text-sm font-medium text-foreground truncate">{tenant.company_name}</p>
                                                    <p className="text-xs text-muted-foreground truncate">
                                                        {tenant.city}{tenant.state ? `/${tenant.state}` : ''}
                                                    </p>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="py-3 px-4">
                                            <HealthBadge level={tenant.health_level} reasons={tenant.health_reasons} />
                                        </td>
                                        <td className="py-3 px-4 hidden md:table-cell">
                                            <div className="flex items-center gap-1.5">
                                                <IntegrationDot
                                                    label="WhatsApp"
                                                    on={tenant.has_whatsapp}
                                                    icon={<Smartphone className="h-3 w-3" />}
                                                />
                                                <IntegrationDot
                                                    label="Vista (busca de imóveis)"
                                                    on={tenant.has_vista}
                                                    icon={<Home className="h-3 w-3" />}
                                                />
                                                <IntegrationDot
                                                    label="C2S (Construtor de Vendas)"
                                                    on={tenant.has_c2s}
                                                    icon={<Plug className="h-3 w-3" />}
                                                />
                                                <IntegrationDot
                                                    label="Canal Pro (ZAP/VivaReal)"
                                                    on={tenant.has_canal_pro}
                                                    icon={<Megaphone className="h-3 w-3" />}
                                                />
                                            </div>
                                        </td>
                                        <td className="py-3 px-4 text-right hidden md:table-cell">
                                            <div className="flex items-center justify-end gap-1">
                                                <MessageSquare className="h-3 w-3 text-muted-foreground" />
                                                <span className="text-sm font-semibold text-foreground">{tenant.conversations_7d}</span>
                                            </div>
                                        </td>
                                        <td className="py-3 px-4 text-right hidden lg:table-cell">
                                            <span className="text-sm text-muted-foreground">{tenant.contacts_count}</span>
                                        </td>
                                        <td className="py-3 px-4 text-right hidden lg:table-cell">
                                            <span className="text-xs text-muted-foreground">
                                                {formatLastActivity(tenant.last_conversation_at)}
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
            </div>
        </TooltipProvider>
    );
};

// ── Sub-components ────────────────────────────────────────────────────

interface StatTileProps {
    label: string;
    value: number;
    icon: React.ReactNode;
    active: boolean;
    onClick: () => void;
    tone?: 'default' | 'emerald' | 'amber' | 'red';
}

const StatTile: React.FC<StatTileProps> = ({ label, value, icon, active, onClick, tone = 'default' }) => {
    const toneRing: Record<string, string> = {
        default: 'data-[active=true]:ring-primary/40',
        emerald: 'data-[active=true]:ring-emerald-500/40',
        amber: 'data-[active=true]:ring-amber-500/40',
        red: 'data-[active=true]:ring-red-500/40',
    };
    return (
        <button
            type="button"
            data-active={active}
            onClick={onClick}
            className={`text-left rounded-xl border border-border bg-card p-3 transition-all hover:border-primary/30 hover:shadow-sm data-[active=true]:ring-2 ${toneRing[tone]}`}
        >
            <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{label}</span>
                {icon}
            </div>
            <p className="text-2xl font-bold text-foreground font-display mt-1">{value}</p>
        </button>
    );
};

const HealthBadge: React.FC<{ level: TenantHealthLevel; reasons: string[] }> = ({ level, reasons }) => {
    return (
        <Tooltip>
            <TooltipTrigger asChild>
                <span
                    className={`inline-flex items-center gap-1 text-[10px] font-semibold rounded-full px-2 py-0.5 border ${HEALTH_CLASSES[level]}`}
                >
                    {level === 'healthy' && <CheckCircle2 className="h-3 w-3" />}
                    {level === 'warning' && <AlertTriangle className="h-3 w-3" />}
                    {level === 'critical' && <AlertOctagon className="h-3 w-3" />}
                    {HEALTH_LABELS[level]}
                </span>
            </TooltipTrigger>
            <TooltipContent side="right" className="max-w-xs">
                <ul className="text-xs space-y-0.5">
                    {reasons.map((r, i) => (
                        <li key={i}>• {r}</li>
                    ))}
                </ul>
            </TooltipContent>
        </Tooltip>
    );
};

const IntegrationDot: React.FC<{ label: string; on: boolean; icon: React.ReactNode }> = ({ label, on, icon }) => (
    <Tooltip>
        <TooltipTrigger asChild>
            <span
                className={`inline-flex items-center justify-center h-6 w-6 rounded-md border transition-colors ${
                    on
                        ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20'
                        : 'bg-muted/40 text-muted-foreground/50 border-border'
                }`}
            >
                {icon}
            </span>
        </TooltipTrigger>
        <TooltipContent side="top">
            <span className="text-xs">
                {label}: <strong>{on ? 'Conectado' : 'Não configurado'}</strong>
            </span>
        </TooltipContent>
    </Tooltip>
);

export default AdminTenantsPage;
