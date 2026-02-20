import React from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
    LayoutDashboard,
    Building2,
    CreditCard,
    Bot,
    TrendingUp,
    ChevronLeft,
    ChevronRight,
    Zap,
    FileText,
    ScrollText,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Separator } from '@/components/ui/separator';

interface NavItem {
    label: string;
    icon: React.ElementType;
    path: string;
}

interface NavGroup {
    label?: string;
    items: NavItem[];
}

interface AdminSidebarProps {
    collapsed: boolean;
    onToggle: () => void;
}

const AdminSidebar: React.FC<AdminSidebarProps> = ({ collapsed, onToggle }) => {
    const location = useLocation();

    const navGroups: NavGroup[] = [
        {
            items: [
                { label: 'Dashboard', icon: LayoutDashboard, path: '/admin' },
            ],
        },
        {
            label: 'Clientes',
            items: [
                { label: 'Tenants', icon: Building2, path: '/admin/tenants' },
                { label: 'Billing', icon: CreditCard, path: '/admin/billing' },
            ],
        },
        {
            label: 'Produto',
            items: [
                { label: 'Agente Aimee', icon: Bot, path: '/admin/agent' },
                { label: 'Planos', icon: ScrollText, path: '/admin/billing' },
            ],
        },
        {
            label: 'Operações',
            items: [
                { label: 'Métricas', icon: TrendingUp, path: '/admin/metrics' },
                { label: 'Logs de Erro', icon: FileText, path: '/admin/metrics' },
            ],
        },
    ];

    return (
        <aside
            className={cn(
                'hidden md:flex flex-col transition-all duration-300 ease-in-out border-r',
                collapsed ? 'w-16' : 'w-60'
            )}
            style={{
                background: 'linear-gradient(180deg, hsl(250 30% 14%) 0%, hsl(250 25% 10%) 100%)',
                borderColor: 'hsl(250 20% 20%)',
                color: 'hsl(250 15% 75%)',
            }}
        >
            {/* Branding */}
            <div className="flex h-16 items-center px-4 border-b" style={{ borderColor: 'hsl(250 20% 20%)' }}>
                {!collapsed ? (
                    <div className="flex items-center gap-2.5 min-w-0">
                        <div className="flex items-center justify-center w-8 h-8 rounded-lg" style={{ background: 'hsl(250 70% 60%)' }}>
                            <Zap className="h-4 w-4 text-white" />
                        </div>
                        <div className="min-w-0">
                            <h1 className="text-sm font-bold text-white truncate font-display">
                                Aimee<span style={{ color: 'hsl(250 70% 70%)' }}>.Platform</span>
                            </h1>
                            <p className="text-[10px] opacity-50">Admin Central</p>
                        </div>
                    </div>
                ) : (
                    <div className="flex items-center justify-center w-8 h-8 rounded-lg mx-auto" style={{ background: 'hsl(250 70% 60%)' }}>
                        <Zap className="h-4 w-4 text-white" />
                    </div>
                )}
            </div>

            {/* Navigation */}
            <nav className="flex-1 overflow-y-auto py-2 px-2">
                {navGroups.map((group, gi) => (
                    <div key={gi}>
                        {gi > 0 && (
                            <Separator className="my-2" style={{ backgroundColor: 'hsl(250 20% 20%)' }} />
                        )}
                        {group.label && !collapsed && (
                            <span className="block px-3 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'hsl(250 15% 45%)' }}>
                                {group.label}
                            </span>
                        )}
                        <div className="space-y-0.5">
                            {group.items.map((item) => {
                                const isActive = item.path === '/admin'
                                    ? location.pathname === '/admin'
                                    : location.pathname.startsWith(item.path) && item.path !== '/admin';

                                return (
                                    <NavLink
                                        key={item.label + item.path}
                                        to={item.path}
                                        className={cn(
                                            'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                                            isActive
                                                ? 'text-white'
                                                : 'hover:text-white'
                                        )}
                                        style={isActive ? { backgroundColor: 'hsl(250 40% 25%)' } : {}}
                                    >
                                        <item.icon className="h-5 w-5 shrink-0" />
                                        {!collapsed && (
                                            <span className="flex-1 truncate">{item.label}</span>
                                        )}
                                    </NavLink>
                                );
                            })}
                        </div>
                    </div>
                ))}
            </nav>

            {/* Collapse toggle */}
            <button
                onClick={onToggle}
                className="flex items-center justify-center h-12 border-t transition-colors hover:text-white"
                style={{ borderColor: 'hsl(250 20% 20%)' }}
            >
                {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
            </button>
        </aside>
    );
};

export default AdminSidebar;
