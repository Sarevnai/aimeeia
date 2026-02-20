import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
    ArrowLeft,
    Building2,
    MessageSquare,
    Users,
    Bot,
    CreditCard,
    Settings,
    Plug,
    ExternalLink,
    CheckCircle2,
    XCircle,
    Clock,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import TenantStatusBadge from '@/components/admin/TenantStatusBadge';
import AdminMetricCard from '@/components/admin/AdminMetricCard';

// ── Mock data ────────────────────────────────────────────────────────

const tenantDetail = {
    id: '1',
    company_name: 'Smolka Imóveis',
    city: 'Porto Alegre',
    state: 'RS',
    plan: 'Pro',
    status: 'active' as const,
    created_at: '2025-08-15',
    onboarded_at: '2025-08-20',
    wa_phone_number_id: '789298680936028',
    crm_type: 'Vista',
    is_active: true,
    admin_notes: 'Cliente parceiro desde 2025. Alto engajamento.',
    metrics: {
        conversations_month: 423,
        leads_month: 89,
        leads_qualified: 34,
        ai_messages: 2147,
        response_time_avg: '12s',
        qualification_rate: '38.2%',
    },
    users: [
        { name: 'Ian Veras', role: 'admin', email: 'ian@smolka.com', last_active: '2026-02-20' },
        { name: 'Maria Silva', role: 'operator', email: 'maria@smolka.com', last_active: '2026-02-19' },
        { name: 'João Santos', role: 'operator', email: 'joao@smolka.com', last_active: '2026-02-18' },
    ],
    agent_config: {
        agent_name: 'Aimee',
        tone: 'professional',
        ai_model: 'gpt-4o',
        greeting_message: 'Olá! Sou a Aimee, assistente virtual da Smolka Imóveis. Como posso ajudar?',
        departments_active: ['locacao', 'vendas'],
    },
    integrations: [
        { name: 'WhatsApp Business', status: 'connected', icon: '💬', detail: 'WABA: 789298680936028' },
        { name: 'Vista CRM', status: 'connected', icon: '🏢', detail: 'API v2.0 — Sync ativo' },
        { name: 'Portal ZAP', status: 'pending', icon: '🌐', detail: 'Webhook pendente' },
        { name: 'Portal VivaReal', status: 'disconnected', icon: '🔴', detail: 'Não configurado' },
    ],
    billing: {
        plan_name: 'Pro',
        mrr: 597,
        billing_cycle: 'monthly',
        next_billing: '2026-03-15',
        payment_method: 'Cartão final 4242',
    },
};

// ── Component ────────────────────────────────────────────────────────

