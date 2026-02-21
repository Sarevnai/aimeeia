// ========== AIMEE.iA v2 - AI AGENT ==========
// Unified AI agent. Orchestrates: triage → qualification → property search → handoff.
// Single entry point invoked by whatsapp-webhook.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getSupabaseClient, corsHeaders, corsResponse, jsonResponse, errorResponse } from '../_shared/supabase.ts';
import { callLLMWithToolExecution } from '../_shared/ai-call.ts';
import { sendWhatsAppMessage, sendWhatsAppButtons, sendWhatsAppImage, saveOutboundMessage } from '../_shared/whatsapp.ts';
import { handleTriage } from '../_shared/triage.ts';
import { buildSystemPrompt, getToolsForDepartment, buildContextSummary } from '../_shared/prompts.ts';
import { extractQualificationFromText, mergeQualificationData, saveQualificationData, isQualificationComplete } from '../_shared/qualification.ts';
import { loadRegions } from '../_shared/regions.ts';
import { isLoopingQuestion, isRepetitiveMessage, updateAntiLoopState } from '../_shared/anti-loop.ts';
import { formatConsultativeProperty, formatPropertySummary, buildSearchParams } from '../_shared/property.ts';
import { fragmentMessage, logError, logActivity, sleep } from '../_shared/utils.ts';
import { Tenant, AIAgentConfig, AIBehaviorConfig, ConversationState, ConversationMessage, PropertyResult } from '../_shared/types.ts';

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return corsResponse();

  const supabase = getSupabaseClient();

  try {
    const body = await req.json();
    const {
      tenant_id,
      phone_number,
      message_body,
      message_type,
      contact_name,
      conversation_id,
      contact_id,
      raw_message,
    } = body;

    if (!tenant_id || !phone_number) {
      return errorResponse('Missing tenant_id or phone_number', 400);
    }

    // ========== LOAD CONTEXT ==========

    // Tenant
    const { data: tenant } = await supabase
      .from('tenants')
      .select('*')
      .eq('id', tenant_id)
      .single();

    if (!tenant) return errorResponse('Tenant not found', 404);

    // AI Config
    const { data: config } = await supabase
      .from('ai_agent_config')
      .select('*')
      .eq('tenant_id', tenant_id)
      .maybeSingle();

    const aiConfig: AIAgentConfig = config || {
      agent_name: 'Aimee',
      tone: 'friendly',
      greeting_message: null,
      fallback_message: 'Desculpe, tive um problema. Vou encaminhar para atendimento humano.',
      ai_model: 'google/gemini-3-flash-preview',
      max_tokens: 500,
      max_history_messages: 10,
      humanize_responses: true,
      fragment_long_messages: true,
      message_delay_ms: 1500,
      emoji_intensity: 'low',
      use_customer_name: true,
      audio_enabled: false,
      custom_instructions: '',
      vista_integration_enabled: false,
    } as any;

    // Conversation State
    const { data: state } = await supabase
      .from('conversation_states')
      .select('*')
      .eq('tenant_id', tenant_id)
      .eq('phone_number', phone_number)
      .maybeSingle();

    // Conversation
    const { data: conversation } = await supabase
      .from('conversations')
      .select('*, qualification_data')
      .eq('id', conversation_id)
      .single();

    // Regions
    const regions = await loadRegions(supabase, tenant_id);

    // Behavior Config
    const { data: behaviorConfig } = await supabase
      .from('ai_behavior_config')
      .select('*')
      .eq('tenant_id', tenant_id)
      .maybeSingle();

    // ========== TRIAGE PHASE ==========

    const triageResult = await handleTriage(
      supabase, tenant as Tenant, aiConfig, state as ConversationState | null,
      raw_message || { text: { body: message_body } },
      message_body, phone_number, conversation_id
    );

    if (triageResult.shouldContinue) {
      // Send triage response messages
      for (const msg of triageResult.responseMessages) {
        await sendAndSave(supabase, tenant as Tenant, tenant_id, conversation_id, phone_number, msg, triageResult.department || null);
        if (aiConfig.message_delay_ms) await sleep(Math.min(aiConfig.message_delay_ms, 3000));
      }

      // If awaiting triage and no department detected, send buttons
      if (!triageResult.department && state?.triage_stage === 'awaiting_triage') {
        await sendWhatsAppButtons(
          phone_number,
          'Como posso te ajudar?',
          [
            { id: 'dept_locacao', title: 'Alugar' },
            { id: 'dept_vendas', title: 'Comprar' },
            { id: 'dept_admin', title: 'Administrativo' },
          ],
          tenant as Tenant
        );
      }

      return jsonResponse({
        action: 'triage',
        department: triageResult.department,
        ai_response: triageResult.responseMessages.join('\n'),
      });
    }

    // ========== AI PHASE ==========

    const department = conversation?.department_code || null;
    const qualData = conversation?.qualification_data || {};

    // Extract qualification from current message
    const extracted = extractQualificationFromText(message_body, qualData, regions);
    const mergedQual = mergeQualificationData(qualData, extracted);

    // Save updated qualification
    if (Object.keys(extracted).length > 0) {
      await saveQualificationData(supabase, tenant_id, conversation_id, contact_id, mergedQual);
    }

    // Load conversation history
    const history = await loadConversationHistory(supabase, tenant_id, conversation_id, aiConfig.max_history_messages || 10);

    // Build system prompt
    const systemPrompt = await buildSystemPrompt(
      supabase, aiConfig, tenant, department, regions,
      contact_name, mergedQual, history, behaviorConfig as AIBehaviorConfig | null
    );

    // Get tools
    const tools = getToolsForDepartment(department);

    // Call LLM with tool execution
    const aiResponse = await callLLMWithToolExecution(
      systemPrompt,
      history,
      message_body,
      tools,
      async (toolName, args) => {
        return await executeToolCall(supabase, tenant as Tenant, tenant_id, phone_number, conversation_id, contact_id, toolName, args, mergedQual, department);
      },
      {
        model: aiConfig.ai_model || 'openai/gpt-4o-mini',
        temperature: 0.7,
        maxTokens: aiConfig.max_tokens || 500,
      }
    );

    // ========== ANTI-LOOP CHECK ==========

    let finalResponse = aiResponse;

    if (isLoopingQuestion(finalResponse, mergedQual)) {
      // Get next logical question instead
      const contextSummary = buildContextSummary(mergedQual);
      finalResponse = isQualificationComplete(mergedQual)
        ? `Tenho todas as informações necessárias. Vou buscar imóveis para você! 🔍`
        : `${contextSummary}\n\nBaseado no que já conversamos, posso te ajudar com mais alguma coisa?`;
    }

    if (isRepetitiveMessage(finalResponse, state?.last_ai_messages || [])) {
      finalResponse = aiConfig.fallback_message || 'Posso te ajudar com mais alguma coisa?';
    }

    // Update anti-loop state
    await updateAntiLoopState(supabase, tenant_id, phone_number, finalResponse);

    // ========== SEND RESPONSE ==========

    if (aiConfig.fragment_long_messages) {
      const fragments = fragmentMessage(finalResponse);
      for (let i = 0; i < fragments.length; i++) {
        await sendAndSave(supabase, tenant as Tenant, tenant_id, conversation_id, phone_number, fragments[i], department);
        if (i < fragments.length - 1 && aiConfig.message_delay_ms) {
          await sleep(Math.min(aiConfig.message_delay_ms, 3000));
        }
      }
    } else {
      await sendAndSave(supabase, tenant as Tenant, tenant_id, conversation_id, phone_number, finalResponse, department);
    }

    // Log activity
    await logActivity(supabase, tenant_id, 'ai_response', 'conversations', conversation_id, {
      department,
      qualification_score: mergedQual.qualification_score,
    });

    return jsonResponse({
      action: 'responded',
      department,
      ai_response: finalResponse,
      qualification_score: mergedQual.qualification_score,
    });

  } catch (error) {
    console.error('❌ AI Agent error:', error);
    return errorResponse((error as Error).message);
  }
});

