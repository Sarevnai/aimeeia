import React, { useEffect, useState } from 'react';
import PageHeader from '@/components/PageHeader';
import { CurrentInvoiceCard } from '@/components/finance/CurrentInvoiceCard';
import { CurrentPlanCard } from '@/components/finance/CurrentPlanCard';
import { InvoiceHistoryCard } from '@/components/finance/InvoiceHistoryCard';
import { PlanUpgradeDialog } from '@/components/finance/PlanUpgradeDialog';
import { useTenant } from '@/contexts/TenantContext';
import { supabase } from '@/integrations/supabase/client';
import { Loader2, AlertTriangle } from 'lucide-react';

const FinancePage = () => {
    const { tenantId, tenantInfo } = useTenant();
    const [isUpgradeDialogOpen, setIsUpgradeDialogOpen] = useState(false);
    const [loading, setLoading] = useState(true);
    const [conversationCount, setConversationCount] = useState(0);
    const [tenantCreatedAt, setTenantCreatedAt] = useState<string | null>(null);

    useEffect(() => {
        if (!tenantId) return;
        const load = async () => {
            setLoading(true);
            const startOfMonth = new Date();
            startOfMonth.setDate(1);
            startOfMonth.setHours(0, 0, 0, 0);
            const [convRes, tenantRes] = await Promise.all([
                supabase
                    .from('conversations')
                    .select('id', { count: 'exact', head: true })
                    .eq('tenant_id', tenantId)
                    .gte('created_at', startOfMonth.toISOString()),
                supabase
                    .from('tenants')
                    .select('created_at')
                    .eq('id', tenantId)
                    .single(),
            ]);
            setConversationCount(convRes.count ?? 0);
            setTenantCreatedAt(tenantRes.data?.created_at ?? null);
            setLoading(false);
        };
        load();
    }, [tenantId]);

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
        );
    }

    // Plan data derived from tenant info + real usage
    const plan = {
        name: 'Basico',
        billingCycle: 'monthly' as const,
        startDate: tenantCreatedAt || new Date().toISOString(),
        maxConversations: 1000,
        currentUsage: conversationCount,
    };

    return (
        <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto pb-20 animate-fade-in">
            <PageHeader
                title="Financeiro"
                subtitle="Gestao financeira da sua assinatura Aimee."
            />

            {/* Billing Integration Banner */}
            <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 flex items-start gap-3">
                <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
                <div>
                    <p className="text-sm font-medium text-foreground">Integracao de pagamento em implementacao</p>
                    <p className="text-xs text-muted-foreground mt-1">
                        A emissao de boletos e cobranca automatica sera ativada em breve. Por enquanto, entre em contato com o suporte para questoes financeiras.
                    </p>
                </div>
            </div>

            <div className="grid grid-cols-1 gap-6">
                {/* Bloco: Plano e Uso */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <CurrentPlanCard
                        plan={plan}
                        onUpgradeClick={() => setIsUpgradeDialogOpen(true)}
                    />
                    <InvoiceHistoryCard invoices={[]} />
                </div>
            </div>

            <PlanUpgradeDialog
                open={isUpgradeDialogOpen}
                onOpenChange={setIsUpgradeDialogOpen}
                currentPlanName={plan.name}
            />
        </div>
    );
};

export default FinancePage;
