import React from 'react';
import { Wrench, CheckCircle2 } from 'lucide-react';
import { AGENT_TYPES, AgentTypeKey } from '@/lib/agent-constants';

interface AgentToolsListProps {
  agentType: AgentTypeKey;
}

const AgentToolsList: React.FC<AgentToolsListProps> = ({ agentType }) => {
  const agent = AGENT_TYPES[agentType];

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        Ferramentas disponíveis para o agente {agent.label}. As ferramentas são definidas no código do backend e ativadas automaticamente quando o agente está em uso.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {agent.tools.map(tool => (
          <div
            key={tool.name}
            className="bg-card border border-border rounded-xl p-5"
          >
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-2">
                <div
                  className="flex items-center justify-center w-8 h-8 rounded-lg"
                  style={{ backgroundColor: agent.color + '22', color: agent.color }}
                >
                  <Wrench className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-foreground">{tool.label}</h3>
                  <code className="text-[10px] font-mono text-muted-foreground">{tool.name}</code>
                </div>
              </div>
              <span className="flex items-center gap-1 text-[11px] text-emerald-500">
                <CheckCircle2 className="h-3 w-3" /> Ativo
              </span>
            </div>

            <p className="text-xs text-muted-foreground mb-3 leading-relaxed">
              {tool.description}
            </p>

            {/* Parameters */}
            <div className="space-y-1.5">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Parâmetros</p>
              {tool.parameters.map(param => (
                <div key={param.name} className="flex items-start gap-2 pl-2">
                  <code className="text-[11px] font-mono text-foreground shrink-0">{param.name}</code>
                  <span className="text-[10px] text-muted-foreground bg-muted px-1 py-0.5 rounded shrink-0">{param.type}</span>
                  <span className="text-[11px] text-muted-foreground">{param.description}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default AgentToolsList;
