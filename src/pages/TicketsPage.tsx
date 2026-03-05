import React, { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useTenant } from '@/contexts/TenantContext';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import {
  Loader2,
  Plus,
  Search,
  LayoutList,
  Kanban,
  Clock,
  AlertTriangle,
  Phone,
  User,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import {
  DndContext,
  DragOverlay,
  closestCorners,
  PointerSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
} from '@dnd-kit/core';
import { useDroppable } from '@dnd-kit/core';
import { useDraggable } from '@dnd-kit/core';

interface TicketStage {
  id: string;
  name: string;
  color: string;
  order_index: number;
  is_terminal: boolean;
}

interface TicketCategory {
  id: string;
  name: string;
  sla_hours: number;
}

interface Ticket {
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
  sla_deadline: string | null;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
  contact?: { id: string; name: string | null; phone: string; contact_type: string | null } | null;
  assigned?: { id: string; full_name: string | null } | null;
  stage_ref?: TicketStage | null;
  category_ref?: TicketCategory | null;
}

const PRIORITY_CONFIG: Record<string, { label: string; color: string; icon?: React.ReactNode }> = {
  urgente: { label: 'Urgente', color: 'bg-red-100 text-red-800 border-red-200' },
  alta: { label: 'Alta', color: 'bg-orange-100 text-orange-800 border-orange-200' },
  media: { label: 'Média', color: 'bg-yellow-100 text-yellow-800 border-yellow-200' },
  baixa: { label: 'Baixa', color: 'bg-green-100 text-green-800 border-green-200' },
};

const SOURCE_LABELS: Record<string, string> = {
  whatsapp_ai: 'WhatsApp IA',
  manual: 'Manual',
  whatsapp: 'WhatsApp',
};

// ============ DRAGGABLE TICKET CARD ============

function DraggableTicketCard({ ticket, onClick }: { ticket: Ticket; onClick: () => void }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: ticket.id,
    data: { ticket },
  });

  const style = transform
    ? { transform: `translate(${transform.x}px, ${transform.y}px)` }
    : undefined;

  const isSlaExpired = ticket.sla_deadline && new Date(ticket.sla_deadline) < new Date() && !ticket.resolved_at;

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      className={cn('cursor-grab active:cursor-grabbing', isDragging && 'opacity-50')}
    >
      <Card
        className="mb-2 hover:shadow-md transition-shadow cursor-pointer border-l-4"
        style={{ borderLeftColor: PRIORITY_CONFIG[ticket.priority]?.color ? undefined : '#6B7280' }}
        onClick={(e) => { e.stopPropagation(); onClick(); }}
      >
        <CardContent className="p-3 space-y-2">
          <div className="flex items-start justify-between gap-2">
            <p className="text-sm font-medium leading-tight line-clamp-2">{ticket.title}</p>
            {isSlaExpired && <AlertTriangle className="h-4 w-4 text-red-500 shrink-0" />}
          </div>
          <div className="flex flex-wrap gap-1">
            <Badge variant="outline" className={cn('text-[10px]', PRIORITY_CONFIG[ticket.priority]?.color)}>
              {PRIORITY_CONFIG[ticket.priority]?.label || ticket.priority}
            </Badge>
            <Badge variant="secondary" className="text-[10px]">
              {ticket.category}
            </Badge>
          </div>
          <div className="flex items-center justify-between text-[11px] text-muted-foreground">
            <span className="flex items-center gap-1">
              {ticket.source === 'whatsapp_ai' ? <Phone className="h-3 w-3" /> : <User className="h-3 w-3" />}
              {SOURCE_LABELS[ticket.source] || ticket.source}
            </span>
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {new Date(ticket.created_at).toLocaleDateString('pt-BR')}
            </span>
          </div>
          {ticket.contact?.name && (
            <p className="text-[11px] text-muted-foreground truncate">{ticket.contact.name}</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ============ DROPPABLE STAGE COLUMN ============

function StageColumn({ stage, tickets, onTicketClick }: { stage: TicketStage; tickets: Ticket[]; onTicketClick: (id: string) => void }) {
  const { setNodeRef, isOver } = useDroppable({ id: stage.id });

  return (
    <div
      ref={setNodeRef}
      className={cn(
        'flex-shrink-0 w-72 rounded-lg border bg-muted/30 transition-colors',
        isOver && 'bg-accent/20 border-accent'
      )}
    >
      <div className="flex items-center justify-between p-3 border-b">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full" style={{ backgroundColor: stage.color }} />
          <span className="text-sm font-semibold">{stage.name}</span>
        </div>
        <Badge variant="secondary" className="text-xs">{tickets.length}</Badge>
      </div>
      <ScrollArea className="h-[calc(100vh-280px)] p-2">
        {tickets.map((ticket) => (
          <DraggableTicketCard
            key={ticket.id}
            ticket={ticket}
            onClick={() => onTicketClick(ticket.id)}
          />
        ))}
        {tickets.length === 0 && (
          <p className="text-xs text-muted-foreground text-center py-8">Nenhum chamado</p>
        )}
      </ScrollArea>
    </div>
  );
}

// ============ MAIN PAGE ============

const TicketsPage: React.FC = () => {
  const { tenantId } = useTenant();
  const { profile } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [stages, setStages] = useState<TicketStage[]>([]);
  const [categories, setCategories] = useState<TicketCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<'kanban' | 'list'>('kanban');
  const [searchQuery, setSearchQuery] = useState('');
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [filterPriority, setFilterPriority] = useState<string>('all');
  const [activeCard, setActiveCard] = useState<Ticket | null>(null);

  // New ticket dialog
  const [showNewTicket, setShowNewTicket] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newCategory, setNewCategory] = useState('');
  const [newPriority, setNewPriority] = useState('media');
  const [newDescription, setNewDescription] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [creating, setCreating] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  const fetchData = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);

    const [ticketRes, stageRes, catRes] = await Promise.all([
      supabase
        .from('tickets')
        .select(`
          *,
          contact:contacts(id, name, phone, contact_type),
          assigned:profiles!tickets_assigned_to_fkey(id, full_name)
        `)
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false }),
      supabase
        .from('ticket_stages')
        .select('*')
        .eq('tenant_id', tenantId)
        .order('order_index'),
      supabase
        .from('ticket_categories')
        .select('*')
        .eq('tenant_id', tenantId)
        .eq('is_active', true)
        .order('name'),
    ]);

    if (ticketRes.data) setTickets(ticketRes.data as unknown as Ticket[]);
    if (stageRes.data) setStages(stageRes.data as unknown as TicketStage[]);
    if (catRes.data) setCategories(catRes.data as unknown as TicketCategory[]);
    setLoading(false);
  }, [tenantId]);

  useEffect(() => {
    fetchData();

    if (!tenantId) return;

    const channel = supabase
      .channel('public:tickets')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'tickets',
        filter: `tenant_id=eq.${tenantId}`,
      }, () => {
        fetchData();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchData, tenantId]);

  const filteredTickets = tickets.filter((t) => {
    if (searchQuery && !t.title.toLowerCase().includes(searchQuery.toLowerCase()) && !t.phone?.includes(searchQuery)) return false;
    if (filterCategory !== 'all' && t.category !== filterCategory) return false;
    if (filterPriority !== 'all' && t.priority !== filterPriority) return false;
    return true;
  });

  const handleDragStart = (event: DragStartEvent) => {
    const ticket = (event.active.data.current as any)?.ticket;
    if (ticket) setActiveCard(ticket);
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    setActiveCard(null);
    const { active, over } = event;
    if (!over || !tenantId) return;

    const ticketId = active.id as string;
    const newStageId = over.id as string;
    const ticket = tickets.find((t) => t.id === ticketId);
    if (!ticket || ticket.stage_id === newStageId) return;

    const newStage = stages.find((s) => s.id === newStageId);
    if (!newStage) return;

    // Optimistic update
    setTickets((prev) =>
      prev.map((t) =>
        t.id === ticketId ? { ...t, stage_id: newStageId, stage: newStage.name } : t
      )
    );

    const { error } = await supabase.functions.invoke('manage-tickets', {
      body: { action: 'update_ticket', ticket_id: ticketId, stage_id: newStageId, stage: newStage.name },
    });

    if (error) {
      toast({ variant: 'destructive', title: 'Erro ao mover chamado', description: error.message });
      fetchData();
    }
  };

  const handleCreateTicket = async () => {
    if (!newTitle || !newCategory || !tenantId) return;
    setCreating(true);

    const cat = categories.find((c) => c.name === newCategory);
    const { data, error } = await supabase.functions.invoke('manage-tickets', {
      body: {
        action: 'create_ticket',
        title: newTitle,
        category: newCategory,
        category_id: cat?.id || null,
        description: newDescription || null,
        priority: newPriority,
        phone: newPhone || '',
      },
    });

    setCreating(false);
    if (error) {
      toast({ variant: 'destructive', title: 'Erro ao criar chamado', description: error.message });
      return;
    }

    toast({ title: 'Chamado criado com sucesso' });
    setShowNewTicket(false);
    setNewTitle('');
    setNewCategory('');
    setNewPriority('media');
    setNewDescription('');
    setNewPhone('');
    fetchData();
  };

  // ============ STATS ============

  const openCount = tickets.filter((t) => !stages.find((s) => s.id === t.stage_id)?.is_terminal).length;
  const urgentCount = tickets.filter((t) => t.priority === 'urgente' && !stages.find((s) => s.id === t.stage_id)?.is_terminal).length;
  const slaBreachedCount = tickets.filter((t) => t.sla_deadline && new Date(t.sla_deadline) < new Date() && !t.resolved_at).length;
  const resolvedTodayCount = tickets.filter((t) => {
    if (!t.resolved_at) return false;
    const today = new Date().toDateString();
    return new Date(t.resolved_at).toDateString() === today;
  }).length;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b">
        <div>
          <h1 className="text-xl font-bold">Chamados</h1>
          <p className="text-sm text-muted-foreground">Gerencie demandas administrativas</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg border overflow-hidden">
            <Button
              variant={viewMode === 'kanban' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setViewMode('kanban')}
              className="rounded-none"
            >
              <Kanban className="h-4 w-4 mr-1" /> Kanban
            </Button>
            <Button
              variant={viewMode === 'list' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setViewMode('list')}
              className="rounded-none"
            >
              <LayoutList className="h-4 w-4 mr-1" /> Lista
            </Button>
          </div>

          <Dialog open={showNewTicket} onOpenChange={setShowNewTicket}>
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus className="h-4 w-4 mr-1" /> Novo Chamado
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Novo Chamado</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 pt-2">
                <div>
                  <Label>Titulo</Label>
                  <Input value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="Descreva brevemente..." />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Categoria</Label>
                    <Select value={newCategory} onValueChange={setNewCategory}>
                      <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                      <SelectContent>
                        {categories.map((c) => (
                          <SelectItem key={c.id} value={c.name}>{c.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Prioridade</Label>
                    <Select value={newPriority} onValueChange={setNewPriority}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="baixa">Baixa</SelectItem>
                        <SelectItem value="media">Media</SelectItem>
                        <SelectItem value="alta">Alta</SelectItem>
                        <SelectItem value="urgente">Urgente</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div>
                  <Label>Telefone do cliente</Label>
                  <Input value={newPhone} onChange={(e) => setNewPhone(e.target.value)} placeholder="5548999..." />
                </div>
                <div>
                  <Label>Descricao</Label>
                  <Textarea value={newDescription} onChange={(e) => setNewDescription(e.target.value)} placeholder="Detalhes do chamado..." rows={3} />
                </div>
                <Button onClick={handleCreateTicket} disabled={!newTitle || !newCategory || creating} className="w-full">
                  {creating ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Plus className="h-4 w-4 mr-2" />}
                  Criar Chamado
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Stats bar */}
      <div className="grid grid-cols-4 gap-4 px-6 py-3 border-b bg-muted/20">
        <div className="text-center">
          <p className="text-2xl font-bold">{openCount}</p>
          <p className="text-xs text-muted-foreground">Abertos</p>
        </div>
        <div className="text-center">
          <p className="text-2xl font-bold text-red-600">{urgentCount}</p>
          <p className="text-xs text-muted-foreground">Urgentes</p>
        </div>
        <div className="text-center">
          <p className="text-2xl font-bold text-orange-600">{slaBreachedCount}</p>
          <p className="text-xs text-muted-foreground">SLA Estourado</p>
        </div>
        <div className="text-center">
          <p className="text-2xl font-bold text-green-600">{resolvedTodayCount}</p>
          <p className="text-xs text-muted-foreground">Resolvidos Hoje</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 px-6 py-3 border-b">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por titulo ou telefone..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={filterCategory} onValueChange={setFilterCategory}>
          <SelectTrigger className="w-40"><SelectValue placeholder="Categoria" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas categorias</SelectItem>
            {categories.map((c) => (
              <SelectItem key={c.id} value={c.name}>{c.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filterPriority} onValueChange={setFilterPriority}>
          <SelectTrigger className="w-36"><SelectValue placeholder="Prioridade" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas</SelectItem>
            <SelectItem value="urgente">Urgente</SelectItem>
            <SelectItem value="alta">Alta</SelectItem>
            <SelectItem value="media">Media</SelectItem>
            <SelectItem value="baixa">Baixa</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {viewMode === 'kanban' ? (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCorners}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
          >
            <ScrollArea className="h-full">
              <div className="flex gap-4 p-4 min-w-max">
                {stages.map((stage) => (
                  <StageColumn
                    key={stage.id}
                    stage={stage}
                    tickets={filteredTickets.filter((t) => t.stage_id === stage.id)}
                    onTicketClick={(id) => navigate(`/chamados/${id}`)}
                  />
                ))}
              </div>
              <ScrollBar orientation="horizontal" />
            </ScrollArea>
            <DragOverlay>
              {activeCard && (
                <Card className="w-72 shadow-lg border-l-4 rotate-2">
                  <CardContent className="p-3">
                    <p className="text-sm font-medium">{activeCard.title}</p>
                  </CardContent>
                </Card>
              )}
            </DragOverlay>
          </DndContext>
        ) : (
          <ScrollArea className="h-full">
            <div className="p-6 space-y-2">
              {filteredTickets.length === 0 ? (
                <p className="text-center text-muted-foreground py-12">Nenhum chamado encontrado</p>
              ) : (
                filteredTickets.map((ticket) => {
                  const isSlaExpired = ticket.sla_deadline && new Date(ticket.sla_deadline) < new Date() && !ticket.resolved_at;
                  const stageObj = stages.find((s) => s.id === ticket.stage_id);

                  return (
                    <Card
                      key={ticket.id}
                      className="cursor-pointer hover:shadow-md transition-shadow"
                      onClick={() => navigate(`/chamados/${ticket.id}`)}
                    >
                      <CardContent className="flex items-center gap-4 p-4">
                        <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: stageObj?.color || '#6B7280' }} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-medium truncate">{ticket.title}</p>
                            {isSlaExpired && <AlertTriangle className="h-4 w-4 text-red-500 shrink-0" />}
                          </div>
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-xs text-muted-foreground">
                              {ticket.contact?.name || ticket.phone}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {SOURCE_LABELS[ticket.source] || ticket.source}
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <Badge variant="outline" className={cn('text-[10px]', PRIORITY_CONFIG[ticket.priority]?.color)}>
                            {PRIORITY_CONFIG[ticket.priority]?.label || ticket.priority}
                          </Badge>
                          <Badge variant="secondary" className="text-[10px]">
                            {ticket.category}
                          </Badge>
                          {stageObj && (
                            <Badge variant="outline" className="text-[10px]" style={{ borderColor: stageObj.color, color: stageObj.color }}>
                              {stageObj.name}
                            </Badge>
                          )}
                        </div>
                        <span className="text-xs text-muted-foreground shrink-0">
                          {new Date(ticket.created_at).toLocaleDateString('pt-BR')}
                        </span>
                      </CardContent>
                    </Card>
                  );
                })
              )}
            </div>
          </ScrollArea>
        )}
      </div>
    </div>
  );
};

export default TicketsPage;
