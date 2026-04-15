import React, { useEffect, useState, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useTenant } from '@/contexts/TenantContext';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Archive, Search, ArrowLeft, Loader2, Send, UserCheck, Building2, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';

const PAGE_SIZE = 100;

interface ArchivedLead {
  id: string;
  name: string | null;
  phone: string;
  email: string | null;
  crmStatus: string | null;
  crmArchiveReason: string | null;
  crmPropertyRef: string | null;
  crmNeighborhood: string | null;
  crmSource: string | null;
  crmNatureza: string | null;
  brokerName: string | null;
  assignedBrokerId: string | null;
  updatedAt: string | null;
}

const FollowUpArchivedPage: React.FC = () => {
  const { tenantId } = useTenant();
  const { profile } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [leads, setLeads] = useState<ArchivedLead[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState('');
  const [scope, setScope] = useState<'todos' | 'meus'>('todos');
  const [brokerFilter, setBrokerFilter] = useState<string>('all');
  const [natureza, setNatureza] = useState<string>('all');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [myBrokerId, setMyBrokerId] = useState<string | null>(null);
  const [brokers, setBrokers] = useState<{ id: string; full_name: string }[]>([]);

  const isSuperAdmin = profile?.role === 'super_admin';

  useEffect(() => {
    if (!profile?.id) return;
    supabase.from('brokers').select('id').eq('profile_id', profile.id).maybeSingle()
      .then(({ data }) => setMyBrokerId(data?.id || null));
  }, [profile?.id]);

  useEffect(() => {
    if (!tenantId) return;
    supabase.from('brokers').select('id, full_name').eq('tenant_id', tenantId).eq('active', true).order('full_name')
      .then(({ data }) => setBrokers(data || []));
  }, [tenantId]);

  const fetchLeads = async () => {
    if (!tenantId) return;
    setLoading(true);
    let q = supabase
      .from('contacts')
      .select('id, name, phone, email, crm_status, crm_archive_reason, crm_property_ref, crm_neighborhood, crm_source, crm_natureza, assigned_broker_id, updated_at, broker:brokers!assigned_broker_id(full_name)', { count: 'exact' })
      .eq('tenant_id', tenantId)
      .eq('crm_status', 'Arquivado')
      .order('updated_at', { ascending: false })
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

    if (scope === 'meus' && myBrokerId) q = q.eq('assigned_broker_id', myBrokerId);
    if (scope === 'todos' && brokerFilter !== 'all') q = q.eq('assigned_broker_id', brokerFilter);
    if (natureza !== 'all') q = q.eq('crm_natureza', natureza);
    if (search.trim()) q = q.or(`name.ilike.%${search}%,phone.ilike.%${search}%`);

    const { data, count } = await q;
    setTotal(count || 0);
    setLeads((data || []).map((c: any) => ({
      id: c.id,
      name: c.name,
      phone: c.phone,
      email: c.email,
      crmStatus: c.crm_status,
      crmArchiveReason: c.crm_archive_reason,
      crmPropertyRef: c.crm_property_ref,
      crmNeighborhood: c.crm_neighborhood,
      crmSource: c.crm_source,
      crmNatureza: c.crm_natureza,
      brokerName: c.broker?.full_name ?? null,
      assignedBrokerId: c.assigned_broker_id,
      updatedAt: c.updated_at,
    })));
    setLoading(false);
  };

  useEffect(() => { setPage(0); }, [scope, brokerFilter, natureza, search, myBrokerId]);
  useEffect(() => { fetchLeads(); }, [tenantId, scope, brokerFilter, natureza, search, page, myBrokerId]);

  const allSelected = leads.length > 0 && leads.every((l) => selected.has(l.id));
  const toggleAll = () => {
    if (allSelected) setSelected(new Set()); else setSelected(new Set([...selected, ...leads.map((l) => l.id)]));
  };
  const toggleOne = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelected(next);
  };

  const handleCreateCampaign = () => {
    if (selected.size === 0) {
      toast({ title: 'Selecione ao menos 1 lead', variant: 'destructive' });
      return;
    }
    // Navigate to campaigns with pre-selected IDs via session storage
    sessionStorage.setItem('followup_archived_ids', JSON.stringify(Array.from(selected)));
    navigate('/campanhas?followup=1');
    toast({ title: `${selected.size} leads selecionados para a campanha` });
  };

  const formatDate = (d: string | null) => d ? new Date(d).toLocaleDateString('pt-BR') : '—';

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] bg-[#FAFAFA]">
      {/* Header */}
      <div className="px-6 py-5 border-b border-border bg-white shadow-sm">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate('/pipeline')}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              <h2 className="font-display text-2xl font-bold text-foreground tracking-tight flex items-center gap-2">
                <Archive className="h-5 w-5 text-muted-foreground" />
                Follow-up de Arquivados
              </h2>
              <p className="text-sm text-muted-foreground mt-0.5">Leads arquivados no C2S disponíveis para campanha de reativação</p>
            </div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="px-6 py-4 border-b border-border/60 bg-white flex flex-wrap items-center gap-3">
        <Tabs value={scope} onValueChange={(v) => setScope(v as 'todos' | 'meus')}>
          <TabsList>
            <TabsTrigger value="todos">Todos{isSuperAdmin ? '' : ' do time'}</TabsTrigger>
            <TabsTrigger value="meus" disabled={!myBrokerId}>Meus arquivados</TabsTrigger>
          </TabsList>
        </Tabs>

        {scope === 'todos' && (
          <Select value={brokerFilter} onValueChange={setBrokerFilter}>
            <SelectTrigger className="w-52 h-9"><SelectValue placeholder="Todos os corretores" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os corretores</SelectItem>
              {brokers.map((b) => <SelectItem key={b.id} value={b.id}>{b.full_name}</SelectItem>)}
            </SelectContent>
          </Select>
        )}

        <Select value={natureza} onValueChange={setNatureza}>
          <SelectTrigger className="w-40 h-9"><SelectValue placeholder="Natureza" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas as naturezas</SelectItem>
            <SelectItem value="Compra">Compra</SelectItem>
            <SelectItem value="Venda">Venda</SelectItem>
            <SelectItem value="Aluguel">Aluguel</SelectItem>
            <SelectItem value="Locação">Locação</SelectItem>
            <SelectItem value="Temporada">Temporada</SelectItem>
          </SelectContent>
        </Select>

        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar por nome ou telefone" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 h-9" />
        </div>

        <div className="ml-auto flex items-center gap-2">
          <Badge variant="secondary" className="h-7">{total} leads</Badge>
          <Badge variant="outline" className="h-7">{selected.size} selecionado{selected.size !== 1 ? 's' : ''}</Badge>
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto px-6 py-4">
        <Card className="overflow-hidden">
          {loading ? (
            <div className="p-6 space-y-3">
              {[1, 2, 3, 4, 5].map((i) => <div key={i} className="skeleton h-12 w-full" />)}
            </div>
          ) : leads.length === 0 ? (
            <div className="p-12 text-center">
              <Archive className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">Nenhum lead arquivado nos filtros atuais</p>
            </div>
          ) : (
            <Table>
              <TableHeader className="bg-muted/40">
                <TableRow>
                  <TableHead className="w-12"><Checkbox checked={allSelected} onCheckedChange={toggleAll} /></TableHead>
                  <TableHead>Lead</TableHead>
                  <TableHead>Telefone</TableHead>
                  <TableHead>Corretor</TableHead>
                  <TableHead>Imóvel/Bairro</TableHead>
                  <TableHead>Origem</TableHead>
                  <TableHead>Natureza</TableHead>
                  <TableHead>Motivo</TableHead>
                  <TableHead>Arquivado em</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {leads.map((lead) => (
                  <TableRow key={lead.id} className={cn('hover:bg-muted/30', selected.has(lead.id) && 'bg-primary/5')}>
                    <TableCell><Checkbox checked={selected.has(lead.id)} onCheckedChange={() => toggleOne(lead.id)} /></TableCell>
                    <TableCell className="font-medium">{lead.name || '—'}</TableCell>
                    <TableCell className="font-mono text-xs">{lead.phone}</TableCell>
                    <TableCell>
                      {lead.brokerName ? (
                        <div className="flex items-center gap-1.5"><UserCheck className="h-3 w-3 text-accent" /><span className="text-xs">{lead.brokerName}</span></div>
                      ) : <span className="text-xs text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell className="max-w-[220px]">
                      {lead.crmPropertyRef && <p className="text-xs truncate flex items-center gap-1"><Building2 className="h-3 w-3 text-muted-foreground shrink-0" />{lead.crmPropertyRef}</p>}
                      {lead.crmNeighborhood && <p className="text-[11px] text-muted-foreground">{lead.crmNeighborhood}</p>}
                    </TableCell>
                    <TableCell>{lead.crmSource ? <Badge variant="secondary" className="text-[10px] font-normal">{lead.crmSource}</Badge> : '—'}</TableCell>
                    <TableCell>{lead.crmNatureza || '—'}</TableCell>
                    <TableCell className="max-w-[180px] text-xs truncate">{lead.crmArchiveReason || '—'}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{formatDate(lead.updatedAt)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Card>

        {/* Pagination */}
        {total > PAGE_SIZE && (
          <div className="flex items-center justify-between mt-4">
            <span className="text-sm text-muted-foreground">Página {page + 1} de {Math.ceil(total / PAGE_SIZE)}</span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(p => p - 1)}>Anterior</Button>
              <Button variant="outline" size="sm" disabled={(page + 1) * PAGE_SIZE >= total} onClick={() => setPage(p => p + 1)}>Próxima</Button>
            </div>
          </div>
        )}
      </div>

      {/* Sticky footer bar when selection exists */}
      {selected.size > 0 && (
        <div className="border-t border-border bg-white shadow-[0_-4px_20px_-10px_rgba(0,0,0,0.1)] px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm">
            <Sparkles className="h-4 w-4 text-accent" />
            <span className="font-medium">{selected.size} leads selecionados para campanha de reativação</span>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setSelected(new Set())}>Limpar seleção</Button>
            <Button size="sm" className="gap-1.5" onClick={handleCreateCampaign}>
              <Send className="h-4 w-4" /> Criar campanha follow-up
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};

export default FollowUpArchivedPage;
