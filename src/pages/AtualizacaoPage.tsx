import React, { useEffect, useState, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useTenant } from '@/contexts/TenantContext';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Progress } from '@/components/ui/progress';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import {
    Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import {
    Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
    Loader2, Search, Plus, Send, RefreshCw, Phone, User, Home, MapPin,
    Calendar, CheckCircle, Clock, XCircle, MessageSquare, ChevronLeft, ChevronRight,
    FileText, BarChart3, Mail,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import type { Tables } from '@/integrations/supabase/types';

type OwnerContact = Tables<'owner_contacts'>;
type Campaign = Tables<'owner_update_campaigns'>;
type CampaignResult = Tables<'owner_update_results'>;

/* ─── helpers ─── */

const STATUS_MAP: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
    draft: { label: 'Rascunho', color: 'bg-muted text-muted-foreground', icon: <FileText className="h-3 w-3" /> },
    scheduled: { label: 'Agendada', color: 'bg-info/15 text-info', icon: <Clock className="h-3 w-3" /> },
    in_progress: { label: 'Em andamento', color: 'bg-warning/15 text-warning', icon: <RefreshCw className="h-3 w-3" /> },
    completed: { label: 'Concluída', color: 'bg-success/15 text-success', icon: <CheckCircle className="h-3 w-3" /> },
    cancelled: { label: 'Cancelada', color: 'bg-destructive/15 text-destructive', icon: <XCircle className="h-3 w-3" /> },
};

const RESULT_STATUS_MAP: Record<string, { label: string; color: string }> = {
    pending: { label: 'Pendente', color: 'bg-muted text-muted-foreground' },
    sent: { label: 'Enviado', color: 'bg-info/15 text-info' },
    delivered: { label: 'Entregue', color: 'bg-info/15 text-info' },
    replied: { label: 'Respondeu', color: 'bg-warning/15 text-warning' },
    completed: { label: 'Atualizado', color: 'bg-success/15 text-success' },
    failed: { label: 'Falhou', color: 'bg-destructive/15 text-destructive' },
};

const PROPERTY_STATUS_MAP: Record<string, { label: string; color: string }> = {
    available: { label: 'Disponível', color: 'bg-success/15 text-success' },
    rented: { label: 'Alugado', color: 'bg-info/15 text-info' },
    sold: { label: 'Vendido', color: 'bg-warning/15 text-warning' },
    unavailable: { label: 'Indisponível', color: 'bg-destructive/15 text-destructive' },
    price_changed: { label: 'Preço alterado', color: 'bg-warning/15 text-warning' },
};

const formatDate = (d: string | null) => {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' });
};

const formatDateTime = (d: string | null) => {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
};

type TabValue = 'campaigns' | 'owners';

/* ─── Main ─── */

const AtualizacaoPage: React.FC = () => {
    const { tenantId } = useTenant();
    const { user } = useAuth();
    const { toast } = useToast();

    const [tab, setTab] = useState<TabValue>('campaigns');
    const [loading, setLoading] = useState(true);

    // Campaigns state
    const [campaigns, setCampaigns] = useState<Campaign[]>([]);
    const [selectedCampaign, setSelectedCampaign] = useState<Campaign | null>(null);
    const [campaignResults, setCampaignResults] = useState<CampaignResult[]>([]);
    const [loadingResults, setLoadingResults] = useState(false);

    // Owners state
    const [owners, setOwners] = useState<OwnerContact[]>([]);
    const [ownerSearch, setOwnerSearch] = useState('');
    const [ownerPage, setOwnerPage] = useState(0);
    const [ownerTotal, setOwnerTotal] = useState(0);
    const [checkedOwners, setCheckedOwners] = useState<Set<string>>(new Set());
    const [selectedOwner, setSelectedOwner] = useState<OwnerContact | null>(null);

    // New campaign dialog
    const [showNewCampaign, setShowNewCampaign] = useState(false);
    const [newName, setNewName] = useState('');
    const [newDesc, setNewDesc] = useState('');
    const [newTemplate, setNewTemplate] = useState('Olá {nome}, gostaríamos de saber se o imóvel {codigo} em {endereco} ainda está disponível. Pode nos confirmar?');
    const [creating, setCreating] = useState(false);

    const PAGE_SIZE = 50;

    // ─── Fetch campaigns ──
    const fetchCampaigns = async () => {
        if (!tenantId) return;
        setLoading(true);
        const { data } = await supabase
            .from('owner_update_campaigns')
            .select('*')
            .eq('tenant_id', tenantId)
            .order('created_at', { ascending: false });
        setCampaigns(data ?? []);
        setLoading(false);
    };

    // ─── Fetch owners ──
    const fetchOwners = async () => {
        if (!tenantId) return;
        setLoading(true);

        let query = supabase
            .from('owner_contacts')
            .select('*', { count: 'exact' })
            .eq('tenant_id', tenantId)
            .order('updated_at', { ascending: false })
            .range(ownerPage * PAGE_SIZE, (ownerPage + 1) * PAGE_SIZE - 1);

        if (ownerSearch.trim()) {
            query = query.or(`name.ilike.%${ownerSearch}%,phone.ilike.%${ownerSearch}%,property_code.ilike.%${ownerSearch}%`);
        }

        const { data, count } = await query;
        setOwners(data ?? []);
        setOwnerTotal(count ?? 0);
        setLoading(false);
    };

    // ─── Fetch campaign results ──
    const fetchCampaignResults = async (campaignId: string) => {
        setLoadingResults(true);
        const { data } = await supabase
            .from('owner_update_results')
            .select('*')
            .eq('campaign_id', campaignId)
            .order('created_at', { ascending: false });
        setCampaignResults(data ?? []);
        setLoadingResults(false);
    };

    useEffect(() => {
        if (tab === 'campaigns') fetchCampaigns();
        else fetchOwners();
    }, [tenantId, tab]);

    useEffect(() => {
        if (tab === 'owners') fetchOwners();
    }, [ownerPage, ownerSearch]);

    useEffect(() => {
        if (selectedCampaign) fetchCampaignResults(selectedCampaign.id);
    }, [selectedCampaign]);

    // ─── Create campaign ──
    const handleCreateCampaign = async () => {
        if (!tenantId || !user || !newName.trim()) return;
        setCreating(true);

        const { data, error } = await supabase
            .from('owner_update_campaigns')
            .insert({
                tenant_id: tenantId,
                name: newName.trim(),
                description: newDesc.trim() || null,
                message_template: newTemplate.trim() || null,
                status: 'draft',
                created_by: user.id,
            })
            .select()
            .single();

        if (error) {
            toast({ title: 'Erro', description: 'Não foi possível criar a campanha.', variant: 'destructive' });
        } else {
            toast({ title: 'Campanha criada!', description: `"${newName}" foi criada com sucesso.` });
            setShowNewCampaign(false);
            setNewName('');
            setNewDesc('');
            fetchCampaigns();
        }
        setCreating(false);
    };

    // ─── Export owners ──
    const handleExportOwners = () => {
        const selected = owners.filter((o) => checkedOwners.has(o.id));
        const csvLines = [
            'Nome,Telefone,Email,Imóvel,Endereço,Bairro,Tipo',
            ...selected.map((o) => [
                o.name,
                o.phone,
                o.email || '',
                o.property_code || '',
                o.property_address || '',
                o.neighborhood || '',
                o.property_type || '',
            ].join(',')),
        ];
        const blob = new Blob([csvLines.join('\n')], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `proprietarios_${new Date().toISOString().slice(0, 10)}.csv`;
        a.click();
        URL.revokeObjectURL(url);
        toast({ title: 'Exportado!', description: `${selected.length} proprietários exportados.` });
    };

    const allOwnersChecked = owners.length > 0 && checkedOwners.size === owners.length;
    const ownerTotalPages = Math.ceil(ownerTotal / PAGE_SIZE);

    // ─── Campaign stats ──
    const getCampaignProgress = (c: Campaign) => {
        const total = c.total_contacts || 0;
        const contacted = c.contacted_count || 0;
        if (total === 0) return 0;
        return Math.round((contacted / total) * 100);
    };

    return (
        <div className="flex flex-col h-[calc(100vh-4rem)]">
            {/* Header */}
            <div className="p-4 border-b border-border bg-card space-y-3">
                <div className="flex items-center justify-between">
                    <div>
                        <h2 className="font-display text-xl font-bold text-foreground">Atualização de Anúncios</h2>
                        <p className="text-xs text-muted-foreground">
                            Contate proprietários para verificar se anúncios ainda estão disponíveis
                        </p>
                    </div>
                    <Button size="sm" className="gap-1.5" onClick={() => setShowNewCampaign(true)}>
                        <Plus className="h-4 w-4" /> Nova Campanha
                    </Button>
                </div>

                {/* Tabs */}
                <div className="flex gap-1 p-0.5 bg-muted rounded-lg max-w-xs">
                    <button
                        onClick={() => setTab('campaigns')}
                        className={cn(
                            'flex-1 text-sm font-medium px-3 py-1.5 rounded-md transition-all',
                            tab === 'campaigns'
                                ? 'bg-card text-foreground shadow-sm'
                                : 'text-muted-foreground hover:text-foreground'
                        )}
                    >
                        Campanhas
                    </button>
                    <button
                        onClick={() => setTab('owners')}
                        className={cn(
                            'flex-1 text-sm font-medium px-3 py-1.5 rounded-md transition-all',
                            tab === 'owners'
                                ? 'bg-card text-foreground shadow-sm'
                                : 'text-muted-foreground hover:text-foreground'
                        )}
                    >
                        Proprietários
                    </button>
                </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-auto">
                {loading ? (
                    <div className="flex items-center justify-center h-40">
                        <Loader2 className="h-6 w-6 animate-spin text-accent" />
                    </div>
                ) : tab === 'campaigns' ? (
                    /* ═══ CAMPAIGNS TAB ═══ */
                    campaigns.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-40 text-sm text-muted-foreground gap-2">
                            <RefreshCw className="h-8 w-8 opacity-40" />
                            <p>Nenhuma campanha de atualização criada</p>
                            <Button size="sm" variant="outline" onClick={() => setShowNewCampaign(true)}>
                                <Plus className="h-3.5 w-3.5 mr-1" /> Criar primeira campanha
                            </Button>
                        </div>
                    ) : (
                        <div className="p-4 space-y-3 max-w-5xl mx-auto">
                            {campaigns.map((c) => {
                                const statusInfo = STATUS_MAP[c.status] || STATUS_MAP.draft;
                                const progress = getCampaignProgress(c);

                                return (
                                    <div
                                        key={c.id}
                                        className="rounded-xl bg-card border border-border shadow-card p-4 cursor-pointer hover:bg-muted/30 transition-colors animate-fade-in"
                                        onClick={() => setSelectedCampaign(c)}
                                    >
                                        <div className="flex items-start justify-between gap-3">
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2 mb-1">
                                                    <h3 className="text-sm font-semibold text-foreground truncate">{c.name}</h3>
                                                    <Badge className={cn('text-[10px] gap-1 border-0', statusInfo.color)}>
                                                        {statusInfo.icon} {statusInfo.label}
                                                    </Badge>
                                                </div>
                                                {c.description && (
                                                    <p className="text-xs text-muted-foreground mb-2 line-clamp-1">{c.description}</p>
                                                )}
                                                <div className="flex items-center gap-4 text-xs text-muted-foreground">
                                                    <span className="flex items-center gap-1">
                                                        <User className="h-3 w-3" /> {c.total_contacts || 0} proprietários
                                                    </span>
                                                    <span className="flex items-center gap-1">
                                                        <Send className="h-3 w-3" /> {c.contacted_count || 0} contatados
                                                    </span>
                                                    <span className="flex items-center gap-1">
                                                        <MessageSquare className="h-3 w-3" /> {c.responded_count || 0} responderam
                                                    </span>
                                                    <span className="flex items-center gap-1">
                                                        <CheckCircle className="h-3 w-3" /> {c.updated_count || 0} atualizados
                                                    </span>
                                                    <span className="flex items-center gap-1 ml-auto">
                                                        <Calendar className="h-3 w-3" /> {formatDate(c.created_at)}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                        {(c.total_contacts || 0) > 0 && (
                                            <div className="mt-3 flex items-center gap-2">
                                                <Progress value={progress} className="h-1.5 flex-1" />
                                                <span className="text-[10px] font-semibold text-muted-foreground">{progress}%</span>
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )
                ) : (
                    /* ═══ OWNERS TAB ═══ */
                    <>
                        <div className="p-4 pb-0">
                            <div className="relative max-w-md mb-3">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                <Input
                                    placeholder="Buscar por nome, telefone ou código..."
                                    value={ownerSearch}
                                    onChange={(e) => { setOwnerSearch(e.target.value); setOwnerPage(0); }}
                                    className="pl-9 h-9"
                                />
                            </div>
                        </div>

                        {owners.length === 0 ? (
                            <div className="flex flex-col items-center justify-center h-40 text-sm text-muted-foreground gap-2">
                                <User className="h-8 w-8 opacity-40" />
                                Nenhum proprietário encontrado
                            </div>
                        ) : (
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead className="w-10">
                                            <Checkbox
                                                checked={allOwnersChecked}
                                                onCheckedChange={() => {
                                                    if (allOwnersChecked) setCheckedOwners(new Set());
                                                    else setCheckedOwners(new Set(owners.map((o) => o.id)));
                                                }}
                                            />
                                        </TableHead>
                                        <TableHead>Proprietário</TableHead>
                                        <TableHead>Contato</TableHead>
                                        <TableHead className="hidden md:table-cell">Imóvel</TableHead>
                                        <TableHead className="hidden lg:table-cell">Bairro</TableHead>
                                        <TableHead className="hidden sm:table-cell">Status</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {owners.map((owner) => (
                                        <TableRow
                                            key={owner.id}
                                            className={cn(
                                                'cursor-pointer hover:bg-muted/50 transition-colors',
                                                checkedOwners.has(owner.id) && 'bg-accent/5'
                                            )}
                                        >
                                            <TableCell onClick={(e) => e.stopPropagation()}>
                                                <Checkbox
                                                    checked={checkedOwners.has(owner.id)}
                                                    onCheckedChange={() => {
                                                        setCheckedOwners((prev) => {
                                                            const next = new Set(prev);
                                                            if (next.has(owner.id)) next.delete(owner.id); else next.add(owner.id);
                                                            return next;
                                                        });
                                                    }}
                                                />
                                            </TableCell>
                                            <TableCell onClick={() => setSelectedOwner(owner)}>
                                                <p className="text-sm font-medium text-foreground">{owner.name}</p>
                                                {owner.property_type && (
                                                    <span className="text-[10px] text-muted-foreground">{owner.property_type}</span>
                                                )}
                                            </TableCell>
                                            <TableCell onClick={() => setSelectedOwner(owner)}>
                                                <p className="text-sm text-foreground">{owner.phone}</p>
                                                {owner.email && <p className="text-[10px] text-muted-foreground">{owner.email}</p>}
                                            </TableCell>
                                            <TableCell className="hidden md:table-cell" onClick={() => setSelectedOwner(owner)}>
                                                <p className="text-sm text-foreground">{owner.property_code || '—'}</p>
                                                {owner.property_address && (
                                                    <p className="text-[10px] text-muted-foreground truncate max-w-[200px]">{owner.property_address}</p>
                                                )}
                                            </TableCell>
                                            <TableCell className="hidden lg:table-cell" onClick={() => setSelectedOwner(owner)}>
                                                <span className="text-sm text-foreground">{owner.neighborhood || '—'}</span>
                                            </TableCell>
                                            <TableCell className="hidden sm:table-cell" onClick={() => setSelectedOwner(owner)}>
                                                {owner.is_active !== false ? (
                                                    <Badge className="text-[10px] bg-success/15 text-success border-0">Ativo</Badge>
                                                ) : (
                                                    <Badge variant="secondary" className="text-[10px]">Inativo</Badge>
                                                )}
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        )}

                        {/* Owners bulk actions */}
                        {checkedOwners.size > 0 && (
                            <div className="flex items-center justify-between px-4 py-3 border-t border-border bg-card animate-fade-in">
                                <span className="text-sm font-medium text-foreground">
                                    {checkedOwners.size} selecionado{checkedOwners.size !== 1 ? 's' : ''}
                                </span>
                                <div className="flex items-center gap-2">
                                    <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={handleExportOwners}>
                                        <FileText className="h-3.5 w-3.5" /> Exportar
                                    </Button>
                                </div>
                            </div>
                        )}

                        {/* Owners pagination */}
                        {ownerTotalPages > 1 && checkedOwners.size === 0 && (
                            <div className="flex items-center justify-between px-4 py-3 border-t border-border bg-card text-sm">
                                <span className="text-muted-foreground">
                                    Exibindo {ownerPage * PAGE_SIZE + 1}-{Math.min((ownerPage + 1) * PAGE_SIZE, ownerTotal)} de {ownerTotal}
                                </span>
                                <div className="flex items-center gap-2">
                                    <Button variant="outline" size="icon" className="h-8 w-8" disabled={ownerPage === 0} onClick={() => setOwnerPage(ownerPage - 1)}>
                                        <ChevronLeft className="h-4 w-4" />
                                    </Button>
                                    <span className="text-muted-foreground">{ownerPage + 1} / {ownerTotalPages}</span>
                                    <Button variant="outline" size="icon" className="h-8 w-8" disabled={ownerPage >= ownerTotalPages - 1} onClick={() => setOwnerPage(ownerPage + 1)}>
                                        <ChevronRight className="h-4 w-4" />
                                    </Button>
                                </div>
                            </div>
                        )}
                    </>
                )}
            </div>

            {/* ═══ NEW CAMPAIGN DIALOG ═══ */}
            <Dialog open={showNewCampaign} onOpenChange={setShowNewCampaign}>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle className="font-display">Nova Campanha de Atualização</DialogTitle>
                        <DialogDescription>
                            Crie uma campanha para contatar proprietários e verificar o status dos anúncios.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-2">
                        <div className="space-y-2">
                            <Label>Nome da campanha</Label>
                            <Input
                                value={newName}
                                onChange={(e) => setNewName(e.target.value)}
                                placeholder="Ex: Atualização Fevereiro 2026"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label>Descrição (opcional)</Label>
                            <Input
                                value={newDesc}
                                onChange={(e) => setNewDesc(e.target.value)}
                                placeholder="Ex: Verificação mensal de imóveis para locação"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label>Modelo de mensagem</Label>
                            <Textarea
                                value={newTemplate}
                                onChange={(e) => setNewTemplate(e.target.value)}
                                rows={4}
                                className="text-sm"
                            />
                            <p className="text-[10px] text-muted-foreground">
                                Use {'{nome}'}, {'{codigo}'}, {'{endereco}'} como variáveis
                            </p>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setShowNewCampaign(false)}>Cancelar</Button>
                        <Button onClick={handleCreateCampaign} disabled={!newName.trim() || creating}>
                            {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Criar Campanha'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* ═══ CAMPAIGN DETAIL SHEET ═══ */}
            <Sheet open={!!selectedCampaign} onOpenChange={(open) => !open && setSelectedCampaign(null)}>
                <SheetContent className="w-full sm:max-w-2xl overflow-auto">
                    {selectedCampaign && (
                        <>
                            <SheetHeader>
                                <SheetTitle className="font-display flex items-center gap-2">
                                    {selectedCampaign.name}
                                    <Badge className={cn('text-[10px] gap-1 border-0', (STATUS_MAP[selectedCampaign.status] || STATUS_MAP.draft).color)}>
                                        {(STATUS_MAP[selectedCampaign.status] || STATUS_MAP.draft).label}
                                    </Badge>
                                </SheetTitle>
                            </SheetHeader>

                            {/* Stats */}
                            <div className="grid grid-cols-4 gap-3 mt-6 mb-6">
                                <StatCard label="Total" value={selectedCampaign.total_contacts || 0} icon={<User className="h-4 w-4" />} />
                                <StatCard label="Contatados" value={selectedCampaign.contacted_count || 0} icon={<Send className="h-4 w-4" />} />
                                <StatCard label="Responderam" value={selectedCampaign.responded_count || 0} icon={<MessageSquare className="h-4 w-4" />} />
                                <StatCard label="Atualizados" value={selectedCampaign.updated_count || 0} icon={<CheckCircle className="h-4 w-4" />} />
                            </div>

                            {/* Results table */}
                            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Resultados</h4>
                            {loadingResults ? (
                                <div className="flex items-center justify-center h-20">
                                    <Loader2 className="h-5 w-5 animate-spin text-accent" />
                                </div>
                            ) : campaignResults.length === 0 ? (
                                <p className="text-sm text-muted-foreground text-center py-6">Nenhum resultado ainda</p>
                            ) : (
                                <div className="space-y-2">
                                    {campaignResults.map((r) => {
                                        const rStatus = RESULT_STATUS_MAP[r.status] || RESULT_STATUS_MAP.pending;
                                        const pStatus = r.property_status ? (PROPERTY_STATUS_MAP[r.property_status] || null) : null;

                                        return (
                                            <div key={r.id} className="flex items-center gap-3 rounded-lg bg-muted/30 p-3 border border-border">
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-sm font-medium text-foreground">{r.phone}</p>
                                                    <div className="flex items-center gap-2 mt-0.5">
                                                        <Badge className={cn('text-[10px] border-0', rStatus.color)}>{rStatus.label}</Badge>
                                                        {pStatus && (
                                                            <Badge className={cn('text-[10px] border-0', pStatus.color)}>{pStatus.label}</Badge>
                                                        )}
                                                    </div>
                                                    {r.ai_summary && (
                                                        <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{r.ai_summary}</p>
                                                    )}
                                                </div>
                                                <div className="text-right shrink-0">
                                                    <p className="text-[10px] text-muted-foreground">{formatDateTime(r.sent_at)}</p>
                                                    {r.replied_at && (
                                                        <p className="text-[10px] text-success">Respondeu {formatDateTime(r.replied_at)}</p>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </>
                    )}
                </SheetContent>
            </Sheet>

            {/* ═══ OWNER DETAIL SHEET ═══ */}
            <Sheet open={!!selectedOwner} onOpenChange={(open) => !open && setSelectedOwner(null)}>
                <SheetContent className="w-full sm:max-w-md">
                    {selectedOwner && (
                        <>
                            <SheetHeader>
                                <SheetTitle className="font-display">{selectedOwner.name}</SheetTitle>
                            </SheetHeader>
                            <div className="mt-6 space-y-4">
                                <DetailRow icon={<Phone className="h-4 w-4" />} label="Telefone" value={selectedOwner.phone} />
                                {selectedOwner.email && (
                                    <DetailRow icon={<Mail className="h-4 w-4" />} label="Email" value={selectedOwner.email} />
                                )}
                                {selectedOwner.property_code && (
                                    <DetailRow icon={<Home className="h-4 w-4" />} label="Código do Imóvel" value={selectedOwner.property_code} />
                                )}
                                {selectedOwner.property_address && (
                                    <DetailRow icon={<MapPin className="h-4 w-4" />} label="Endereço" value={selectedOwner.property_address} />
                                )}
                                {selectedOwner.neighborhood && (
                                    <DetailRow icon={<MapPin className="h-4 w-4" />} label="Bairro" value={selectedOwner.neighborhood} />
                                )}
                                {selectedOwner.property_type && (
                                    <DetailRow icon={<Home className="h-4 w-4" />} label="Tipo" value={selectedOwner.property_type} />
                                )}
                                <div>
                                    <span className="text-xs text-muted-foreground">Status</span>
                                    <div className="mt-1">
                                        {selectedOwner.is_active !== false ? (
                                            <Badge className="text-[10px] bg-success/15 text-success border-0">Ativo</Badge>
                                        ) : (
                                            <Badge variant="secondary" className="text-[10px]">Inativo</Badge>
                                        )}
                                    </div>
                                </div>
                                {selectedOwner.notes && (
                                    <div>
                                        <span className="text-xs text-muted-foreground">Notas</span>
                                        <p className="text-sm text-foreground mt-1">{selectedOwner.notes}</p>
                                    </div>
                                )}
                                {selectedOwner.tags && selectedOwner.tags.length > 0 && (
                                    <div>
                                        <span className="text-xs text-muted-foreground">Tags</span>
                                        <div className="flex flex-wrap gap-1.5 mt-1">
                                            {selectedOwner.tags.map((t) => (
                                                <Badge key={t} variant="secondary" className="text-[10px]">{t}</Badge>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </>
                    )}
                </SheetContent>
            </Sheet>
        </div>
    );
};

/* ─── Sub-components ─── */

const StatCard: React.FC<{ label: string; value: number; icon: React.ReactNode }> = ({ label, value, icon }) => (
    <div className="rounded-lg bg-muted/30 border border-border p-3 text-center">
        <div className="flex items-center justify-center text-muted-foreground mb-1">{icon}</div>
        <p className="text-lg font-bold text-foreground">{value}</p>
        <p className="text-[10px] text-muted-foreground">{label}</p>
    </div>
);

const DetailRow: React.FC<{ icon: React.ReactNode; label: string; value: string }> = ({ icon, label, value }) => (
    <div className="flex items-center gap-3">
        <span className="text-muted-foreground">{icon}</span>
        <div>
            <span className="text-xs text-muted-foreground">{label}</span>
            <p className="text-sm font-medium text-foreground">{value}</p>
        </div>
    </div>
);

export default AtualizacaoPage;
