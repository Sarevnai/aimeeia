import React from 'react';
import { Badge } from '@/components/ui/badge';
import { BanIcon, AlertTriangle, User, Bot, Clock, CheckCircle2, RadioTower, Send, Users, Home, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { computeLeadTags, LeadTagsInput, OrigemTag, SituacaoTag } from '@/lib/lead-tags';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface Props {
  input: LeadTagsInput;
  size?: 'sm' | 'md';
  showDncAlways?: boolean; // quando false, DNC só aparece quando flagged
  className?: string;
}

const ORIGEM_STYLE: Record<OrigemTag, { icon: any; cls: string }> = {
  remarketing_auto:    { icon: RadioTower, cls: 'bg-purple-500/15 text-purple-700 dark:text-purple-300 border-purple-500/30' },
  campanha_remarketing:{ icon: Send,       cls: 'bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 border-indigo-500/30' },
  portal_zap:          { icon: Home,       cls: 'bg-orange-500/15 text-orange-700 dark:text-orange-300 border-orange-500/30' },
  portal_vivareal:     { icon: Home,       cls: 'bg-orange-500/15 text-orange-700 dark:text-orange-300 border-orange-500/30' },
  portal_olx:          { icon: Home,       cls: 'bg-orange-500/15 text-orange-700 dark:text-orange-300 border-orange-500/30' },
  c2s_import:          { icon: Users,      cls: 'bg-sky-500/15 text-sky-700 dark:text-sky-300 border-sky-500/30' },
  organico:            { icon: Sparkles,   cls: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30' },
  simulacao:           { icon: Bot,        cls: 'bg-slate-500/15 text-slate-700 dark:text-slate-300 border-slate-500/30' },
  desconhecido:        { icon: AlertTriangle, cls: 'bg-muted text-muted-foreground border-border' },
};

const SITUACAO_STYLE: Record<SituacaoTag, { icon: any; cls: string }> = {
  dnc:                 { icon: BanIcon,       cls: 'bg-destructive/15 text-destructive border-destructive/30' },
  operador_assumiu:    { icon: User,          cls: 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30' },
  aimee_atendendo:     { icon: Bot,           cls: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30' },
  qualificado:         { icon: CheckCircle2,  cls: 'bg-green-500/15 text-green-700 dark:text-green-300 border-green-500/30' },
  aguardando_resposta: { icon: Clock,         cls: 'bg-sky-500/15 text-sky-700 dark:text-sky-300 border-sky-500/30' },
  cliente_aguarda:     { icon: Clock,         cls: 'bg-red-500/15 text-red-600 dark:text-red-300 border-red-500/30' },
  fechada:             { icon: CheckCircle2,  cls: 'bg-muted text-muted-foreground border-border' },
  nova:                { icon: Sparkles,      cls: 'bg-cyan-500/15 text-cyan-700 dark:text-cyan-300 border-cyan-500/30' },
};

export default function LeadTags({ input, size = 'md', showDncAlways = false, className }: Props) {
  const tags = computeLeadTags(input);
  const OrigemIcon = ORIGEM_STYLE[tags.origem.key].icon;
  const SituacaoIcon = SITUACAO_STYLE[tags.situacao.key].icon;
  const isSm = size === 'sm';

  return (
    <TooltipProvider delayDuration={200}>
      <div className={cn('flex flex-wrap items-center gap-1.5', className)}>
        {/* DNC primeiro, destacado */}
        {(tags.dnc.flagged || showDncAlways) && tags.dnc.flagged && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Badge
                variant="outline"
                className={cn(
                  'gap-1 border font-semibold',
                  'bg-destructive/20 text-destructive border-destructive/50',
                  isSm ? 'h-5 text-[10px] px-1.5' : 'h-6 text-xs px-2'
                )}
              >
                <BanIcon className={isSm ? 'h-2.5 w-2.5' : 'h-3 w-3'} />
                NÃO CONTATAR
              </Badge>
            </TooltipTrigger>
            <TooltipContent>
              <p className="text-xs">{tags.dnc.label}</p>
            </TooltipContent>
          </Tooltip>
        )}

        {/* Origem */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge
              variant="outline"
              className={cn(
                'gap-1 border',
                ORIGEM_STYLE[tags.origem.key].cls,
                isSm ? 'h-5 text-[10px] px-1.5' : 'h-6 text-xs px-2'
              )}
            >
              <OrigemIcon className={isSm ? 'h-2.5 w-2.5' : 'h-3 w-3'} />
              {tags.origem.label}
            </Badge>
          </TooltipTrigger>
          <TooltipContent>
            <p className="text-xs">Origem: {tags.origem.label}</p>
          </TooltipContent>
        </Tooltip>

        {/* Situação (não mostra se DNC — já sinalizado acima) */}
        {!tags.dnc.flagged && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Badge
                variant="outline"
                className={cn(
                  'gap-1 border',
                  SITUACAO_STYLE[tags.situacao.key].cls,
                  isSm ? 'h-5 text-[10px] px-1.5' : 'h-6 text-xs px-2'
                )}
              >
                <SituacaoIcon className={isSm ? 'h-2.5 w-2.5' : 'h-3 w-3'} />
                {tags.situacao.label}
              </Badge>
            </TooltipTrigger>
            <TooltipContent>
              <p className="text-xs">Situação: {tags.situacao.label}</p>
            </TooltipContent>
          </Tooltip>
        )}
      </div>
    </TooltipProvider>
  );
}
