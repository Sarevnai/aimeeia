// ========== AIMEE.iA v2 - C2S TEST CONNECTION ==========
// Tests connectivity with C2S (Construtor de Vendas) API.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders, corsResponse, jsonResponse, errorResponse } from '../_shared/supabase.ts';

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return corsResponse();

  try {
    const { api_url, api_key } = await req.json();

    if (!api_url || !api_key) {
      return errorResponse('Missing api_url or api_key', 400);
    }

    const baseUrl = api_url.replace(/\/leads\/?$/, '');

    const res = await fetch(`${baseUrl}/tags`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${api_key}`,
        'Content-Type': 'application/json',
      },
    });

    if (res.ok) {
      const data = await res.json().catch(() => null);
      return jsonResponse({ success: true, status: res.status, tags: data });
    } else {
      const body = await res.text().catch(() => '');
      return jsonResponse({ success: false, status: res.status, error: body }, 200);
    }
  } catch (err) {
    return errorResponse(`Connection failed: ${err.message}`, 500);
  }
});
