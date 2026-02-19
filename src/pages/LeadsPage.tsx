import React, { useEffect, useState, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useTenant } from '@/contexts/TenantContext';
import { useDepartmentFilter } from '@/contexts/DepartmentFilterContext';
import { useNavigate } from 'react-router-dom';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Search, Loader2, ChevronLeft, ChevronRight, Phone, User, MessageSquare, Tag, Filter, Download, Send, Megaphone, Globe, Facebook, Home } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';

/* ─── types ─── */

interface LeadRow {
  contactId: string;
  name: string | null;
  phone: string;
  departmentCode: string | null;
  channelSource: string | null;
  triageStage: string | null;
  isAiActive: boolean | null;
  operatorTakeoverAt: string | null;
  convCreatedAt: string | null;
  convId: string | null;
  notes: string | null;
  tags: string[] | null;
  status: string | null;
}

/* ─── constants ─── */

const DEPT_LABELS: Record<string, string> = {
  locacao: 'Locação',
  vendas: 'Vendas',
  administrativo: 'Admin',
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

const PAGE_SIZE = 50;

const formatDate = (d: string | null) => {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' });
};

const formatDateTime = (d: string | null) => {
  if (!d) return '';
  return new Date(d).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
};

/* ─── AI Status badge ─── */

const AiStatusBadge: React.FC<{ triageStage: string | null; isAiActive: boolean | null }> = ({ triageStage, isAiActive }) => {
  if (triageStage === 'completed') {
    return <Badge className="text-[10px] bg-success/15 text-success border-0">Atendido pela Aimee</Badge>;
  }
  if (isAiActive) {
    return <Badge className="text-[10px] bg-warning/15 text-warning border-0">Em atendimento</Badge>;
  }
  return <Badge variant="secondary" className="text-[10px]">Sem atendimento</Badge>;
};

/* ─── CRM Status ─── */

const CrmStatus: React.FC<{ isAiActive: boolean | null; takeoverAt: string | null }> = ({ isAiActive, takeoverAt }) => {
  if (isAiActive === false) {
    return (
      <div className="flex items-center gap-1.5">
        <div className="h-2 w-2 rounded-full bg-success" />
        <div>
          <span className="text-xs font-medium text-success">Enviado ao CRM</span>
          {takeoverAt && <p className="text-[10px] text-muted-foreground">{formatDateTime(takeoverAt)}</p>}
        </div>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-1.5">
      <div className="h-2 w-2 rounded-full bg-muted-foreground" />
      <span className="text-xs font-medium text-muted-foreground">Não pronto</span>
    </div>
  );
};

/* ─── Main ─── */

const LeadsPage: React.FC = () => {
  const { tenantId } = useTenant();
  const { department } = useDepartmentFilter();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [leads, setLeads] = useState<LeadRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [selected, setSelected] = useState<LeadRow | null>(null);
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());

  const fetchLeads = async () => {
    if (!tenantId) return;
    setLoading(true);

    // Fetch contacts with count
    let contactQuery = supabase
      .from('contacts')
      .select('*', { count: 'exact' })
      .eq('tenant_id', tenantId)
      .order('updated_at', { ascending: false })
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

    if (department !== 'all') {
      contactQuery = contactQuery.eq('department_code', department);
    }
    if (search.trim()) {
      contactQuery = contactQuery.or(`name.ilike.%${search}%,phone.ilike.%${search}%`);
    }

    const { data: contacts, count } = await contactQuery;
    setTotal(count ?? 0);

    if (!contacts || contacts.length === 0) {
      setLeads([]);
      setLoading(false);
      return;
    }

    // Get contact IDs for batch lookups
    const contactIds = contacts.map((c) => c.id);
    const phones = contacts.map((c) => c.phone);

    // Parallel: fetch conversations + conversation_states
    const [convResult, stateResult] = await Promise.all([
      supabase
        .from('conversations')
        .select('id, contact_id, department_code, created_at, phone_number')
        .eq('tenant_id', tenantId)
        .in('contact_id', contactIds)
        .order('last_message_at', { ascending: false }),
      supabase
        .from('conversation_states')
        .select('phone_number, triage_stage, is_ai_active, operator_takeover_at')
        .eq('tenant_id', tenantId)
        .in('phone_number', phones),
    ]);

    // Index by contact_id / phone for O(1) lookups
    const convByContact: Record<string, typeof convResult.data extends (infer T)[] ? T : never> = {};
    (convResult.data ?? []).forEach((c) => {
      if (c.contact_id && !convByContact[c.contact_id]) convByContact[c.contact_id] = c;
    });

    const stateByPhone: Record<string, (typeof stateResult.data extends (infer T)[] ? T : never)> = {};
    (stateResult.data ?? []).forEach((s) => {
      if (!stateByPhone[s.phone_number]) stateByPhone[s.phone_number] = s;
    });

    // Merge
    const rows: LeadRow[] = contacts.map((c) => {
      const conv = convByContact[c.id];
      const state = stateByPhone[c.phone];
      return {
        contactId: c.id,
        name: c.name,
        phone: c.phone,
        departmentCode: conv?.department_code ?? c.department_code,
        channelSource: c.channel_source ?? 'whatsapp',
        triageStage: state?.triage_stage ?? null,
        isAiActive: state?.is_ai_active ?? null,
        operatorTakeoverAt: state?.operator_takeover_at ?? null,
        convCreatedAt: conv?.created_at ?? null,
        convId: conv?.id ?? null,
        notes: c.notes,
        tags: c.tags,
        status: c.status,
      };
    });

    setLeads(rows);
    setLoading(false);
  };

  useEffect(() => { setPage(0); }, [department, search]);
  useEffect(() => { fetchLeads(); }, [tenantId, department, search, page]);

  // Reset checks when leads change
  useEffect(() => { setCheckedIds(new Set()); }, [leads]);

  const totalPages = Math.ceil(total / PAGE_SIZE);
  const allChecked = leads.length > 0 && checkedIds.size === leads.length;

  const toggleCheck = (id: string) => {
    setCheckedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (allChecked) {
      setCheckedIds(new Set());
    } else {
      setCheckedIds(new Set(leads.map((l) => l.contactId)));
    }
  };

  const handleExportSelected = () => {
    const selectedLeads = leads.filter((l) => checkedIds.has(l.contactId));
    const csvLines = [
      'Nome,Telefone,Canal,Departamento,Status AI,CRM,Data',
      ...selectedLeads.map((l) => [
        l.name || 'Sem nome',
        l.phone,
        CHANNEL_LABELS[l.channelSource || 'whatsapp'] || l.channelSource || '',
        DEPT_LABELS[l.departmentCode || ''] || l.departmentCode || '',
        l.triageStage || '',
        l.isAiActive === false ? 'Enviado ao CRM' : 'Não pronto',
        formatDate(l.convCreatedAt),
      ].join(',')),
    ];
    const blob = new Blob([csvLines.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `leads_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast({ title: 'Exportado!', description: `${selectedLeads.length} leads exportados com sucesso.` });
  };

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)]">
      {/* Header */}
      <div className="p-4 border-b border-border bg-card space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-display text-xl font-bold text-foreground">Leads</h2>
            <p className="text-xs text-muted-foreground">{total} lead{total !== 1 ? 's' : ''} no total</p>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="gap-2">
                <Filter className="h-4 w-4" /> Filtros
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="bg-popover border border-border z-50">
              <DropdownMenuItem disabled className="text-xs text-muted-foreground">Filtros em breve</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <div className="relative w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por nome ou telefone..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-9"
          />
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        {loading ? (
          <div className="flex items-center justify-center h-40">
            <Loader2 className="h-6 w-6 animate-spin text-accent" />
          </div>
        ) : leads.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 text-sm text-muted-foreground gap-2">
            <User className="h-8 w-8 opacity-40" />
            Nenhum lead encontrado
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <Checkbox
                    checked={allChecked}
                    onCheckedChange={toggleAll}
                  />
                </TableHead>
                <TableHead>Lead</TableHead>
                <TableHead>Contato</TableHead>
                <TableHead className="hidden md:table-cell">Operação</TableHead>
                <TableHead className="hidden lg:table-cell">Canal</TableHead>
                <TableHead className="hidden sm:table-cell">CRM</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {leads.map((lead) => {
                const channel = lead.channelSource || 'whatsapp';
                const channelIcon = CHANNEL_ICONS[channel] || <Globe className="h-3.5 w-3.5 text-muted-foreground" />;

                return (
                  <TableRow
                    key={lead.contactId}
                    className={cn(
                      'cursor-pointer hover:bg-muted/50 transition-colors',
                      checkedIds.has(lead.contactId) && 'bg-accent/5'
                    )}
                  >
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <Checkbox
                        checked={checkedIds.has(lead.contactId)}
                        onCheckedChange={() => toggleCheck(lead.contactId)}
                      />
                    </TableCell>

                    {/* Lead: name + AI badge */}
                    <TableCell onClick={() => setSelected(lead)}>
                      <div className="space-y-1">
                        <p className="font-medium text-foreground text-sm">{lead.name || 'Sem nome'}</p>
                        <AiStatusBadge triageStage={lead.triageStage} isAiActive={lead.isAiActive} />
                      </div>
                    </TableCell>

                    {/* Contato: phone */}
                    <TableCell onClick={() => setSelected(lead)}>
                      <p className="text-sm text-foreground">{lead.phone}</p>
                    </TableCell>

                    {/* Operação: department */}
                    <TableCell className="hidden md:table-cell" onClick={() => setSelected(lead)}>
                      {lead.departmentCode ? (
                        <div>
                          <p className="text-sm text-foreground">{DEPT_LABELS[lead.departmentCode] || lead.departmentCode}</p>
                        </div>
                      ) : (
                        <span className="text-muted-foreground text-sm">—</span>
                      )}
                    </TableCell>

                    {/* Canal */}
                    <TableCell className="hidden lg:table-cell" onClick={() => setSelected(lead)}>
                      <div className="flex items-center gap-1.5">
                        {channelIcon}
                        <div>
                          <p className="text-sm text-foreground">{CHANNEL_LABELS[channel] || channel}</p>
                          <p className="text-[10px] text-muted-foreground">{formatDate(lead.convCreatedAt)}</p>
                        </div>
                      </div>
                    </TableCell>

                    {/* CRM */}
                    <TableCell className="hidden sm:table-cell" onClick={() => setSelected(lead)}>
                      <CrmStatus isAiActive={lead.isAiActive} takeoverAt={lead.operatorTakeoverAt} />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </div>

      {/* Bulk Actions Bar — shows when items are selected */}
      {checkedIds.size > 0 && (
        <div className="flex items-center justify-between px-4 py-3 border-t border-border bg-card animate-fade-in">
          <span className="text-sm font-medium text-foreground">
            {checkedIds.size} selecionado{checkedIds.size !== 1 ? 's' : ''}
          </span>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={handleExportSelected}>
              <Download className="h-3.5 w-3.5" /> Baixar selecionados
            </Button>
            <Button variant="outline" size="sm" className="gap-1.5 text-xs" disabled>
              <Send className="h-3.5 w-3.5" /> Enviar ao CRM
            </Button>
            <Button size="sm" className="gap-1.5 text-xs" disabled>
              <Megaphone className="h-3.5 w-3.5" /> Programar Remarketing
            </Button>
          </div>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && checkedIds.size === 0 && (
        <div className="flex items-center justify-between px-4 py-3 border-t border-border bg-card text-sm">
          <span className="text-muted-foreground">
            Exibindo {page * PAGE_SIZE + 1}-{Math.min((page + 1) * PAGE_SIZE, total)} de {total}
          </span>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" className="h-8 w-8" disabled={page === 0} onClick={() => setPage(page - 1)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-muted-foreground">
              {page + 1} / {totalPages}
            </span>
            <Button variant="outline" size="icon" className="h-8 w-8" disabled={page >= totalPages - 1} onClick={() => setPage(page + 1)}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Detail drawer */}
      <Sheet open={!!selected} onOpenChange={(open) => !open && setSelected(null)}>
        <SheetContent className="w-full sm:max-w-md">
          {selected && (
            <>
              <SheetHeader>
                <SheetTitle className="font-display">{selected.name || 'Sem nome'}</SheetTitle>
              </SheetHeader>
              <div className="mt-6 space-y-4">
                <DetailRow icon={<Phone className="h-4 w-4" />} label="Telefone" value={selected.phone} />
                <DetailRow icon={<User className="h-4 w-4" />} label="Status" value={selected.status || '—'} />
                {selected.channelSource && (
                  <div className="flex items-center gap-3">
                    <span className="text-muted-foreground">{CHANNEL_ICONS[selected.channelSource] || <Globe className="h-4 w-4" />}</span>
                    <div>
                      <span className="text-xs text-muted-foreground">Canal</span>
                      <p className="text-sm font-medium text-foreground">{CHANNEL_LABELS[selected.channelSource] || selected.channelSource}</p>
                    </div>
                  </div>
                )}
                <div>
                  <span className="text-xs text-muted-foreground">Atendimento IA</span>
                  <div className="mt-1">
                    <AiStatusBadge triageStage={selected.triageStage} isAiActive={selected.isAiActive} />
                  </div>
                </div>
                {selected.departmentCode && (
                  <DetailRow
                    icon={<Tag className="h-4 w-4" />}
                    label="Departamento"
                    value={DEPT_LABELS[selected.departmentCode] || selected.departmentCode}
                  />
                )}
                <div>
                  <span className="text-xs text-muted-foreground">CRM</span>
                  <div className="mt-1">
                    <CrmStatus isAiActive={selected.isAiActive} takeoverAt={selected.operatorTakeoverAt} />
                  </div>
                </div>
                {selected.notes && (
                  <div>
                    <span className="text-xs text-muted-foreground">Notas</span>
                    <p className="text-sm text-foreground mt-1">{selected.notes}</p>
                  </div>
                )}
                {selected.tags && selected.tags.length > 0 && (
                  <div>
                    <span className="text-xs text-muted-foreground">Tags</span>
                    <div className="flex flex-wrap gap-1.5 mt-1">
                      {selected.tags.map((t) => (
                        <Badge key={t} variant="secondary" className="text-[10px]">{t}</Badge>
                      ))}
                    </div>
                  </div>
                )}
                {selected.convId && (
                  <Button className="w-full mt-4" onClick={() => navigate(`/chat/${selected.convId}`)}>
                    <MessageSquare className="h-4 w-4 mr-2" /> Ver Conversa
                  </Button>
                )}
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
};

const DetailRow: React.FC<{ icon: React.ReactNode; label: string; value: string }> = ({ icon, label, value }) => (
  <div className="flex items-center gap-3">
    <span className="text-muted-foreground">{icon}</span>
    <div>
      <span className="text-xs text-muted-foreground">{label}</span>
      <p className="text-sm font-medium text-foreground">{value}</p>
    </div>
  </div>
);

export default LeadsPage;
