import React, { createContext, useContext } from 'react';
import { useAuth } from './AuthContext';

interface TenantContextType {
  tenantId: string | null;
}

const TenantContext = createContext<TenantContextType>({ tenantId: null });

export const useTenant = () => useContext(TenantContext);

export const TenantProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { profile } = useAuth();
  return (
    <TenantContext.Provider value={{ tenantId: profile?.tenant_id ?? null }}>
      {children}
    </TenantContext.Provider>
  );
};
