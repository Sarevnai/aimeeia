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
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import {
    Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
    Loader2, Search, Plus, Send, RefreshCw, Phone, User, Home, MapPin,
    Calendar, CheckCircle, Clock, XCircle, MessageSquare, ChevronLeft, ChevronRight,
    FileText, BarChart3, Mail, UploadCloud, Download
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

    // New campaign Drawer
    const [showNewCampaign, setShowNewCampaign] = useState(false);
    const [campaignStep, setCampaignStep] = useState(1);
    const [newName, setNewName] = useState('');
    const [newDesc, setNewDesc] = useState('');
    const [newDate, setNewDate] = useState('');
    const [newPeriod, setNewPeriod] = useState('');
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
        if (!tenantId || !user) return;

        // Em um cenário real, o nome da campanha poderia ser autogerado baseado na data
        const finalName = newName.trim() || `Atualização ${newDate} - ${newPeriod}`;

        setCreating(true);

        const { data, error } = await supabase
            .from('owner_update_campaigns')
            .insert({
                tenant_id: tenantId,
                name: finalName,
                description: newDesc.trim() || null,
                status: 'draft',
                created_by: user.id,
            })
            .select()
            .single();

        if (error) {
            toast({ title: 'Erro', description: 'Não foi possível criar o pedido.', variant: 'destructive' });
        } else {
            toast({ title: 'Pedido enviado!', description: `O pedido de atualização foi criado com sucesso.` });
            setShowNewCampaign(false);
            setCampaignStep(1);
            setNewName('');
            setNewDesc('');
            setNewDate('');
            setNewPeriod('');
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

    const closeNewCampaignDrawer = () => {
        setShowNewCampaign(false);
        setTimeout(() => setCampaignStep(1), 300); // reset after animation
    };

    return (
        <div className="flex flex-col h-[calc(100vh-4rem)]">
            {/* Header */}
            <div className="p-0 sm:p-4 border-b border-border bg-card">
                <div className="px-4 py-4 sm:px-0 sm:py-0 mb-4 flex items-center justify-between">
                    <div>
                        <h2 className="font-display text-2xl font-bold text-foreground">Atualização de anúncios</h2>
                        <p className="text-sm text-muted-foreground mt-1">
                            Conversas com proprietários para atualizar os imóveis anunciados.
                        </p>
                    </div>
                </div>

                {/* Tabs */}
                <div className="flex gap-1 p-0.5 bg-muted rounded-lg w-fit mx-4 sm:mx-0">
                    <button
                        onClick={() => setTab('campaigns')}
                        className={cn(
                            'flex-1 text-sm font-medium px-4 py-1.5 rounded-md transition-all',
                            tab === 'campaigns'
                                ? 'bg-card text-foreground shadow-sm'
                                : 'text-muted-foreground hover:text-foreground'
                        )}
                    >
                        Atualizações
                    </button>
                    <button
                        onClick={() => setTab('owners')}
                        className={cn(
                            'flex-1 text-sm font-medium px-4 py-1.5 rounded-md transition-all',
                            tab === 'owners'
                                ? 'bg-card text-foreground shadow-sm'
                                : 'text-muted-foreground hover:text-foreground'
                        )}
                    >
                        Imóveis
                    </button>
                </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-auto bg-muted/20">
                {loading ? (
                    <div className="p-4 space-y-3 max-w-5xl mx-auto">
                        {[1, 2, 3].map(i => <div key={i} className="skeleton h-24 w-full rounded-xl" />)}
                    </div>
                ) : tab === 'campaigns' ? (
                    /* ═══ CAMPAIGNS TAB ═══ */
                    campaigns.length === 0 ? (
                        <div className="flex justify-center p-4 py-12 md:py-20 animate-fade-in">
                            <div className="bg-card border border-border shadow-sm rounded-2xl p-8 md:p-10 max-w-[680px] w-full">
                                <h3 className="text-xl md:text-2xl font-display font-bold text-foreground mb-2">
                                    Mantenha sua prateleira de imóveis atualizada
                                </h3>
                                <p className="text-sm text-muted-foreground mb-8">
                                    A Aimee contata o proprietário e identifica atualizações necessárias no anúncio.
                                </p>

                                <div className="space-y-6 text-left w-full mb-10">
                                    <div className="flex items-start gap-4 p-3 hover:bg-muted/50 rounded-xl transition-colors">
                                        <div className="bg-muted p-2.5 rounded-xl text-foreground shrink-0 mt-0.5">
                                            <User className="h-5 w-5" />
                                        </div>
                                        <div>
                                            <p className="text-sm text-foreground leading-relaxed">
                                                Envie o <span className="font-semibold">contato</span> dos proprietários e os <span className="font-semibold">imóveis</span> para atualização.
                                            </p>
                                        </div>
                                    </div>
                                    <div className="flex items-start gap-4 p-3 hover:bg-muted/50 rounded-xl transition-colors">
                                        <div className="bg-muted p-2.5 rounded-xl text-foreground shrink-0 mt-0.5">
                                            <Calendar className="h-5 w-5" />
                                        </div>
                                        <div>
                                            <p className="text-sm text-foreground leading-relaxed">
                                                Escolha a <span className="font-semibold">data</span> em que as mensagens serão disparadas pela Aimee.
                                            </p>
                                        </div>
                                    </div>
                                    <div className="flex items-start gap-4 p-3 hover:bg-muted/50 rounded-xl transition-colors">
                                        <div className="bg-muted p-2.5 rounded-xl text-foreground shrink-0 mt-0.5">
                                            <BarChart3 className="h-5 w-5" />
                                        </div>
                                        <div>
                                            <p className="text-sm text-foreground leading-relaxed">
                                                Acompanhe as conversas com as alterações necessárias <span className="font-semibold">em tempo real</span> aqui na plataforma.
                                            </p>
                                        </div>
                                    </div>
                                </div>

                                <div className="flex flex-col sm:flex-row items-center gap-4">
                                    <Button
                                        size="lg"
                                        onClick={() => setShowNewCampaign(true)}
                                        className="w-full sm:w-auto font-medium"
                                    >
                                        Enviar pedido de atualização
                                    </Button>
                                    <Button variant="link" className="text-primary font-medium" onClick={() => { }}>
                                        Saiba mais
                                    </Button>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="p-4 space-y-4 max-w-5xl mx-auto">
                            <div className="flex justify-end mb-4">
                                <Button size="sm" className="gap-1.5 shadow-sm" onClick={() => setShowNewCampaign(true)}>
                                    <Plus className="h-4 w-4" /> Enviar pedido
                                </Button>
                            </div>
                            {campaigns.map((c) => {
                                const statusInfo = STATUS_MAP[c.status] || STATUS_MAP.draft;
                                const progress = getCampaignProgress(c);

                                return (
                                    <div
                                        key={c.id}
                                        className="rounded-xl bg-card border border-border shadow-sm p-5 cursor-pointer hover:shadow-md hover:border-border/80 transition-all animate-fade-in"
                                        onClick={() => setSelectedCampaign(c)}
                                    >
                                        <div className="flex items-start justify-between gap-3">
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2 mb-1">
                                                    <h3 className="text-base font-semibold text-foreground truncate">{c.name}</h3>
                                                    <Badge className={cn('text-[10px] gap-1 border-0 px-2 py-0.5', statusInfo.color)}>
                                                        {statusInfo.icon} {statusInfo.label}
                                                    </Badge>
                                                </div>
                                                {c.description && (
                                                    <p className="text-xs text-muted-foreground mb-3 line-clamp-1">{c.description}</p>
                                                )}
                                                <div className="flex items-center gap-4 text-xs text-muted-foreground font-medium">
                                                    <span className="flex items-center gap-1.5">
                                                        <User className="h-3.5 w-3.5" /> {c.total_contacts || 0} proprietários
                                                    </span>
                                                    <span className="flex items-center gap-1.5">
                                                        <Send className="h-3.5 w-3.5" /> {c.contacted_count || 0} contatados
                                                    </span>
                                                    <span className="flex items-center gap-1.5">
                                                        <MessageSquare className="h-3.5 w-3.5" /> {c.responded_count || 0} responderam
                                                    </span>
                                                    <span className="flex items-center gap-1.5">
                                                        <CheckCircle className="h-3.5 w-3.5" /> {c.updated_count || 0} atualizados
                                                    </span>
                                                    <span className="flex items-center gap-1.5 ml-auto">
                                                        <Calendar className="h-3.5 w-3.5" /> {formatDate(c.created_at)}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                        {(c.total_contacts || 0) > 0 && (
                                            <div className="mt-4 flex items-center gap-3">
                                                <Progress value={progress} className="h-2 flex-1" />
                                                <span className="text-xs font-semibold text-muted-foreground">{progress}%</span>
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )
                ) : (
                    /* ═══ OWNERS TAB ═══ */
                    <div className="bg-card min-h-full">
                        <div className="p-4 pb-0 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                            <div className="relative w-full sm:max-w-md">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                <Input
                                    placeholder="Buscar por nome, telefone ou código..."
                                    value={ownerSearch}
                                    onChange={(e) => { setOwnerSearch(e.target.value); setOwnerPage(0); }}
                                    className="pl-9 h-10 rounded-lg shadow-sm"
                                />
                            </div>
                        </div>

                        {owners.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-20 text-center animate-fade-in">
                                <div className="mx-auto w-16 h-16 rounded-2xl bg-accent/10 flex items-center justify-center mb-4">
                                    <User className="h-8 w-8 text-accent" />
                                </div>
                                <p className="text-foreground font-medium mb-1">Nenhum proprietário encontrado</p>
                                <p className="text-muted-foreground text-sm">Os proprietários aparecerão aqui quando importados.</p>
                            </div>
                        ) : (
                            <div className="p-4">
                                <div className="border border-border rounded-lg overflow-hidden shadow-sm">
                                    <Table>
                                        <TableHeader className="bg-muted/30">
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
                                                <TableHead className="font-semibold">Proprietário</TableHead>
                                                <TableHead className="font-semibold">Contato</TableHead>
                                                <TableHead className="hidden md:table-cell font-semibold">Imóvel</TableHead>
                                                <TableHead className="hidden lg:table-cell font-semibold">Bairro</TableHead>
                                                <TableHead className="hidden sm:table-cell font-semibold">Status</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {owners.map((owner) => (
                                                <TableRow
                                                    key={owner.id}
                                                    className={cn(
                                                        'cursor-pointer hover:bg-muted/50 transition-colors',
                                                        checkedOwners.has(owner.id) && 'bg-primary/5'
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
                                                        <p className="text-sm font-semibold text-foreground">{owner.name}</p>
                                                        {owner.property_type && (
                                                            <span className="text-[11px] text-muted-foreground">{owner.property_type}</span>
                                                        )}
                                                    </TableCell>
                                                    <TableCell onClick={() => setSelectedOwner(owner)}>
                                                        <p className="text-sm text-foreground">{owner.phone}</p>
                                                        {owner.email && <p className="text-[11px] text-muted-foreground">{owner.email}</p>}
                                                    </TableCell>
                                                    <TableCell className="hidden md:table-cell" onClick={() => setSelectedOwner(owner)}>
                                                        <p className="text-sm font-medium text-foreground">{owner.property_code || '—'}</p>
                                                        {owner.property_address && (
                                                            <p className="text-xs text-muted-foreground truncate max-w-[200px] mt-0.5">{owner.property_address}</p>
                                                        )}
                                                    </TableCell>
                                                    <TableCell className="hidden lg:table-cell" onClick={() => setSelectedOwner(owner)}>
                                                        <span className="text-sm text-muted-foreground">{owner.neighborhood || '—'}</span>
                                                    </TableCell>
                                                    <TableCell className="hidden sm:table-cell" onClick={() => setSelectedOwner(owner)}>
                                                        {owner.is_active !== false ? (
                                                            <Badge className="text-xs bg-success/15 text-success border-0 hover:bg-success/20">Ativo</Badge>
                                                        ) : (
                                                            <Badge variant="secondary" className="text-xs">Inativo</Badge>
                                                        )}
                                                    </TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                </div>
                            </div>
                        )}

                        {/* Owners bulk actions */}
                        {checkedOwners.size > 0 && (
                            <div className="flex items-center justify-between px-6 py-4 border-t border-border bg-card animate-fade-in sticky bottom-0 left-0 right-0 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)]">
                                <span className="text-sm font-medium text-foreground">
                                    {checkedOwners.size} selecionado{checkedOwners.size !== 1 ? 's' : ''}
                                </span>
                                <div className="flex items-center gap-3">
                                    <Button variant="outline" size="sm" className="gap-2 shadow-sm" onClick={handleExportOwners}>
                                        <FileText className="h-4 w-4" /> Exportar selecionados
                                    </Button>
                                </div>
                            </div>
                        )}

                        {/* Owners pagination */}
                        {ownerTotalPages > 1 && checkedOwners.size === 0 && (
                            <div className="flex items-center justify-between px-6 py-4 border-t border-border bg-card text-sm">
                                <div className="flex items-center gap-2">
                                    <Select value={PAGE_SIZE.toString()} onValueChange={() => { }}>
                                        <SelectTrigger className="w-[70px] h-8 text-xs">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="50">50</SelectItem>
                                        </SelectContent>
                                    </Select>
                                    <span className="text-xs text-muted-foreground">Itens por página</span>
                                </div>
                                <div className="flex items-center gap-4">
                                    <span className="text-xs text-muted-foreground">
                                        Exibindo {ownerPage * PAGE_SIZE + 1}-{Math.min((ownerPage + 1) * PAGE_SIZE, ownerTotal)} de {ownerTotal}
                                    </span>
                                    <div className="flex gap-1">
                                        <Button variant="ghost" size="icon" className="h-7 w-7" disabled={ownerPage === 0} onClick={() => setOwnerPage(ownerPage - 1)}>
                                            <ChevronLeft className="h-4 w-4" />
                                        </Button>
                                        <Button variant="ghost" size="icon" className="h-7 w-7" disabled={ownerPage >= ownerTotalPages - 1} onClick={() => setOwnerPage(ownerPage + 1)}>
                                            <ChevronRight className="h-4 w-4" />
                                        </Button>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* ═══ NEW CAMPAIGN SHEET (STEPPER DRAWER) ═══ */}
            <Sheet open={showNewCampaign} onOpenChange={(open) => {
                if (!open) { closeNewCampaignDrawer(); }
            }}>
                <SheetContent side="right" className="w-full sm:max-w-md p-0 flex flex-col bg-background border-l border-border">
                    <div className="flex-1 overflow-auto p-6 sm:p-8">
                        {/* Custom Header with Back button if step > 1 */}
                        <div className="flex items-center justify-between mb-8">
                            {campaignStep > 1 ? (
                                <Button variant="ghost" className="px-1 -ml-2 text-primary hover:bg-primary/10 hover:text-primary gap-1 font-medium" onClick={() => setCampaignStep(prev => prev - 1)}>
                                    <ChevronLeft className="h-4 w-4" /> Voltar
                                </Button>
                            ) : <div></div>}
                        </div>

                        {/* STEP 1: Data de Disparo */}
                        {campaignStep === 1 && (
                            <div className="animate-fade-in-right">
                                <h2 className="text-2xl font-display font-bold text-foreground mb-2">Data de disparo</h2>
                                <p className="text-sm text-muted-foreground mb-8">Escolha quando as mensagens serão disparadas pela Aimee.</p>

                                {/* Progress indicators */}
                                <div className="flex items-center gap-2 mb-8">
                                    <div className="h-2 flex-1 rounded-full bg-primary" />
                                    <div className="h-2 flex-1 rounded-full bg-muted" />
                                    <div className="h-2 flex-1 rounded-full bg-muted" />
                                    <span className="text-xs font-semibold whitespace-nowrap ml-2">Passo 1 de 3</span>
                                </div>

                                <h3 className="text-sm font-semibold text-foreground mb-4">Quando a Aimee deve disparar a mensagem?</h3>

                                <div className="bg-card border border-border rounded-xl p-5 shadow-sm space-y-4">
                                    <div>
                                        <Label className="text-xs font-medium text-muted-foreground mb-2 block">Período personalizado</Label>
                                        <div className="flex gap-2">
                                            <div className="relative flex-1">
                                                <Input
                                                    type="date"
                                                    value={newDate}
                                                    onChange={(e) => setNewDate(e.target.value)}
                                                    className="w-full h-10 pr-10 rounded-lg bg-muted/40"
                                                />
                                            </div>
                                            <Select value={newPeriod} onValueChange={setNewPeriod}>
                                                <SelectTrigger className="flex-1 h-10 rounded-lg bg-muted/40">
                                                    <SelectValue placeholder="Período" />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="morning">Manhã (08h às 12h)</SelectItem>
                                                    <SelectItem value="afternoon">Tarde (13h às 18h)</SelectItem>
                                                    <SelectItem value="night">Noite (19h às 21h)</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* STEP 2: Importação */}
                        {campaignStep === 2 && (
                            <div className="animate-fade-in-right">
                                <h2 className="text-2xl font-display font-bold text-foreground mb-2">Planilha de contatos</h2>
                                <p className="text-sm text-muted-foreground mb-8">Faça o upload da planilha contendo os proprietários e imóveis.</p>

                                {/* Progress indicators */}
                                <div className="flex items-center gap-2 mb-8">
                                    <div className="h-2 flex-1 rounded-full bg-primary" />
                                    <div className="h-2 flex-1 rounded-full bg-primary" />
                                    <div className="h-2 flex-1 rounded-full bg-muted" />
                                    <span className="text-xs font-semibold whitespace-nowrap ml-2">Passo 2 de 3</span>
                                </div>

                                <div className="space-y-6">
                                    <div className="border-2 border-dashed border-border rounded-xl p-8 flex flex-col items-center justify-center text-center hover:bg-muted/30 hover:border-primary/50 transition-colors cursor-pointer group">
                                        <div className="bg-primary/10 p-3 rounded-xl text-primary mb-4 group-hover:scale-110 transition-transform">
                                            <UploadCloud className="h-6 w-6" />
                                        </div>
                                        <h4 className="text-sm font-semibold text-foreground mb-1">Clique ou arraste um arquivo aqui</h4>
                                        <p className="text-xs text-muted-foreground max-w-[250px]">
                                            Suportado: CSV, XLSX (Máximo de 1.000 linhas)
                                        </p>
                                    </div>

                                    <div className="bg-primary/5 rounded-xl border border-primary/20 p-4 flex items-center justify-between">
                                        <div>
                                            <h4 className="text-sm font-medium text-foreground">Modelo de planilha</h4>
                                            <p className="text-xs text-muted-foreground">Baixe o modelo para facilitar a importação</p>
                                        </div>
                                        <Button variant="outline" size="sm" className="bg-card shadow-sm gap-2">
                                            <Download className="h-4 w-4" /> Baixar
                                        </Button>
                                    </div>

                                    {/* Mocking name and desc internally in step 2 for Aimee's platform context */}
                                    <div className="pt-4 border-t border-border mt-6 space-y-4">
                                        <div className="space-y-2">
                                            <Label>Nome interno do pedido (opcional)</Label>
                                            <Input
                                                value={newName}
                                                onChange={(e) => setNewName(e.target.value)}
                                                placeholder="Ex: Atualização Centro Fevereiro"
                                                className="bg-muted/40"
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <Label>Instruções adicionais (opcional)</Label>
                                            <Textarea
                                                value={newDesc}
                                                onChange={(e) => setNewDesc(e.target.value)}
                                                placeholder="Ex: Focar em perguntar se aceita pets."
                                                className="bg-muted/40 resize-none"
                                            />
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* STEP 3: Resumo */}
                        {campaignStep === 3 && (
                            <div className="animate-fade-in-right">
                                <h2 className="text-2xl font-display font-bold text-foreground mb-2">Tudo pronto!</h2>
                                <p className="text-sm text-muted-foreground mb-8">Revise seu pedido antes de enviar para a Aimee iniciar os atendimentos.</p>

                                {/* Progress indicators */}
                                <div className="flex items-center gap-2 mb-8">
                                    <div className="h-2 flex-1 rounded-full bg-primary" />
                                    <div className="h-2 flex-1 rounded-full bg-primary" />
                                    <div className="h-2 flex-1 rounded-full bg-primary" />
                                    <span className="text-xs font-semibold whitespace-nowrap ml-2">Passo 3 de 3</span>
                                </div>

                                <div className="bg-muted/30 border border-border rounded-xl p-5 space-y-4 shadow-sm mb-6">
                                    <DetailRow icon={<Calendar className="h-4 w-4" />} label="Data de disparo" value={`${newDate ? new Date(newDate).toLocaleDateString('pt-BR') : 'Data Indefinida'}`} />
                                    <DetailRow icon={<Clock className="h-4 w-4" />} label="Período preferencial" value={newPeriod === 'morning' ? 'Manhã' : newPeriod === 'afternoon' ? 'Tarde' : newPeriod === 'night' ? 'Noite' : 'Qualquer horário'} />
                                    <DetailRow icon={<FileText className="h-4 w-4" />} label="Arquivo em anexo" value="Não anexado (Simulação)" />
                                    {newName && <DetailRow icon={<Info className="h-4 w-4" />} label="Nome" value={newName} />}
                                </div>

                                <div className="bg-warning/10 border border-warning/20 p-4 rounded-xl flex gap-3 text-warning-foreground">
                                    <RefreshCw className="h-5 w-5 shrink-0" />
                                    <div className="text-sm">
                                        <p className="font-semibold mb-1">Aviso</p>
                                        <p className="opacity-90">Ao enviar este pedido, a Aimee iniciará os disparos através do seu WhatsApp conectado na data selecionada. Certifique-se que o QR Code está sincronizado.</p>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Drawer Footer Actions */}
                    <div className="p-4 sm:px-8 sm:py-5 border-t border-border bg-card flex justify-end gap-3 sticky bottom-0">
                        <Button variant="ghost" onClick={closeNewCampaignDrawer} disabled={creating}>
                            Cancelar
                        </Button>
                        {campaignStep < 3 ? (
                            <Button
                                onClick={() => setCampaignStep(prev => prev + 1)}
                                disabled={campaignStep === 1 && (!newDate || !newPeriod)}
                                className="px-6"
                            >
                                Próximo
                            </Button>
                        ) : (
                            <Button onClick={handleCreateCampaign} disabled={creating} className="px-6">
                                {creating ? (
                                    <>
                                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                                        Enviando...
                                    </>
                                ) : 'Enviar pedido'}
                            </Button>
                        )}
                    </div>
                </SheetContent>
            </Sheet>

            {/* ═══ CAMPAIGN DETAIL SHEET (EXISTENTE) ═══ */}
            <Sheet open={!!selectedCampaign} onOpenChange={(open) => !open && setSelectedCampaign(null)}>
                <SheetContent className="w-full sm:max-w-2xl overflow-auto border-l border-border pl-6">
                    {selectedCampaign && (
                        <>
                            <SheetHeader className="mb-6 mt-4">
                                <SheetTitle className="font-display flex items-center justify-between">
                                    <span className="truncate pr-4">{selectedCampaign.name}</span>
                                    <Badge className={cn('text-[11px] gap-1 border-0 shrink-0 px-2 py-1', (STATUS_MAP[selectedCampaign.status] || STATUS_MAP.draft).color)}>
                                        {(STATUS_MAP[selectedCampaign.status] || STATUS_MAP.draft).label}
                                    </Badge>
                                </SheetTitle>
                            </SheetHeader>

                            {/* Stats */}
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
                                <StatCard label="Total" value={selectedCampaign.total_contacts || 0} icon={<User className="h-4 w-4" />} />
                                <StatCard label="Contatados" value={selectedCampaign.contacted_count || 0} icon={<Send className="h-4 w-4" />} />
                                <StatCard label="Responderam" value={selectedCampaign.responded_count || 0} icon={<MessageSquare className="h-4 w-4" />} />
                                <StatCard label="Atualizados" value={selectedCampaign.updated_count || 0} icon={<CheckCircle className="h-4 w-4" />} />
                            </div>

                            {/* Results table */}
                            <div className="flex items-center justify-between mb-4">
                                <h4 className="text-sm font-semibold text-foreground">Acompanhamento em tempo real</h4>
                            </div>

                            {loadingResults ? (
                                <div className="flex items-center justify-center h-32 bg-muted/20 border border-border rounded-xl">
                                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                                </div>
                            ) : campaignResults.length === 0 ? (
                                <div className="flex flex-col items-center justify-center p-8 bg-muted/20 border border-border rounded-xl text-center">
                                    <div className="bg-background p-3 rounded-full mb-3 shadow-sm border border-border/50">
                                        <RefreshCw className="h-5 w-5 text-muted-foreground" />
                                    </div>
                                    <p className="text-sm font-medium text-foreground">Aguardando contatos</p>
                                    <p className="text-xs text-muted-foreground mt-1 max-w-[250px]">Os resultados dos acionamentos aparecerão aqui assim que iniciarem.</p>
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    {campaignResults.map((r) => {
                                        const rStatus = RESULT_STATUS_MAP[r.status] || RESULT_STATUS_MAP.pending;
                                        const pStatus = r.property_status ? (PROPERTY_STATUS_MAP[r.property_status] || null) : null;

                                        return (
                                            <div key={r.id} className="flex flex-col sm:flex-row sm:items-center gap-4 rounded-xl bg-card p-4 border border-border shadow-sm hover:shadow-md transition-shadow">
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-sm font-semibold text-foreground">{r.phone}</p>
                                                    <div className="flex flex-wrap items-center gap-2 mt-2">
                                                        <Badge className={cn('text-[10px] border-0 px-2', rStatus.color)}>{rStatus.label}</Badge>
                                                        {pStatus && (
                                                            <Badge className={cn('text-[10px] border-0 px-2', pStatus.color)}>{pStatus.label}</Badge>
                                                        )}
                                                    </div>
                                                    {r.ai_summary && (
                                                        <div className="mt-3 p-3 bg-muted/30 rounded-lg border border-border/50 text-xs text-muted-foreground">
                                                            <strong className="text-foreground block mb-1">Resumo da Aimee:</strong>
                                                            {r.ai_summary}
                                                        </div>
                                                    )}
                                                </div>
                                                <div className="text-left sm:text-right shrink-0 mt-2 sm:mt-0 pt-3 sm:pt-0 border-t sm:border-0 border-border">
                                                    <p className="text-xs text-muted-foreground flex items-center sm:justify-end gap-1.5 mb-1.5">
                                                        <Send className="h-3 w-3" /> {formatDateTime(r.sent_at)}
                                                    </p>
                                                    {r.replied_at && (
                                                        <p className="text-xs text-success flex items-center sm:justify-end gap-1.5 font-medium">
                                                            <MessageSquare className="h-3 w-3" /> Respondeu {formatDateTime(r.replied_at)}
                                                        </p>
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

            {/* ═══ OWNER DETAIL SHEET (EXISTENTE) ═══ */}
            <Sheet open={!!selectedOwner} onOpenChange={(open) => !open && setSelectedOwner(null)}>
                <SheetContent className="w-full sm:max-w-md border-l border-border pl-6">
                    {selectedOwner && (
                        <>
                            <SheetHeader className="mt-4 border-b border-border pb-4 mb-6">
                                <SheetTitle className="font-display text-xl">{selectedOwner.name}</SheetTitle>
                                {selectedOwner.property_type && (
                                    <span className="text-sm text-muted-foreground">{selectedOwner.property_type}</span>
                                )}
                            </SheetHeader>
                            <div className="space-y-6">
                                <div className="space-y-4">
                                    <h4 className="text-xs font-semibold uppercase text-muted-foreground tracking-wider mb-2">Contato</h4>
                                    <DetailRow icon={<Phone className="h-4 w-4" />} label="Telefone" value={selectedOwner.phone} />
                                    {selectedOwner.email && (
                                        <DetailRow icon={<Mail className="h-4 w-4" />} label="E-mail" value={selectedOwner.email} />
                                    )}
                                </div>
                                <div className="h-px bg-border w-full" />
                                <div className="space-y-4">
                                    <h4 className="text-xs font-semibold uppercase text-muted-foreground tracking-wider mb-2">Imóvel</h4>
                                    {selectedOwner.property_code && (
                                        <DetailRow icon={<Home className="h-4 w-4" />} label="Referência" value={selectedOwner.property_code} />
                                    )}
                                    {selectedOwner.property_address && (
                                        <DetailRow icon={<MapPin className="h-4 w-4" />} label="Endereço" value={selectedOwner.property_address} />
                                    )}
                                    {selectedOwner.neighborhood && (
                                        <DetailRow icon={<MapPin className="h-4 w-4 opacity-0" />} label="Bairro" value={selectedOwner.neighborhood} />
                                    )}
                                </div>

                                <div className="h-px bg-border w-full" />

                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <span className="text-xs text-muted-foreground block mb-2">Status no sistema</span>
                                        {selectedOwner.is_active !== false ? (
                                            <Badge className="text-[11px] bg-success/15 text-success border-0 px-2 py-0.5">Ativo</Badge>
                                        ) : (
                                            <Badge variant="secondary" className="text-[11px] px-2 py-0.5">Inativo</Badge>
                                        )}
                                    </div>
                                    {selectedOwner.tags && selectedOwner.tags.length > 0 && (
                                        <div>
                                            <span className="text-xs text-muted-foreground block mb-2">Tags</span>
                                            <div className="flex flex-wrap gap-1.5">
                                                {selectedOwner.tags.map((t) => (
                                                    <Badge key={t} variant="outline" className="text-[10px] bg-background shadow-sm">{t}</Badge>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>

                                {selectedOwner.notes && (
                                    <div className="bg-muted/30 p-4 rounded-xl border border-border/50">
                                        <span className="text-xs font-semibold text-foreground flex items-center gap-2 mb-2">
                                            <FileText className="h-3.5 w-3.5 text-muted-foreground" /> Notas
                                        </span>
                                        <p className="text-sm text-muted-foreground whitespace-pre-wrap">{selectedOwner.notes}</p>
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
    <div className="rounded-xl bg-card border border-border shadow-sm p-4 flex flex-col hover:border-border/80 transition-colors">
        <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-medium text-muted-foreground">{label}</p>
            <div className="p-1.5 bg-muted rounded-md text-foreground">{icon}</div>
        </div>
        <p className="text-2xl font-bold text-foreground">{value}</p>
    </div>
);

const DetailRow: React.FC<{ icon: React.ReactNode; label: string; value: string }> = ({ icon, label, value }) => (
    <div className="flex items-start gap-3">
        <div className="mt-0.5 text-muted-foreground">{icon}</div>
        <div>
            <span className="text-xs font-medium text-muted-foreground block mb-0.5">{label}</span>
            <p className="text-sm text-foreground">{value}</p>
        </div>
    </div>
);

// Added missing icon that is used inside
const Info = ({ className }: { className?: string }) => (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
        <circle cx="12" cy="12" r="10" />
        <path d="M12 16v-4" />
        <path d="M12 8h.01" />
    </svg>
);

export default AtualizacaoPage;
