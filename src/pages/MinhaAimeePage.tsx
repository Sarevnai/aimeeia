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
   MEU NEGÓCIO VIEW
========================================= */
const MeuNegocioView: React.FC = () => {
  return (
    <div className="max-w-5xl mx-auto animate-fade-in-right">
      <h2 className="text-3xl font-display font-bold text-foreground mb-2">Meu negócio</h2>
      <p className="text-sm text-muted-foreground mb-8">Treine a Aimee com informações chave sobre o seu negócio.</p>

      <Tabs defaultValue="geral" className="w-full">
        <TabsList className="mb-6 bg-transparent p-0 border-b border-border w-full justify-start rounded-none h-auto">
          <TabsTrigger value="geral" className="text-sm pb-3 pt-2 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent shadow-none px-4">
            Geral
          </TabsTrigger>
          <TabsTrigger value="vendas" className="text-sm pb-3 pt-2 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent shadow-none px-4">
            Vendas
          </TabsTrigger>
          <TabsTrigger value="locacao" className="text-sm pb-3 pt-2 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent shadow-none px-4">
            Locação
          </TabsTrigger>
        </TabsList>

        <TabsContent value="geral" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Políticas */}
            <Card className="border-border shadow-sm">
              <CardContent className="p-6">
                <div className="flex justify-between items-start mb-6">
                  <h4 className="font-semibold text-foreground">Políticas</h4>
                  <Button variant="link" className="h-auto p-0 text-muted-foreground hover:text-primary">Editar</Button>
                </div>
                <div className="space-y-6">
                  <div>
                    <p className="text-sm font-medium text-foreground mb-1">Assinatura de contrato</p>
                    <p className="text-sm text-muted-foreground">Digital e físico</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground mb-1">Política de chaves</p>
                    <p className="text-sm text-muted-foreground">Sempre acompanhadas por alguém da equipe</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Telefones */}
            <Card className="border-border shadow-sm md:row-span-2">
              <CardContent className="p-6">
                <div className="flex justify-between items-start mb-6">
                  <h4 className="font-semibold text-foreground">Telefones da empresa</h4>
                  <Button variant="link" className="h-auto p-0 text-muted-foreground hover:text-primary">Editar</Button>
                </div>
                <div className="space-y-6">
                  <div>
                    <p className="text-sm font-medium text-foreground mb-1">Administração</p>
                    <p className="text-sm text-muted-foreground">48991169005</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground mb-1">Loja Centro</p>
                    <p className="text-sm text-muted-foreground">4833079001</p>
                  </div>
                </div>
                <Button variant="secondary" className="mt-6 w-[120px] bg-muted relative" size="sm">
                  <span className="absolute left-3">+</span> Adicionar
                </Button>
              </CardContent>
            </Card>

            {/* Recesso */}
            <Card className="border-border shadow-sm">
              <CardContent className="p-6">
                <div className="flex justify-between items-start mb-6">
                  <div className="flex items-center gap-3">
                    <h4 className="font-semibold text-foreground">Recesso</h4>
                    <Badge variant="secondary" className="bg-destructive/10 text-destructive border-0 text-[10px] px-2">● Inativo</Badge>
                  </div>
                  <Button variant="link" className="h-auto p-0 text-muted-foreground hover:text-primary">Editar</Button>
                </div>
                <p className="text-sm text-muted-foreground">A Aimee <span className="font-bold text-foreground">NÃO</span> confirmará pausa durante o período de festas.</p>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="vendas" className="space-y-4">
          <Card className="border-border shadow-sm">
            <CardContent className="p-6">
              <div className="flex justify-between items-start mb-6">
                <div className="flex items-center gap-3">
                  <h4 className="font-semibold text-foreground">Informações da operação</h4>
                  <Badge variant="secondary" className="bg-success/15 text-success border-0 text-[10px] px-2">● Ativo</Badge>
                </div>
                <Button variant="link" className="h-auto p-0 text-muted-foreground hover:text-primary">Editar</Button>
              </div>
              <div className="space-y-6">
                <div>
                  <p className="text-sm font-medium text-foreground mb-1">Atendimento de compra</p>
                  <p className="text-sm text-muted-foreground">Ativo</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground mb-1">Nomenclatura do corretor</p>
                  <p className="text-sm text-muted-foreground">Consultor Imobiliário</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card className="border-border shadow-sm">
              <CardContent className="p-6">
                <div className="flex justify-between items-start mb-6">
                  <h4 className="font-semibold text-foreground">Financiamento</h4>
                  <Button variant="link" className="h-auto p-0 text-muted-foreground hover:text-primary">Editar</Button>
                </div>
                <div className="space-y-6">
                  <div>
                    <p className="text-sm font-medium text-foreground mb-1">Serviços oferecidos</p>
                    <p className="text-sm text-muted-foreground">Oferece simulação, Parceria com bancos</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="border-border shadow-sm">
              <CardContent className="p-6">
                <div className="flex justify-between items-start mb-6">
                  <h4 className="font-semibold text-foreground">Documentos necessários</h4>
                  <Button variant="link" className="h-auto p-0 text-muted-foreground hover:text-primary">Editar</Button>
                </div>
                <div className="space-y-4">
                  <div>
                    <p className="text-sm font-medium text-foreground mb-1">Documentos pessoais</p>
                    <p className="text-sm text-muted-foreground">—</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground mb-1">Comprovante de renda</p>
                    <p className="text-sm text-muted-foreground">—</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="locacao" className="space-y-4">
          <Card className="border-border shadow-sm">
            <CardContent className="p-6">
              <div className="flex justify-between items-start mb-6">
                <div className="flex items-center gap-3">
                  <h4 className="font-semibold text-foreground">Processos de locação</h4>
                </div>
                <Button variant="link" className="h-auto p-0 text-muted-foreground hover:text-primary">Editar</Button>
              </div>
              <div className="space-y-6">
                <div>
                  <p className="text-sm font-medium text-foreground mb-1">Prazo padrão (Residencial)</p>
                  <p className="text-sm text-muted-foreground">30 meses</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground mb-1">Prazo padrão (Comercial)</p>
                  <p className="text-sm text-muted-foreground">60 meses</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

