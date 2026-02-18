import React from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  MessageSquare,
  Users,
  Kanban,
  Settings,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const mobileNavItems = [
  { label: 'Home', icon: LayoutDashboard, path: '/' },
  { label: 'Inbox', icon: MessageSquare, path: '/inbox' },
  { label: 'Contatos', icon: Users, path: '/contatos' },
  { label: 'Pipeline', icon: Kanban, path: '/pipeline' },
  { label: 'Config', icon: Settings, path: '/configuracoes' },
];

const MobileBottomNav: React.FC = () => {
  const location = useLocation();

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-card border-t border-border">
      <div className="flex items-center justify-around h-16">
        {mobileNavItems.map((item) => {
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
