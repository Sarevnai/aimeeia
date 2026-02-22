import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';

type Role = 'super_admin' | 'admin' | 'operator' | 'viewer';

// Role hierarchy — higher roles include lower ones
const ROLE_HIERARCHY: Record<Role, number> = {
  super_admin: 4,
  admin: 3,
  operator: 2,
  viewer: 1,
};

interface RoleGuardProps {
  /** Minimum role required to access the route */
  minRole: Role;
  /** Where to redirect if access is denied (defaults to '/') */
  redirectTo?: string;
  children: React.ReactNode;
}

/**
 * RoleGuard — wraps a route and redirects unauthorized users.
 * Uses role hierarchy: super_admin > admin > operator > viewer.
 *
 * Usage:
 *   <RoleGuard minRole="admin">
 *     <AcessosPage />
 *   </RoleGuard>
 */
const RoleGuard: React.FC<RoleGuardProps> = ({ minRole, redirectTo = '/', children }) => {
  const { profile } = useAuth();
  const userRole = (profile?.role ?? 'viewer') as Role;
  const userLevel = ROLE_HIERARCHY[userRole] ?? 1;
  const requiredLevel = ROLE_HIERARCHY[minRole];

  if (userLevel < requiredLevel) {
    return <Navigate to={redirectTo} replace />;
  }

  return <>{children}</>;
};

export default RoleGuard;
