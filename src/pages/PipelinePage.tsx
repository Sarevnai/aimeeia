import React, { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useTenant } from '@/contexts/TenantContext';
import { useAuth } from '@/contexts/AuthContext';
import { useDepartmentFilter } from '@/contexts/DepartmentFilterContext';
import { useSessionState } from '@/hooks/useSessionState';
import { useNavigate } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { Loader2, Settings, Archive, UserCheck, Building2, Sparkles, Send } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  DndContext, DragOverlay, closestCorners, PointerSensor, useSensor, useSensors,
  type DragStartEvent, type DragEndEvent,
} from '@dnd-kit/core';
import { useDroppable, useDraggable } from '@dnd-kit/core';
import type { Tables } from '@/integrations/supabase/types';

type Stage = Tables<'conversation_stages'>;
type Conversation = Tables<'conversations'>;
type Contact = Tables<'contacts'>;

interface ConvWithContact extends Conversation {
  contacts: Contact | null;
}

interface CrmCard {
  id: string;
  name: string | null;
  phone: string;
  crmStatus: string | null;
  crmFunnelStatus: string | null;
  crmPropertyRef: string | null;
  crmNeighborhood: string | null;
  crmSource: string | null;
  crmBrokerNotes: string | null;
  brokerName: string | null;
  updatedAt: string | null;
}

/* ─── C2S status columns (ordem + cor) ─── */
const C2S_STATUS_COLUMNS: { key: string; label: string; color: string; hint?: string }[] = [
  { key: 'Novo', label: 'Novo', color: '#3b82f6' },
  { key: 'Em negociação', label: 'Em negociação', color: '#eab308' },
  { key: 'Negócio fechado', label: 'Negócio fechado', color: '#22c55e' },
  { key: 'Arquivado', label: 'Arquivado', color: '#94a3b8', hint: 'Disponível pra follow-up' },
];

