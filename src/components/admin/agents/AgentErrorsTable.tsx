import React from 'react';
import { AlertTriangle, Clock } from 'lucide-react';
import type { AgentError } from '@/hooks/useAgentData';

interface AgentErrorsTableProps {
  errors: AgentError[];
  limit?: number;
  showAgentColumn?: boolean;
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'agora';
  if (mins < 60) return `${mins}m atrás`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h atrás`;
  const days = Math.floor(hours / 24);
  return `${days}d atrás`;
}

function errorTypeColor(type: string | null): string {
  if (!type) return 'text-muted-foreground';
  const t = type.toLowerCase();
  if (t.includes('critical') || t.includes('fatal')) return 'text-red-500';
  if (t.includes('warn')) return 'text-amber-500';
  return 'text-orange-400';
}

const AgentErrorsTable: React.FC<AgentErrorsTableProps> = ({
  errors, limit, showAgentColumn = true,
}) => {
  const displayed = limit ? errors.slice(0, limit) : errors;

  if (displayed.length === 0) {
    return (
      <div className="text-center py-8">
        <div className="flex items-center justify-center w-10 h-10 rounded-full bg-emerald-500/10 mx-auto mb-2">
          <AlertTriangle className="h-4 w-4 text-emerald-500" />
        </div>
        <p className="text-sm text-muted-foreground">Nenhum erro recente</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border">
            {showAgentColumn && <th className="text-left py-2 px-3 text-xs font-medium text-muted-foreground">Agente</th>}
            <th className="text-left py-2 px-3 text-xs font-medium text-muted-foreground">Tipo</th>
            <th className="text-left py-2 px-3 text-xs font-medium text-muted-foreground">Mensagem</th>
            <th className="text-right py-2 px-3 text-xs font-medium text-muted-foreground">Quando</th>
          </tr>
        </thead>
        <tbody>
          {displayed.map((err) => (
            <tr key={err.id} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
              {showAgentColumn && (
                <td className="py-2 px-3 text-xs font-medium text-foreground">
                  {err.agent_name || 'desconhecido'}
                </td>
              )}
              <td className={`py-2 px-3 text-xs font-mono ${errorTypeColor(err.error_type)}`}>
                {err.error_type || '-'}
              </td>
              <td className="py-2 px-3 text-xs text-muted-foreground max-w-[300px]" title={err.error_message || ''}>
                <div className="truncate">{err.error_message || '-'}</div>
              </td>
              <td className="py-2 px-3 text-xs text-muted-foreground text-right whitespace-nowrap">
                <span className="flex items-center gap-1 justify-end">
                  <Clock className="h-3 w-3" />
                  {timeAgo(err.created_at)}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default AgentErrorsTable;
