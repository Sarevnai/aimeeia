import React, { useEffect, useState, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useTenant } from '@/contexts/TenantContext';
import { useDepartmentFilter } from '@/contexts/DepartmentFilterContext';
import { useNavigate } from 'react-router-dom';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Search, Loader2, ChevronLeft, ChevronRight, Phone, User, MessageSquare, Tag } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Tables } from '@/integrations/supabase/types';

type Contact = Tables<'contacts'>;

const DEPT_LABELS: Record<string, string> = {
  locacao: 'Locação',
  vendas: 'Vendas',
  administrativo: 'Admin',
};

const DEPT_COLORS: Record<string, string> = {
  locacao: 'bg-info text-info-foreground',
  vendas: 'bg-success text-success-foreground',
  administrativo: 'bg-warning text-warning-foreground',
};

const PAGE_SIZE = 50;

const LeadsPage: React.FC = () => {
  const { tenantId } = useTenant();
  const { department } = useDepartmentFilter();
  const navigate = useNavigate();

  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [selected, setSelected] = useState<Contact | null>(null);
  const [convId, setConvId] = useState<string | null>(null);

  const fetchContacts = async () => {
    if (!tenantId) return;
    setLoading(true);

    let query = supabase
      .from('contacts')
      .select('*', { count: 'exact' })
      .eq('tenant_id', tenantId)
      .order('updated_at', { ascending: false })
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

    if (department !== 'all') {
      query = query.eq('department_code', department);
    }
    if (statusFilter !== 'all') {
      query = query.eq('status', statusFilter);
    }
    if (search.trim()) {
      query = query.or(`name.ilike.%${search}%,phone.ilike.%${search}%`);
    }

    const { data, count } = await query;
    setContacts(data ?? []);
    setTotal(count ?? 0);
    setLoading(false);
  };

  useEffect(() => {
    setPage(0);
  }, [department, statusFilter, search]);

  useEffect(() => {
    fetchContacts();
  }, [tenantId, department, statusFilter, search, page]);

  const openDrawer = async (contact: Contact) => {
    setSelected(contact);
    // Find conversation for this contact
    if (tenantId) {
      const { data } = await supabase
        .from('conversations')
        .select('id')
        .eq('tenant_id', tenantId)
        .eq('contact_id', contact.id)
        .order('last_message_at', { ascending: false })
        .limit(1)
        .single();
      setConvId(data?.id ?? null);
    }
  };

  const totalPages = Math.ceil(total / PAGE_SIZE);

  const formatDate = (d: string | null) => {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' });
  };

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)]">
      {/* Header */}
      <div className="p-4 border-b border-border bg-card space-y-3">
        <h2 className="font-display text-xl font-bold text-foreground">Contatos</h2>
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por nome ou telefone..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 h-9"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-full sm:w-36 h-9">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="ativo">Ativo</SelectItem>
              <SelectItem value="inativo">Inativo</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        {loading ? (
          <div className="flex items-center justify-center h-40">
            <Loader2 className="h-6 w-6 animate-spin text-accent" />
          </div>
        ) : contacts.length === 0 ? (
          <div className="flex items-center justify-center h-40 text-sm text-muted-foreground">
            Nenhum contato encontrado
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Telefone</TableHead>
                <TableHead className="hidden md:table-cell">Departamento</TableHead>
                <TableHead className="hidden sm:table-cell">Status</TableHead>
                <TableHead className="hidden md:table-cell">Última Atividade</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {contacts.map((c) => (
                <TableRow
                  key={c.id}
                  className="cursor-pointer hover:bg-muted/50 transition-colors"
                  onClick={() => openDrawer(c)}
                >
                  <TableCell className="font-medium text-foreground">{c.name || '—'}</TableCell>
                  <TableCell className="text-muted-foreground text-sm">{c.phone}</TableCell>
                  <TableCell className="hidden md:table-cell">
                    {c.department_code ? (
                      <Badge className={cn('text-[10px]', DEPT_COLORS[c.department_code] || '')}>
                        {DEPT_LABELS[c.department_code] || c.department_code}
                      </Badge>
                    ) : (
                      '—'
                    )}
                  </TableCell>
                  <TableCell className="hidden sm:table-cell">
                    <Badge variant={c.status === 'ativo' ? 'default' : 'secondary'} className="text-[10px]">
                      {c.status || '—'}
                    </Badge>
                  </TableCell>
                  <TableCell className="hidden md:table-cell text-sm text-muted-foreground">
                    {formatDate(c.updated_at)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between px-4 py-3 border-t border-border bg-card text-sm">
          <span className="text-muted-foreground">
            {total} contato{total !== 1 ? 's' : ''}
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
                {selected.department_code && (
                  <DetailRow
                    icon={<Tag className="h-4 w-4" />}
                    label="Departamento"
                    value={DEPT_LABELS[selected.department_code] || selected.department_code}
                  />
                )}
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
                {convId && (
                  <Button className="w-full mt-4" onClick={() => navigate(`/chat/${convId}`)}>
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
