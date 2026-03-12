import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Bot, Settings, Loader2, Cpu, CheckCircle2, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAdminTenants } from '@/hooks/useAdminTenants';
import { useAgentOverviewData } from '@/hooks/useAgentData';
import { AGENT_TYPE_KEYS, PROVIDERS } from '@/lib/agent-constants';
import TenantAgentSelector from '@/components/admin/agents/TenantAgentSelector';
import AgentCard from '@/components/admin/agents/AgentCard';
import AgentErrorsTable from '@/components/admin/agents/AgentErrorsTable';

const AgentsOverviewPage: React.FC = () => {
  const navigate = useNavigate();
  const { tenants, selectedTenantId, setSelectedTenantId, loading: tenantsLoading } = useAdminTenants();
  const { aiConfig, directives, departmentConfigs, errors, errorCounts, loading } = useAgentOverviewData(selectedTenantId);

  const providerLabel = PROVIDERS.find(p => p.value === aiConfig?.ai_provider)?.label || aiConfig?.ai_provider || '-';
  const modelLabel = PROVIDERS
    .flatMap(p => p.models)
    .find(m => m.value === aiConfig?.ai_model)?.label || aiConfig?.ai_model || '-';

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-foreground flex items-center gap-2">
            <Bot className="h-6 w-6" style={{ color: 'hsl(250 70% 60%)' }} />
            Agentes IA
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Visão geral dos agentes, ferramentas e configuração
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5"
          onClick={() => navigate('/admin/agents/settings')}
        >
          <Settings className="h-3.5 w-3.5" />
          Configurações Globais
        </Button>
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
        <>
          {/* Agent Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {AGENT_TYPE_KEYS.map((agentType) => (
              <AgentCard
                key={agentType}
                agentType={agentType}
                directives={directives}
                departmentConfigs={departmentConfigs}
                errorCount={errorCounts[agentType] || 0}
              />
            ))}
          </div>

          {/* Global Config Summary */}
          <div className="bg-card border border-border rounded-xl p-5">
            <div className="flex items-center gap-2 mb-4">
              <div className="flex items-center justify-center w-8 h-8 rounded-lg" style={{ backgroundColor: 'hsl(250 70% 60%)', color: 'white' }}>
                <Cpu className="h-4 w-4" />
              </div>
              <h2 className="text-sm font-semibold text-foreground">Configuração Global</h2>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="p-3 rounded-lg border border-border/50 bg-muted/20">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Provedor</p>
                <p className="text-sm font-medium text-foreground">{providerLabel}</p>
              </div>
              <div className="p-3 rounded-lg border border-border/50 bg-muted/20">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Modelo</p>
                <p className="text-sm font-medium text-foreground truncate">{modelLabel}</p>
              </div>
              <div className="p-3 rounded-lg border border-border/50 bg-muted/20">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">API Key</p>
                <p className="text-sm font-medium flex items-center gap-1">
                  {aiConfig?.has_api_key ? (
                    <span className="text-emerald-500 flex items-center gap-1"><CheckCircle2 className="h-3.5 w-3.5" /> Configurada</span>
                  ) : (
                    <span className="text-muted-foreground flex items-center gap-1"><XCircle className="h-3.5 w-3.5" /> Global</span>
                  )}
                </p>
              </div>
              <div className="p-3 rounded-lg border border-border/50 bg-muted/20">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Agente</p>
                <p className="text-sm font-medium text-foreground">{aiConfig?.agent_name || 'Aimee'}</p>
              </div>
            </div>
          </div>

          {/* Recent Errors */}
          <div className="bg-card border border-border rounded-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-foreground">Erros Recentes (24h)</h2>
              <span className="text-[10px] text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                {errors.length} erro{errors.length !== 1 ? 's' : ''}
              </span>
            </div>
            <AgentErrorsTable errors={errors} limit={5} showAgentColumn />
          </div>
        </>
      )}
    </div>
  );
};

export default AgentsOverviewPage;
