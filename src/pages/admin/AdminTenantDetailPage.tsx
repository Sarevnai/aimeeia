import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
    ArrowLeft,
    Building2,
    MessageSquare,
    Users,
    Bot,
    CreditCard,
    Plug,
    ExternalLink,
    CheckCircle2,
    XCircle,
    Clock,
    Loader2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import TenantStatusBadge from '@/components/admin/TenantStatusBadge';
import AdminMetricCard from '@/components/admin/AdminMetricCard';
import { supabase } from '@/integrations/supabase/client';

// ── Types ─────────────────────────────────────────────────────────────

interface TenantData {
    id: string;
    company_name: string;
    city: string;
    state: string;
    is_active: boolean;
    created_at: string;
    wa_phone_number_id: string | null;
    crm_type: string | null;
    crm_api_key: string | null;
    crm_api_url: string | null;
}

interface TenantMetrics {
    conversations_month: number;
    contacts_total: number;
    leads_qualified: number;
}

interface TenantUser {
    id: string;
    full_name: string;
    role: string;
    username: string | null;
    created_at: string;
}

interface AgentConfig {
    agent_name: string;
    tone: string;
    ai_model: string;
    greeting_message: string;
    fallback_message: string;
    audio_enabled: boolean;
    emoji_intensity: string;
    vista_integration_enabled: boolean;
}

interface Integration {
    name: string;
    status: 'connected' | 'pending' | 'disconnected';
    icon: string;
    detail: string;
}

// ── Component ─────────────────────────────────────────────────────────

