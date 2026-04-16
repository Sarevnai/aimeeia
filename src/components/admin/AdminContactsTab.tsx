import React, { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import {
    Search, Plus, Upload, Loader2, UserPlus, Pencil, Trash2,
    Phone, Mail, User, FileSpreadsheet, CheckCircle, AlertCircle,
    ChevronLeft, ChevronRight, Download,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import * as XLSX from 'xlsx';

/* ─── Types ─── */
interface Contact {
    id: string;
    name: string | null;
    phone: string;
    email: string | null;
    cpf_cnpj: string | null;
    status: string | null;
    contact_type: string | null;
    department_code: string | null;
    tags: string[] | null;
    notes: string | null;
    channel_source: string | null;
    created_at: string | null;
    tenant_id: string;
    crm_status: string | null;
    crm_archive_reason: string | null;
}

interface ContactForm {
    name: string;
    phone: string;
    email: string;
    cpf_cnpj: string;
    department_code: string;
    contact_type: string;
    notes: string;
    tags: string;
}

interface ImportRow {
    nome?: string;
    name?: string;
    telefone?: string;
    phone?: string;
    celular?: string;
    email?: string;
    cpf?: string;
    cpf_cnpj?: string;
    departamento?: string;
    department?: string;
    tipo?: string;
    type?: string;
    observacoes?: string;
    notes?: string;
}

interface Props {
    tenantId: string;
}

const emptyForm: ContactForm = {
    name: '',
    phone: '',
    email: '',
    cpf_cnpj: '',
    department_code: '',
    contact_type: '',
    notes: '',
    tags: '',
};

const PAGE_SIZE = 25;

/* Valores possíveis de crm_status (origem: C2S). "sem_status" = NULL no DB. */
const STATUS_OPTIONS = [
    { value: 'all', label: 'Todos os status' },
    { value: 'Novo', label: 'Novo' },
    { value: 'Em negociação', label: 'Em negociação' },
    { value: 'Negócio fechado', label: 'Negócio fechado' },
    { value: 'Arquivado', label: 'Arquivado' },
    { value: 'sem_status', label: 'Sem status' },
] as const;

const statusBadgeClass = (status: string | null): string => {
    switch (status) {
        case 'Novo':
            return 'bg-blue-500/10 text-blue-600 border-blue-500/20';
        case 'Em negociação':
            return 'bg-amber-500/10 text-amber-700 border-amber-500/20';
        case 'Negócio fechado':
            return 'bg-emerald-500/10 text-emerald-700 border-emerald-500/20';
        case 'Arquivado':
            return 'bg-muted text-muted-foreground border-border';
        default:
            return 'bg-muted/50 text-muted-foreground border-border';
    }
};

/* ─── Helper: normalize phone ─── */
const normalizePhone = (raw: string): string => {
    const digits = raw.replace(/\D/g, '');
    if (digits.length >= 10 && !digits.startsWith('55')) return '55' + digits;
    return digits;
};

/* ─── Helper: normalize contact_type ─── */
/* DB check constraint allows only: lead | proprietario | inquilino (or null). */
/* Map common CRM variations (accents, synonyms) to canonical values. */
const normalizeContactType = (raw: unknown): 'lead' | 'proprietario' | 'inquilino' => {
    if (typeof raw !== 'string') return 'lead';
    const s = raw.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    if (!s) return 'lead';
    if (s.startsWith('proprietari') || s === 'dono' || s === 'dona') return 'proprietario';
    if (s.startsWith('inquilin') || s.startsWith('locatari')) return 'inquilino';
    return 'lead';
};

/* ─── Main Component ─── */
const AdminContactsTab: React.FC<Props> = ({ tenantId }) => {
    const { toast } = useToast();

    // List state
    const [contacts, setContacts] = useState<Contact[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState<string>('all');
    const [page, setPage] = useState(0);
    const [total, setTotal] = useState(0);

    // Dialog states
    const [formOpen, setFormOpen] = useState(false);
    const [editingContact, setEditingContact] = useState<Contact | null>(null);
    const [form, setForm] = useState<ContactForm>(emptyForm);
    const [saving, setSaving] = useState(false);

    // Import sheet
    const [importOpen, setImportOpen] = useState(false);
    const [importData, setImportData] = useState<ImportRow[]>([]);
    const [importFileName, setImportFileName] = useState('');
    const [importing, setImporting] = useState(false);
    const [importResult, setImportResult] = useState<{ inserted: number; skipped: number; errors: string[] } | null>(null);

    // Delete
    const [deleteId, setDeleteId] = useState<string | null>(null);
    const [deleting, setDeleting] = useState(false);

    /* ── Fetch contacts ── */
    const fetchContacts = useCallback(async () => {
        setLoading(true);
        const from = page * PAGE_SIZE;
        const to = from + PAGE_SIZE - 1;

        let query = supabase
            .from('contacts')
            .select('*', { count: 'exact' })
            .eq('tenant_id', tenantId)
            .order('created_at', { ascending: false })
            .range(from, to);

        if (search.trim()) {
            query = query.or(`name.ilike.%${search.trim()}%,phone.ilike.%${search.trim()}%,email.ilike.%${search.trim()}%`);
        }

        if (statusFilter === 'sem_status') {
            query = query.is('crm_status', null);
        } else if (statusFilter !== 'all') {
            query = query.eq('crm_status', statusFilter);
        }

        const { data, count, error } = await query;
        if (error) {
            toast({ title: 'Erro ao carregar contatos', description: error.message, variant: 'destructive' });
        }
        setContacts((data as Contact[]) ?? []);
        setTotal(count ?? 0);
        setLoading(false);
    }, [tenantId, page, search, statusFilter, toast]);

    useEffect(() => { fetchContacts(); }, [fetchContacts]);

    /* ── Form handlers ── */
    const openCreate = () => {
        setEditingContact(null);
        setForm(emptyForm);
        setFormOpen(true);
    };

    const openEdit = (c: Contact) => {
        setEditingContact(c);
        setForm({
            name: c.name || '',
            phone: c.phone || '',
            email: c.email || '',
            cpf_cnpj: c.cpf_cnpj || '',
            department_code: c.department_code || '',
            contact_type: c.contact_type || '',
            notes: c.notes || '',
            tags: (c.tags || []).join(', '),
        });
        setFormOpen(true);
    };

    const handleSave = async () => {
        if (!form.phone.trim()) {
            toast({ title: 'Telefone obrigatorio', variant: 'destructive' });
            return;
        }

        setSaving(true);
        const phone = normalizePhone(form.phone);
        const tags = form.tags
            .split(',')
            .map((t) => t.trim())
            .filter(Boolean);

        const payload = {
            tenant_id: tenantId,
            name: form.name.trim() || null,
            phone,
            email: form.email.trim() || null,
            cpf_cnpj: form.cpf_cnpj.trim() || null,
            department_code: (form.department_code || null) as any,
            contact_type: normalizeContactType(form.contact_type),
            notes: form.notes.trim() || null,
            tags: tags.length > 0 ? tags : null,
        };

        if (editingContact) {
            const { error } = await supabase
                .from('contacts')
                .update(payload)
                .eq('id', editingContact.id);
            if (error) {
                toast({ title: 'Erro ao atualizar', description: error.message, variant: 'destructive' });
            } else {
                toast({ title: 'Contato atualizado!' });
                setFormOpen(false);
                fetchContacts();
            }
        } else {
            const { error } = await supabase.from('contacts').insert(payload);
            if (error) {
                if (error.code === '23505') {
                    toast({ title: 'Telefone ja cadastrado', description: 'Ja existe um contato com esse numero neste tenant.', variant: 'destructive' });
                } else {
                    toast({ title: 'Erro ao criar', description: error.message, variant: 'destructive' });
                }
            } else {
                toast({ title: 'Contato criado!' });
                setFormOpen(false);
                setPage(0);
                fetchContacts();
            }
        }
        setSaving(false);
    };

    /* ── Delete ── */
    const handleDelete = async () => {
        if (!deleteId) return;
        setDeleting(true);
        const { error } = await supabase.from('contacts').delete().eq('id', deleteId);
        if (error) {
            toast({ title: 'Erro ao excluir', description: error.message, variant: 'destructive' });
        } else {
            toast({ title: 'Contato removido' });
            fetchContacts();
        }
        setDeleteId(null);
        setDeleting(false);
    };

    /* ── XLSX Import ── */
    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setImportFileName(file.name);
        setImportResult(null);

        const reader = new FileReader();
        reader.onload = (evt) => {
            try {
                const data = new Uint8Array(evt.target?.result as ArrayBuffer);
                const workbook = XLSX.read(data, { type: 'array' });
                const sheet = workbook.Sheets[workbook.SheetNames[0]];
                const json = XLSX.utils.sheet_to_json<ImportRow>(sheet, { defval: '' });
                setImportData(json);
            } catch {
                toast({ title: 'Erro ao ler arquivo', description: 'Verifique se o formato e .xlsx ou .csv.', variant: 'destructive' });
                setImportData([]);
            }
        };
        reader.readAsArrayBuffer(file);
    };

    const processImport = async () => {
        if (importData.length === 0) return;
        setImporting(true);

        const inserted: number[] = [];
        const skipped: string[] = [];
        const errors: string[] = [];

        // Build batch
        const rows = importData.map((row, idx) => {
            const rawPhone =
                String(row.telefone || row.phone || row.celular || '').trim();
            const phone = normalizePhone(rawPhone);
            if (!phone || phone.length < 10) {
                skipped.push(`Linha ${idx + 2}: telefone invalido "${rawPhone}"`);
                return null;
            }
            return {
                tenant_id: tenantId,
                name: String(row.nome || row.name || '').trim() || null,
                phone,
                email: String(row.email || '').trim() || null,
                cpf_cnpj: String(row.cpf || row.cpf_cnpj || '').trim() || null,
                department_code: mapDepartment(String(row.departamento || row.department || '').trim()),
                contact_type: normalizeContactType(row.tipo ?? row.type),
                notes: String(row.observacoes || row.notes || '').trim() || null,
            };
        }).filter(Boolean);

        if (rows.length === 0) {
            toast({ title: 'Nenhum contato valido na planilha', variant: 'destructive' });
            setImporting(false);
            return;
        }

        // Upsert in batches of 50
        const BATCH = 50;
        let insertedCount = 0;
        for (let i = 0; i < rows.length; i += BATCH) {
            const batch = rows.slice(i, i + BATCH);
            const { error, data } = await supabase
                .from('contacts')
                .upsert(batch as any[], { onConflict: 'phone,tenant_id', ignoreDuplicates: false })
                .select('id');
            if (error) {
                errors.push(`Batch ${Math.floor(i / BATCH) + 1}: ${error.message}`);
            } else {
                insertedCount += data?.length || 0;
            }
        }

        setImportResult({ inserted: insertedCount, skipped: skipped.length, errors });
        toast({
            title: `Importacao concluida`,
            description: `${insertedCount} contatos importados, ${skipped.length} ignorados.`,
        });
        setImporting(false);
        fetchContacts();
    };

    const downloadTemplate = () => {
        const ws = XLSX.utils.aoa_to_sheet([
            ['nome', 'telefone', 'email', 'cpf', 'departamento', 'tipo', 'observacoes'],
            ['Joao Silva', '11999887766', 'joao@email.com', '123.456.789-00', 'vendas', 'lead', 'Interessado em apto 2q'],
        ]);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Contatos');
        XLSX.writeFile(wb, 'modelo_contatos.xlsx');
    };

    const totalPages = Math.ceil(total / PAGE_SIZE);

    return (
        <div className="space-y-4 max-w-5xl mx-auto animate-fade-in">
            {/* Header */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div>
                    <h3 className="text-base font-semibold text-foreground">Contatos do Tenant</h3>
                    <p className="text-xs text-muted-foreground mt-0.5">
                        {total} contato{total !== 1 ? 's' : ''} cadastrado{total !== 1 ? 's' : ''}
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <Button size="sm" variant="outline" className="gap-1.5" onClick={() => { setImportData([]); setImportFileName(''); setImportResult(null); setImportOpen(true); }}>
                        <Upload className="h-4 w-4" /> Importar Planilha
                    </Button>
                    <Button size="sm" className="gap-1.5" onClick={openCreate}>
                        <UserPlus className="h-4 w-4" /> Novo Contato
                    </Button>
                </div>
            </div>

            {/* Search + Status filter */}
            <div className="flex flex-col sm:flex-row gap-2">
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                        placeholder="Buscar por nome, telefone ou email..."
                        value={search}
                        onChange={(e) => { setSearch(e.target.value); setPage(0); }}
                        className="pl-9 bg-muted/40"
                    />
                </div>
                <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(0); }}>
                    <SelectTrigger className="sm:w-[200px] bg-muted/40">
                        <SelectValue placeholder="Status do lead" />
                    </SelectTrigger>
                    <SelectContent>
                        {STATUS_OPTIONS.map((opt) => (
                            <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>

            {/* Contacts list */}
            {loading ? (
                <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin" /></div>
            ) : contacts.length === 0 ? (
                <div className="flex flex-col items-center py-16 text-center">
                    <User className="h-10 w-10 text-muted-foreground/30 mb-3" />
                    <p className="text-sm text-muted-foreground">
                        {search ? 'Nenhum contato encontrado para essa busca.' : 'Nenhum contato cadastrado.'}
                    </p>
                    <div className="flex gap-2 mt-4">
                        <Button size="sm" variant="outline" onClick={() => { setImportData([]); setImportFileName(''); setImportResult(null); setImportOpen(true); }}>
                            <Upload className="h-4 w-4 mr-1.5" /> Importar Planilha
                        </Button>
                        <Button size="sm" onClick={openCreate}>
                            <UserPlus className="h-4 w-4 mr-1.5" /> Novo Contato
                        </Button>
                    </div>
                </div>
            ) : (
                <>
                    <div className="space-y-2">
                        {contacts.map((c) => (
                            <div
                                key={c.id}
                                className="flex items-center gap-3 rounded-xl bg-card border border-border p-4 shadow-sm hover:border-primary/30 transition-colors"
                            >
                                {/* Avatar */}
                                <div className="w-9 h-9 rounded-full bg-primary/10 text-primary flex items-center justify-center text-sm font-bold shrink-0">
                                    {(c.name || c.phone).charAt(0).toUpperCase()}
                                </div>

                                {/* Info */}
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm font-semibold text-foreground truncate">
                                        {c.name || 'Sem nome'}
                                    </p>
                                    <div className="flex items-center gap-3 mt-0.5">
                                        <span className="flex items-center gap-1 text-xs text-muted-foreground">
                                            <Phone className="h-3 w-3" /> {c.phone}
                                        </span>
                                        {c.email && (
                                            <span className="flex items-center gap-1 text-xs text-muted-foreground">
                                                <Mail className="h-3 w-3" /> {c.email}
                                            </span>
                                        )}
                                    </div>
                                </div>

                                {/* Tags */}
                                <div className="hidden sm:flex items-center gap-1">
                                    <Badge
                                        variant="outline"
                                        className={cn('text-[10px] font-medium', statusBadgeClass(c.crm_status))}
                                        title={c.crm_archive_reason ? `Motivo: ${c.crm_archive_reason}` : undefined}
                                    >
                                        {c.crm_status || 'Sem status'}
                                    </Badge>
                                    {c.department_code && (
                                        <Badge variant="outline" className="text-[10px]">{c.department_code}</Badge>
                                    )}
                                    {c.contact_type && (
                                        <Badge variant="secondary" className="text-[10px]">{c.contact_type}</Badge>
                                    )}
                                </div>

                                {/* Date */}
                                <span className="text-[11px] text-muted-foreground hidden md:inline">
                                    {c.created_at ? new Date(c.created_at).toLocaleDateString('pt-BR') : '—'}
                                </span>

                                {/* Actions */}
                                <button
                                    onClick={() => openEdit(c)}
                                    className="p-1.5 rounded text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
                                    title="Editar"
                                >
                                    <Pencil className="h-4 w-4" />
                                </button>
                                <button
                                    onClick={() => setDeleteId(c.id)}
                                    className="p-1.5 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                                    title="Excluir"
                                >
                                    <Trash2 className="h-4 w-4" />
                                </button>
                            </div>
                        ))}
                    </div>

                    {/* Pagination */}
                    {totalPages > 1 && (
                        <div className="flex items-center justify-between pt-2">
                            <p className="text-xs text-muted-foreground">
                                Pagina {page + 1} de {totalPages} ({total} contatos)
                            </p>
                            <div className="flex gap-1">
                                <Button size="sm" variant="outline" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
                                    <ChevronLeft className="h-4 w-4" />
                                </Button>
                                <Button size="sm" variant="outline" disabled={page >= totalPages - 1} onClick={() => setPage((p) => p + 1)}>
                                    <ChevronRight className="h-4 w-4" />
                                </Button>
                            </div>
                        </div>
                    )}
                </>
            )}

            {/* ═══ Dialog: Create / Edit Contact ═══ */}
            <Dialog open={formOpen} onOpenChange={setFormOpen}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <UserPlus className="h-5 w-5 text-primary" />
                            {editingContact ? 'Editar Contato' : 'Novo Contato'}
                        </DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 py-2">
                        <div className="grid grid-cols-2 gap-3">
                            <div className="col-span-2 space-y-1.5">
                                <Label>Nome</Label>
                                <Input
                                    placeholder="Nome completo"
                                    value={form.name}
                                    onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                                />
                            </div>
                            <div className="space-y-1.5">
                                <Label>Telefone *</Label>
                                <Input
                                    placeholder="11999887766"
                                    value={form.phone}
                                    onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                                />
                            </div>
                            <div className="space-y-1.5">
                                <Label>Email</Label>
                                <Input
                                    type="email"
                                    placeholder="email@empresa.com"
                                    value={form.email}
                                    onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                                />
                            </div>
                            <div className="space-y-1.5">
                                <Label>CPF/CNPJ</Label>
                                <Input
                                    placeholder="000.000.000-00"
                                    value={form.cpf_cnpj}
                                    onChange={(e) => setForm((f) => ({ ...f, cpf_cnpj: e.target.value }))}
                                />
                            </div>
                            <div className="space-y-1.5">
                                <Label>Departamento</Label>
                                <Select value={form.department_code} onValueChange={(v) => setForm((f) => ({ ...f, department_code: v }))}>
                                    <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="vendas">Vendas</SelectItem>
                                        <SelectItem value="locacao">Locacao</SelectItem>
                                        <SelectItem value="administrativo">Administrativo</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="col-span-2 space-y-1.5">
                                <Label>Tipo de contato</Label>
                                <Select
                                    value={form.contact_type || 'lead'}
                                    onValueChange={(v) => setForm((f) => ({ ...f, contact_type: v }))}
                                >
                                    <SelectTrigger><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="lead">Lead</SelectItem>
                                        <SelectItem value="proprietario">Proprietário</SelectItem>
                                        <SelectItem value="inquilino">Inquilino</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="col-span-2 space-y-1.5">
                                <Label>Tags (separadas por virgula)</Label>
                                <Input
                                    placeholder="vip, remarketing, campanha-marco"
                                    value={form.tags}
                                    onChange={(e) => setForm((f) => ({ ...f, tags: e.target.value }))}
                                />
                            </div>
                            <div className="col-span-2 space-y-1.5">
                                <Label>Observacoes</Label>
                                <Textarea
                                    placeholder="Notas sobre o contato..."
                                    value={form.notes}
                                    onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                                    rows={3}
                                    className="resize-none"
                                />
                            </div>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setFormOpen(false)} disabled={saving}>
                            Cancelar
                        </Button>
                        <Button onClick={handleSave} disabled={saving || !form.phone.trim()}>
                            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : editingContact ? 'Salvar' : 'Criar Contato'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* ═══ Delete Confirm ═══ */}
            <Dialog open={!!deleteId} onOpenChange={(o) => { if (!o) setDeleteId(null); }}>
                <DialogContent className="sm:max-w-sm">
                    <DialogHeader>
                        <DialogTitle>Excluir Contato</DialogTitle>
                    </DialogHeader>
                    <p className="text-sm text-muted-foreground py-2">
                        Tem certeza que deseja excluir este contato? Esta acao nao pode ser desfeita.
                    </p>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setDeleteId(null)} disabled={deleting}>Cancelar</Button>
                        <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
                            {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Excluir'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* ═══ Import Sheet ═══ */}
            <Sheet open={importOpen} onOpenChange={setImportOpen}>
                <SheetContent side="right" className="w-full sm:max-w-xl p-0 flex flex-col">
                    <SheetHeader className="px-6 pt-6 pb-4 border-b border-border">
                        <SheetTitle className="font-display flex items-center gap-2">
                            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                                <FileSpreadsheet className="h-4 w-4 text-primary" />
                            </div>
                            Importar Planilha de Contatos
                        </SheetTitle>
                    </SheetHeader>

                    <div className="flex-1 overflow-auto px-6 py-6 space-y-5">
                        {/* Upload area */}
                        <div className="space-y-3">
                            <div className="flex items-center justify-between">
                                <Label className="text-sm font-semibold">Arquivo (.xlsx ou .csv)</Label>
                                <Button size="sm" variant="ghost" className="gap-1 text-xs h-7" onClick={downloadTemplate}>
                                    <Download className="h-3 w-3" /> Baixar Modelo
                                </Button>
                            </div>
                            <label
                                className={cn(
                                    'flex flex-col items-center justify-center rounded-xl border-2 border-dashed p-8 cursor-pointer transition-colors',
                                    importFileName ? 'border-primary/40 bg-primary/5' : 'border-border hover:border-primary/30 hover:bg-muted/30'
                                )}
                            >
                                <input
                                    type="file"
                                    accept=".xlsx,.xls,.csv"
                                    onChange={handleFileChange}
                                    className="hidden"
                                />
                                {importFileName ? (
                                    <>
                                        <CheckCircle className="h-8 w-8 text-primary mb-2" />
                                        <p className="text-sm font-medium text-foreground">{importFileName}</p>
                                        <p className="text-xs text-muted-foreground mt-1">{importData.length} linha{importData.length !== 1 ? 's' : ''} encontrada{importData.length !== 1 ? 's' : ''}</p>
                                    </>
                                ) : (
                                    <>
                                        <Upload className="h-8 w-8 text-muted-foreground mb-2" />
                                        <p className="text-sm text-muted-foreground">Clique para selecionar ou arraste o arquivo</p>
                                        <p className="text-xs text-muted-foreground mt-1">Suporta .xlsx, .xls e .csv</p>
                                    </>
                                )}
                            </label>
                        </div>

                        {/* Column mapping info */}
                        <div className="bg-muted/30 border border-border rounded-xl p-4 space-y-2">
                            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Colunas Aceitas</p>
                            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                                <div><span className="font-mono font-medium">nome</span> / <span className="font-mono font-medium">name</span></div>
                                <div className="text-muted-foreground">Nome do contato</div>
                                <div><span className="font-mono font-medium">telefone</span> / <span className="font-mono font-medium">phone</span> / <span className="font-mono font-medium">celular</span></div>
                                <div className="text-muted-foreground">Numero (obrigatorio)</div>
                                <div><span className="font-mono font-medium">email</span></div>
                                <div className="text-muted-foreground">Email</div>
                                <div><span className="font-mono font-medium">cpf</span> / <span className="font-mono font-medium">cpf_cnpj</span></div>
                                <div className="text-muted-foreground">Documento</div>
                                <div><span className="font-mono font-medium">departamento</span></div>
                                <div className="text-muted-foreground">vendas, locacao, administrativo</div>
                                <div><span className="font-mono font-medium">tipo</span> / <span className="font-mono font-medium">type</span></div>
                                <div className="text-muted-foreground">Tipo de contato</div>
                                <div><span className="font-mono font-medium">observacoes</span> / <span className="font-mono font-medium">notes</span></div>
                                <div className="text-muted-foreground">Notas</div>
                            </div>
                        </div>

                        {/* Preview */}
                        {importData.length > 0 && (
                            <div className="space-y-2">
                                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                                    Preview ({Math.min(importData.length, 5)} de {importData.length})
                                </p>
                                <div className="rounded-xl border border-border overflow-hidden">
                                    <div className="overflow-x-auto">
                                        <table className="w-full text-xs">
                                            <thead>
                                                <tr className="bg-muted/50">
                                                    <th className="px-3 py-2 text-left font-medium">#</th>
                                                    <th className="px-3 py-2 text-left font-medium">Nome</th>
                                                    <th className="px-3 py-2 text-left font-medium">Telefone</th>
                                                    <th className="px-3 py-2 text-left font-medium">Email</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {importData.slice(0, 5).map((row, i) => (
                                                    <tr key={i} className="border-t border-border/50">
                                                        <td className="px-3 py-2 text-muted-foreground">{i + 1}</td>
                                                        <td className="px-3 py-2">{row.nome || row.name || '—'}</td>
                                                        <td className="px-3 py-2 font-mono">{row.telefone || row.phone || row.celular || '—'}</td>
                                                        <td className="px-3 py-2">{row.email || '—'}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Import result */}
                        {importResult && (
                            <div className={cn(
                                'rounded-xl border p-4 space-y-1',
                                importResult.errors.length > 0
                                    ? 'border-warning/30 bg-warning/5'
                                    : 'border-success/30 bg-success/5'
                            )}>
                                <p className="text-sm font-semibold flex items-center gap-1.5">
                                    {importResult.errors.length > 0 ? (
                                        <AlertCircle className="h-4 w-4 text-warning" />
                                    ) : (
                                        <CheckCircle className="h-4 w-4 text-success" />
                                    )}
                                    Importacao concluida
                                </p>
                                <p className="text-xs text-muted-foreground">
                                    {importResult.inserted} importados, {importResult.skipped} ignorados
                                </p>
                                {importResult.errors.map((err, i) => (
                                    <p key={i} className="text-xs text-destructive">{err}</p>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Footer */}
                    <div className="px-6 py-4 border-t border-border bg-card flex items-center justify-between gap-3">
                        <Button variant="ghost" onClick={() => setImportOpen(false)}>
                            Fechar
                        </Button>
                        <Button
                            onClick={processImport}
                            disabled={importing || importData.length === 0}
                            className="gap-1.5 px-6"
                        >
                            {importing ? (
                                <><Loader2 className="h-4 w-4 animate-spin" /> Importando...</>
                            ) : (
                                <><Upload className="h-4 w-4" /> Importar {importData.length} contato{importData.length !== 1 ? 's' : ''}</>
                            )}
                        </Button>
                    </div>
                </SheetContent>
            </Sheet>
        </div>
    );
};

/* ── Helpers ── */
function mapDepartment(raw: string): any {
    const lower = raw.toLowerCase().trim();
    if (lower.includes('vend')) return 'vendas';
    if (lower.includes('loc') || lower.includes('alug')) return 'locacao';
    if (lower.includes('admin')) return 'administrativo';
    return null;
}

export default AdminContactsTab;
