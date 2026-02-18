import React from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Lock, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Question {
  name: string;
  category: string;
  isQualifying: boolean;
  isLocked?: boolean;
}

const QUESTIONS: Question[] = [
  { name: 'Objetivo: comprar ou alugar', category: 'Operação', isQualifying: true, isLocked: true },
  { name: 'Nome do lead', category: 'Informações do lead', isQualifying: false },
  { name: 'Bairro desejado', category: 'Localização', isQualifying: false },
  { name: 'Cidade', category: 'Localização', isQualifying: false },
  { name: 'Características do imóvel', category: 'Características', isQualifying: false },
  { name: 'Faixa de preço desejada', category: 'Características', isQualifying: true },
  { name: 'Tipo do imóvel', category: 'Características', isQualifying: false },
];

const CATEGORY_COLORS: Record<string, string> = {
  'Operação': 'bg-accent/15 text-accent',
  'Informações do lead': 'bg-info/15 text-info',
  'Localização': 'bg-warning/15 text-warning',
  'Características': 'bg-success/15 text-success',
};

const FAQ_ITEMS = [
  {
    question: 'Como funciona?',
    answer: 'A Aimee coleta essas informações durante a conversa com o lead de forma natural, como uma atendente faria. Ela identifica as respostas mesmo quando não são dadas diretamente.',
  },
  {
    question: 'A pergunta será sempre feita?',
    answer: 'Não necessariamente. A Aimee usa detecção inteligente — se o lead já mencionou a informação em outra parte da conversa, ela não repete a pergunta.',
  },
  {
    question: 'O que são Perguntas qualificatórias?',
    answer: 'São perguntas obrigatórias antes de enviar o lead ao CRM/corretor. Garantem que o lead tem as informações mínimas para um atendimento eficiente.',
  },
];

const PerguntasTab: React.FC = () => {
  const qualifyingCount = QUESTIONS.filter((q) => q.isQualifying).length;

  return (
    <div className="space-y-6">
      {/* Question list */}
      <Card>
        <CardContent className="p-0">
          <div className="flex items-center justify-between px-5 py-4 border-b border-border">
            <span className="text-sm font-medium text-foreground">
              Perguntas ativas ({QUESTIONS.length})
            </span>
            <Button variant="outline" size="sm">Editar</Button>
          </div>
          <div className="divide-y divide-border">
            {QUESTIONS.map((q, i) => (
              <div key={i} className="flex items-center justify-between px-5 py-3">
                <div className="flex items-center gap-2">
                  {q.isLocked && <Lock className="h-3.5 w-3.5 text-muted-foreground" />}
                  <span className="text-sm text-foreground">{q.name}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Badge className={cn('text-[10px] border-0', CATEGORY_COLORS[q.category] || 'bg-muted text-muted-foreground')}>
                    {q.category}
                  </Badge>
                  {q.isQualifying && (
                    <Badge className="text-[10px] bg-success/15 text-success border-0">
                      Qualificatória
                    </Badge>
                  )}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* FAQ */}
      <div className="space-y-2">
        <h4 className="text-sm font-semibold text-foreground">Saiba mais</h4>
        {FAQ_ITEMS.map((item, i) => (
          <Collapsible key={i}>
            <Card>
              <CollapsibleTrigger className="flex items-center justify-between w-full px-5 py-3 text-left">
                <span className="text-sm font-medium text-foreground">{item.question}</span>
                <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform [[data-state=open]>&]:rotate-180" />
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="px-5 pb-4">
                  <p className="text-sm text-muted-foreground">{item.answer}</p>
                </div>
              </CollapsibleContent>
            </Card>
          </Collapsible>
        ))}
      </div>
    </div>
  );
};

export default PerguntasTab;
