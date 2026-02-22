import React, { useState } from 'react';
import {
  Tabs, TabsContent, TabsList, TabsTrigger
} from '@/components/ui/tabs';
import {
  Building2, MessageCircleQuestion, Smartphone,
  ChevronRight, ChevronLeft, ChevronDown, CheckCircle2
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Collapsible, CollapsibleContent, CollapsibleTrigger
} from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';
import PerguntasTab from '@/components/settings/PerguntasTab';
import FuncoesTab from '@/components/settings/FuncoesTab';
import MeuNegocioView from '@/components/settings/MeuNegocioView';
import PerfilWhatsAppView from '@/components/settings/PerfilWhatsAppView';

type ViewType = 'overview' | 'meu_negocio' | 'perfil_whatsapp' | 'comportamento';

/* =========================================
   OVERVIEW VIEW
========================================= */
const OverviewView: React.FC<{ setView: (v: ViewType) => void }> = ({ setView }) => {
  return (
    <div className="max-w-5xl mx-auto space-y-12 animate-fade-in pb-12">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Meu Negócio Card */}
        <div
          onClick={() => setView('meu_negocio')}
          className="md:col-span-2 relative overflow-hidden bg-card border border-border rounded-xl shadow-sm hover:shadow-md cursor-pointer transition-all group min-h-[160px] p-6 flex flex-col justify-center"
        >
          <div className="relative z-10 max-w-[60%] space-y-2">
            <h3 className="font-display font-semibold text-lg text-foreground group-hover:text-primary transition-colors flex items-center gap-2">
              Meu negócio <ChevronRight className="h-4 w-4 opacity-0 group-hover:opacity-100 transition-opacity" />
            </h3>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Documentações exigidas, garantias e processos internos
            </p>
          </div>
          {/* Decorative Background */}
          <div className="absolute right-10 bottom-0 top-0 flex items-end justify-center pointer-events-none opacity-80 group-hover:scale-105 transition-transform duration-500">
            <div className="relative w-48 h-32">
              <BuildingDecorative />
            </div>
          </div>
        </div>

        {/* Perfil de WhatsApp Card */}
        <div
          onClick={() => setView('perfil_whatsapp')}
          className="relative overflow-hidden bg-card border border-border rounded-xl shadow-sm hover:shadow-md cursor-pointer transition-all group min-h-[140px] p-6 flex items-center justify-between"
        >
          <div className="space-y-2 max-w-[60%]">
            <h3 className="font-display font-semibold text-lg text-foreground group-hover:text-primary transition-colors flex items-center gap-2">
              Perfil de WhatsApp <ChevronRight className="h-4 w-4 opacity-0 group-hover:opacity-100 transition-opacity" />
            </h3>
            <p className="text-sm text-muted-foreground">Foto e descrição no WhatsApp</p>
          </div>
          <div className="bg-primary/5 p-4 rounded-xl border border-primary/10 group-hover:border-primary/20 transition-colors">
            <Smartphone className="h-8 w-8 text-primary" />
          </div>
        </div>

        {/* Comportamento da Aimee Card */}
        <div
          onClick={() => setView('comportamento')}
          className="relative overflow-hidden bg-card border border-border rounded-xl shadow-sm hover:shadow-md cursor-pointer transition-all group min-h-[140px] p-6 flex items-center justify-between"
        >
          <div className="space-y-2 max-w-[60%]">
            <h3 className="font-display font-semibold text-lg text-foreground group-hover:text-primary transition-colors flex items-center gap-2">
              Comportamento da Aimee <ChevronRight className="h-4 w-4 opacity-0 group-hover:opacity-100 transition-opacity" />
            </h3>
            <p className="text-sm text-muted-foreground">Personalização das funções da IA</p>
          </div>
          <div className="bg-accent/10 p-4 rounded-xl border border-accent/20 group-hover:border-accent/30 transition-colors">
            <MessageCircleQuestion className="h-8 w-8 text-accent" />
          </div>
        </div>
      </div>

      {/* Accordions Saiba Mais */}
      <div className="space-y-4">
        <h4 className="text-lg font-display font-semibold text-foreground flex items-center gap-2">
          Saiba mais
        </h4>
        <div className="space-y-2">
          <Collapsible className="bg-card border border-border rounded-xl">
            <CollapsibleTrigger className="flex items-center justify-between w-full px-5 py-4 text-left group">
              <span className="text-sm font-medium text-foreground">O que consigo personalizar diretamente na Minha Aimee?</span>
              <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="px-5 pb-4 text-sm text-muted-foreground leading-relaxed pt-1 border-t border-border/50">
                Você pode customizar respostas sobre aluguel, vendas, envio de links, e ajustar o comportamento da IA perante leads frios ou quentes. As documentações da imobiliária também alimentam o conhecimento base da IA.
              </div>
            </CollapsibleContent>
          </Collapsible>

          <Collapsible className="bg-card border border-border rounded-xl">
            <CollapsibleTrigger className="flex items-center justify-between w-full px-5 py-4 text-left group">
              <span className="text-sm font-medium text-foreground">Por que não consigo fazer edições estruturais profundas?</span>
              <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="px-5 pb-4 text-sm text-muted-foreground leading-relaxed pt-1 border-t border-border/50">
                O fluxo primário de atendimento (como saudação e captura de lead) foi padronizado e testado exaustivamente para gerar a maior conversão possível. Para alterações completas nesses fluxos, contate nosso suporte.
              </div>
            </CollapsibleContent>
          </Collapsible>
        </div>
      </div>
    </div>
  );
};

