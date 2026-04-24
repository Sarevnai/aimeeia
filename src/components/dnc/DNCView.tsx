import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/hooks/use-toast';
import {
  AlertTriangle, BanIcon, Bot, Search, Loader2, ChevronLeft, ChevronRight,
  PhoneOff, MessageCircleX, RotateCcw, Trash2,
} from 'lucide-react';

interface DncContact {
  contact_id: string;
  tenant_id: string;
  phone: string;
  name: string | null;
  dnc_reason: string | null;
  dnc_at: string | null;
  broker_name: string | null;
  last_conversation_source: string | null;
  last_conversation_dept: string | null;
  last_inbound: string | null;
  last_inbound_at: string | null;
  total_inbound_msgs: number | null;
  total_outbound_msgs: number | null;
  c2s_lead_id: string | null;
}

interface RateRow {
  source: string;
  total_contacts: number;
  dnc_contacts: number;
  opt_out_contacts: number;
  auto_reply_contacts: number;
  wrong_audience_contacts: number;
  dnc_rate_pct: number | null;
  opt_out_rate_pct: number | null;
}

const REASON_LABEL: Record<string, { label: string; cls: string }> = {
  opt_out: { label: 'Opt-out', cls: 'bg-destructive/15 text-destructive border-destructive/30' },
  auto_reply: { label: 'Auto-reply', cls: 'bg-warning/15 text-warning border-warning/30' },
  wrong_audience: { label: 'Público errado', cls: 'bg-info/15 text-info border-info/30' },
  manual: { label: 'Manual', cls: 'bg-muted text-muted-foreground border-border' },
};

const PAGE_SIZE = 25;

interface DNCViewProps {
  tenantId: string;
  canManage?: boolean;
  showHeader?: boolean;
}

