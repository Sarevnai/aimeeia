import React from 'react';
import { cn } from '@/lib/utils';

interface SkeletonBlockProps {
    className?: string;
}

export const SkeletonBlock: React.FC<SkeletonBlockProps> = ({ className }) => (
    <div className={cn('skeleton', className)} />
);

/** Skeleton for a metric card (used on Dashboard, Templates, etc.) */
export const SkeletonMetricCard: React.FC = () => (
    <div className="rounded-xl bg-card border border-border p-5 space-y-3">
        <SkeletonBlock className="h-4 w-24" />
        <SkeletonBlock className="h-8 w-16" />
        <SkeletonBlock className="h-2 w-full" />
    </div>
);

/** Skeleton for a table row */
export const SkeletonTableRow: React.FC<{ cols?: number }> = ({ cols = 5 }) => (
    <div className="flex items-center gap-4 px-4 py-3.5 border-b border-border">
        {Array.from({ length: cols }).map((_, i) => (
            <SkeletonBlock key={i} className={cn('h-4', i === 0 ? 'w-32' : 'w-20')} />
        ))}
    </div>
);

/** Skeleton for a card list item (used on Captação, Atualização, etc.) */
export const SkeletonListCard: React.FC = () => (
    <div className="rounded-xl bg-card border border-border shadow-card p-4 flex items-start gap-4">
        <SkeletonBlock className="h-10 w-10 rounded-lg shrink-0" />
        <div className="flex-1 space-y-2">
            <SkeletonBlock className="h-4 w-40" />
            <SkeletonBlock className="h-3 w-64" />
            <SkeletonBlock className="h-3 w-32" />
        </div>
    </div>
);

/** Skeleton for a content card (Empreendimentos, Guia, etc.) */
export const SkeletonContentCard: React.FC = () => (
    <div className="rounded-xl bg-card border border-border shadow-card overflow-hidden">
        <SkeletonBlock className="h-40 w-full rounded-none" />
        <div className="p-4 space-y-2">
            <SkeletonBlock className="h-5 w-32" />
            <SkeletonBlock className="h-3 w-48" />
            <SkeletonBlock className="h-4 w-24" />
        </div>
    </div>
);

/** Full page loading skeleton */
export const SkeletonPage: React.FC<{ rows?: number }> = ({ rows = 5 }) => (
    <div className="space-y-4 animate-fade-in">
        {Array.from({ length: rows }).map((_, i) => (
            <SkeletonListCard key={i} />
        ))}
    </div>
);
