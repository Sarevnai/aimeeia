// ========== AIMEE.iA v2 - SEND WA MESSAGE ==========
// Standalone function for sending text messages.
// Used by dashboard (operator manual messages) and internal functions.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getSupabaseClient, corsHeaders, corsResponse, jsonResponse, errorResponse } from '../_shared/supabase.ts';
import { sendWhatsAppMessage, saveOutboundMessage } from '../_shared/whatsapp.ts';
import { Tenant } from '../_shared/types.ts';
import { stripDashes, stripTourLinks, numeralizeMonetaryAndMetric } from '../_shared/utils.ts';

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return corsResponse();

  const supabase = getSupabaseClient();

  try {
    const { tenant_id, phone_number, message: rawMessage, conversation_id, department_code, sender_type, sender_id, event_type, reply_to_id, reply_to_wa_id } = await req.json();

    if (!tenant_id || !phone_number || !rawMessage) {
      return errorResponse('Missing required fields', 400);
    }

    // Travessão guard: AI messages composed outside ai-agent (e.g. operator
    // tooling, manual retomada) bypass pre-completion-check. Strip em/en-dash
    // here so the rule from commit a71b3cf holds across all entry points.
    // Operator manual messages keep their dashes — only sender_type='ai' is
    // sanitized.
    let message = rawMessage as string;
    if (sender_type === 'ai') {
      const dashResult = stripDashes(message);
      if (dashResult.count > 0) {
        console.log(`✂️  send-wa-message: removed ${dashResult.count} travessão(ões) from ai message`);
        message = dashResult.sanitized;
      }
      // Tour virtual NUNCA vai pro cliente (decisão Ian, caso Terezinha 2026-04-25).
      const tourResult = stripTourLinks(message);
      if (tourResult.count > 0) {
        console.log(`🚫 send-wa-message: blocked ${tourResult.count} tour link(s) from ai message`);
        message = tourResult.sanitized;
      }
      // Valores monetários por extenso → numeral (caso Erick 2026-04-26).
      const moneyResult = numeralizeMonetaryAndMetric(message);
      if (moneyResult.count > 0) {
        console.log(`💰 send-wa-message: numeralized ${moneyResult.count} monetary/metric value(s)`);
        message = moneyResult.sanitized;
      }
    }

    // Load tenant
    const { data: tenant } = await supabase
      .from('tenants')
      .select('*')
      .eq('id', tenant_id)
      .single();

    if (!tenant) return errorResponse('Tenant not found', 404);

    // Resolve reply_to_wa_id from reply_to_id se o cliente só passou o ID local
    let resolvedReplyWaId: string | null = reply_to_wa_id || null;
    if (reply_to_id && !resolvedReplyWaId) {
      const { data: repliedMsg } = await supabase
        .from('messages')
        .select('wa_message_id')
        .eq('id', reply_to_id)
        .maybeSingle();
      resolvedReplyWaId = repliedMsg?.wa_message_id || null;
    }

    // Issue 4: Formatar mensagem com identidade do operador
    let formattedMessage = message;

    if (sender_type === 'operator' && sender_id) {
      // Cascade: tenta por user_id (auth.users.id) primeiro, depois por profiles.id como fallback.
      // O ChatPage envia user?.id (auth ID) como sender_id, que mapeia para profiles.user_id.
      // Porém, alguns perfis podem ter user_id nulo — o fallback por profiles.id cobre esse caso.
      let profile: { full_name: string | null } | null = null;

      const { data: byUserId } = await supabase
        .from('profiles')
        .select('full_name')
        .eq('user_id', sender_id)
        .eq('tenant_id', tenant_id)
        .maybeSingle();

      if (byUserId?.full_name) {
        profile = byUserId;
      } else {
        const { data: byId } = await supabase
          .from('profiles')
          .select('full_name')
          .eq('id', sender_id)
          .eq('tenant_id', tenant_id)
          .maybeSingle();
        profile = byId;
      }

      const operatorName = profile?.full_name || 'Operador';

      if (event_type === 'operator_joined') {
        // Handoff: monospace no WhatsApp
        formattedMessage = `\`${operatorName} entrou na conversa\``;
      } else {
        // Mensagem comum: negrito + quebra de linha
        formattedMessage = `*${operatorName}*\n\n${message}`;
      }
    }

    // Send message (with formatted content for WhatsApp)
    const { success, messageId } = await sendWhatsAppMessage(phone_number, formattedMessage, tenant as Tenant, resolvedReplyWaId);

    if (!success) return errorResponse('Failed to send message', 502);

    // Save to DB (original message, without operator prefix)
    await saveOutboundMessage(
      supabase, tenant_id, conversation_id || null,
      phone_number, message, messageId, department_code,
      undefined, undefined,
      sender_type || 'operator', sender_id || null,
      event_type || null,
      reply_to_id ? Number(reply_to_id) : null,
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
