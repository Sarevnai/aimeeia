// ========== AIMEE.iA - FOLLOW-UP CHECK ==========
// Cron-triggered function that detects inactive conversations (5+ min without reply)
// and sends a gentle follow-up message asking if the lead is still there.
// Should be called every 1-2 minutes via pg_cron or external scheduler.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getSupabaseClient, corsHeaders, corsResponse, jsonResponse, errorResponse } from '../_shared/supabase.ts';
import { sendWhatsAppMessage, saveOutboundMessage } from '../_shared/whatsapp.ts';
import { Tenant } from '../_shared/types.ts';

const INACTIVITY_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes

const FOLLOW_UP_MESSAGES = [
  'Oi! Ainda está por aí? 😊 Estou aqui caso precise de algo!',
  'Ei, tudo bem? Se precisar de mais informações, é só me chamar!',
  'Oi! Vi que ficamos sem conversar. Posso te ajudar com mais alguma coisa?',
];

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return corsResponse();

  const supabase = getSupabaseClient();

  try {
    const now = new Date();
    const thresholdTime = new Date(now.getTime() - INACTIVITY_THRESHOLD_MS).toISOString();

    // Find active conversations where:
    // 1. AI is active (not handed off)
    // 2. Triage is completed (not in greeting/triage phase)
    // 3. No follow-up sent yet for this silence period
    // 4. Not currently processing
    const { data: activeStates, error: statesError } = await supabase
      .from('conversation_states')
      .select('tenant_id, phone_number, follow_up_sent_at, triage_stage')
      .eq('is_ai_active', true)
      .eq('is_processing', false)
      .in('triage_stage', ['completed', 'remarketing_vip_pitch'])
      .is('follow_up_sent_at', null);

    if (statesError) {
      console.error('❌ Error fetching conversation states:', statesError);
      return errorResponse(statesError.message);
    }

    if (!activeStates || activeStates.length === 0) {
      return jsonResponse({ status: 'ok', checked: 0, followed_up: 0 });
    }

    let followedUp = 0;

    for (const state of activeStates) {
      try {
        // Find the active conversation for this phone
        const { data: conversation } = await supabase
          .from('conversations')
          .select('id, department_code')
          .eq('tenant_id', state.tenant_id)
          .eq('phone_number', state.phone_number)
          .eq('status', 'active')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (!conversation) continue;

        // Get the last message in the conversation
        const { data: lastMessage } = await supabase
          .from('messages')
          .select('direction, created_at, sender_type')
          .eq('conversation_id', conversation.id)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (!lastMessage) continue;

        // Only follow up if last message was from AI and older than threshold
        if (lastMessage.direction !== 'outbound' || lastMessage.sender_type !== 'ai') continue;

        const lastMessageTime = new Date(lastMessage.created_at).getTime();
        const silenceMs = now.getTime() - lastMessageTime;

        if (silenceMs < INACTIVITY_THRESHOLD_MS) continue;

        // Don't follow up if silence is too long (> 24h = probably abandoned)
        if (silenceMs > 24 * 60 * 60 * 1000) continue;

        // Load tenant for WhatsApp credentials
        const { data: tenant } = await supabase
          .from('tenants')
          .select('*')
          .eq('id', state.tenant_id)
          .eq('is_active', true)
          .maybeSingle();

        if (!tenant) continue;

        // Pick a random follow-up message
        const followUpMsg = FOLLOW_UP_MESSAGES[Math.floor(Math.random() * FOLLOW_UP_MESSAGES.length)];

        // Send the follow-up
        const result = await sendWhatsAppMessage(state.phone_number, followUpMsg, tenant as Tenant);

        if (result.success || result.messageId) {
          // Save the outbound message
          await saveOutboundMessage(
            supabase,
            state.tenant_id,
            conversation.id,
            state.phone_number,
            followUpMsg,
            result.messageId,
            conversation.department_code || undefined
          );

          // Mark follow-up as sent
          await supabase
            .from('conversation_states')
            .update({ follow_up_sent_at: now.toISOString(), updated_at: now.toISOString() })
            .eq('tenant_id', state.tenant_id)
            .eq('phone_number', state.phone_number);

          console.log(`✅ Follow-up sent to ${state.phone_number} (silence: ${Math.round(silenceMs / 60000)}min)`);
          followedUp++;
        }

      } catch (err) {
        console.error(`❌ Error processing follow-up for ${state.phone_number}:`, err);
      }
    }

    return jsonResponse({
      status: 'ok',
      checked: activeStates.length,
      followed_up: followedUp,
    });

  } catch (error) {
    console.error('❌ Follow-up check error:', error);
    return errorResponse((error as Error).message);
  }
});
