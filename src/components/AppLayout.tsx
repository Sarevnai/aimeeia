import React, { useState } from 'react';
import { Outlet, Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import AppSidebar from '@/components/AppSidebar';
import AppHeader from '@/components/AppHeader';
import MobileBottomNav from '@/components/MobileBottomNav';
import { Loader2 } from 'lucide-react';
import { isPathAllowed, getAllowedPaths } from '@/lib/access-control';

const AppLayout: React.FC = () => {
  const { user, profile, loading, refreshProfile } = useAuth();
  const location = useLocation();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [retrying, setRetrying] = useState(false);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-accent" />
      </div>
    );
  }

  if (!user) return <Navigate to="/auth" replace />;

  // Super admin without tenant → redirect to admin panel (product administration)
  if (profile?.role === 'super_admin' && !profile?.tenant_id) {
    return <Navigate to="/admin" replace />;
  }

  if (user && !profile) {
    return (
      <div className="flex min-h-screen items-center justify-center flex-col bg-background p-6 text-center">
        <h2 className="text-xl font-bold font-display text-foreground mb-2">Perfil não localizado</h2>
        <p className="text-muted-foreground text-sm max-w-sm mb-6">
          Sua conta existe, mas seu perfil ainda não foi atrelado a nenhuma empresa no sistema. Por favor, peça ao administrador da sua imobiliária para gerar um novo código de acesso ou vincular sua conta.
        </p>
        <div className="flex gap-3">
          <button
            onClick={async () => {
              setRetrying(true);
              await refreshProfile();
              setRetrying(false);
            }}
            disabled={retrying}
            className="bg-accent text-accent-foreground px-4 py-2 rounded-md font-medium text-sm hover:bg-accent/90 disabled:opacity-50"
          >
            {retrying ? 'Tentando...' : 'Tentar novamente'}
          </button>
          <button
            onClick={() => {
              supabase.auth.signOut().then(() => window.location.href = '/auth');
            }}
            className="bg-primary text-primary-foreground px-4 py-2 rounded-md font-medium text-sm hover:bg-primary/90"
          >
            Voltar para o Login
          </button>
        </div>
      </div>
    );
  }

  // Route guard: redirect when current path is not allowed by role/department.
  // Operators without department_code get an empty allow-list and land on the
  // "Perfil não classificado" screen below instead of an infinite redirect.
  if (profile && !isPathAllowed(location.pathname, profile)) {
    const allowed = getAllowedPaths(profile);
    if (allowed.length === 0) {
      return (
        <div className="flex min-h-screen items-center justify-center flex-col bg-background p-6 text-center">
          <h2 className="text-xl font-bold font-display text-foreground mb-2">Acesso não configurado</h2>
          <p className="text-muted-foreground text-sm max-w-sm mb-6">
            Seu usuário ainda não foi classificado em um setor. Peça ao administrador da sua imobiliária para definir seu setor (Vendas, Locação, Administrativo ou Remarketing).
          </p>
          <button
            onClick={() => {
              supabase.auth.signOut().then(() => window.location.href = '/auth');
            }}
            className="bg-primary text-primary-foreground px-4 py-2 rounded-md font-medium text-sm hover:bg-primary/90"
          >
            Voltar para o Login
          </button>
        </div>
      );
    }
    return <Navigate to={allowed[0]} replace />;
  }

  return (
    <div className="flex min-h-screen w-full bg-background">
      <AppSidebar collapsed={sidebarCollapsed} onToggle={() => setSidebarCollapsed(!sidebarCollapsed)} />
      <div className="flex flex-1 flex-col min-w-0">
        <AppHeader />
        <main className="flex-1 overflow-auto pb-20 md:pb-0">
          <Outlet />
        </main>
      </div>
      <MobileBottomNav />
    </div>
  );
};

export default AppLayout;