const AdminTenantDetailPage: React.FC = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const [activeTab, setActiveTab] = useState('overview');
    const tenant = tenantDetail; // Will be fetched by id

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
                                <TenantStatusBadge status={tenant.status} />
                            </div>
                            <p className="text-sm text-muted-foreground">
                                {tenant.city}/{tenant.state} • Criado em {new Date(tenant.created_at).toLocaleDateString('pt-BR')}
                            </p>
                        </div>
                    </div>
                    <Button variant="outline" size="sm" className="gap-1.5 hidden sm:flex">
                        <ExternalLink className="h-3.5 w-3.5" />
                        Acessar como tenant
                    </Button>
                </div>

                <Tabs value={activeTab} onValueChange={setActiveTab}>
                    <TabsList className="bg-transparent h-auto p-0 gap-0">
                        {[
                            { value: 'overview', label: 'Visão Geral', icon: Building2 },
                            { value: 'agent', label: 'Config IA', icon: Bot },
                            { value: 'billing', label: 'Billing', icon: CreditCard },
                            { value: 'users', label: 'Usuários', icon: Users },
                            { value: 'integrations', label: 'Integrações', icon: Plug },
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
                                value={tenant.metrics.conversations_month}
                                icon={MessageSquare}
                                accentColor="hsl(207 65% 44%)"
                            />
                            <AdminMetricCard
                                title="Leads Gerados"
                                value={tenant.metrics.leads_month}
                                subtitle={`${tenant.metrics.leads_qualified} qualificados`}
                                icon={Users}
                                accentColor="hsl(142 71% 45%)"
                            />
                            <AdminMetricCard
                                title="Tempo médio resposta"
                                value={tenant.metrics.response_time_avg}
                                subtitle={`Taxa qualificação: ${tenant.metrics.qualification_rate}`}
                                icon={Clock}
                                accentColor="hsl(250 70% 60%)"
                            />
                        </div>

                        {/* Notes */}
                        <div className="bg-card border border-border rounded-xl p-5">
                            <h3 className="text-sm font-semibold text-foreground mb-2">Notas Admin</h3>
                            <p className="text-sm text-muted-foreground">{tenant.admin_notes || 'Nenhuma nota adicionada.'}</p>
                        </div>
                    </div>
                )}

                {activeTab === 'agent' && (
                    <div className="space-y-4 max-w-3xl mx-auto animate-fade-in">
                        <div className="bg-card border border-border rounded-xl p-5">
                            <h3 className="text-sm font-semibold text-foreground mb-4">Configuração do Agente</h3>
                            <div className="space-y-4">
                                {[
                                    { label: 'Nome do Agente', value: tenant.agent_config.agent_name },
                                    { label: 'Tom', value: tenant.agent_config.tone },
                                    { label: 'Modelo IA', value: tenant.agent_config.ai_model },
                                    { label: 'Mensagem de saudação', value: tenant.agent_config.greeting_message },
                                    { label: 'Departamentos ativos', value: tenant.agent_config.departments_active.join(', ') },
                                ].map(({ label, value }) => (
                                    <div key={label} className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4 py-2 border-b border-border/50 last:border-0">
                                        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide min-w-[160px]">{label}</span>
                                        <span className="text-sm text-foreground">{value}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                )}

                {activeTab === 'billing' && (
                    <div className="space-y-4 max-w-3xl mx-auto animate-fade-in">
                        <div className="bg-card border border-border rounded-xl p-5">
                            <h3 className="text-sm font-semibold text-foreground mb-4">Informações de Billing</h3>
                            <div className="space-y-4">
                                {[
                                    { label: 'Plano', value: tenant.billing.plan_name },
                                    { label: 'MRR', value: `R$ ${tenant.billing.mrr.toLocaleString('pt-BR')}` },
                                    { label: 'Ciclo', value: tenant.billing.billing_cycle === 'monthly' ? 'Mensal' : 'Anual' },
                                    { label: 'Próxima cobrança', value: new Date(tenant.billing.next_billing).toLocaleDateString('pt-BR') },
                                    { label: 'Método de pagamento', value: tenant.billing.payment_method },
                                ].map(({ label, value }) => (
                                    <div key={label} className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4 py-2 border-b border-border/50 last:border-0">
                                        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide min-w-[160px]">{label}</span>
                                        <span className="text-sm text-foreground font-medium">{value}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                )}

                {activeTab === 'users' && (
                    <div className="space-y-4 max-w-3xl mx-auto animate-fade-in">
                        <div className="bg-card border border-border rounded-xl p-5">
                            <div className="flex items-center justify-between mb-4">
                                <h3 className="text-sm font-semibold text-foreground">Usuários ({tenant.users.length})</h3>
                            </div>
                            <div className="space-y-2">
                                {tenant.users.map((user) => (
                                    <div key={user.email} className="flex items-center gap-3 p-3 rounded-lg border border-border/50 hover:bg-muted/30 transition-colors">
                                        <div className="flex items-center justify-center w-9 h-9 rounded-full bg-muted text-xs font-bold text-foreground shrink-0">
                                            {user.name.split(' ').map(n => n[0]).join('').toUpperCase()}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm font-medium text-foreground">{user.name}</p>
                                            <p className="text-xs text-muted-foreground">{user.email}</p>
                                        </div>
                                        <span className="text-xs font-medium text-muted-foreground bg-muted px-2 py-0.5 rounded capitalize">
                                            {user.role}
                                        </span>
                                        <span className="text-xs text-muted-foreground hidden sm:inline">
                                            Ativo: {new Date(user.last_active).toLocaleDateString('pt-BR')}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                )}

                {activeTab === 'integrations' && (
                    <div className="space-y-4 max-w-3xl mx-auto animate-fade-in">
                        <div className="bg-card border border-border rounded-xl p-5">
                            <h3 className="text-sm font-semibold text-foreground mb-4">Integrações</h3>
                            <div className="space-y-3">
                                {tenant.integrations.map((integration) => (
                                    <div key={integration.name} className="flex items-center gap-3 p-3 rounded-lg border border-border/50">
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
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default AdminTenantDetailPage;
