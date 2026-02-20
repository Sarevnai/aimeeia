import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';

interface CurrentPlanCardProps {
    plan: {
        name: string;
        billingCycle: 'monthly' | 'annual';
        startDate: string;
        maxConversations: number;
        currentUsage: number;
    } | null;
    onUpgradeClick: () => void;
}

export const CurrentPlanCard: React.FC<CurrentPlanCardProps> = ({ plan, onUpgradeClick }) => {
    if (!plan) return null;

    // Calcula a porcentagem de uso
    const usagePercentage = Math.min(100, Math.round((plan.currentUsage / plan.maxConversations) * 100)) || 0;

    const isApproachingLimit = usagePercentage >= 80;
    const isLimitReached = usagePercentage >= 100;

    return (
        <Card className="border-border shadow-sm h-full flex flex-col">
            <CardHeader className="flex flex-row items-center justify-between pb-4">
                <div className="flex items-center gap-3">
                    <CardTitle className="text-xl font-display font-semibold text-foreground flex items-center gap-3">
                        Plano
                    </CardTitle>
                </div>
                <Button variant="link" className="text-primary hover:text-primary/80 font-medium px-0 h-auto" onClick={onUpgradeClick}>
                    Alterar plano
                </Button>
            </CardHeader>

            <CardContent className="flex flex-col gap-6 flex-1">
                {/* Info do Plano */}
                <div className="bg-muted/30 rounded-lg p-5 border border-border/50">
                    <div className="flex items-center gap-3 mb-2">
                        <h3 className="text-2xl font-bold text-foreground">{plan.name}</h3>
                        <Badge variant="secondary" className="bg-primary/10 text-primary hover:bg-primary/15 font-medium border-0">
                            {plan.billingCycle === 'annual' ? 'Anual' : 'Mensal'}
                        </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">
                        Início em {new Intl.DateTimeFormat('pt-BR').format(new Date(plan.startDate))}
                    </p>
                </div>

                {/* Limites contratados */}
                <div className="bg-muted/30 rounded-lg p-5 border border-border/50">
                    <h3 className="text-3xl font-bold text-foreground mb-1">
                        {new Intl.NumberFormat('pt-BR').format(plan.maxConversations)}
                    </h3>
                    <p className="text-sm text-muted-foreground">
                        Atendimentos contratados para {plan.billingCycle === 'annual' ? '12 meses' : '1 mês'}
                    </p>
                </div>

                {/* Barra de Consumo */}
                <div className="bg-muted/30 rounded-lg p-5 border border-border/50 mt-auto">
                    <div className="flex items-center justify-between mb-3">
                        <h4 className="font-semibold text-foreground">Consumo atual do plano</h4>
                        <span className={`font-semibold text-sm ${isLimitReached ? 'text-destructive' : isApproachingLimit ? 'text-amber-500' : 'text-primary'}`}>
                            {usagePercentage}%
                        </span>
                    </div>
                    <Progress
                        value={usagePercentage}
                        className={`h-6 rounded-md ${isLimitReached ? '[&>div]:bg-destructive' : isApproachingLimit ? '[&>div]:bg-amber-500' : '[&>div]:bg-primary'}`}
                    />
                    <div className="flex justify-between mt-2 text-xs font-medium text-muted-foreground">
                        <span>{new Intl.NumberFormat('pt-BR').format(plan.currentUsage)} usados</span>
                        <span>{new Intl.NumberFormat('pt-BR').format(plan.maxConversations)} total</span>
                    </div>
                </div>
            </CardContent>
        </Card>
    );
};