const AdminTenantDetailPage: React.FC = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const [activeTab, setActiveTab] = useState('overview');
    const [loading, setLoading] = useState(true);
    const [tenant, setTenant] = useState<TenantData | null>(null);
    const [metrics, setMetrics] = useState<TenantMetrics>({
        conversations_month: 0,
        contacts_total: 0,
        leads_qualified: 0,
    });
    const [users, setUsers] = useState<TenantUser[]>([]);
    const [agentConfig, setAgentConfig] = useState<AgentConfig | null>(null);
    const [integrations, setIntegrations] = useState<Integration[]>([]);

    useEffect(() => {
        if (id) loadTenantData(id);
    }, [id]);

    const loadTenantData = async (tenantId: string) => {
        setLoading(true);
        try {
            // Load tenant basic data
            const { data: tenantData, error: tenantErr } = await supabase
                .from('tenants')
                .select('id, company_name, city, state, is_active, created_at, wa_phone_number_id, crm_type, crm_api_key, crm_api_url')
                .eq('id', tenantId)
                .single();

            if (tenantErr || !tenantData) {
                console.error('Error loading tenant:', tenantErr);
                setLoading(false);
                return;
            }

            setTenant(tenantData);

            // Load metrics
            const monthStart = new Date();
            monthStart.setDate(1);
            monthStart.setHours(0, 0, 0, 0);

            const { count: convCount } = await supabase
                .from('conversations')
                .select('id', { count: 'exact', head: true })
                .eq('tenant_id', tenantId)
                .gte('created_at', monthStart.toISOString());

            const { count: contactCount } = await supabase
                .from('contacts')
                .select('id', { count: 'exact', head: true })
                .eq('tenant_id', tenantId);

            const { count: qualifiedCount } = await supabase
                .from('lead_qualification')
                .select('id', { count: 'exact', head: true })
                .eq('tenant_id', tenantId);

            setMetrics({
                conversations_month: convCount ?? 0,
                contacts_total: contactCount ?? 0,
                leads_qualified: qualifiedCount ?? 0,
            });

            // Load users
            const { data: profilesData } = await supabase
                .from('profiles')
                .select('id, full_name, role, username, created_at')
                .eq('tenant_id', tenantId)
                .order('created_at');

            setUsers(
                (profilesData || []).map((p) => ({
                    id: p.id,
                    full_name: p.full_name || 'Sem nome',
                    role: p.role || 'viewer',
                    username: p.username,
                    created_at: p.created_at,
                }))
            );

            // Load AI agent config
            const { data: agentData } = await supabase
                .from('ai_agent_config')
                .select('agent_name, tone, ai_model, greeting_message, fallback_message, audio_enabled, emoji_intensity, vista_integration_enabled')
                .eq('tenant_id', tenantId)
                .single();

            if (agentData) {
                setAgentConfig({
                    agent_name: agentData.agent_name || 'Aimee',
                    tone: agentData.tone || 'professional',
                    ai_model: agentData.ai_model || 'gpt-4o-mini',
                    greeting_message: agentData.greeting_message || '',
                    fallback_message: agentData.fallback_message || '',
                    audio_enabled: agentData.audio_enabled ?? false,
                    emoji_intensity: agentData.emoji_intensity || 'moderate',
                    vista_integration_enabled: agentData.vista_integration_enabled ?? false,
                });
            }

            // Derive integrations from tenant data
            const intgs: Integration[] = [];

            // WhatsApp
            if (tenantData.wa_phone_number_id) {
                intgs.push({
                    name: 'WhatsApp Business',
                    status: 'connected',
                    icon: '\uD83D\uDCAC',
                    detail: `WABA: ${tenantData.wa_phone_number_id}`,
                });
            } else {
                intgs.push({
                    name: 'WhatsApp Business',
                    status: 'disconnected',
                    icon: '\uD83D\uDCAC',
                    detail: 'N\u00e3o configurado',
                });
            }

            // CRM
            if (tenantData.crm_type && tenantData.crm_api_key) {
                intgs.push({
                    name: `CRM ${tenantData.crm_type}`,
                    status: 'connected',
                    icon: '\uD83C\uDFE2',
                    detail: `API URL: ${tenantData.crm_api_url || 'Configurado'}`,
                });
            } else if (tenantData.crm_type) {
                intgs.push({
                    name: `CRM ${tenantData.crm_type}`,
                    status: 'pending',
                    icon: '\uD83C\uDFE2',
                    detail: 'API key n\u00e3o configurada',
                });
            } else {
                intgs.push({
                    name: 'CRM',
                    status: 'disconnected',
                    icon: '\uD83C\uDFE2',
                    detail: 'Nenhum CRM configurado',
                });
            }

            // Vista integration
            if (agentData?.vista_integration_enabled) {
                intgs.push({
                    name: 'Busca de Im\u00f3veis (Vista)',
                    status: 'connected',
                    icon: '\uD83C\uDFE0',
                    detail: 'Busca ativa via IA',
                });
            }

            setIntegrations(intgs);
        } catch (error) {
            console.error('Error loading tenant detail:', error);
        } finally {
            setLoading(false);
        }
    };

    if (loading) {
        return (
            <div className="flex flex-col h-[calc(100vh-4rem)]">
                <div className="p-4 md:px-6 border-b border-border bg-card">
                    <div className="flex items-center gap-3 mb-3">
                        <div className="skeleton h-8 w-8 rounded" />
                        <div className="flex items-center gap-3 flex-1">
                            <div className="skeleton h-10 w-10 rounded-xl" />
                            <div className="space-y-1">
                                <div className="skeleton h-7 w-48" />
                                <div className="skeleton h-4 w-32" />
                            </div>
                        </div>
                    </div>
                    <div className="flex gap-2 mt-3">
                        {[1, 2, 3, 4, 5].map((i) => (
                            <div key={i} className="skeleton h-9 w-24 rounded" />
                        ))}
                    </div>
                </div>
                <div className="flex-1 p-4 md:p-6 space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                        {[1, 2, 3].map((i) => (
                            <div key={i} className="rounded-xl bg-card border border-border p-5 space-y-3">
                                <div className="skeleton h-4 w-28" />
                                <div className="skeleton h-8 w-14" />
                            </div>
                        ))}
                    </div>
                    <div className="skeleton h-32 w-full rounded-xl" />
                </div>
            </div>
        );
    }

    if (!tenant) {
        return (
            <div className="flex flex-col items-center justify-center h-[calc(100vh-4rem)] gap-4">
                <Building2 className="h-12 w-12 text-muted-foreground/30" />
                <p className="text-sm text-muted-foreground">Tenant n\u00e3o encontrado</p>
                <Button variant="outline" size="sm" onClick={() => navigate('/admin/tenants')}>
                    <ArrowLeft className="h-4 w-4 mr-1.5" />
                    Voltar
                </Button>
            </div>
        );
    }

    const qualificationRate = metrics.contacts_total > 0
        ? ((metrics.leads_qualified / metrics.contacts_total) * 100).toFixed(1)
        : '0';

    return (
        <div className="flex flex-col h-[calc(100vh-4rem)]">
            {/* Header */}
            <div className="p-4 md:px-6 border-b border-border bg-card">
                <div className="flex items-center gap-3 mb-3">
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => navigate('/admin/tenants')}>
                        <ArrowLeft className="h-4 w-4" />
                    </Button>
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                        <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-muted text-sm font-bold text-foreground shrink-0">
                            {tenant.company_name.charAt(0)}
                        </div>
                        <div className="min-w-0">
                            <div className="flex items-center gap-2">
                                <h1 className="font-display text-2xl font-bold text-foreground truncate">{tenant.company_name}</h1>
                                <TenantStatusBadge status={tenant.is_active ? 'active' : 'inactive'} />
                            </div>
                            <p className="text-sm text-muted-foreground">
                                {tenant.city}/{tenant.state} &bull; Criado em {new Date(tenant.created_at).toLocaleDateString('pt-BR')}
                            </p>
                        </div>
                    </div>
                </div>

                <Tabs value={activeTab} onValueChange={setActiveTab}>
                    <TabsList className="bg-transparent h-auto p-0 gap-0">
                        {[
                            { value: 'overview', label: 'Vis\u00e3o Geral', icon: Building2 },
                            { value: 'agent', label: 'Config IA', icon: Bot },
                            { value: 'billing', label: 'Billing', icon: CreditCard },
                            { value: 'users', label: 'Usu\u00e1rios', icon: Users },
                            { value: 'integrations', label: 'Integra\u00e7\u00f5es', icon: Plug },
                        ].map((tab) => (
                            <TabsTrigger
                                key={tab.value}
                                value={tab.value}
                                className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 rounded-none px-4 py-2 text-sm gap-1.5"
                                style={activeTab === tab.value ? { borderColor: 'hsl(250 70% 60%)', color: 'hsl(250 70% 60%)' } : {}}
                            >
                                <tab.icon className="h-4 w-4" />
                                <span className="hidden sm:inline">{tab.label}</span>
                            </TabsTrigger>
                        ))}
                    </TabsList>
                </Tabs>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-auto p-4 md:p-6">
                {activeTab === 'overview' && (
                    <div className="space-y-6 max-w-7xl mx-auto animate-fade-in">
                        {/* Metrics */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                            <AdminMetricCard
                                title="Conversas (m\u00eas)"
                                value={metrics.conversations_month}
                                icon={MessageSquare}
                                accentColor="hsl(207 65% 44%)"
                            />
                            <AdminMetricCard
                                title="Contatos"
                                value={metrics.contacts_total}
                                subtitle={`${metrics.leads_qualified} qualificados`}
                                icon={Users}
                                accentColor="hsl(142 71% 45%)"
                            />
                            <AdminMetricCard
                                title="Taxa de Qualifica\u00e7\u00e3o"
                                value={`${qualificationRate}%`}
                                subtitle={`${metrics.leads_qualified} de ${metrics.contacts_total} contatos`}
                                icon={Clock}
                                accentColor="hsl(250 70% 60%)"
                            />
                        </div>

                        {/* Tenant Info */}
                        <div className="bg-card border border-border rounded-xl p-5">
                            <h3 className="text-sm font-semibold text-foreground mb-3">Informa\u00e7\u00f5es do Tenant</h3>
                            <div className="space-y-3">
                                {[
                                    { label: 'ID', value: tenant.id },
                                    { label: 'Empresa', value: tenant.company_name },
                                    { label: 'Localiza\u00e7\u00e3o', value: `${tenant.city}/${tenant.state}` },
                                    { label: 'Status', value: tenant.is_active ? 'Ativo' : 'Inativo' },
                                    { label: 'CRM', value: tenant.crm_type || 'N\u00e3o configurado' },
                                    { label: 'WhatsApp', value: tenant.wa_phone_number_id || 'N\u00e3o configurado' },
                                    { label: 'Usu\u00e1rios', value: `${users.length}` },
                                ].map(({ label, value }) => (
                                    <div key={label} className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4 py-2 border-b border-border/50 last:border-0">
                                        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide min-w-[140px]">{label}</span>
                                        <span className="text-sm text-foreground break-all">{value}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                )}

                {activeTab === 'agent' && (
                    <div className="space-y-4 max-w-3xl mx-auto animate-fade-in">
                        {agentConfig ? (
                            <div className="bg-card border border-border rounded-xl p-5">
                                <h3 className="text-sm font-semibold text-foreground mb-4">Configura\u00e7\u00e3o do Agente</h3>
                                <div className="space-y-4">
                                    {[
                                        { label: 'Nome do Agente', value: agentConfig.agent_name },
                                        { label: 'Tom', value: agentConfig.tone },
                                        { label: 'Modelo IA', value: agentConfig.ai_model },
                                        { label: 'Mensagem de sauda\u00e7\u00e3o', value: agentConfig.greeting_message || 'N\u00e3o definida' },
                                        { label: 'Mensagem de fallback', value: agentConfig.fallback_message || 'N\u00e3o definida' },
                                        { label: '\u00c1udio habilitado', value: agentConfig.audio_enabled ? 'Sim' : 'N\u00e3o' },
                                        { label: 'Intensidade de emojis', value: agentConfig.emoji_intensity },
                                        { label: 'Busca Vista ativa', value: agentConfig.vista_integration_enabled ? 'Sim' : 'N\u00e3o' },
                                    ].map(({ label, value }) => (
                                        <div key={label} className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4 py-2 border-b border-border/50 last:border-0">
                                            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide min-w-[160px]">{label}</span>
                                            <span className="text-sm text-foreground">{value}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ) : (
                            <div className="bg-card border border-border rounded-xl p-5">
                                <div className="flex flex-col items-center justify-center py-8">
                                    <Bot className="h-8 w-8 text-muted-foreground/30 mb-2" />
                                    <p className="text-sm text-muted-foreground">Nenhuma configura\u00e7\u00e3o de agente encontrada</p>
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {activeTab === 'billing' && (
                    <div className="space-y-4 max-w-3xl mx-auto animate-fade-in">
                        <div className="bg-card border border-border rounded-xl p-5">
                            <h3 className="text-sm font-semibold text-foreground mb-4">Informa\u00e7\u00f5es de Billing</h3>
                            <div className="flex flex-col items-center justify-center py-8">
                                <CreditCard className="h-8 w-8 text-muted-foreground/30 mb-2" />
                                <p className="text-sm text-muted-foreground">Sistema de billing em desenvolvimento</p>
                                <p className="text-xs text-muted-foreground mt-1">Planos e cobran\u00e7as ser\u00e3o exibidos ap\u00f3s implementa\u00e7\u00e3o</p>
                            </div>
                        </div>
                    </div>
                )}

                {activeTab === 'users' && (
                    <div className="space-y-4 max-w-3xl mx-auto animate-fade-in">
                        <div className="bg-card border border-border rounded-xl p-5">
                            <div className="flex items-center justify-between mb-4">
                                <h3 className="text-sm font-semibold text-foreground">Usu\u00e1rios ({users.length})</h3>
                            </div>
                            {users.length === 0 ? (
                                <div className="flex flex-col items-center justify-center py-8">
                                    <Users className="h-8 w-8 text-muted-foreground/30 mb-2" />
                                    <p className="text-sm text-muted-foreground">Nenhum usu\u00e1rio cadastrado</p>
                                </div>
                            ) : (
                                <div className="space-y-2">
                                    {users.map((user) => (
                                        <div key={user.id} className="flex items-center gap-3 p-3 rounded-lg border border-border/50 hover:bg-muted/30 transition-colors">
                                            <div className="flex items-center justify-center w-9 h-9 rounded-full bg-muted text-xs font-bold text-foreground shrink-0">
                                                {user.full_name
                                                    .split(' ')
                                                    .map((n) => n[0])
                                                    .join('')
                                                    .toUpperCase()
                                                    .slice(0, 2)}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className="text-sm font-medium text-foreground">{user.full_name}</p>
                                                {user.username && (
                                                    <p className="text-xs text-muted-foreground">@{user.username}</p>
                                                )}
                                            </div>
                                            <span className="text-xs font-medium text-muted-foreground bg-muted px-2 py-0.5 rounded capitalize">
                                                {user.role}
                                            </span>
                                            <span className="text-xs text-muted-foreground hidden sm:inline">
                                                Desde {new Date(user.created_at).toLocaleDateString('pt-BR')}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {activeTab === 'integrations' && (
                    <div className="space-y-4 max-w-3xl mx-auto animate-fade-in">
                        <div className="bg-card border border-border rounded-xl p-5">
                            <h3 className="text-sm font-semibold text-foreground mb-4">Integra\u00e7\u00f5es</h3>
                            {integrations.length === 0 ? (
                                <div className="flex flex-col items-center justify-center py-8">
                                    <Plug className="h-8 w-8 text-muted-foreground/30 mb-2" />
                                    <p className="text-sm text-muted-foreground">Nenhuma integra\u00e7\u00e3o configurada</p>
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    {integrations.map((integration, idx) => (
                                        <div key={idx} className="flex items-center gap-3 p-3 rounded-lg border border-border/50">
                                            <span className="text-lg">{integration.icon}</span>
                                            <div className="flex-1 min-w-0">
                                                <p className="text-sm font-medium text-foreground">{integration.name}</p>
                                                <p className="text-xs text-muted-foreground">{integration.detail}</p>
                                            </div>
                                            {integration.status === 'connected' && (
                                                <div className="flex items-center gap-1 text-emerald-500">
                                                    <CheckCircle2 className="h-4 w-4" />
                                                    <span className="text-xs font-medium">Conectado</span>
                                                </div>
                                            )}
                                            {integration.status === 'pending' && (
                                                <div className="flex items-center gap-1 text-amber-500">
                                                    <Clock className="h-4 w-4" />
                                                    <span className="text-xs font-medium">Pendente</span>
                                                </div>
                                            )}
                                            {integration.status === 'disconnected' && (
                                                <div className="flex items-center gap-1 text-muted-foreground">
                                                    <XCircle className="h-4 w-4" />
                                                    <span className="text-xs font-medium">Desconectado</span>
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default AdminTenantDetailPage;
