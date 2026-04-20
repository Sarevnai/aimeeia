// Sprint 6.2 — Contatos do setor administrativo.
// Lista dedicada de inquilinos + proprietários + CRUD completo (criar/editar/importar).

import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useTenant } from '@/contexts/TenantContext';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Loader2,
  Search,
  Phone,
  Mail,
  Home,
  MessageSquare,
  Ticket,
  Plus,
  Pencil,
  Upload,
  Download,
  Trash2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import * as XLSX from 'xlsx';

interface AdminContact {
  id: string;
  name: string | null;
  phone: string;
  email: string | null;
  contact_type: string | null;
  property_unit: string | null;
  crm_neighborhood: string | null;
  tags: string[] | null;
  created_at: string | null;
  ticket_count?: number;
  open_ticket_count?: number;
  last_ticket_at?: string | null;
}

interface ImportRow {
  nome?: string;
  telefone?: string;
  email?: string;
  tipo?: string;
  unidade?: string;
  bairro?: string;
}

type ContactFormState = {
  name: string;
  phone: string;
  email: string;
  contact_type: 'inquilino' | 'proprietario';
  property_unit: string;
  crm_neighborhood: string;
};

const BLANK_FORM: ContactFormState = {
  name: '',
  phone: '',
  email: '',
  contact_type: 'inquilino',
  property_unit: '',
  crm_neighborhood: '',
};

const TYPE_LABEL: Record<string, { label: string; color: string }> = {
  inquilino: { label: 'Inquilino', color: 'bg-blue-100 text-blue-700 border-blue-200' },
  proprietario: { label: 'Proprietário', color: 'bg-purple-100 text-purple-700 border-purple-200' },
};

function normalizePhone(raw: string): string {
  const digits = (raw || '').replace(/\D/g, '');
  return digits;
}

function normalizeType(raw: string | undefined): 'inquilino' | 'proprietario' | null {
  const v = (raw || '').trim().toLowerCase();
  if (v.startsWith('inq')) return 'inquilino';
  if (v.startsWith('prop')) return 'proprietario';
  return null;
}

