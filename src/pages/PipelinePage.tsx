import React, { useEffect, useState, useCallback, useRef } from 'react';
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
import { Loader2, Settings, Archive, UserCheck, Building2, Sparkles, Send, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
  price: number | null;
  updatedAt: string | null;
}

/* ─── C2S pipeline columns (espelha o funil do C2S: 5 principais + 2 terminais) ─── */
interface PipelineColumn {
  key: string;
  label: string;
  color: string;           // accent/bolinha
  bgClass: string;         // pastel de fundo da coluna
  borderClass: string;
  headerBgClass: string;   // cabeçalho pastel mais forte (como no C2S)
  terminal?: boolean;      // colunas finais (fechado/arquivado) com peso visual menor
  dragTarget: 'direct' | 'dialog' | 'blocked';
  updatePayloadStatus?: 'Novo' | 'Em negociação' | 'Arquivado' | 'Negócio fechado';
  hint?: string;
}

const PIPELINE_COLUMNS: PipelineColumn[] = [
  { key: 'Novos',            label: 'Novos',            color: '#f43f5e', bgClass: 'bg-rose-50/40',    borderClass: 'border-rose-200',    headerBgClass: 'bg-rose-100/80 dark:bg-rose-500/15',      dragTarget: 'direct', updatePayloadStatus: 'Novo' },
  { key: 'Em atendimento',   label: 'Em atendimento',   color: '#f97316', bgClass: 'bg-orange-50/40',  borderClass: 'border-orange-200',  headerBgClass: 'bg-orange-100/80 dark:bg-orange-500/15',  dragTarget: 'direct', updatePayloadStatus: 'Em negociação' },
  { key: 'Visita agendada',  label: 'Visita agendada',  color: '#eab308', bgClass: 'bg-amber-50/40',   borderClass: 'border-amber-200',   headerBgClass: 'bg-amber-100/80 dark:bg-amber-500/15',    dragTarget: 'blocked', hint: 'Agende a visita no C2S' },
  { key: 'Visita realizada', label: 'Visita realizada', color: '#84cc16', bgClass: 'bg-lime-50/40',    borderClass: 'border-lime-200',    headerBgClass: 'bg-lime-100/80 dark:bg-lime-500/15',      dragTarget: 'blocked', hint: 'Marque a visita como feita no C2S' },
  { key: 'Proposta criada',  label: 'Proposta criada',  color: '#22c55e', bgClass: 'bg-emerald-50/40', borderClass: 'border-emerald-200', headerBgClass: 'bg-emerald-100/80 dark:bg-emerald-500/15',dragTarget: 'blocked', hint: 'Crie a proposta no C2S' },
  { key: 'Negócio fechado',  label: 'Negócio fechado',  color: '#14b8a6', bgClass: 'bg-teal-50/50',    borderClass: 'border-teal-300',    headerBgClass: 'bg-teal-100/90 dark:bg-teal-500/15',      terminal: true, dragTarget: 'dialog', updatePayloadStatus: 'Negócio fechado' },
  { key: 'Arquivado',        label: 'Arquivado',        color: '#94a3b8', bgClass: 'bg-muted/30',      borderClass: 'border-border',      headerBgClass: 'bg-muted/60',                             terminal: true, dragTarget: 'dialog', updatePayloadStatus: 'Arquivado', hint: 'Disponível pra follow-up' },
];

/* Classifica cada contato na coluna correta combinando crm_status + crm_funnel_status */
function classifyCard(card: { crmStatus: string | null; crmFunnelStatus: string | null }): string {
  if (card.crmStatus === 'Novo') return 'Novos';
  if (card.crmStatus === 'Arquivado') return 'Arquivado';
  if (card.crmStatus === 'Negócio fechado') return 'Negócio fechado';
  // crm_status === 'Em negociação' ou fallback
  const f = card.crmFunnelStatus;
  if (f === 'Scheduled visit') return 'Visita agendada';
  if (f === 'Done visit') return 'Visita realizada';
  if (f === 'Created offer') return 'Proposta criada';
  return 'Em atendimento';
}

