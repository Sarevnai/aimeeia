import React, { useCallback, useEffect, useState, useRef, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useSessionState } from '@/hooks/useSessionState';
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
  ArrowRightLeft,
  Info,
  ExternalLink,
  Pencil,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import type { Tables } from '@/integrations/supabase/types';
import ChatMediaUpload from '@/components/chat/ChatMediaUpload';
import SendToC2SDialog from '@/components/SendToC2SDialog';
import { AdminContactSidebar } from '@/components/chat/AdminContactSidebar';
import { AudioRecordButton } from '@/components/chat/AudioRecordButton';
import BrokerWATemplatesManager from '@/components/chat/BrokerWATemplatesManager';
import { usePollingFallback } from '@/hooks/usePollingFallback';
import LeadTags from '@/components/LeadTags';

type Message = Tables<'messages'>;
type Conversation = Tables<'conversations'>;
type Contact = Tables<'contacts'>;
type ConversationState = Tables<'conversation_states'>;
type LeadQualification = Tables<'lead_qualification'>;

// P2 (cutover 07/05): formata quanto tempo a Aimee está pausada nesta conversa,
// pra que o operador veja "há X" no badge e não esqueça uma conversa pausada
// há horas. Granularidade m/h/d cobre os casos práticos da operação Smolka.
function formatPausedFor(isoTs: string): string {
  const ms = Date.now() - new Date(isoTs).getTime();
  if (!Number.isFinite(ms) || ms < 0) return '';
  const min = Math.floor(ms / 60_000);
  if (min < 1) return 'agora';
  if (min < 60) return `há ${min}m`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `há ${hr}h`;
  const d = Math.floor(hr / 24);
  return `há ${d}d`;
}

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

interface TeamMember {
  id: string;
  full_name: string | null;
  role: string | null;
}

const ChatPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { tenantId } = useTenant();
  const { user, profile } = useAuth();

  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [contact, setContact] = useState<Contact | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [convState, setConvState] = useState<ConversationState | null>(null);
  // Bug descoberto em 22/04 no cutover 07/05: ausência de row em
  // conversation_states = IA ativa por default no backend (whatsapp-webhook e
  // ai-agent rodam se não houver state bloqueando). A UI antes tratava
  // convState null como pausada, mostrando "Aimee pausada" em 77/79 conversas
  // da Smolka que nunca tiveram state criado. Agora só consideramos pausada
  // quando is_ai_active === false explicitamente.
  const aimeeActive = convState?.is_ai_active !== false;
  const [leadQual, setLeadQual] = useState<LeadQualification | null>(null);
  const [loading, setLoading] = useState(true);
  const [inputValue, setInputValue] = useSessionState(`chat_input_${id}`, '');
  const [sending, setSending] = useState(false);
  const [showSidebar, setShowSidebar] = useState(true);
  const [c2sDialogOpen, setC2sDialogOpen] = useState(false);
  const [operatorName, setOperatorName] = useState<string | null>(null);
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [senderNames, setSenderNames] = useState<Record<string, string>>({});
  const [sendingToWA, setSendingToWA] = useState(false);
  const [showWADialog, setShowWADialog] = useState(false);
  const [waEditText, setWaEditText] = useState('');
  const [showWATemplatesManager, setShowWATemplatesManager] = useState(false);
  const [dbWaTemplates, setDbWaTemplates] = useState<{ id: string; label: string; icon: string; text_template: string }[]>([]);

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

  // Realtime: inscreve em messages + conversation_states dessa conversa.
  // Sem polling fallback — se o realtime cair, o operador usa o botão de refresh do browser.
  // (O polling de 3s estava matando a UX quando o realtime dava CHANNEL_ERROR.)
  const refetchMessages = useCallback(async () => {
    if (!id || !tenantId) return;
    const { data } = await supabase
      .from('messages')
      .select('*')
      .eq('conversation_id', id)
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: true })
      .limit(500);
    if (data) setMessages(data as Message[]);
  }, [id, tenantId]);

  useEffect(() => {
    if (!id || !tenantId || !conversation?.phone_number) return;

    const channel = supabase
      .channel(`chat_page_${id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'messages', filter: `conversation_id=eq.${id}` },
        () => {
          refetchMessages();
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'conversation_states', filter: `phone_number=eq.${conversation.phone_number}` },
        (payload) => {
          if (payload.new && (payload.new as any).tenant_id === tenantId) {
            setConvState(payload.new as ConversationState);
          }
        },
      )
      .subscribe((status, err) => {
        console.log(`[ChatPage realtime] conv ${id.slice(0, 8)} status:`, status, err || '');
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [id, tenantId, conversation?.phone_number, refetchMessages]);

  // Rede de segurança: se o Realtime cair (CHANNEL_ERROR/TIMED_OUT/CLOSED),
  // re-fetch a cada 15s. Para automaticamente quando o Realtime volta.
  usePollingFallback(refetchMessages);

  // Resolve operator name when convState changes
  useEffect(() => {
    if (!convState?.operator_id) {
      setOperatorName(null);
      return;
    }
    supabase
      .from('profiles')
      .select('full_name')
      .eq('id', convState.operator_id)
      .single()
      .then(({ data }) => setOperatorName(data?.full_name || null));
  }, [convState?.operator_id]);

  // Resolve sender names for operator messages
  useEffect(() => {
    const operatorMsgs = messages.filter((m) => m.sender_type === 'operator' && m.sender_id);
    const uniqueIds = [...new Set(operatorMsgs.map((m) => m.sender_id!))];
    const missingIds = uniqueIds.filter((uid) => !senderNames[uid]);
    if (missingIds.length === 0) return;

    supabase
      .from('profiles')
      .select('id, full_name')
      .in('id', missingIds)
      .then(({ data }) => {
        if (!data) return;
        setSenderNames((prev) => {
          const next = { ...prev };
          data.forEach((p) => { next[p.id] = p.full_name || 'Operador'; });
          return next;
        });
      });
  }, [messages]);

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
          console.log('[ChatPage realtime] nova msg:', payload.new);
          setMessages((prev) => {
            // Remove a mensagem otimista correspondente antes de inserir a definitiva
            // para evitar duplicação (mesmo body + direction outbound + id temporário)
            const filtered = prev.filter(
              (m) =>
                !(
                  typeof m.id === 'string' && (m.id as string).startsWith('temp-') &&
                  m.body === (payload.new as Message).body &&
                  m.direction === 'outbound'
                )
            );
            return [...filtered, payload.new as Message];
          });
        }
      )
      .subscribe((status, err) => {
        console.log(`[ChatPage realtime] chat ${id?.slice(0, 8)} status:`, status, err || '');
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [id, tenantId]);

  const handleSend = async () => {
    if (!inputValue.trim() || !conversation || !tenantId || sending) return;
    setSending(true);

    const tempId = `temp-${Date.now()}`;
    const messageText = inputValue.trim();

    // Optimistic update: exibe a mensagem imediatamente sem esperar o servidor.
    // O evento Realtime posterior substituirá esta entrada pela versão definitiva do banco.
    const optimisticMsg = {
      id: tempId,
      body: messageText,
      direction: 'outbound',
      sender_type: convState?.is_ai_active === false ? 'operator' : 'ai',
      sender_id: convState?.is_ai_active === false ? (user?.id ?? null) : null,
      conversation_id: id ?? '',
      tenant_id: tenantId,
      created_at: new Date().toISOString(),
      wa_message_id: null,
      wa_from: null,
      wa_to: null,
      media_type: null,
      media_url: null,
      department_code: conversation.department_code ?? null,
      event_type: null,
      raw: null,
    } as Message;

    setMessages((prev) => [...prev, optimisticMsg]);
    setInputValue('');

    try {
      await supabase.functions.invoke('send-wa-message', {
        body: {
          tenant_id: tenantId,
          phone_number: conversation.phone_number,
          message: messageText,
          conversation_id: id,
          department_code: conversation.department_code,
          sender_type: convState?.is_ai_active === false ? 'operator' : 'ai',
          sender_id: convState?.is_ai_active === false ? user?.id : null,
        },
      });
    } catch (error) {
      // Reverter a mensagem otimista e restaurar o input em caso de falha
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
      setInputValue(messageText);
      console.error('Error sending message:', error);
    } finally {
      setSending(false);
    }
  };

  const handleTakeover = async () => {
    if (!conversation || !tenantId || !user) return;
    const myName = profile?.full_name || 'Operador';
    const takeoverAt = new Date().toISOString();

    // Bug 22/04: 77 de 79 conversas ativas da Smolka não têm row em
    // conversation_states (IA roda por default se não houver). O .update()
    // antigo afetava 0 rows silenciosamente nesses casos, e o optimistic
    // setConvState retornava prev (null) — botão "Pausar" nunca flipava.
    // Upsert cria a row se não existir, garantindo que a pausa persiste.
    await supabase
      .from('conversation_states')
      .upsert({
        tenant_id: tenantId,
        phone_number: conversation.phone_number,
        is_ai_active: false,
        operator_id: user.id,
        operator_takeover_at: takeoverAt,
        updated_at: takeoverAt,
      }, { onConflict: 'tenant_id,phone_number' });

    // Insert system event message
    await supabase.from('messages').insert({
      tenant_id: tenantId,
      conversation_id: id,
      direction: 'outbound',
      body: `Operador ${myName} assumiu a conversa`,
      sender_type: 'system',
      event_type: 'operator_joined',
      sender_id: user.id,
    });

    // Record event in audit log
    await supabase.from('conversation_events').insert({
      tenant_id: tenantId,
      conversation_id: id,
      event_type: 'operator_joined',
      actor_id: user.id,
    });

    // Bug 22/04: se prev é null (77/79 conversas sem row), o ternary
    // antigo retornava null e o UI não flipava. Agora construímos a row
    // local a partir do takeover que acabamos de gravar no DB.
    setConvState((prev) => ({
      ...(prev || {
        tenant_id: tenantId,
        phone_number: conversation.phone_number,
        triage_stage: null,
        is_processing: false,
        follow_up_sent_at: null,
        current_module_slug: null,
        pending_properties: null,
        current_property_index: 0,
        awaiting_property_feedback: false,
        last_ai_messages: [],
        last_property_shown_at: null,
        department: null,
        updated_at: takeoverAt,
      } as ConversationState),
      is_ai_active: false,
      operator_id: user.id,
      operator_takeover_at: takeoverAt,
    }));
    setOperatorName(myName);
  };

  const handleReturnToAI = async () => {
    if (!conversation || !tenantId || !user) return;
    const myName = profile?.full_name || 'Operador';
    const resumedAt = new Date().toISOString();

    // Mesmo motivo do handleTakeover: upsert cria row se não houver.
    await supabase
      .from('conversation_states')
      .upsert({
        tenant_id: tenantId,
        phone_number: conversation.phone_number,
        is_ai_active: true,
        operator_id: null,
        operator_takeover_at: null,
        updated_at: resumedAt,
      }, { onConflict: 'tenant_id,phone_number' });

    // Insert system event message
    await supabase.from('messages').insert({
      tenant_id: tenantId,
      conversation_id: id,
      direction: 'outbound',
      body: `Operador ${myName} devolveu a conversa para a IA`,
      sender_type: 'system',
      event_type: 'ai_resumed',
      sender_id: user.id,
    });

    // Record event in audit log
    await supabase.from('conversation_events').insert({
      tenant_id: tenantId,
      conversation_id: id,
      event_type: 'ai_resumed',
      actor_id: user.id,
    });

    setConvState((prev) => ({
      ...(prev || {
        tenant_id: tenantId,
        phone_number: conversation.phone_number,
        triage_stage: null,
        is_processing: false,
        follow_up_sent_at: null,
        current_module_slug: null,
        pending_properties: null,
        current_property_index: 0,
        awaiting_property_feedback: false,
        last_ai_messages: [],
        last_property_shown_at: null,
        department: null,
        updated_at: resumedAt,
      } as ConversationState),
      is_ai_active: true,
      operator_id: null,
      operator_takeover_at: null,
    }));
    setOperatorName(null);
  };

  const handleTransfer = async (targetOperator: TeamMember) => {
    if (!conversation || !tenantId || !user) return;
    const myName = profile?.full_name || 'Operador';
    const targetName = targetOperator.full_name || 'Operador';

    // Insert "operator left" system message
    await supabase.from('messages').insert({
      tenant_id: tenantId,
      conversation_id: id,
      direction: 'outbound',
      body: `Operador ${myName} saiu da conversa`,
      sender_type: 'system',
      event_type: 'operator_left',
      sender_id: user.id,
    });

    // Upsert para garantir row — ver handleTakeover pra explicação.
    const transferredAt = new Date().toISOString();
    await supabase
      .from('conversation_states')
      .upsert({
        tenant_id: tenantId,
        phone_number: conversation.phone_number,
        is_ai_active: false,
        operator_id: targetOperator.id,
        operator_takeover_at: transferredAt,
        updated_at: transferredAt,
      }, { onConflict: 'tenant_id,phone_number' });

    // Insert "operator joined" system message
    await supabase.from('messages').insert({
      tenant_id: tenantId,
      conversation_id: id,
      direction: 'outbound',
      body: `Operador ${targetName} entrou na conversa`,
      sender_type: 'system',
      event_type: 'operator_joined',
      sender_id: targetOperator.id,
    });

    // Record transfer event
    await supabase.from('conversation_events').insert({
      tenant_id: tenantId,
      conversation_id: id,
      event_type: 'transfer',
      actor_id: user.id,
      target_id: targetOperator.id,
    });

    setConvState((prev) => ({
      ...(prev || {
        tenant_id: tenantId,
        phone_number: conversation.phone_number,
        triage_stage: null,
        is_processing: false,
        follow_up_sent_at: null,
        current_module_slug: null,
        pending_properties: null,
        current_property_index: 0,
        awaiting_property_feedback: false,
        last_ai_messages: [],
        last_property_shown_at: null,
        department: null,
        updated_at: transferredAt,
      } as ConversationState),
      is_ai_active: false,
      operator_id: targetOperator.id,
      operator_takeover_at: transferredAt,
    }));
    setOperatorName(targetName);
    setShowTransferModal(false);
  };

  const openTransferModal = async () => {
    if (!tenantId) return;
    const { data } = await supabase
      .from('profiles')
      .select('id, full_name, role')
      .eq('tenant_id', tenantId)
      .in('role', ['admin', 'operator'])
      .neq('id', user?.id || '');
    setTeamMembers(data || []);
    setShowTransferModal(true);
  };

  // Load WA templates from database when dialog opens
  useEffect(() => {
    if (!showWADialog || !tenantId) return;
    supabase
      .from('broker_wa_templates')
      .select('id, label, icon, text_template')
      .eq('tenant_id', tenantId)
      .or(`profile_id.is.null,profile_id.eq.${user?.id}`)
      .eq('is_active', true)
      .order('sort_order')
      .then(({ data }) => setDbWaTemplates(data || []));
  }, [showWADialog, tenantId, user?.id]);

  // Apply variable substitution to template text
  const resolveTemplate = (template: string) => {
    const contactName = contact?.name || 'cliente';
    const brokerName = profile?.full_name || 'corretor';
    const qualParts = [
      leadQual?.detected_neighborhood && `região ${leadQual.detected_neighborhood}`,
      leadQual?.detected_property_type,
      leadQual?.detected_bedrooms && `${leadQual.detected_bedrooms} quartos`,
      leadQual?.detected_budget_max && `orçamento até R$ ${Number(leadQual.detected_budget_max).toLocaleString('pt-BR')}`,
    ].filter(Boolean).join(', ');

    return template
      .replace(/\{\{lead_nome\}\}/g, contactName)
      .replace(/\{\{corretor_nome\}\}/g, brokerName)
      .replace(/\{\{empresa\}\}/g, 'Smolka Imóveis')
      .replace(/\{\{qualificacao\}\}/g, qualParts || 'imóvel');
  };

  const waMessages = useMemo(() => {
    return dbWaTemplates.map((t) => ({
      label: `${t.icon} ${t.label}`,
      text: resolveTemplate(t.text_template),
    }));
  }, [dbWaTemplates, contact?.name, profile?.full_name, leadQual]);

  const handleOpenWALink = async (messageText: string) => {
    if (!conversation || !tenantId || !user) return;
    setSendingToWA(true);

    try {
      // Build wa.me link with the LEAD's phone number
      const leadPhone = conversation.phone_number.replace(/\D/g, '');
      const encodedMsg = encodeURIComponent(messageText);
      const waUrl = `https://wa.me/${leadPhone}?text=${encodedMsg}`;

      // Pause AI so it doesn't interfere (upsert — ver handleTakeover).
      const waTakeoverAt = new Date().toISOString();
      await supabase
        .from('conversation_states')
        .upsert({
          tenant_id: tenantId,
          phone_number: conversation.phone_number,
          is_ai_active: false,
          operator_id: user.id,
          operator_takeover_at: waTakeoverAt,
          updated_at: waTakeoverAt,
        }, { onConflict: 'tenant_id,phone_number' });

      // Log the action
      const myName = profile?.full_name || 'Operador';
      await supabase.from('messages').insert({
        tenant_id: tenantId,
        conversation_id: id,
        direction: 'outbound',
        body: `${myName} continuou o atendimento pelo WhatsApp pessoal`,
        sender_type: 'system',
        event_type: 'sent_to_broker_wa',
        sender_id: user.id,
      });

      await supabase.from('conversation_events').insert({
        tenant_id: tenantId,
        conversation_id: id,
        event_type: 'operator_joined',
        actor_id: user.id,
        metadata: { action: 'sent_to_personal_wa', lead_phone: leadPhone },
      });

      const myFullName = profile?.full_name || 'Operador';
      setConvState((prev) => ({
        ...(prev || {
          tenant_id: tenantId,
          phone_number: conversation.phone_number,
          triage_stage: null,
          is_processing: false,
          follow_up_sent_at: null,
          current_module_slug: null,
          pending_properties: null,
          current_property_index: 0,
          awaiting_property_feedback: false,
          last_ai_messages: [],
          last_property_shown_at: null,
          department: null,
          updated_at: waTakeoverAt,
        } as ConversationState),
        is_ai_active: false,
        operator_id: user.id,
        operator_takeover_at: waTakeoverAt,
      }));
      setOperatorName(myFullName);

      // Open WhatsApp link in new tab
      window.open(waUrl, '_blank');
      setShowWADialog(false);
    } catch (error) {
      console.error('Error preparing WA redirect:', error);
    } finally {
      setSendingToWA(false);
    }
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
  // Sprint 6.2 — admin não usa C2S, não tem qualificação de lead, não tem tags de qualificação
  const isAdminDept = dept === 'administrativo';

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
              {aimeeActive ? (
                <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-success text-success">
                  <Bot className="h-3 w-3 mr-0.5" /> Aimee ativa
                </Badge>
              ) : (
                <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-warning text-warning" title={convState?.operator_takeover_at ? `Pausada em ${new Date(convState.operator_takeover_at).toLocaleString('pt-BR')}` : undefined}>
                  <Pause className="h-3 w-3 mr-0.5" />
                  Aimee pausada{convState?.operator_takeover_at ? ` · ${formatPausedFor(convState.operator_takeover_at)}` : ''}
                  {operatorName ? ` · ${operatorName}` : ''}
                </Badge>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {aimeeActive ? (
              <Button size="sm" variant="outline" onClick={handleTakeover} className="text-xs" title="Pausa a Aimee nesta conversa e marca você como responsável">
                <Pause className="h-3.5 w-3.5 mr-1" /> Pausar Aimee
              </Button>
            ) : (
              <>
                <Button size="sm" variant="outline" onClick={handleReturnToAI} className="text-xs">
                  <Bot className="h-3.5 w-3.5 mr-1" /> Devolver AI
                </Button>
                <Button size="sm" variant="outline" onClick={openTransferModal} className="text-xs">
                  <ArrowRightLeft className="h-3.5 w-3.5 mr-1" /> Transferir
                </Button>
              </>
            )}
            <Button
              size="sm"
              variant="outline"
              onClick={() => setShowWADialog(true)}
              className="text-xs"
              title="Continuar atendimento no WhatsApp pessoal"
            >
              <Phone className="h-3.5 w-3.5 mr-1" />
              WhatsApp
            </Button>
            {!isAdminDept && (
              <Button size="sm" variant="outline" onClick={() => setC2sDialogOpen(true)} className="text-xs" title="Encaminhar ao C2S">
                <ExternalLink className="h-3.5 w-3.5 mr-1" /> C2S
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
            const isSystem = msg.sender_type === 'system' || msg.event_type != null;
            const isOperatorMsg = msg.sender_type === 'operator';
            const isAiMsg = msg.sender_type === 'ai' || (isOutbound && !isSystem && !isOperatorMsg);

            // System event messages (centered, no bubble)
            if (isSystem) {
              return (
                <div key={msg.id} className="flex justify-center my-2 animate-fade-in">
                  <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-muted/60 border border-border">
                    <Info className="h-3 w-3 text-muted-foreground" />
                    <span className="text-[11px] italic text-muted-foreground">{msg.body}</span>
                    <span className="text-[9px] text-muted-foreground/60 ml-1">{formatTime(msg.created_at)}</span>
                  </div>
                </div>
              );
            }

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
                  {/* Sender label for outbound messages */}
                  {isOutbound && (
                    <div className="flex items-center gap-1 mb-0.5">
                      {isOperatorMsg ? (
                        <>
                          <UserCheck className="h-3 w-3 text-warning" />
                          <span className="text-[10px] font-semibold text-warning">
                            {msg.sender_id ? (senderNames[msg.sender_id] || 'Operador') : 'Operador'}
                          </span>
                        </>
                      ) : (
                        <>
                          <Bot className="h-3 w-3 text-success" />
                          <span className="text-[10px] font-semibold text-success">Aimee</span>
                        </>
                      )}
                    </div>
                  )}
                  {isAudioMessage(msg) ? (
                    msg.media_url ? (
                      <div className="space-y-1 min-w-[220px]">
                        <audio controls src={msg.media_url} className="w-full h-10" />
                        {msg.body && msg.body.startsWith('[Transcrição de áudio]:') && (
                          <p className="text-[11px] italic text-muted-foreground">
                            {msg.body.replace('[Transcrição de áudio]:', '').trim()}
                          </p>
                        )}
                      </div>
                    ) : (
                      <p className="text-xs italic text-muted-foreground">
                        [Áudio indisponível]{msg.body && msg.body.startsWith('[Transcrição de áudio]:') ? ` — ${msg.body.replace('[Transcrição de áudio]:', '').trim()}` : ''}
                      </p>
                    )
                  ) : msg.media_type === 'video' && msg.media_url ? (
                    <div className="space-y-1">
                      <video
                        controls
                        src={msg.media_url}
                        className="rounded-lg max-w-full max-h-60"
                      />
                      {msg.media_caption && (
                        <p className="text-xs text-muted-foreground">{msg.media_caption}</p>
                      )}
                    </div>
                  ) : msg.media_type === 'image' && msg.media_url ? (
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
                  ) : msg.media_type === 'document' && msg.media_url ? (
                    <a
                      href={msg.media_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 text-sm text-accent hover:underline py-1"
                    >
                      <Image className="h-4 w-4 shrink-0" />
                      <span className="truncate">{msg.media_filename || 'Documento'}</span>
                    </a>
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
          <ChatMediaUpload
            tenantId={tenantId!}
            conversationId={id!}
            phoneNumber={conversation.phone_number}
            departmentCode={conversation.department_code}
            onSending={setSending}
          />
          <AudioRecordButton
            tenantId={tenantId!}
            conversationId={id!}
            phoneNumber={conversation.phone_number}
            departmentCode={conversation.department_code}
            onSending={setSending}
          />
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
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-foreground">{contact?.name || 'Sem nome'}</p>
                <p className="text-xs text-muted-foreground">{conversation.phone_number}</p>
              </div>
            </div>

            <LeadTags
              className="mb-4"
              input={{
                conversationSource: conversation.source,
                conversationStatus: conversation.status,
                contactChannelSource: (contact as any)?.channel_source,
                contactC2SLeadId: (contact as any)?.c2s_lead_id,
                dnc: (contact as any)?.dnc,
                dncReason: (contact as any)?.dnc_reason,
                isAiActive: aimeeActive,
                operatorTakeoverAt: convState?.operator_takeover_at,
                triageStage: convState?.triage_stage,
                qualificationScore: leadQual?.qualification_score ?? null,
                lastDirection: messages.length ? (messages[messages.length - 1].direction as any) : null,
              }}
            />

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
                      {convState.is_ai_active !== false ? 'IA ativa' : 'Operador assume'}
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
                  <div className={cn('h-2 w-2 rounded-full mt-1.5', aimeeActive ? 'bg-success' : 'bg-warning')} />
                </div>
                <div>
                  <p className="text-xs font-medium text-foreground">Status atual</p>
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0 mt-0.5">
                    {aimeeActive ? 'IA ativa' : convState?.operator_id ? 'Com operador' : 'Pausada'}
                  </Badge>
                </div>
              </div>
            </div>
          </div>

          {/* Admin: info do cliente (não há qualificação de lead — são inquilinos/proprietários) */}
          {isAdminDept && contact && (
            <AdminContactSidebar
              tenantId={tenantId}
              contactId={contact.id}
              contactType={contact.contact_type}
              propertyUnit={contact.property_unit}
              neighborhood={(contact as any).crm_neighborhood}
            />
          )}

          {/* Qualification — apenas vendas/locacao/remarketing. Admin trata clientes, não leads. */}
          {leadQual && !isAdminDept && (
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

          {/* Tags — no setor admin, filtra fora tags de qualificação de vendas (Interesse/Tipo/Bairro/Quartos/Orçamento/Prazo) */}
          {contact?.tags && contact.tags.length > 0 && (
            (() => {
              const leadPrefixes = ['Interesse:', 'Tipo:', 'Bairro:', 'Quartos:', 'Orçamento:', 'Prazo:'];
              const visibleTags = isAdminDept
                ? contact.tags.filter((tag) => !leadPrefixes.some((p) => tag.startsWith(p)))
                : contact.tags;
              if (visibleTags.length === 0) return null;
              return (
                <div className="p-4">
                  <h4 className="font-display text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Tags</h4>
                  <div className="flex flex-wrap gap-1.5">
                    {visibleTags.map((tag) => {
                      // Color-code auto-generated qualification tags
                      const tagColors: Record<string, string> = {
                        'Interesse:': 'bg-blue-100 text-blue-800 border-blue-200',
                        'Tipo:': 'bg-purple-100 text-purple-800 border-purple-200',
                        'Bairro:': 'bg-green-100 text-green-800 border-green-200',
                        'Quartos:': 'bg-orange-100 text-orange-800 border-orange-200',
                        'Orçamento:': 'bg-yellow-100 text-yellow-800 border-yellow-200',
                        'Prazo:': 'bg-pink-100 text-pink-800 border-pink-200',
                      };
                      const colorClass = Object.entries(tagColors).find(([prefix]) => tag.startsWith(prefix))?.[1];
                      return (
                        <Badge
                          key={tag}
                          variant={colorClass ? 'outline' : 'secondary'}
                          className={`text-[10px] ${colorClass || ''}`}
                        >
                          {tag}
                        </Badge>
                      );
                    })}
                  </div>
                </div>
              );
            })()
          )}
        </div>
      )}

      {/* Transfer Modal */}
      {conversation && contact && (
        <SendToC2SDialog
          open={c2sDialogOpen}
          onOpenChange={setC2sDialogOpen}
          tenantId={tenantId}
          conversationId={conversation.id}
          contactId={contact.id}
          phoneNumber={conversation.phone_number}
          contactName={contact.name || undefined}
        />
      )}

      {/* WhatsApp Redirect Dialog */}
      <Dialog open={showWADialog} onOpenChange={(open) => { setShowWADialog(open); if (!open) setWaEditText(''); }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Phone className="h-5 w-5 text-green-500" />
              Continuar no WhatsApp
            </DialogTitle>
            <DialogDescription>
              {waEditText
                ? 'Edite a mensagem abaixo e clique em "Abrir WhatsApp".'
                : `Escolha um modelo para iniciar a conversa com ${contact?.name || 'o lead'}.`
              }
            </DialogDescription>
          </DialogHeader>

          {!waEditText ? (
            <div className="space-y-2 mt-2 max-h-[350px] overflow-y-auto">
              {waMessages.map((msg, idx) => (
                <button
                  key={idx}
                  onClick={() => setWaEditText(msg.text)}
                  className="flex flex-col gap-1 w-full rounded-lg px-4 py-3 text-left hover:bg-accent/50 transition-colors border border-border"
                >
                  <p className="text-sm font-medium text-foreground">{msg.label}</p>
                  <p className="text-xs text-muted-foreground line-clamp-2">{msg.text}</p>
                </button>
              ))}
              <button
                onClick={() => setWaEditText('')}
                className="flex flex-col gap-1 w-full rounded-lg px-4 py-3 text-left hover:bg-accent/50 transition-colors border border-border border-dashed"
              >
                <p className="text-sm font-medium text-foreground">✏️ Mensagem personalizada</p>
                <p className="text-xs text-muted-foreground">Escreva sua própria mensagem do zero</p>
              </button>
            </div>
          ) : (
            <div className="space-y-3 mt-2">
              <textarea
                value={waEditText}
                onChange={(e) => setWaEditText(e.target.value)}
                rows={6}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring"
                placeholder="Digite sua mensagem..."
                autoFocus
              />
              <div className="flex gap-2 justify-between">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setWaEditText('')}
                  className="text-xs"
                >
                  <ArrowLeft className="h-3.5 w-3.5 mr-1" /> Voltar aos modelos
                </Button>
                <Button
                  size="sm"
                  onClick={() => handleOpenWALink(waEditText)}
                  disabled={sendingToWA || !waEditText.trim()}
                  className="text-xs bg-green-600 hover:bg-green-700 text-white"
                >
                  {sendingToWA ? (
                    <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                  ) : (
                    <Phone className="h-3.5 w-3.5 mr-1" />
                  )}
                  Abrir WhatsApp
                </Button>
              </div>
            </div>
          )}

          <div className="pt-2 border-t flex items-center justify-between">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => { setShowWADialog(false); setShowWATemplatesManager(true); }}
              className="text-xs text-muted-foreground"
            >
              <Pencil className="h-3 w-3 mr-1" /> Gerenciar modelos
            </Button>
            <p className="text-[10px] text-muted-foreground">
              A IA pausa ao abrir o WhatsApp.
            </p>
          </div>
        </DialogContent>
      </Dialog>

      <BrokerWATemplatesManager
        open={showWATemplatesManager}
        onOpenChange={setShowWATemplatesManager}
      />

      <Dialog open={showTransferModal} onOpenChange={setShowTransferModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Transferir conversa</DialogTitle>
            <DialogDescription>Selecione o operador para transferir esta conversa.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2 mt-2">
            {teamMembers.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">Nenhum operador disponivel.</p>
            ) : (
              teamMembers.map((member) => (
                <button
                  key={member.id}
                  onClick={() => handleTransfer(member)}
                  className="flex items-center gap-3 w-full rounded-lg px-3 py-2.5 text-left hover:bg-accent/50 transition-colors border border-border"
                >
                  <div className="h-8 w-8 rounded-full bg-secondary flex items-center justify-center shrink-0">
                    <span className="text-xs font-semibold text-secondary-foreground">
                      {(member.full_name?.[0] || '?').toUpperCase()}
                    </span>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground">{member.full_name || 'Sem nome'}</p>
                    <p className="text-[10px] text-muted-foreground capitalize">{member.role}</p>
                  </div>
                </button>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>
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
