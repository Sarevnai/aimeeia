import React, { useEffect, useState, useRef, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useTenant } from '@/contexts/TenantContext';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  ArrowLeft,
  Send,
  Bot,
  UserCheck,
  Phone,
  MapPin,
  Home,
  DollarSign,
  Bed,
  Target,
  Play,
  Pause,
  Loader2,
  Globe,
  Facebook,
  Calendar,
  Clock,
  MessageSquare,
  ChevronDown,
  Image,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Tables } from '@/integrations/supabase/types';

type Message = Tables<'messages'>;
type Conversation = Tables<'conversations'>;
type Contact = Tables<'contacts'>;
type ConversationState = Tables<'conversation_states'>;
type LeadQualification = Tables<'lead_qualification'>;

const DEPT_LABELS: Record<string, string> = {
  locacao: 'Locação',
  vendas: 'Vendas',
  administrativo: 'Admin',
};

const DEPT_COLORS: Record<string, string> = {
  locacao: 'bg-info text-info-foreground',
  vendas: 'bg-success text-success-foreground',
  administrativo: 'bg-warning text-warning-foreground',
};

const CHANNEL_LABELS: Record<string, string> = {
  whatsapp: 'WhatsApp',
  grupozap: 'Grupo Zap',
  imovelweb: 'ImovelWeb',
  facebook: 'Facebook',
  site: 'Site próprio',
  chavesnamao: 'Chaves Na Mão',
};

const CHANNEL_ICONS: Record<string, React.ReactNode> = {
  whatsapp: <Phone className="h-3.5 w-3.5 text-green-500" />,
  grupozap: <Globe className="h-3.5 w-3.5 text-orange-500" />,
  imovelweb: <Home className="h-3.5 w-3.5 text-blue-500" />,
  facebook: <Facebook className="h-3.5 w-3.5 text-blue-600" />,
  site: <Globe className="h-3.5 w-3.5 text-purple-500" />,
  chavesnamao: <Home className="h-3.5 w-3.5 text-red-500" />,
};

const ChatPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { tenantId } = useTenant();
  const { user } = useAuth();

  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [contact, setContact] = useState<Contact | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [convState, setConvState] = useState<ConversationState | null>(null);
  const [leadQual, setLeadQual] = useState<LeadQualification | null>(null);
  const [loading, setLoading] = useState(true);
  const [inputValue, setInputValue] = useState('');
  const [sending, setSending] = useState(false);
  const [showSidebar, setShowSidebar] = useState(true);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  // Fetch conversation + contact + state + qualification
  useEffect(() => {
    if (!id || !tenantId) return;

    const fetchData = async () => {
      setLoading(true);

      const { data: conv } = await supabase
        .from('conversations')
        .select('*')
        .eq('id', id)
        .eq('tenant_id', tenantId)
        .single();

      if (!conv) {
        setLoading(false);
        return;
      }
      setConversation(conv);

      // Parallel fetches
      const [contactRes, msgsRes, stateRes, qualRes] = await Promise.all([
        conv.contact_id
          ? supabase.from('contacts').select('*').eq('id', conv.contact_id).single()
          : Promise.resolve({ data: null }),
        supabase
          .from('messages')
          .select('*')
          .eq('conversation_id', id)
          .eq('tenant_id', tenantId)
          .order('created_at', { ascending: true })
          .limit(500),
        supabase
          .from('conversation_states')
          .select('*')
          .eq('phone_number', conv.phone_number)
          .eq('tenant_id', tenantId)
          .maybeSingle(),
        supabase
          .from('lead_qualification')
          .select('*')
          .eq('phone_number', conv.phone_number)
          .eq('tenant_id', tenantId)
          .maybeSingle(),
      ]);

      setContact(contactRes.data as Contact | null);
      setMessages((msgsRes.data as Message[]) ?? []);
      setConvState(stateRes.data as ConversationState | null);
      setLeadQual(qualRes.data as LeadQualification | null);
      setLoading(false);
    };

    fetchData();
  }, [id, tenantId]);

  // Scroll on new messages
  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Realtime messages
  useEffect(() => {
    if (!id || !tenantId) return;

    const channel = supabase
      .channel(`chat-${id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `conversation_id=eq.${id}`,
        },
        (payload) => {
          setMessages((prev) => [...prev, payload.new as Message]);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [id, tenantId]);

  const handleSend = async () => {
    if (!inputValue.trim() || !conversation || !tenantId || sending) return;
    setSending(true);
    try {
      await supabase.functions.invoke('send-wa-message', {
        body: {
          tenant_id: tenantId,
          phone_number: conversation.phone_number,
          message: inputValue.trim(),
          conversation_id: id,
          department_code: conversation.department_code,
        },
      });
      setInputValue('');
    } catch (error) {
      console.error('Error sending message:', error);
    } finally {
      setSending(false);
    }
  };

  const handleTakeover = async () => {
    if (!conversation || !tenantId || !user) return;
    await supabase
      .from('conversation_states')
      .update({
        is_ai_active: false,
        operator_id: user.id,
        operator_takeover_at: new Date().toISOString(),
      })
      .eq('phone_number', conversation.phone_number)
      .eq('tenant_id', tenantId);

    setConvState((prev) =>
      prev ? { ...prev, is_ai_active: false, operator_id: user.id, operator_takeover_at: new Date().toISOString() } : prev
    );
  };

  const handleReturnToAI = async () => {
    if (!conversation || !tenantId) return;
    await supabase
      .from('conversation_states')
      .update({
        is_ai_active: true,
        operator_id: null,
      })
      .eq('phone_number', conversation.phone_number)
      .eq('tenant_id', tenantId);

    setConvState((prev) =>
      prev ? { ...prev, is_ai_active: true, operator_id: null } : prev
    );
  };

  const formatTime = (dateStr: string | null) => {
    if (!dateStr) return '';
    return new Date(dateStr).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  };

  const formatCurrency = (val: number | null) => {
    if (!val) return '—';
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(val);
  };

  const isAudioMessage = (msg: Message) => msg.media_type === 'audio';

  if (loading) {
    return (
      <div className="flex flex-col h-[calc(100vh-4rem)] p-4 gap-4">
        <div className="flex items-center gap-3">
          <Skeleton className="h-10 w-10 rounded-full" />
          <div className="space-y-2">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-3 w-24" />
          </div>
        </div>
        <div className="flex-1 space-y-3 py-4">
          {[...Array(6)].map((_, i) => (
            <div key={i} className={cn('flex', i % 2 === 0 ? 'justify-start' : 'justify-end')}>
              <Skeleton className={cn('h-12 rounded-xl', i % 2 === 0 ? 'w-64' : 'w-48')} />
            </div>
          ))}
        </div>
        <Skeleton className="h-12 w-full rounded-lg" />
      </div>
    );
  }

  if (!conversation) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-4rem)]">
        <div className="text-center space-y-3">
          <p className="text-muted-foreground">Conversa não encontrada</p>
          <Button variant="outline" onClick={() => navigate('/inbox')}>
            <ArrowLeft className="h-4 w-4 mr-2" /> Voltar ao Inbox
          </Button>
        </div>
      </div>
    );
  }

  const dept = conversation.department_code;

  return (
    <div className="flex h-[calc(100vh-4rem)] overflow-hidden">
      {/* Main chat area */}
      <div className="flex flex-1 flex-col min-w-0">
        {/* Chat header */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border bg-card shrink-0">
          <Button variant="ghost" size="icon" className="md:hidden shrink-0" onClick={() => navigate('/inbox')}>
            <ArrowLeft className="h-5 w-5" />
          </Button>

          <div className="h-10 w-10 rounded-full bg-secondary flex items-center justify-center shrink-0">
            <span className="text-sm font-semibold text-secondary-foreground">
              {(contact?.name?.[0] || conversation.phone_number?.[0] || '?').toUpperCase()}
            </span>
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-foreground truncate">
                {contact?.name || conversation.phone_number}
              </span>
              {dept && (
                <Badge className={cn('text-[10px] px-1.5 py-0', DEPT_COLORS[dept] || '')}>
                  {DEPT_LABELS[dept] || dept}
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Phone className="h-3 w-3" />
              <span>{conversation.phone_number}</span>
              {convState?.is_ai_active ? (
                <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-success text-success">
                  <Bot className="h-3 w-3 mr-0.5" /> AI Ativa
                </Badge>
              ) : (
                <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-warning text-warning">
                  <UserCheck className="h-3 w-3 mr-0.5" /> Operador
                </Badge>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {convState?.is_ai_active ? (
              <Button size="sm" variant="outline" onClick={handleTakeover} className="text-xs">
                <UserCheck className="h-3.5 w-3.5 mr-1" /> Assumir
              </Button>
            ) : (
              <Button size="sm" variant="outline" onClick={handleReturnToAI} className="text-xs">
                <Bot className="h-3.5 w-3.5 mr-1" /> Devolver AI
              </Button>
            )}
            <Button
              size="sm"
              variant="ghost"
              className="hidden md:inline-flex text-xs"
              onClick={() => setShowSidebar(!showSidebar)}
            >
              {showSidebar ? 'Fechar detalhes' : 'Ver detalhes'}
            </Button>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-auto p-4 space-y-1" style={{ background: 'var(--gradient-surface)' }}>
          {messages.map((msg) => {
            const isOutbound = msg.direction === 'outbound';
            return (
              <div key={msg.id} className={cn('flex', isOutbound ? 'justify-end' : 'justify-start')}>
                <div
                  className={cn(
                    'max-w-[75%] rounded-2xl px-3.5 py-2 text-sm animate-fade-in',
                    isOutbound
                      ? 'bg-[hsl(var(--chat-outbound))] text-foreground rounded-br-md'
                      : 'bg-[hsl(var(--chat-inbound))] text-foreground rounded-bl-md'
                  )}
                >
                  {isAudioMessage(msg) ? (
                    <div className="flex items-center gap-2 min-w-[180px]">
                      <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0">
                        <Play className="h-4 w-4" />
                      </Button>
                      <div className="flex-1 h-1 bg-border rounded-full">
                        <div className="h-full w-1/3 bg-accent rounded-full" />
                      </div>
                      <span className="text-[10px] text-muted-foreground shrink-0">0:00</span>
                    </div>
                  ) : msg.media_type === 'image' && msg.media_url ? (
                    <div className="space-y-1">
                      <img
                        src={msg.media_url}
                        alt={msg.media_caption || 'Imagem'}
                        className="rounded-lg max-w-full max-h-60 object-cover"
                      />
                      {msg.media_caption && (
                        <p className="text-xs text-muted-foreground">{msg.media_caption}</p>
                      )}
                    </div>
                  ) : (
                    <p className="whitespace-pre-wrap break-words">{msg.body}</p>
                  )}
                  <span className={cn('block text-[10px] mt-1', isOutbound ? 'text-right text-muted-foreground' : 'text-muted-foreground')}>
                    {formatTime(msg.created_at)}
                  </span>
                </div>
              </div>
            );
          })}
          <div ref={messagesEndRef} />
        </div>

        {/* Input area */}
        <div className="flex items-center gap-2 px-4 py-3 border-t border-border bg-card shrink-0">
          <Input
            placeholder="Digite uma mensagem..."
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            className="flex-1"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
          />
          <Button size="icon" disabled={!inputValue.trim() || sending} onClick={handleSend} className="shrink-0">
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      {showSidebar && (
        <div className="hidden md:flex flex-col w-[320px] border-l border-border bg-card overflow-auto shrink-0">
          {/* Profile Section */}
          <div className="p-4 border-b border-border">
            <div className="flex items-center gap-3 mb-4">
              <div className="h-12 w-12 rounded-full bg-secondary flex items-center justify-center">
                <span className="text-lg font-bold text-secondary-foreground">
                  {(contact?.name?.[0] || conversation.phone_number?.[0] || '?').toUpperCase()}
                </span>
              </div>
              <div>
                <p className="text-sm font-bold text-foreground">{contact?.name || 'Sem nome'}</p>
                <p className="text-xs text-muted-foreground">{conversation.phone_number}</p>
              </div>
            </div>
            <h4 className="font-display text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Perfil</h4>
            <div className="space-y-2.5">
              <InfoRow icon={<Phone className="h-3.5 w-3.5" />} label="Telefone" value={conversation.phone_number} />
              <InfoRow icon={<UserCheck className="h-3.5 w-3.5" />} label="Nome" value={contact?.name || '—'} />
              {contact?.channel_source && (
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground">{CHANNEL_ICONS[contact.channel_source] || <Globe className="h-3.5 w-3.5" />}</span>
                  <span className="text-xs text-muted-foreground">Canal:</span>
                  <span className="text-xs font-medium text-foreground">{CHANNEL_LABELS[contact.channel_source] || contact.channel_source}</span>
                </div>
              )}
              {dept && (
                <InfoRow
                  icon={<Target className="h-3.5 w-3.5" />}
                  label="Departamento"
                  value={DEPT_LABELS[dept] || dept}
                />
              )}
              <InfoRow
                icon={<Bot className="h-3.5 w-3.5" />}
                label="Triage"
                value={convState?.triage_stage || '—'}
              />
            </div>
          </div>

          {/* Interaction Timeline */}
          <div className="p-4 border-b border-border">
            <h4 className="font-display text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Interações</h4>
            <div className="space-y-3">
              {/* Conversation start */}
              <div className="flex gap-2.5">
                <div className="flex flex-col items-center">
                  <div className="h-2 w-2 rounded-full bg-accent mt-1.5" />
                  <div className="flex-1 w-px bg-border" />
                </div>
                <div>
                  <p className="text-xs font-medium text-foreground">Conversa iniciada</p>
                  <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                    <Calendar className="h-3 w-3" />
                    {conversation.created_at ? new Date(conversation.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—'}
                  </p>
                  {dept && (
                    <Badge className={cn('text-[10px] px-1.5 py-0 mt-1', DEPT_COLORS[dept] || '')}>
                      {DEPT_LABELS[dept] || dept}
                    </Badge>
                  )}
                </div>
              </div>

              {/* AI triage */}
              {convState?.triage_stage && (
                <div className="flex gap-2.5">
                  <div className="flex flex-col items-center">
                    <div className="h-2 w-2 rounded-full bg-success mt-1.5" />
                    <div className="flex-1 w-px bg-border" />
                  </div>
                  <div>
                    <p className="text-xs font-medium text-foreground">Triage IA: {convState.triage_stage}</p>
                    <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                      <Bot className="h-3 w-3" />
                      {convState.is_ai_active ? 'IA ativa' : 'Operador assume'}
                    </p>
                  </div>
                </div>
              )}

              {/* Operator takeover */}
              {convState?.operator_takeover_at && (
                <div className="flex gap-2.5">
                  <div className="flex flex-col items-center">
                    <div className="h-2 w-2 rounded-full bg-warning mt-1.5" />
                    <div className="flex-1 w-px bg-border" />
                  </div>
                  <div>
                    <p className="text-xs font-medium text-foreground">Atribuído ao operador</p>
                    <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {new Date(convState.operator_takeover_at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                </div>
              )}

              {/* Current status */}
              <div className="flex gap-2.5">
                <div className="flex flex-col items-center">
                  <div className={cn('h-2 w-2 rounded-full mt-1.5', convState?.is_ai_active ? 'bg-success' : 'bg-warning')} />
                </div>
                <div>
                  <p className="text-xs font-medium text-foreground">Status atual</p>
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0 mt-0.5">
                    {convState?.is_ai_active ? 'IA ativa' : convState?.operator_id ? 'Com operador' : 'Inativa'}
                  </Badge>
                </div>
              </div>
            </div>
          </div>

          {/* Qualification */}
          {leadQual && (
            <div className="p-4 border-b border-border">
              <h4 className="font-display text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Qualificação</h4>
              <div className="space-y-2.5">
                <InfoRow icon={<MapPin className="h-3.5 w-3.5" />} label="Bairro" value={leadQual.detected_neighborhood || '—'} />
                <InfoRow icon={<Home className="h-3.5 w-3.5" />} label="Tipo" value={leadQual.detected_property_type || '—'} />
                <InfoRow icon={<Bed className="h-3.5 w-3.5" />} label="Quartos" value={leadQual.detected_bedrooms?.toString() || '—'} />
                <InfoRow icon={<DollarSign className="h-3.5 w-3.5" />} label="Budget máx" value={formatCurrency(leadQual.detected_budget_max)} />
                <InfoRow icon={<Target className="h-3.5 w-3.5" />} label="Interesse" value={leadQual.detected_interest || '—'} />
                {leadQual.qualification_score != null && (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">Score:</span>
                    <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full bg-accent rounded-full transition-all"
                        style={{ width: `${Math.min(100, (leadQual.qualification_score / 10) * 100)}%` }}
                      />
                    </div>
                    <span className="text-xs font-semibold text-foreground">{leadQual.qualification_score}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Tags */}
          {contact?.tags && contact.tags.length > 0 && (
            <div className="p-4">
              <h4 className="font-display text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Tags</h4>
              <div className="flex flex-wrap gap-1.5">
                {contact.tags.map((tag) => (
                  <Badge key={tag} variant="secondary" className="text-[10px]">
                    {tag}
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

const InfoRow: React.FC<{ icon: React.ReactNode; label: string; value: string }> = ({ icon, label, value }) => (
  <div className="flex items-center gap-2">
    <span className="text-muted-foreground">{icon}</span>
    <span className="text-xs text-muted-foreground">{label}:</span>
    <span className="text-xs font-medium text-foreground truncate">{value}</span>
  </div>
);

export default ChatPage;
