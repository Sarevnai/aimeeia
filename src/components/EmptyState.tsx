import React from 'react';
import { cn } from '@/lib/utils';

interface EmptyStateProps {
    icon: React.ReactNode;
    title: string;
    description?: string;
    action?: React.ReactNode;
    className?: string;
}

const EmptyState: React.FC<EmptyStateProps> = ({
    icon,
    title,
    description,
    action,
    className,
}) => (
    <div className={cn('flex flex-col items-center justify-center py-20 text-center animate-fade-in', className)}>
        <div className="mx-auto w-16 h-16 rounded-2xl bg-accent/10 flex items-center justify-center mb-4">
            {icon}
        </div>
        <p className="text-foreground font-medium mb-1">{title}</p>
        {description && (
            <p className="text-muted-foreground text-sm max-w-sm mb-4">{description}</p>
        )}
        {action}
    </div>
);

export default EmptyState;
