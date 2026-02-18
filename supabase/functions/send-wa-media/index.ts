// ========== AIMEE.iA v2 - SEND WA MEDIA ==========
// Sends media messages (images, documents, audio) via Meta Cloud API.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getSupabaseClient, corsHeaders, corsResponse, jsonResponse, errorResponse } from '../_shared/supabase.ts';
import { sendWhatsAppImage, saveOutboundMessage } from '../_shared/whatsapp.ts';
import { Tenant } from '../_shared/types.ts';

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return corsResponse();

  const supabase = getSupabaseClient();

  try {
    const { tenant_id, phone_number, media_url, media_type, caption, conversation_id, department_code } = await req.json();

    if (!tenant_id || !phone_number || !media_url) {
      return errorResponse('Missing required fields', 400);
    }

    const { data: tenant } = await supabase
      .from('tenants')
      .select('*')
      .eq('id', tenant_id)
      .single();

    if (!tenant) return errorResponse('Tenant not found', 404);

    const t = tenant as Tenant;

    if (!t.wa_phone_number_id || !t.wa_access_token) {
      return errorResponse('Tenant missing WhatsApp credentials', 400);
    }

    // Send based on media type
    let success = false;
    let messageId: string | undefined;

    if (media_type === 'image' || media_url.match(/\.(jpg|jpeg|png|gif|webp)$/i)) {
      const result = await sendWhatsAppImage(phone_number, media_url, caption || '', t);
      success = result.success;
      messageId = result.messageId;
    } else {
      // Document/Audio - send via Meta API directly
      const url = `https://graph.facebook.com/v21.0/${t.wa_phone_number_id}/messages`;
      const msgType = media_type || 'document';

      const body: any = {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: phone_number,
        type: msgType,
      };

      body[msgType] = { link: media_url };
      if (caption) body[msgType].caption = caption;

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${t.wa_access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      const data = await response.json();
      success = response.ok;
      messageId = data.messages?.[0]?.id;
    }

    if (!success) return errorResponse('Failed to send media', 502);

    // Save outbound
    await saveOutboundMessage(
      supabase, tenant_id, conversation_id || null,
      phone_number, caption || `[${media_type || 'media'}]`,
      messageId, department_code, media_type, media_url
    );

    return jsonResponse({ success: true, message_id: messageId });

  } catch (error) {
    console.error('❌ Send media error:', error);
    return errorResponse((error as Error).message);
  }
});