/* Formatação R$ estilo C2S (sem centavos em valores altos). Aceita number|string|null. */
function formatBRL(v: number | string | null | undefined): string | null {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'string' ? parseFloat(v.replace(/[^\d.,]/g, '').replace(/\./g, '').replace(',', '.')) : Number(v);
  if (!isFinite(n) || n === 0) return null;
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
}

/* Dias desde última atualização — pra tag "Não interagido" */
function daysSince(iso: string | null): number | null {
  if (!iso) return null;
  const ms = Date.now() - new Date(iso).getTime();
  return Math.floor(ms / (24 * 60 * 60 * 1000));
}

const STALE_DAYS_THRESHOLD = 7;

/* ─── Main ─── */
const PipelinePage: React.FC = () => {
  const { tenantId } = useTenant();
  const { profile } = useAuth();
  const { department } = useDepartmentFilter();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [mode, setMode] = useSessionState<'c2s' | 'local'>('pipeline_mode', 'c2s');
  const [scope, setScope] = useSessionState<'todos' | 'meus'>('pipeline_scope', 'todos');

  const [myBrokerId, setMyBrokerId] = useState<string | null>(null);

  // C2S mode
  const [crmCards, setCrmCards] = useState<Record<string, CrmCard[]>>({});
  const [crmLoading, setCrmLoading] = useState(true);
  const [activeCrmCard, setActiveCrmCard] = useState<CrmCard | null>(null);
  const [crmLastSync, setCrmLastSync] = useState<Date | null>(null);
  const [crmLive, setCrmLive] = useState(false);
  const [crmLiveStatus, setCrmLiveStatus] = useState<string>('pending');

  // Pending transition (Arquivado ou Negócio fechado) aguardando motivo/valor
  const [pendingTransition, setPendingTransition] = useState<{
    contactId: string;
    card: CrmCard;
    oldStatus: string;
    newStatus: 'Arquivado' | 'Negócio fechado';
  } | null>(null);
  const [dialogBusy, setDialogBusy] = useState(false);
  const [archiveReason, setArchiveReason] = useState('');
  const [dealValue, setDealValue] = useState('');
  const [dealInfo, setDealInfo] = useState('');

  // Local mode (drag-and-drop)
  const [stages, setStages] = useState<Stage[]>([]);
  const [conversations, setConversations] = useState<ConvWithContact[]>([]);
  const [localLoading, setLocalLoading] = useState(true);
  const [activeCard, setActiveCard] = useState<ConvWithContact | null>(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  const isSuperAdmin = profile?.role === 'super_admin';
  const isAdmin = profile?.role === 'admin' || isSuperAdmin;
  const effectiveScope: 'todos' | 'meus' = isAdmin ? scope : 'meus';

  // Resolve broker_id for current user
  useEffect(() => {
    if (!profile?.id) return;
    supabase.from('brokers').select('id').eq('profile_id', profile.id).maybeSingle()
      .then(({ data, error }) => {
        if (error) console.error('[PipelinePage] broker lookup failed:', error);
        setMyBrokerId(data?.id || null);
      });
  }, [profile?.id]);

  // Fetch C2S pipeline data. `silent=true` pula o toggle de loading (usado por refresh em realtime).
  const fetchCrm = useCallback(async (silent = false) => {
    if (!tenantId) return;
    if (effectiveScope === 'meus' && !myBrokerId) {
      setCrmCards({});
      if (!silent) setCrmLoading(false);
      return;
    }
    if (!silent) setCrmLoading(true);

    let q = supabase
      .from('contacts')
      .select('id, name, phone, crm_status, crm_funnel_status, crm_property_ref, crm_neighborhood, crm_source, crm_broker_notes, crm_price_hint, updated_at, broker:brokers!assigned_broker_id(full_name)')
      .eq('tenant_id', tenantId)
      .not('crm_status', 'is', null)
      .order('updated_at', { ascending: false })
      .limit(10000);

    if (effectiveScope === 'meus' && myBrokerId) q = q.eq('assigned_broker_id', myBrokerId);
    if (department !== 'all') q = q.eq('department_code', department);

    const { data } = await q;
    const byStatus: Record<string, CrmCard[]> = {};
    PIPELINE_COLUMNS.forEach((c) => { byStatus[c.key] = []; });
    (data || []).forEach((c: any) => {
      const priceRaw = c.crm_price_hint;
      const priceNum = priceRaw !== null && priceRaw !== undefined && priceRaw !== ''
        ? Number(String(priceRaw).replace(/[^\d.,]/g, '').replace(/\./g, '').replace(',', '.'))
        : NaN;
      const card: CrmCard = {
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
        price: isFinite(priceNum) && priceNum > 0 ? priceNum : null,
        updatedAt: c.updated_at,
      };
      const colKey = classifyCard(card);
      if (!byStatus[colKey]) byStatus[colKey] = [];
      byStatus[colKey].push(card);
    });
    setCrmCards(byStatus);
    setCrmLastSync(new Date());
    if (!silent) setCrmLoading(false);
  }, [tenantId, effectiveScope, myBrokerId, department]);

  // Fetch local-mode data (conversation_stages)
  const fetchLocal = useCallback(async () => {
    if (!tenantId) return;
    if (effectiveScope === 'meus' && !myBrokerId) {
      setStages([]);
      setConversations([]);
      setLocalLoading(false);
      return;
    }
    setLocalLoading(true);

    let stageQuery = supabase.from('conversation_stages').select('*').eq('tenant_id', tenantId).order('order_index', { ascending: true });
    let convQuery = supabase.from('conversations').select('*, contacts(*)').eq('tenant_id', tenantId).eq('status', 'active').order('last_message_at', { ascending: false });

    if (department !== 'all') {
      stageQuery = stageQuery.eq('department_code', department);
      convQuery = convQuery.eq('department_code', department);
    }
    if (effectiveScope === 'meus' && myBrokerId) {
      convQuery = convQuery.eq('assigned_broker_id', myBrokerId);
    }

    const [stageRes, convRes] = await Promise.all([stageQuery, convQuery]);
    setStages(stageRes.data ?? []);
    setConversations((convRes.data as ConvWithContact[]) ?? []);
    setLocalLoading(false);
  }, [tenantId, department, effectiveScope, myBrokerId]);

  useEffect(() => {
    if (mode === 'c2s') fetchCrm(); else fetchLocal();
  }, [mode, fetchCrm, fetchLocal]);

  /* Realtime: espelha o C2S (delta-sync grava em contacts a cada 1min;
     aqui escutamos o postgres_changes pra refletir na tela em segundos). */
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!tenantId || mode !== 'c2s') {
      setCrmLive(false);
      setCrmLiveStatus('pending');
      return;
    }

    const scheduleRefresh = () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => { fetchCrm(true); }, 1500);
    };

    // Fallback de polling — se realtime não subir, refaz fetch a cada 15s
    // pra manter o pipeline próximo de realtime mesmo sem WebSocket.
    let pollInterval: ReturnType<typeof setInterval> | null = null;
    const startPollingFallback = () => {
      if (pollInterval) return;
      console.warn('[pipeline] realtime unavailable — ligando polling 15s');
      pollInterval = setInterval(() => { fetchCrm(true); }, 15000);
    };
    const stopPollingFallback = () => {
      if (pollInterval) { clearInterval(pollInterval); pollInterval = null; }
    };

    // Usamos subscription sem filtro (schema-level) e filtramos por tenant_id
    // no callback. Subscriptions filtradas no Supabase Realtime dependem de
    // REPLICA IDENTITY FULL, role/JWT e flags internas que às vezes dão
    // CHANNEL_ERROR silencioso. Sem filtro é mais resiliente; o custo é só
    // receber alguns eventos a mais que são descartados no cliente.
    const channel = supabase
      .channel(`pipeline-contacts-${tenantId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'contacts' },
        (payload) => {
          const row = (payload.new as any) || (payload.old as any) || {};
          if (row.tenant_id && row.tenant_id !== tenantId) return;
          console.log('[pipeline] realtime event', payload.eventType, row.id);
          scheduleRefresh();
        },
      )
      .subscribe((status, err) => {
        console.log('[pipeline] realtime status:', status, err?.message || '');
        setCrmLiveStatus(status);
        if (status === 'SUBSCRIBED') {
          setCrmLive(true);
          stopPollingFallback();
        } else {
          setCrmLive(false);
          if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
            startPollingFallback();
          }
        }
      });

    // Safety net: se em 8s o canal não chegou em SUBSCRIBED, liga o polling.
    // Protege contra casos onde o callback de status não dispara nunca.
    const safetyTimeout = setTimeout(() => {
      if (!pollInterval) startPollingFallback();
    }, 8000);

    return () => {
      clearTimeout(safetyTimeout);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      stopPollingFallback();
      supabase.removeChannel(channel);
      setCrmLive(false);
      setCrmLiveStatus('pending');
    };
  }, [tenantId, mode, fetchCrm]);

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

  /* C2S drag handlers */
  const handleCrmDragStart = (event: DragStartEvent) => {
    const contactId = event.active.id as string;
    for (const list of Object.values(crmCards)) {
      const found = list.find((c) => c.id === contactId);
      if (found) { setActiveCrmCard(found); return; }
    }
  };

  const applyCrmMove = useCallback(async (
    contactId: string,
    movedCard: CrmCard,
    oldStatus: string,
    newStatus: string,
    extraBody: Record<string, unknown> & { new_status_override?: string } = {},
  ) => {
    const { new_status_override, ...rest } = extraBody;
    // Coluna → status C2S real: 'Novos' → 'Novo', 'Em atendimento' → 'Em negociação', terminais iguais.
    const c2sStatus = new_status_override
      || (newStatus === 'Novos' ? 'Novo'
        : newStatus === 'Em atendimento' ? 'Em negociação'
        : newStatus);

    const updatedCard = { ...movedCard, crmStatus: c2sStatus };
    setCrmCards((prev) => ({
      ...prev,
      [oldStatus]: (prev[oldStatus] || []).filter((c) => c.id !== contactId),
      [newStatus]: [updatedCard, ...(prev[newStatus] || [])],
    }));

    const { data, error } = await supabase.functions.invoke('c2s-update-lead-status', {
      body: { tenant_id: tenantId, contact_id: contactId, new_status: c2sStatus, ...rest },
    });

    if (error || !(data as any)?.success) {
      // Rollback
      setCrmCards((prev) => ({
        ...prev,
        [newStatus]: (prev[newStatus] || []).filter((c) => c.id !== contactId),
        [oldStatus]: [movedCard, ...(prev[oldStatus] || [])],
      }));
      toast({
        title: 'Erro ao atualizar no C2S',
        description: (data as any)?.message || (data as any)?.details || error?.message || 'Status revertido.',
        variant: 'destructive',
      });
      return false;
    }

    toast({
      title: 'Status atualizado',
      description: `"${movedCard.name || movedCard.phone}" movido para ${newStatus}.`,
    });
    return true;
  }, [tenantId, toast]);

  const handleCrmDragEnd = async (event: DragEndEvent) => {
    setActiveCrmCard(null);
    const { active, over } = event;
    if (!over || !tenantId) return;

    const contactId = active.id as string;
    const targetColumnKey = over.id as string;

    let oldColumnKey: string | null = null;
    let movedCard: CrmCard | null = null;
    for (const [colKey, list] of Object.entries(crmCards)) {
      const found = list.find((c) => c.id === contactId);
      if (found) { oldColumnKey = colKey; movedCard = found; break; }
    }
    if (!oldColumnKey || !movedCard || oldColumnKey === targetColumnKey) return;

    const targetCol = PIPELINE_COLUMNS.find((c) => c.key === targetColumnKey);
    if (!targetCol) return;

    if (targetCol.dragTarget === 'blocked') {
      toast({
        title: 'Transição não automatizável',
        description: targetCol.hint || `"${targetCol.label}" precisa de ação específica no C2S (criar atividade, agendar visita, etc).`,
      });
      return;
    }

    if (targetCol.dragTarget === 'dialog' && (targetColumnKey === 'Arquivado' || targetColumnKey === 'Negócio fechado')) {
      setArchiveReason('');
      setDealValue('');
      setDealInfo('');
      setPendingTransition({
        contactId,
        card: movedCard,
        oldStatus: oldColumnKey,
        newStatus: targetColumnKey,
      });
      return;
    }

    // direct
    if (!targetCol.updatePayloadStatus) return;
    await applyCrmMove(contactId, movedCard, oldColumnKey, targetColumnKey, { new_status_override: targetCol.updatePayloadStatus });
  };

  const confirmPendingTransition = async () => {
    if (!pendingTransition) return;
    const { contactId, card, oldStatus, newStatus } = pendingTransition;
    setDialogBusy(true);

    const extra: Record<string, unknown> = {};
    if (newStatus === 'Arquivado') {
      extra.archive_message = archiveReason.trim() || 'Arquivado via Aimee';
    } else {
      // Negócio fechado: value é opcional mas recomendado.
      if (dealValue.trim()) extra.deal_value = dealValue.trim();
      if (dealInfo.trim()) extra.deal_info = dealInfo.trim();
    }

    const ok = await applyCrmMove(contactId, card, oldStatus, newStatus, extra);
    setDialogBusy(false);
    if (ok) setPendingTransition(null);
  };

  /* ─── Render ─── */
  return (
    <div className="flex flex-col h-[calc(100vh-4rem)]">
      {/* Header */}
      <div className="p-4 border-b border-border bg-card flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="font-display text-2xl font-bold text-foreground">Pipeline</h2>
          <div className="flex items-center gap-2 mt-0.5">
            <p className="text-sm text-muted-foreground">
              {mode === 'c2s' ? 'Espelho dos status do C2S' : 'Organize seus leads em estágios personalizados'}
            </p>
            {mode === 'c2s' && (() => {
              const isPolling = !crmLive && (crmLiveStatus === 'CHANNEL_ERROR' || crmLiveStatus === 'TIMED_OUT' || crmLiveStatus === 'CLOSED');
              const label = crmLive ? 'Ao vivo' : isPolling ? 'Sync 15s' : crmLiveStatus === 'pending' ? 'Conectando…' : 'Offline';
              const tone = crmLive
                ? 'bg-emerald-500/10 text-emerald-700 border-emerald-500/20'
                : isPolling
                  ? 'bg-amber-500/10 text-amber-700 border-amber-500/20'
                  : 'bg-muted text-muted-foreground border-border';
              const dotTone = crmLive ? 'bg-emerald-500 animate-pulse' : isPolling ? 'bg-amber-500 animate-pulse' : 'bg-muted-foreground';
              return (
                <span
                  className={cn('inline-flex items-center gap-1 text-[11px] font-medium rounded-full px-2 py-0.5 border', tone)}
                  title={`status=${crmLiveStatus}${crmLastSync ? ` · última atualização ${crmLastSync.toLocaleTimeString('pt-BR')}` : ''}`}
                >
                  <span className={cn('h-1.5 w-1.5 rounded-full', dotTone)} />
                  {label}
                </span>
              );
            })()}
          </div>
        </div>
        <div className="flex items-center gap-3">
          {isAdmin && (
            <Tabs value={scope} onValueChange={(v) => setScope(v as 'todos' | 'meus')}>
              <TabsList>
                <TabsTrigger value="todos">Todos{isSuperAdmin ? '' : ' do time'}</TabsTrigger>
                <TabsTrigger value="meus" disabled={!myBrokerId}>Meus leads</TabsTrigger>
              </TabsList>
            </Tabs>
          )}
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
          activeCard={activeCrmCard}
          sensors={sensors}
          onDragStart={handleCrmDragStart}
          onDragEnd={handleCrmDragEnd}
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

      {/* Dialog pra Arquivado / Negócio fechado */}
      <Dialog
        open={!!pendingTransition}
        onOpenChange={(o) => { if (!o && !dialogBusy) setPendingTransition(null); }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {pendingTransition?.newStatus === 'Arquivado' ? (
                <><Archive className="h-5 w-5 text-muted-foreground" /> Arquivar lead</>
              ) : (
                <><CheckCircle2 className="h-5 w-5 text-emerald-600" /> Fechar negócio</>
              )}
            </DialogTitle>
          </DialogHeader>
          {pendingTransition && (
            <div className="space-y-4 py-2">
              <div className="rounded-lg bg-muted p-3 space-y-0.5">
                <p className="text-sm font-medium">{pendingTransition.card.name || 'Sem nome'}</p>
                <p className="text-xs text-muted-foreground">{pendingTransition.card.phone}</p>
                {pendingTransition.card.crmPropertyRef && (
                  <p className="text-xs text-muted-foreground truncate">{pendingTransition.card.crmPropertyRef}</p>
                )}
              </div>

              {pendingTransition.newStatus === 'Arquivado' ? (
                <div className="space-y-1.5">
                  <Label htmlFor="archive-reason">Motivo do arquivamento</Label>
                  <Textarea
                    id="archive-reason"
                    placeholder="Ex: cliente desistiu, sem retorno após 3 tentativas, etc."
                    value={archiveReason}
                    onChange={(e) => setArchiveReason(e.target.value)}
                    rows={3}
                  />
                  <p className="text-[11px] text-muted-foreground">
                    Este texto é enviado ao C2S no campo <span className="font-mono">archive_notes</span>.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="deal-value">Valor do negócio (R$)</Label>
                    <Input
                      id="deal-value"
                      type="text"
                      inputMode="decimal"
                      placeholder="Ex: 500000"
                      value={dealValue}
                      onChange={(e) => setDealValue(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="deal-info">Observações (opcional)</Label>
                    <Textarea
                      id="deal-info"
                      placeholder="Detalhes do fechamento..."
                      value={dealInfo}
                      onChange={(e) => setDealInfo(e.target.value)}
                      rows={2}
                    />
                  </div>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setPendingTransition(null)} disabled={dialogBusy}>
              Cancelar
            </Button>
            <Button
              onClick={confirmPendingTransition}
              disabled={dialogBusy}
              variant={pendingTransition?.newStatus === 'Arquivado' ? 'destructive' : 'default'}
            >
              {dialogBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : pendingTransition?.newStatus === 'Arquivado' ? 'Arquivar' : 'Fechar negócio'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

/* ─── C2S Pipeline (drag entre Novo ↔ Em negociação; demais bloqueiam) ─── */
const CrmPipeline: React.FC<{
  cards: Record<string, CrmCard[]>;
  loading: boolean;
  activeCard: CrmCard | null;
  sensors: ReturnType<typeof useSensors>;
  onDragStart: (e: DragStartEvent) => void;
  onDragEnd: (e: DragEndEvent) => void;
  onCardClick: (contactId: string) => void;
  onFollowUp: () => void;
}> = ({ cards, loading, activeCard, sensors, onDragStart, onDragEnd, onCardClick, onFollowUp }) => {
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
      <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={onDragStart} onDragEnd={onDragEnd}>
        <div className="flex gap-4 p-4 min-w-max h-full">
          {PIPELINE_COLUMNS.map((col) => {
            const list = cards[col.key] || [];
            return (
              <CrmColumn
                key={col.key}
                col={col}
                list={list}
                onCardClick={onCardClick}
                onFollowUp={onFollowUp}
              />
            );
          })}
        </div>
        <DragOverlay>
          {activeCard && (
            <div className="w-80"><CrmCardRow card={activeCard} onClick={() => {}} /></div>
          )}
        </DragOverlay>
      </DndContext>
      <ScrollBar orientation="horizontal" />
    </ScrollArea>
  );
};

const CrmColumn: React.FC<{
  col: PipelineColumn;
  list: CrmCard[];
  onCardClick: (id: string) => void;
  onFollowUp: () => void;
}> = ({ col, list, onCardClick, onFollowUp }) => {
  const { setNodeRef, isOver } = useDroppable({ id: col.key });
  const isArchived = col.key === 'Arquivado';
  const totalValue = list.reduce((sum, c) => sum + (c.price || 0), 0);
  const totalValueLabel = totalValue > 0 ? formatBRL(totalValue) : null;
  const width = col.terminal ? 'w-72' : 'w-80';

  return (
    <div
      ref={setNodeRef}
      className={cn(
        'flex flex-col shrink-0 rounded-lg border transition-colors',
        width,
        col.borderClass,
        col.bgClass,
        isOver && col.dragTarget === 'blocked' && 'ring-2 ring-destructive/40',
        isOver && col.dragTarget !== 'blocked' && 'ring-2 ring-accent/60',
      )}
    >
      {/* Header pastel estilo C2S */}
      <div className={cn('px-3 py-2.5 rounded-t-lg border-b', col.borderClass, col.headerBgClass)}>
        <div className="flex items-center gap-2 min-w-0">
          <div className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: col.color }} />
          <span className="text-sm font-semibold text-foreground truncate min-w-0">{col.label}</span>
          <Badge variant="secondary" className="text-[10px] shrink-0 bg-card/80">{list.length}</Badge>
        </div>
        {totalValueLabel && (
          <p className="mt-1 text-[13px] font-bold text-foreground font-display">{totalValueLabel}</p>
        )}
      </div>

      {(col.hint || isArchived) && (
        <div className="px-3 py-1.5 bg-muted/40 border-b border-border/60 flex items-center justify-between gap-2 min-w-0">
          {col.hint ? (
            <p className="text-[11px] text-muted-foreground flex items-center gap-1.5 min-w-0 truncate">
              <Sparkles className="h-3 w-3 shrink-0" />
              <span className="truncate">{col.hint}</span>
            </p>
          ) : <span />}
          {isArchived && (
            <Button size="sm" variant="outline" className="h-6 text-[11px] gap-1 px-2 shrink-0" onClick={onFollowUp}>
              <Send className="h-3 w-3" /> Follow-up
            </Button>
          )}
        </div>
      )}
      <div className="flex-1 p-2 space-y-2 overflow-auto max-h-[calc(100vh-16rem)]">
        {list.slice(0, 100).map((card) => (
          <DraggableCrmCard key={card.id} card={card} onClick={() => onCardClick(card.id)} />
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
};

const DraggableCrmCard: React.FC<{ card: CrmCard; onClick: () => void }> = ({ card, onClick }) => {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: card.id });
  const style = transform ? { transform: `translate(${transform.x}px, ${transform.y}px)` } : undefined;
  return (
    <div ref={setNodeRef} style={style} className={cn(isDragging && 'opacity-30')} {...attributes} {...listeners}>
      <CrmCardRow card={card} onClick={onClick} />
    </div>
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
  const days = daysSince(card.updatedAt);
  const stale = days !== null && days >= STALE_DAYS_THRESHOLD;
  const priceLabel = card.price ? formatBRL(card.price) : null;
  return (
    <Card className="p-3 cursor-pointer hover:shadow-elevated transition-shadow space-y-1.5 bg-card" onClick={onClick}>
      {stale && (
        <div className="inline-flex items-center gap-1 rounded-md bg-destructive/10 text-destructive text-[10px] font-semibold px-1.5 py-0.5 -mt-1">
          Não interagido · {days}d
        </div>
      )}
      <div className="flex items-start justify-between gap-2">
        <span className="text-sm font-semibold text-foreground truncate">{card.name || card.phone}</span>
        {priceLabel && (
          <span className="text-[12px] font-bold text-foreground font-display shrink-0">{priceLabel}</span>
        )}
      </div>
      {card.crmPropertyRef && (
        <div className="flex items-center gap-1.5 min-w-0">
          <Building2 className="h-3 w-3 text-muted-foreground shrink-0" />
          <p className="text-[11px] text-muted-foreground truncate">{card.crmPropertyRef}</p>
        </div>
      )}
      <div className="flex items-center gap-1.5 flex-wrap">
        {card.crmSource && (
          <Badge variant="secondary" className="text-[10px] font-normal">{card.crmSource}</Badge>
        )}
        {card.crmNeighborhood && (
          <Badge variant="outline" className="text-[10px] font-normal">{card.crmNeighborhood}</Badge>
        )}
      </div>
      <div className="flex items-center justify-between gap-2 pt-1 border-t border-border/40">
        {card.brokerName ? (
          <div className="flex items-center gap-1.5 min-w-0">
            <UserCheck className="h-3 w-3 text-accent shrink-0" />
            <span className="text-[11px] font-medium text-foreground truncate">{card.brokerName}</span>
          </div>
        ) : <span />}
        <span className="text-[10px] text-muted-foreground shrink-0">{timeAgo(card.updatedAt)}</span>
      </div>
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
