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

// Helper to generate embedding for the search
async function generateEmbedding(text: string): Promise<number[]> {
  const apiKey = Deno.env.get('OPENAI_API_KEY') || Deno.env.get('LOVABLE_API_KEY');
  if (!apiKey) throw new Error('OPENAI_API_KEY or LOVABLE_API_KEY not configured for embeddings');

  const response = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'text-embedding-3-small',
      input: text,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Embedding API error (${response.status}): ${error}`);
  }

  const data = await response.json();
  return data.data[0].embedding;
}

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

  if (toolName === 'criar_ticket') {
    return await executeCreateTicket(supabase, tenantId, phoneNumber, conversationId, contactId, args);
  }

  if (toolName === 'encaminhar_humano') {
    return await executeAdminHandoff(supabase, tenantId, phoneNumber, conversationId, args);
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
    // Determine the query intent
    const semanticQuery = args.query_semantica ||
      `Imóvel para ${args.finalidade || department || 'locacao'}`;

    console.log(`🔍 Buscando imóveis via vector search para: "${semanticQuery}"`);

    // 1. Generate text embedding for the semantic query
    const queryEmbedding = await generateEmbedding(semanticQuery);

    // 2. Query the match_properties RPC with vectors
    const { data: properties, error } = await supabase.rpc('match_properties', {
      query_embedding: queryEmbedding,
      match_tenant_id: tenantId,
      match_threshold: 0.2, // Very low threshold to ensure we return *something* similar
      match_count: 5,
      filter_max_price: args.preco_max || null,
      filter_tipo: null // Assuming type is usually captured semantically anyway
    });

    if (error) {
      console.error('❌ Property search vector error:', error);
      return 'Não consegui buscar imóveis no nosso catálogo inteligente no momento. Tente novamente em instantes.';
    }

    if (!properties || properties.length === 0) {
      return 'Não encontrei imóveis exatos com esses critérios. Quer tentar expandir a busca ou remover alguns filtros como valor máximo?';
    }

    // Format the properties returned from the pgvector to match PropertyResult structure
    const formattedProperties: PropertyResult[] = properties.map((p: any) => ({
      codigo: p.external_id,
      tipo: p.type || 'Imóvel',
      bairro: p.neighborhood || 'Região',
      cidade: p.city || tenant.city,
      preco: p.price,
      preco_formatado: null, // Let formatCurrency handle it in property.ts
      quartos: p.bedrooms,
      suites: null,
      vagas: null,
      area_util: null,
      link: p.url || '',
      foto_destaque: p.images && p.images.length > 0 ? p.images[0] : null,
      descricao: p.description,
      valor_condominio: null
    }));

    // Save properties to conversation state for consultative flow
    await supabase
      .from('conversation_states')
      .upsert({
        tenant_id: tenantId,
        phone_number: phoneNumber,
        pending_properties: formattedProperties,
        current_property_index: 0,
        awaiting_property_feedback: true,
        last_search_params: { semantic_query: semanticQuery, ...args },
        updated_at: new Date().toISOString(),
      }, { onConflict: 'tenant_id,phone_number' });

    // Send first property with consultative presentation
    const firstProperty = formattedProperties[0];
    if (firstProperty.foto_destaque) {
      await sendWhatsAppImage(
        phoneNumber,
        firstProperty.foto_destaque,
        formatConsultativeProperty(firstProperty, 0, Math.min(formattedProperties.length, 5)),
        tenant
      );
    }

    return formatPropertySummary(formattedProperties);

  } catch (error) {
    console.error('❌ Property search execution error:', error);
    return 'Tive um problema ao buscar imóveis em nosso catálogo. Vou tentar novamente.';
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

// ========== ADMIN TICKET CREATION ==========

async function executeCreateTicket(
  supabase: any,
  tenantId: string,
  phoneNumber: string,
  conversationId: string,
  contactId: string,
  args: any
): Promise<string> {
  try {
    const { titulo, categoria, descricao, prioridade } = args;

    // Look up the ticket category to get SLA hours
    const { data: categoryRow } = await supabase
      .from('ticket_categories')
      .select('id, sla_hours')
      .eq('tenant_id', tenantId)
      .eq('name', categoria)
      .eq('is_active', true)
      .maybeSingle();

    // Look up the first (default) ticket stage ("Novo")
    const { data: defaultStage } = await supabase
      .from('ticket_stages')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('order_index', 0)
      .maybeSingle();

    // Calculate SLA deadline
    const slaHours = categoryRow?.sla_hours || 48;
    const slaDeadline = new Date(Date.now() + slaHours * 60 * 60 * 1000).toISOString();

    // Create the ticket
    const { data: ticket, error } = await supabase
      .from('tickets')
      .insert({
        tenant_id: tenantId,
        title: titulo,
        category: categoria,
        category_id: categoryRow?.id || null,
        description: descricao,
        priority: prioridade || 'media',
        stage: 'Novo',
        stage_id: defaultStage?.id || null,
        phone: phoneNumber,
        source: 'whatsapp_ai',
        contact_id: contactId || null,
        conversation_id: conversationId || null,
        department_code: 'administrativo',
        sla_deadline: slaDeadline,
      })
      .select('id')
      .single();

    if (error) {
      console.error('❌ Ticket creation error:', error);
      return 'Houve um problema ao criar o chamado. Vou transferir para um atendente humano.';
    }

    // Log activity
    await logActivity(supabase, tenantId, 'ticket_created', 'tickets', ticket.id, {
      category: categoria,
      priority: prioridade,
      source: 'ai_agent',
      conversation_id: conversationId,
    });

    console.log(`✅ Ticket created: ${ticket.id} | Category: ${categoria} | Priority: ${prioridade}`);

    return `Chamado #${ticket.id.slice(0, 8)} criado com sucesso. Categoria: ${categoria}. Prioridade: ${prioridade}. A equipe administrativa será notificada.`;

  } catch (error) {
    console.error('❌ Ticket creation execution error:', error);
    return 'Não consegui registrar o chamado automaticamente. Vou transferir para atendimento humano.';
  }
}

// ========== ADMIN OPERATOR HANDOFF ==========

async function executeAdminHandoff(
  supabase: any,
  tenantId: string,
  phoneNumber: string,
  conversationId: string,
  args: any
): Promise<string> {
  try {
    // Disable AI for this conversation (operator takes over)
    await supabase
      .from('conversation_states')
      .upsert({
        tenant_id: tenantId,
        phone_number: phoneNumber,
        is_ai_active: false,
        operator_takeover_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }, { onConflict: 'tenant_id,phone_number' });

    // Log activity
    await logActivity(supabase, tenantId, 'admin_handoff', 'conversations', conversationId, {
      reason: args.motivo,
      department: 'administrativo',
    });

    console.log(`🔄 Admin handoff: conversation ${conversationId} | Reason: ${args.motivo}`);

    return `Atendimento transferido para operador humano. Motivo: ${args.motivo}`;

  } catch (error) {
    console.error('❌ Admin handoff error:', error);
    return 'Vou transferir você para um atendente. Aguarde um momento.';
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