// ========== TOOL EXECUTION ==========

async function executeToolCall(
  supabase: any,
  tenant: Tenant,
  tenantId: string,
  phoneNumber: string,
  conversationId: string,
  contactId: string,
  toolName: string,
  args: any,
  qualData: any,
  department: string | null
): Promise<string> {
  console.log(`🔧 Executing tool: ${toolName}`, args);

  if (toolName === 'buscar_imoveis') {
    return await executePropertySearch(supabase, tenant, tenantId, phoneNumber, conversationId, args, department);
  }

  if (toolName === 'enviar_lead_c2s') {
    return await executeLeadHandoff(supabase, tenantId, phoneNumber, conversationId, contactId, args, qualData);
  }

  return `Ferramenta desconhecida: ${toolName}`;
}

async function executePropertySearch(
  supabase: any,
  tenant: Tenant,
  tenantId: string,
  phoneNumber: string,
  conversationId: string,
  args: any,
  department: string | null
): Promise<string> {
  try {
    // Build search params
    const searchParams = buildSearchParams(args, tenant, department || 'locacao');

    // Call vista-search-properties edge function
    const { data, error } = await supabase.functions.invoke('vista-search-properties', {
      body: {
        tenant_id: tenantId,
        search_params: searchParams,
      },
    });

    if (error || !data?.properties) {
      console.error('❌ Property search error:', error);
      return 'Não consegui buscar imóveis no momento. Tente novamente em instantes.';
    }

    const properties: PropertyResult[] = data.properties;

    if (properties.length === 0) {
      return 'Não encontrei imóveis com esses critérios. Quer ajustar a busca? Por exemplo, mudar a região ou faixa de valor?';
    }

    // Save properties to conversation state for consultative flow
    await supabase
      .from('conversation_states')
      .upsert({
        tenant_id: tenantId,
        phone_number: phoneNumber,
        pending_properties: properties.slice(0, 5),
        current_property_index: 0,
        awaiting_property_feedback: true,
        last_search_params: searchParams,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'tenant_id,phone_number' });

    // Send first property with consultative presentation
    const firstProperty = properties[0];
    if (firstProperty.foto_destaque) {
      await sendWhatsAppImage(
        phoneNumber,
        firstProperty.foto_destaque,
        formatConsultativeProperty(firstProperty, 0, Math.min(properties.length, 5)),
        tenant
      );
    }

    return formatPropertySummary(properties.slice(0, 5));

  } catch (error) {
    console.error('❌ Property search execution error:', error);
    return 'Tive um problema ao buscar imóveis. Vou tentar novamente.';
  }
}

