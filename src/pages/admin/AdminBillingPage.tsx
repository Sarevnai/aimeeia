import React from 'react';
import {
    CheckCircle2,
    CreditCard,
    Download,
    FileClock,
    Gauge,
    ReceiptText,
    Sparkles,
    Users,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import AdminMetricCard from '@/components/admin/AdminMetricCard';

const accountSummary = {
    agency: 'Casa da Lais',
    currentPlan: 'Pro',
    monthlyPrice: 597,
    billingDay: 15,
    trialEndsAt: null,
    usage: {
        conversations: { used: 1382, limit: 2000 },
        users: { used: 7, limit: 10 },
    },
};

const plans = [
    {
        slug: 'starter',
        name: 'Starter',
        monthlyPrice: 297,
        annualPrice: 2970,
        description: 'Para operação enxuta com foco em atendimento via WhatsApp.',
        features: ['Até 3 usuários', '500 conversas/mês', 'Leads básico', 'Suporte padrão'],
        highlighted: false,
    },
    {
        slug: 'pro',
        name: 'Pro',
        monthlyPrice: 597,
        annualPrice: 5970,
        description: 'Plano mais usado para escalar captação, campanhas e operação comercial.',
        features: ['Até 10 usuários', '2.000 conversas/mês', 'Portal Leads + Campanhas', 'Relatórios e automações'],
        highlighted: true,
    },
    {
        slug: 'enterprise',
        name: 'Enterprise',
        monthlyPrice: 997,
        annualPrice: 9970,
        description: 'Para times avançados com necessidade de personalização e alto volume.',
        features: ['Usuários ilimitados', 'Conversas ilimitadas', 'API + integrações customizadas', 'Suporte dedicado'],
        highlighted: false,
    },
];

const invoiceHistory = [
    { ref: 'FAT-2026-02', dueDate: '15/02/2026', amount: 597, status: 'Pago' },
    { ref: 'FAT-2026-01', dueDate: '15/01/2026', amount: 597, status: 'Pago' },
    { ref: 'FAT-2025-12', dueDate: '15/12/2025', amount: 597, status: 'Pago' },
    { ref: 'FAT-2025-11', dueDate: '15/11/2025', amount: 597, status: 'Pago' },
];

const pct = (used: number, limit: number) => Math.min(100, Math.round((used / limit) * 100));

const AdminBillingPage: React.FC = () => {
    return (
        <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto animate-fade-in">
            <div className="bg-gradient-to-r from-[#2F1C56] via-[#4B2E83] to-[#56308f] rounded-2xl p-5 md:p-6 text-white border border-[#7C5DB3]/40">
                <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                    <div>
                        <p className="text-xs uppercase tracking-[0.2em] text-white/70">Financeiro</p>
                        <h1 className="font-display text-2xl md:text-3xl font-bold mt-1">{accountSummary.agency}</h1>
                        <p className="text-sm text-white/80 mt-2 max-w-xl">
                            Gestão de plano, cobrança e consumo em um único painel. Estrutura inspirada no fluxo de
                            financeiro da Casa da Lais.
                        </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        <Button className="bg-white text-[#4B2E83] hover:bg-white/90">
                            <Download className="h-4 w-4 mr-2" />
                            Baixar boleto
                        </Button>
                        <Button variant="outline" className="border-white/40 text-white hover:bg-white/10">
                            <Sparkles className="h-4 w-4 mr-2" />
                            Alterar plano
                        </Button>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
                <AdminMetricCard
                    title="Plano atual"
                    value={accountSummary.currentPlan}
                    subtitle={`R$ ${accountSummary.monthlyPrice}/mês`}
                    icon={CreditCard}
                    accentColor="hsl(250 70% 60%)"
                />
                <AdminMetricCard
                    title="Próximo vencimento"
                    value={`${accountSummary.billingDay}/03/2026`}
                    subtitle="Cobrança mensal"
                    icon={FileClock}
                    accentColor="hsl(38 92% 50%)"
                />
                <AdminMetricCard
                    title="Uso de conversas"
                    value={`${accountSummary.usage.conversations.used}/${accountSummary.usage.conversations.limit}`}
                    subtitle={`${pct(accountSummary.usage.conversations.used, accountSummary.usage.conversations.limit)}% utilizado`}
                    icon={Gauge}
                    accentColor="hsl(142 71% 45%)"
                />
                <AdminMetricCard
                    title="Usuários ativos"
                    value={`${accountSummary.usage.users.used}/${accountSummary.usage.users.limit}`}
                    subtitle="Licenças em uso"
                    icon={Users}
                    accentColor="hsl(207 65% 44%)"
                />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <div className="lg:col-span-2 bg-card border border-border rounded-xl p-5">
                    <h2 className="text-sm font-semibold text-foreground mb-4">Planos disponíveis</h2>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        {plans.map((plan) => (
                            <div
                                key={plan.slug}
                                className={`rounded-xl border p-4 ${
                                    plan.highlighted
                                        ? 'border-primary/60 bg-primary/5 shadow-[0_0_0_1px_hsl(var(--primary)/0.2)]'
                                        : 'border-border bg-background'
                                }`}
                            >
                                <div className="flex items-center justify-between gap-2">
                                    <h3 className="font-display text-lg font-semibold text-foreground">{plan.name}</h3>
                                    {plan.highlighted && (
                                        <span className="text-[10px] font-semibold uppercase tracking-wider text-primary bg-primary/15 px-2 py-1 rounded-full">
                                            Atual
                                        </span>
                                    )}
                                </div>
                                <p className="text-2xl font-bold text-foreground mt-3">R$ {plan.monthlyPrice}</p>
                                <p className="text-xs text-muted-foreground">ou R$ {plan.annualPrice}/ano</p>
                                <p className="text-xs text-muted-foreground mt-3 leading-relaxed">{plan.description}</p>
                                <div className="mt-3 pt-3 border-t border-border/60 space-y-1.5">
                                    {plan.features.map((feature) => (
                                        <div key={feature} className="text-xs text-muted-foreground flex items-start gap-1.5">
                                            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0 mt-0.5" />
                                            <span>{feature}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="bg-card border border-border rounded-xl p-5">
                    <h2 className="text-sm font-semibold text-foreground mb-4">Resumo de consumo</h2>
                    <div className="space-y-4">
                        <div>
                            <div className="flex items-center justify-between text-xs mb-1.5">
                                <span className="text-muted-foreground">Conversas no ciclo</span>
                                <span className="font-medium text-foreground">
                                    {accountSummary.usage.conversations.used}/{accountSummary.usage.conversations.limit}
                                </span>
                            </div>
                            <div className="h-2 rounded-full bg-muted overflow-hidden">
                                <div
                                    className="h-full rounded-full bg-primary"
                                    style={{
                                        width: `${pct(accountSummary.usage.conversations.used, accountSummary.usage.conversations.limit)}%`,
                                    }}
                                />
                            </div>
                        </div>

                        <div>
                            <div className="flex items-center justify-between text-xs mb-1.5">
                                <span className="text-muted-foreground">Usuários ativos</span>
                                <span className="font-medium text-foreground">
                                    {accountSummary.usage.users.used}/{accountSummary.usage.users.limit}
                                </span>
                            </div>
                            <div className="h-2 rounded-full bg-muted overflow-hidden">
                                <div
                                    className="h-full rounded-full bg-[#5AC8A7]"
                                    style={{ width: `${pct(accountSummary.usage.users.used, accountSummary.usage.users.limit)}%` }}
                                />
                            </div>
                        </div>

                        <div className="pt-4 border-t border-border/50 text-xs text-muted-foreground leading-relaxed">
                            Para evitar bloqueios por limite, faça upgrade antes do fechamento do ciclo. Alterações de
                            plano são aplicadas de forma proporcional.
                        </div>
                    </div>
                </div>
            </div>

            <div className="bg-card border border-border rounded-xl p-5">
                <div className="flex items-center justify-between mb-4">
                    <h2 className="text-sm font-semibold text-foreground">Histórico de faturas</h2>
                    <Button variant="outline" size="sm">
                        <ReceiptText className="h-4 w-4 mr-2" />
                        Ver todas
                    </Button>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead>
                            <tr className="border-b border-border">
                                <th className="text-left text-xs font-medium text-muted-foreground pb-3 pr-4">Referência</th>
                                <th className="text-left text-xs font-medium text-muted-foreground pb-3 pr-4">Vencimento</th>
                                <th className="text-right text-xs font-medium text-muted-foreground pb-3 pr-4">Valor</th>
                                <th className="text-left text-xs font-medium text-muted-foreground pb-3">Status</th>
                            </tr>
                        </thead>
                        <tbody>
                            {invoiceHistory.map((invoice) => (
                                <tr
                                    key={invoice.ref}
                                    className="border-b border-border/50 last:border-0 hover:bg-muted/30 transition-colors"
                                >
                                    <td className="py-3 pr-4 text-sm font-medium text-foreground">{invoice.ref}</td>
                                    <td className="py-3 pr-4 text-xs text-muted-foreground">{invoice.dueDate}</td>
                                    <td className="py-3 pr-4 text-right text-sm font-semibold text-foreground">
                                        R$ {invoice.amount}
                                    </td>
                                    <td className="py-3">
                                        <span className="text-xs font-medium bg-emerald-500/10 text-emerald-600 px-2 py-1 rounded-full">
                                            {invoice.status}
                                        </span>
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
