import React from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Search, MessageSquare, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ConversationItem {
  id: string;
  phone_number: string;
  contact_name?: string;
  department_code: string | null;
  status: string;
  source: string | null;
  message_count: number;
  last_message_at: string | null;
  latest_score?: number | null;
  report_count?: number;
}

interface RealConversationListProps {
  conversations: ConversationItem[];
  loading: boolean;
  selectedId: string | null;
  onSelect: (id: string) => void;
  filters: {
    search: string;
    department: string;
    status: string;
  };
  onFiltersChange: (filters: { search: string; department: string; status: string }) => void;
}

function formatTimeAgo(dateStr: string | null): string {
  if (!dateStr) return '-';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

function getScoreColor(score: number): string {
  if (score >= 9) return 'text-green-600 bg-green-50';
  if (score >= 7) return 'text-yellow-600 bg-yellow-50';
  if (score >= 5) return 'text-orange-600 bg-orange-50';
  return 'text-red-600 bg-red-50';
}

const departmentLabels: Record<string, string> = {
  vendas: 'Vendas',
  locacao: 'Locação',
  administrativo: 'Admin',
};

export default function RealConversationList({
  conversations,
  loading,
  selectedId,
  onSelect,
  filters,
  onFiltersChange,
}: RealConversationListProps) {
  return (
    <div className="flex flex-col h-full">
      {/* Filters */}
      <div className="p-3 border-b space-y-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Buscar telefone ou nome..."
            className="pl-8 h-8 text-xs"
            value={filters.search}
            onChange={(e) => onFiltersChange({ ...filters, search: e.target.value })}
          />
        </div>
        <div className="flex gap-2">
          <Select
            value={filters.department}
            onValueChange={(v) => onFiltersChange({ ...filters, department: v })}
          >
            <SelectTrigger className="h-7 text-xs flex-1">
              <SelectValue placeholder="Depto" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="vendas">Vendas</SelectItem>
              <SelectItem value="locacao">Locação</SelectItem>
              <SelectItem value="administrativo">Admin</SelectItem>
            </SelectContent>
          </Select>
          <Select
            value={filters.status}
            onValueChange={(v) => onFiltersChange({ ...filters, status: v })}
          >
            <SelectTrigger className="h-7 text-xs flex-1">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="active">Ativo</SelectItem>
              <SelectItem value="closed">Fechado</SelectItem>
              <SelectItem value="archived">Arquivado</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="p-4 text-center text-xs text-muted-foreground">Carregando...</div>
        ) : conversations.length === 0 ? (
          <div className="p-4 text-center text-xs text-muted-foreground">Nenhuma conversa encontrada</div>
        ) : (
          conversations.map((conv) => (
            <button
              key={conv.id}
              onClick={() => onSelect(conv.id)}
              className={cn(
                'w-full text-left px-3 py-2.5 border-b transition-colors hover:bg-muted/50',
                selectedId === conv.id && 'bg-primary/5 border-l-2 border-l-primary'
              )}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-medium truncate">
                  {conv.contact_name || conv.phone_number}
                </span>
                <span className="text-[10px] text-muted-foreground">
                  {formatTimeAgo(conv.last_message_at)}
                </span>
              </div>

              <div className="flex items-center gap-1.5">
                {conv.department_code && (
                  <Badge variant="outline" className="text-[10px] px-1 py-0 h-4">
                    {departmentLabels[conv.department_code] || conv.department_code}
                  </Badge>
                )}
                <div className="flex items-center gap-0.5 text-[10px] text-muted-foreground">
                  <MessageSquare className="h-3 w-3" />
                  {conv.message_count}
                </div>
                {conv.latest_score != null && (
                  <Badge className={cn('text-[10px] px-1 py-0 h-4 font-mono', getScoreColor(conv.latest_score))}>
                    {conv.latest_score.toFixed(1)}
                  </Badge>
                )}
                {conv.report_count && conv.report_count > 0 && (
                  <CheckCircle2 className="h-3 w-3 text-green-500" />
                )}
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
