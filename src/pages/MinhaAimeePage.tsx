import React from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Building2, Plug, MessageCircleQuestion, Zap, ChevronRight } from 'lucide-react';
import PerguntasTab from '@/components/settings/PerguntasTab';
import FuncoesTab from '@/components/settings/FuncoesTab';
import SettingsCompanyTab from '@/components/settings/SettingsCompanyTab';
import SettingsIntegrationsTab from '@/components/settings/SettingsIntegrationsTab';

const MinhaAimeePage: React.FC = () => {
  return (
    <div className="flex flex-col h-[calc(100vh-4rem)]">
      <div className="p-4 border-b border-border bg-card space-y-1">
        <h2 className="font-display text-2xl font-bold text-foreground">Minha Aimee</h2>
        <p className="text-sm text-muted-foreground">Configure o comportamento e integrações da IA</p>
      </div>
      <div className="flex-1 overflow-auto p-4">
        <Tabs defaultValue="perguntas" className="w-full max-w-4xl mx-auto">
          <TabsList className="mb-6">
            <TabsTrigger value="perguntas" className="gap-1.5">
              <MessageCircleQuestion className="h-4 w-4" /> Perguntas essenciais
            </TabsTrigger>
            <TabsTrigger value="funcoes" className="gap-1.5">
              <Zap className="h-4 w-4" /> Funções
            </TabsTrigger>
            <TabsTrigger value="company" className="gap-1.5">
              <Building2 className="h-4 w-4" /> Empresa
            </TabsTrigger>
            <TabsTrigger value="integrations" className="gap-1.5">
              <Plug className="h-4 w-4" /> Integrações
            </TabsTrigger>
          </TabsList>

          <TabsContent value="perguntas">
            <PerguntasTab />
          </TabsContent>
          <TabsContent value="funcoes">
            <FuncoesTab />
          </TabsContent>
          <TabsContent value="company">
            <SettingsCompanyTab />
          </TabsContent>
          <TabsContent value="integrations">
            <SettingsIntegrationsTab />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default MinhaAimeePage;
