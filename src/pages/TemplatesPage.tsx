import React, { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useTenant } from '@/contexts/TenantContext';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import {
    Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import {
    Loader2, Search, Plus, FileText, CheckCircle, Clock, XCircle, AlertTriangle,
    MessageSquare, Image, Video, Smartphone, Globe, Copy, Pencil, Trash2, RefreshCw,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Json } from '@/integrations/supabase/types';

/* ─── Types ─── */

interface WhatsappTemplate {
    id: string;
    name: string;
    category: string | null;
    language: string | null;
    status: string | null;
    components: Json | null;
    created_at: string | null;
    tenant_id: string;
}

interface TemplateComponent {
    type: string;
    format?: string;
    text?: string;
    parameters?: { type: string; text?: string }[];
    buttons?: { type: string; text: string; url?: string; phone_number?: string }[];
    example?: { header_text?: string[]; body_text?: string[][] };
}

/* ─── Constants ─── */

const STATUS_MAP: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
    APPROVED: { label: 'Aprovado', color: 'bg-success/15 text-success', icon: <CheckCircle className="h-3.5 w-3.5" /> },
    PENDING: { label: 'Pendente', color: 'bg-warning/15 text-warning', icon: <Clock className="h-3.5 w-3.5" /> },
    REJECTED: { label: 'Rejeitado', color: 'bg-destructive/15 text-destructive', icon: <XCircle className="h-3.5 w-3.5" /> },
    PAUSED: { label: 'Pausado', color: 'bg-muted text-muted-foreground', icon: <AlertTriangle className="h-3.5 w-3.5" /> },
    DISABLED: { label: 'Desativado', color: 'bg-muted text-muted-foreground', icon: <XCircle className="h-3.5 w-3.5" /> },
};

const CATEGORY_MAP: Record<string, { label: string; icon: React.ReactNode }> = {
    MARKETING: { label: 'Marketing', icon: <MessageSquare className="h-3.5 w-3.5" /> },
    UTILITY: { label: 'Utilidade', icon: <FileText className="h-3.5 w-3.5" /> },
    AUTHENTICATION: { label: 'Autenticação', icon: <Smartphone className="h-3.5 w-3.5" /> },
};

const CATEGORY_OPTIONS = [
    { value: 'MARKETING', label: 'Marketing' },
    { value: 'UTILITY', label: 'Utilidade' },
    { value: 'AUTHENTICATION', label: 'Autenticação' },
];

const LANGUAGE_OPTIONS = [
    { value: 'pt_BR', label: 'Português (BR)' },
    { value: 'en_US', label: 'English (US)' },
    { value: 'es', label: 'Español' },
];

const formatDate = (d: string | null) => {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
};

/* ─── Preview Component ─── */

