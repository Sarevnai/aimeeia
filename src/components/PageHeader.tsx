import React from 'react';
import { cn } from '@/lib/utils';

interface PageHeaderProps {
    title: string;
    subtitle?: string;
    icon?: React.ReactNode;
    actions?: React.ReactNode;
    /** Use full-width sticky style (for pages like Inbox/Pipeline). Default: false */
    sticky?: boolean;
    className?: string;
}

const PageHeader: React.FC<PageHeaderProps> = ({
    title,
    subtitle,
    icon,
    actions,
    sticky = false,
    className,
}) => {
    if (sticky) {
        return (
            <div className={cn('p-4 border-b border-border bg-card', className)}>
                <div className="flex items-center justify-between">
                    <div>
                        <div className="flex items-center gap-2">
                            {icon}
                            <h2 className="font-display text-2xl font-bold text-foreground">{title}</h2>
                        </div>
                        {subtitle && (
                            <p className="text-sm text-muted-foreground mt-0.5">{subtitle}</p>
                        )}
                    </div>
                    {actions && <div className="flex items-center gap-2">{actions}</div>}
                </div>
            </div>
        );
    }

    return (
        <div className={cn('flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4', className)}>
            <div>
                <div className="flex items-center gap-2">
                    {icon}
                    <h2 className="font-display text-2xl font-bold text-foreground">{title}</h2>
                </div>
                {subtitle && (
                    <p className="text-sm text-muted-foreground mt-0.5">{subtitle}</p>
                )}
            </div>
            {actions && <div className="flex items-center gap-2">{actions}</div>}
        </div>
    );
};

export default PageHeader;
