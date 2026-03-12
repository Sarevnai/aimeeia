import React from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, ChevronRight, CheckCircle2, MinusCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AGENT_TYPES, AgentTypeKey } from '@/lib/agent-constants';
import type { AgentDirective, AgentDepartmentConfig } from '@/hooks/useAgentData';

interface AgentCardProps {
  agentType: AgentTypeKey;
  directives: AgentDirective[];
  departmentConfigs: AgentDepartmentConfig[];
  errorCount: number;
}

const AgentCard: React.FC<AgentCardProps> = ({
  agentType, directives, departmentConfigs, errorCount,
}) => {
  const navigate = useNavigate();
  const agent = AGENT_TYPES[agentType];
  const Icon = agent.icon;

  // Determine status
  const hasDirective = directives.some(d =>
    agent.departments.length === 0
      ? true // remarketing doesn't use department-based directives
      : d.department && agent.departments.includes(d.department)
  );
  const hasDeptConfig = agentType === 'remarketing' || departmentConfigs.some(dc =>
    agent.departments.includes(dc.department_code) && dc.is_active
  );

  const status = hasDirective || hasDeptConfig ? 'active' : 'inactive';

  return (
    <div className="bg-card border border-border rounded-xl p-5 hover:border-border/80 transition-colors group">
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          <div
            className="flex items-center justify-center w-10 h-10 rounded-lg"
            style={{ backgroundColor: agent.color, color: 'white' }}
          >
            <Icon className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-foreground">{agent.label}</h3>
            <div className="flex items-center gap-1.5 mt-0.5">
              {status === 'active' ? (
                <span className="flex items-center gap-1 text-[11px] text-emerald-500">
                  <CheckCircle2 className="h-3 w-3" /> Configurado
                </span>
              ) : (
                <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                  <MinusCircle className="h-3 w-3" /> Sem configuração
                </span>
              )}
            </div>
          </div>
        </div>
        {errorCount > 0 && (
          <span className="flex items-center gap-1 text-xs text-amber-500 bg-amber-500/10 px-2 py-1 rounded-full">
            <AlertTriangle className="h-3 w-3" />
            {errorCount} erro{errorCount > 1 ? 's' : ''} 24h
          </span>
        )}
      </div>

      {/* Description */}
      <p className="text-xs text-muted-foreground mb-4 leading-relaxed">
        {agent.description}
      </p>

      {/* Tools */}
      <div className="flex flex-wrap gap-1.5 mb-4">
        {agent.tools.map(tool => (
          <span
            key={tool.name}
            className="text-[10px] font-medium px-2 py-0.5 rounded-full border border-border bg-muted/30 text-muted-foreground"
          >
            {tool.label}
          </span>
        ))}
      </div>

      {/* Departments */}
      {agent.departments.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-4">
          {agent.departments.map(dept => (
            <span
              key={dept}
              className="text-[10px] px-2 py-0.5 rounded-full text-white/90"
              style={{ backgroundColor: agent.color + '88' }}
            >
              {dept}
            </span>
          ))}
        </div>
      )}

      {/* Action */}
      <Button
        variant="outline"
        size="sm"
        className="w-full gap-1.5 group-hover:border-foreground/20"
        onClick={() => navigate(`/admin/agents/${agentType}`)}
      >
        Configurar
        <ChevronRight className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
};

export default AgentCard;
