// ========== AIMEE.iA v2 - SEND WA MESSAGE ==========
// Standalone function for sending text messages.
// Used by dashboard (operator manual messages) and internal functions.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getSupabaseClient, corsHeaders, corsResponse, jsonResponse, errorResponse } from '../_shared/supabase.ts';
import { sendWhatsAppMessage, saveOutboundMessage } from '../_shared/whatsapp.ts';
import { Tenant } from '../_shared/types.ts';

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return corsResponse();

  const supabase = getSupabaseClient();

  try {
    const { tenant_id, phone_number, message, conversation_id, department_code } = await req.json();

    if (!tenant_id || !phone_number || !message) {
      return errorResponse('Missing required fields', 400);
    }

    // Load tenant
    const { data: tenant } = await supabase
      .from('tenants')
      .select('*')
      .eq('id', tenant_id)
      .single();

    if (!tenant) return errorResponse('Tenant not found', 404);

    // Send message
    const { success, messageId } = await sendWhatsAppMessage(phone_number, message, tenant as Tenant);

    if (!success) return errorResponse('Failed to send message', 502);

    // Save to DB
    await saveOutboundMessage(
      supabase, tenant_id, conversation_id || null,
      phone_number, message, messageId, department_code
    );

    // Update conversation last_message_at
    if (conversation_id) {
      await supabase
        .from('conversations')
        .update({ last_message_at: new Date().toISOString() })
        .eq('id', conversation_id);
    }

    return jsonResponse({ success: true, message_id: messageId });

  } catch (error) {
    console.error('❌ Send message error:', error);
    return errorResponse((error as Error).message);
  }
});