/* ─── Main ─── */
const PipelinePage: React.FC = () => {
  const { tenantId } = useTenant();
  const { profile } = useAuth();
  const { department } = useDepartmentFilter();
  const navigate = useNavigate();

  const [mode, setMode] = useSessionState<'c2s' | 'local'>('pipeline_mode', 'c2s');
  const [scope, setScope] = useSessionState<'todos' | 'meus'>('pipeline_scope', 'todos');

  const [myBrokerId, setMyBrokerId] = useState<string | null>(null);

  // C2S mode
  const [crmCards, setCrmCards] = useState<Record<string, CrmCard[]>>({});
  const [crmLoading, setCrmLoading] = useState(true);

  // Local mode (drag-and-drop)
  const [stages, setStages] = useState<Stage[]>([]);
  const [conversations, setConversations] = useState<ConvWithContact[]>([]);
  const [localLoading, setLocalLoading] = useState(true);
  const [activeCard, setActiveCard] = useState<ConvWithContact | null>(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  const isSuperAdmin = profile?.role === 'super_admin';

  // Resolve broker_id for current user
  useEffect(() => {
    if (!profile?.id) return;
    supabase.from('brokers').select('id').eq('profile_id', profile.id).maybeSingle()
      .then(({ data }) => setMyBrokerId(data?.id || null));
  }, [profile?.id]);

  // Fetch C2S pipeline data
  const fetchCrm = useCallback(async () => {
    if (!tenantId) return;
    setCrmLoading(true);

    let q = supabase
      .from('contacts')
      .select('id, name, phone, crm_status, crm_funnel_status, crm_property_ref, crm_neighborhood, crm_source, crm_broker_notes, updated_at, broker:brokers!assigned_broker_id(full_name)')
      .eq('tenant_id', tenantId)
      .not('crm_status', 'is', null)
      .order('updated_at', { ascending: false })
      .limit(2000);

    if (scope === 'meus' && myBrokerId) q = q.eq('assigned_broker_id', myBrokerId);
    if (department !== 'all') q = q.eq('department_code', department);

    const { data } = await q;
    const byStatus: Record<string, CrmCard[]> = {};
    C2S_STATUS_COLUMNS.forEach((c) => { byStatus[c.key] = []; });
    (data || []).forEach((c: any) => {
      const s = c.crm_status as string;
      if (!byStatus[s]) byStatus[s] = [];
      byStatus[s].push({
        id: c.id,
        name: c.name,
        phone: c.phone,
        crmStatus: c.crm_status,
        crmFunnelStatus: c.crm_funnel_status,
        crmPropertyRef: c.crm_property_ref,
        crmNeighborhood: c.crm_neighborhood,
        crmSource: c.crm_source,
        crmBrokerNotes: c.crm_broker_notes,
        brokerName: c.broker?.full_name ?? null,
        updatedAt: c.updated_at,
      });
    });
    setCrmCards(byStatus);
    setCrmLoading(false);
  }, [tenantId, scope, myBrokerId, department]);

  // Fetch local-mode data (conversation_stages)
  const fetchLocal = useCallback(async () => {
    if (!tenantId) return;
    setLocalLoading(true);

    let stageQuery = supabase.from('conversation_stages').select('*').eq('tenant_id', tenantId).order('order_index', { ascending: true });
    let convQuery = supabase.from('conversations').select('*, contacts(*)').eq('tenant_id', tenantId).eq('status', 'active').order('last_message_at', { ascending: false });

    if (department !== 'all') {
      stageQuery = stageQuery.eq('department_code', department);
      convQuery = convQuery.eq('department_code', department);
    }

    const [stageRes, convRes] = await Promise.all([stageQuery, convQuery]);
    setStages(stageRes.data ?? []);
    setConversations((convRes.data as ConvWithContact[]) ?? []);
    setLocalLoading(false);
  }, [tenantId, department]);

  useEffect(() => {
    if (mode === 'c2s') fetchCrm(); else fetchLocal();
  }, [mode, fetchCrm, fetchLocal]);

  const handleDragStart = (event: DragStartEvent) => {
    const conv = conversations.find((c) => c.id === event.active.id);
    setActiveCard(conv ?? null);
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    setActiveCard(null);
    const { active, over } = event;
    if (!over || !tenantId) return;
    const convId = active.id as string;
    const newStageId = over.id as string;
    setConversations((prev) => prev.map((c) => (c.id === convId ? { ...c, stage_id: newStageId } : c)));
    await supabase.from('conversations').update({ stage_id: newStageId }).eq('id', convId).eq('tenant_id', tenantId);
  };

  /* ─── Render ─── */
  return (
    <div className="flex flex-col h-[calc(100vh-4rem)]">
      {/* Header */}
      <div className="p-4 border-b border-border bg-card flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="font-display text-2xl font-bold text-foreground">Pipeline</h2>
          <p className="text-sm text-muted-foreground">
            {mode === 'c2s' ? 'Espelho dos status do C2S' : 'Organize seus leads em estágios personalizados'}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Tabs value={scope} onValueChange={(v) => setScope(v as 'todos' | 'meus')}>
            <TabsList>
              <TabsTrigger value="todos">Todos{isSuperAdmin ? '' : ' do time'}</TabsTrigger>
              <TabsTrigger value="meus" disabled={!myBrokerId}>Meus leads</TabsTrigger>
            </TabsList>
          </Tabs>
          <Tabs value={mode} onValueChange={(v) => setMode(v as 'c2s' | 'local')}>
            <TabsList>
              <TabsTrigger value="c2s">Status C2S</TabsTrigger>
              <TabsTrigger value="local">Stages locais</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </div>

      {mode === 'c2s' ? (
        <CrmPipeline
          cards={crmCards}
          loading={crmLoading}
          onCardClick={(id) => navigate(`/leads?focus=${id}`)}
          onFollowUp={() => navigate('/followup-arquivados')}
        />
      ) : (
        <LocalPipeline
          stages={stages}
          conversations={conversations}
          loading={localLoading}
          activeCard={activeCard}
          sensors={sensors}
          handleDragStart={handleDragStart}
          handleDragEnd={handleDragEnd}
          onCardClick={(id) => navigate(`/chat/${id}`)}
        />
      )}
    </div>
  );
};

/* ─── C2S Pipeline (read-only, 4 colunas fixas) ─── */
const CrmPipeline: React.FC<{
  cards: Record<string, CrmCard[]>;
  loading: boolean;
  onCardClick: (contactId: string) => void;
  onFollowUp: () => void;
}> = ({ cards, loading, onCardClick, onFollowUp }) => {
  if (loading) {
    return (
      <div className="flex gap-4 p-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="w-80 shrink-0 space-y-3">
            <div className="skeleton h-10 w-full" />
            <div className="skeleton h-20 w-full" />
            <div className="skeleton h-20 w-full" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <ScrollArea className="flex-1">
      <div className="flex gap-4 p-4 min-w-max h-full">
        {C2S_STATUS_COLUMNS.map((col) => {
          const list = cards[col.key] || [];
          const isArchived = col.key === 'Arquivado';
          return (
            <div key={col.key} className="flex flex-col w-80 shrink-0 rounded-lg border border-border bg-muted/30">
              <div className="flex items-center gap-2 px-3 py-2.5 border-b border-border">
                <div className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: col.color }} />
                <span className="text-sm font-semibold text-foreground">{col.label}</span>
                <Badge variant="secondary" className="text-[10px]">{list.length}</Badge>
                {isArchived && (
                  <Button size="sm" variant="outline" className="ml-auto h-7 text-[11px] gap-1.5" onClick={onFollowUp}>
                    <Send className="h-3 w-3" /> Follow-up
                  </Button>
                )}
              </div>
              {col.hint && (
                <div className="px-3 py-1.5 bg-muted/50 border-b border-border/60">
                  <p className="text-[11px] text-muted-foreground flex items-center gap-1.5"><Sparkles className="h-3 w-3" />{col.hint}</p>
                </div>
              )}
              <div className="flex-1 p-2 space-y-2 overflow-auto max-h-[calc(100vh-16rem)]">
                {list.slice(0, 100).map((card) => (
                  <CrmCardRow key={card.id} card={card} onClick={() => onCardClick(card.id)} />
                ))}
                {list.length > 100 && (
                  <div className="p-3 text-center">
                    <p className="text-[11px] text-muted-foreground">+{list.length - 100} leads ocultos</p>
                  </div>
                )}
                {list.length === 0 && (
                  <div className="p-6 text-center">
                    <p className="text-[11px] text-muted-foreground">Nenhum lead nesta coluna</p>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
      <ScrollBar orientation="horizontal" />
    </ScrollArea>
  );
};

const CrmCardRow: React.FC<{ card: CrmCard; onClick: () => void }> = ({ card, onClick }) => {
  const timeAgo = (d: string | null) => {
    if (!d) return '';
    const mins = Math.floor((Date.now() - new Date(d).getTime()) / 60000);
    if (mins < 60) return `${mins}min`;
    const h = Math.floor(mins / 60);
    if (h < 24) return `${h}h`;
    const days = Math.floor(h / 24);
    return `${days}d`;
  };
  return (
    <Card className="p-3 cursor-pointer hover:shadow-elevated transition-shadow space-y-1.5" onClick={onClick}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium text-foreground truncate">{card.name || card.phone}</span>
        <span className="text-[10px] text-muted-foreground shrink-0">{timeAgo(card.updatedAt)}</span>
      </div>
      {card.crmPropertyRef && (
        <div className="flex items-center gap-1.5 min-w-0">
          <Building2 className="h-3 w-3 text-muted-foreground shrink-0" />
          <p className="text-[11px] text-muted-foreground truncate">{card.crmPropertyRef}</p>
        </div>
      )}
      <div className="flex items-center gap-1.5 flex-wrap">
        {card.crmFunnelStatus && (
          <Badge variant="outline" className="text-[10px] font-normal">{card.crmFunnelStatus}</Badge>
        )}
        {card.crmSource && (
          <Badge variant="secondary" className="text-[10px] font-normal">{card.crmSource}</Badge>
        )}
      </div>
      {card.brokerName && (
        <div className="flex items-center gap-1.5 pt-1 border-t border-border/40">
          <UserCheck className="h-3 w-3 text-accent shrink-0" />
          <span className="text-[11px] font-medium text-foreground truncate">{card.brokerName}</span>
        </div>
      )}
    </Card>
  );
};

/* ─── Local Pipeline (drag-and-drop) ─── */
const LocalPipeline: React.FC<{
  stages: Stage[];
  conversations: ConvWithContact[];
  loading: boolean;
  activeCard: ConvWithContact | null;
  sensors: ReturnType<typeof useSensors>;
  handleDragStart: (e: DragStartEvent) => void;
  handleDragEnd: (e: DragEndEvent) => void;
  onCardClick: (id: string) => void;
}> = ({ stages, conversations, loading, activeCard, sensors, handleDragStart, handleDragEnd, onCardClick }) => {
  const formatTimeAgo = (dateStr: string | null) => {
    if (!dateStr) return '';
    const mins = Math.floor((Date.now() - new Date(dateStr).getTime()) / 60000);
    if (mins < 60) return `${mins}min`;
    const h = Math.floor(mins / 60);
    if (h < 24) return `${h}h`;
    return `${Math.floor(h / 24)}d`;
  };

  if (loading) {
    return (
      <div className="flex gap-4 p-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="w-72 shrink-0 space-y-3">
            <div className="skeleton h-8 w-full" />
            <div className="skeleton h-16 w-full" />
          </div>
        ))}
      </div>
    );
  }

  if (stages.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center flex-1 animate-fade-in">
        <div className="mx-auto w-16 h-16 rounded-2xl bg-accent/10 flex items-center justify-center mb-4">
          <Settings className="h-8 w-8 text-accent" />
        </div>
        <p className="text-foreground font-medium mb-1">Nenhum estágio local configurado</p>
        <p className="text-muted-foreground text-sm">Configure em Minha Aimee → Configurações ou use o modo "Status C2S"</p>
      </div>
    );
  }

  return (
    <ScrollArea className="flex-1">
      <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        <div className="flex gap-4 p-4 min-w-max h-full">
          {stages.map((stage) => {
            const stageConvs = conversations.filter((c) => c.stage_id === stage.id);
            return <StageColumn key={stage.id} stage={stage} conversations={stageConvs} formatTimeAgo={formatTimeAgo} onCardClick={onCardClick} />;
          })}
          <UnassignedColumn conversations={conversations.filter((c) => !c.stage_id)} formatTimeAgo={formatTimeAgo} onCardClick={onCardClick} />
        </div>
        <DragOverlay>{activeCard && <ConversationCard conv={activeCard} formatTimeAgo={formatTimeAgo} isDragging />}</DragOverlay>
      </DndContext>
      <ScrollBar orientation="horizontal" />
    </ScrollArea>
  );
};

const StageColumn: React.FC<{ stage: Stage; conversations: ConvWithContact[]; formatTimeAgo: (d: string | null) => string; onCardClick: (id: string) => void; }>
  = ({ stage, conversations, formatTimeAgo, onCardClick }) => {
  const { setNodeRef, isOver } = useDroppable({ id: stage.id });
  return (
    <div ref={setNodeRef} className={cn('flex flex-col w-72 shrink-0 rounded-lg border border-border bg-muted/30 transition-colors', isOver && 'border-accent bg-accent/5')}>
      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-border">
        <div className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: stage.color || 'hsl(var(--accent))' }} />
        <span className="text-sm font-semibold text-foreground truncate">{stage.name}</span>
        <Badge variant="secondary" className="ml-auto text-[10px]">{conversations.length}</Badge>
      </div>
      <div className="flex-1 p-2 space-y-2 overflow-auto max-h-[calc(100vh-14rem)]">
        {conversations.map((conv) => <DraggableCard key={conv.id} conv={conv} formatTimeAgo={formatTimeAgo} onClick={() => onCardClick(conv.id)} />)}
      </div>
    </div>
  );
};

