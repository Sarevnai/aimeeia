import React, { useState } from 'react';
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

// ── Mock data ─────────────────────────────────────────────────────────

interface Tenant {
    id: string;
    company_name: string;
    city: string;
    state: string;
    plan: string;
    status: TenantStatus;
    conversations_month: number;
    leads_month: number;
    users_count: number;
    created_at: string;
    is_active: boolean;
}

const mockTenants: Tenant[] = [
    {
        id: '1', company_name: 'Smolka Imóveis', city: 'Porto Alegre', state: 'RS',
        plan: 'Pro', status: 'active', conversations_month: 423, leads_month: 89,
        users_count: 6, created_at: '2025-08-15', is_active: true,
    },
    {
        id: '2', company_name: 'Casa Verde Imobiliária', city: 'São Paulo', state: 'SP',
        plan: 'Enterprise', status: 'active', conversations_month: 312, leads_month: 67,
        users_count: 14, created_at: '2025-07-20', is_active: true,
    },
    {
        id: '3', company_name: 'Porto Seguro Realty', city: 'Curitiba', state: 'PR',
        plan: 'Pro', status: 'active', conversations_month: 287, leads_month: 54,
        users_count: 8, created_at: '2025-09-10', is_active: true,
    },
    {
        id: '4', company_name: 'Horizonte Imóveis', city: 'Florianópolis', state: 'SC',
        plan: 'Starter', status: 'active', conversations_month: 198, leads_month: 41,
        users_count: 3, created_at: '2025-10-05', is_active: true,
    },
    {
        id: '5', company_name: 'Nova Era Construtora', city: 'Belo Horizonte', state: 'MG',
        plan: 'Pro', status: 'trial', conversations_month: 145, leads_month: 28,
        users_count: 5, created_at: '2026-01-22', is_active: true,
    },
    {
        id: '6', company_name: 'Alto Padrão Imóveis', city: 'Brasília', state: 'DF',
        plan: 'Starter', status: 'trial', conversations_month: 67, leads_month: 12,
        users_count: 2, created_at: '2026-02-01', is_active: true,
    },
    {
        id: '7', company_name: 'Real Estate SP', city: 'São Paulo', state: 'SP',
        plan: 'Pro', status: 'past_due', conversations_month: 89, leads_month: 15,
        users_count: 4, created_at: '2025-11-30', is_active: true,
    },
    {
        id: '8', company_name: 'Imobiliária Sol Nascente', city: 'Recife', state: 'PE',
        plan: 'Starter', status: 'cancelled', conversations_month: 0, leads_month: 0,
        users_count: 2, created_at: '2025-06-15', is_active: false,
    },
];

// ── Component ─────────────────────────────────────────────────────────

const AdminTenantsPage: React.FC = () => {
    const navigate = useNavigate();
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState<string>('all');
    const [planFilter, setPlanFilter] = useState<string>('all');

    const filtered = mockTenants.filter((t) => {
        const matchesSearch = t.company_name.toLowerCase().includes(search.toLowerCase()) ||
            t.city.toLowerCase().includes(search.toLowerCase());
        const matchesStatus = statusFilter === 'all' || t.status === statusFilter;
        const matchesPlan = planFilter === 'all' || t.plan.toLowerCase() === planFilter;
        return matchesSearch && matchesStatus && matchesPlan;
    });

    return (
        <div className="flex flex-col h-[calc(100vh-4rem)]">
            {/* Header */}
            <div className="p-4 md:px-6 border-b border-border bg-card space-y-4">
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="font-display text-2xl font-bold text-foreground">Tenants</h1>
                        <p className="text-sm text-muted-foreground mt-1">
                            Gerencie todos os clientes da plataforma
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
                            <SelectItem value="trial">Trial</SelectItem>
                            <SelectItem value="past_due">Em atraso</SelectItem>
                            <SelectItem value="cancelled">Cancelados</SelectItem>
                        </SelectContent>
                    </Select>
                    <Select value={planFilter} onValueChange={setPlanFilter}>
                        <SelectTrigger className="w-[140px] h-9 text-sm">
                            <SelectValue placeholder="Plano" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">Todos</SelectItem>
                            <SelectItem value="starter">Starter</SelectItem>
                            <SelectItem value="pro">Pro</SelectItem>
                            <SelectItem value="enterprise">Enterprise</SelectItem>
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
                            <th className="text-left text-xs font-medium text-muted-foreground py-3 px-4 hidden lg:table-cell">Localização</th>
                            <th className="text-left text-xs font-medium text-muted-foreground py-3 px-4">Plano</th>
                            <th className="text-left text-xs font-medium text-muted-foreground py-3 px-4">Status</th>
                            <th className="text-right text-xs font-medium text-muted-foreground py-3 px-4 hidden md:table-cell">
                                <div className="flex items-center justify-end gap-1">
                                    <MessageSquare className="h-3 w-3" /> Conversas
                                </div>
                            </th>
                            <th className="text-right text-xs font-medium text-muted-foreground py-3 px-4 hidden md:table-cell">
                                <div className="flex items-center justify-end gap-1">
                                    <Users className="h-3 w-3" /> Leads
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
                                    <span className="text-xs font-medium text-muted-foreground bg-muted px-2 py-0.5 rounded">
                                        {tenant.plan}
                                    </span>
                                </td>
                                <td className="py-3 px-4">
                                    <TenantStatusBadge status={tenant.status} />
                                </td>
                                <td className="py-3 px-4 text-right hidden md:table-cell">
                                    <span className="text-sm font-semibold text-foreground">{tenant.conversations_month}</span>
                                </td>
                                <td className="py-3 px-4 text-right hidden md:table-cell">
                                    <span className="text-sm text-muted-foreground">{tenant.leads_month}</span>
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
