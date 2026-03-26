import React from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { Play, Brain, Settings, GitBranch, BarChart3 } from 'lucide-react';
import { cn } from '@/lib/utils';

const labNav = [
  { label: 'Simulador', icon: Play, path: '/admin/lab' },
  { label: 'Prompts & Módulos', icon: Brain, path: '/admin/lab/prompts' },
  { label: 'Config Agente', icon: Settings, path: '/admin/lab/agent-config' },
  { label: 'Triage', icon: GitBranch, path: '/admin/lab/triage' },
  { label: 'Análises', icon: BarChart3, path: '/admin/lab/analysis' },
];

export default function LabLayout() {
  const location = useLocation();

  return (
    <div className="flex h-[calc(100vh-4rem)]">
      {/* Lab Sidebar */}
      <aside className="w-48 shrink-0 border-r bg-muted/30 flex flex-col">
        <div className="px-3 py-3 border-b">
          <h2 className="text-sm font-bold flex items-center gap-2">
            <span className="w-6 h-6 rounded bg-primary/10 flex items-center justify-center">
              <Play className="h-3.5 w-3.5 text-primary" />
            </span>
            AI Lab
          </h2>
        </div>
        <nav className="flex-1 py-2 px-2 space-y-0.5">
          {labNav.map(item => {
            const isActive = item.path === '/admin/lab'
              ? location.pathname === '/admin/lab'
              : location.pathname.startsWith(item.path);

            return (
              <NavLink
                key={item.path}
                to={item.path}
                className={cn(
                  'flex items-center gap-2.5 rounded-md px-2.5 py-2 text-xs font-medium transition-colors',
                  isActive
                    ? 'bg-primary/10 text-primary'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                )}
              >
                <item.icon className="h-4 w-4 shrink-0" />
                {item.label}
              </NavLink>
            );
          })}
        </nav>
      </aside>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        <Outlet />
      </div>
    </div>
  );
}
