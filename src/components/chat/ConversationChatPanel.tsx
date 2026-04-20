// Sprint 6.2 — Cockpit WhatsApp-like
// Painel de chat reutilizável: mostra mensagens da conversa, permite responder,
// anexar mídia, citar mensagem (reply_to). Usado no TicketDetailPage e em qualquer
// outra página que precise conversar direto com o cliente sem sair do contexto.

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Loader2,
  Send,
  Bot,
  UserCheck,
  Info,
  CornerUpLeft,
  X,
  FileText,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import ChatMediaUpload from '@/components/chat/ChatMediaUpload';
import { AudioRecordButton } from '@/components/chat/AudioRecordButton';

interface ChatMessage {
  id: number | string;
  body: string | null;
  direction: string;
  sender_type: string | null;
  sender_id: string | null;
  media_type: string | null;
  media_url: string | null;
  media_caption: string | null;
  media_filename: string | null;
  reply_to: number | null;
  wa_message_id: string | null;
  event_type: string | null;
  created_at: string | null;
}

interface Props {
  conversationId: string;
  tenantId: string;
  phoneNumber: string;
  departmentCode?: string | null;
  disabled?: boolean;
  headerSlot?: React.ReactNode;
}

function formatTime(iso: string | null) {
  if (!iso) return '';
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

function formatDateLabel(iso: string | null) {
  if (!iso) return '';
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date(Date.now() - 86400000);
  const isSameDay = (a: Date, b: Date) =>
    a.getDate() === b.getDate() && a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear();
  if (isSameDay(d, today)) return 'Hoje';
  if (isSameDay(d, yesterday)) return 'Ontem';
  return d.toLocaleDateString('pt-BR');
}

export const ConversationChatPanel: React.FC<Props> = ({
  conversationId,
  tenantId,
  phoneNumber,
  departmentCode,
  disabled = false,
  headerSlot,
}) => {
  const { user, profile } = useAuth();
  const { toast } = useToast();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [senderNames, setSenderNames] = useState<Record<string, string>>({});
  const [inputValue, setInputValue] = useState('');
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const fetchMessages = useCallback(async () => {
    if (!conversationId || !tenantId) return;
    const { data } = await supabase
      .from('messages')
      .select(
        'id, body, direction, sender_type, sender_id, media_type, media_url, media_caption, media_filename, reply_to, wa_message_id, event_type, created_at',
      )
      .eq('conversation_id', conversationId)
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: true })
      .limit(500);

    const msgs = (data || []) as ChatMessage[];
    setMessages(msgs);
    setLoading(false);

    // Hydrate sender names (operator messages)
    const senderIds = Array.from(new Set(msgs.map((m) => m.sender_id).filter((id): id is string => !!id)));
    const missing = senderIds.filter((id) => !senderNames[id]);
    if (missing.length > 0) {
      const { data: profs } = await supabase
        .from('profiles')
        .select('id, user_id, full_name')
        .or(`id.in.(${missing.join(',')}),user_id.in.(${missing.join(',')})`);
      if (profs) {
        const names: Record<string, string> = {};
        profs.forEach((p: any) => {
          if (p.id && missing.includes(p.id)) names[p.id] = p.full_name || 'Operador';
          if (p.user_id && missing.includes(p.user_id)) names[p.user_id] = p.full_name || 'Operador';
        });
        setSenderNames((prev) => ({ ...prev, ...names }));
      }
    }
  }, [conversationId, tenantId, senderNames]);

  useEffect(() => {
    fetchMessages();
    const channel = supabase
      .channel(`conv_chat_${conversationId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'messages',
          filter: `conversation_id=eq.${conversationId}`,
        },
        () => fetchMessages(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId, tenantId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  const handleSend = async () => {
    const text = inputValue.trim();
    if (!text || sending || disabled) return;
    setSending(true);

    const tempId = `temp-${Date.now()}`;
    const replySnapshot = replyTo;
    const optimistic: ChatMessage = {
      id: tempId,
      body: text,
      direction: 'outbound',
      sender_type: 'operator',
      sender_id: user?.id || null,
      media_type: null,
      media_url: null,
      media_caption: null,
      media_filename: null,
      reply_to: (replySnapshot?.id as any) || null,
      wa_message_id: null,
      event_type: null,
      created_at: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, optimistic]);
    setInputValue('');
    setReplyTo(null);

    try {
      await supabase.functions.invoke('send-wa-message', {
        body: {
          tenant_id: tenantId,
          phone_number: phoneNumber,
          message: text,
          conversation_id: conversationId,
          department_code: departmentCode || null,
          sender_type: 'operator',
          sender_id: user?.id || null,
          reply_to_id: replySnapshot?.id || null,
          reply_to_wa_id: replySnapshot?.wa_message_id || null,
        },
      });
    } catch (err) {
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
      setInputValue(text);
      setReplyTo(replySnapshot);
      toast({ variant: 'destructive', title: 'Erro ao enviar', description: (err as Error).message });
    } finally {
      setSending(false);
    }
  };

  const msgById = useCallback(
    (id: number | null) => (id == null ? null : messages.find((m) => m.id === id) || null),
    [messages],
  );

  const renderQuoted = (quoted: ChatMessage) => {
    const preview =
      quoted.body?.slice(0, 80) ||
      (quoted.media_type ? `[${quoted.media_type}]` : '') ||
      '…';
    return (
      <div className="mb-1 pl-2 border-l-2 border-muted-foreground/40 text-[11px] text-muted-foreground italic">
        {preview}
      </div>
    );
  };

  // Group consecutive messages by day for date separators
  const grouped: { date: string; items: ChatMessage[] }[] = [];
  messages.forEach((m) => {
    const label = formatDateLabel(m.created_at);
    const last = grouped[grouped.length - 1];
    if (!last || last.date !== label) grouped.push({ date: label, items: [m] });
    else last.items.push(m);
  });

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      {headerSlot && <div className="border-b shrink-0">{headerSlot}</div>}

      {/* Messages */}
      <div
        className="flex-1 overflow-auto p-4 space-y-1"
        style={{ background: 'var(--gradient-surface, hsl(var(--muted)/0.25))' }}
      >
        {messages.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-12">
            Nenhuma mensagem ainda.
          </p>
        )}
        {grouped.map((group) => (
          <React.Fragment key={group.date}>
            <div className="flex justify-center my-2">
              <Badge variant="secondary" className="text-[10px]">{group.date}</Badge>
            </div>
            {group.items.map((msg) => {
              const isOutbound = msg.direction === 'outbound';
              const isSystem = msg.sender_type === 'system' || msg.event_type != null;
              const isOperatorMsg = msg.sender_type === 'operator';
              const quoted = msg.reply_to ? msgById(msg.reply_to as any) : null;

              if (isSystem) {
                return (
                  <div key={msg.id} className="flex justify-center my-2">
                    <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-muted/60 border border-border">
                      <Info className="h-3 w-3 text-muted-foreground" />
                      <span className="text-[11px] italic text-muted-foreground">{msg.body}</span>
                      <span className="text-[9px] text-muted-foreground/60 ml-1">{formatTime(msg.created_at)}</span>
                    </div>
                  </div>
                );
              }

              return (
                <div
                  key={msg.id}
                  className={cn('group flex', isOutbound ? 'justify-end' : 'justify-start')}
                >
                  <div className="relative max-w-[75%]">
                    <div
                      className={cn(
                        'rounded-2xl px-3.5 py-2 text-sm',
                        isOutbound
                          ? 'bg-[hsl(var(--chat-outbound,142_76%_92%))] text-foreground rounded-br-md'
                          : 'bg-[hsl(var(--chat-inbound,0_0%_100%))] text-foreground rounded-bl-md border',
                      )}
                    >
                      {isOutbound && (
                        <div className="flex items-center gap-1 mb-0.5">
                          {isOperatorMsg ? (
                            <>
                              <UserCheck className="h-3 w-3 text-amber-600" />
                              <span className="text-[10px] font-semibold text-amber-700">
                                {msg.sender_id ? senderNames[msg.sender_id] || 'Operador' : 'Operador'}
                              </span>
                            </>
                          ) : (
                            <>
                              <Bot className="h-3 w-3 text-emerald-600" />
                              <span className="text-[10px] font-semibold text-emerald-700">Aimee</span>
                            </>
                          )}
                        </div>
                      )}

                      {quoted && renderQuoted(quoted)}

                      {msg.media_type === 'image' && msg.media_url ? (
                        <div className="space-y-1">
                          <img
                            src={msg.media_url}
                            alt={msg.media_caption || 'Imagem'}
                            className="rounded-lg max-w-full max-h-60 object-cover cursor-pointer"
                            onClick={() => window.open(msg.media_url!, '_blank')}
                          />
                          {msg.media_caption && (
                            <p className="text-xs text-muted-foreground">{msg.media_caption}</p>
                          )}
                        </div>
                      ) : msg.media_type === 'video' && msg.media_url ? (
                        <video controls src={msg.media_url} className="rounded-lg max-w-full max-h-60" />
                      ) : (msg.media_type === 'audio' || msg.media_type === 'voice') ? (
                        <div className="space-y-1 min-w-[240px]">
                          {msg.media_url ? (
                            <audio controls src={msg.media_url} className="w-full h-10" />
                          ) : (
                            <p className="text-[11px] italic text-muted-foreground">[Áudio indisponível]</p>
                          )}
                          {msg.body && msg.body.startsWith('[Transcrição de áudio]:') && (
                            <p className="text-[11px] italic text-muted-foreground">
                              💬 {msg.body.replace('[Transcrição de áudio]:', '').trim()}
                            </p>
                          )}
                        </div>
                      ) : msg.media_type === 'document' && msg.media_url ? (
                        <a
                          href={msg.media_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-2 text-sm text-primary hover:underline py-1"
                        >
                          <FileText className="h-4 w-4 shrink-0" />
                          <span className="truncate">{msg.media_filename || 'Documento'}</span>
                        </a>
                      ) : (
                        <p className="whitespace-pre-wrap break-words">{msg.body}</p>
                      )}

                      <span className="block text-[10px] mt-1 text-right text-muted-foreground">
                        {formatTime(msg.created_at)}
                      </span>
                    </div>

                    {/* Reply button (appears on hover) */}
                    <Button
                      size="icon"
                      variant="ghost"
                      className={cn(
                        'absolute top-1 opacity-0 group-hover:opacity-100 transition h-6 w-6',
                        isOutbound ? '-left-7' : '-right-7',
                      )}
                      onClick={() => setReplyTo(msg)}
                      title="Responder esta mensagem"
                    >
                      <CornerUpLeft className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </React.Fragment>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Reply preview */}
      {replyTo && (
        <div className="px-4 py-2 border-t bg-muted/30 flex items-start gap-2 shrink-0">
          <CornerUpLeft className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase">
              Em resposta a {replyTo.sender_type === 'customer' ? 'cliente' : replyTo.sender_type === 'operator' ? (replyTo.sender_id ? senderNames[replyTo.sender_id] || 'operador' : 'operador') : 'Aimee'}
            </p>
            <p className="text-xs text-foreground/80 truncate">
              {replyTo.body || (replyTo.media_type ? `[${replyTo.media_type}]` : '…')}
            </p>
          </div>
          <Button
            size="icon"
            variant="ghost"
            className="h-6 w-6 shrink-0"
            onClick={() => setReplyTo(null)}
          >
            <X className="h-3 w-3" />
          </Button>
        </div>
      )}

      {/* Compose */}
      <div className="flex items-end gap-2 px-4 py-3 border-t bg-card shrink-0">
        <ChatMediaUpload
          tenantId={tenantId}
          conversationId={conversationId}
          phoneNumber={phoneNumber}
          departmentCode={departmentCode || null}
          onSending={setSending}
        />
        <AudioRecordButton
          tenantId={tenantId}
          conversationId={conversationId}
          phoneNumber={phoneNumber}
          departmentCode={departmentCode || null}
          onSending={setSending}
        />
        <Textarea
          placeholder={disabled ? 'Conversa desabilitada' : 'Digite uma mensagem... (Enter envia, Shift+Enter quebra linha)'}
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          disabled={disabled}
          rows={1}
          className="flex-1 min-h-[40px] max-h-32 resize-none"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              handleSend();
            }
          }}
        />
        <Button
          size="icon"
          disabled={!inputValue.trim() || sending || disabled}
          onClick={handleSend}
          className="shrink-0"
        >
          {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </Button>
      </div>
    </div>
  );
};

export default ConversationChatPanel;
