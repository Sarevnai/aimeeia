import React, { createContext, useContext, useEffect, useState } from 'react';
import { useAuth } from './AuthContext';
import { supabase } from '@/integrations/supabase/client';

interface TenantInfo {
  company_name: string;
  wa_phone_number_id: string | null;
  access_code: string | null;
}

interface TenantContextType {
  tenantId: string | null;
  tenantInfo: TenantInfo | null;
}

const TenantContext = createContext<TenantContextType>({ tenantId: null, tenantInfo: null });

export const useTenant = () => useContext(TenantContext);

export const TenantProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { profile } = useAuth();
  const tenantId = profile?.tenant_id ?? null;
  const [tenantInfo, setTenantInfo] = useState<TenantInfo | null>(null);

  useEffect(() => {
    if (!tenantId) { setTenantInfo(null); return; }
    supabase
      .from('tenants')
      .select('company_name, wa_phone_number_id, access_code')
      .eq('id', tenantId)
      .single()
      .then(({ data }) => {
        if (data) setTenantInfo({
          company_name: data.company_name,
          wa_phone_number_id: data.wa_phone_number_id,
          access_code: (data as any).access_code ?? null,
        });
      });
  }, [tenantId]);

  return (
    <TenantContext.Provider value={{ tenantId, tenantInfo }}>
      {children}
    </TenantContext.Provider>
  );
};
