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
  // Verdade vem de conversation_states.shown_property_ids — não de heurística no body.
  // Caso Daniela 28/04: AI disse "encontrei apartamentos" mas nunca enviou card de
  // imóvel. Heurística antiga marcou hadPropertySearch=true e o follow-up afirmou
  // "Estava te mostrando opções..." mentindo sobre o que aconteceu.
  propertyActuallyShown: boolean;
  contactName: string | null;
  agentName: string;
}

// Capitaliza nome (DANIELA → Daniela, "ana paula" → "Ana Paula"). Primeiro nome só.
function firstNameProper(full: string | null): string | null {
  if (!full) return null;
  const first = full.trim().split(/\s+/)[0];
  if (!first) return null;
  return first.charAt(0).toUpperCase() + first.slice(1).toLowerCase();
}

/**
 * Build a contextual follow-up message based on the conversation state.
 */
function buildContextualFollowUp(ctx: ConversationContext): string {
  const name = firstNameProper(ctx.contactName);
  const personaHeader = `*${ctx.agentName}*\n\n`;
  const greeting = name ? `Oi ${name}! ` : 'Oi! ';

  // --- Remarketing department ---
  if (ctx.departmentCode === 'remarketing') {
    // If we were in property search / presentation — só afirma "olhando opções" se
    // o card foi de fato enviado. Caso contrário, trata como qualificação em curso.
    if (ctx.propertyActuallyShown) {
      const location = ctx.qualification.neighborhood || '';
      const type = ctx.qualification.propertyType || 'imóvel';
      if (location) {
        return `${personaHeader}${greeting}Vi que você estava olhando opções de ${type} em ${location}. Conseguiu pensar sobre? Posso te mostrar mais opções ou tirar alguma dúvida!`;
      }
      return `${personaHeader}${greeting}Você estava vendo algumas opções de imóveis comigo. Quer que eu continue a busca ou tem alguma dúvida?`;
    }

    // If we were qualifying (collecting data)
    if (ctx.moduleSlug === 'qualificacao' || ctx.qualification.interest) {
      const interest = ctx.qualification.interest === 'locacao' ? 'alugar' : 'comprar';
      if (ctx.qualification.neighborhood) {
        return `${personaHeader}${greeting}Estávamos conversando sobre ${interest} um imóvel na região de ${ctx.qualification.neighborhood}. Quer continuar de onde paramos?`;
      }
      return `${personaHeader}${greeting}Estávamos conversando sobre o que você procura em um imóvel. Quer continuar? Estou aqui pra te ajudar a encontrar o lugar ideal!`;
    }

    // Generic remarketing — sem mentir "estávamos vendo opções"
    return `${personaHeader}${greeting}Vi que ficamos sem conversar. Posso continuar te ajudando a encontrar um imóvel quando quiser!`;
  }

  // --- Comercial (venda/locação) — cobre ambos os department_codes reais ---
  // P4 cutover 07/05: antes só 'comercial' batia — não existe esse dept no
  // db, o que mandava toda conversa de venda/locação pro fallback genérico.
  if (ctx.departmentCode === 'vendas' || ctx.departmentCode === 'locacao' || ctx.departmentCode === 'comercial') {
    // "Estava te mostrando" só se realmente mostrou. Caso Daniela 28/04: Aimee
    // disse "encontrei apartamentos" sem nunca enviar card → follow-up mentia
    // dizendo "Estava te mostrando opções...". Agora usa shown_property_ids
    // como single source of truth.
    if (ctx.propertyActuallyShown) {
      const location = ctx.qualification.neighborhood || '';
      const type = ctx.qualification.propertyType || 'imóvel';
      const bedroomsText = ctx.qualification.bedrooms ? ` de ${ctx.qualification.bedrooms} quartos` : '';
      if (location) {
        return `${personaHeader}${greeting}Estava te mostrando opções de ${type}${bedroomsText} em ${location}. Algum te interessou? Posso buscar mais alternativas!`;
      }
      return `${personaHeader}${greeting}Estávamos vendo algumas opções de imóveis${bedroomsText}. Quer que eu continue a busca?`;
    }

    if (ctx.qualification.interest) {
      const interest = ctx.qualification.interest === 'locacao' ? 'alugar' : 'comprar';
      const budget = ctx.qualification.budgetMax
        ? ` com orçamento de até R$ ${(ctx.qualification.budgetMax / 1000).toFixed(0)}mil`
        : '';
      const location = ctx.qualification.neighborhood ? ` em ${ctx.qualification.neighborhood}` : '';
      return `${personaHeader}${greeting}Estávamos conversando sobre ${interest} um imóvel${location}${budget}. Posso continuar te ajudando?`;
    }

    return `${personaHeader}${greeting}Vi que ficamos sem conversar. Ainda posso te ajudar a encontrar o imóvel ideal! É só me chamar.`;
  }

  // --- Atualização (proprietário em imóvel já administrado) ---
  // P4 cutover 07/05: tom diferente — não é busca, é atualização de dado.
  // "Supervisor de Carteira" alinha com label de handoff do P3.
  if (ctx.departmentCode === 'atualizacao') {
    return `${personaHeader}${greeting}Precisava confirmar alguns dados sobre seu imóvel. Consegue me dar um retorno quando puder? Se preferir, nosso Supervisor de Carteira fala com você diretamente.`;
  }

  // --- Handoff pending (waiting for broker) ---
  if (ctx.moduleSlug === 'handoff') {
    return `${personaHeader}${greeting}Já passei suas informações para um corretor. Em breve alguém da equipe vai entrar em contato com você!`;
  }

  // --- Fallback: use context if available, otherwise generic ---
  if (ctx.qualification.neighborhood || ctx.qualification.propertyType) {
    const type = ctx.qualification.propertyType || 'imóvel';
    const location = ctx.qualification.neighborhood ? ` em ${ctx.qualification.neighborhood}` : '';
    return `${personaHeader}${greeting}Estávamos conversando sobre ${type}${location}. Posso continuar te ajudando?`;
  }

  return `${personaHeader}${GENERIC_FOLLOW_UPS[Math.floor(Math.random() * GENERIC_FOLLOW_UPS.length)]}`;
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

        // P4 cutover 07/05: admin NÃO recebe follow-up automático. Clientes
        // do setor administrativo (inquilino/proprietário) estão ou em
        // ticket aberto (follow-up virá do fluxo de SLA do ticket) ou já
        // concluíram demanda — disparar "ainda tá por aí?" soa deslocado.
        if (conversation.department_code === 'administrativo') continue;

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

        // Verdade de "mostrou imóvel?" vem do estado, não de heurística no body.
        // shown_property_ids é populado por executePropertySearch APÓS envio bem-sucedido
        // do card pro WhatsApp. Se vazio, nada foi mostrado de fato.
        const { data: shownState } = await supabase
          .from('conversation_states')
          .select('shown_property_ids')
          .eq('tenant_id', state.tenant_id)
          .eq('phone_number', state.phone_number)
          .maybeSingle();
        const propertyActuallyShown = Array.isArray(shownState?.shown_property_ids) && shownState!.shown_property_ids!.length > 0;

        // Persona name (Helena na Smolka) vem da config — fallback Aimee.
        const { data: aiCfg } = await supabase
          .from('ai_agent_config')
          .select('agent_name')
          .eq('tenant_id', state.tenant_id)
          .maybeSingle();
        const agentName = (aiCfg?.agent_name as string | undefined) || 'Aimee';

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
          propertyActuallyShown,
          contactName: contact?.name || null,
          agentName,
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
