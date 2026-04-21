import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

// Import the supabase client like this:
// import { supabase } from "@/integrations/supabase/client";

export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    storage: localStorage,
    persistSession: true,
    autoRefreshToken: true,
  },
  realtime: {
    params: {
      eventsPerSecond: 20,
    },
  },
});

// Quando o auth renova o token (ou no boot), envia o token novo pro WS do Realtime.
// Sem isso o WebSocket continua usando o token antigo e dá CHANNEL_ERROR quando expira.
supabase.auth.onAuthStateChange((event, session) => {
  if (session?.access_token) {
    supabase.realtime.setAuth(session.access_token);
    console.log('[Realtime] setAuth após', event, '— token renovado no WS');
  }
});

// Boot: se já tem sessão salva no localStorage, também aplica.
supabase.auth.getSession().then(({ data }) => {
  if (data.session?.access_token) {
    supabase.realtime.setAuth(data.session.access_token);
  }
});