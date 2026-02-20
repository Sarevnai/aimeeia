import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { CheckCircle2, AlertCircle, Clock, History } from 'lucide-react';

interface Invoice {
    id: string;
    billingMonth: string;
    amount: number;
    status: 'paid' | 'pending' | 'overdue';
}

interface InvoiceHistoryCardProps {
    invoices: Invoice[];
}

export const InvoiceHistoryCard: React.FC<InvoiceHistoryCardProps> = ({ invoices }) => {
    const getStatusConfig = (status: string) => {
        switch (status) {
            case 'paid':
                return { label: 'Pago', className: 'bg-emerald-100 text-emerald-800 hover:bg-emerald-100 border-0', icon: CheckCircle2 };
            case 'overdue':
                return { label: 'Atrasado', className: 'bg-rose-100 text-rose-800 hover:bg-rose-100 border-0', icon: AlertCircle };
            default:
                return { label: 'Pendente', className: 'bg-amber-100 text-amber-800 hover:bg-amber-100 border-0', icon: Clock };
        }
    };

    return (
        <Card className="border-border shadow-sm h-full flex flex-col">
            <CardHeader className="pb-4">
                <div className="flex items-center gap-3">
                    <History className="w-5 h-5 text-muted-foreground" />
                    <CardTitle className="text-xl font-display font-semibold text-foreground">Boletos anteriores</CardTitle>
                </div>
            </CardHeader>
            <CardContent className="flex-1 overflow-auto max-h-[400px] pr-2 custom-scrollbar">
                {invoices.length > 0 ? (
                    <div className="space-y-4">
                        {invoices.map((invoice, index) => {
                            const statusConfig = getStatusConfig(invoice.status);
                            const StatusIcon = statusConfig.icon;

                            return (
                                <div key={invoice.id}>
                                    {index > 0 && <div className="h-px w-full bg-border/40 my-4" />}
                                    <div className="flex items-center justify-between group rounded-lg p-2 -mx-2 hover:bg-muted/30 transition-colors">
                                        <div className="flex items-center gap-2">
                                            <span className="font-medium text-foreground">{invoice.billingMonth}</span>
                                            <span className="text-muted-foreground ml-2">
                                                {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(invoice.amount)}
                                            </span>
                                        </div>
                                        <Badge variant="outline" className={`flex items-center gap-1.5 px-2.5 py-0.5 rounded-full ${statusConfig.className}`}>
                                            <StatusIcon className="w-3.5 h-3.5" />
                                            <span className="font-medium text-xs">{statusConfig.label}</span>
                                        </Badge>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                ) : (
                    <div className="flex flex-col items-center justify-center h-full text-center p-6 text-muted-foreground bg-muted/20 rounded-lg border border-border/50">
                        <History className="h-10 w-10 mb-3 opacity-20" />
                        <p>Nenhum histórico de boletos encontrado.</p>
                    </div>
                )}
            </CardContent>
        </Card>
    );
};
