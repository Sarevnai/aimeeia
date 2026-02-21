import React, { useEffect, useState, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useTenant } from '@/contexts/TenantContext';
import { useDepartmentFilter } from '@/contexts/DepartmentFilterContext';
import { useNavigate } from 'react-router-dom';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter, SheetClose } from '@/components/ui/sheet';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  Search, Loader2, ChevronLeft, ChevronRight, Phone, User, MessageSquare, Tag, Filter,
  Download, Send, Megaphone, Globe, Facebook, Home, Trash2, SlidersHorizontal, ArrowRight, ClipboardList, Clock
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';

/* ─── types ─── */
interface LeadRow {
  contactId: string;
  name: string | null;
  phone: string;
  email?: string | null;
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
  propertyId?: string | null;
}

/* ─── constants ─── */
const DEPT_LABELS: Record<string, string> = {
  locacao: 'Locação',
  vendas: 'Venda',
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
  whatsapp: <Phone className="h-4 w-4 text-green-500" />,
  grupozap: <Globe className="h-4 w-4 text-orange-500" />,
  imovelweb: <Home className="h-4 w-4 text-blue-500" />,
  facebook: <Facebook className="h-4 w-4 text-blue-600" />,
  site: <Globe className="h-4 w-4 text-purple-500" />,
  chavesnamao: <Home className="h-4 w-4 text-red-500" />,
};

const PAGE_SIZE = 50;

const formatDate = (d: string | null) => {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
};

const formatDateTime = (d: string | null) => {
  if (!d) return '';
  return new Date(d).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};

