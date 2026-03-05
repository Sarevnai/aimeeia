import React, { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
    Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
    Loader2, Plus, Search, Megaphone, Home, Wifi, WifiOff,
    Send, CheckCircle, Clock, XCircle, RefreshCw, FileText, Eye,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import AdminNewCampaignSheet from '@/components/admin/AdminNewCampaignSheet';

/* ─── Types ─── */
interface Tenant {
    id: string;
    company_name: string;
    wa_phone_number_id: string | null;
}

interface Campaign {
    id: string;
    tenant_id: string;
    name: string;
    status: string | null;
    sent_count: number | null;
    delivered_count: number | null;
    template_name: string | null;
    created_at: string | null;
    type: 'marketing';
}

interface UpdateCampaign {
    id: string;
    tenant_id: string;
    name: string;
    status: string;
    total_contacts: number | null;
    contacted_count: number | null;
    responded_count: number | null;
    updated_count: number | null;
    created_at: string | null;
    type: 'atualizacao';
}

type AnyCampaign = Campaign | UpdateCampaign;

/* ─── Helpers ─── */
const formatDate = (d: string | null) => {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' });
};

const CAMPAIGN_STATUS_MAP: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
    draft: { label: 'Rascunho', color: 'bg-muted text-muted-foreground', icon: <FileText className="h-3 w-3" /> },
    scheduled: { label: 'Agendada', color: 'bg-info/15 text-info', icon: <Clock className="h-3 w-3" /> },
    sending: { label: 'Enviando', color: 'bg-warning/15 text-warning', icon: <RefreshCw className="h-3 w-3" /> },
    in_progress: { label: 'Em andamento', color: 'bg-warning/15 text-warning', icon: <RefreshCw className="h-3 w-3" /> },
    sent: { label: 'Enviada', color: 'bg-success/15 text-success', icon: <Send className="h-3 w-3" /> },
    completed: { label: 'Concluída', color: 'bg-success/15 text-success', icon: <CheckCircle className="h-3 w-3" /> },
    cancelled: { label: 'Cancelada', color: 'bg-destructive/15 text-destructive', icon: <XCircle className="h-3 w-3" /> },
};

