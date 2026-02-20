import React, { useState } from 'react';
import PageHeader from '@/components/PageHeader';
import { CurrentInvoiceCard } from '@/components/finance/CurrentInvoiceCard';
import { CurrentPlanCard } from '@/components/finance/CurrentPlanCard';
import { InvoiceHistoryCard } from '@/components/finance/InvoiceHistoryCard';
import { PlanUpgradeDialog } from '@/components/finance/PlanUpgradeDialog';

// Mock data (será substituído via Supabase posteriormente)
const mockInvoice = {
    id: 'ind_123',
    amount: 2490.50,
    dueDate: '2026-03-10T00:00:00Z',
    billingMonth: 'Fevereiro de 2026',
    status: 'pending' as const,
    barcode: '34191.09008 10738.480081 71221.460000 8 92830000249050'
};

const mockPlan = {
    name: 'Avançado',
    billingCycle: 'monthly' as const,
    startDate: '2025-05-01T00:00:00Z',
    maxConversations: 6000,
    currentUsage: 4500
};

const mockHistory = [
    { id: '1', billingMonth: 'Janeiro de 2026', amount: 2490.50, status: 'paid' as const },
    { id: '2', billingMonth: 'Dezembro de 2025', amount: 2490.50, status: 'paid' as const },
    { id: '3', billingMonth: 'Novembro de 2025', amount: 1990.00, status: 'paid' as const }
];

const FinancePage = () => {
    const [isUpgradeDialogOpen, setIsUpgradeDialogOpen] = useState(false);

    return (
        <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto pb-20 animate-fade-in">
            <PageHeader
                title="Financeiro"
                subtitle="Faça a gestão financeira da sua assinatura Aimee."
            />

            <div className="grid grid-cols-1 gap-6">
                {/* Bloco 1: Boleto Atual */}
                <div className="w-full">
                    <CurrentInvoiceCard invoice={mockInvoice} />
                </div>

                {/* Bloco 2: Plano e Histórico */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <CurrentPlanCard
                        plan={mockPlan}
                        onUpgradeClick={() => setIsUpgradeDialogOpen(true)}
                    />
                    <InvoiceHistoryCard invoices={mockHistory} />
                </div>
            </div>

            <PlanUpgradeDialog
                open={isUpgradeDialogOpen}
                onOpenChange={setIsUpgradeDialogOpen}
                currentPlanName={mockPlan.name}
            />
        </div>
    );
};

export default FinancePage;
