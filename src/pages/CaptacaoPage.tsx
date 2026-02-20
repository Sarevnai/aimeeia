import React, { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useTenant } from '@/contexts/TenantContext';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Loader2, Radar, MessageSquare, Search, ExternalLink, MapPin, DollarSign, Home } from 'lucide-react';
import { cn } from '@/lib/utils';

/* ─── types ─── */

interface CaptacaoNotification {
    id: string;
    contactName: string | null;
    phone: string;
    neighborhood: string | null;
    propertyType: string | null;
    budgetMax: number | null;
    interest: string | null;
    convId: string | null;
    createdAt: string | null;
}

/* ─── Main ─── */

const CaptacaoPage: React.FC = () => {
    const { tenantId } = useTenant();
    const navigate = useNavigate();
    const [notifications, setNotifications] = useState<CaptacaoNotification[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');

    useEffect(() => {
        if (!tenantId) return;
        setLoading(true);

        const fetchCaptacao = async () => {
            // Fetch leads with interest in selling or specific property types
            const { data: quals } = await supabase
                .from('lead_qualification')
                .select('*')
                .eq('tenant_id', tenantId)
                .order('updated_at', { ascending: false })
                .limit(100);

            if (!quals || quals.length === 0) {
                setNotifications([]);
                setLoading(false);
                return;
            }

            // Parallel: get contacts + conversations for these leads
            const phones = quals.map((q) => q.phone_number);
            const [contactsRes, convsRes] = await Promise.all([
                supabase
                    .from('contacts')
                    .select('phone, name')
                    .eq('tenant_id', tenantId)
                    .in('phone', phones),
                supabase
                    .from('conversations')
                    .select('id, phone_number')
                    .eq('tenant_id', tenantId)
                    .in('phone_number', phones),
            ]);

            const contactMap: Record<string, string> = {};
            (contactsRes.data ?? []).forEach((c) => {
                contactMap[c.phone] = c.name || '';
            });

            const convMap: Record<string, string> = {};
            (convsRes.data ?? []).forEach((c) => {
                if (!convMap[c.phone_number]) convMap[c.phone_number] = c.id;
            });

            const items: CaptacaoNotification[] = quals.map((q) => ({
                id: q.id,
                contactName: contactMap[q.phone_number] || null,
                phone: q.phone_number,
                neighborhood: q.detected_neighborhood,
                propertyType: q.detected_property_type,
                budgetMax: q.detected_budget_max,
                interest: q.detected_interest,
                convId: convMap[q.phone_number] || null,
                createdAt: q.updated_at || q.started_at,
            }));

            setNotifications(items);
            setLoading(false);
        };

        fetchCaptacao();
    }, [tenantId]);

    const filtered = search.trim()
        ? notifications.filter(
            (n) =>
                n.contactName?.toLowerCase().includes(search.toLowerCase()) ||
                n.phone.includes(search) ||
                n.neighborhood?.toLowerCase().includes(search.toLowerCase())
        )
        : notifications;

    const formatCurrency = (val: number | null) => {
        if (!val) return '—';
        return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(val);
    };

    const formatDate = (d: string | null) => {
        if (!d) return '';
        return new Date(d).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' });
    };

    return (
        <div className="p-4 md:p-6 space-y-6 max-w-5xl mx-auto">
            {/* Header */}
            <div>
                <div className="flex items-center gap-2 mb-1">
                    <Radar className="h-5 w-5 text-accent" />
                    <h2 className="font-display text-2xl font-bold text-foreground">Captação</h2>
                </div>
                <p className="text-sm text-muted-foreground">
                    A Aimee identifica automaticamente leads com intenção de venda ou imóveis que possam ser captados.
                </p>
            </div>

            {/* Search */}
            <div className="relative max-w-md">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                    placeholder="Buscar por nome, telefone ou bairro..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="pl-9 h-9"
                />
            </div>

            {/* Notifications */}
            {loading ? (
                <div className="space-y-3">
                    {[1, 2, 3].map(i => <div key={i} className="skeleton h-20 w-full" />)}
                </div>
            ) : filtered.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-center animate-fade-in">
                    <div className="mx-auto w-16 h-16 rounded-2xl bg-accent/10 flex items-center justify-center mb-4">
                        <Radar className="h-8 w-8 text-accent" />
                    </div>
                    <p className="text-foreground font-medium mb-1">Nenhuma oportunidade de captação</p>
                    <p className="text-muted-foreground text-sm max-w-sm">A Aimee notificará aqui quando detectar leads com intenção de venda ou troca de imóvel.</p>
                </div>
            ) : (
                <div className="space-y-3">
                    {filtered.map((n) => (
                        <div
                            key={n.id}
                            className="card-interactive flex items-start gap-4 p-4 animate-fade-in"
                        >
                            {/* Icon */}
                            <div className="shrink-0 p-2.5 rounded-lg bg-accent/10">
                                <Radar className="h-5 w-5 text-accent" />
                            </div>

                            {/* Content */}
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-1">
                                    <span className="text-sm font-semibold text-foreground">
                                        {n.contactName || n.phone}
                                    </span>
                                    {n.interest && (
                                        <Badge variant="secondary" className="text-[10px]">
                                            {n.interest}
                                        </Badge>
                                    )}
                                    <span className="text-[10px] text-muted-foreground ml-auto">
                                        {formatDate(n.createdAt)}
                                    </span>
                                </div>

                                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                                    {n.neighborhood && (
                                        <span className="flex items-center gap-1">
                                            <MapPin className="h-3 w-3" /> {n.neighborhood}
                                        </span>
                                    )}
                                    {n.propertyType && (
                                        <span className="flex items-center gap-1">
                                            <Home className="h-3 w-3" /> {n.propertyType}
                                        </span>
                                    )}
                                    {n.budgetMax && (
                                        <span className="flex items-center gap-1">
                                            <DollarSign className="h-3 w-3" /> {formatCurrency(n.budgetMax)}
                                        </span>
                                    )}
                                </div>
                            </div>

                            {/* Action */}
                            {n.convId && (
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="shrink-0 text-xs gap-1.5"
                                    onClick={() => navigate(`/chat/${n.convId}`)}
                                >
                                    <MessageSquare className="h-3.5 w-3.5" /> Ver conversa
                                </Button>
                            )}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

export default CaptacaoPage;