const ContatosAdminPage: React.FC = () => {
  const { tenantId } = useTenant();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [contacts, setContacts] = useState<AdminContact[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('all');

  // Create/Edit dialog state
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<ContactFormState>(BLANK_FORM);
  const [saving, setSaving] = useState(false);

  // Import dialog state
  const [importOpen, setImportOpen] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importStats, setImportStats] = useState<{ ok: number; skipped: number; errors: string[] } | null>(null);

  const fetchContacts = async () => {
    if (!tenantId) return;
    setLoading(true);

    const { data: contactRows } = await supabase
      .from('contacts')
      .select('id, name, phone, email, contact_type, property_unit, crm_neighborhood, tags, created_at')
      .eq('tenant_id', tenantId)
      .in('contact_type', ['inquilino', 'proprietario'])
      .order('created_at', { ascending: false })
      .limit(1000);

    const rows = (contactRows || []) as AdminContact[];

    if (rows.length > 0) {
      const ids = rows.map((r) => r.id);
      const { data: ticketRows } = await supabase
        .from('tickets')
        .select('contact_id, resolved_at, created_at')
        .eq('tenant_id', tenantId)
        .in('contact_id', ids);

      const byContact: Record<string, { total: number; open: number; last: string | null }> = {};
      (ticketRows || []).forEach((t: any) => {
        if (!t.contact_id) return;
        const row = byContact[t.contact_id] || { total: 0, open: 0, last: null };
        row.total += 1;
        if (!t.resolved_at) row.open += 1;
        if (!row.last || t.created_at > row.last) row.last = t.created_at;
        byContact[t.contact_id] = row;
      });

      rows.forEach((r) => {
        const s = byContact[r.id] || { total: 0, open: 0, last: null };
        r.ticket_count = s.total;
        r.open_ticket_count = s.open;
        r.last_ticket_at = s.last;
      });
    }

    setContacts(rows);
    setLoading(false);
  };

  useEffect(() => {
    fetchContacts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId]);

  const openCreate = () => {
    setEditingId(null);
    setForm(BLANK_FORM);
    setFormOpen(true);
  };

  const openEdit = (c: AdminContact) => {
    setEditingId(c.id);
    setForm({
      name: c.name || '',
      phone: c.phone || '',
      email: c.email || '',
      contact_type: (c.contact_type as any) || 'inquilino',
      property_unit: c.property_unit || '',
      crm_neighborhood: c.crm_neighborhood || '',
    });
    setFormOpen(true);
  };

  const handleSave = async () => {
    if (!tenantId) return;
    const phone = normalizePhone(form.phone);
    if (!phone) {
      toast({ variant: 'destructive', title: 'Telefone obrigatório', description: 'Informe o número de telefone.' });
      return;
    }
    setSaving(true);

    try {
      if (editingId) {
        const { error } = await supabase
          .from('contacts')
          .update({
            name: form.name || null,
            phone,
            email: form.email || null,
            contact_type: form.contact_type,
            property_unit: form.property_unit || null,
            crm_neighborhood: form.crm_neighborhood || null,
          })
          .eq('id', editingId)
          .eq('tenant_id', tenantId);
        if (error) throw error;
        toast({ title: 'Contato atualizado' });
      } else {
        const { error } = await supabase.from('contacts').insert({
          tenant_id: tenantId,
          name: form.name || null,
          phone,
          email: form.email || null,
          contact_type: form.contact_type,
          property_unit: form.property_unit || null,
          crm_neighborhood: form.crm_neighborhood || null,
          channel_source: 'manual',
        });
        if (error) throw error;
        toast({ title: 'Contato criado' });
      }
      setFormOpen(false);
      fetchContacts();
    } catch (err) {
      toast({ variant: 'destructive', title: 'Erro', description: (err as Error).message });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!tenantId) return;
    if (!confirm('Remover este contato? Chamados vinculados NÃO serão removidos, apenas desvinculados.')) return;
    const { error } = await supabase.from('contacts').delete().eq('id', id).eq('tenant_id', tenantId);
    if (error) {
      toast({ variant: 'destructive', title: 'Erro ao remover', description: error.message });
      return;
    }
    toast({ title: 'Contato removido' });
    fetchContacts();
  };

  const downloadTemplate = () => {
    const ws = XLSX.utils.aoa_to_sheet([
      ['nome', 'telefone', 'email', 'tipo', 'unidade', 'bairro'],
      ['João da Silva', '5548999990000', 'joao@exemplo.com', 'inquilino', 'Apto 302', 'Centro'],
      ['Maria Souza', '5548988880000', 'maria@exemplo.com', 'proprietario', 'Rua das Flores 45', 'Trindade'],
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Contatos');
    XLSX.writeFile(wb, 'modelo_contatos_admin.xlsx');
  };

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !tenantId) return;

    setImporting(true);
    setImportStats(null);

    try {
      const buf = await file.arrayBuffer();
      const workbook = XLSX.read(buf, { type: 'array' });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const json = XLSX.utils.sheet_to_json<ImportRow>(sheet, { defval: '' });

      let ok = 0;
      let skipped = 0;
      const errors: string[] = [];

      // Batch upsert 50 por vez
      const batch: any[] = [];
      for (const row of json) {
        const phone = normalizePhone(row.telefone || '');
        const type = normalizeType(row.tipo);
        if (!phone || !type) {
          skipped++;
          continue;
        }
        batch.push({
          tenant_id: tenantId,
          name: (row.nome || '').trim() || null,
          phone,
          email: (row.email || '').trim() || null,
          contact_type: type,
          property_unit: (row.unidade || '').trim() || null,
          crm_neighborhood: (row.bairro || '').trim() || null,
          channel_source: 'import_admin',
        });

        if (batch.length >= 50) {
          const { error } = await supabase
            .from('contacts')
            .upsert(batch, { onConflict: 'tenant_id,phone', ignoreDuplicates: false });
          if (error) errors.push(error.message);
          else ok += batch.length;
          batch.length = 0;
        }
      }
      if (batch.length > 0) {
        const { error } = await supabase
          .from('contacts')
          .upsert(batch, { onConflict: 'tenant_id,phone', ignoreDuplicates: false });
        if (error) errors.push(error.message);
        else ok += batch.length;
      }

      setImportStats({ ok, skipped, errors });
      if (ok > 0) fetchContacts();
    } catch (err) {
      setImportStats({ ok: 0, skipped: 0, errors: [(err as Error).message] });
    } finally {
      setImporting(false);
      e.target.value = '';
    }
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return contacts.filter((c) => {
      if (typeFilter !== 'all' && c.contact_type !== typeFilter) return false;
      if (!q) return true;
      return (
        c.name?.toLowerCase().includes(q) ||
        c.phone?.toLowerCase().includes(q) ||
        c.email?.toLowerCase().includes(q) ||
        c.property_unit?.toLowerCase().includes(q) ||
        c.crm_neighborhood?.toLowerCase().includes(q)
      );
    });
  }, [contacts, search, typeFilter]);

  const counts = useMemo(
    () => ({
      inquilino: contacts.filter((c) => c.contact_type === 'inquilino').length,
      proprietario: contacts.filter((c) => c.contact_type === 'proprietario').length,
    }),
    [contacts],
  );

  return (
    <div className="p-6 space-y-6 max-w-[1400px] mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">Contatos</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Inquilinos e proprietários sob administração.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Dialog open={importOpen} onOpenChange={(o) => { setImportOpen(o); if (!o) setImportStats(null); }}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm">
                <Upload className="h-4 w-4 mr-1.5" /> Importar planilha
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Importar contatos do setor administrativo</DialogTitle>
                <DialogDescription>
                  XLSX ou CSV com colunas: <code>nome, telefone, tipo, email, unidade, bairro</code>. Tipo aceita <code>inquilino</code> ou <code>proprietario</code>. Contatos com telefone existente são atualizados (upsert).
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4">
                <Button variant="outline" size="sm" onClick={downloadTemplate}>
                  <Download className="h-4 w-4 mr-1.5" /> Baixar modelo
                </Button>
                <div>
                  <Label htmlFor="file-upload" className="text-sm font-medium">
                    Arquivo (.xlsx ou .csv)
                  </Label>
                  <Input
                    id="file-upload"
                    type="file"
                    accept=".xlsx,.xls,.csv"
                    onChange={handleImportFile}
                    disabled={importing}
                    className="mt-1"
                  />
                </div>

                {importing && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Processando…
                  </div>
                )}

                {importStats && !importing && (
                  <div className="text-sm border rounded-md p-3 bg-muted/30 space-y-1">
                    <p>✅ Importados/atualizados: <strong>{importStats.ok}</strong></p>
                    <p>⏭️ Ignorados (telefone ou tipo faltando): <strong>{importStats.skipped}</strong></p>
                    {importStats.errors.length > 0 && (
                      <div className="mt-2 text-red-600">
                        <p className="font-semibold">Erros:</p>
                        {importStats.errors.map((e, i) => <p key={i} className="text-xs">· {e}</p>)}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </DialogContent>
          </Dialog>

          <Button size="sm" onClick={openCreate}>
            <Plus className="h-4 w-4 mr-1.5" /> Novo contato
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por nome, telefone, email, unidade..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-[200px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos ({contacts.length})</SelectItem>
            <SelectItem value="inquilino">Inquilinos ({counts.inquilino})</SelectItem>
            <SelectItem value="proprietario">Proprietários ({counts.proprietario})</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* List */}
      {loading ? (
        <div className="flex items-center justify-center h-60">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-sm text-muted-foreground">
              {contacts.length === 0
                ? 'Nenhum inquilino ou proprietário cadastrado. Use "Novo contato" ou "Importar planilha".'
                : 'Nenhum contato encontrado com esses filtros.'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="divide-y">
              {filtered.map((c) => {
                const typeInfo = c.contact_type ? TYPE_LABEL[c.contact_type] : null;
                const initial = (c.name?.[0] || c.phone?.[0] || '?').toUpperCase();
                return (
                  <div
                    key={c.id}
                    className="flex items-center gap-4 p-4 hover:bg-muted/30 transition"
                  >
                    <Avatar className="h-10 w-10 shrink-0">
                      <AvatarFallback className="bg-primary/10 text-primary text-sm font-semibold">
                        {initial}
                      </AvatarFallback>
                    </Avatar>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-sm">{c.name || 'Sem nome'}</span>
                        {typeInfo && (
                          <Badge variant="outline" className={cn('text-[10px]', typeInfo.color)}>
                            {typeInfo.label}
                          </Badge>
                        )}
                        {c.open_ticket_count != null && c.open_ticket_count > 0 && (
                          <Badge variant="secondary" className="text-[10px]">
                            {c.open_ticket_count} chamado{c.open_ticket_count === 1 ? '' : 's'} aberto{c.open_ticket_count === 1 ? '' : 's'}
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-3 mt-1 text-[11px] text-muted-foreground flex-wrap">
                        <span className="flex items-center gap-1">
                          <Phone className="h-3 w-3" /> {c.phone}
                        </span>
                        {c.email && (
                          <span className="flex items-center gap-1">
                            <Mail className="h-3 w-3" /> {c.email}
                          </span>
                        )}
                        {c.property_unit && (
                          <span className="flex items-center gap-1">
                            <Home className="h-3 w-3" /> {c.property_unit}
                          </span>
                        )}
                        {c.crm_neighborhood && <span>{c.crm_neighborhood}</span>}
                      </div>
                    </div>

                    <div className="hidden md:block text-right">
                      <p className="text-[10px] text-muted-foreground uppercase">Chamados</p>
                      <p className="text-sm font-semibold">{c.ticket_count || 0}</p>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <Button
                        variant="ghost"
                        size="icon"
                        title="Ver chamados"
                        onClick={() => navigate(`/chamados?contact_id=${c.id}`)}
                      >
                        <Ticket className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        title="Abrir conversa"
                        onClick={() => navigate(`/inbox?phone=${encodeURIComponent(c.phone)}`)}
                      >
                        <MessageSquare className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        title="Editar"
                        onClick={() => openEdit(c)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        title="Remover"
                        onClick={() => handleDelete(c.id)}
                      >
                        <Trash2 className="h-4 w-4 text-red-500" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Create/Edit dialog */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingId ? 'Editar contato' : 'Novo contato'}</DialogTitle>
            <DialogDescription>
              {editingId ? 'Atualize os dados deste inquilino ou proprietário.' : 'Cadastre um novo inquilino ou proprietário.'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Tipo *</Label>
                <Select
                  value={form.contact_type}
                  onValueChange={(v) => setForm((f) => ({ ...f, contact_type: v as any }))}
                >
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="inquilino">Inquilino</SelectItem>
                    <SelectItem value="proprietario">Proprietário</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Telefone *</Label>
                <Input
                  value={form.phone}
                  onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                  placeholder="5548999990000"
                  className="mt-1"
                />
              </div>
            </div>

            <div>
              <Label className="text-xs">Nome</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                className="mt-1"
              />
            </div>

            <div>
              <Label className="text-xs">E-mail</Label>
              <Input
                type="email"
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                className="mt-1"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Unidade / Endereço</Label>
                <Input
                  value={form.property_unit}
                  onChange={(e) => setForm((f) => ({ ...f, property_unit: e.target.value }))}
                  placeholder="Apto 302"
                  className="mt-1"
                />
              </div>
              <div>
                <Label className="text-xs">Bairro</Label>
                <Input
                  value={form.crm_neighborhood}
                  onChange={(e) => setForm((f) => ({ ...f, crm_neighborhood: e.target.value }))}
                  placeholder="Centro"
                  className="mt-1"
                />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setFormOpen(false)} disabled={saving}>
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
              {editingId ? 'Salvar' : 'Criar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ContatosAdminPage;
