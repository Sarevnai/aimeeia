import React from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Check } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';

interface PlanUpgradeDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    currentPlanName: string;
}

const mockPlans = [
    {
        id: 'starter',
        name: 'Essencial',
        price: 'R$ 499',
        features: ['Até 1.000 atendimentos', 'Suporte por e-mail', 'Relatórios básicos'],
        popular: false,
    },
    {
        id: 'pro',
        name: 'Avançado',
        price: 'R$ 999',
        features: ['Até 6.000 atendimentos', 'Suporte prioritário (WhatsApp)', 'Múltiplas integrações CRM', 'Relatórios avançados'],
        popular: true,
    },
    {
        id: 'elite',
        name: 'Master',
        price: 'Sob consulta',
        features: ['Atendimentos ilimitados', 'Gerente de conta dedicado', 'Treinamento IA personalizado', 'Dashboard white-label'],
        popular: false,
    }
];

export const PlanUpgradeDialog: React.FC<PlanUpgradeDialogProps> = ({ open, onOpenChange, currentPlanName }) => {
    const { toast } = useToast();

    const handleSelectPlan = (planName: string) => {
        onOpenChange(false);
        toast({
            title: 'Solicitação enviada',
            description: `Sua solicitação para alterar para o plano ${planName} foi enviada ao suporte.`,
        });
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[800px] border-border bg-card">
                <DialogHeader>
                    <DialogTitle className="text-2xl font-display font-bold">Evolua sua operação</DialogTitle>
                    <DialogDescription className="text-base text-muted-foreground mt-2">
                        Escolha o plano ideal para o momento atual da sua imobiliária.
                    </DialogDescription>
                </DialogHeader>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 my-6">
                    {mockPlans.map((plan) => (
                        <Card
                            key={plan.id}
                            className={`relative border ${plan.popular ? 'border-primary shadow-md' : 'border-border'} flex flex-col`}
                        >
                            {plan.popular && (
                                <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary text-primary-foreground text-[10px] font-bold px-3 py-1 rounded-full uppercase tracking-wider">
                                    Mais Popular
                                </div>
                            )}
                            <CardContent className="p-6 pt-8 flex-1 flex flex-col">
                                <div className="mb-4">
                                    <h3 className="font-bold text-lg">{plan.name}</h3>
                                    <div className="text-2xl font-bold mt-2">{plan.price}<span className="text-sm font-normal text-muted-foreground">/mês</span></div>
                                </div>
                                <ul className="space-y-3 mb-6 flex-1">
                                    {plan.features.map((feature, i) => (
                                        <li key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
                                            <Check className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                                            <span>{feature}</span>
                                        </li>
                                    ))}
                                </ul>
                                <Button
                                    className="w-full mt-auto"
                                    variant={plan.name === currentPlanName ? "outline" : (plan.popular ? "default" : "secondary")}
                                    disabled={plan.name === currentPlanName}
                                    onClick={() => handleSelectPlan(plan.name)}
                                >
                                    {plan.name === currentPlanName ? 'Plano Atual' : 'Selecionar'}
                                </Button>
                            </CardContent>
                        </Card>
                    ))}
                </div>

                <DialogFooter className="sm:justify-start">
                    <p className="text-sm text-muted-foreground w-full text-center">
                        Precisa de ajuda para escolher? <a href="#" className="text-primary hover:underline">Fale com nossos consultores</a>
                    </p>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};
