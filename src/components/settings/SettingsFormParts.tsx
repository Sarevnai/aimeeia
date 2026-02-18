import React from 'react';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

interface FieldGroupProps {
  label: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
}

export const FieldGroup: React.FC<FieldGroupProps> = ({ label, description, children, className }) => (
  <div className={cn('space-y-1.5', className)}>
    <Label className="text-sm font-medium text-foreground">{label}</Label>
    {description && <p className="text-xs text-muted-foreground">{description}</p>}
    <div className="mt-1">{children}</div>
  </div>
);

interface SectionProps {
  title: string;
  children: React.ReactNode;
  className?: string;
}

export const Section: React.FC<SectionProps> = ({ title, children, className }) => (
  <div className={cn('space-y-4', className)}>
    <h3 className="font-display text-base font-semibold text-foreground border-b border-border pb-2">{title}</h3>
    {children}
  </div>
);
