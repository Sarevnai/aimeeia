import React from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  MessageSquare,
  Users,
  Kanban,
  Settings,
  Ticket,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { getAllowedPaths, shouldUseAdminNav } from '@/lib/access-control';

const defaultNav = [
  { label: 'Início', icon: LayoutDashboard, path: '/' },
  { label: 'Conversas', icon: MessageSquare, path: '/inbox' },
  { label: 'Leads', icon: Users, path: '/leads' },
  { label: 'Pipeline', icon: Kanban, path: '/pipeline' },
  { label: 'Aimee', icon: Settings, path: '/minha-aimee' },
];

// Sprint 6.2 — nav mobile dedicado pro setor admin (chamados é o workflow central)
const adminNav = [
  { label: 'Início', icon: LayoutDashboard, path: '/dashboard-admin' },
  { label: 'Chamados', icon: Ticket, path: '/chamados' },
  { label: 'Conversas', icon: MessageSquare, path: '/inbox' },
  { label: 'Contatos', icon: Users, path: '/contatos-admin' },
  { label: 'Aimee', icon: Settings, path: '/minha-aimee' },
];

const MobileBottomNav: React.FC = () => {
  const location = useLocation();
  const { profile } = useAuth();
  const allowedPaths = getAllowedPaths(profile);
  const mobileNavItems = shouldUseAdminNav(profile) ? adminNav : defaultNav;
  const visibleItems = mobileNavItems.filter((item) =>
    allowedPaths.some((p) => item.path === p || (p !== '/' && item.path.startsWith(p)))
  );

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-card border-t border-border">
      <div className="flex items-center justify-around h-16">
        {visibleItems.map((item) => {
          const isActive = location.pathname === item.path ||
            (item.path !== '/' && location.pathname.startsWith(item.path));
          return (
            <NavLink
              key={item.path}
              to={item.path}
              className={cn(
                'flex flex-col items-center gap-1 text-xs font-medium transition-colors px-3 py-1',
                isActive ? 'text-accent' : 'text-muted-foreground'
              )}
            >
              <item.icon className="h-5 w-5" />
              <span>{item.label}</span>
            </NavLink>
          );
        })}
      </div>
    </nav>
  );
};

export default MobileBottomNav;
