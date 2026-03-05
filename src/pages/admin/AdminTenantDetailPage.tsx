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
    UserPlus,
    Trash2,
    Pencil,
    KeyRound,
    Database,
    Link as LinkIcon,
    RefreshCw,
    AlertCircle,
    Save
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import TenantStatusBadge from '@/components/admin/TenantStatusBadge';
import AdminMetricCard from '@/components/admin/AdminMetricCard';
import ConfirmDialog from '@/components/ConfirmDialog';
import { useToast } from '@/hooks/use-toast';
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
    xml_catalog_url: string | null;
    xml_parser_type: string | null;
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
    const { toast } = useToast();
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

    // ── Catalog State ──────────────────────────────────────────────────
    const [xmlUrl, setXmlUrl] = useState('');
    const [xmlParser, setXmlParser] = useState('auto');
    const [savingXml, setSavingXml] = useState(false);
    const [syncingXml, setSyncingXml] = useState(false);
    const [catalogStats, setCatalogStats] = useState({ total: 0, pending: 0, lastSync: null as string | null });

    // ── Invite user state ──────────────────────────────────────────────
    const [inviteOpen, setInviteOpen] = useState(false);
    const [inviteLoading, setInviteLoading] = useState(false);
    const [inviteForm, setInviteForm] = useState({ email: '', full_name: '', role: 'viewer', password: '' });

    // ── Remove user state ──────────────────────────────────────────────
    const [removeUserId, setRemoveUserId] = useState<string | null>(null);
    const [removeName, setRemoveName] = useState('');
    const [removeLoading, setRemoveLoading] = useState(false);

    // ── Edit role state ────────────────────────────────────────────────
    const [editRoleUser, setEditRoleUser] = useState<TenantUser | null>(null);
    const [editRoleValue, setEditRoleValue] = useState('');
    const [editRoleLoading, setEditRoleLoading] = useState(false);

    // ── Reset password state ───────────────────────────────────────────
    const [resetPwdUser, setResetPwdUser] = useState<TenantUser | null>(null);
    const [resetPwdValue, setResetPwdValue] = useState('');
    const [resetPwdLoading, setResetPwdLoading] = useState(false);

    useEffect(() => {
        if (id) loadTenantData(id);
    }, [id]);

    const loadTenantData = async (tenantId: string) => {
        setLoading(true);
        try {
            // Load tenant basic data
            const { data: tenantData, error: tenantErr } = await supabase
                .from('tenants')
                .select('id, company_name, city, state, is_active, created_at, wa_phone_number_id, crm_type, crm_api_key, crm_api_url, xml_catalog_url, xml_parser_type')
                .eq('id', tenantId)
                .single();

            if (tenantErr || !tenantData) {
                console.error('Error loading tenant:', tenantErr);
                setLoading(false);
                return;
            }

            setTenant(tenantData);
            setXmlUrl(tenantData.xml_catalog_url || '');
            setXmlParser(tenantData.xml_parser_type || 'auto');

            // Load properties stats for this specific tenant
            try {
                const { count, error: countErr } = await supabase.from('properties').select('*', { count: 'exact', head: true }).eq('tenant_id', tenantId);
                if (countErr) console.error("Properties count error:", countErr);

                const { count: pendingCount, error: queueErr } = await supabase.from('xml_sync_queue').select('*', { count: 'exact', head: true }).eq('tenant_id', tenantId).eq('status', 'pending');
                if (queueErr) console.error("Queue count error:", queueErr);

                const { data: props, error: propsErr } = await supabase.from('properties').select('updated_at').eq('tenant_id', tenantId).order('updated_at', { ascending: false }).limit(1);
                if (propsErr) console.error("Properties latest date error:", propsErr);

                setCatalogStats({
                    total: count || 0,
                    pending: pendingCount || 0,
                    lastSync: props && props.length > 0 ? props[0].updated_at : null
                });
            } catch (err) {
                console.error("Catch block Error loading property stats", err);
            }

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

    // ── Catalog config & sync ──────────────────────────────────────────
    const handleSaveXmlConfig = async () => {
        if (!id) return;
        setSavingXml(true);
        try {
            const { error } = await supabase
                .from('tenants')
                .update({ xml_catalog_url: xmlUrl, xml_parser_type: xmlParser })
                .eq('id', id);

            if (error) throw error;
            toast({ title: 'Sucesso', description: 'Configurações de catálogo XML salvas.' });
            loadTenantData(id); // Reload
        } catch (error: any) {
            console.error(error);
            toast({ title: 'Erro', description: 'Falha ao salvar configurações do catálogo.', variant: 'destructive' });
        } finally {
            setSavingXml(false);
        }
    };

    const handleSyncCatalog = async () => {
        if (!xmlUrl || !id) {
            toast({ title: 'Aviso', description: 'Salve a URL do XML primeiro.', variant: 'destructive' });
            return;
        }

        setSyncingXml(true);
        toast({ title: 'Sincronização Iniciada', description: 'Baixando seu XML e adicionando na fila de IA. Isso deve demorar apenas alguns segundos...' });

        try {
            const { data, error } = await supabase.functions.invoke('sync-catalog-xml', {
                body: { tenant_id: id, xml_url: xmlUrl, parser_type: xmlParser }
            });

            if (error) throw error;
            if (data?.error) throw new Error(data.error);

            toast({
                title: 'Imóveis na Fila!',
                description: data?.message || `Sua base de imóveis está sendo lida pela IA e processada em pano de fundo.`,
            });

            // Re-fetch stats slightly later to show pending items if possible
            setTimeout(() => { if (id) loadTenantData(id) }, 5000);

        } catch (error: any) {
            console.error(error);
            toast({ title: 'Erro na Sincronização', description: error.message || 'Falha ao processar o XML.', variant: 'destructive' });
        } finally {
            setSyncingXml(false);
        }
    };

    // ── Create user ────────────────────────────────────────────────────
    const handleInviteUser = async () => {
        if (!inviteForm.email || !inviteForm.full_name || inviteForm.password.length < 8) return;
        setInviteLoading(true);
        try {
            const { data, error } = await supabase.functions.invoke('manage-team', {
                body: {
                    action: 'create_user',
                    email: inviteForm.email,
                    password: inviteForm.password,
                    full_name: inviteForm.full_name,
                    tenant_id: id,
                    role: inviteForm.role,
                },
            });
            const errMsg = error?.message || (data as { error?: string })?.error;
            if (errMsg) {
                toast({ title: 'Erro ao criar usuário', description: errMsg, variant: 'destructive' });
            } else {
                toast({ title: 'Usuário criado com sucesso.' });
                setInviteOpen(false);
                setInviteForm({ email: '', full_name: '', role: 'viewer', password: '' });
                if (id) loadTenantData(id);
            }
        } finally {
            setInviteLoading(false);
        }
    };

    // ── Remove user ────────────────────────────────────────────────────
    const handleRemoveUser = async () => {
        if (!removeUserId) return;
        setRemoveLoading(true);
        try {
            const { data, error } = await supabase.functions.invoke('manage-team', {
                body: { action: 'remove_user', user_id: removeUserId },
            });
            const errMsg = error?.message || (data as { error?: string })?.error;
            if (errMsg) {
                toast({ title: 'Erro ao remover usuário', description: errMsg, variant: 'destructive' });
            } else {
                toast({ title: 'Usuário removido com sucesso.' });
                setRemoveUserId(null);
                if (id) loadTenantData(id);
            }
        } finally {
            setRemoveLoading(false);
        }
    };

    // ── Update role ────────────────────────────────────────────────────
    const handleUpdateRole = async () => {
        if (!editRoleUser || !editRoleValue) return;
        setEditRoleLoading(true);
        try {
            const { data, error } = await supabase.functions.invoke('manage-team', {
                body: { action: 'update_role', user_id: editRoleUser.id, role: editRoleValue },
            });
            const errMsg = error?.message || (data as { error?: string })?.error;
            if (errMsg) {
                toast({ title: 'Erro ao alterar papel', description: errMsg, variant: 'destructive' });
            } else {
                toast({ title: 'Papel atualizado com sucesso.' });
                setEditRoleUser(null);
                if (id) loadTenantData(id);
            }
        } finally {
            setEditRoleLoading(false);
        }
    };

    // ── Reset password ─────────────────────────────────────────────────
    const handleResetPassword = async () => {
        if (!resetPwdUser || !resetPwdValue) return;
        setResetPwdLoading(true);
        try {
            const { data, error } = await supabase.functions.invoke('manage-team', {
                body: { action: 'reset_password', user_id: resetPwdUser.id, new_password: resetPwdValue },
            });
            const errMsg = error?.message || (data as { error?: string })?.error;
            if (errMsg) {
                toast({ title: 'Erro ao redefinir senha', description: errMsg, variant: 'destructive' });
            } else {
                toast({ title: 'Senha redefinida com sucesso.' });
                setResetPwdUser(null);
                setResetPwdValue('');
            }
        } finally {
            setResetPwdLoading(false);
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
                            {tenant.wa_phone_number_id && (
                                <p className="text-xs text-muted-foreground mt-0.5 font-mono">
                                    {tenant.wa_phone_number_id}
                                </p>
                            )}
                        </div>
                    </div>
                </div>

                <Tabs value={activeTab} onValueChange={setActiveTab}>
                    <TabsList className="bg-transparent h-auto p-0 gap-0">
                        {[
                            { value: 'overview', label: 'Vis\u00e3o Geral', icon: Building2 },
                            { value: 'agent', label: 'Config IA', icon: Bot },
                            { value: 'catalog', label: 'Catálogo XML', icon: Database },
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

                {activeTab === 'catalog' && (
                    <div className="space-y-6 max-w-5xl mx-auto animate-fade-in">
                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

                            {/* Form de Configuração */}
                            <div className="lg:col-span-2 space-y-6">
                                <div className="bg-card border border-border rounded-xl p-5 md:p-6">
                                    <div className="flex items-center justify-between mb-4">
                                        <h3 className="text-sm font-semibold text-foreground">Configuração do Feed XML</h3>
                                    </div>
                                    <div className="space-y-4">

                                        <div className="space-y-2">
                                            <Label htmlFor="xml_url">URL do XML (Publicamente Acessível)</Label>
                                            <div className="relative">
                                                <LinkIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                                <Input
                                                    id="xml_url"
                                                    placeholder="https://crm.exemplo.com.br/export/vivareal.xml"
                                                    className="pl-9 font-mono text-sm"
                                                    value={xmlUrl}
                                                    onChange={(e) => setXmlUrl(e.target.value)}
                                                />
                                            </div>
                                        </div>

                                        <div className="space-y-2">
                                            <Label htmlFor="xml_parser">Formato de Leitura (Parser)</Label>
                                            <Select value={xmlParser} onValueChange={setXmlParser}>
                                                <SelectTrigger>
                                                    <SelectValue />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="auto">Detecção Automática</SelectItem>
                                                    <SelectItem value="zap_vivareal">ZAP / VivaReal Padrão</SelectItem>
                                                    <SelectItem value="vista">Vista CRM</SelectItem>
                                                    <SelectItem value="custom">Formato Customizado (Precisa de ajuste manual)</SelectItem>
                                                </SelectContent>
                                            </Select>
                                            <p className="text-xs text-muted-foreground mt-1">
                                                Se "Automática", o sistema tentará inferir através de tags comuns como &lt;Imovel&gt; ou &lt;Listing&gt;.
                                            </p>
                                        </div>

                                        <div className="pt-4 flex items-center justify-end border-t border-border">
                                            <Button onClick={handleSaveXmlConfig} disabled={savingXml}>
                                                {savingXml ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />} Salvar
                                            </Button>
                                        </div>

                                    </div>
                                </div>

                                <div className="bg-muted/30 border border-border rounded-xl p-5">
                                    <h4 className="font-medium flex items-center gap-2 mb-2 text-sm text-foreground">
                                        <AlertCircle className="h-4 w-4 text-amber-500" /> Funcionamento da Busca por IA
                                    </h4>
                                    <p className="text-xs text-muted-foreground leading-relaxed">
                                        Ao sincronizar, o sistema processará o arquivo XML informado e criará seus <strong>Knowledge Embeddings</strong> (vetores numéricos contextuais) através da API da OpenAI (`text-embedding-3-small`).<br /><br />
                                        Isso permite que a Aimee interprete de forma semântica o desejo exato do lead e identifique imóveis ideais baseados na semelhança do contexto e filtros quantitativos. Esta busca é limitada aos imóveis cadastrados neste tenant!
                                    </p>
                                </div>
                            </div>

                            {/* Stats do Banco e Sincronização */}
                            <div className="space-y-6">
                                <div className="bg-card border border-border rounded-xl p-5 md:p-6 flex flex-col items-center justify-center text-center">
                                    <Database className="h-10 w-10 text-[hsl(250_70%_60%)] mb-3 opacity-80" />
                                    <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Visão do Catálogo</h3>
                                    <div className="flex items-center justify-center gap-8 my-2">
                                        <div className="flex flex-col items-center">
                                            <div className="text-4xl font-display font-bold text-foreground">
                                                {loading ? <span className="animate-pulse">...</span> : catalogStats.total}
                                            </div>
                                            <div className="text-[10px] uppercase font-bold text-muted-foreground mt-1">Imóveis BD</div>
                                        </div>

                                        <div className="h-10 w-px bg-border"></div>

                                        <div className="flex flex-col items-center">
                                            <div className="text-4xl font-display font-bold text-indigo-500">
                                                {loading ? <span className="animate-pulse">...</span> : (catalogStats.pending || 0)}
                                            </div>
                                            <div className="text-[10px] uppercase font-bold text-indigo-500/80 mt-1 flex items-center gap-1"><Clock className="w-3 h-3" /> Fila IA</div>
                                        </div>
                                    </div>

                                    {catalogStats.lastSync ? (
                                        <div className="flex items-center justify-center gap-1.5 text-[10px] text-emerald-500 font-medium bg-emerald-500/10 py-1 px-2.5 rounded-full mx-auto w-fit mt-1">
                                            <CheckCircle2 className="h-3 w-3" />
                                            Sincronizado {new Date(catalogStats.lastSync).toLocaleString('pt-BR')}
                                        </div>
                                    ) : (
                                        <div className="flex items-center justify-center gap-1.5 text-[10px] text-amber-500 font-medium bg-amber-500/10 py-1 px-2.5 rounded-full mx-auto w-fit mt-1">
                                            <Clock className="h-3 w-3" />
                                            Nunca sincronizado
                                        </div>
                                    )}

                                    <Separator className="my-5 w-full bg-border/50" />

                                    <Button
                                        onClick={handleSyncCatalog}
                                        disabled={syncingXml || !xmlUrl}
                                        className="w-full bg-[hsl(250_70%_60%)] hover:bg-[hsl(250_70%_50%)] text-white shadow-lg shadow-[hsl(250_70%_60%_/0.2)]"
                                    >
                                        {syncingXml ? (
                                            <><RefreshCw className="h-4 w-4 mr-2 animate-spin" /> Processando Vetores...</>
                                        ) : (
                                            <><RefreshCw className="h-4 w-4 mr-2" /> Forçar Sincronização</>
                                        )}
                                    </Button>
                                    <p className="text-[10px] text-muted-foreground mt-3">Essa ação invocará processos de inteligência artificial de leitura e geração de embeddings e pode demorar.</p>
                                </div>
                            </div>

                        </div>
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
                                <h3 className="text-sm font-semibold text-foreground">Usuários ({users.length})</h3>
                                <Button size="sm" onClick={() => setInviteOpen(true)}>
                                    <UserPlus className="h-4 w-4 mr-1.5" />
                                    Criar Usuário
                                </Button>
                            </div>
                            {users.length === 0 ? (
                                <div className="flex flex-col items-center justify-center py-8">
                                    <Users className="h-8 w-8 text-muted-foreground/30 mb-2" />
                                    <p className="text-sm text-muted-foreground">Nenhum usuário cadastrado</p>
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
                                            <button
                                                onClick={() => { setEditRoleUser(user); setEditRoleValue(user.role); }}
                                                className="p-1.5 rounded text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
                                                title="Alterar papel"
                                            >
                                                <Pencil className="h-4 w-4" />
                                            </button>
                                            <button
                                                onClick={() => { setResetPwdUser(user); setResetPwdValue(''); }}
                                                className="p-1.5 rounded text-muted-foreground hover:text-amber-500 hover:bg-amber-500/10 transition-colors"
                                                title="Redefinir senha"
                                            >
                                                <KeyRound className="h-4 w-4" />
                                            </button>
                                            <button
                                                onClick={() => { setRemoveUserId(user.id); setRemoveName(user.full_name); }}
                                                className="p-1.5 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                                                title="Remover usuário"
                                            >
                                                <Trash2 className="h-4 w-4" />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Dialog: Criar Usuário */}
                        <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
                            <DialogContent>
                                <DialogHeader>
                                    <DialogTitle>Criar Usuário</DialogTitle>
                                </DialogHeader>
                                <div className="space-y-4 py-2">
                                    <div className="space-y-1.5">
                                        <Label htmlFor="invite-email">E-mail</Label>
                                        <Input
                                            id="invite-email"
                                            type="email"
                                            placeholder="email@empresa.com"
                                            value={inviteForm.email}
                                            onChange={(e) => setInviteForm((f) => ({ ...f, email: e.target.value }))}
                                        />
                                    </div>
                                    <div className="space-y-1.5">
                                        <Label htmlFor="invite-name">Nome completo</Label>
                                        <Input
                                            id="invite-name"
                                            placeholder="João Silva"
                                            value={inviteForm.full_name}
                                            onChange={(e) => setInviteForm((f) => ({ ...f, full_name: e.target.value }))}
                                        />
                                    </div>
                                    <div className="space-y-1.5">
                                        <Label htmlFor="invite-password">Senha</Label>
                                        <Input
                                            id="invite-password"
                                            type="password"
                                            placeholder="Mínimo 8 caracteres"
                                            value={inviteForm.password}
                                            onChange={(e) => setInviteForm((f) => ({ ...f, password: e.target.value }))}
                                        />
                                    </div>
                                    <div className="space-y-1.5">
                                        <Label htmlFor="invite-role">Papel</Label>
                                        <Select
                                            value={inviteForm.role}
                                            onValueChange={(v) => setInviteForm((f) => ({ ...f, role: v }))}
                                        >
                                            <SelectTrigger id="invite-role">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="admin">Admin</SelectItem>
                                                <SelectItem value="operator">Operador</SelectItem>
                                                <SelectItem value="viewer">Visualizador</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                </div>
                                <DialogFooter>
                                    <Button variant="outline" onClick={() => setInviteOpen(false)} disabled={inviteLoading}>
                                        Cancelar
                                    </Button>
                                    <Button onClick={handleInviteUser} disabled={inviteLoading || !inviteForm.email || !inviteForm.full_name || inviteForm.password.length < 8}>
                                        {inviteLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Criar usuário'}
                                    </Button>
                                </DialogFooter>
                            </DialogContent>
                        </Dialog>

                        {/* Dialog: Alterar Papel */}
                        <Dialog open={!!editRoleUser} onOpenChange={(o) => { if (!o) setEditRoleUser(null); }}>
                            <DialogContent>
                                <DialogHeader>
                                    <DialogTitle>Alterar Papel</DialogTitle>
                                </DialogHeader>
                                <div className="space-y-4 py-2">
                                    <p className="text-sm text-muted-foreground">
                                        Alterando papel de <span className="font-medium text-foreground">{editRoleUser?.full_name}</span>
                                    </p>
                                    <div className="space-y-1.5">
                                        <Label htmlFor="edit-role">Papel</Label>
                                        <Select value={editRoleValue} onValueChange={setEditRoleValue}>
                                            <SelectTrigger id="edit-role">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="admin">Admin</SelectItem>
                                                <SelectItem value="operator">Operador</SelectItem>
                                                <SelectItem value="viewer">Visualizador</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                </div>
                                <DialogFooter>
                                    <Button variant="outline" onClick={() => setEditRoleUser(null)} disabled={editRoleLoading}>
                                        Cancelar
                                    </Button>
                                    <Button onClick={handleUpdateRole} disabled={editRoleLoading || !editRoleValue}>
                                        {editRoleLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Salvar'}
                                    </Button>
                                </DialogFooter>
                            </DialogContent>
                        </Dialog>

                        {/* Dialog: Redefinir Senha */}
                        <Dialog open={!!resetPwdUser} onOpenChange={(o) => { if (!o) { setResetPwdUser(null); setResetPwdValue(''); } }}>
                            <DialogContent>
                                <DialogHeader>
                                    <DialogTitle>Redefinir Senha</DialogTitle>
                                </DialogHeader>
                                <div className="space-y-4 py-2">
                                    <p className="text-sm text-muted-foreground">
                                        Definindo nova senha para <span className="font-medium text-foreground">{resetPwdUser?.full_name}</span>
                                    </p>
                                    <div className="space-y-1.5">
                                        <Label htmlFor="reset-pwd">Nova senha</Label>
                                        <Input
                                            id="reset-pwd"
                                            type="password"
                                            placeholder="Mínimo 8 caracteres"
                                            value={resetPwdValue}
                                            onChange={(e) => setResetPwdValue(e.target.value)}
                                        />
                                    </div>
                                </div>
                                <DialogFooter>
                                    <Button variant="outline" onClick={() => { setResetPwdUser(null); setResetPwdValue(''); }} disabled={resetPwdLoading}>
                                        Cancelar
                                    </Button>
                                    <Button onClick={handleResetPassword} disabled={resetPwdLoading || resetPwdValue.length < 8}>
                                        {resetPwdLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Salvar'}
                                    </Button>
                                </DialogFooter>
                            </DialogContent>
                        </Dialog>

                        {/* ConfirmDialog: Remover usuário */}
                        <ConfirmDialog
                            open={!!removeUserId}
                            onOpenChange={(o) => { if (!o) setRemoveUserId(null); }}
                            title="Remover usuário"
                            description={`Tem certeza que deseja remover ${removeName}? Esta ação irá excluir o acesso do usuário à plataforma e não pode ser desfeita.`}
                            confirmLabel="Remover"
                            variant="destructive"
                            loading={removeLoading}
                            onConfirm={handleRemoveUser}
                        />
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