/* =========================================
   COMPORTAMENTO VIEW
========================================= */
const ComportamentoView: React.FC = () => {
  return (
    <div className="max-w-5xl mx-auto animate-fade-in-right">
      <h2 className="text-3xl font-display font-bold text-foreground mb-2">Comportamento da Aimee</h2>
      <p className="text-sm text-muted-foreground mb-8">Configure como sua IA deverá se comportar durante o atendimento.</p>

      <Tabs defaultValue="perguntas" className="w-full">
        <TabsList className="mb-6 bg-transparent p-0 border-b border-border w-full justify-start rounded-none h-auto">
          <TabsTrigger value="perguntas" className="text-sm pb-3 pt-2 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent shadow-none px-4">
            Perguntas essenciais
          </TabsTrigger>
          <TabsTrigger value="funcoes" className="text-sm pb-3 pt-2 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent shadow-none px-4">
            Funções
          </TabsTrigger>
        </TabsList>

        <TabsContent value="perguntas" className="max-w-3xl">
          <PerguntasTab />
        </TabsContent>
        <TabsContent value="funcoes" className="max-w-3xl">
          <FuncoesTab />
        </TabsContent>
      </Tabs>
    </div>
  );
};


/* =========================================
   MAIN PAGE CONTROLLER
========================================= */
const MinhaAimeePage: React.FC = () => {
  const [view, setView] = useState<ViewType>('overview');

  return (
    <div className="flex flex-col h-full bg-background min-h-screen relative">
      {/* Header com Lógica de Breadcrumb Condicional */}
      <div className="pt-6 pb-6 px-4 md:px-8 border-b-0 space-y-1 bg-transparent sticky top-0 z-30 backdrop-blur-md">
        <div className="max-w-5xl mx-auto flex items-center text-sm font-medium text-muted-foreground">
          <button
            onClick={() => setView('overview')}
            className={cn(
              "hover:text-foreground transition-colors",
              view === 'overview' ? "text-foreground font-semibold" : ""
            )}
          >
            Minha Aimee
          </button>
          {view !== 'overview' && (
            <>
              <ChevronRight className="h-4 w-4 mx-2 opacity-50" />
              <span className="text-foreground font-semibold">
                {view === 'meu_negocio' ? 'Meu negócio' : view === 'perfil_whatsapp' ? 'Perfil de WhatsApp' : 'Comportamento'}
              </span>
            </>
          )}
        </div>
      </div>

      {/* Content Area */}
      <div className="flex-1 px-4 md:px-8 overflow-auto pb-12">
        {view === 'overview' && <OverviewView setView={setView} />}
        {view === 'meu_negocio' && <MeuNegocioView />}
        {view === 'perfil_whatsapp' && <PerfilWhatsAppView />}
        {view === 'comportamento' && <ComportamentoView />}
      </div>
    </div>
  );
};

// --- Helpers Visuais ---
const BuildingDecorative = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 200 120" className={cn("w-full h-full", className)} fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="40" y="40" width="120" height="80" rx="8" fill="var(--primary)" opacity="0.8" />
    <rect x="100" y="20" width="40" height="100" rx="4" fill="var(--primary)" opacity="0.6" />
    <rect x="20" y="60" width="40" height="60" rx="4" fill="var(--primary)" opacity="0.4" />
    <circle cx="60" cy="65" r="4" fill="white" opacity="0.4" />
    <circle cx="80" cy="65" r="4" fill="white" opacity="0.4" />
    <circle cx="120" cy="45" r="4" fill="white" opacity="0.4" />
    <circle cx="140" cy="45" r="4" fill="white" opacity="0.4" />
  </svg>
);

const ZapIcon = ({ className }: { className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" /></svg>
)

export default MinhaAimeePage;
