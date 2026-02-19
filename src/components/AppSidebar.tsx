import React, { useEffect, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  MessageSquare,
  Users,
  Kanban,
  Megaphone,
  BarChart3,
  Building2,
  Settings,
  Shield,
  BookOpen,
  HelpCircle,
  ChevronLeft,
  ChevronRight,
  Radar,
  RefreshCw,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTenant } from '@/contexts/TenantContext';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';

interface NavItem {
  label: string;
  icon: React.ElementType;
  path: string;
  badge?: number;
  external?: boolean;
}

interface NavGroup {
  label?: string;
  items: NavItem[];
}

interface AppSidebarProps {
  collapsed: boolean;
  onToggle: () => void;
}

const AppSidebar: React.FC<AppSidebarProps> = ({ collapsed, onToggle }) => {
  const location = useLocation();
  const { tenantId, tenantInfo } = useTenant();
  const [activeConvCount, setActiveConvCount] = useState(0);

  useEffect(() => {
    if (!tenantId) return;
    supabase
      .from('conversations')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .eq('status', 'active')
      .then(({ count }) => setActiveConvCount(count ?? 0));
  }, [tenantId]);

  const navGroups: NavGroup[] = [
    {
      items: [
        { label: 'Início', icon: LayoutDashboard, path: '/' },
        { label: 'Conversas', icon: MessageSquare, path: '/inbox', badge: activeConvCount },
      ],
    },
    {
      label: 'Atendimento',
      items: [
        { label: 'Leads', icon: Users, path: '/leads' },
        { label: 'Pipeline', icon: Kanban, path: '/pipeline' },
        { label: 'Captação', icon: Radar, path: '/captacao' },
        { label: 'Relatórios', icon: BarChart3, path: '/relatorios' },
      ],
    },
    {
      label: 'Gestão',
      items: [
        { label: 'Empreendimentos', icon: Building2, path: '/empreendimentos' },
        { label: 'Campanhas', icon: Megaphone, path: '/campanhas' },
        { label: 'Atualização', icon: RefreshCw, path: '/atualizacao' },
      ],
    },
    {
      label: 'Configurações',
      items: [
        { label: 'Minha Aimee', icon: Settings, path: '/minha-aimee' },
        { label: 'Acessos', icon: Shield, path: '/acessos' },
      ],
    },
    {
      label: 'Ajuda',
      items: [
        { label: 'Guia da Aimee', icon: BookOpen, path: '/guia' },
      ],
    },
  ];

  return (
    <aside
      className={cn(
        'hidden md:flex flex-col bg-sidebar text-sidebar-foreground transition-all duration-300 ease-in-out border-r border-sidebar-border',
        collapsed ? 'w-16' : 'w-60'
      )}
    >
      {/* Tenant info */}
      <div className="flex h-16 items-center px-4 border-b border-sidebar-border">
        {!collapsed ? (
          <div className="min-w-0">
            <h1 className="font-display text-sm font-bold text-sidebar-primary truncate">
              {tenantInfo?.company_name || (
                <>Aimee<span className="text-accent">.iA</span></>
              )}
            </h1>
            {tenantInfo?.wa_phone_number_id && (
              <p className="text-[11px] text-sidebar-foreground/60 truncate">
                {tenantInfo.wa_phone_number_id}
              </p>
            )}
          </div>
        ) : (
          <span className="font-display text-lg font-bold text-sidebar-primary mx-auto">A</span>
        )}
      </div>

      {/* Nav groups */}
      <nav className="flex-1 overflow-y-auto py-2 px-2">
        {navGroups.map((group, gi) => (
          <div key={gi}>
            {gi > 0 && (
              <Separator className="my-2 bg-sidebar-border" />
            )}
            {group.label && !collapsed && (
              <span className="block px-3 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-sidebar-foreground/50">
                {group.label}
              </span>
            )}
            <div className="space-y-0.5">
              {group.items.map((item) => {
                const isActive = location.pathname === item.path ||
                  (item.path !== '/' && location.pathname.startsWith(item.path));

                if (item.external) {
                  return (
                    <span
                      key={item.label}
                      className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-sidebar-foreground/60 cursor-default"
                    >
                      <item.icon className="h-5 w-5 shrink-0" />
                      {!collapsed && <span>{item.label}</span>}
                    </span>
                  );
                }

                return (
                  <NavLink
                    key={item.path}
                    to={item.path}
                    className={cn(
                      'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                      isActive
                        ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                        : 'text-sidebar-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground'
                    )}
                  >
                    <item.icon className="h-5 w-5 shrink-0" />
                    {!collapsed && (
                      <span className="flex-1 truncate">{item.label}</span>
                    )}
                    {!collapsed && item.badge && item.badge > 0 ? (
                      <Badge className="h-5 min-w-[20px] px-1.5 text-[10px] bg-accent text-accent-foreground border-0 rounded-full">
                        {item.badge}
                      </Badge>
                    ) : null}
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
        className="flex items-center justify-center h-12 border-t border-sidebar-border text-sidebar-foreground hover:bg-sidebar-accent/50 transition-colors"
      >
        {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
      </button>
    </aside>
  );
};

export default AppSidebar;
