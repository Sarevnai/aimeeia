import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Search,
    Plus,
    Building2,
    MoreHorizontal,
    MessageSquare,
    Users,
    Calendar,
    Filter,
    Loader2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import TenantStatusBadge, { type TenantStatus } from '@/components/admin/TenantStatusBadge';
import { supabase } from '@/integrations/supabase/client';

// ── Types ─────────────────────────────────────────────────────────────

interface Tenant {
    id: string;
    company_name: string;
    city: string;
    state: string;
    status: TenantStatus;
    conversations_month: number;
    contacts_count: number;
    users_count: number;
    created_at: string;
    is_active: boolean;
}

// ── Component ─────────────────────────────────────────────────────────

const AdminTenantsPage: React.FC = () => {
    const navigate = useNavigate();
    const [loading, setLoading] = useState(true);
    const [tenants, setTenants] = useState<Tenant[]>([]);
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState<string>('all');

    useEffect(() => {
        loadTenants();
    }, []);

    const loadTenants = async () => {
        setLoading(true);
        try {
            // Load all tenants
            const { data: tenantsData } = await supabase
                .from('tenants')
                .select('id, company_name, city, state, is_active, created_at')
                .order('company_name');

            if (!tenantsData || tenantsData.length === 0) {
                setTenants([]);
                return;
            }

            const monthStart = new Date();
            monthStart.setDate(1);
            monthStart.setHours(0, 0, 0, 0);

            // Enrich each tenant with metrics
            const enriched: Tenant[] = [];

            for (const t of tenantsData) {
                const { count: convCount } = await supabase
                    .from('conversations')
                    .select('id', { count: 'exact', head: true })
                    .eq('tenant_id', t.id)
                    .gte('created_at', monthStart.toISOString());

                const { count: contactCount } = await supabase
                    .from('contacts')
                    .select('id', { count: 'exact', head: true })
                    .eq('tenant_id', t.id);

                const { count: usersCount } = await supabase
                    .from('profiles')
                    .select('id', { count: 'exact', head: true })
                    .eq('tenant_id', t.id);

                enriched.push({
                    id: t.id,
                    company_name: t.company_name,
                    city: t.city || '',
                    state: t.state || '',
                    is_active: t.is_active ?? true,
                    status: (t.is_active ?? true) ? 'active' : 'inactive',
                    conversations_month: convCount ?? 0,
                    contacts_count: contactCount ?? 0,
                    users_count: usersCount ?? 0,
                    created_at: t.created_at,
                });
            }

            // Sort by conversations desc
            enriched.sort((a, b) => b.conversations_month - a.conversations_month);
            setTenants(enriched);
        } catch (error) {
            console.error('Error loading tenants:', error);
        } finally {
            setLoading(false);
        }
    };

    const filtered = tenants.filter((t) => {
        const matchesSearch =
            t.company_name.toLowerCase().includes(search.toLowerCase()) ||
            t.city.toLowerCase().includes(search.toLowerCase());
        const matchesStatus = statusFilter === 'all' || t.status === statusFilter;
        return matchesSearch && matchesStatus;
    });

    if (loading) {
        return (
            <div className="flex flex-col h-[calc(100vh-4rem)]">
                <div className="p-4 md:px-6 border-b border-border bg-card space-y-4">
                    <div className="space-y-1">
                        <div className="skeleton h-7 w-32" />
                        <div className="skeleton h-4 w-56" />
                    </div>
                    <div className="flex flex-wrap items-center gap-3">
                        <div className="skeleton h-9 w-64" />
                        <div className="skeleton h-9 w-[140px]" />
                    </div>
                </div>
                <div className="flex-1 p-4 space-y-3">
                    {[1, 2, 3, 4, 5].map((i) => (
                        <div key={i} className="flex items-center gap-4 p-3 rounded-lg">
                            <div className="skeleton h-9 w-9 rounded-lg" />
                            <div className="flex-1 space-y-1">
                                <div className="skeleton h-4 w-40" />
                                <div className="skeleton h-3 w-24" />
                            </div>
                            <div className="skeleton h-5 w-16 rounded-full" />
                            <div className="skeleton h-4 w-12 hidden md:block" />
                        </div>
                    ))}
                </div>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-[calc(100vh-4rem)]">
            {/* Header */}
            <div className="p-4 md:px-6 border-b border-border bg-card space-y-4">
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="font-display text-2xl font-bold text-foreground">Tenants</h1>
                        <p className="text-sm text-muted-foreground mt-1">
                            {tenants.length} cliente{tenants.length !== 1 ? 's' : ''} na plataforma
                        </p>
                    </div>
                    <Button size="sm" className="gap-1.5" style={{ background: 'hsl(250 70% 60%)' }}>
                        <Plus className="h-4 w-4" />
                        Novo Tenant
                    </Button>
                </div>

                {/* Filters */}
                <div className="flex flex-wrap items-center gap-3">
                    <div className="relative flex-1 min-w-[200px] max-w-sm">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                            placeholder="Buscar por nome ou cidade..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            className="pl-9 h-9 text-sm"
                        />
                    </div>
                    <Select value={statusFilter} onValueChange={setStatusFilter}>
                        <SelectTrigger className="w-[140px] h-9 text-sm">
                            <Filter className="h-3.5 w-3.5 mr-1.5 text-muted-foreground" />
                            <SelectValue placeholder="Status" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">Todos</SelectItem>
                            <SelectItem value="active">Ativos</SelectItem>
                            <SelectItem value="inactive">Inativos</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
            </div>

            {/* Table */}
            <div className="flex-1 overflow-auto">
                <table className="w-full">
                    <thead className="sticky top-0 bg-card z-10">
                        <tr className="border-b border-border">
                            <th className="text-left text-xs font-medium text-muted-foreground py-3 px-4 md:px-6">Empresa</th>
                            <th className="text-left text-xs font-medium text-muted-foreground py-3 px-4 hidden lg:table-cell">Localiza\u00e7\u00e3o</th>
                            <th className="text-left text-xs font-medium text-muted-foreground py-3 px-4">Status</th>
                            <th className="text-right text-xs font-medium text-muted-foreground py-3 px-4 hidden md:table-cell">
                                <div className="flex items-center justify-end gap-1">
                                    <MessageSquare className="h-3 w-3" /> Conversas
                                </div>
                            </th>
                            <th className="text-right text-xs font-medium text-muted-foreground py-3 px-4 hidden md:table-cell">
                                <div className="flex items-center justify-end gap-1">
                                    <Users className="h-3 w-3" /> Contatos
                                </div>
                            </th>
                            <th className="text-right text-xs font-medium text-muted-foreground py-3 px-4 hidden md:table-cell">
                                <div className="flex items-center justify-end gap-1">
                                    <Users className="h-3 w-3" /> Usu\u00e1rios
                                </div>
                            </th>
                            <th className="text-right text-xs font-medium text-muted-foreground py-3 px-4 hidden lg:table-cell">
                                <div className="flex items-center justify-end gap-1">
                                    <Calendar className="h-3 w-3" /> Criado em
                                </div>
                            </th>
                            <th className="text-right text-xs font-medium text-muted-foreground py-3 px-4"></th>
                        </tr>
                    </thead>
                    <tbody>
                        {filtered.map((tenant) => (
                            <tr
                                key={tenant.id}
                                className="border-b border-border/50 hover:bg-muted/30 transition-colors cursor-pointer"
                                onClick={() => navigate(`/admin/tenants/${tenant.id}`)}
                            >
                                <td className="py-3 px-4 md:px-6">
                                    <div className="flex items-center gap-3">
                                        <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-muted text-xs font-bold text-foreground shrink-0">
                                            {tenant.company_name.charAt(0)}
                                        </div>
                                        <div className="min-w-0">
                                            <p className="text-sm font-medium text-foreground truncate">{tenant.company_name}</p>
                                            <p className="text-xs text-muted-foreground lg:hidden">{tenant.city}/{tenant.state}</p>
                                        </div>
                                    </div>
                                </td>
                                <td className="py-3 px-4 hidden lg:table-cell">
                                    <span className="text-sm text-muted-foreground">{tenant.city}/{tenant.state}</span>
                                </td>
                                <td className="py-3 px-4">
                                    <TenantStatusBadge status={tenant.status} />
                                </td>
                                <td className="py-3 px-4 text-right hidden md:table-cell">
                                    <span className="text-sm font-semibold text-foreground">{tenant.conversations_month}</span>
                                </td>
                                <td className="py-3 px-4 text-right hidden md:table-cell">
                                    <span className="text-sm text-muted-foreground">{tenant.contacts_count}</span>
                                </td>
                                <td className="py-3 px-4 text-right hidden md:table-cell">
                                    <span className="text-sm text-muted-foreground">{tenant.users_count}</span>
                                </td>
                                <td className="py-3 px-4 text-right hidden lg:table-cell">
                                    <span className="text-xs text-muted-foreground">
                                        {new Date(tenant.created_at).toLocaleDateString('pt-BR')}
                                    </span>
                                </td>
                                <td className="py-3 px-4 text-right">
                                    <Button variant="ghost" size="icon" className="h-8 w-8">
                                        <MoreHorizontal className="h-4 w-4 text-muted-foreground" />
                                    </Button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>

                {filtered.length === 0 && (
                    <div className="flex flex-col items-center justify-center py-16 animate-fade-in">
                        <div className="flex items-center justify-center w-14 h-14 rounded-full bg-muted mb-4">
                            <Building2 className="h-6 w-6 text-muted-foreground" />
                        </div>
                        <p className="text-sm font-medium text-foreground">Nenhum tenant encontrado</p>
                        <p className="text-xs text-muted-foreground mt-1">Tente ajustar os filtros de busca</p>
                    </div>
                )}
            </div>
        </div>
    );
};

export default AdminTenantsPage;
