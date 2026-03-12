import React from 'react';
import { useParams, useNavigate, Navigate } from 'react-router-dom';
import { ArrowLeft, Loader2, FileText, Wrench, Brain, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAdminTenants } from '@/hooks/useAdminTenants';
import { useAgentDetailData } from '@/hooks/useAgentData';
import { AGENT_TYPES, isValidAgentType } from '@/lib/agent-constants';
import TenantAgentSelector from '@/components/admin/agents/TenantAgentSelector';
import AgentDirectiveEditor from '@/components/admin/agents/AgentDirectiveEditor';
import AgentToolsList from '@/components/admin/agents/AgentToolsList';
import AgentBehaviorEditor from '@/components/admin/agents/AgentBehaviorEditor';
import AgentDepartmentConfigEditor from '@/components/admin/agents/AgentDepartmentConfigEditor';
import AgentErrorsTable from '@/components/admin/agents/AgentErrorsTable';

const AgentDetailPage: React.FC = () => {
  const { agentType: rawType } = useParams<{ agentType: string }>();
  const navigate = useNavigate();
  const { tenants, selectedTenantId, setSelectedTenantId, loading: tenantsLoading } = useAdminTenants();

  if (!rawType || !isValidAgentType(rawType)) {
    return <Navigate to="/admin/agents" replace />;
  }

  const agentType = rawType;
  const agent = AGENT_TYPES[agentType];
  const Icon = agent.icon;

  const {
    directives, behaviorConfig, departmentConfigs, errors, loading, reload,
  } = useAgentDetailData(selectedTenantId, agentType);

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-6xl mx-auto animate-fade-in">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate('/admin/agents')}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div
          className="flex items-center justify-center w-10 h-10 rounded-lg"
          style={{ backgroundColor: agent.color, color: 'white' }}
        >
          <Icon className="h-5 w-5" />
        </div>
        <div className="flex-1">
          <h1 className="font-display text-xl font-bold text-foreground">
            Agente {agent.label}
          </h1>
          <p className="text-sm text-muted-foreground">{agent.description}</p>
        </div>
      </div>

      {/* Tenant Selector */}
      <TenantAgentSelector
        tenants={tenants}
        selectedTenantId={selectedTenantId}
        onTenantChange={setSelectedTenantId}
        loading={tenantsLoading}
      />

      {loading ? (
        <div className="flex items-center justify-center h-40">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <Tabs defaultValue="config" className="space-y-4">
          <TabsList>
            <TabsTrigger value="config" className="gap-1.5">
              <FileText className="h-3.5 w-3.5" /> Configuração
            </TabsTrigger>
            <TabsTrigger value="tools" className="gap-1.5">
              <Wrench className="h-3.5 w-3.5" /> Ferramentas
            </TabsTrigger>
            <TabsTrigger value="behavior" className="gap-1.5">
              <Brain className="h-3.5 w-3.5" /> Comportamento
            </TabsTrigger>
            <TabsTrigger value="logs" className="gap-1.5">
              <AlertTriangle className="h-3.5 w-3.5" /> Logs & Erros
              {errors.length > 0 && (
                <span className="ml-1 text-[10px] bg-amber-500/20 text-amber-500 px-1.5 py-0.5 rounded-full">
                  {errors.length}
                </span>
              )}
            </TabsTrigger>
          </TabsList>

          {/* Tab 1: Configuration */}
          <TabsContent value="config" className="space-y-6">
            {/* Directives */}
            <div className="bg-card border border-border rounded-xl p-5">
              <h2 className="text-sm font-semibold text-foreground mb-4">Diretivas</h2>
              <AgentDirectiveEditor
                agentType={agentType}
                tenantId={selectedTenantId}
                directives={directives}
                onSaved={reload}
              />
            </div>

            {/* Department-specific config */}
            <div className="bg-card border border-border rounded-xl p-5">
              <h2 className="text-sm font-semibold text-foreground mb-4">Configuração por Departamento</h2>
              <AgentDepartmentConfigEditor
                agentType={agentType}
                tenantId={selectedTenantId}
                departmentConfigs={departmentConfigs}
                onSaved={reload}
              />
            </div>
          </TabsContent>

          {/* Tab 2: Tools */}
          <TabsContent value="tools">
            <div className="bg-card border border-border rounded-xl p-5">
              <h2 className="text-sm font-semibold text-foreground mb-4">Ferramentas do Agente</h2>
              <AgentToolsList agentType={agentType} />
            </div>
          </TabsContent>

          {/* Tab 3: Behavior */}
          <TabsContent value="behavior">
            <AgentBehaviorEditor
              tenantId={selectedTenantId}
              behaviorConfig={behaviorConfig}
              onSaved={reload}
            />
          </TabsContent>

          {/* Tab 4: Logs & Errors */}
          <TabsContent value="logs">
            <div className="bg-card border border-border rounded-xl p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-semibold text-foreground">Erros do Agente {agent.label}</h2>
                <span className="text-[10px] text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                  {errors.length} registro{errors.length !== 1 ? 's' : ''}
                </span>
              </div>
              <AgentErrorsTable errors={errors} showAgentColumn={false} />
            </div>
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
};

export default AgentDetailPage;
