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
    Megaphone,
    Send,
    Home,
    CheckCircle,
    FileText,
    Plus,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import TenantStatusBadge from '@/components/admin/TenantStatusBadge';
import AdminMetricCard from '@/components/admin/AdminMetricCard';
import ConfirmDialog from '@/components/ConfirmDialog';
import AdminNewCampaignSheet from '@/components/admin/AdminNewCampaignSheet';
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

    // ── Campaigns state ────────────────────────────────────────────────
    const [tenantCampaigns, setTenantCampaigns] = useState<any[]>([]);
    const [tenantUpdateCampaigns, setTenantUpdateCampaigns] = useState<any[]>([]);
    const [loadingCampaigns, setLoadingCampaigns] = useState(false);
    const [campaignSheetOpen, setCampaignSheetOpen] = useState(false);

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
                    detail: 'Não configurado',
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
                    detail: 'API key não configurada',
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
                    name: 'Busca de Imóveis (Vista)',
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
                <p className="text-sm text-muted-foreground">Tenant não encontrado</p>
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
                            { value: 'overview', label: 'Visão Geral', icon: Building2 },
                            { value: 'agent', label: 'Config IA', icon: Bot },
                            { value: 'billing', label: 'Billing', icon: CreditCard },
                            { value: 'users', label: 'Usuários', icon: Users },
                            { value: 'integrations', label: 'Integrações', icon: Plug },
                            { value: 'campaigns', label: 'Campanhas', icon: Megaphone },
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
                                title="Conversas (mês)"
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
                                title="Taxa de Qualificação"
                                value={`${qualificationRate}%`}
                                subtitle={`${metrics.leads_qualified} de ${metrics.contacts_total} contatos`}
                                icon={Clock}
                                accentColor="hsl(250 70% 60%)"
                            />
                        </div>

                        {/* Tenant Info */}
                        <div className="bg-card border border-border rounded-xl p-5">
                            <h3 className="text-sm font-semibold text-foreground mb-3">Informações do Tenant</h3>
                            <div className="space-y-3">
                                {[
                                    { label: 'ID', value: tenant.id },
                                    { label: 'Empresa', value: tenant.company_name },
                                    { label: 'Localização', value: `${tenant.city}/${tenant.state}` },
                                    { label: 'Status', value: tenant.is_active ? 'Ativo' : 'Inativo' },
                                    { label: 'CRM', value: tenant.crm_type || 'Não configurado' },
                                    { label: 'WhatsApp', value: tenant.wa_phone_number_id || 'Não configurado' },
                                    { label: 'Usuários', value: `${users.length}` },
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
                                <h3 className="text-sm font-semibold text-foreground mb-4">Configuração do Agente</h3>
                                <div className="space-y-4">
                                    {[
                                        { label: 'Nome do Agente', value: agentConfig.agent_name },
                                        { label: 'Tom', value: agentConfig.tone },
                                        { label: 'Modelo IA', value: agentConfig.ai_model },
                                        { label: 'Mensagem de saudação', value: agentConfig.greeting_message || 'Não definida' },
                                        { label: 'Mensagem de fallback', value: agentConfig.fallback_message || 'Não definida' },
                                        { label: 'Áudio habilitado', value: agentConfig.audio_enabled ? 'Sim' : 'Não' },
                                        { label: 'Intensidade de emojis', value: agentConfig.emoji_intensity },
                                        { label: 'Busca Vista ativa', value: agentConfig.vista_integration_enabled ? 'Sim' : 'Não' },
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
                                    <p className="text-sm text-muted-foreground">Nenhuma configuração de agente encontrada</p>
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {activeTab === 'billing' && (
                    <div className="space-y-4 max-w-3xl mx-auto animate-fade-in">
                        <div className="bg-card border border-border rounded-xl p-5">
                            <h3 className="text-sm font-semibold text-foreground mb-4">Informações de Billing</h3>
                            <div className="flex flex-col items-center justify-center py-8">
                                <CreditCard className="h-8 w-8 text-muted-foreground/30 mb-2" />
                                <p className="text-sm text-muted-foreground">Sistema de billing em desenvolvimento</p>
                                <p className="text-xs text-muted-foreground mt-1">Planos e cobranças serão exibidos após implementação</p>
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
                            <h3 className="text-sm font-semibold text-foreground mb-4">Integrações</h3>
                            {integrations.length === 0 ? (
                                <div className="flex flex-col items-center justify-center py-8">
                                    <Plug className="h-8 w-8 text-muted-foreground/30 mb-2" />
                                    <p className="text-sm text-muted-foreground">Nenhuma integração configurada</p>
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

                {/* ═══ CAMPAIGNS TAB ═══ */}
                {activeTab === 'campaigns' && (
                    <div className="space-y-4 max-w-5xl mx-auto animate-fade-in">
                        <div className="flex items-center justify-between">
                            <div>
                                <h3 className="text-base font-semibold text-foreground">Campanhas do Tenant</h3>
                                <p className="text-xs text-muted-foreground mt-0.5">Campanhas de marketing e pedidos de atualização de carteira.</p>
                            </div>
                            <Button size="sm" className="gap-1.5" onClick={async () => {
                                setLoadingCampaigns(true);
                                const [mkt, upd] = await Promise.all([
                                    supabase.from('campaigns').select('*').eq('tenant_id', id!).order('created_at', { ascending: false }),
                                    supabase.from('owner_update_campaigns').select('*').eq('tenant_id', id!).order('created_at', { ascending: false }),
                                ]);
                                setTenantCampaigns(mkt.data ?? []);
                                setTenantUpdateCampaigns(upd.data ?? []);
                                setLoadingCampaigns(false);
                                setCampaignSheetOpen(true);
                            }}>
                                <Plus className="h-4 w-4" /> Nova Campanha
                            </Button>
                        </div>

                        {/* Load campaigns lazily */}
                        {activeTab === 'campaigns' && tenantCampaigns.length === 0 && tenantUpdateCampaigns.length === 0 && !loadingCampaigns ? (
                            <div>
                                <LoadCampaignsButton tenantId={id!} onLoad={(mkt, upd) => { setTenantCampaigns(mkt); setTenantUpdateCampaigns(upd); }} />
                            </div>
                        ) : loadingCampaigns ? (
                            <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin" /></div>
                        ) : (
                            <>
                                {/* Marketing campaigns */}
                                {tenantCampaigns.length > 0 && (
                                    <div className="space-y-2">
                                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Marketing ({tenantCampaigns.length})</p>
                                        {tenantCampaigns.map((c: any) => (
                                            <div key={c.id} className="flex items-center gap-3 rounded-xl bg-card border border-border p-4 shadow-sm">
                                                <div className="p-2 rounded-lg bg-primary/10 text-primary shrink-0">
                                                    <Megaphone className="h-4 w-4" />
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-sm font-semibold truncate">{c.name}</p>
                                                    {c.template_name && <p className="text-[11px] font-mono text-muted-foreground">{c.template_name}</p>}
                                                </div>
                                                <div className="text-xs text-right text-muted-foreground">
                                                    <p>{c.sent_count || 0} enviados</p>
                                                    <p>{c.delivered_count || 0} entregues</p>
                                                </div>
                                                <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${c.status === 'sent' ? 'bg-success/15 text-success' :
                                                    c.status === 'draft' ? 'bg-muted text-muted-foreground' : 'bg-warning/15 text-warning'
                                                    }`}>{c.status || 'draft'}</span>
                                            </div>
                                        ))}
                                    </div>
                                )}
                                {/* Update campaigns */}
                                {tenantUpdateCampaigns.length > 0 && (
                                    <div className="space-y-2">
                                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Atualização de Carteira ({tenantUpdateCampaigns.length})</p>
                                        {tenantUpdateCampaigns.map((c: any) => (
                                            <div key={c.id} className="flex items-center gap-3 rounded-xl bg-card border border-border p-4 shadow-sm">
                                                <div className="p-2 rounded-lg bg-warning/10 text-warning shrink-0">
                                                    <Home className="h-4 w-4" />
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-sm font-semibold truncate">{c.name}</p>
                                                    {c.description && <p className="text-[11px] text-muted-foreground truncate">{c.description}</p>}
                                                </div>
                                                <div className="text-xs text-right text-muted-foreground">
                                                    <p>{c.total_contacts || 0} proprietários</p>
                                                    <p>{c.contacted_count || 0} contatados</p>
                                                </div>
                                                <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${c.status === 'completed' ? 'bg-success/15 text-success' :
                                                    c.status === 'draft' ? 'bg-muted text-muted-foreground' :
                                                        c.status === 'in_progress' ? 'bg-warning/15 text-warning' : 'bg-info/15 text-info'
                                                    }`}>{c.status || 'draft'}</span>
                                            </div>
                                        ))}
                                    </div>
                                )}
                                {tenantCampaigns.length === 0 && tenantUpdateCampaigns.length === 0 && (
                                    <div className="flex flex-col items-center py-16 text-center">
                                        <Megaphone className="h-10 w-10 text-muted-foreground/30 mb-3" />
                                        <p className="text-sm text-muted-foreground">Nenhuma campanha para este tenant.</p>
                                        <Button size="sm" className="gap-1.5 mt-4" onClick={() => setCampaignSheetOpen(true)}>
                                            <Plus className="h-4 w-4" /> Criar Campanha
                                        </Button>
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                )}
            </div>

            <AdminNewCampaignSheet
                open={campaignSheetOpen}
                onOpenChange={setCampaignSheetOpen}
                preselectedTenantId={id || null}
                onCreated={async () => {
                    const [mkt, upd] = await Promise.all([
                        supabase.from('campaigns').select('*').eq('tenant_id', id!).order('created_at', { ascending: false }),
                        supabase.from('owner_update_campaigns').select('*').eq('tenant_id', id!).order('created_at', { ascending: false }),
                    ]);
                    setTenantCampaigns(mkt.data ?? []);
                    setTenantUpdateCampaigns(upd.data ?? []);
                }}
            />
        </div>
    );
};

/* ── Lazy campaign loader sub-component ── */
const LoadCampaignsButton: React.FC<{
    tenantId: string;
    onLoad: (mkt: any[], upd: any[]) => void;
}> = ({ tenantId, onLoad }) => {
    const [loading, setLoading] = React.useState(false);
    const load = async () => {
        setLoading(true);
        const [mkt, upd] = await Promise.all([
            supabase.from('campaigns').select('*').eq('tenant_id', tenantId).order('created_at', { ascending: false }),
            supabase.from('owner_update_campaigns').select('*').eq('tenant_id', tenantId).order('created_at', { ascending: false }),
        ]);
        onLoad(mkt.data ?? [], upd.data ?? []);
        setLoading(false);
    };
    return (
        <div className="flex flex-col items-center py-10 text-center">
            <Megaphone className="h-10 w-10 text-muted-foreground/30 mb-3" />
            <p className="text-sm text-muted-foreground mb-3">Clique para carregar as campanhas deste tenant.</p>
            <Button size="sm" variant="outline" onClick={load} disabled={loading} className="gap-1.5">
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Megaphone className="h-4 w-4" />}
                Carregar Campanhas
            </Button>
        </div>
    );
};

export default AdminTenantDetailPage;

