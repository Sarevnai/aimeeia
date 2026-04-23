// Central access control: which paths each role/department can access.
// Used by AppSidebar (menu filter), AppLayout (route guard), and MobileBottomNav.

export type Role = 'super_admin' | 'admin' | 'operator' | 'viewer';
export type DepartmentCode = 'vendas' | 'locacao' | 'administrativo' | 'remarketing';

export interface AccessProfile {
  role?: Role | string | null;
  department_code?: DepartmentCode | string | null;
}

export const ROLE_PATHS: Record<string, string[]> = {
  super_admin: ['/', '/inbox', '/chat', '/leads', '/pipeline', '/dashboard-c2s', '/captacao', '/relatorios', '/chamados',
    '/empreendimentos', '/campanhas', '/atualizacao', '/dnc',
    '/financeiro', '/minha-aimee', '/modulos', '/acessos', '/guia', '/admin',
    '/dashboard-admin', '/contatos-admin'],
  admin: ['/', '/inbox', '/chat', '/leads', '/pipeline', '/dashboard-c2s', '/captacao', '/relatorios', '/chamados',
    '/empreendimentos', '/campanhas', '/atualizacao', '/dnc',
    '/financeiro', '/minha-aimee', '/modulos', '/acessos', '/guia',
    '/dashboard-admin', '/contatos-admin'],
  // Corretor (operator): só vê SEUS leads e SUAS conversas. Sem Dashboard, sem DNC.
  operator: ['/inbox', '/chat', '/leads', '/pipeline', '/guia'],
  viewer: ['/relatorios', '/guia'],
};

// Department-specific paths for operators (overrides ROLE_PATHS.operator when set).
// Sprint 6.2 — administrativo: escopo limpo, só itens do setor (sem dashboard-c2s,
// financeiro, leads, relatórios de vendas). Página inicial é /dashboard-admin com
// métricas do setor (TTFR, chamados abertos, órfãs, NPS médio).
export const DEPT_PATHS: Record<string, string[]> = {
  administrativo: ['/dashboard-admin', '/chamados', '/inbox', '/chat', '/contatos-admin', '/modulos', '/minha-aimee', '/guia'],
  // Corretor em qualquer setor comercial: só inbox + leads + pipeline + chat. Sem Dashboard/DNC.
  vendas: ['/inbox', '/chat', '/leads', '/pipeline', '/guia'],
  locacao: ['/inbox', '/chat', '/leads', '/pipeline', '/guia'],
  remarketing: ['/inbox', '/chat', '/leads', '/pipeline', '/campanhas', '/empreendimentos', '/guia'],
};

export function getAllowedPaths(profile: AccessProfile | null | undefined): string[] {
  const role = profile?.role || 'viewer';
  const dept = profile?.department_code;

  if (role === 'operator') {
    // Operator with a department_code → use department-specific paths.
    if (dept && DEPT_PATHS[dept]) return DEPT_PATHS[dept];
    // Operator without department_code → empty menu until admin classifies.
    return [];
  }

  return ROLE_PATHS[role] || ROLE_PATHS.viewer;
}

// Returns true if the given pathname is allowed by the profile.
// Matches the sidebar logic: exact match OR startsWith (except root).
export function isPathAllowed(pathname: string, profile: AccessProfile | null | undefined): boolean {
  const allowed = getAllowedPaths(profile);
  return allowed.some((p) => pathname === p || (p !== '/' && pathname.startsWith(p)));
}

// ═══════════════════════════════════════════════════════
// Sprint 6.2 — estrutura de nav dedicada ao setor administrativo
// ═══════════════════════════════════════════════════════
// Usado pelo AppSidebar quando user é operator + dept=administrativo.
// Labels e grupos refletem o setor (Operação/Clientes/Configurações), não vendas.

export interface AdminNavItem {
  label: string;
  iconName: string; // mapeado no sidebar pra evitar dep de ícone no access-control
  path: string;
  badgeKey?: 'activeTickets' | 'activeConvs';
}

export interface AdminNavGroup {
  label?: string;
  items: AdminNavItem[];
}

export const ADMIN_NAV_GROUPS: AdminNavGroup[] = [
  {
    items: [
      { label: 'Início', iconName: 'LayoutDashboard', path: '/dashboard-admin' },
    ],
  },
  {
    label: 'Operação',
    items: [
      { label: 'Chamados', iconName: 'Ticket', path: '/chamados', badgeKey: 'activeTickets' },
      { label: 'Conversas', iconName: 'MessageSquare', path: '/inbox', badgeKey: 'activeConvs' },
    ],
  },
  {
    label: 'Clientes',
    items: [
      { label: 'Contatos', iconName: 'Users', path: '/contatos-admin' },
    ],
  },
  {
    label: 'Inteligência',
    items: [
      { label: 'Módulos', iconName: 'Brain', path: '/modulos' },
    ],
  },
  {
    label: 'Configurações',
    items: [
      { label: 'Minha Aimee', iconName: 'Settings', path: '/minha-aimee' },
    ],
  },
  {
    label: 'Ajuda',
    items: [
      { label: 'Guia da Aimee', iconName: 'BookOpen', path: '/guia' },
    ],
  },
];

// Helper pra decidir se o user deve ver o nav admin-dedicado.
// Operator + dept=administrativo → admin nav. Admin/super_admin veem o nav padrão
// com acesso completo (ainda que trabalhem em contexto admin) porque precisam das
// páginas de gestão (Acessos, Financeiro da empresa, etc).
export function shouldUseAdminNav(profile: AccessProfile | null | undefined): boolean {
  return profile?.role === 'operator' && profile?.department_code === 'administrativo';
}
