export type TenantHealthLevel = 'healthy' | 'warning' | 'critical';

export interface TenantHealthSignals {
    isActive: boolean;
    hasWhatsApp: boolean;
    hasVista: boolean;
    hasC2S: boolean;
    hasCanalPro: boolean;
    conversations7d: number;
    lastConversationAt: string | null;
}

export interface TenantHealth {
    level: TenantHealthLevel;
    reasons: string[];
    score: number;
}

const DAY_MS = 86_400_000;

export function computeTenantHealth(signals: TenantHealthSignals): TenantHealth {
    const reasons: string[] = [];
    let critical = 0;
    let warnings = 0;

    if (!signals.isActive) {
        reasons.push('Tenant inativo');
        critical++;
    }

    if (!signals.hasWhatsApp) {
        reasons.push('WhatsApp não configurado');
        critical++;
    }

    const integrationsConfigured = [signals.hasVista, signals.hasC2S, signals.hasCanalPro].filter(Boolean).length;
    if (integrationsConfigured === 0 && signals.isActive) {
        reasons.push('Nenhuma integração CRM/portal configurada');
        warnings++;
    } else if (integrationsConfigured === 1 && signals.isActive) {
        reasons.push('Apenas uma integração CRM/portal configurada');
        warnings++;
    }

    const now = Date.now();
    const lastConv = signals.lastConversationAt ? new Date(signals.lastConversationAt).getTime() : null;
    const daysSinceLastConv = lastConv ? Math.floor((now - lastConv) / DAY_MS) : null;

    if (signals.isActive) {
        if (daysSinceLastConv === null) {
            reasons.push('Nunca recebeu conversas');
            warnings++;
        } else if (daysSinceLastConv >= 30) {
            reasons.push(`Sem conversas há ${daysSinceLastConv} dias`);
            critical++;
        } else if (daysSinceLastConv >= 7) {
            reasons.push(`Sem conversas há ${daysSinceLastConv} dias`);
            warnings++;
        }
    }

    let level: TenantHealthLevel;
    if (critical > 0) {
        level = 'critical';
    } else if (warnings > 0) {
        level = 'warning';
    } else {
        level = 'healthy';
        reasons.push('Tudo ok');
    }

    const score = Math.max(0, 100 - critical * 35 - warnings * 15);

    return { level, reasons, score };
}

export function formatLastActivity(lastConversationAt: string | null): string {
    if (!lastConversationAt) return 'Nunca';
    const now = Date.now();
    const then = new Date(lastConversationAt).getTime();
    const diffMs = now - then;
    const diffDays = Math.floor(diffMs / DAY_MS);
    const diffHours = Math.floor(diffMs / (60 * 60 * 1000));
    const diffMin = Math.floor(diffMs / (60 * 1000));

    if (diffMin < 1) return 'Agora';
    if (diffMin < 60) return `${diffMin}m atrás`;
    if (diffHours < 24) return `${diffHours}h atrás`;
    if (diffDays < 30) return `${diffDays}d atrás`;
    if (diffDays < 365) return `${Math.floor(diffDays / 30)}mês atrás`;
    return `${Math.floor(diffDays / 365)}a atrás`;
}

export const HEALTH_LABELS: Record<TenantHealthLevel, string> = {
    healthy: 'Saudável',
    warning: 'Atenção',
    critical: 'Crítico',
};

export const HEALTH_CLASSES: Record<TenantHealthLevel, string> = {
    healthy: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20',
    warning: 'bg-amber-500/10 text-amber-600 border-amber-500/20',
    critical: 'bg-red-500/10 text-red-600 border-red-500/20',
};
