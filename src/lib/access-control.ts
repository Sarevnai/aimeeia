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
    '/empreendimentos', '/campanhas', '/atualizacao',
    '/financeiro', '/minha-aimee', '/modulos', '/acessos', '/guia', '/admin'],
  admin: ['/', '/inbox', '/chat', '/leads', '/pipeline', '/dashboard-c2s', '/captacao', '/relatorios', '/chamados',
    '/empreendimentos', '/campanhas', '/atualizacao',
    '/financeiro', '/minha-aimee', '/modulos', '/acessos', '/guia'],
  operator: ['/inbox', '/chat', '/leads', '/pipeline', '/dashboard-c2s'],
  viewer: ['/', '/relatorios', '/dashboard-c2s', '/guia'],
};

// Department-specific paths for operators (overrides ROLE_PATHS.operator when set).
// Vendas/locacao limited to Leads, Pipeline, Conversas per product decision.
export const DEPT_PATHS: Record<string, string[]> = {
  administrativo: ['/', '/inbox', '/chat', '/chamados', '/relatorios', '/dashboard-c2s', '/financeiro', '/guia'],
  vendas: ['/inbox', '/chat', '/leads', '/pipeline', '/dashboard-c2s'],
  locacao: ['/inbox', '/chat', '/leads', '/pipeline', '/dashboard-c2s'],
  remarketing: ['/', '/inbox', '/chat', '/leads', '/pipeline', '/dashboard-c2s', '/campanhas', '/empreendimentos', '/guia'],
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
