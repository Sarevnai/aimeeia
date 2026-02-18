import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface AIFunction {
  name: string;
  description: string;
  active: boolean;
}

const FUNCTIONS: AIFunction[] = [
  {
    name: 'Reengajamento',
    description: 'A Aimee tentará reengajar o cliente após 6 horas sem resposta.',
    active: true,
  },
  {
    name: 'Envio de leads ao CRM',
    description: 'A Aimee enviará leads qualificados para o CRM automaticamente.',
    active: true,
  },
  {
    name: 'Envio de endereço completo',
    description: 'A Aimee NÃO enviará o endereço completo do imóvel ao lead.',
    active: false,
  },
  {
    name: 'Envio de leads frios ao CRM',
    description: 'A Aimee NÃO enviará leads frios (não qualificados) ao CRM.',
    active: false,
  },
];

const FuncoesTab: React.FC = () => {
  return (
    <div className="space-y-3">
      {FUNCTIONS.map((fn, i) => (
        <Card key={i}>
          <CardContent className="flex items-start justify-between p-5">
            <div className="space-y-1 flex-1 min-w-0">
              <div className="flex items-center gap-2.5">
                <span className="text-sm font-semibold text-foreground">{fn.name}</span>
                <Badge
                  className={cn(
                    'text-[10px] border-0',
                    fn.active
                      ? 'bg-success/15 text-success'
                      : 'bg-destructive/15 text-destructive'
                  )}
                >
                  ● {fn.active ? 'Ativo' : 'Inativo'}
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground">{fn.description}</p>
            </div>
            <Button variant="link" size="sm" className="text-accent shrink-0">
              Editar
            </Button>
          </CardContent>
        </Card>
      ))}
    </div>
  );
};

export default FuncoesTab;
