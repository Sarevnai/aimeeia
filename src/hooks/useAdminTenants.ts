import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export interface TenantOption {
  id: string;
  company_name: string;
}

const SESSION_KEY = 'admin_selected_tenant_id';

export function useAdminTenants() {
  const { toast } = useToast();
  const [tenants, setTenants] = useState<TenantOption[]>([]);
  const [selectedTenantId, setSelectedTenantId] = useState<string>('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadTenants = async () => {
      const { data, error } = await supabase
        .from('tenants')
        .select('id, company_name')
        .order('company_name');
      if (error) {
        toast({ title: 'Erro ao carregar tenants', description: error.message, variant: 'destructive' });
        setLoading(false);
        return;
      }
      setTenants(data || []);
      if (data && data.length > 0) {
        const saved = sessionStorage.getItem(SESSION_KEY);
        const validSaved = saved && data.some(t => t.id === saved);
        setSelectedTenantId(validSaved ? saved! : data[0].id);
      }
      setLoading(false);
    };
    loadTenants();
  }, []);

  const handleTenantChange = (tenantId: string) => {
    setSelectedTenantId(tenantId);
    sessionStorage.setItem(SESSION_KEY, tenantId);
  };

  return {
    tenants,
    selectedTenantId,
    setSelectedTenantId: handleTenantChange,
    loading,
  };
}
