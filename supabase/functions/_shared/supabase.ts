// ========== AIMEE.iA v2 - SUPABASE CLIENT ==========
// Single factory. Uses service_role for edge functions (bypasses RLS).

import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

let _client: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient {
  if (_client) return _client;

  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (!url || !key) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  }

  _client = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false }
  });

  return _client;
}

// ========== CORS HEADERS ==========

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

export function corsResponse() {
  return new Response('ok', { headers: corsHeaders });
}

export function jsonResponse(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

export function errorResponse(message: string, status = 500) {
  console.error(`❌ ${message}`);
  return jsonResponse({ error: message }, status);
}
