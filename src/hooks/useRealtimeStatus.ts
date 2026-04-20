// Sprint 6.2 — Hook global de status do Realtime do Supabase.
// Abre um canal de heartbeat e expõe SUBSCRIBED/CHANNEL_ERROR/TIMED_OUT/CLOSED.
// Usado pelo <RealtimeStatusIndicator /> pra mostrar um dot no canto da tela.

import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

export type RealtimeStatus = 'SUBSCRIBED' | 'CHANNEL_ERROR' | 'TIMED_OUT' | 'CLOSED' | 'CONNECTING';

export function useRealtimeStatus(): RealtimeStatus {
  const [status, setStatus] = useState<RealtimeStatus>('CONNECTING');

  useEffect(() => {
    const channel = supabase
      .channel('realtime-heartbeat')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'messages' }, () => {
        // noop — usamos só pra garantir que o canal está vivo
      })
      .subscribe((s) => {
        console.log('[Realtime] heartbeat status:', s);
        setStatus(s as RealtimeStatus);
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  return status;
}
