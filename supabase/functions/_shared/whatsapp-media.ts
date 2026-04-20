// ========== WHATSAPP MEDIA HOSTING ==========
// Downloads inbound media from Meta Cloud API and hosts it in Supabase Storage
// so the chat UI can render images/audio/documents/video directly.
// Meta's download URLs expire in ~5 minutes and require a bearer token, so we
// must re-host to a public bucket.

import { downloadWhatsAppMedia } from './audio-transcription.ts';

const BUCKET = 'chat-media';

const MIME_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'audio/ogg': 'ogg',
  'audio/mpeg': 'mp3',
  'audio/mp4': 'm4a',
  'audio/aac': 'aac',
  'audio/amr': 'amr',
  'audio/wav': 'wav',
  'video/mp4': 'mp4',
  'video/3gpp': '3gp',
  'application/pdf': 'pdf',
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.ms-excel': 'xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'text/plain': 'txt',
};

function extFromMime(mime: string): string {
  const clean = (mime || '').split(';')[0].trim().toLowerCase();
  return MIME_EXT[clean] || 'bin';
}

export interface HostedMedia {
  publicUrl: string;
  filename: string;
  mimeType: string;
}

/**
 * Downloads a WhatsApp media binary and uploads it to the `chat-media` bucket.
 * Returns a public URL, generated filename, and the actual mime type.
 */
export async function downloadAndHostWhatsAppMedia(
  mediaId: string,
  mediaType: 'image' | 'audio' | 'video' | 'document' | 'sticker',
  accessToken: string,
  context: {
    supabase: any;
    tenantId: string;
    conversationId?: string;
    originalFilename?: string | null;
  }
): Promise<HostedMedia> {
  const media = await downloadWhatsAppMedia(mediaId, accessToken);
  const ext = extFromMime(media.mimeType);
  const timestamp = Date.now();

  const baseName = context.originalFilename
    ? context.originalFilename.replace(/[^a-zA-Z0-9._-]/g, '_')
    : `${mediaType}_${timestamp}.${ext}`;

  const path = `${context.tenantId}/inbound/${context.conversationId || 'unknown'}/${timestamp}_${baseName}`;

  const { error: uploadError } = await context.supabase.storage
    .from(BUCKET)
    .upload(path, new Blob([media.data], { type: media.mimeType }), {
      contentType: media.mimeType,
      upsert: false,
    });

  if (uploadError) {
    throw new Error(`Storage upload failed: ${uploadError.message}`);
  }

  const { data } = context.supabase.storage.from(BUCKET).getPublicUrl(path);

  return {
    publicUrl: data.publicUrl,
    filename: baseName,
    mimeType: media.mimeType,
  };
}
