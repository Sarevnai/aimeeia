import React from 'react';
import { useTenant } from '@/contexts/TenantContext';
import { useAuth } from '@/contexts/AuthContext';
import DNCView from '@/components/dnc/DNCView';
import { Loader2 } from 'lucide-react';

export default function DNCPage() {
  const { tenantId } = useTenant();
  const { profile } = useAuth();

  if (!tenantId) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-4rem)]">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Admin do tenant pode reabilitar contatos; operator/viewer só consultam.
  const canManage = profile?.role === 'admin' || profile?.role === 'super_admin';

  return (
    <div className="p-4 md:p-6">
      <DNCView tenantId={tenantId} canManage={canManage} />
    </div>
  );
}
