// Sprint 6.2 — Hook global de status do Realtime do Supabase.
// Abre um canal de heartbeat e expõe SUBSCRIBED/CHANNEL_ERROR/TIMED_OUT/CLOSED.
// Usado pelo <RealtimeStatusIndicator /> pra mostrar um dot no canto da tela.

import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

export type RealtimeStatus = 'SUBSCRIBED' | 'CHANNEL_ERROR' | 'TIMED_OUT' | 'CLOSED' | 'CONNECTING';

export function useRealtimeStatus(): RealtimeStatus {
  const [status, setStatus] = useState<RealtimeStatus>('CONNECTING');

  useEffect(() => {
    // Expõe auth token atual pro debug
    supabase.auth.getSession().then(({ data }) => {
      console.log('[Realtime] sessão:', {
        hasSession: !!data.session,
        expiresAt: data.session?.expires_at,
        userId: data.session?.user?.id,
        tokenStart: data.session?.access_token?.slice(0, 20) + '...',
      });
    });

    const channel = supabase
      .channel('realtime-heartbeat')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'messages' }, (payload) => {
        console.log('[Realtime] heartbeat msg evento:', payload);
      })
      .subscribe((s, err) => {
        console.log('[Realtime] heartbeat status:', s, 'err:', err || '(nenhum)');
        if (err) {
          console.log('[Realtime] err detalhes:', {
            message: (err as any)?.message,
            name: (err as any)?.name,
            stack: (err as any)?.stack?.slice(0, 400),
            full: JSON.stringify(err, Object.getOwnPropertyNames(err as any)),
          });
        }
        setStatus(s as RealtimeStatus);
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  return status;
}
