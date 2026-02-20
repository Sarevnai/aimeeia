import React from 'react';
import { Download, Copy, CheckCircle2, AlertCircle, Clock } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/components/ui/use-toast';

interface CurrentInvoiceCardProps {
    invoice: {
        amount: number;
        dueDate: string;
        billingMonth: string;
        status: 'paid' | 'pending' | 'overdue';
        barcode?: string;
    } | null;
}

export const CurrentInvoiceCard: React.FC<CurrentInvoiceCardProps> = ({ invoice }) => {
    const { toast } = useToast();

    if (!invoice) return null;

    const handleCopyBarcode = () => {
        if (invoice.barcode) {
            navigator.clipboard.writeText(invoice.barcode);
            toast({
                title: 'Código copiado!',
                description: 'O código de barras foi copiado para a área de transferência.',
            });
        }
    };

    const getStatusConfig = (status: string) => {
        switch (status) {
            case 'paid':
                return { label: 'Pago', className: 'bg-emerald-100 text-emerald-800 hover:bg-emerald-100', icon: CheckCircle2 };
            case 'overdue':
                return { label: 'Atrasado', className: 'bg-rose-100 text-rose-800 hover:bg-rose-100', icon: AlertCircle };
            default:
                return { label: 'Pendente', className: 'bg-amber-100 text-amber-800 hover:bg-amber-100', icon: Clock };
        }
    };

    const statusConfig = getStatusConfig(invoice.status);
    const StatusIcon = statusConfig.icon;

    return (
        <Card className="border-border shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
                <div className="flex items-center gap-3">
                    <CardTitle className="text-xl font-display font-semibold text-foreground">Boleto</CardTitle>
                    <Badge variant="secondary" className={`flex items-center gap-1.5 px-2.5 py-0.5 rounded-full ${statusConfig.className}`}>
                        <StatusIcon className="w-3.5 h-3.5" />
                        <span className="font-medium text-xs">{statusConfig.label}</span>
                    </Badge>
                </div>
                <Button variant="link" className="text-primary hover:text-primary/80 font-medium px-0 h-auto gap-2">
                    <Download className="w-4 h-4" />
                    <span className="hidden sm:inline">Baixar boleto</span>
                </Button>
            </CardHeader>
            <CardContent className="pt-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="bg-muted/40 rounded-lg p-4 border border-border/50">
                        <p className="text-sm text-muted-foreground mb-1">Custo da Aimee em {invoice.billingMonth}</p>
                        <p className="text-2xl font-semibold text-foreground">
                            {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(invoice.amount)}
                        </p>
                    </div>

                    <div className="bg-muted/40 rounded-lg p-4 border border-border/50">
                        <p className="text-sm text-muted-foreground mb-1">Vencimento</p>
                        <p className="text-2xl font-semibold text-foreground">
                            {new Intl.DateTimeFormat('pt-BR').format(new Date(invoice.dueDate))}
                        </p>
                    </div>

                    <div className="bg-muted/40 rounded-lg p-4 border border-border/50 flex flex-col justify-center relative group">
                        <p className="text-sm text-muted-foreground mb-1">Código do boleto</p>
                        <div className="flex items-center justify-between">
                            <p className="text-lg font-medium text-foreground truncate mr-2">
                                {invoice.barcode ? 'Copiar código' : 'Não disponível'}
                            </p>
                            {invoice.barcode && (
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8 text-primary hover:text-primary/80 hover:bg-primary/10 transition-colors"
                                    onClick={handleCopyBarcode}
                                >
                                    <Copy className="w-4 h-4" />
                                </Button>
                            )}
                        </div>
                    </div>
                </div>
            </CardContent>
        </Card>
    );
};