export default function DNCView({ tenantId, canManage = false, showHeader = true }: DNCViewProps) {
  const { toast } = useToast();
  const [rows, setRows] = useState<DncContact[]>([]);
  const [rates, setRates] = useState<RateRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [reasonFilter, setReasonFilter] = useState<string>('all');
  const [sourceFilter, setSourceFilter] = useState<string>('all');
  const [page, setPage] = useState(1);
  const [unmarkTarget, setUnmarkTarget] = useState<DncContact | null>(null);
  const [unmarking, setUnmarking] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    const [{ data: list }, { data: rateData }] = await Promise.all([
      supabase
        .from('v_dnc_contacts' as any)
        .select('*')
        .eq('tenant_id', tenantId)
        .order('dnc_at', { ascending: false })
        .limit(500),
      supabase
        .from('v_dnc_rate_by_source' as any)
        .select('*')
        .eq('tenant_id', tenantId),
    ]);
    setRows((list || []) as unknown as DncContact[]);
    setRates((rateData || []) as unknown as RateRow[]);
    setLoading(false);
  }, [tenantId]);

  useEffect(() => { loadData(); }, [loadData]);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (reasonFilter !== 'all' && r.dnc_reason !== reasonFilter) return false;
      if (sourceFilter !== 'all' && r.last_conversation_source !== sourceFilter) return false;
      if (search) {
        const s = search.toLowerCase();
        if (!(r.phone?.toLowerCase().includes(s) || r.name?.toLowerCase().includes(s) || r.last_inbound?.toLowerCase().includes(s))) return false;
      }
      return true;
    });
  }, [rows, search, reasonFilter, sourceFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const paged = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const summary = useMemo(() => {
    const total = rows.length;
    const optOut = rows.filter((r) => r.dnc_reason === 'opt_out').length;
    const autoReply = rows.filter((r) => r.dnc_reason === 'auto_reply').length;
    const wrong = rows.filter((r) => r.dnc_reason === 'wrong_audience').length;
    return { total, optOut, autoReply, wrong };
  }, [rows]);

  const availableSources = useMemo(() => {
    const set = new Set<string>();
    rows.forEach((r) => r.last_conversation_source && set.add(r.last_conversation_source));
    return Array.from(set).sort();
  }, [rows]);

  const toggleOne = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const togglePage = () => {
    const pageIds = paged.map((r) => r.contact_id);
    const allSelected = pageIds.every((id) => selected.has(id));
    setSelected((prev) => {
      const next = new Set(prev);
      if (allSelected) pageIds.forEach((id) => next.delete(id));
      else pageIds.forEach((id) => next.add(id));
      return next;
    });
  };

  const handleBulkDelete = async () => {
    if (selected.size === 0) return;
    setDeleting(true);
    try {
      const ids = Array.from(selected);
      const { error } = await supabase.from('contacts').delete().in('id', ids);
      if (error) throw error;
      toast({ title: 'Contatos excluídos', description: `${ids.length} contato(s) removido(s) permanentemente.` });
      setSelected(new Set());
      setConfirmDelete(false);
      await loadData();
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Erro ao excluir', description: err.message || 'Falha ao excluir contatos.' });
    } finally {
      setDeleting(false);
    }
  };

  const handleUnmark = async () => {
    if (!unmarkTarget) return;
    setUnmarking(true);
    try {
      const { error } = await supabase
        .from('contacts')
        .update({ dnc: false, dnc_at: null, dnc_reason: null })
        .eq('id', unmarkTarget.contact_id);
      if (error) throw error;
      toast({ title: 'DNC removido', description: `${unmarkTarget.name || unmarkTarget.phone} voltará a receber mensagens.` });
      setUnmarkTarget(null);
      await loadData();
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Erro', description: err.message || 'Falha ao remover DNC.' });
    } finally {
      setUnmarking(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-6xl mx-auto animate-fade-in">
      {showHeader && (
        <div>
          <h3 className="text-base font-semibold text-foreground flex items-center gap-2">
            <BanIcon className="h-4 w-4 text-destructive" />
            DNC / Opt-outs
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Contatos que pediram para não receber mensagens. A AI não responde e campanhas futuras excluem automaticamente.
          </p>
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <MetricCard icon={BanIcon} label="Total DNC" value={summary.total} color="hsl(var(--destructive))" />
        <MetricCard icon={PhoneOff} label="Opt-out" value={summary.optOut} color="hsl(var(--destructive))" />
        <MetricCard icon={Bot} label="Auto-reply" value={summary.autoReply} color="hsl(var(--warning))" />
        <MetricCard icon={AlertTriangle} label="Público errado" value={summary.wrong} color="hsl(var(--info))" />
      </div>

      {rates.length > 0 && (
        <div className="bg-card border border-border rounded-xl p-5">
          <h4 className="text-sm font-semibold text-foreground mb-3">Taxa de DNC por fonte</h4>
          <div className="space-y-2">
            {rates
              .sort((a, b) => (Number(b.dnc_rate_pct) || 0) - (Number(a.dnc_rate_pct) || 0))
              .map((r) => (
                <div key={r.source} className="flex items-center gap-3">
                  <span className="text-xs font-medium text-muted-foreground w-32 shrink-0">{r.source}</span>
                  <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-destructive"
                      style={{ width: `${Math.min(100, Number(r.dnc_rate_pct) || 0)}%` }}
                    />
                  </div>
                  <span className="text-xs text-muted-foreground w-20 text-right">
                    {r.dnc_contacts}/{r.total_contacts} ({r.dnc_rate_pct ?? 0}%)
                  </span>
                </div>
              ))}
          </div>
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por nome, telefone ou texto..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="pl-9"
          />
        </div>
        <Select value={reasonFilter} onValueChange={(v) => { setReasonFilter(v); setPage(1); }}>
          <SelectTrigger className="w-full sm:w-[180px]">
            <SelectValue placeholder="Motivo" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os motivos</SelectItem>
            <SelectItem value="opt_out">Opt-out</SelectItem>
            <SelectItem value="auto_reply">Auto-reply</SelectItem>
            <SelectItem value="wrong_audience">Público errado</SelectItem>
            <SelectItem value="manual">Manual</SelectItem>
          </SelectContent>
        </Select>
        <Select value={sourceFilter} onValueChange={(v) => { setSourceFilter(v); setPage(1); }}>
          <SelectTrigger className="w-full sm:w-[180px]">
            <SelectValue placeholder="Fonte" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas as fontes</SelectItem>
            {availableSources.map((s) => (
              <SelectItem key={s} value={s}>{s}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {canManage && selected.size > 0 && (
        <div className="flex items-center justify-between bg-destructive/10 border border-destructive/30 rounded-xl px-4 py-3">
          <span className="text-sm text-foreground">
            {selected.size} contato(s) selecionado(s)
          </span>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())}>
              Limpar
            </Button>
            <Button variant="destructive" size="sm" className="gap-1" onClick={() => setConfirmDelete(true)}>
              <Trash2 className="h-3.5 w-3.5" />
              Excluir selecionados
            </Button>
          </div>
        </div>
      )}

      <div className="bg-card border border-border rounded-xl overflow-hidden">
        {filtered.length === 0 ? (
          <div className="p-10 text-center text-sm text-muted-foreground flex flex-col items-center gap-2">
            <MessageCircleX className="h-8 w-8 text-muted-foreground/40" />
            Nenhum contato DNC encontrado com esses filtros.
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 border-b border-border">
                  <tr className="text-left text-xs text-muted-foreground">
                    {canManage && (
                      <th className="px-4 py-2 font-medium w-10">
                        <Checkbox
                          checked={paged.length > 0 && paged.every((r) => selected.has(r.contact_id))}
                          onCheckedChange={togglePage}
                          aria-label="Selecionar página"
                        />
                      </th>
                    )}
                    <th className="px-4 py-2 font-medium">Contato</th>
                    <th className="px-4 py-2 font-medium">Motivo</th>
                    <th className="px-4 py-2 font-medium">Fonte</th>
                    <th className="px-4 py-2 font-medium">Última fala</th>
                    <th className="px-4 py-2 font-medium">Marcado em</th>
                    <th className="px-4 py-2 font-medium text-right">Turnos</th>
                    {canManage && <th className="px-4 py-2 font-medium text-right">Ações</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {paged.map((r) => {
                    const rs = REASON_LABEL[r.dnc_reason || ''] || REASON_LABEL.manual;
                    return (
                      <tr key={r.contact_id} className="hover:bg-muted/20">
                        {canManage && (
                          <td className="px-4 py-3">
                            <Checkbox
                              checked={selected.has(r.contact_id)}
                              onCheckedChange={() => toggleOne(r.contact_id)}
                              aria-label={`Selecionar ${r.name || r.phone}`}
                            />
                          </td>
                        )}
                        <td className="px-4 py-3">
                          <div className="font-medium text-foreground">{r.name || 'Sem nome'}</div>
                          <div className="text-xs text-muted-foreground">{r.phone}</div>
                        </td>
                        <td className="px-4 py-3">
                          <Badge variant="outline" className={rs.cls}>{rs.label}</Badge>
                        </td>
                        <td className="px-4 py-3 text-xs text-muted-foreground">
                          {r.last_conversation_source || '—'}
                          {r.last_conversation_dept && <div className="opacity-60">{r.last_conversation_dept}</div>}
                        </td>
                        <td className="px-4 py-3 max-w-xs">
                          <p className="text-xs text-foreground line-clamp-2" title={r.last_inbound || ''}>
                            {r.last_inbound || <span className="text-muted-foreground italic">sem mensagem</span>}
                          </p>
                        </td>
                        <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                          {r.dnc_at ? new Date(r.dnc_at).toLocaleDateString('pt-BR') : '—'}
                        </td>
                        <td className="px-4 py-3 text-right text-xs text-muted-foreground">
                          {r.total_inbound_msgs}↓ {r.total_outbound_msgs}↑
                        </td>
                        {canManage && (
                          <td className="px-4 py-3 text-right">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 gap-1 text-xs"
                              onClick={() => setUnmarkTarget(r)}
                            >
                              <RotateCcw className="h-3 w-3" />
                              Reabilitar
                            </Button>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-border text-xs text-muted-foreground">
                <span>{filtered.length} contatos · página {currentPage}/{totalPages}</span>
                <div className="flex gap-1">
                  <button
                    className="p-1 rounded hover:bg-muted disabled:opacity-40"
                    disabled={currentPage === 1}
                    onClick={() => setPage(currentPage - 1)}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <button
                    className="p-1 rounded hover:bg-muted disabled:opacity-40"
                    disabled={currentPage === totalPages}
                    onClick={() => setPage(currentPage + 1)}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      <Dialog open={confirmDelete} onOpenChange={(o) => !o && !deleting && setConfirmDelete(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Excluir {selected.size} contato(s) permanentemente?</DialogTitle>
            <DialogDescription>
              Esta ação <span className="font-medium text-destructive">não pode ser desfeita</span>.
              Os contatos serão removidos da base junto com suas conversas e histórico relacionado.
              A exclusão acontece apenas na Aimee — o C2S não possui endpoint de exclusão via API,
              então o registro no CRM precisa ser tratado separadamente.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDelete(false)} disabled={deleting}>Cancelar</Button>
            <Button variant="destructive" onClick={handleBulkDelete} disabled={deleting}>
              {deleting && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
              Excluir permanentemente
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!unmarkTarget} onOpenChange={(o) => !o && setUnmarkTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reabilitar contato?</DialogTitle>
            <DialogDescription>
              <span className="font-medium text-foreground">{unmarkTarget?.name || unmarkTarget?.phone}</span>
              {' '}voltará a ser elegível para receber mensagens da Aimee e campanhas.
              {unmarkTarget?.dnc_reason === 'opt_out' && (
                <span className="block mt-2 text-destructive">
                  ⚠️ Atenção: este contato pediu explicitamente para não ser contatado. Reabilitá-lo pode ser visto como spam.
                </span>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setUnmarkTarget(null)} disabled={unmarking}>Cancelar</Button>
            <Button onClick={handleUnmark} disabled={unmarking}>
              {unmarking && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
              Reabilitar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function MetricCard({ icon: Icon, label, value, color }: { icon: any; label: string; value: number; color: string }) {
  return (
    <div className="bg-card border border-border rounded-xl p-4">
      <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
        <Icon className="h-3.5 w-3.5" style={{ color }} />
        {label}
      </div>
      <div className="text-2xl font-semibold text-foreground">{value}</div>
    </div>
  );
}