const UnassignedColumn: React.FC<{ conversations: ConvWithContact[]; formatTimeAgo: (d: string | null) => string; onCardClick: (id: string) => void; }>
  = ({ conversations, formatTimeAgo, onCardClick }) => {
  if (conversations.length === 0) return null;
  return (
    <div className="flex flex-col w-72 shrink-0 rounded-lg border border-dashed border-border bg-muted/20">
      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-border">
        <span className="text-sm font-semibold text-muted-foreground">Sem estágio</span>
        <Badge variant="secondary" className="ml-auto text-[10px]">{conversations.length}</Badge>
      </div>
      <div className="flex-1 p-2 space-y-2 overflow-auto max-h-[calc(100vh-14rem)]">
        {conversations.map((conv) => (
          <Card key={conv.id} className="p-3 cursor-pointer hover:shadow-elevated transition-shadow" onClick={() => onCardClick(conv.id)}>
            <CardContent conv={conv} formatTimeAgo={formatTimeAgo} />
          </Card>
        ))}
      </div>
    </div>
  );
};

const DraggableCard: React.FC<{ conv: ConvWithContact; formatTimeAgo: (d: string | null) => string; onClick: () => void; }>
  = ({ conv, formatTimeAgo, onClick }) => {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: conv.id });
  const style = transform ? { transform: `translate(${transform.x}px, ${transform.y}px)` } : undefined;
  return (
    <Card ref={setNodeRef} style={style} className={cn('p-3 cursor-pointer hover:shadow-elevated transition-shadow', isDragging && 'opacity-30')} onClick={onClick} {...attributes} {...listeners}>
      <CardContent conv={conv} formatTimeAgo={formatTimeAgo} />
    </Card>
  );
};

const CardContent: React.FC<{ conv: ConvWithContact; formatTimeAgo: (d: string | null) => string; }>
  = ({ conv, formatTimeAgo }) => (
  <>
    <div className="flex items-center justify-between mb-1">
      <span className="text-sm font-medium text-foreground truncate">{conv.contacts?.name || conv.phone_number}</span>
      <span className="text-[10px] text-muted-foreground shrink-0 ml-2">{formatTimeAgo(conv.last_message_at)}</span>
    </div>
    <p className="text-xs text-muted-foreground truncate">{conv.phone_number}</p>
  </>
);

const ConversationCard: React.FC<{ conv: ConvWithContact; formatTimeAgo: (d: string | null) => string; isDragging?: boolean; }>
  = ({ conv, formatTimeAgo }) => (
  <Card className="p-3 w-72 shadow-prominent rotate-2">
    <CardContent conv={conv} formatTimeAgo={formatTimeAgo} />
  </Card>
);

export default PipelinePage;
