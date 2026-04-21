// Sprint 6.2 — Polling fallback pra quando o Realtime do Supabase está caído.
// Ativa automaticamente um setInterval de 3s chamando refetch enquanto o
// status do realtime não for SUBSCRIBED. Para assim que voltar.

import { useEffect, useRef } from 'react';
import { useRealtimeStatus } from './useRealtimeStatus';

interface Options {
  enabled?: boolean;
  intervalMs?: number;
}

export function usePollingFallback(refetch: () => void, options: Options = {}) {
  const { enabled = true, intervalMs = 3000 } = options;
  const status = useRealtimeStatus();
  const refetchRef = useRef(refetch);
  refetchRef.current = refetch;

  useEffect(() => {
    if (!enabled) return;
    if (status === 'SUBSCRIBED') return; // realtime ok, não precisa polling
    if (status === 'CONNECTING') return; // ainda estabelecendo

    // CHANNEL_ERROR / TIMED_OUT / CLOSED → ativa polling
    const id = window.setInterval(() => {
      refetchRef.current();
    }, intervalMs);

    return () => window.clearInterval(id);
  }, [status, enabled, intervalMs]);

  return { isPolling: status !== 'SUBSCRIBED' && status !== 'CONNECTING' && enabled };
}
