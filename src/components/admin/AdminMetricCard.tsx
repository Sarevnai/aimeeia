import React from 'react';
import { cn } from '@/lib/utils';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

interface AdminMetricCardProps {
    title: string;
    value: string | number;
    subtitle?: string;
    icon: React.ElementType;
    trend?: {
        value: number;
        label: string;
    };
    accentColor?: string;
    className?: string;
}

const AdminMetricCard: React.FC<AdminMetricCardProps> = ({
    title,
    value,
    subtitle,
    icon: Icon,
    trend,
    accentColor = 'hsl(250 70% 60%)',
    className,
}) => {
    const trendIsPositive = trend && trend.value > 0;
    const trendIsNegative = trend && trend.value < 0;
    const TrendIcon = trendIsPositive ? TrendingUp : trendIsNegative ? TrendingDown : Minus;

    return (
        <div className={cn('bg-card border border-border rounded-xl p-5 card-interactive', className)}>
            <div className="flex items-start justify-between mb-3">
                <div>
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{title}</p>
                    <p className="text-2xl font-bold text-foreground font-display mt-1">{value}</p>
                    {subtitle && (
                        <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>
                    )}
                </div>
                <div
                    className="flex items-center justify-center w-10 h-10 rounded-lg"
                    style={{ backgroundColor: `${accentColor}15`, color: accentColor }}
                >
                    <Icon className="h-5 w-5" />
                </div>
            </div>
            {trend && (
                <div className="flex items-center gap-1.5 mt-2">
                    <TrendIcon
                        className="h-3.5 w-3.5"
                        style={{ color: trendIsPositive ? 'hsl(142 71% 45%)' : trendIsNegative ? 'hsl(0 84% 60%)' : 'hsl(0 0% 60%)' }}
                    />
                    <span
                        className="text-xs font-semibold"
                        style={{ color: trendIsPositive ? 'hsl(142 71% 45%)' : trendIsNegative ? 'hsl(0 84% 60%)' : 'hsl(0 0% 60%)' }}
                    >
                        {trendIsPositive ? '+' : ''}{trend.value}%
                    </span>
                    <span className="text-xs text-muted-foreground">{trend.label}</span>
                </div>
            )}
        </div>
    );
};

export default AdminMetricCard;
