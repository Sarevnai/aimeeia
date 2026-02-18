import React, { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useTenant } from '@/contexts/TenantContext';
import { useDepartmentFilter } from '@/contexts/DepartmentFilterContext';
import { useNavigate } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { Loader2, Settings, GripVertical, MessageSquare } from 'lucide-react';
import { cn } from '@/lib/utils';
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
import type { Tables } from '@/integrations/supabase/types';

type Stage = Tables<'conversation_stages'>;
type Conversation = Tables<'conversations'>;
type Contact = Tables<'contacts'>;

interface ConvWithContact extends Conversation {
  contacts: Contact | null;
}

const PipelinePage: React.FC = () => {
  const { tenantId } = useTenant();
  const { department } = useDepartmentFilter();
  const navigate = useNavigate();

  const [stages, setStages] = useState<Stage[]>([]);
  const [conversations, setConversations] = useState<ConvWithContact[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeCard, setActiveCard] = useState<ConvWithContact | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  const fetchData = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);

    let stageQuery = supabase
      .from('conversation_stages')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('order_index', { ascending: true });

    let convQuery = supabase
      .from('conversations')
      .select('*, contacts(*)')
      .eq('tenant_id', tenantId)
      .eq('status', 'active')
      .order('last_message_at', { ascending: false });

    if (department !== 'all') {
      stageQuery = stageQuery.eq('department_code', department);
      convQuery = convQuery.eq('department_code', department);
    }

    const [stageRes, convRes] = await Promise.all([stageQuery, convQuery]);
    setStages(stageRes.data ?? []);
    setConversations((convRes.data as ConvWithContact[]) ?? []);
    setLoading(false);
  }, [tenantId, department]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

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

    // Optimistic update
    setConversations((prev) =>
      prev.map((c) => (c.id === convId ? { ...c, stage_id: newStageId } : c))
    );

    await supabase
      .from('conversations')
      .update({ stage_id: newStageId })
      .eq('id', convId)
      .eq('tenant_id', tenantId);
  };

  const formatTimeAgo = (dateStr: string | null) => {
    if (!dateStr) return '';
    const diffMs = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diffMs / 60000);
    if (mins < 60) return `${mins}min`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h`;
    const days = Math.floor(hours / 24);
    return `${days}d`;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-4rem)]">
        <Loader2 className="h-6 w-6 animate-spin text-accent" />
      </div>
    );
  }

  if (stages.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-[calc(100vh-4rem)] gap-3">
        <Settings className="h-10 w-10 text-muted-foreground" />
        <p className="text-muted-foreground text-sm">Configure os estágios em Configurações</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)]">
      <div className="p-4 border-b border-border bg-card">
        <h2 className="font-display text-xl font-bold text-foreground">Pipeline</h2>
      </div>

      <ScrollArea className="flex-1">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <div className="flex gap-4 p-4 min-w-max h-full">
            {stages.map((stage) => {
              const stageConvs = conversations.filter((c) => c.stage_id === stage.id);
              return (
                <StageColumn
                  key={stage.id}
                  stage={stage}
                  conversations={stageConvs}
                  formatTimeAgo={formatTimeAgo}
                  onCardClick={(id) => navigate(`/chat/${id}`)}
                />
              );
            })}

            {/* Unassigned column */}
            <UnassignedColumn
              conversations={conversations.filter((c) => !c.stage_id)}
              formatTimeAgo={formatTimeAgo}
              onCardClick={(id) => navigate(`/chat/${id}`)}
            />
          </div>

          <DragOverlay>
            {activeCard && (
              <ConversationCard
                conv={activeCard}
                formatTimeAgo={formatTimeAgo}
                isDragging
              />
            )}
          </DragOverlay>
        </DndContext>
        <ScrollBar orientation="horizontal" />
      </ScrollArea>
    </div>
  );
};

// Stage column (droppable)
const StageColumn: React.FC<{
  stage: Stage;
  conversations: ConvWithContact[];
  formatTimeAgo: (d: string | null) => string;
  onCardClick: (id: string) => void;
}> = ({ stage, conversations, formatTimeAgo, onCardClick }) => {
  const { setNodeRef, isOver } = useDroppable({ id: stage.id });

  return (
    <div
      ref={setNodeRef}
      className={cn(
        'flex flex-col w-72 shrink-0 rounded-lg border border-border bg-muted/30 transition-colors',
        isOver && 'border-accent bg-accent/5'
      )}
    >
      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-border">
        <div className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: stage.color || 'hsl(var(--accent))' }} />
        <span className="text-sm font-semibold text-foreground truncate">{stage.name}</span>
        <Badge variant="secondary" className="ml-auto text-[10px]">{conversations.length}</Badge>
      </div>
      <div className="flex-1 p-2 space-y-2 overflow-auto max-h-[calc(100vh-14rem)]">
        {conversations.map((conv) => (
          <DraggableCard key={conv.id} conv={conv} formatTimeAgo={formatTimeAgo} onClick={() => onCardClick(conv.id)} />
        ))}
      </div>
    </div>
  );
};

// Unassigned column (not droppable)
const UnassignedColumn: React.FC<{
  conversations: ConvWithContact[];
  formatTimeAgo: (d: string | null) => string;
  onCardClick: (id: string) => void;
}> = ({ conversations, formatTimeAgo, onCardClick }) => {
  if (conversations.length === 0) return null;

  return (
    <div className="flex flex-col w-72 shrink-0 rounded-lg border border-dashed border-border bg-muted/20">
      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-border">
        <span className="text-sm font-semibold text-muted-foreground">Sem estágio</span>
        <Badge variant="secondary" className="ml-auto text-[10px]">{conversations.length}</Badge>
      </div>
      <div className="flex-1 p-2 space-y-2 overflow-auto max-h-[calc(100vh-14rem)]">
        {conversations.map((conv) => (
          <Card
            key={conv.id}
            className="p-3 cursor-pointer hover:shadow-elevated transition-shadow"
            onClick={() => onCardClick(conv.id)}
          >
            <CardContent conv={conv} formatTimeAgo={formatTimeAgo} />
          </Card>
        ))}
      </div>
    </div>
  );
};

// Draggable card wrapper
const DraggableCard: React.FC<{
  conv: ConvWithContact;
  formatTimeAgo: (d: string | null) => string;
  onClick: () => void;
}> = ({ conv, formatTimeAgo, onClick }) => {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: conv.id });

  const style = transform
    ? { transform: `translate(${transform.x}px, ${transform.y}px)` }
    : undefined;

  return (
    <Card
      ref={setNodeRef}
      style={style}
      className={cn(
        'p-3 cursor-pointer hover:shadow-elevated transition-shadow',
        isDragging && 'opacity-30'
      )}
      onClick={onClick}
      {...attributes}
      {...listeners}
    >
      <CardContent conv={conv} formatTimeAgo={formatTimeAgo} />
    </Card>
  );
};

// Shared card content
const CardContent: React.FC<{
  conv: ConvWithContact;
  formatTimeAgo: (d: string | null) => string;
}> = ({ conv, formatTimeAgo }) => (
  <>
    <div className="flex items-center justify-between mb-1">
      <span className="text-sm font-medium text-foreground truncate">
        {conv.contacts?.name || conv.phone_number}
      </span>
      <span className="text-[10px] text-muted-foreground shrink-0 ml-2">
        {formatTimeAgo(conv.last_message_at)}
      </span>
    </div>
    <p className="text-xs text-muted-foreground truncate">{conv.phone_number}</p>
  </>
);

// Overlay card for dragging
const ConversationCard: React.FC<{
  conv: ConvWithContact;
  formatTimeAgo: (d: string | null) => string;
  isDragging?: boolean;
}> = ({ conv, formatTimeAgo }) => (
  <Card className="p-3 w-72 shadow-prominent rotate-2">
    <CardContent conv={conv} formatTimeAgo={formatTimeAgo} />
  </Card>
);

export default PipelinePage;