async function executeLeadHandoff(
  supabase: any,
  tenantId: string,
  phoneNumber: string,
  conversationId: string,
  contactId: string,
  args: any,
  qualData: any
): Promise<string> {
  try {
    // Invoke c2s-create-lead
    await supabase.functions.invoke('c2s-create-lead', {
      body: {
        tenant_id: tenantId,
        phone_number: phoneNumber,
        conversation_id: conversationId,
        contact_id: contactId,
        reason: args.motivo,
        qualification_data: qualData,
      },
    });

    // Disable AI for this conversation
    await supabase
      .from('conversation_states')
      .upsert({
        tenant_id: tenantId,
        phone_number: phoneNumber,
        is_ai_active: false,
        operator_takeover_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }, { onConflict: 'tenant_id,phone_number' });

    return 'Lead transferido com sucesso para atendimento humano.';

  } catch (error) {
    console.error('❌ Lead handoff error:', error);
    return 'Vou transferir você para um corretor. Aguarde um momento.';
  }
}

// ========== HELPERS ==========

async function loadConversationHistory(
  supabase: any,
  tenantId: string,
  conversationId: string,
  maxMessages: number
): Promise<ConversationMessage[]> {
  const { data: messages } = await supabase
    .from('messages')
    .select('direction, body')
    .eq('tenant_id', tenantId)
    .eq('conversation_id', conversationId)
    .not('body', 'is', null)
    .order('created_at', { ascending: false })
    .limit(maxMessages);

  if (!messages || messages.length === 0) return [];

  return messages.reverse().map((m: any) => ({
    role: m.direction === 'inbound' ? 'user' : 'assistant',
    content: m.body,
  })) as ConversationMessage[];
}

async function sendAndSave(
  supabase: any,
  tenant: Tenant,
  tenantId: string,
  conversationId: string,
  phoneNumber: string,
  message: string,
  department: string | null
) {
  const { messageId } = await sendWhatsAppMessage(phoneNumber, message, tenant);
  await saveOutboundMessage(supabase, tenantId, conversationId, phoneNumber, message, messageId, department || undefined);
}
