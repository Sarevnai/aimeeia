// ========== AIMEE.iA - FOLLOW-UP CHECK (Context-Aware) ==========
// Cron-triggered function that detects inactive conversations (30+ min without reply)
// and sends a context-aware follow-up message referencing what was being discussed.
// Should be called every 1-2 minutes via pg_cron or external scheduler.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getSupabaseClient, corsHeaders, corsResponse, jsonResponse, errorResponse } from '../_shared/supabase.ts';
import { sendWhatsAppMessage, saveOutboundMessage } from '../_shared/whatsapp.ts';
import { Tenant } from '../_shared/types.ts';

const INACTIVITY_THRESHOLD_MS = 30 * 60 * 1000; // 30 minutes
const MAX_SILENCE_MS = 24 * 60 * 60 * 1000; // 24h = probably abandoned

// Generic fallbacks (only used when we have zero context)
const GENERIC_FOLLOW_UPS = [
  'Ainda está por aí? Estou aqui caso precise de algo.',
  'Tudo bem? Se precisar de mais informações, é só me chamar.',
  'Vi que ficamos sem conversar. Posso te ajudar com mais alguma coisa?',
];

interface ConversationContext {
  departmentCode: string | null;
  moduleSlug: string | null;
  qualification: {
    neighborhood: string | null;
    propertyType: string | null;
    bedrooms: number | null;
    budgetMax: number | null;
    interest: string | null; // comprar / alugar
  };
  lastAssistantMessage: string | null;
  hadPropertySearch: boolean;
  contactName: string | null;
}

/**
 * Build a contextual follow-up message based on the conversation state.
 */
