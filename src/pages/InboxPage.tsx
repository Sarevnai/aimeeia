import React, { useEffect, useState, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useTenant } from '@/contexts/TenantContext';
import { useDepartmentFilter } from '@/contexts/DepartmentFilterContext';
import { useNavigate } from 'react-router-dom';
import { Input } from '@/components/ui/input';
import { Search, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Tables } from '@/integrations/supabase/types';

type Conversation = Tables<'conversations'>;
type Contact = Tables<'contacts'>;
type ConversationState = Tables<'conversation_states'>;

interface ConversationWithContact extends Conversation {
  contacts: Contact | null;
}

const InboxPage: React.FC = () => {
  const { tenantId } = useTenant();
  const { department } = useDepartmentFilter();
  const navigate = useNavigate();
  const [conversations, setConversations] = useState<ConversationWithContact[]>([]);
  const [states, setStates] = useState<Record<string, ConversationState>>({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

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
    if (!search.trim()) return conversations;
    const s = search.toLowerCase();
    return conversations.filter(
      (c) =>
        c.contacts?.name?.toLowerCase().includes(s) ||
        c.phone_number?.includes(s)
    );
  }, [conversations, search]);

  const getStatusDot = (phoneNumber: string, convStatus: string | null) => {
    if (convStatus === 'closed' || convStatus === 'archived') return 'bg-muted-foreground';
    const state = states[phoneNumber];
    if (!state) return 'bg-muted-foreground';
    if (state.is_ai_active) return 'bg-success';
    if (state.operator_id) return 'bg-warning';
    return 'bg-muted-foreground';
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

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] md:h-[calc(100vh-4rem)]">
      {/* Header */}
      <div className="p-4 border-b border-border bg-card">
        <h2 className="font-display text-xl font-bold text-foreground mb-3">Inbox</h2>
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
          <div className="flex items-center justify-center h-40 text-sm text-muted-foreground">
            Nenhuma conversa encontrada
          </div>
        ) : (
          <div className="divide-y divide-border">
            {filtered.map((conv) => (
              <button
                key={conv.id}
                onClick={() => navigate(`/chat/${conv.id}`)}
                className={cn(
                  'flex items-center gap-3 w-full px-4 py-3.5 text-left transition-colors hover:bg-muted/50',
                  'animate-fade-in'
                )}
              >
                {/* Status dot */}
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
                    <span className="text-sm font-semibold text-foreground truncate">
                      {conv.contacts?.name || conv.phone_number}
                    </span>
                    <span className="text-xs text-muted-foreground shrink-0 ml-2">
                      {formatTime(conv.last_message_at)}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground truncate mt-0.5">
                    {conv.phone_number}
                  </p>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default InboxPage;