/* ─── Main Page ─── */
const AdminCampaignsPage: React.FC = () => {
    const { toast } = useToast();

    const [loading, setLoading] = useState(true);
    const [campaigns, setCampaigns] = useState<AnyCampaign[]>([]);
    const [tenants, setTenants] = useState<Tenant[]>([]);
    const [search, setSearch] = useState('');
    const [typeFilter, setTypeFilter] = useState<'all' | 'marketing' | 'atualizacao'>('all');
    const [tenantFilter, setTenantFilter] = useState('all');
    const [statusFilter, setStatusFilter] = useState('all');
    const [sheetOpen, setSheetOpen] = useState(false);

    const fetchAll = async () => {
        setLoading(true);
        const [mktRes, updRes, tenantRes] = await Promise.all([
            supabase
                .from('campaigns')
                .select('id, tenant_id, name, status, sent_count, delivered_count, template_name, created_at')
                .order('created_at', { ascending: false }),
            supabase
                .from('owner_update_campaigns')
                .select('id, tenant_id, name, status, total_contacts, contacted_count, responded_count, updated_count, created_at')
                .order('created_at', { ascending: false }),
            supabase
                .from('tenants')
                .select('id, company_name, wa_phone_number_id')
                .eq('is_active', true)
                .order('company_name'),
        ]);

        if (mktRes.error) toast({ title: 'Erro ao carregar campanhas', description: mktRes.error.message, variant: 'destructive' });
        if (updRes.error) toast({ title: 'Erro ao carregar atualizações', description: updRes.error.message, variant: 'destructive' });

        const mkt: Campaign[] = (mktRes.data || []).map((c) => ({ ...c, type: 'marketing' as const }));
        const upd: UpdateCampaign[] = (updRes.data || []).map((c) => ({ ...c, type: 'atualizacao' as const }));

        setCampaigns([...mkt, ...upd].sort((a, b) =>
            new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()
        ));
        setTenants((tenantRes.data as Tenant[]) ?? []);
        setLoading(false);
    };

    useEffect(() => { fetchAll(); }, []);

    const tenantMap = Object.fromEntries(tenants.map((t) => [t.id, t]));

    const filtered = campaigns.filter((c) => {
        const tenant = tenantMap[c.tenant_id];
        const matchSearch = !search.trim() ||
            c.name.toLowerCase().includes(search.toLowerCase()) ||
            tenant?.company_name.toLowerCase().includes(search.toLowerCase());
        const matchType = typeFilter === 'all' || c.type === typeFilter;
        const matchTenant = tenantFilter === 'all' || c.tenant_id === tenantFilter;
        const matchStatus = statusFilter === 'all' || c.status === statusFilter;
        return matchSearch && matchType && matchTenant && matchStatus;
    });

    /* ─── Stats ─── */
    const stats = {
        total: campaigns.length,
        marketing: campaigns.filter((c) => c.type === 'marketing').length,
        atualizacao: campaigns.filter((c) => c.type === 'atualizacao').length,
        active: campaigns.filter((c) => ['sending', 'in_progress', 'scheduled'].includes(c.status || '')).length,
    };

    return (
        <div className="flex flex-col h-full min-h-screen">
            {/* Header */}
            <div className="p-6 border-b border-border bg-card">
                <div className="flex items-center justify-between mb-4">
                    <div>
                        <h1 className="font-display text-2xl font-bold text-foreground flex items-center gap-2">
                            <Megaphone className="h-6 w-6 text-primary" />
                            Campanhas
                        </h1>
                        <p className="text-sm text-muted-foreground mt-1">
                            Central de campanhas de marketing e atualização de carteira por tenant
                        </p>
                    </div>
                    <Button className="gap-1.5" onClick={() => setSheetOpen(true)}>
                        <Plus className="h-4 w-4" /> Nova Campanha
                    </Button>
                </div>

                {/* Stats */}
                <div className="grid grid-cols-4 gap-4 mb-4">
                    {[
                        { label: 'Total', value: stats.total, color: '' },
                        { label: 'Marketing', value: stats.marketing, color: 'text-primary' },
                        { label: 'Atualização', value: stats.atualizacao, color: 'text-warning' },
                        { label: 'Ativas', value: stats.active, color: 'text-success' },
                    ].map((s) => (
                        <div key={s.label} className="rounded-xl border border-border bg-background p-3 text-center">
                            <p className={cn('text-2xl font-bold', s.color || 'text-foreground')}>{s.value}</p>
                            <p className="text-xs text-muted-foreground">{s.label}</p>
                        </div>
                    ))}
                </div>

                {/* Filters */}
                <div className="flex gap-2 flex-wrap">
                    <div className="relative flex-1 min-w-48">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                            placeholder="Buscar por nome ou tenant..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            className="pl-9 h-9"
                        />
                    </div>
                    <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v as any)}>
                        <SelectTrigger className="w-44 h-9"><SelectValue /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">Todos os tipos</SelectItem>
                            <SelectItem value="marketing">Marketing</SelectItem>
                            <SelectItem value="atualizacao">Atualização</SelectItem>
                        </SelectContent>
                    </Select>
                    <Select value={tenantFilter} onValueChange={setTenantFilter}>
                        <SelectTrigger className="w-52 h-9"><SelectValue placeholder="Todos os tenants" /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">Todos os tenants</SelectItem>
                            {tenants.map((t) => (
                                <SelectItem key={t.id} value={t.id}>{t.company_name}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    <Select value={statusFilter} onValueChange={setStatusFilter}>
                        <SelectTrigger className="w-36 h-9"><SelectValue /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">Todos status</SelectItem>
                            <SelectItem value="draft">Rascunho</SelectItem>
                            <SelectItem value="scheduled">Agendada</SelectItem>
                            <SelectItem value="in_progress">Em andamento</SelectItem>
                            <SelectItem value="completed">Concluída</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-auto p-6">
                {loading ? (
                    <div className="space-y-3">
                        {[1, 2, 3, 4].map((i) => <div key={i} className="skeleton h-20 w-full rounded-xl" />)}
                    </div>
                ) : filtered.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-24 text-center animate-fade-in">
                        <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
                            <Megaphone className="h-8 w-8 text-primary" />
                        </div>
                        <p className="font-medium text-foreground mb-1">
                            {campaigns.length === 0 ? 'Nenhuma campanha criada' : 'Nenhuma campanha encontrada'}
                        </p>
                        <p className="text-sm text-muted-foreground max-w-xs mb-4">
                            {campaigns.length === 0
                                ? 'Crie campanhas de marketing ou pedidos de atualização de carteira.'
                                : 'Tente ajustar os filtros de busca.'}
                        </p>
                        {campaigns.length === 0 && (
                            <Button size="sm" onClick={() => setSheetOpen(true)} className="gap-1.5">
                                <Plus className="h-4 w-4" /> Criar Campanha
                            </Button>
                        )}
                    </div>
                ) : (
                    <div className="space-y-3 max-w-5xl">
                        {filtered.map((c) => {
                            const tenant = tenantMap[c.tenant_id];
                            const hasWABA = !!tenant?.wa_phone_number_id;
                            const statusInfo = CAMPAIGN_STATUS_MAP[c.status || 'draft'] || CAMPAIGN_STATUS_MAP.draft;

                            return (
                                <div
                                    key={`${c.type}-${c.id}`}
                                    className="rounded-xl bg-card border border-border p-4 shadow-sm hover:shadow-md hover:border-border/80 transition-all animate-fade-in"
                                >
                                    <div className="flex items-start gap-4">
                                        {/* Type icon */}
                                        <div className={cn(
                                            'p-2.5 rounded-xl shrink-0 mt-0.5',
                                            c.type === 'marketing' ? 'bg-primary/10 text-primary' : 'bg-warning/10 text-warning'
                                        )}>
                                            {c.type === 'marketing' ? (
                                                <Megaphone className="h-5 w-5" />
                                            ) : (
                                                <Home className="h-5 w-5" />
                                            )}
                                        </div>

                                        <div className="flex-1 min-w-0">
                                            {/* Row 1 */}
                                            <div className="flex items-center gap-2 flex-wrap mb-1.5">
                                                <h3 className="text-sm font-semibold text-foreground truncate">{c.name}</h3>
                                                <Badge className={cn('text-[10px] gap-1 border-0 px-2 py-0.5', statusInfo.color)}>
                                                    {statusInfo.icon} {statusInfo.label}
                                                </Badge>
                                                <Badge variant="outline" className="text-[10px]">
                                                    {c.type === 'marketing' ? 'Marketing' : 'Atualização'}
                                                </Badge>
                                            </div>

                                            {/* Row 2 — Tenant + WABA */}
                                            <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                                                <span className="flex items-center gap-1 font-medium">
                                                    {hasWABA
                                                        ? <Wifi className="h-3 w-3 text-success" />
                                                        : <WifiOff className="h-3 w-3 text-muted-foreground" />}
                                                    {tenant?.company_name || 'Tenant desconhecido'}
                                                </span>

                                                {c.type === 'marketing' ? (() => {
                                                    const mc = c as Campaign;
                                                    return (
                                                        <>
                                                            {mc.template_name && (
                                                                <span className="font-mono bg-muted px-1.5 py-0.5 rounded text-[10px]">
                                                                    {mc.template_name}
                                                                </span>
                                                            )}
                                                            <span className="flex items-center gap-1">
                                                                <Send className="h-3 w-3" /> {mc.sent_count || 0} enviados
                                                            </span>
                                                            <span className="flex items-center gap-1">
                                                                <CheckCircle className="h-3 w-3" /> {mc.delivered_count || 0} entregues
                                                            </span>
                                                        </>
                                                    );
                                                })() : (() => {
                                                    const uc = c as UpdateCampaign;
                                                    return (
                                                        <>
                                                            <span>{uc.total_contacts || 0} proprietários</span>
                                                            <span>{uc.contacted_count || 0} contatados</span>
                                                            <span>{uc.responded_count || 0} responderam</span>
                                                            <span>{uc.updated_count || 0} atualizados</span>
                                                        </>
                                                    );
                                                })()}

                                                <span className="ml-auto">{formatDate(c.created_at)}</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            <AdminNewCampaignSheet
                open={sheetOpen}
                onOpenChange={setSheetOpen}
                onCreated={fetchAll}
            />
        </div>
    );
};

export default AdminCampaignsPage;
