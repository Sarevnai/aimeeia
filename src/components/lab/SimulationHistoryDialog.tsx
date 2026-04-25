import React, { useEffect, useState } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { History, MessageSquare, Trash2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { ScrollArea } from '@/components/ui/scroll-area';

interface Conversation {
  id: string;
  phone_number: string;
  department_code: string;
  source: string;
  status: string;
  created_at: string;
  last_message_at: string | null;
  message_count?: number;
}

interface Message {
  id: string;
  sender_type: string;
  direction: string;
  body: string;
  created_at: string;
  event_type: string | null;
}

interface Props {
  tenantId: string;
}

export function SimulationHistoryDialog({ tenantId }: Props) {
  const [open, setOpen] = useState(false);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedConv, setSelectedConv] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);

  const loadConversations = async () => {
    if (!tenantId) return;
    setLoading(true);
    try {
      const { data } = await supabase
        .from('conversations' as any)
        .select('id, phone_number, department_code, source, status, created_at, last_message_at')
        .eq('tenant_id', tenantId)
        .eq('source', 'simulation')
        .order('created_at', { ascending: false })
        .limit(50);

      const convs = (data || []) as unknown as Conversation[];

      // Fetch message counts in batch
      const counts: Record<string, number> = {};
      if (convs.length > 0) {
        const { data: msgCounts } = await supabase
          .from('messages' as any)
          .select('conversation_id')
          .in('conversation_id', convs.map(c => c.id));
        for (const m of (msgCounts || []) as any[]) {
          counts[m.conversation_id] = (counts[m.conversation_id] || 0) + 1;
        }
      }

      setConversations(convs.map(c => ({ ...c, message_count: counts[c.id] || 0 })));
    } finally {
      setLoading(false);
    }
  };

  const loadMessages = async (conv: Conversation) => {
    setSelectedConv(conv);
    const { data } = await supabase
      .from('messages' as any)
      .select('id, sender_type, direction, body, created_at, event_type')
      .eq('conversation_id', conv.id)
      .order('created_at', { ascending: true });
    setMessages((data || []) as unknown as Message[]);
  };

  useEffect(() => {
    if (open) loadConversations();
  }, [open, tenantId]);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="sm" className="h-8 text-xs gap-1">
          <History className="w-3.5 h-3.5" />
          Histórico
        </Button>
      </SheetTrigger>
      <SheetContent className="w-[900px] sm:max-w-[900px] flex flex-col">
        <SheetHeader>
          <SheetTitle>Simulações deste tenant</SheetTitle>
        </SheetHeader>

        <div className="flex flex-1 gap-3 mt-4 min-h-0">
          {/* Lista */}
          <div className="w-[320px] border rounded-lg flex flex-col">
            <div className="p-2 border-b text-xs text-muted-foreground">
              {loading ? 'Carregando...' : `${conversations.length} simulação(ões)`}
            </div>
            <ScrollArea className="flex-1">
              {conversations.map(c => (
                <button
                  key={c.id}
                  onClick={() => loadMessages(c)}
                  className={`w-full text-left p-3 border-b hover:bg-muted/50 transition-colors ${
                    selectedConv?.id === c.id ? 'bg-muted' : ''
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <Badge variant="outline" className="text-[10px] px-1 py-0">
                      {c.department_code || '?'}
                    </Badge>
                    <span className="text-xs text-muted-foreground truncate">
                      {c.phone_number}
                    </span>
                  </div>
                  <div className="text-xs text-muted-foreground flex items-center gap-2">
                    <MessageSquare className="w-3 h-3" />
                    {c.message_count} msg
                    <span>·</span>
                    <span>{new Date(c.created_at).toLocaleString('pt-BR', {
                      day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
                    })}</span>
                  </div>
                </button>
              ))}
              {!loading && conversations.length === 0 && (
                <div className="p-4 text-xs text-muted-foreground text-center">
                  Nenhuma simulação encontrada para este tenant.
                </div>
              )}
            </ScrollArea>
          </div>

          {/* Transcript */}
          <div className="flex-1 border rounded-lg flex flex-col min-w-0">
            {!selectedConv ? (
              <div className="flex-1 flex items-center justify-center text-xs text-muted-foreground">
                Selecione uma simulação à esquerda
              </div>
            ) : (
              <>
                <div className="p-2 border-b text-xs flex items-center gap-2">
                  <Badge variant="outline" className="text-[10px]">{selectedConv.department_code}</Badge>
                  <span className="text-muted-foreground truncate">{selectedConv.phone_number}</span>
                  <span className="text-muted-foreground">·</span>
                  <span className="text-muted-foreground">
                    {new Date(selectedConv.created_at).toLocaleString('pt-BR')}
                  </span>
                </div>
                <ScrollArea className="flex-1 p-3">
                  <div className="space-y-3">
                    {messages.map(m => (
                      <div
                        key={m.id}
                        className={`flex ${m.sender_type === 'customer' ? 'justify-start' : 'justify-end'}`}
                      >
                        <div
                          className={`max-w-[75%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap ${
                            m.sender_type === 'customer'
                              ? 'bg-muted'
                              : m.sender_type === 'ai'
                              ? 'bg-primary/10 text-foreground'
                              : 'bg-amber-100 text-amber-900 text-xs'
                          }`}
                        >
                          <div className="text-[10px] text-muted-foreground mb-0.5">
                            {m.sender_type === 'customer' ? '👤 Cliente'
                              : m.sender_type === 'ai' ? '🤖 Aimee'
                              : `⚙️ ${m.event_type || m.sender_type}`}
                            <span className="ml-2">
                              {new Date(m.created_at).toLocaleTimeString('pt-BR', {
                                hour: '2-digit', minute: '2-digit', second: '2-digit',
                              })}
                            </span>
                          </div>
                          {m.body}
                        </div>
                      </div>
                    ))}
                    {messages.length === 0 && (
                      <div className="text-xs text-muted-foreground text-center py-4">
                        Sem mensagens nesta conversa.
                      </div>
                    )}
                  </div>
                </ScrollArea>
              </>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
