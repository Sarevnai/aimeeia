import React from 'react';
import { Badge } from '@/components/ui/badge';

type TenantStatus = 'trial' | 'active' | 'past_due' | 'cancelled' | 'inactive';

interface TenantStatusBadgeProps {
    status: TenantStatus;
}

const statusConfig: Record<TenantStatus, { label: string; className: string }> = {
    trial: {
        label: 'Trial',
        className: 'bg-amber-500/10 text-amber-600 border-amber-500/20',
    },
    active: {
        label: 'Ativo',
        className: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20',
    },
    past_due: {
        label: 'Em atraso',
        className: 'bg-orange-500/10 text-orange-600 border-orange-500/20',
    },
    cancelled: {
        label: 'Cancelado',
        className: 'bg-red-500/10 text-red-600 border-red-500/20',
    },
    inactive: {
        label: 'Inativo',
        className: 'bg-gray-500/10 text-gray-500 border-gray-500/20',
    },
};

const TenantStatusBadge: React.FC<TenantStatusBadgeProps> = ({ status }) => {
    const config = statusConfig[status] || statusConfig.inactive;

    return (
        <Badge variant="outline" className={`text-[10px] font-semibold rounded-full px-2 py-0.5 ${config.className}`}>
            {config.label}
        </Badge>
    );
};

export default TenantStatusBadge;
export type { TenantStatus };
