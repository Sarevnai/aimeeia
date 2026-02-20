import React, { useState } from 'react';
import {
    DollarSign,
    TrendingUp,
    AlertTriangle,
    CreditCard,
    CheckCircle2,
    Users,
    Pencil,
    Check,
    X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import AdminMetricCard from '@/components/admin/AdminMetricCard';
import TenantStatusBadge, { type TenantStatus } from '@/components/admin/TenantStatusBadge';

// ── Mock data ─────────────────────────────────────────────────────────

const billingMetrics = {
    mrr: 4773,
    arr: 57276,
    churnRate: 2.1,
    avgLtv: 14319,
};

const plans = [
    {
        slug: 'starter',
        name: 'Starter',
        monthlyPrice: 297,
        annualPrice: 2970,
        maxConversations: 500,
        maxUsers: 3,
        features: ['WhatsApp', 'Leads básico'],
        activeCount: 3,
        color: 'hsl(207 65% 44%)',
    },
    {
        slug: 'pro',
        name: 'Pro',
        monthlyPrice: 597,
        annualPrice: 5970,
        maxConversations: 2000,
        maxUsers: 10,
        features: ['WhatsApp', 'Portal Leads', 'Campanhas', 'Relatórios'],
        activeCount: 5,
        color: 'hsl(250 70% 60%)',
    },
    {
        slug: 'enterprise',
        name: 'Enterprise',
        monthlyPrice: 997,
        annualPrice: 9970,
        maxConversations: null,
        maxUsers: null,
        features: ['Tudo Pro', 'API Access', 'Agente customizado', 'Suporte dedicado'],
        activeCount: 1,
        color: 'hsl(38 92% 50%)',
    },
];

const subscriptions: {
    tenant: string;
    plan: string;
    status: TenantStatus;
    mrr: number;
    nextBilling: string;
    cycle: string;
}[] = [
        { tenant: 'Smolka Imóveis', plan: 'Pro', status: 'active', mrr: 597, nextBilling: '2026-03-15', cycle: 'Mensal' },
        { tenant: 'Casa Verde Imobiliária', plan: 'Enterprise', status: 'active', mrr: 997, nextBilling: '2026-03-20', cycle: 'Mensal' },
        { tenant: 'Porto Seguro Realty', plan: 'Pro', status: 'active', mrr: 597, nextBilling: '2026-03-10', cycle: 'Mensal' },
        { tenant: 'Horizonte Imóveis', plan: 'Starter', status: 'active', mrr: 297, nextBilling: '2026-03-05', cycle: 'Mensal' },
        { tenant: 'Nova Era Construtora', plan: 'Pro', status: 'trial', mrr: 0, nextBilling: '—', cycle: 'Trial' },
        { tenant: 'Alto Padrão Imóveis', plan: 'Starter', status: 'trial', mrr: 0, nextBilling: '—', cycle: 'Trial' },
        { tenant: 'Real Estate SP', plan: 'Pro', status: 'past_due', mrr: 597, nextBilling: '2026-02-15', cycle: 'Mensal' },
    ];

// ── Component ─────────────────────────────────────────────────────────

const AdminBillingPage: React.FC = () => {
    return (
        <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto animate-fade-in">
            {/* Header */}
            <div>
                <h1 className="font-display text-2xl font-bold text-foreground">Billing</h1>
                <p className="text-sm text-muted-foreground mt-1">Gestão financeira e planos da plataforma</p>
            </div>

            {/* KPIs */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <AdminMetricCard
                    title="MRR"
                    value={`R$ ${billingMetrics.mrr.toLocaleString('pt-BR')}`}
                    subtitle="Monthly Recurring Revenue"
                    icon={DollarSign}
                    trend={{ value: 13.6, label: 'vs mês anterior' }}
                    accentColor="hsl(142 71% 45%)"
                />
                <AdminMetricCard
                    title="ARR"
                    value={`R$ ${billingMetrics.arr.toLocaleString('pt-BR')}`}
                    subtitle="Annual Recurring Revenue"
                    icon={TrendingUp}
                    accentColor="hsl(250 70% 60%)"
                />
                <AdminMetricCard
                    title="Churn Rate"
                    value={`${billingMetrics.churnRate}%`}
                    subtitle="Últimos 30 dias"
                    icon={AlertTriangle}
                    accentColor="hsl(38 92% 50%)"
                />
                <AdminMetricCard
                    title="LTV Médio"
                    value={`R$ ${billingMetrics.avgLtv.toLocaleString('pt-BR')}`}
                    subtitle="Lifetime Value"
                    icon={CreditCard}
                    trend={{ value: 8.4, label: 'vs trimestre anterior' }}
                    accentColor="hsl(207 65% 44%)"
                />
            </div>

            {/* Plans */}
            <div>
                <h2 className="text-sm font-semibold text-foreground mb-3">Planos Disponíveis</h2>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {plans.map((plan) => (
                        <div key={plan.slug} className="bg-card border border-border rounded-xl p-5 card-interactive">
                            <div className="flex items-center justify-between mb-4">
                                <div className="flex items-center gap-2">
                                    <div
                                        className="w-3 h-3 rounded-full"
                                        style={{ backgroundColor: plan.color }}
                                    />
                                    <h3 className="text-lg font-bold text-foreground font-display">{plan.name}</h3>
                                </div>
                                <Button variant="ghost" size="icon" className="h-7 w-7">
                                    <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                                </Button>
                            </div>

                            <div className="mb-4">
                                <span className="text-2xl font-bold text-foreground">
                                    R$ {plan.monthlyPrice}
                                </span>
                                <span className="text-sm text-muted-foreground">/mês</span>
                            </div>

                            <div className="space-y-2 mb-4">
                                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                    <Users className="h-3.5 w-3.5" />
                                    <span>{plan.maxUsers ? `Até ${plan.maxUsers} usuários` : 'Usuários ilimitados'}</span>
                                </div>
                                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                    <CreditCard className="h-3.5 w-3.5" />
                                    <span>{plan.maxConversations ? `${plan.maxConversations} conversas/mês` : 'Conversas ilimitadas'}</span>
                                </div>
                            </div>

                            <div className="pt-3 border-t border-border/50 space-y-1.5">
                                {plan.features.map((f) => (
                                    <div key={f} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                        <CheckCircle2 className="h-3 w-3 text-emerald-500 shrink-0" />
                                        {f}
                                    </div>
                                ))}
                            </div>

                            <div className="mt-4 pt-3 border-t border-border/50">
                                <span className="text-xs text-muted-foreground">
                                    {plan.activeCount} tenant{plan.activeCount !== 1 ? 's' : ''} ativo{plan.activeCount !== 1 ? 's' : ''}
                                </span>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Subscriptions Table */}
            <div className="bg-card border border-border rounded-xl p-5">
                <h2 className="text-sm font-semibold text-foreground mb-4">Assinaturas</h2>
                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead>
                            <tr className="border-b border-border">
                                <th className="text-left text-xs font-medium text-muted-foreground pb-3 pr-4">Tenant</th>
                                <th className="text-left text-xs font-medium text-muted-foreground pb-3 pr-4">Plano</th>
                                <th className="text-left text-xs font-medium text-muted-foreground pb-3 pr-4">Status</th>
                                <th className="text-right text-xs font-medium text-muted-foreground pb-3 pr-4">MRR</th>
                                <th className="text-left text-xs font-medium text-muted-foreground pb-3 pr-4 hidden md:table-cell">Ciclo</th>
                                <th className="text-left text-xs font-medium text-muted-foreground pb-3 hidden lg:table-cell">Próx. Cobrança</th>
                            </tr>
                        </thead>
                        <tbody>
                            {subscriptions.map((sub, i) => (
                                <tr key={i} className="border-b border-border/50 last:border-0 hover:bg-muted/30 transition-colors">
                                    <td className="py-3 pr-4">
                                        <span className="text-sm font-medium text-foreground">{sub.tenant}</span>
                                    </td>
                                    <td className="py-3 pr-4">
                                        <span className="text-xs font-medium text-muted-foreground bg-muted px-2 py-0.5 rounded">{sub.plan}</span>
                                    </td>
                                    <td className="py-3 pr-4">
                                        <TenantStatusBadge status={sub.status} />
                                    </td>
                                    <td className="py-3 pr-4 text-right">
                                        <span className="text-sm font-semibold text-foreground">
                                            {sub.mrr > 0 ? `R$ ${sub.mrr}` : '—'}
                                        </span>
                                    </td>
                                    <td className="py-3 pr-4 hidden md:table-cell">
                                        <span className="text-xs text-muted-foreground">{sub.cycle}</span>
                                    </td>
                                    <td className="py-3 hidden lg:table-cell">
                                        <span className="text-xs text-muted-foreground">{sub.nextBilling}</span>
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

export default AdminBillingPage;
