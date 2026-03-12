import React from 'react';
import { Building2 } from 'lucide-react';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import type { TenantOption } from '@/hooks/useAdminTenants';

interface TenantAgentSelectorProps {
  tenants: TenantOption[];
  selectedTenantId: string;
  onTenantChange: (tenantId: string) => void;
  loading: boolean;
}

const TenantAgentSelector: React.FC<TenantAgentSelectorProps> = ({
  tenants, selectedTenantId, onTenantChange, loading,
}) => {
  return (
    <div className="bg-card border border-border rounded-xl p-4">
      <div className="flex items-center gap-3">
        <Building2 className="h-5 w-5 text-muted-foreground" />
        <div className="flex-1">
          <Label className="text-xs font-medium text-muted-foreground">Tenant</Label>
          <Select value={selectedTenantId} onValueChange={onTenantChange} disabled={loading}>
            <SelectTrigger className="h-9 mt-1">
              <SelectValue placeholder="Selecione um tenant" />
            </SelectTrigger>
            <SelectContent>
              {tenants.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  {t.company_name || t.id}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  );
};

export default TenantAgentSelector;
