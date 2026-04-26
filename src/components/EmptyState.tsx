import React from 'react';
import { cn } from '@/lib/utils';

interface EmptyStateProps {
    icon: React.ReactNode;
    title: string;
    description?: string;
    action?: React.ReactNode;
    className?: string;
    size?: 'sm' | 'md';
}

const EmptyState: React.FC<EmptyStateProps> = ({
    icon,
    title,
    description,
    action,
    className,
    size = 'md',
}) => {
    const isSm = size === 'sm';
    return (
        <div
            className={cn(
                'flex flex-col items-center justify-center text-center animate-fade-in',
                isSm ? 'py-8' : 'py-20',
                className,
            )}
        >
            <div
                className={cn(
                    'mx-auto rounded-2xl bg-accent/10 flex items-center justify-center',
                    isSm ? 'w-12 h-12 mb-3' : 'w-16 h-16 mb-4',
                )}
            >
                {icon}
            </div>
            <p className={cn('text-foreground font-medium', isSm ? 'text-sm mb-0.5' : 'mb-1')}>{title}</p>
            {description && (
                <p className={cn('text-muted-foreground max-w-sm', isSm ? 'text-xs mb-3' : 'text-sm mb-4')}>{description}</p>
            )}
            {action}
        </div>
    );
};

export default EmptyState;
