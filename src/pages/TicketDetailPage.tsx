import React, { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useSessionState } from '@/hooks/useSessionState';
import { useTenant } from '@/contexts/TenantContext';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Loader2,
  ArrowLeft,
  Clock,
  Phone,
  Mail,
  User,
  MessageSquare,
  Send,
  AlertTriangle,
  CheckCircle2,
  Tag,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { TicketContextPanel } from '@/components/tickets/TicketContextPanel';

interface TicketStage {
  id: string;
  name: string;
  color: string;
  order_index: number;
  is_terminal: boolean;
}

interface Comment {
  id: string;
  body: string;
  is_internal: boolean;
  created_at: string;
  author?: { id: string; full_name: string | null; avatar_url: string | null } | null;
}

interface ConversationMessage {
  id: string;
  direction: string;
  body: string | null;
  media_type: string | null;
  media_url: string | null;
  created_at: string;
}

interface TicketDetail {
  id: string;
  title: string;
  description: string | null;
  category: string;
  priority: string;
  stage: string;
  stage_id: string | null;
  source: string;
  phone: string;
  email: string | null;
  contact_id: string | null;
  assigned_to: string | null;
  conversation_id: string | null;
  sla_deadline: string | null;
  resolved_at: string | null;
  resolution_notes: string | null;
  created_at: string;
  updated_at: string;
  contact?: { id: string; name: string | null; phone: string; email: string | null; contact_type: string | null; property_unit: string | null } | null;
  assigned?: { id: string; full_name: string | null; avatar_url: string | null } | null;
  stage_ref?: TicketStage | null;
  category_ref?: { id: string; name: string; sla_hours: number } | null;
}

const PRIORITY_CONFIG: Record<string, { label: string; color: string }> = {
  urgente: { label: 'Urgente', color: 'bg-red-100 text-red-800 border-red-200' },
  alta: { label: 'Alta', color: 'bg-orange-100 text-orange-800 border-orange-200' },
  media: { label: 'Media', color: 'bg-yellow-100 text-yellow-800 border-yellow-200' },
  baixa: { label: 'Baixa', color: 'bg-green-100 text-green-800 border-green-200' },
};

const TicketDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const { tenantId } = useTenant();
  const { profile } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [ticket, setTicket] = useState<TicketDetail | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [stages, setStages] = useState<TicketStage[]>([]);
  const [teamMembers, setTeamMembers] = useState<{ id: string; full_name: string | null }[]>([]);
  const [loading, setLoading] = useState(true);
  const [newComment, setNewComment] = useSessionState(`ticket_comment_${id}`, '');
  const [isInternal, setIsInternal] = useState(false);
  const [sending, setSending] = useState(false);
  const [activeTab, setActiveTab] = useSessionState<'comments' | 'conversation'>(`ticket_tab_${id}`, 'comments');

  const fetchTicket = useCallback(async () => {
    if (!tenantId || !id) return;
    setLoading(true);

    const { data, error } = await supabase.functions.invoke('manage-tickets', {
      body: { action: 'get_ticket', ticket_id: id },
    });

    if (error || !data?.ticket) {
      toast({ variant: 'destructive', title: 'Erro', description: 'Chamado nao encontrado' });
      navigate('/chamados');
      return;
    }

    setTicket(data.ticket);
    setComments(data.comments || []);
    setMessages(data.messages || []);

    // Load stages
    const { data: stagesData } = await supabase
      .from('ticket_stages')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('order_index');
    if (stagesData) setStages(stagesData as unknown as TicketStage[]);

    // Load team members
    const { data: team } = await supabase
      .from('profiles')
      .select('id, full_name')
      .eq('tenant_id', tenantId)
      .in('role', ['admin', 'operator']);
    if (team) setTeamMembers(team);

    setLoading(false);
  }, [tenantId, id, navigate, toast]);

  useEffect(() => {
    fetchTicket();

    if (!tenantId || !id) return;

    const channel = supabase
      .channel(`ticket_detail_${id}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'tickets',
        filter: `id=eq.${id}`,
      }, () => {
        fetchTicket();
      })
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'ticket_comments',
        filter: `ticket_id=eq.${id}`,
      }, () => {
        fetchTicket();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchTicket, tenantId, id]);

  useEffect(() => {
    if (!ticket?.conversation_id) return;

    const messagesChannel = supabase
      .channel(`ticket_messages_${ticket.conversation_id}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'messages',
        filter: `conversation_id=eq.${ticket.conversation_id}`,
      }, () => {
        fetchTicket();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(messagesChannel);
    };
  }, [ticket?.conversation_id, fetchTicket]);

  const updateTicket = async (updates: Record<string, any>) => {
    if (!id) return;
    const { error } = await supabase.functions.invoke('manage-tickets', {
      body: { action: 'update_ticket', ticket_id: id, ...updates },
    });

    if (error) {
      toast({ variant: 'destructive', title: 'Erro ao atualizar', description: error.message });
      return;
    }

    toast({ title: 'Chamado atualizado' });
    fetchTicket();
  };

  const addComment = async () => {
    if (!newComment.trim() || !id) return;
    setSending(true);

    const { error } = await supabase.functions.invoke('manage-tickets', {
      body: { action: 'add_comment', ticket_id: id, comment: newComment, is_internal: isInternal },
    });

    setSending(false);
    if (error) {
      toast({ variant: 'destructive', title: 'Erro', description: error.message });
      return;
    }

    setNewComment('');
    fetchTicket();
  };

  if (loading || !ticket) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const isSlaExpired = ticket.sla_deadline && new Date(ticket.sla_deadline) < new Date() && !ticket.resolved_at;
  const stageObj = stages.find((s) => s.id === ticket.stage_id);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-4 px-6 py-4 border-b">
        <Button variant="ghost" size="icon" onClick={() => navigate('/chamados')}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-bold truncate">{ticket.title}</h1>
            {isSlaExpired && (
              <Badge variant="destructive" className="text-xs gap-1">
                <AlertTriangle className="h-3 w-3" /> SLA Estourado
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-3 mt-1">
            <Badge variant="outline" className={cn('text-xs', PRIORITY_CONFIG[ticket.priority]?.color)}>
              {PRIORITY_CONFIG[ticket.priority]?.label || ticket.priority}
            </Badge>
            <Badge variant="secondary" className="text-xs">{ticket.category}</Badge>
            {stageObj && (
              <Badge variant="outline" className="text-xs" style={{ borderColor: stageObj.color, color: stageObj.color }}>
                {stageObj.name}
              </Badge>
            )}
            <span className="text-xs text-muted-foreground">
              Criado em {new Date(ticket.created_at).toLocaleString('pt-BR')}
            </span>
          </div>
        </div>
      </div>

      {/* Body - two columns */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left: Details + Comments/Conversation */}
        <div className="flex-1 flex flex-col overflow-hidden border-r">
          {/* Description */}
          {ticket.description && (
            <div className="px-6 py-4 border-b bg-muted/20">
              <p className="text-sm whitespace-pre-wrap">{ticket.description}</p>
            </div>
          )}

          {/* Tab toggle */}
          <div className="flex border-b">
            <button
              onClick={() => setActiveTab('comments')}
              className={cn(
                'flex-1 px-4 py-2.5 text-sm font-medium transition-colors',
                activeTab === 'comments' ? 'border-b-2 border-primary text-primary' : 'text-muted-foreground hover:text-foreground'
              )}
            >
              Comentarios ({comments.length})
            </button>
            {ticket.conversation_id && (
              <button
                onClick={() => setActiveTab('conversation')}
                className={cn(
                  'flex-1 px-4 py-2.5 text-sm font-medium transition-colors',
                  activeTab === 'conversation' ? 'border-b-2 border-primary text-primary' : 'text-muted-foreground hover:text-foreground'
                )}
              >
                Conversa WhatsApp ({messages.length})
              </button>
            )}
          </div>

          {/* Content */}
          <ScrollArea className="flex-1">
            {activeTab === 'comments' ? (
              <div className="p-4 space-y-4">
                {comments.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-8">Nenhum comentario ainda</p>
                )}
                {comments.map((c) => (
                  <div key={c.id} className={cn('flex gap-3', c.is_internal && 'opacity-70')}>
                    <Avatar className="h-8 w-8 shrink-0">
                      <AvatarFallback className="text-xs">
                        {c.author?.full_name?.charAt(0) || 'U'}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">{c.author?.full_name || 'Usuario'}</span>
                        {c.is_internal && <Badge variant="outline" className="text-[10px]">Interno</Badge>}
                        <span className="text-xs text-muted-foreground">
                          {new Date(c.created_at).toLocaleString('pt-BR')}
                        </span>
                      </div>
                      <p className="text-sm mt-1 whitespace-pre-wrap">{c.body}</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-4 space-y-2">
                {messages.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-8">Nenhuma mensagem</p>
                )}
                {messages.map((m) => (
                  <div
                    key={m.id}
                    className={cn(
                      'max-w-[80%] rounded-lg px-3 py-2',
                      m.direction === 'inbound'
                        ? 'bg-muted mr-auto'
                        : 'bg-primary/10 ml-auto'
                    )}
                  >
                    <p className="text-sm whitespace-pre-wrap">{m.body || '[media]'}</p>
                    <span className="text-[10px] text-muted-foreground">
                      {new Date(m.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>

          {/* Comment input */}
          {activeTab === 'comments' && (
            <div className="border-t p-4">
              <div className="flex gap-2">
                <Textarea
                  placeholder="Adicionar comentario..."
                  value={newComment}
                  onChange={(e) => setNewComment(e.target.value)}
                  rows={2}
                  className="flex-1"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) addComment();
                  }}
                />
                <div className="flex flex-col gap-1">
                  <Button size="icon" onClick={addComment} disabled={!newComment.trim() || sending}>
                    {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  </Button>
                  <Button
                    size="icon"
                    variant={isInternal ? 'secondary' : 'ghost'}
                    onClick={() => setIsInternal(!isInternal)}
                    title={isInternal ? 'Comentario interno (nao visivel ao cliente)' : 'Comentario publico'}
                  >
                    <Tag className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Right sidebar: Ticket properties */}
        <div className="w-80 shrink-0 overflow-y-auto">
          <div className="p-4 space-y-5">
            {/* Stage */}
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase">Estagio</label>
              <Select
                value={ticket.stage_id || ''}
                onValueChange={(val) => updateTicket({ stage_id: val })}
              >
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {stages.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      <div className="flex items-center gap-2">
                        <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: s.color }} />
                        {s.name}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Priority */}
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase">Prioridade</label>
              <Select
                value={ticket.priority}
                onValueChange={(val) => updateTicket({ priority: val })}
              >
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="baixa">Baixa</SelectItem>
                  <SelectItem value="media">Media</SelectItem>
                  <SelectItem value="alta">Alta</SelectItem>
                  <SelectItem value="urgente">Urgente</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Assigned to */}
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase">Responsavel</label>
              <Select
                value={ticket.assigned_to || 'unassigned'}
                onValueChange={(val) => updateTicket({ assigned_to: val === 'unassigned' ? null : val })}
              >
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Nao atribuido" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="unassigned">Nao atribuido</SelectItem>
                  {teamMembers.map((m) => (
                    <SelectItem key={m.id} value={m.id}>{m.full_name || 'Sem nome'}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Separator />

            {/* Context Panel — Vista Office (Sprint 6.1) */}
            <TicketContextPanel
              ticketId={ticket.id}
              categoryId={ticket.category_ref?.id || null}
            />

            <Separator />

            {/* Contact info */}
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase">Contato</label>
              <div className="mt-2 space-y-2">
                {ticket.contact?.name && (
                  <div className="flex items-center gap-2 text-sm">
                    <User className="h-4 w-4 text-muted-foreground" />
                    {ticket.contact.name}
                  </div>
                )}
                <div className="flex items-center gap-2 text-sm">
                  <Phone className="h-4 w-4 text-muted-foreground" />
                  {ticket.phone}
                </div>
                {ticket.email && (
                  <div className="flex items-center gap-2 text-sm">
                    <Mail className="h-4 w-4 text-muted-foreground" />
                    {ticket.email}
                  </div>
                )}
                {ticket.contact?.property_unit && (
                  <div className="flex items-center gap-2 text-sm">
                    <Tag className="h-4 w-4 text-muted-foreground" />
                    Unidade: {ticket.contact.property_unit}
                  </div>
                )}
                {ticket.contact?.contact_type && (
                  <Badge variant="outline" className="text-xs">{ticket.contact.contact_type}</Badge>
                )}
              </div>
            </div>

            <Separator />

            {/* SLA info */}
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase">SLA</label>
              <div className="mt-2 space-y-1">
                {ticket.sla_deadline && (
                  <div className={cn('flex items-center gap-2 text-sm', isSlaExpired && 'text-red-600')}>
                    <Clock className="h-4 w-4" />
                    Prazo: {new Date(ticket.sla_deadline).toLocaleString('pt-BR')}
                  </div>
                )}
                {ticket.resolved_at && (
                  <div className="flex items-center gap-2 text-sm text-green-600">
                    <CheckCircle2 className="h-4 w-4" />
                    Resolvido: {new Date(ticket.resolved_at).toLocaleString('pt-BR')}
                  </div>
                )}
                {ticket.category_ref && (
                  <p className="text-xs text-muted-foreground">
                    SLA padrao: {ticket.category_ref.sla_hours}h
                  </p>
                )}
              </div>
            </div>

            <Separator />

            {/* Source */}
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase">Origem</label>
              <p className="text-sm mt-1 flex items-center gap-2">
                <MessageSquare className="h-4 w-4 text-muted-foreground" />
                {ticket.source === 'whatsapp_ai' ? 'WhatsApp IA' : ticket.source === 'manual' ? 'Manual' : ticket.source}
              </p>
            </div>

            {/* Resolution notes */}
            {ticket.resolution_notes && (
              <>
                <Separator />
                <div>
                  <label className="text-xs font-semibold text-muted-foreground uppercase">Notas de resolucao</label>
                  <p className="text-sm mt-1 whitespace-pre-wrap">{ticket.resolution_notes}</p>
                </div>
              </>
            )}

            {/* Navigate to conversation */}
            {ticket.conversation_id && (
              <>
                <Separator />
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full"
                  onClick={() => navigate(`/chat/${ticket.conversation_id}`)}
                >
                  <MessageSquare className="h-4 w-4 mr-2" />
                  Abrir Conversa
                </Button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default TicketDetailPage;