const TemplatePreview: React.FC<{ components: Json | null }> = ({ components }) => {
    if (!components || !Array.isArray(components)) {
        return <p className="text-xs text-muted-foreground italic">Sem preview disponível</p>;
    }

    const comps = components as unknown as TemplateComponent[];
    const header = comps.find((c) => c.type === 'HEADER');
    const body = comps.find((c) => c.type === 'BODY');
    const footer = comps.find((c) => c.type === 'FOOTER');
    const buttons = comps.find((c) => c.type === 'BUTTONS');

    return (
        <div className="bg-[#e5ddd5] rounded-xl p-4 max-w-sm">
            <div className="bg-white rounded-lg shadow-sm overflow-hidden">
                {/* Header */}
                {header && (
                    <div className="p-3 pb-0">
                        {header.format === 'IMAGE' ? (
                            <div className="bg-muted/50 rounded-md h-32 flex items-center justify-center">
                                <Image className="h-8 w-8 text-muted-foreground" />
                            </div>
                        ) : header.format === 'VIDEO' ? (
                            <div className="bg-muted/50 rounded-md h-32 flex items-center justify-center">
                                <Video className="h-8 w-8 text-muted-foreground" />
                            </div>
                        ) : header.text ? (
                            <p className="text-sm font-bold text-foreground">{highlightVars(header.text)}</p>
                        ) : null}
                    </div>
                )}

                {/* Body */}
                {body?.text && (
                    <div className="p-3">
                        <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">
                            {highlightVars(body.text)}
                        </p>
                    </div>
                )}

                {/* Footer */}
                {footer?.text && (
                    <div className="px-3 pb-2">
                        <p className="text-[11px] text-muted-foreground">{footer.text}</p>
                    </div>
                )}

                {/* Buttons */}
                {buttons?.buttons && buttons.buttons.length > 0 && (
                    <div className="border-t border-border">
                        {buttons.buttons.map((btn, i) => (
                            <div
                                key={i}
                                className="flex items-center justify-center gap-1.5 p-2.5 text-sm text-accent font-medium border-b border-border last:border-b-0 cursor-default"
                            >
                                {btn.type === 'URL' && <Globe className="h-3.5 w-3.5" />}
                                {btn.type === 'PHONE_NUMBER' && <Smartphone className="h-3.5 w-3.5" />}
                                {btn.text}
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};

function highlightVars(text: string): React.ReactNode {
    const parts = text.split(/(\{\{\d+\}\})/g);
    return parts.map((part, i) =>
        /\{\{\d+\}\}/.test(part) ? (
            <span key={i} className="bg-accent/15 text-accent font-medium px-0.5 rounded">{part}</span>
        ) : (
            <React.Fragment key={i}>{part}</React.Fragment>
        )
    );
}

/* ─── Main Page ─── */

const TemplatesPage: React.FC = () => {
    const { tenantId } = useTenant();
    const { toast } = useToast();

    const [loading, setLoading] = useState(true);
    const [templates, setTemplates] = useState<WhatsappTemplate[]>([]);
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState('all');
    const [categoryFilter, setCategoryFilter] = useState('all');
    const [selectedTemplate, setSelectedTemplate] = useState<WhatsappTemplate | null>(null);

    // New template dialog
    const [showNewDialog, setShowNewDialog] = useState(false);
    const [newName, setNewName] = useState('');
    const [newCategory, setNewCategory] = useState('MARKETING');
    const [newLanguage, setNewLanguage] = useState('pt_BR');
    const [newHeaderText, setNewHeaderText] = useState('');
    const [newBodyText, setNewBodyText] = useState('');
    const [newFooterText, setNewFooterText] = useState('');
    const [newButtonText, setNewButtonText] = useState('');
    const [newButtonUrl, setNewButtonUrl] = useState('');
    const [creating, setCreating] = useState(false);
    const [syncing, setSyncing] = useState(false);

    // ─── Fetch ──
    const fetchTemplates = async () => {
        if (!tenantId) return;
        setLoading(true);
        const { data, error } = await supabase
            .from('whatsapp_templates')
            .select('*')
            .eq('tenant_id', tenantId)
            .order('created_at', { ascending: false });

        if (error) {
            toast({ title: 'Erro ao carregar templates', description: error.message, variant: 'destructive' });
        } else {
            setTemplates(data ?? []);
        }
        setLoading(false);
    };

    useEffect(() => { fetchTemplates(); }, [tenantId]);

    // ─── Filter ──
    const filtered = templates.filter((t) => {
        const matchSearch = !search.trim() ||
            t.name.toLowerCase().includes(search.toLowerCase());
        const matchStatus = statusFilter === 'all' || t.status === statusFilter;
        const matchCategory = categoryFilter === 'all' || t.category === categoryFilter;
        return matchSearch && matchStatus && matchCategory;
    });

    // ─── Stats ──
    const stats = {
        total: templates.length,
        approved: templates.filter((t) => t.status === 'APPROVED').length,
        pending: templates.filter((t) => t.status === 'PENDING').length,
        rejected: templates.filter((t) => t.status === 'REJECTED').length,
    };

    // ─── Create (via Edge Function + fallback to DB) ──
    const handleCreate = async () => {
        if (!tenantId || !newName.trim() || !newBodyText.trim()) return;
        setCreating(true);

        const components: TemplateComponent[] = [];

        if (newHeaderText.trim()) {
            components.push({ type: 'HEADER', format: 'TEXT', text: newHeaderText.trim() });
        }

        components.push({ type: 'BODY', text: newBodyText.trim() });

        if (newFooterText.trim()) {
            components.push({ type: 'FOOTER', text: newFooterText.trim() });
        }

        if (newButtonText.trim()) {
            components.push({
                type: 'BUTTONS',
                buttons: [{
                    type: newButtonUrl.trim() ? 'URL' : 'QUICK_REPLY',
                    text: newButtonText.trim(),
                    ...(newButtonUrl.trim() ? { url: newButtonUrl.trim() } : {}),
                }],
            });
        }

        const templateName = newName.trim().toLowerCase().replace(/\s+/g, '_');

        // Try to create on Meta first
        try {
            const { data: metaResult, error: metaError } = await supabase.functions.invoke('manage-templates', {
                body: {
                    tenant_id: tenantId,
                    action: 'create',
                    template_name: templateName,
                    category: newCategory,
                    language_code: newLanguage,
                    components,
                },
            });

            if (metaError || !metaResult?.success) {
                // Fallback: save locally only
                console.warn('Meta API unavailable, saving locally:', metaError || metaResult);
                await supabase
                    .from('whatsapp_templates')
                    .insert({
                        tenant_id: tenantId,
                        name: templateName,
                        category: newCategory,
                        language: newLanguage,
                        status: 'PENDING',
                        components: components as unknown as Json,
                    });
                toast({ title: 'Template salvo localmente', description: 'Não foi possível enviar à Meta. Salvo para envio posterior.' });
            } else {
                toast({ title: 'Template enviado à Meta!', description: `Status: ${metaResult.status || 'PENDING'}. Aguardando aprovação.` });
            }
        } catch {
            // Fallback: save locally
            await supabase
                .from('whatsapp_templates')
                .insert({
                    tenant_id: tenantId,
                    name: templateName,
                    category: newCategory,
                    language: newLanguage,
                    status: 'PENDING',
                    components: components as unknown as Json,
                });
            toast({ title: 'Template salvo localmente', description: 'Envio à Meta indisponível. Template salvo para envio posterior.' });
        }

        setShowNewDialog(false);
        resetNewForm();
        fetchTemplates();
        setCreating(false);
    };

    // ─── Sync from Meta ──
    const handleSync = async () => {
        if (!tenantId) return;
        setSyncing(true);

        try {
            const { data, error } = await supabase.functions.invoke('manage-templates', {
                body: { tenant_id: tenantId, action: 'sync' },
            });

            if (error) {
                toast({ title: 'Erro ao sincronizar', description: error.message, variant: 'destructive' });
            } else if (data?.success) {
                toast({ title: 'Sincronização concluída!', description: `${data.synced} templates sincronizados (${data.total_on_meta} na Meta).` });
                fetchTemplates();
            } else {
                toast({ title: 'Erro', description: data?.message || 'Falha na sincronização', variant: 'destructive' });
            }
        } catch (err: any) {
            toast({ title: 'Erro ao sincronizar', description: err?.message || 'Conexão falhou', variant: 'destructive' });
        }

        setSyncing(false);
    };

    const resetNewForm = () => {
        setNewName('');
        setNewCategory('MARKETING');
        setNewLanguage('pt_BR');
        setNewHeaderText('');
        setNewBodyText('');
        setNewFooterText('');
        setNewButtonText('');
        setNewButtonUrl('');
    };

    // ─── Delete ──
    const handleDelete = async (id: string) => {
        const { error } = await supabase
            .from('whatsapp_templates')
            .delete()
            .eq('id', id);

        if (error) {
            toast({ title: 'Erro ao excluir', description: error.message, variant: 'destructive' });
        } else {
            toast({ title: 'Template excluído' });
            setSelectedTemplate(null);
            fetchTemplates();
        }
    };

    // ─── Copy name ──
    const handleCopyName = (name: string) => {
        navigator.clipboard.writeText(name);
        toast({ title: 'Nome copiado!', description: name });
    };

    // ─── Preview for new template ──
    const newPreviewComponents: TemplateComponent[] = [];
    if (newHeaderText.trim()) newPreviewComponents.push({ type: 'HEADER', format: 'TEXT', text: newHeaderText });
    if (newBodyText.trim()) newPreviewComponents.push({ type: 'BODY', text: newBodyText });
    if (newFooterText.trim()) newPreviewComponents.push({ type: 'FOOTER', text: newFooterText });
    if (newButtonText.trim()) {
        newPreviewComponents.push({
            type: 'BUTTONS',
            buttons: [{ type: newButtonUrl ? 'URL' : 'QUICK_REPLY', text: newButtonText, url: newButtonUrl || undefined }],
        });
    }

    return (
        <div className="flex flex-col h-[calc(100vh-4rem)]">
            {/* Header */}
            <div className="p-4 border-b border-border bg-card space-y-4">
                <div className="flex items-center justify-between">
                    <div>
                        <h2 className="font-display text-2xl font-bold text-foreground">Templates WhatsApp</h2>
                        <p className="text-sm text-muted-foreground">
                            Gerencie os templates validados pela Meta para campanhas e atualizações
                        </p>
                    </div>
                    <div className="flex items-center gap-2">
                        <Button size="sm" variant="outline" className="gap-1.5" onClick={handleSync} disabled={syncing}>
                            {syncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                            Sincronizar com Meta
                        </Button>
                        <Button size="sm" className="gap-1.5" onClick={() => setShowNewDialog(true)}>
                            <Plus className="h-4 w-4" /> Registrar Template
                        </Button>
                    </div>
                </div>

                {/* Stats */}
                <div className="grid grid-cols-4 gap-4">
                    <StatCard label="Total" value={stats.total} className="bg-card" />
                    <StatCard label="Aprovados" value={stats.approved} className="bg-success/5 text-success" />
                    <StatCard label="Pendentes" value={stats.pending} className="bg-warning/5 text-warning" />
                    <StatCard label="Rejeitados" value={stats.rejected} className="bg-destructive/5 text-destructive" />
                </div>

                {/* Filters */}
                <div className="flex gap-2">
                    <div className="relative flex-1 max-w-sm">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                            placeholder="Buscar por nome..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            className="pl-9 h-9"
                        />
                    </div>
                    <Select value={statusFilter} onValueChange={setStatusFilter}>
                        <SelectTrigger className="w-36 h-9"><SelectValue /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">Todos status</SelectItem>
                            <SelectItem value="APPROVED">Aprovados</SelectItem>
                            <SelectItem value="PENDING">Pendentes</SelectItem>
                            <SelectItem value="REJECTED">Rejeitados</SelectItem>
                        </SelectContent>
                    </Select>
                    <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                        <SelectTrigger className="w-36 h-9"><SelectValue /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">Todas categorias</SelectItem>
                            <SelectItem value="MARKETING">Marketing</SelectItem>
                            <SelectItem value="UTILITY">Utilidade</SelectItem>
                            <SelectItem value="AUTHENTICATION">Autenticação</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-auto p-4">
                {loading ? (
                    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 max-w-6xl mx-auto">
                        {[1, 2, 3, 4, 5, 6].map(i => (
                            <div key={i} className="rounded-xl bg-card border border-border p-4 space-y-3">
                                <div className="skeleton h-5 w-28" />
                                <div className="flex gap-2"><div className="skeleton h-5 w-16" /><div className="skeleton h-5 w-12" /></div>
                                <div className="skeleton h-12 w-full" />
                            </div>
                        ))}
                    </div>
                ) : filtered.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-20 text-center animate-fade-in">
                        <div className="mx-auto w-16 h-16 rounded-2xl bg-accent/10 flex items-center justify-center mb-4">
                            <FileText className="h-8 w-8 text-accent" />
                        </div>
                        <p className="text-foreground font-medium mb-1">
                            {templates.length === 0 ? 'Nenhum template registrado' : 'Nenhum resultado'}
                        </p>
                        <p className="text-muted-foreground text-sm max-w-sm mb-4">
                            {templates.length === 0 ? 'Registre ou sincronize seus templates da Meta para gerê-las.' : 'Tente ajustar os filtros de busca.'}
                        </p>
                        {templates.length === 0 && (
                            <Button size="sm" className="gap-1.5" onClick={() => setShowNewDialog(true)}>
                                <Plus className="h-4 w-4" /> Registrar template
                            </Button>
                        )}
                    </div>
                ) : (
                    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 max-w-6xl mx-auto">
                        {filtered.map((t) => {
                            const statusInfo = STATUS_MAP[t.status || 'PENDING'] || STATUS_MAP.PENDING;
                            const categoryInfo = CATEGORY_MAP[t.category || 'MARKETING'] || CATEGORY_MAP.MARKETING;

                            return (
                                <div
                                    key={t.id}
                                    className="card-interactive p-4 cursor-pointer animate-fade-in"
                                    onClick={() => setSelectedTemplate(t)}
                                >
                                    <div className="flex items-start justify-between gap-2 mb-3">
                                        <div className="flex-1 min-w-0">
                                            <h3 className="text-sm font-semibold text-foreground truncate font-mono">{t.name}</h3>
                                            <p className="text-[10px] text-muted-foreground mt-0.5">{formatDate(t.created_at)}</p>
                                        </div>
                                        <Badge className={cn('text-[10px] gap-1 border-0 shrink-0', statusInfo.color)}>
                                            {statusInfo.icon} {statusInfo.label}
                                        </Badge>
                                    </div>

                                    {/* Category + Language */}
                                    <div className="flex items-center gap-2 mb-3">
                                        <Badge variant="outline" className="text-[10px] gap-1">
                                            {categoryInfo.icon} {categoryInfo.label}
                                        </Badge>
                                        {t.language && (
                                            <Badge variant="outline" className="text-[10px] gap-1">
                                                <Globe className="h-3 w-3" /> {t.language}
                                            </Badge>
                                        )}
                                    </div>

                                    {/* Body preview */}
                                    {t.components && Array.isArray(t.components) && (() => {
                                        const body = (t.components as unknown as TemplateComponent[]).find((c) => c.type === 'BODY');
                                        return body?.text ? (
                                            <p className="text-xs text-muted-foreground line-clamp-3 leading-relaxed">{body.text}</p>
                                        ) : null;
                                    })()}
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* ═══ TEMPLATE DETAIL SHEET ═══ */}
            <Sheet open={!!selectedTemplate} onOpenChange={(open) => !open && setSelectedTemplate(null)}>
                <SheetContent className="w-full sm:max-w-lg overflow-auto">
                    {selectedTemplate && (() => {
                        const statusInfo = STATUS_MAP[selectedTemplate.status || 'PENDING'] || STATUS_MAP.PENDING;
                        const categoryInfo = CATEGORY_MAP[selectedTemplate.category || 'MARKETING'] || CATEGORY_MAP.MARKETING;

                        return (
                            <>
                                <SheetHeader>
                                    <SheetTitle className="font-display flex items-center gap-2">
                                        <span className="font-mono text-base">{selectedTemplate.name}</span>
                                        <Badge className={cn('text-[10px] gap-1 border-0', statusInfo.color)}>
                                            {statusInfo.icon} {statusInfo.label}
                                        </Badge>
                                    </SheetTitle>
                                </SheetHeader>

                                <div className="mt-6 space-y-6">
                                    {/* Info */}
                                    <div className="grid grid-cols-2 gap-3 text-sm">
                                        <div>
                                            <span className="text-xs text-muted-foreground">Categoria</span>
                                            <div className="flex items-center gap-1 mt-0.5">
                                                {categoryInfo.icon}
                                                <span className="font-medium">{categoryInfo.label}</span>
                                            </div>
                                        </div>
                                        <div>
                                            <span className="text-xs text-muted-foreground">Idioma</span>
                                            <p className="font-medium mt-0.5">{selectedTemplate.language || '—'}</p>
                                        </div>
                                        <div>
                                            <span className="text-xs text-muted-foreground">Criado em</span>
                                            <p className="font-medium mt-0.5">{formatDate(selectedTemplate.created_at)}</p>
                                        </div>
                                        <div>
                                            <span className="text-xs text-muted-foreground">ID</span>
                                            <p className="font-mono text-[10px] mt-0.5 truncate">{selectedTemplate.id}</p>
                                        </div>
                                    </div>

                                    {/* Preview */}
                                    <div>
                                        <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                                            Preview da Mensagem
                                        </h4>
                                        <TemplatePreview components={selectedTemplate.components} />
                                    </div>

                                    {/* Components JSON */}
                                    <div>
                                        <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                                            Componentes (JSON)
                                        </h4>
                                        <pre className="text-[10px] bg-muted/50 p-3 rounded-lg whitespace-pre-wrap font-mono max-h-40 overflow-auto border border-border">
                                            {JSON.stringify(selectedTemplate.components, null, 2)}
                                        </pre>
                                    </div>

                                    {/* Actions */}
                                    <div className="flex items-center gap-2 pt-2 border-t border-border">
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            className="gap-1.5"
                                            onClick={() => handleCopyName(selectedTemplate.name)}
                                        >
                                            <Copy className="h-3.5 w-3.5" /> Copiar Nome
                                        </Button>
                                        <div className="flex-1" />
                                        <Button
                                            variant="destructive"
                                            size="sm"
                                            className="gap-1.5"
                                            onClick={() => handleDelete(selectedTemplate.id)}
                                        >
                                            <Trash2 className="h-3.5 w-3.5" /> Excluir
                                        </Button>
                                    </div>
                                </div>
                            </>
                        );
                    })()}
                </SheetContent>
            </Sheet>

            {/* ═══ NEW TEMPLATE DIALOG ═══ */}
            <Dialog open={showNewDialog} onOpenChange={setShowNewDialog}>
                <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col">
                    <DialogHeader>
                        <DialogTitle className="font-display">Registrar Template WhatsApp</DialogTitle>
                        <DialogDescription>
                            Cadastre um template para ser enviado à aprovação da Meta. Use {'{{1}}'}, {'{{2}}'}, etc. para variáveis.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="flex-1 overflow-auto">
                        <div className="grid md:grid-cols-2 gap-6 py-4">
                            {/* Form */}
                            <div className="space-y-4">
                                <div className="space-y-2">
                                    <Label>Nome do template *</Label>
                                    <Input
                                        value={newName}
                                        onChange={(e) => setNewName(e.target.value)}
                                        placeholder="ex: atualizacao_imovel_v1"
                                        className="font-mono text-sm"
                                    />
                                    <p className="text-[10px] text-muted-foreground">
                                        Letras minúsculas, números e underscores. Sem espaços.
                                    </p>
                                </div>

                                <div className="grid grid-cols-2 gap-3">
                                    <div className="space-y-2">
                                        <Label>Categoria</Label>
                                        <Select value={newCategory} onValueChange={setNewCategory}>
                                            <SelectTrigger><SelectValue /></SelectTrigger>
                                            <SelectContent>
                                                {CATEGORY_OPTIONS.map((c) => (
                                                    <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div className="space-y-2">
                                        <Label>Idioma</Label>
                                        <Select value={newLanguage} onValueChange={setNewLanguage}>
                                            <SelectTrigger><SelectValue /></SelectTrigger>
                                            <SelectContent>
                                                {LANGUAGE_OPTIONS.map((l) => (
                                                    <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <Label>Cabeçalho (opcional)</Label>
                                    <Input
                                        value={newHeaderText}
                                        onChange={(e) => setNewHeaderText(e.target.value)}
                                        placeholder="Ex: Atualização do seu imóvel"
                                    />
                                </div>

                                <div className="space-y-2">
                                    <Label>Corpo da mensagem *</Label>
                                    <Textarea
                                        value={newBodyText}
                                        onChange={(e) => setNewBodyText(e.target.value)}
                                        rows={5}
                                        className="text-sm"
                                        placeholder={`Olá {{1}}, gostaríamos de saber se o imóvel {{2}} no endereço {{3}} ainda está disponível para locação.\n\nPode nos confirmar?`}
                                    />
                                </div>

                                <div className="space-y-2">
                                    <Label>Rodapé (opcional)</Label>
                                    <Input
                                        value={newFooterText}
                                        onChange={(e) => setNewFooterText(e.target.value)}
                                        placeholder="Ex: Smolka Imóveis"
                                    />
                                </div>

                                <div className="grid grid-cols-2 gap-3">
                                    <div className="space-y-2">
                                        <Label>Botão (opcional)</Label>
                                        <Input
                                            value={newButtonText}
                                            onChange={(e) => setNewButtonText(e.target.value)}
                                            placeholder="Ex: Ver detalhes"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label>URL do botão</Label>
                                        <Input
                                            value={newButtonUrl}
                                            onChange={(e) => setNewButtonUrl(e.target.value)}
                                            placeholder="https://..."
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* Live Preview */}
                            <div>
                                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                                    Preview ao vivo
                                </h4>
                                <TemplatePreview components={newPreviewComponents.length > 0 ? (newPreviewComponents as unknown as Json) : null} />
                            </div>
                        </div>
                    </div>

                    <DialogFooter>
                        <Button variant="outline" onClick={() => { setShowNewDialog(false); resetNewForm(); }}>
                            Cancelar
                        </Button>
                        <Button
                            onClick={handleCreate}
                            disabled={!newName.trim() || !newBodyText.trim() || creating}
                            className="gap-1.5"
                        >
                            {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                            Registrar Template
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
};

/* ─── Sub-components ─── */

const StatCard: React.FC<{ label: string; value: number; className?: string }> = ({ label, value, className }) => (
    <div className={cn('rounded-lg border border-border p-3 text-center', className)}>
        <p className="text-xl font-bold">{value}</p>
        <p className="text-[10px] text-muted-foreground">{label}</p>
    </div>
);

export default TemplatesPage;
