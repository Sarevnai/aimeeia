// ========== AIMEE.iA - ELEVENLABS VOICES PROXY ==========
// Lists voices from the tenant's ElevenLabs account without exposing API key to frontend.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders, corsResponse, jsonResponse, errorResponse } from '../_shared/supabase.ts';

const ELEVENLABS_BASE_URL = 'https://api.elevenlabs.io/v1';

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return corsResponse();

  try {
    const apiKey = Deno.env.get('ELEVENLABS_API_KEY');
    if (!apiKey) {
      return errorResponse('ELEVENLABS_API_KEY not configured', 500);
    }

    const response = await fetch(`${ELEVENLABS_BASE_URL}/voices`, {
      headers: { 'xi-api-key': apiKey },
    });

    if (!response.ok) {
      const body = await response.text();
      return errorResponse(`ElevenLabs API error (${response.status}): ${body}`, response.status);
    }

    const data = await response.json();

    const voices = (data.voices || []).map((v: any) => ({
      voice_id: v.voice_id,
      name: v.name,
      category: v.category || null,
      labels: v.labels || {},
      preview_url: v.preview_url || null,
    }));

    return jsonResponse({ voices });
  } catch (err) {
    return errorResponse(`Failed to fetch voices: ${err.message}`);
  }
});
