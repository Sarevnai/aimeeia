import DNCView from '@/components/dnc/DNCView';

export default function AdminDNCTab({ tenantId }: { tenantId: string }) {
  // Super admin vê todos os tenants; pode gerenciar (reabilitar) a partir daqui também.
  return <DNCView tenantId={tenantId} canManage={true} />;
}
