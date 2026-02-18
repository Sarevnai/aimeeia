import React from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Building2, Bot, Plug } from 'lucide-react';
import SettingsCompanyTab from '@/components/settings/SettingsCompanyTab';
import SettingsAITab from '@/components/settings/SettingsAITab';
import SettingsIntegrationsTab from '@/components/settings/SettingsIntegrationsTab';

const SettingsPage: React.FC = () => {
  return (
    <div className="flex flex-col h-[calc(100vh-4rem)]">
      <div className="p-4 border-b border-border bg-card">
        <h2 className="font-display text-xl font-bold text-foreground">Configurações</h2>
      </div>
      <div className="flex-1 overflow-auto p-4">
        <Tabs defaultValue="company" className="w-full max-w-4xl mx-auto">
          <TabsList className="mb-6">
            <TabsTrigger value="company" className="gap-1.5">
              <Building2 className="h-4 w-4" /> Empresa
            </TabsTrigger>
            <TabsTrigger value="ai" className="gap-1.5">
              <Bot className="h-4 w-4" /> AI
            </TabsTrigger>
            <TabsTrigger value="integrations" className="gap-1.5">
              <Plug className="h-4 w-4" /> Integrações
            </TabsTrigger>
          </TabsList>

          <TabsContent value="company">
            <SettingsCompanyTab />
          </TabsContent>
          <TabsContent value="ai">
            <SettingsAITab />
          </TabsContent>
          <TabsContent value="integrations">
            <SettingsIntegrationsTab />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default SettingsPage;