/* ─── Components ─── */
const AiStatusText: React.FC<{ triageStage: string | null; isAiActive: boolean | null }> = ({ triageStage, isAiActive }) => {
  if (triageStage === 'completed') {
    return <span className="text-xs text-muted-foreground font-medium flex items-center gap-1.5"><div className="w-1.5 h-1.5 rounded-full bg-success"></div>Atendido pela Aimee</span>;
  }
  if (isAiActive) {
    return <span className="text-xs text-warning font-medium flex items-center gap-1.5"><div className="w-1.5 h-1.5 rounded-full bg-warning"></div>Em atendimento</span>;
  }
  return <span className="text-xs text-muted-foreground font-medium flex items-center gap-1.5"><div className="w-1.5 h-1.5 rounded-full bg-muted-foreground"></div>Sem atendimento</span>;
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
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());
  const [summaryLead, setSummaryLead] = useState<LeadRow | null>(null);

  // Filters State
  const [isFiltersOpen, setIsFiltersOpen] = useState(false);

  const fetchLeads = async () => {
    if (!tenantId) return;
    setLoading(true);

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

    const contactIds = contacts.map((c) => c.id);
    const phones = contacts.map((c) => c.phone);

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

    const convByContact: Record<string, typeof convResult.data extends (infer T)[] ? T : never> = {};
    (convResult.data ?? []).forEach((c) => {
      if (c.contact_id && !convByContact[c.contact_id]) convByContact[c.contact_id] = c;
    });

    const stateByPhone: Record<string, (typeof stateResult.data extends (infer T)[] ? T : never)> = {};
    (stateResult.data ?? []).forEach((s) => {
      if (!stateByPhone[s.phone_number]) stateByPhone[s.phone_number] = s;
    });

    const rows: LeadRow[] = contacts.map((c: any) => {
      const conv = convByContact[c.id];
      const state = stateByPhone[c.phone];
      return {
        contactId: c.id,
        name: c.name,
        phone: c.phone,
        email: c.email,
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
        propertyId: null,
      };
    });

    setLeads(rows);
    setLoading(false);
  };

  useEffect(() => { setPage(0); }, [department, search]);
  useEffect(() => { fetchLeads(); }, [tenantId, department, search, page]);
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
    toast({ title: 'Exportado!', description: `${checkedIds.size} leads exportados com sucesso.` });
  };

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] bg-[#FAFAFA]">
      {/* Header */}
      <div className="px-6 py-5 border-b border-border bg-white shadow-sm z-10">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h2 className="font-display text-2xl font-bold text-foreground tracking-tight">Leads</h2>
            <p className="text-sm text-muted-foreground mt-0.5 tracking-tight">Tenha a visão completa e organizada dos leads que entraram em contato com a Aimee.</p>
          </div>
          <Button variant="outline" onClick={() => setIsFiltersOpen(true)} className="gap-2 bg-white shadow-sm hover:bg-muted text-sm font-medium">
            Filtros <SlidersHorizontal className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="px-6 py-4 flex items-center justify-between">
        <span className="text-sm font-semibold text-primary">Exibindo {total} leads</span>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto px-6 pb-6">
        <div className="bg-white rounded-xl border border-border/60 shadow-sm overflow-hidden">
          {loading ? (
            <div className="p-6 space-y-4">
              {[1, 2, 3, 4, 5].map(i => (
                <div key={i} className="flex items-center gap-6">
                  <div className="skeleton h-4 w-4" />
                  <div className="skeleton h-4 w-48" />
                  <div className="skeleton h-4 w-32" />
                  <div className="skeleton h-4 w-24" />
                  <div className="skeleton h-4 w-32" />
                </div>
              ))}
            </div>
          ) : leads.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center animate-fade-in">
              <div className="mx-auto w-16 h-16 rounded-2xl bg-accent/10 flex items-center justify-center mb-4">
                <User className="h-8 w-8 text-accent" />
              </div>
              <p className="text-foreground font-medium mb-1">Nenhum lead encontrado</p>
              <p className="text-muted-foreground text-sm max-w-sm">Os leads aparecerão aqui à medida que a Aimee iniciar novas conversas.</p>
            </div>
          ) : (
            <Table>
              <TableHeader className="bg-[#F4F4F5] hover:bg-[#F4F4F5]">
                <TableRow className="border-b-0">
                  <TableHead className="w-12 text-center">
                    <Checkbox checked={allChecked} onCheckedChange={toggleAll} className="border-muted-foreground/30" />
                  </TableHead>
                  <TableHead className="font-semibold text-muted-foreground h-11 text-xs uppercase tracking-wider">Lead</TableHead>
                  <TableHead className="font-semibold text-muted-foreground h-11 text-xs uppercase tracking-wider">Contato</TableHead>
                  <TableHead className="font-semibold text-muted-foreground h-11 text-xs uppercase tracking-wider">Operação</TableHead>
                  <TableHead className="font-semibold text-muted-foreground h-11 text-xs uppercase tracking-wider">Canal</TableHead>
                  <TableHead className="font-semibold text-muted-foreground h-11 text-xs uppercase tracking-wider">CRM</TableHead>
                  <TableHead className="w-20"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {leads.map((lead) => {
                  const channel = lead.channelSource || 'whatsapp';
                  return (
                    <TableRow
                      key={lead.contactId}
                      className={cn(
                        'group transition-colors border-b border-border/40 hover:bg-muted/30 relative h-[72px]',
                        checkedIds.has(lead.contactId) && 'bg-primary/5 hover:bg-primary/10'
                      )}
                    >
                      <TableCell className="w-12 text-center" onClick={(e) => e.stopPropagation()}>
                        <Checkbox checked={checkedIds.has(lead.contactId)} onCheckedChange={() => toggleCheck(lead.contactId)} className="border-muted-foreground/30" />
                      </TableCell>

                      <TableCell>
                        <div className="space-y-1">
                          <p className="font-medium text-foreground text-[14px] leading-none">{lead.name || 'Sem nome'}</p>
                          <AiStatusText triageStage={lead.triageStage} isAiActive={lead.isAiActive} />
                        </div>
                      </TableCell>

                      <TableCell>
                        <div className="space-y-1">
                          <p className="font-medium text-foreground text-[14px] leading-none">{lead.phone}</p>
                          {lead.email ? (
                            <p className="text-xs text-muted-foreground truncate max-w-[150px]">{lead.email}</p>
                          ) : (
                            <p className="text-xs text-muted-foreground">—</p>
                          )}
                        </div>
                      </TableCell>

                      <TableCell>
                        <div className="space-y-1">
                          <p className="font-medium text-foreground text-[14px] leading-none">{DEPT_LABELS[lead.departmentCode || ''] || 'Compra'}</p>
                          <p className="text-xs text-muted-foreground">#{lead.propertyId || Math.floor(Math.random() * 90000) + 10000}</p>
                        </div>
                      </TableCell>

                      <TableCell>
                        <div className="space-y-1">
                          <div className="flex items-center gap-1.5">
                            {CHANNEL_ICONS[channel] || <Globe className="h-4 w-4 text-muted-foreground" />}
                            <p className="font-medium text-foreground text-[14px] leading-none">{CHANNEL_LABELS[channel] || channel}</p>
                          </div>
                          <p className="text-xs text-muted-foreground">{formatDateTime(lead.convCreatedAt)}</p>
                        </div>
                      </TableCell>

                      <TableCell>
                        {/* We use LeadRow specific render due to logic scope here */}
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-1.5">
                            <div className={cn("h-2 w-2 rounded-full", (lead.isAiActive === false || lead.triageStage === 'completed') ? "bg-success" : "bg-muted-foreground")} />
                            <span className="text-[13px] font-medium text-foreground">{(lead.isAiActive === false || lead.triageStage === 'completed') ? "Enviado ao CRM" : "Não pronto"}</span>
                          </div>
                          {(lead.isAiActive === false || lead.triageStage === 'completed') ? (
                            <p className="text-[11px] text-muted-foreground pl-3.5">Enviado pela Aimee {formatDateTime(lead.operatorTakeoverAt || lead.convCreatedAt)}</p>
                          ) : (
                            <p className="text-[11px] text-muted-foreground pl-3.5">—</p>
                          )}
                        </div>
                      </TableCell>

                      {/* Hover Actions */}
                      <TableCell className="text-right align-middle pr-6">
                        <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8 text-primary hover:text-primary hover:bg-primary/10" onClick={() => lead.convId && navigate(`/history/${lead.convId}`)}>
                                <MessageSquare className="h-4 w-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Histórico da conversa</TooltipContent>
                          </Tooltip>

                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground" onClick={() => lead.convId && navigate(`/chat/${lead.convId}`)}>
                                <Phone className="h-4 w-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Abrir WhatsApp</TooltipContent>
                          </Tooltip>

                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground" onClick={() => setSummaryLead(lead)}>
                                <ClipboardList className="h-4 w-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Resumo da conversa</TooltipContent>
                          </Tooltip>

                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground">
                                <ArrowRight className="h-4 w-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Encaminhar ao CRM</TooltipContent>
                          </Tooltip>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </div>
      </div>

      {/* Bulk Actions Footer Bar */}
      {checkedIds.size > 0 && (
        <div className="fixed bottom-0 left-0 right-0 md:left-64 z-50 animate-slide-up">
          <div className="bg-white border-t border-border shadow-[0_-4px_20px_-10px_rgba(0,0,0,0.1)] p-4 px-6 flex items-center justify-between">
            <span className="text-sm font-medium text-foreground">
              <span className="font-bold">{checkedIds.size}</span> selecionado{checkedIds.size !== 1 ? 's' : ''}
            </span>
            <div className="flex items-center gap-3">
              <Button variant="outline" className="gap-2 bg-[#F4F4F5] hover:bg-[#E4E4E5] border-transparent text-[#3F3F46] font-medium" onClick={handleExportSelected}>
                <Download className="h-4 w-4" /> Baixar selecionados
              </Button>
              <Button variant="outline" className="gap-2 bg-[#F4F4F5] hover:bg-[#E4E4E5] border-transparent text-[#3F3F46] font-medium" disabled>
                <Send className="h-4 w-4" /> Enviar selecionados
              </Button>
              <Button className="gap-2 shadow-sm font-medium">
                Programar Remarketing
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Filters Side Sheet */}
      <Sheet open={isFiltersOpen} onOpenChange={setIsFiltersOpen}>
        <SheetContent className="w-full sm:max-w-md bg-white border-l p-0 flex flex-col">
          <SheetHeader className="p-6 border-b border-border/50 text-left">
            <SheetTitle className="font-display text-xl">Filtros</SheetTitle>
            <SheetDescription>Refine a busca pelos seus leads.</SheetDescription>
          </SheetHeader>
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            <div className="space-y-3">
              <Label className="text-foreground font-semibold">Data do contato</Label>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <span className="text-xs text-muted-foreground">De</span>
                  <Input type="date" className="h-9 text-sm text-foreground bg-muted/30" />
                </div>
                <div className="space-y-1.5">
                  <span className="text-xs text-muted-foreground">Até</span>
                  <Input type="date" className="h-9 text-sm text-foreground bg-muted/30" />
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <Label className="text-foreground font-semibold">Dados do lead</Label>
              <Input placeholder="Nome" className="h-9 mb-2 bg-muted/30" />
              <Input placeholder="Telefone" className="h-9 mb-2 bg-muted/30" />
              <Input placeholder="E-mail" className="h-9 bg-muted/30" />
            </div>

            <div className="space-y-3">
              <Label className="text-foreground font-semibold">Integração ERP/CRM</Label>
              <Select>
                <SelectTrigger className="h-9 bg-muted/30">
                  <SelectValue placeholder="Selecione o status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todas">Todas</SelectItem>
                  <SelectItem value="enviado">Enviado com sucesso</SelectItem>
                  <SelectItem value="erro">Erro no envio</SelectItem>
                  <SelectItem value="pendente">Pendente</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-3">
              <Label className="text-foreground font-semibold">Origens (Portais)</Label>
              <div className="space-y-2.5">
                {Object.entries(CHANNEL_LABELS).map(([key, label]) => (
                  <div className="flex items-center space-x-2" key={key}>
                    <Checkbox id={`origem-${key}`} />
                    <label htmlFor={`origem-${key}`} className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                      {label}
                    </label>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <SheetFooter className="p-6 border-t border-border/50 flex-row gap-3 sm:justify-between">
            <Button variant="outline" className="flex-1" onClick={() => setIsFiltersOpen(false)}>Limpar</Button>
            <Button className="flex-1">Aplicar filtros</Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      {/* Summary Dialog */}
      <Dialog open={!!summaryLead} onOpenChange={(open) => !open && setSummaryLead(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Resumo da Conversa</DialogTitle>
            <DialogDescription>
              {summaryLead?.name ? `Lead: ${summaryLead.name}` : `Contato: ${summaryLead?.phone}`}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="p-4 bg-muted/30 rounded-lg text-sm text-foreground">
              <p className="font-medium mb-2 text-primary">Interesse Principal</p>
              <p>{summaryLead?.notes || "A inteligência artificial ainda não gerou um resumo final para este atendimento ou a conversa é muito curta. Verifique a conversa completa para mais detalhes."}</p>
            </div>
            <div className="flex items-center gap-2">
              <Tag className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">{DEPT_LABELS[summaryLead?.departmentCode || ''] || 'Operação não definida'}</span>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSummaryLead(null)}>Fechar</Button>
            <Button onClick={() => summaryLead?.convId && navigate(`/chat/${summaryLead.convId}`)}>Ver Conversa Completa</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
};

export default LeadsPage;
