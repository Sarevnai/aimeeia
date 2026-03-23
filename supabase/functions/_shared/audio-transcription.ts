// ========== AUDIO TRANSCRIPTION (WhatsApp → Gemini) ==========
// Downloads audio from Meta Cloud API and transcribes via Gemini multimodal.

const META_API_VERSION = 'v21.0';
const META_API_BASE = 'https://graph.facebook.com';
const GEMINI_TRANSCRIPTION_MODEL = 'gemini-2.0-flash';

function getGeminiApiKey(): string {
  const key = Deno.env.get('GOOGLE_AI_API_KEY')
    || Deno.env.get('GOOGLE_API_KEY')
    || Deno.env.get('GEMINI_API_KEY');
  if (!key) throw new Error('No Gemini API key found (GOOGLE_AI_API_KEY / GOOGLE_API_KEY / GEMINI_API_KEY)');
  return key;
}

/**
 * Downloads media binary from WhatsApp (Meta Cloud API).
 * Step 1: GET media metadata (returns download URL)
 * Step 2: GET binary from that URL
 */
export async function downloadWhatsAppMedia(
  mediaId: string,
  accessToken: string
): Promise<{ data: ArrayBuffer; mimeType: string }> {
  // Step 1: Get media URL
  const metaRes = await fetch(
    `${META_API_BASE}/${META_API_VERSION}/${mediaId}`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );

  if (!metaRes.ok) {
    const err = await metaRes.text();
    throw new Error(`Meta media metadata failed (${metaRes.status}): ${err}`);
  }

  const metaJson = await metaRes.json();
  const downloadUrl = metaJson.url;

  if (!downloadUrl) {
    throw new Error('Meta media response missing url field');
  }

  // Step 2: Download binary
  const mediaRes = await fetch(downloadUrl, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!mediaRes.ok) {
    throw new Error(`Meta media download failed (${mediaRes.status})`);
  }

  const data = await mediaRes.arrayBuffer();
  const mimeType = mediaRes.headers.get('content-type') || 'audio/ogg';

  return { data, mimeType };
}

/**
 * Transcribes audio using Gemini multimodal API (inline base64 data).
 */
export async function transcribeAudio(
  audioData: ArrayBuffer,
  mimeType: string
): Promise<string> {
  const apiKey = getGeminiApiKey();

  // Convert ArrayBuffer → base64
  const uint8 = new Uint8Array(audioData);
  let binary = '';
  for (let i = 0; i < uint8.length; i++) {
    binary += String.fromCharCode(uint8[i]);
  }
  const base64 = btoa(binary);

  // Clean mime_type (remove codecs suffix for Gemini compatibility)
  const cleanMime = mimeType.split(';')[0].trim();

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_TRANSCRIPTION_MODEL}:generateContent?key=${apiKey}`;

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{
        parts: [
          {
            inline_data: {
              mime_type: cleanMime,
              data: base64,
            },
          },
          {
            text: 'Transcreva este áudio em português brasileiro. Retorne APENAS o texto transcrito, sem formatação adicional, sem aspas, sem prefixos.',
          },
        ],
      }],
      generationConfig: {
        maxOutputTokens: 1024,
        temperature: 0.1,
      },
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Gemini transcription failed (${res.status}): ${err}`);
  }

  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;

  if (!text) {
    throw new Error('Gemini returned empty transcription');
  }

  return text.trim();
}

/**
 * Convenience: download WhatsApp audio + transcribe via Gemini.
 */
export async function transcribeWhatsAppAudio(
  mediaId: string,
  mimeType: string,
  accessToken: string
): Promise<string> {
  const media = await downloadWhatsAppMedia(mediaId, accessToken);
  return await transcribeAudio(media.data, mimeType || media.mimeType);
}
