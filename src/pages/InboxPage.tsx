import React, { useEffect, useState, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useTenant } from '@/contexts/TenantContext';
import { useAuth } from '@/contexts/AuthContext';
import { useDepartmentFilter } from '@/contexts/DepartmentFilterContext';
import { useNavigate } from 'react-router-dom';
import { Input } from '@/components/ui/input';
import { Search, Loader2, MessageSquare, Globe, Phone, Facebook, Home, Tag } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Tables } from '@/integrations/supabase/types';

type Conversation = Tables<'conversations'>;
type Contact = Tables<'contacts'>;
type ConversationState = Tables<'conversation_states'>;

interface ConversationWithContact extends Conversation {
  contacts: Contact | null;
}

/* ─── Channel helpers ─── */

const CHANNEL_ICON: Record<string, React.ReactNode> = {
  whatsapp: <Phone className="h-3.5 w-3.5 text-green-500" />,
  grupozap: <Globe className="h-3.5 w-3.5 text-orange-500" />,
  imovelweb: <Home className="h-3.5 w-3.5 text-blue-500" />,
  facebook: <Facebook className="h-3.5 w-3.5 text-blue-600" />,
  site: <Globe className="h-3.5 w-3.5 text-purple-500" />,
  chavesnamao: <Home className="h-3.5 w-3.5 text-red-500" />,
};

const CHANNEL_LABEL: Record<string, string> = {
  whatsapp: 'WhatsApp',
  grupozap: 'Grupo Zap',
  imovelweb: 'ImovelWeb',
  facebook: 'Facebook',
  site: 'Site',
  chavesnamao: 'Chaves Na Mão',
};

const DEPT_LABELS: Record<string, string> = {
  locacao: 'Aluguel',
  vendas: 'Venda',
  administrativo: 'Admin',
};

const DEPT_COLORS: Record<string, string> = {
  locacao: 'bg-info/15 text-info',
  vendas: 'bg-success/15 text-success',
  administrativo: 'bg-warning/15 text-warning',
};

type TabValue = 'all' | 'mine';

