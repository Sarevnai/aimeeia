// Sprint 6.2 — Indicador de status do Realtime no canto inferior direito.
// Verde = ao vivo, amarelo = reconectando, vermelho = desconectado.
// Clique no dot pra mostrar detalhes e botão de recarregar.

import React, { useState } from 'react';
import { useRealtimeStatus } from '@/hooks/useRealtimeStatus';
import { Radio, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';

export const RealtimeStatusIndicator: React.FC = () => {
  const status = useRealtimeStatus();
  const [expanded, setExpanded] = useState(false);

  const color =
    status === 'SUBSCRIBED'
      ? 'bg-emerald-500'
      : status === 'CONNECTING'
        ? 'bg-amber-400'
        : 'bg-amber-500'; // polling ativo — não é erro crítico, só fallback

  const label =
    status === 'SUBSCRIBED'
      ? 'Ao vivo'
      : status === 'CONNECTING'
        ? 'Conectando…'
        : 'Atualização 3s';

  const hint =
    status === 'SUBSCRIBED'
      ? 'Mensagens aparecem em tempo real.'
      : status === 'CONNECTING'
        ? 'Estabelecendo conexão…'
        : 'Realtime do Supabase temporariamente indisponível. O app recarrega automaticamente a cada 3 segundos enquanto a conexão ao vivo não volta.';

  return (
    <div
      className="fixed bottom-20 right-3 md:bottom-3 md:right-3 z-40 select-none"
      onClick={() => setExpanded((e) => !e)}
    >
      {expanded ? (
        <div className="bg-card border border-border rounded-lg shadow-lg p-3 max-w-[260px] cursor-pointer">
          <div className="flex items-center gap-2 mb-1.5">
            <Radio className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-xs font-semibold">{label}</span>
            <div className={cn('h-2 w-2 rounded-full ml-auto', color, status === 'CONNECTING' && 'animate-pulse')} />
          </div>
          <p className="text-[10px] text-muted-foreground leading-tight">{hint}</p>
          {status !== 'SUBSCRIBED' && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                window.location.reload();
              }}
              className="mt-2 flex items-center gap-1 text-[10px] text-primary hover:underline"
            >
              <RefreshCw className="h-3 w-3" /> Recarregar
            </button>
          )}
        </div>
      ) : (
        <button
          className="h-7 px-2 rounded-full bg-card border border-border shadow flex items-center gap-1.5 cursor-pointer hover:bg-muted/40 transition"
          title={`Realtime: ${label}`}
        >
          <div className={cn('h-2 w-2 rounded-full', color, status === 'CONNECTING' && 'animate-pulse')} />
          <span className="text-[10px] text-muted-foreground">{label}</span>
        </button>
      )}
    </div>
  );
};

export default RealtimeStatusIndicator;