/* =========================================
   PERFIL DE WHATSAPP VIEW
========================================= */
const PerfilWhatsAppView: React.FC = () => {
  return (
    <div className="max-w-5xl mx-auto animate-fade-in-right">
      <h2 className="text-3xl font-display font-bold text-foreground mb-2">Perfil de WhatsApp</h2>
      <p className="text-sm text-muted-foreground mb-8">Personalize como os leads verão a foto e os dados da sua IA.</p>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
        {/* Formulário (Esquerda) */}
        <div className="lg:col-span-3 space-y-4">
          <Card className="border-border shadow-sm">
            <CardContent className="p-6 space-y-5">
              <div className="space-y-2">
                <Label>Nome de Exibição</Label>
                <Input defaultValue="Aimee.iA | Atendimento" className="bg-muted/30" />
              </div>
              <div className="space-y-2">
                <Label>Descrição (Bio)</Label>
                <Textarea defaultValue="Olá! Sou a inteligência artificial da sua imobiliária, pronta para te ajudar a encontrar o imóvel ideal. 🏡✨" className="bg-muted/30 resize-none h-24" />
              </div>
              <div className="space-y-2">
                <Label>E-mail comercial</Label>
                <Input defaultValue="contato@minhaimobiliaria.com.br" className="bg-muted/30" />
              </div>
              <div className="space-y-2">
                <Label>Website</Label>
                <Input defaultValue="https://www.minhaimobiliaria.com.br" className="bg-muted/30" />
              </div>
              <div className="space-y-2">
                <Label>Endereço Físico</Label>
                <Input defaultValue="Av. Central, 1000 - Centro" className="bg-muted/30" />
              </div>
              <div className="pt-4 flex justify-end">
                <Button>Salvar informações</Button>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Mockup iPhone (Direita) */}
        <div className="lg:col-span-2 flex justify-center lg:justify-end">
          <div className="relative w-[280px] h-[580px] bg-[#1C1C1E] rounded-[40px] border-[8px] border-[#3A3A3C] shadow-2xl overflow-hidden shrink-0 mt-2">
            {/* Notch */}
            <div className="absolute top-0 inset-x-0 h-6 bg-[#3A3A3C] rounded-b-3xl w-[120px] mx-auto z-20"></div>

            {/* Status bar mock */}
            <div className="absolute top-1 inset-x-4 flex justify-between z-20 text-white text-[10px] items-center">
              <span>15:30</span>
              <div className="flex gap-1 items-center">
                <div className="h-2 w-2 rounded-full bg-white"></div>
                <div className="h-2 w-3 rounded-full bg-white"></div>
              </div>
            </div>

            {/* WhatsApp Top Header */}
            <div className="bg-[#1F2C34] pt-12 pb-2 px-3 flex items-center gap-3">
              <ChevronLeft className="h-5 w-5 text-[#00A884]" />
              <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center shrink-0 border border-primary/20">
                <img src={`https://api.dicebear.com/9.x/avataaars/svg?seed=aimee&backgroundColor=7c3aed`} className="w-9 h-9 rounded-full" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-white font-medium text-sm truncate">Aimee.iA | Atendimento</p>
                <p className="text-[#8696A0] text-xs">Conta comercial</p>
              </div>
            </div>

            {/* WhatsApp Inside View (Business Profile) */}
            <div className="bg-[#111B21] h-full p-4 space-y-4">
              <div className="bg-[#1F2C34] rounded-lg p-3">
                <p className="text-[#8696A0] text-xs mb-1 font-medium">SOBRE</p>
                <p className="text-[#E9EDEF] text-[13px] leading-snug">Olá! Sou a inteligência artificial da sua imobiliária, pronta para te ajudar a encontrar o imóvel ideal. 🏡✨</p>
              </div>

              <div className="bg-[#1F2C34] rounded-lg p-3 space-y-3">
                <div className="flex items-start gap-3">
                  <div className="mt-0.5"><BuildingDecorative className="w-4 h-4 fill-[#8696A0]" /></div>
                  <div>
                    <p className="text-[#E9EDEF] text-[13px] leading-snug">Av. Central, 1000 - Centro</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 border-t border-[#313D45] pt-3">
                  <div className=""><MessageCircleQuestion className="w-4 h-4 text-[#8696A0]" /></div>
                  <div>
                    <p className="text-[#E9EDEF] text-[13px] leading-snug">contato@minhaimobiliaria.com.br</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 border-t border-[#313D45] pt-3">
                  <div className=""><ZapIcon className="w-4 h-4 text-[#8696A0]" /></div>
                  <div>
                    <p className="text-[#00A884] text-[13px] leading-snug">https://www.minhaimobiliaria...</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
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