function buildContextualFollowUp(ctx: ConversationContext): string {
  const name = ctx.contactName ? ctx.contactName.split(' ')[0] : null;
  const greeting = name ? `Oi ${name}! ` : 'Oi! ';

  // --- Remarketing department ---
  if (ctx.departmentCode === 'remarketing') {
    // If we were in property search / presentation
    if (ctx.hadPropertySearch || ctx.moduleSlug === 'apresentacao_imovel') {
      const location = ctx.qualification.neighborhood || '';
      const type = ctx.qualification.propertyType || 'imóvel';
      if (location) {
        return `${greeting}Vi que você estava olhando opções de ${type} em ${location}. Conseguiu pensar sobre? Posso te mostrar mais opções ou tirar alguma dúvida!`;
      }
      return `${greeting}Você estava vendo algumas opções de imóveis comigo. Quer que eu continue a busca ou tem alguma dúvida?`;
    }

    // If we were qualifying (collecting data)
    if (ctx.moduleSlug === 'qualificacao' || ctx.qualification.interest) {
      const interest = ctx.qualification.interest === 'locacao' ? 'alugar' : 'comprar';
      if (ctx.qualification.neighborhood) {
        return `${greeting}Estávamos conversando sobre ${interest} um imóvel na região de ${ctx.qualification.neighborhood}. Quer continuar de onde paramos?`;
      }
      return `${greeting}Estávamos conversando sobre o que você procura em um imóvel. Quer continuar? Estou aqui pra te ajudar a encontrar o lugar ideal!`;
    }

    // Generic remarketing
    return `${greeting}Vi que ficamos sem conversar. Lembra que estávamos vendo opções de imóveis pra você? Posso continuar te ajudando quando quiser!`;
  }

  // --- Comercial department ---
  if (ctx.departmentCode === 'comercial') {
    if (ctx.hadPropertySearch || ctx.moduleSlug === 'apresentacao_imovel') {
      const location = ctx.qualification.neighborhood || '';
      const type = ctx.qualification.propertyType || 'imóvel';
      if (location) {
        return `${greeting}Estava te mostrando opções de ${type} em ${location}. Algum te interessou? Posso buscar mais alternativas!`;
      }
      return `${greeting}Estávamos vendo algumas opções de imóveis. Quer que eu continue a busca?`;
    }

    if (ctx.qualification.interest) {
      const interest = ctx.qualification.interest === 'locacao' ? 'alugar' : 'comprar';
      const budget = ctx.qualification.budgetMax
        ? ` com orçamento de até R$ ${(ctx.qualification.budgetMax / 1000).toFixed(0)}mil`
        : '';
      return `${greeting}Estávamos conversando sobre ${interest} um imóvel${budget}. Posso continuar te ajudando?`;
    }

    return `${greeting}Vi que ficamos sem conversar. Ainda posso te ajudar a encontrar o imóvel ideal! É só me chamar.`;
  }

  // --- Handoff pending (waiting for broker) ---
  if (ctx.moduleSlug === 'handoff') {
    return `${greeting}Já passei suas informações para um corretor. Em breve alguém da equipe vai entrar em contato com você!`;
  }

  // --- Fallback: use context if available, otherwise generic ---
  if (ctx.qualification.neighborhood || ctx.qualification.propertyType) {
    const type = ctx.qualification.propertyType || 'imóvel';
    const location = ctx.qualification.neighborhood ? ` em ${ctx.qualification.neighborhood}` : '';
    return `${greeting}Estávamos conversando sobre ${type}${location}. Posso continuar te ajudando?`;
  }

  return GENERIC_FOLLOW_UPS[Math.floor(Math.random() * GENERIC_FOLLOW_UPS.length)];
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return corsResponse();

  const supabase = getSupabaseClient();

  try {
    const now = new Date();
    const thresholdTime = new Date(now.getTime() - INACTIVITY_THRESHOLD_MS).toISOString();

    // Find active conversations where:
    // 1. AI is active (not handed off)
    // 2. Triage is completed
    // 3. Not currently processing
    const { data: activeStates, error: statesError } = await supabase
      .from('conversation_states')
      .select('tenant_id, phone_number, follow_up_sent_at, triage_stage, current_module_slug')
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
        // Find the active conversation
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

        // Get the last few messages to check timing + context
        const { data: recentMessages } = await supabase
          .from('messages')
          .select('direction, created_at, sender_type, body')
          .eq('conversation_id', conversation.id)
          .order('created_at', { ascending: false })
          .limit(5);

        if (!recentMessages || recentMessages.length === 0) continue;

        const lastMessage = recentMessages[0];

        // Only follow up if last message was from AI and older than threshold
        if (lastMessage.direction !== 'outbound' || lastMessage.sender_type !== 'ai') continue;

        const lastMessageTime = new Date(lastMessage.created_at).getTime();
        const silenceMs = now.getTime() - lastMessageTime;

        if (silenceMs < INACTIVITY_THRESHOLD_MS) continue;
        if (silenceMs > MAX_SILENCE_MS) continue;

        // MAX 2 follow-ups per silence period
        let consecutiveFollowUps = 0;
        for (const msg of recentMessages) {
          if (msg.direction === 'inbound') break;
          // Check if it's a follow-up (outbound AI after silence)
          if (msg.direction === 'outbound' && msg.sender_type === 'ai') {
            const msgTime = new Date(msg.created_at).getTime();
            const gap = now.getTime() - msgTime;
            if (gap > INACTIVITY_THRESHOLD_MS) consecutiveFollowUps++;
          }
        }
        if (consecutiveFollowUps >= 2) {
          console.log(`⏭️ Skipping ${state.phone_number}: already sent ${consecutiveFollowUps} follow-ups`);
          continue;
        }

        // Fetch contact name
        const { data: contact } = await supabase
          .from('contacts')
          .select('name')
          .eq('tenant_id', state.tenant_id)
          .eq('phone', state.phone_number)
          .maybeSingle();

        // Fetch qualification data for context
        const { data: qualification } = await supabase
          .from('lead_qualification')
          .select('detected_neighborhood, detected_property_type, detected_bedrooms, detected_budget_max, detected_interest')
          .eq('tenant_id', state.tenant_id)
          .eq('phone_number', state.phone_number)
          .maybeSingle();

        // Check if there was a property search in recent messages
        const hadPropertySearch = recentMessages.some(msg =>
          msg.body && (
            msg.body.includes('encontrei') ||
            msg.body.includes('opções') ||
            msg.body.includes('imóveis disponíveis') ||
            msg.body.includes('resultado da busca')
          )
        );

        // Build context
        const context: ConversationContext = {
          departmentCode: conversation.department_code || null,
          moduleSlug: state.current_module_slug || null,
          qualification: {
            neighborhood: qualification?.detected_neighborhood || null,
            propertyType: qualification?.detected_property_type || null,
            bedrooms: qualification?.detected_bedrooms || null,
            budgetMax: qualification?.detected_budget_max || null,
            interest: qualification?.detected_interest || null,
          },
          lastAssistantMessage: lastMessage.body || null,
          hadPropertySearch,
          contactName: contact?.name || null,
        };

        // Generate contextual follow-up
        const followUpMsg = buildContextualFollowUp(context);

        // Load tenant for WhatsApp credentials
        const { data: tenant } = await supabase
          .from('tenants')
          .select('*')
          .eq('id', state.tenant_id)
          .eq('is_active', true)
          .maybeSingle();

        if (!tenant) continue;

        // Send the follow-up
        const result = await sendWhatsAppMessage(state.phone_number, followUpMsg, tenant as Tenant);

        if (result.success || result.messageId) {
          await saveOutboundMessage(
            supabase,
            state.tenant_id,
            conversation.id,
            state.phone_number,
            followUpMsg,
            result.messageId,
            conversation.department_code || undefined
          );

          await supabase
            .from('conversation_states')
            .update({ follow_up_sent_at: now.toISOString(), updated_at: now.toISOString() })
            .eq('tenant_id', state.tenant_id)
            .eq('phone_number', state.phone_number);

          console.log(`✅ Follow-up sent to ${state.phone_number} (silence: ${Math.round(silenceMs / 60000)}min, dept: ${context.departmentCode}, module: ${context.moduleSlug})`);
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
