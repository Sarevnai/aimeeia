// Sprint 6.2 — Cockpit do operador (setor administrativo de locação).
// Layout 3 colunas: Histórico do contato | Chat WhatsApp-like | Contexto + ações.
// Tudo numa tela só, sem trocar de página pra resolver a demanda.

import React, { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useTenant } from '@/contexts/TenantContext';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
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
  AlertTriangle,
  CheckCircle2,
  MessageSquare,
  ChevronDown,
  Send,
  Star,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { ConversationChatPanel } from '@/components/chat/ConversationChatPanel';
import { TicketContactHistoryPanel } from '@/components/tickets/TicketContactHistoryPanel';
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
  author?: { id: string; full_name: string | null } | null;
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
  first_response_at: string | null;
  nps_score: number | null;
  nps_requested_at: string | null;
  department_code: string | null;
  created_at: string;
  updated_at: string;
  category_ref?: { id: string; name: string; sla_hours: number } | null;
}

const PRIORITY_CONFIG: Record<string, { label: string; color: string }> = {
  urgente: { label: 'Urgente', color: 'bg-red-100 text-red-800 border-red-200' },
  alta: { label: 'Alta', color: 'bg-orange-100 text-orange-800 border-orange-200' },
  media: { label: 'Média', color: 'bg-yellow-100 text-yellow-800 border-yellow-200' },
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
  const [stages, setStages] = useState<TicketStage[]>([]);
  const [teamMembers, setTeamMembers] = useState<{ id: string; full_name: string | null }[]>([]);
  const [loading, setLoading] = useState(true);
  const [newComment, setNewComment] = useState('');
  const [sendingComment, setSendingComment] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);

  const fetchTicket = useCallback(async () => {
    if (!tenantId || !id) return;

    const { data, error } = await supabase.functions.invoke('manage-tickets', {
      body: { action: 'get_ticket', ticket_id: id },
    });

    if (error || !data?.ticket) {
      toast({ variant: 'destructive', title: 'Erro', description: 'Chamado não encontrado' });
      navigate('/chamados');
      return;
    }

    setTicket(data.ticket);
    setComments(data.comments || []);

    const { data: stagesData } = await supabase
      .from('ticket_stages')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('order_index');
    if (stagesData) setStages(stagesData as unknown as TicketStage[]);

    const { data: team } = await supabase
      .from('profiles')
      .select('id, full_name')
      .eq('tenant_id', tenantId)
      .in('role', ['admin', 'operator']);
    if (team) setTeamMembers(team);

    setLoading(false);
  }, [tenantId, id, navigate, toast]);

  useEffect(() => {
    setLoading(true);
    fetchTicket();

    if (!tenantId || !id) return;

    const channel = supabase
      .channel(`ticket_cockpit_${id}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'tickets',
        filter: `id=eq.${id}`,
      }, () => fetchTicket())
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'ticket_comments',
        filter: `ticket_id=eq.${id}`,
      }, () => fetchTicket())
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchTicket, tenantId, id]);

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
    setSendingComment(true);
    const { error } = await supabase.functions.invoke('manage-tickets', {
      body: { action: 'add_comment', ticket_id: id, comment: newComment, is_internal: true },
    });
    setSendingComment(false);
    if (error) {
      toast({ variant: 'destructive', title: 'Erro', description: error.message });
      return;
    }
    setNewComment('');
    fetchTicket();
  };

  if (loading || !ticket) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const isSlaExpired = ticket.sla_deadline && new Date(ticket.sla_deadline) < new Date() && !ticket.resolved_at;
  const stageObj = stages.find((s) => s.id === ticket.stage_id);
  const isResolved = !!ticket.resolved_at;

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Header */}
      <header className="flex items-center gap-3 px-4 py-3 border-b bg-card shrink-0">
        <Button variant="ghost" size="icon" onClick={() => navigate('/chamados')}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="text-base font-bold truncate">{ticket.title}</h1>
            {isSlaExpired && (
              <Badge variant="destructive" className="text-[10px] gap-1">
                <AlertTriangle className="h-3 w-3" /> SLA estourado
              </Badge>
            )}
            {isResolved && (
              <Badge variant="outline" className="text-[10px] gap-1 border-emerald-300 text-emerald-700">
                <CheckCircle2 className="h-3 w-3" /> Resolvido
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            <Badge variant="outline" className={cn('text-[10px]', PRIORITY_CONFIG[ticket.priority]?.color)}>
              {PRIORITY_CONFIG[ticket.priority]?.label || ticket.priority}
            </Badge>
            <Badge variant="secondary" className="text-[10px]">{ticket.category}</Badge>
            {stageObj && (
              <Badge variant="outline" className="text-[10px]" style={{ borderColor: stageObj.color, color: stageObj.color }}>
                {stageObj.name}
              </Badge>
            )}
            <span className="text-[10px] text-muted-foreground">
              Criado em {new Date(ticket.created_at).toLocaleString('pt-BR')}
            </span>
            {ticket.nps_score != null && (
              <span className="flex items-center gap-0.5 text-[10px] text-amber-700">
                <Star className="h-3 w-3 fill-amber-400 text-amber-400" /> NPS {ticket.nps_score}/5
              </span>
            )}
          </div>
        </div>
      </header>

      {/* Description (if any) */}
      {ticket.description && (
        <div className="px-6 py-2 border-b bg-muted/20 shrink-0">
          <p className="text-xs text-muted-foreground whitespace-pre-wrap line-clamp-2">
            {ticket.description}
          </p>
        </div>
      )}

      {/* 3-column cockpit body */}
      <div className="flex-1 flex min-h-0 overflow-hidden">
        {/* COL 1 — Contact History */}
        <aside className="hidden lg:block w-[280px] shrink-0 border-r bg-background">
          <TicketContactHistoryPanel
            contactId={ticket.contact_id}
            tenantId={tenantId}
            currentTicketId={ticket.id}
          />
        </aside>

        {/* COL 2 — Chat WhatsApp-like */}
        <main className="flex-1 min-w-0 flex flex-col bg-muted/10">
          {ticket.conversation_id ? (
            <ConversationChatPanel
              conversationId={ticket.conversation_id}
              tenantId={tenantId!}
              phoneNumber={ticket.phone}
              departmentCode={ticket.department_code || 'administrativo'}
            />
          ) : (
            <div className="flex-1 flex items-center justify-center p-8 text-center">
              <div>
                <MessageSquare className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
                <p className="text-sm font-medium">Chamado sem conversa vinculada</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Este chamado foi criado manualmente. Vincule a uma conversa WhatsApp pra responder pelo cockpit.
                </p>
              </div>
            </div>
          )}
        </main>

        {/* COL 3 — Actions + Context + Notes */}
        <aside className="hidden md:flex w-[340px] shrink-0 border-l bg-card flex-col">
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {/* Quick actions */}
            <div className="space-y-3">
              <div>
                <label className="text-[10px] font-semibold text-muted-foreground uppercase">Estágio</label>
                <Select
                  value={ticket.stage_id || ''}
                  onValueChange={(val) => updateTicket({ stage_id: val })}
                >
                  <SelectTrigger className="mt-1 h-9">
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

              <div>
                <label className="text-[10px] font-semibold text-muted-foreground uppercase">Prioridade</label>
                <Select
                  value={ticket.priority}
                  onValueChange={(val) => updateTicket({ priority: val })}
                >
                  <SelectTrigger className="mt-1 h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="baixa">Baixa</SelectItem>
                    <SelectItem value="media">Média</SelectItem>
                    <SelectItem value="alta">Alta</SelectItem>
                    <SelectItem value="urgente">Urgente</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="text-[10px] font-semibold text-muted-foreground uppercase">Responsável</label>
                <Select
                  value={ticket.assigned_to || 'unassigned'}
                  onValueChange={(val) => updateTicket({ assigned_to: val === 'unassigned' ? null : val })}
                >
                  <SelectTrigger className="mt-1 h-9">
                    <SelectValue placeholder="Não atribuído" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="unassigned">Não atribuído</SelectItem>
                    {teamMembers.map((m) => (
                      <SelectItem key={m.id} value={m.id}>
                        {m.full_name || 'Sem nome'}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <Separator />

            {/* Context Panel */}
            <TicketContextPanel
              ticketId={ticket.id}
              categoryId={ticket.category_ref?.id || null}
            />

            <Separator />

            {/* SLA + timing */}
            <div>
              <label className="text-[10px] font-semibold text-muted-foreground uppercase">Tempo</label>
              <div className="mt-2 space-y-1.5 text-xs">
                {ticket.first_response_at && (
                  <div className="flex items-center gap-1.5 text-muted-foreground">
                    <Clock className="h-3 w-3" />
                    1ª resposta: {new Date(ticket.first_response_at).toLocaleString('pt-BR')}
                  </div>
                )}
                {ticket.sla_deadline && (
                  <div className={cn('flex items-center gap-1.5', isSlaExpired ? 'text-red-600' : 'text-muted-foreground')}>
                    <Clock className="h-3 w-3" />
                    Prazo: {new Date(ticket.sla_deadline).toLocaleString('pt-BR')}
                  </div>
                )}
                {ticket.resolved_at && (
                  <div className="flex items-center gap-1.5 text-emerald-600">
                    <CheckCircle2 className="h-3 w-3" />
                    Resolvido em {new Date(ticket.resolved_at).toLocaleString('pt-BR')}
                  </div>
                )}
                {ticket.nps_requested_at && ticket.nps_score == null && (
                  <div className="flex items-center gap-1.5 text-purple-600 italic">
                    <Star className="h-3 w-3" />
                    Aguardando avaliação NPS do cliente
                  </div>
                )}
              </div>
            </div>

            <Separator />

            {/* Internal notes (collapsible) */}
            <Collapsible open={notesOpen} onOpenChange={setNotesOpen}>
              <CollapsibleTrigger asChild>
                <button className="w-full flex items-center justify-between hover:text-primary transition">
                  <label className="text-[10px] font-semibold text-muted-foreground uppercase cursor-pointer">
                    Notas internas ({comments.length})
                  </label>
                  <ChevronDown className={cn('h-4 w-4 text-muted-foreground transition-transform', notesOpen && 'rotate-180')} />
                </button>
              </CollapsibleTrigger>
              <CollapsibleContent className="mt-2 space-y-3">
                {comments.length === 0 && (
                  <p className="text-[11px] text-muted-foreground italic">Sem notas internas ainda.</p>
                )}
                {comments.map((c) => (
                  <div key={c.id} className="text-xs border-l-2 border-muted pl-2">
                    <div className="flex items-center justify-between">
                      <span className="font-medium">{c.author?.full_name || 'Operador'}</span>
                      <span className="text-[9px] text-muted-foreground">
                        {new Date(c.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    <p className="mt-0.5 whitespace-pre-wrap text-foreground/80">{c.body}</p>
                  </div>
                ))}
                <div className="flex gap-2 pt-2 border-t">
                  <Textarea
                    placeholder="Nota interna (não enviada ao cliente)"
                    value={newComment}
                    onChange={(e) => setNewComment(e.target.value)}
                    rows={2}
                    className="text-xs min-h-[60px]"
                  />
                  <Button
                    size="icon"
                    variant="outline"
                    className="shrink-0"
                    onClick={addComment}
                    disabled={!newComment.trim() || sendingComment}
                  >
                    {sendingComment ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
                  </Button>
                </div>
              </CollapsibleContent>
            </Collapsible>
          </div>
        </aside>
      </div>
    </div>
  );
};

export default TicketDetailPage;