const InboxPage: React.FC = () => {
  const { tenantId } = useTenant();
  const { user } = useAuth();
  const { department } = useDepartmentFilter();
  const navigate = useNavigate();
  const [conversations, setConversations] = useState<ConversationWithContact[]>([]);
  const [states, setStates] = useState<Record<string, ConversationState>>({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState<TabValue>('all');

  const fetchConversations = async () => {
    if (!tenantId) return;
    setLoading(true);

    let query = supabase
      .from('conversations')
      .select('*, contacts(*)')
      .eq('tenant_id', tenantId)
      .eq('status', 'active')
      .order('last_message_at', { ascending: false })
      .limit(50);

    if (department !== 'all') {
      query = query.eq('department_code', department);
    }

    const { data } = await query;
    setConversations((data as ConversationWithContact[]) ?? []);

    // Fetch conversation states
    const { data: statesData } = await supabase
      .from('conversation_states')
      .select('*')
      .eq('tenant_id', tenantId);

    const statesMap: Record<string, ConversationState> = {};
    statesData?.forEach((s) => {
      statesMap[s.phone_number] = s;
    });
    setStates(statesMap);
    setLoading(false);
  };

  useEffect(() => {
    fetchConversations();
  }, [tenantId, department]);

  // Realtime subscription
  useEffect(() => {
    if (!tenantId) return;

    const channel = supabase
      .channel('inbox-realtime')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'conversations',
          filter: `tenant_id=eq.${tenantId}`,
        },
        () => {
          fetchConversations();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [tenantId]);

  const filtered = useMemo(() => {
    let result = conversations;

    // Tab filter: "mine" shows only conversations where operator is current user
    if (tab === 'mine' && user) {
      result = result.filter((c) => {
        const state = states[c.phone_number];
        return state?.operator_id === user.id;
      });
    }

    // Search filter
    if (search.trim()) {
      const s = search.toLowerCase();
      result = result.filter(
        (c) =>
          c.contacts?.name?.toLowerCase().includes(s) ||
          c.phone_number?.includes(s)
      );
    }

    return result;
  }, [conversations, search, tab, states, user]);

  const getStatusDot = (phoneNumber: string, convStatus: string | null) => {
    if (convStatus === 'closed' || convStatus === 'archived') return 'bg-muted-foreground';
    const state = states[phoneNumber];
    if (!state) return 'bg-muted-foreground';
    if (state.is_ai_active) return 'bg-success';
    if (state.operator_id) return 'bg-warning';
    return 'bg-muted-foreground';
  };

  const getStatusLabel = (phoneNumber: string) => {
    const state = states[phoneNumber];
    if (!state) return null;
    if (state.is_ai_active) return 'IA ativa';
    if (state.operator_id) return 'Operador';
    return null;
  };

  const formatTime = (dateStr: string | null) => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 60) return `${diffMins}min`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h`;
    return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
  };

  const totalAll = conversations.length;
  const totalMine = useMemo(() => {
    if (!user) return 0;
    return conversations.filter((c) => {
      const state = states[c.phone_number];
      return state?.operator_id === user.id;
    }).length;
  }, [conversations, states, user]);

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] md:h-[calc(100vh-4rem)]">
      {/* Header */}
      <div className="p-4 border-b border-border bg-card space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-2xl font-bold text-foreground">Conversas</h2>
          <span className="text-sm text-muted-foreground">{filtered.length} conversas</span>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 p-0.5 bg-muted rounded-lg">
          <button
            onClick={() => setTab('all')}
            className={cn(
              'flex-1 text-sm font-medium px-3 py-1.5 rounded-md transition-all',
              tab === 'all'
                ? 'bg-card text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            Todas <span className="text-xs opacity-70">({totalAll})</span>
          </button>
          <button
            onClick={() => setTab('mine')}
            className={cn(
              'flex-1 text-sm font-medium px-3 py-1.5 rounded-md transition-all',
              tab === 'mine'
                ? 'bg-card text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            Minhas <span className="text-xs opacity-70">({totalMine})</span>
          </button>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por nome ou telefone..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-9"
          />
        </div>
      </div>

      {/* Conversation list */}
      <div className="flex-1 overflow-auto">
        {loading ? (
          <div className="flex items-center justify-center h-40">
            <Loader2 className="h-6 w-6 animate-spin text-accent" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 text-sm text-muted-foreground gap-2">
            <MessageSquare className="h-8 w-8 opacity-40" />
            {tab === 'mine' ? 'Nenhuma conversa atribuída a você' : 'Nenhuma conversa encontrada'}
          </div>
        ) : (
          <div className="divide-y divide-border">
            {filtered.map((conv) => {
              const channelSrc = conv.contacts?.channel_source || 'whatsapp';
              const channelIcon = CHANNEL_ICON[channelSrc] || <MessageSquare className="h-3.5 w-3.5 text-muted-foreground" />;
              const deptCode = conv.department_code || '';
              const deptLabel = DEPT_LABELS[deptCode];
              const deptColor = DEPT_COLORS[deptCode] || 'bg-muted text-muted-foreground';
              const statusLabel = getStatusLabel(conv.phone_number);

              return (
                <button
                  key={conv.id}
                  onClick={() => navigate(`/chat/${conv.id}`)}
                  className={cn(
                    'flex items-center gap-3 w-full px-4 py-3.5 text-left transition-colors hover:bg-muted/50',
                    'animate-fade-in'
                  )}
                >
                  {/* Avatar with status dot */}
                  <div className="relative shrink-0">
                    <div className="h-10 w-10 rounded-full bg-secondary flex items-center justify-center">
                      <span className="text-sm font-semibold text-secondary-foreground">
                        {(conv.contacts?.name?.[0] || conv.phone_number?.[0] || '?').toUpperCase()}
                      </span>
                    </div>
                    <div
                      className={cn(
                        'absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-card animate-pulse-dot',
                        getStatusDot(conv.phone_number, conv.status)
                      )}
                    />
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="text-sm font-semibold text-foreground truncate">
                          {conv.contacts?.name || conv.phone_number}
                        </span>
                        {/* Channel icon */}
                        <span className="shrink-0 opacity-70">{channelIcon}</span>
                      </div>
                      <span className="text-xs text-muted-foreground shrink-0 ml-2">
                        {formatTime(conv.last_message_at)}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <p className="text-xs text-muted-foreground truncate">
                        {conv.phone_number}
                      </p>
                      {/* Department badge */}
                      {deptLabel && (
                        <span className={cn('text-[10px] font-medium px-1.5 py-0.5 rounded-full shrink-0', deptColor)}>
                          {deptLabel}
                        </span>
                      )}
                      {/* Status label */}
                      {statusLabel && (
                        <span className="text-[10px] font-medium text-muted-foreground bg-muted rounded-full px-1.5 py-0.5 shrink-0">
                          {statusLabel}
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default InboxPage;
