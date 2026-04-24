export const statusBadgeClass = (status: string | null): string => {
  switch (status) {
    case 'Novo':
      return 'bg-blue-500/10 text-blue-600 border-blue-500/20';
    case 'Em negociação':
      return 'bg-amber-500/10 text-amber-700 border-amber-500/20';
    case 'Negócio fechado':
      return 'bg-emerald-500/10 text-emerald-700 border-emerald-500/20';
    case 'Arquivado':
      return 'bg-muted text-muted-foreground border-border';
    default:
      return 'bg-muted/50 text-muted-foreground border-border';
  }
};

export const STATUS_OPTIONS = [
  { value: 'all', label: 'Todos os status' },
  { value: 'Novo', label: 'Novo' },
  { value: 'Em negociação', label: 'Em negociação' },
  { value: 'Negócio fechado', label: 'Negócio fechado' },
  { value: 'Arquivado', label: 'Arquivado' },
  { value: 'sem_status', label: 'Sem status' },
] as const;
