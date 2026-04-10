import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Search, MessageSquare, ArrowLeft, Loader2, User, Bot } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ConversationItem {
  id: string;
  phone_number: string;
  contact_name?: string;
  department_code: string | null;
  status: string;
  source: string | null;
  last_message_at: string | null;
}

interface Message {
  id: number;
  direction: 'inbound' | 'outbound';
  body: string | null;
  sender_type: string | null;
  created_at: string | null;
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

export default function AdminConversationsTab({ tenantId }: { tenantId: string }) {
  const [conversations, setConversations] = useState<ConversationItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [deptFilter, setDeptFilter] = useState('all');

  const [selectedConvId, setSelectedConvId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);

  const loadConversations = useCallback(async () => {
    setLoading(true);
    let query = supabase
      .from('conversations')
      .select(`id, phone_number, department_code, status, source, last_message_at, contacts!conversations_contact_id_fkey(name)`)
      .eq('tenant_id', tenantId)
      .not('source', 'eq', 'simulation')
      .order('last_message_at', { ascending: false })
      .limit(200);

    if (statusFilter !== 'all') query = query.eq('status', statusFilter);
    if (deptFilter !== 'all') query = query.eq('department_code', deptFilter);

    const { data } = await query;
    const items: ConversationItem[] = (data || []).map((c: any) => ({
      id: c.id,
      phone_number: c.phone_number,
      contact_name: c.contacts?.name || undefined,
      department_code: c.department_code,
      status: c.status,
      source: c.source,
      last_message_at: c.last_message_at,
    }));
    setConversations(items);
    setLoading(false);
  }, [tenantId, statusFilter, deptFilter]);

  useEffect(() => { loadConversations(); }, [loadConversations]);

  const loadMessages = useCallback(async (convId: string) => {
    setMessagesLoading(true);
    const { data } = await supabase
      .from('messages')
      .select('id, direction, body, sender_type, created_at')
      .eq('conversation_id', convId)
      .order('created_at', { ascending: true })
      .limit(500);
    setMessages((data || []) as Message[]);
    setMessagesLoading(false);
  }, []);

  useEffect(() => {
    if (selectedConvId) loadMessages(selectedConvId);
  }, [selectedConvId, loadMessages]);

  const filtered = conversations.filter((c) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      c.phone_number.includes(q) ||
      (c.contact_name || '').toLowerCase().includes(q)
    );
  });

  const selectedConv = conversations.find((c) => c.id === selectedConvId);

  // ── Thread view ──
  if (selectedConvId && selectedConv) {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <Button size="sm" variant="ghost" onClick={() => { setSelectedConvId(null); setMessages([]); }}>
            <ArrowLeft className="h-4 w-4 mr-1" /> Voltar
          </Button>
          <div>
            <p className="text-sm font-semibold">{selectedConv.contact_name || selectedConv.phone_number}</p>
            <p className="text-xs text-muted-foreground">
              {selectedConv.phone_number}
              {selectedConv.department_code && ` · ${selectedConv.department_code}`}
              {` · ${selectedConv.status}`}
            </p>
          </div>
        </div>

        <div className="bg-card border border-border rounded-xl p-4 max-h-[65vh] overflow-y-auto space-y-2">
          {messagesLoading ? (
            <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin" /></div>
          ) : messages.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">Nenhuma mensagem encontrada.</p>
          ) : (
            messages.map((m) => {
              const isInbound = m.direction === 'inbound';
              return (
                <div key={m.id} className={cn('flex gap-2', isInbound ? 'justify-start' : 'justify-end')}>
                  {isInbound && (
                    <div className="shrink-0 w-7 h-7 rounded-full bg-muted flex items-center justify-center">
                      <User className="h-3.5 w-3.5 text-muted-foreground" />
                    </div>
                  )}
                  <div
                    className={cn(
                      'max-w-[75%] rounded-xl px-3 py-2 text-sm whitespace-pre-wrap break-words',
                      isInbound
                        ? 'bg-muted text-foreground rounded-tl-sm'
                        : 'bg-primary text-primary-foreground rounded-tr-sm'
                    )}
                  >
                    {m.body || <span className="italic text-muted-foreground">[mídia]</span>}
                    <div className={cn('text-[10px] mt-1', isInbound ? 'text-muted-foreground' : 'text-primary-foreground/70')}>
                      {m.created_at ? new Date(m.created_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : ''}
                      {m.sender_type === 'ai' && ' · IA'}
                    </div>
                  </div>
                  {!isInbound && (
                    <div className="shrink-0 w-7 h-7 rounded-full bg-primary/20 flex items-center justify-center">
                      <Bot className="h-3.5 w-3.5 text-primary" />
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    );
  }

  // ── List view ──
  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por telefone ou nome..."
            className="pl-8"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[140px]"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="open">Abertos</SelectItem>
            <SelectItem value="closed">Fechados</SelectItem>
          </SelectContent>
        </Select>
        <Select value={deptFilter} onValueChange={setDeptFilter}>
          <SelectTrigger className="w-[160px]"><SelectValue placeholder="Depto" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos deptos</SelectItem>
            <SelectItem value="comercial">Comercial</SelectItem>
            <SelectItem value="remarketing">Remarketing</SelectItem>
            <SelectItem value="triagem">Triagem</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="bg-card border border-border rounded-xl divide-y divide-border/50">
        {loading ? (
          <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin" /></div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10">
            <MessageSquare className="h-8 w-8 text-muted-foreground/30 mb-2" />
            <p className="text-sm text-muted-foreground">Nenhuma conversa encontrada</p>
          </div>
        ) : (
          filtered.map((c) => (
            <button
              key={c.id}
              onClick={() => setSelectedConvId(c.id)}
              className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-muted/30 transition-colors"
            >
              <div className="shrink-0 w-9 h-9 rounded-full bg-muted flex items-center justify-center">
                <MessageSquare className="h-4 w-4 text-muted-foreground" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">
                  {c.contact_name || c.phone_number}
                </p>
                <p className="text-xs text-muted-foreground truncate">
                  {c.phone_number}
                  {c.source && ` · ${c.source}`}
                </p>
              </div>
              {c.department_code && (
                <Badge variant="outline" className="text-[10px] shrink-0">
                  {c.department_code}
                </Badge>
              )}
              <span className={cn(
                'text-[10px] px-2 py-0.5 rounded-full font-medium shrink-0',
                c.status === 'open' ? 'bg-emerald-500/10 text-emerald-600' : 'bg-muted text-muted-foreground'
              )}>
                {c.status}
              </span>
              <span className="text-xs text-muted-foreground shrink-0">
                {formatTimeAgo(c.last_message_at)}
              </span>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
