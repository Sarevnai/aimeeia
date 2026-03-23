// ========== AIMEE.iA v2 - TEXT-TO-SPEECH (ElevenLabs) ==========
// Generates audio from text using ElevenLabs API and uploads to Supabase Storage.

import { AudioConfig } from './types.ts';

const ELEVENLABS_BASE_URL = 'https://api.elevenlabs.io/v1';
const DEFAULT_MODEL_ID = 'eleven_multilingual_v2';
const DEFAULT_OUTPUT_FORMAT = 'opus_48000_64';

// ========== SHOULD SEND AUDIO ==========

export function shouldSendAudio(
  audioConfig: AudioConfig,
  messageType: string | undefined,
  textLength: number
): boolean {
  if (!audioConfig.audio_enabled) return false;
  if (audioConfig.audio_mode === 'text_only') return false;
  if (audioConfig.audio_channel_mirroring && messageType !== 'audio') return false;
  if (audioConfig.audio_max_chars > 0 && textLength > audioConfig.audio_max_chars) return false;
  return true;
}

// ========== GENERATE TTS AUDIO ==========

export async function generateTTSAudio(
  text: string,
  voiceId: string,
  apiKey: string
): Promise<Uint8Array> {
  const url = `${ELEVENLABS_BASE_URL}/text-to-speech/${voiceId}?output_format=${DEFAULT_OUTPUT_FORMAT}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'xi-api-key': apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      text,
      model_id: DEFAULT_MODEL_ID,
      voice_settings: {
        stability: 0.5,
        similarity_boost: 0.75,
      },
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`ElevenLabs TTS error (${response.status}): ${errorBody}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  return new Uint8Array(arrayBuffer);
}

// ========== UPLOAD AUDIO TO SUPABASE STORAGE ==========

export async function uploadAudioToStorage(
  supabase: any,
  audioBytes: Uint8Array,
  tenantId: string
): Promise<string> {
  const fileName = `${tenantId}/${crypto.randomUUID()}.ogg`;

  const { error } = await supabase.storage
    .from('audio-tts')
    .upload(fileName, audioBytes, {
      contentType: 'audio/ogg',
      upsert: false,
    });

  if (error) {
    throw new Error(`Storage upload error: ${error.message}`);
  }

  const { data: urlData } = supabase.storage
    .from('audio-tts')
    .getPublicUrl(fileName);

  return urlData.publicUrl;
}
