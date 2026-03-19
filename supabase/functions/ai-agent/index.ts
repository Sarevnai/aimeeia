// ========== AIMEE.iA v2 - AI AGENT (Multi-Agent Router) ==========
// Thin router that orchestrates: triage → agent selection → LLM call → response.
// Agents: comercial (locacao+vendas), admin (administrativo), remarketing.
// Feature flag MULTI_AGENT_ENABLED controls new vs legacy path.

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
import { Tenant, AIAgentConfig, AIBehaviorConfig, ConversationState, ConversationMessage, PropertyResult, StructuredConfig, TriageConfig } from '../_shared/types.ts';

// Multi-agent imports
import { AgentModule, AgentContext, AgentType } from '../_shared/agents/agent-interface.ts';
import { comercialAgent } from '../_shared/agents/comercial.ts';
import { adminAgent } from '../_shared/agents/admin.ts';
import { remarketingAgent } from '../_shared/agents/remarketing.ts';
import { decryptApiKey, loadConversationHistory, loadRemarketingContext, sendAndSave, generateEmbedding, executeLeadHandoff } from '../_shared/agents/tool-executors.ts';

// ========== AGENT SELECTION (Deterministic — no LLM call) ==========

function selectAgent(
  department: string | null,
  conversationSource: string
): { agentType: AgentType; agent: AgentModule } {
  // Priority 1: Remarketing source always gets remarketing agent
  if (conversationSource === 'remarketing') {
    return { agentType: 'remarketing', agent: remarketingAgent };
  }

  // Priority 2: Admin department
  if (department === 'administrativo') {
    return { agentType: 'admin', agent: adminAgent };
  }

  // Priority 3: Everything else (locacao, vendas, null) uses comercial
  return { agentType: 'comercial', agent: comercialAgent };
}

// ========== FEATURE FLAG ==========

const MULTI_AGENT_ENABLED = Deno.env.get('MULTI_AGENT_ENABLED') !== 'false'; // Default: ON (set to 'false' to disable)

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return corsResponse();

  const supabase = getSupabaseClient();
  let _tenantId: string | undefined;
  let _phoneNumber: string | undefined;

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
    _tenantId = tenant_id;
    _phoneNumber = phone_number;

    if (!tenant_id || !phone_number) {
      return errorResponse('Missing tenant_id or phone_number', 400);
    }

    // ========== LOAD CONTEXT ==========

    const { data: tenant } = await supabase
      .from('tenants')
      .select('*')
      .eq('id', tenant_id)
      .single();

    if (!tenant) return errorResponse('Tenant not found', 404);

    // MC-4: Set processing lock
    await supabase
      .from('conversation_states')
      .upsert({
        tenant_id,
        phone_number,
        is_processing: true,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'tenant_id,phone_number' });

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
      ai_model: 'gpt-4o-mini',
      max_tokens: 500,
      max_history_messages: 10,
      humanize_responses: true,
      fragment_long_messages: true,
      message_delay_ms: 1500,
      emoji_intensity: 'none',
      use_customer_name: true,
      audio_enabled: false,
      custom_instructions: '',
      vista_integration_enabled: false,
    } as any;

    const tenantApiKey = await decryptApiKey((config as any)?.api_key_encrypted);
    const tenantProvider = (config as any)?.ai_provider || 'openai';

    const { data: state } = await supabase
      .from('conversation_states')
      .select('*')
      .eq('tenant_id', tenant_id)
      .eq('phone_number', phone_number)
      .maybeSingle();

    const { data: conversation } = await supabase
      .from('conversations')
      .select('*')
      .eq('id', conversation_id)
      .single();

    // Load qualification data from lead_qualification table
    const { data: qualRow } = await supabase
      .from('lead_qualification')
      .select('*')
      .eq('tenant_id', tenant_id)
      .eq('phone_number', phone_number)
      .maybeSingle();

    const regions = await loadRegions(supabase, tenant_id);

    const { data: behaviorConfig } = await supabase
      .from('ai_behavior_config')
      .select('*')
      .eq('tenant_id', tenant_id)
      .maybeSingle();

    // ========== TRIAGE PHASE ==========

    const triageConfig: TriageConfig | null = (config as any)?.triage_config || null;

    const triageResult = await handleTriage(
      supabase, tenant as Tenant, aiConfig, state as ConversationState | null,
      raw_message || { text: { body: message_body } },
      message_body, phone_number, conversation_id,
      triageConfig,
      contact_name || null
    );

    if (triageResult.shouldContinue) {
      for (const msg of triageResult.responseMessages) {
        await sendAndSave(supabase, tenant as Tenant, tenant_id, conversation_id, phone_number, msg, triageResult.department || null);
        if (aiConfig.message_delay_ms) await sleep(Math.min(aiConfig.message_delay_ms, 3000));
      }

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

      if (triageResult.department) {
        await supabase
          .from('messages')
          .update({ department_code: triageResult.department })
          .eq('conversation_id', conversation_id)
          .is('department_code', null);
      }

      // MC-4: Release processing lock
      await supabase
        .from('conversation_states')
        .update({ is_processing: false, updated_at: new Date().toISOString() })
        .eq('tenant_id', tenant_id)
        .eq('phone_number', phone_number);

      return jsonResponse({
        action: 'triage',
        department: triageResult.department,
        ai_response: triageResult.responseMessages.join('\n'),
      });
    }

    // ========== HANDOFF INTENT DETECTION (MC-1 hard guardrail) ==========

    const handoffIntentRegex = /\b(quero|preciso|pode|gostaria|solicito)\s+(d[oae]\s+)?(atendimento|corretor|corretora|humano|atendente|falar\s+com|agendar\s+visita|visitar)/i;
    const directHandoffRegex = /\b(falar?\s+com\s+(um\s+)?(corretor|humano|atendente|pessoa))\b/i;

    const qualScore = qualRow?.qualification_score || 0;
    const isHandoffIntent = handoffIntentRegex.test(message_body) || directHandoffRegex.test(message_body);

    if (isHandoffIntent && qualScore >= 65) {
      console.log(`🚀 MC-1: Handoff intent detected ("${message_body.slice(0, 60)}"), score=${qualScore}. Bypassing LLM.`);

      const qualData = qualRow || {};
      const contactForHandoff = contact_name || 'Cliente';
      const dossierLines = [
        `Nome: ${contactForHandoff}`,
        `Telefone: ${phone_number}`,
        qualData.detected_interest ? `Finalidade: ${qualData.detected_interest === 'locacao' ? 'Locação' : 'Venda'}` : null,
        qualData.detected_property_type ? `Tipo: ${qualData.detected_property_type}` : null,
        qualData.detected_neighborhood ? `Região: ${qualData.detected_neighborhood}` : null,
        qualData.detected_bedrooms ? `Quartos: ${qualData.detected_bedrooms}` : null,
        qualData.detected_budget_max ? `Orçamento: até R$ ${Number(qualData.detected_budget_max).toLocaleString('pt-BR')}` : null,
      ].filter(Boolean).join('\n');

      // MC-1 handoff uses tool-executors directly (no agent needed)
      const mc1Ctx: AgentContext = {
        tenantId: tenant_id, phoneNumber: phone_number, conversationId: conversation_id,
        contactId: contact_id, tenant: tenant as Tenant, aiConfig, behaviorConfig: null,
        regions: [], department: conversation?.department_code, conversationSource: 'organic',
        contactName: contact_name, qualificationData: qualData, conversationHistory: [],
        directive: null, structuredConfig: null, remarketingContext: null,
        isReturningLead: false, previousQualificationData: null,
        tenantApiKey, tenantProvider, supabase, lastAiMessages: [],
      };

      await executeLeadHandoff(mc1Ctx, { motivo: dossierLines });

      const handoffMsg = `Perfeito, ${contactForHandoff}! Já encaminhei suas informações para um dos nossos corretores especialistas. Em breve você receberá contato para alinhar os detalhes. Qualquer dúvida, estou por aqui!`;
      await sendAndSave(supabase, tenant as Tenant, tenant_id, conversation_id, phone_number, handoffMsg, conversation?.department_code || null);

      // MC-4: Release processing lock
      await supabase
        .from('conversation_states')
        .update({ is_processing: false, updated_at: new Date().toISOString() })
        .eq('tenant_id', tenant_id)
        .eq('phone_number', phone_number);

      return jsonResponse({
        action: 'handoff_direct',
        department: conversation?.department_code,
        ai_response: handoffMsg,
        qualification_score: qualScore,
      });
    }

    // ========== AI PHASE ==========

    const department = conversation?.department_code || null;
    const conversationSource = conversation?.source || 'organic';

    // Check for open admin ticket → override department
    const { data: openAdminTicket } = await supabase
      .from('tickets')
      .select('id')
      .eq('tenant_id', tenant_id)
      .eq('phone', phone_number)
      .eq('department_code', 'administrativo')
      .neq('stage', 'Resolvido')
      .neq('stage', 'Fechado')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const effectiveDepartment = openAdminTicket ? 'administrativo' : department;
    const qualData = qualRow || {};

    // Load AI directive + structured_config
    let directive: any = null;
    let structuredConfig: StructuredConfig | null = null;
    if (effectiveDepartment) {
      const { data: directiveRow } = await supabase
        .from('ai_directives')
        .select('directive_content, structured_config')
        .eq('tenant_id', tenant_id)
        .eq('department', effectiveDepartment)
        .eq('is_active', true)
        .maybeSingle();

      if (directiveRow) {
        directive = directiveRow;
        structuredConfig = directiveRow.structured_config as StructuredConfig | null;
      }
    }

    // C4: Detectar se é uma nova conversa com dados de qualificação herdados de outra sessão
    // Se o qualification_data foi carregado por phone_number mas pertence a outro conversation_id,
    // precisamos sinalizar que o contexto deve ser revalidado
    let isReturningLead = false;
    if (qualRow && qualRow.conversation_id && qualRow.conversation_id !== conversation_id) {
      isReturningLead = true;
      console.log(`🔄 C4: Lead retornante detectado. Qualificação anterior de conversa ${qualRow.conversation_id}, conversa atual ${conversation_id}`);
    }

    // Extract qualification from current message (skip for admin)
    const extracted = effectiveDepartment === 'administrativo' ? {} : extractQualificationFromText(message_body, isReturningLead ? {} : qualData, regions);
    const mergedQual = isReturningLead ? mergeQualificationData({}, extracted) : mergeQualificationData(qualData, extracted);

    if (Object.keys(extracted).length > 0) {
      await saveQualificationData(supabase, tenant_id, conversation_id, contact_id, mergedQual);
    }

    // Load conversation history
    const history = await loadConversationHistory(supabase, tenant_id, conversation_id, aiConfig.max_history_messages || 10, effectiveDepartment);

    // Load remarketing context if applicable
    let remarketingContext: string | null = null;
    if (conversationSource === 'remarketing') {
      remarketingContext = await loadRemarketingContext(supabase, tenant_id, contact_id);
    }

    // ========== AGENT SELECTION & INVOCATION ==========

    let finalResponse: string;

    if (MULTI_AGENT_ENABLED) {
      // === NEW: Multi-Agent Path ===
      const { agentType, agent } = selectAgent(effectiveDepartment, conversationSource);
      console.log(`🤖 Agent: ${agentType} | dept: ${effectiveDepartment} | source: ${conversationSource}`);

      const ctx: AgentContext = {
        tenantId: tenant_id,
        phoneNumber: phone_number,
        conversationId: conversation_id,
        contactId: contact_id,
        tenant: tenant as Tenant,
        aiConfig,
        behaviorConfig: behaviorConfig as AIBehaviorConfig | null,
        regions,
        department: effectiveDepartment,
        conversationSource,
        contactName: contact_name,
        qualificationData: mergedQual,
        conversationHistory: history,
        directive,
        structuredConfig,
        remarketingContext,
        isReturningLead,
        previousQualificationData: isReturningLead ? qualData : null,
        tenantApiKey,
        tenantProvider,
        lastAiMessages: state?.last_ai_messages || [],
        supabase,
      };

      const systemPrompt = agent.buildSystemPrompt(ctx);
      const tools = agent.getTools(ctx);

      const aiResponse = await callLLMWithToolExecution(
        systemPrompt,
        history,
        message_body,
        tools,
        async (toolName, args) => agent.executeToolCall(ctx, toolName, args),
        {
          model: aiConfig.ai_model || 'gpt-4o-mini',
          provider: tenantProvider,
          apiKey: tenantApiKey,
          temperature: 0.7,
          maxTokens: aiConfig.max_tokens || 500,
        }
      );

      finalResponse = await agent.postProcess(ctx, aiResponse);

    } else {
      // === LEGACY: Monolithic Path (fallback) ===
      console.log(`🔧 Legacy mode | dept: ${effectiveDepartment} | source: ${conversationSource}`);

      const systemPrompt = await buildSystemPrompt(
        supabase, aiConfig, tenant, effectiveDepartment, regions,
        contact_name, mergedQual, history, behaviorConfig as AIBehaviorConfig | null,
        directive, conversationSource, remarketingContext,
        isReturningLead, isReturningLead ? qualData : null
      );

      const tools = getToolsForDepartment(effectiveDepartment, structuredConfig?.skills);

      const aiResponse = await callLLMWithToolExecution(
        systemPrompt,
        history,
        message_body,
        tools,
        async (toolName, args) => {
          return await legacyExecuteToolCall(supabase, tenant as Tenant, aiConfig, tenant_id, phone_number, conversation_id, contact_id, toolName, args, mergedQual, effectiveDepartment);
        },
        {
          model: aiConfig.ai_model || 'gpt-4o-mini',
          provider: tenantProvider,
          apiKey: tenantApiKey,
          temperature: 0.7,
          maxTokens: aiConfig.max_tokens || 500,
        }
      );

      finalResponse = aiResponse;

      if (isLoopingQuestion(finalResponse, mergedQual)) {
        const contextSummary = buildContextSummary(mergedQual);
        finalResponse = isQualificationComplete(mergedQual)
          ? `Com base no que conversamos, já tenho um bom perfil. Quer que eu busque opções pra você agora?`
          : `${contextSummary}\n\nBaseado no que já conversamos, posso te ajudar com mais alguma coisa?`;
      }

      if (isRepetitiveMessage(finalResponse, state?.last_ai_messages || [])) {
        finalResponse = aiConfig.fallback_message || 'Posso te ajudar com mais alguma coisa?';
      }

      await updateAntiLoopState(supabase, tenant_id, phone_number, finalResponse);
    }

    // ========== SEND RESPONSE ==========

    if (aiConfig.fragment_long_messages) {
      const fragments = fragmentMessage(finalResponse);
      for (let i = 0; i < fragments.length; i++) {
        await sendAndSave(supabase, tenant as Tenant, tenant_id, conversation_id, phone_number, fragments[i], effectiveDepartment);
        if (i < fragments.length - 1 && aiConfig.message_delay_ms) {
          await sleep(Math.min(aiConfig.message_delay_ms, 3000));
        }
      }
    } else {
      await sendAndSave(supabase, tenant as Tenant, tenant_id, conversation_id, phone_number, finalResponse, effectiveDepartment);
    }

    await logActivity(supabase, tenant_id, 'ai_response', 'conversations', conversation_id, {
      department: effectiveDepartment,
      qualification_score: mergedQual.qualification_score,
      agent_mode: MULTI_AGENT_ENABLED ? 'multi' : 'legacy',
    });

    // MC-4: Release processing lock
    await supabase
      .from('conversation_states')
      .update({ is_processing: false, updated_at: new Date().toISOString() })
      .eq('tenant_id', tenant_id)
      .eq('phone_number', phone_number);

    return jsonResponse({
      action: 'responded',
      department: effectiveDepartment,
      ai_response: finalResponse,
      qualification_score: mergedQual.qualification_score,
    });

  } catch (error) {
    console.error('❌ AI Agent error:', error);

    try {
      if (_tenantId && _phoneNumber) {
        await supabase
          .from('conversation_states')
          .update({ is_processing: false, updated_at: new Date().toISOString() })
          .eq('tenant_id', _tenantId)
          .eq('phone_number', _phoneNumber);
      }
    } catch (_) { /* best effort */ }

    return errorResponse((error as Error).message);
  }
});

// ========== LEGACY TOOL EXECUTION (for fallback path) ==========

async function legacyExecuteToolCall(
  supabase: any,
  tenant: Tenant,
  aiConfig: AIAgentConfig,
  tenantId: string,
  phoneNumber: string,
  conversationId: string,
  contactId: string,
  toolName: string,
  args: any,
  qualData: any,
  department: string | null
): Promise<string> {
  console.log(`🔧 [Legacy] Executing tool: ${toolName}`, args);

  if (toolName === 'buscar_imoveis') {
    return await legacyExecutePropertySearch(supabase, tenant, aiConfig, tenantId, phoneNumber, conversationId, args, department);
  }
  if (toolName === 'enviar_lead_c2s') {
    return await legacyExecuteLeadHandoff(supabase, tenantId, phoneNumber, conversationId, contactId, args, qualData);
  }
  if (toolName === 'criar_ticket') {
    return await legacyExecuteCreateTicket(supabase, tenantId, phoneNumber, conversationId, contactId, args);
  }
  if (toolName === 'encaminhar_humano') {
    return await legacyExecuteAdminHandoff(supabase, tenantId, phoneNumber, conversationId, args);
  }
  return `Ferramenta desconhecida: ${toolName}`;
}

async function legacyExecutePropertySearch(
  supabase: any, tenant: Tenant, aiConfig: AIAgentConfig, tenantId: string, phoneNumber: string,
  conversationId: string, args: any, department: string | null
): Promise<string> {
  try {
    const semanticQuery = args.query_semantica || `Imóvel para ${args.finalidade || department || 'locacao'}`;
    // C1: Margem de 30% acima do orçamento do cliente (regra de negociação imobiliária)
    const clientBudget = args.preco_max || null;
    const searchBudget = clientBudget ? Math.round(clientBudget * 1.3) : null;
    console.log(`🔍 [Legacy] Budget cliente: ${clientBudget} → Busca: ${searchBudget}`);
    const queryEmbedding = await generateEmbedding(semanticQuery);
    const { data: properties, error } = await supabase.rpc('match_properties', {
      query_embedding: queryEmbedding, match_tenant_id: tenantId,
      match_threshold: 0.2, match_count: 5,
      filter_max_price: searchBudget, filter_tipo: args.tipo_imovel || null,
    });
    if (error) return 'Não consegui buscar imóveis no nosso catálogo inteligente no momento. Tente novamente em instantes.';

    // C2: Filtrar imóveis sem preço válido
    let validProperties = (properties || []).filter((p: any) => p.price && p.price > 1);

    // C6: Expansão geográfica proativa
    if (validProperties.length <= 1) {
      console.log(`🌍 [Legacy] C6: Apenas ${validProperties.length} resultado(s). Expansão geográfica...`);
      const expandedQuery = args.tipo_imovel
        ? `${args.tipo_imovel} para ${args.finalidade || 'venda'} em ${tenant.city}`
        : `imóvel para ${args.finalidade || 'venda'} em ${tenant.city}`;
      const expandedEmbedding = await generateEmbedding(expandedQuery);
      const { data: expandedProps } = await supabase.rpc('match_properties', {
        query_embedding: expandedEmbedding, match_tenant_id: tenantId,
        match_threshold: 0.15, match_count: 5,
        filter_max_price: searchBudget, filter_tipo: args.tipo_imovel || null,
      });
      const expandedValid = (expandedProps || []).filter((p: any) => p.price && p.price > 1);
      const originalIds = new Set(validProperties.map((p: any) => p.external_id));
      const newExpanded = expandedValid.filter((p: any) => !originalIds.has(p.external_id));
      validProperties = [...validProperties, ...newExpanded];
    }

    if (validProperties.length === 0) return 'Não encontrei imóveis disponíveis com esses critérios no momento. Quer que eu ajuste a faixa de preço ou o tipo de imóvel?';

    const websiteBase = aiConfig.website_url?.replace(/\/$/, '') || '';
    const formattedProperties: PropertyResult[] = validProperties.map((p: any) => ({
      codigo: p.external_id, tipo: p.type || 'Imóvel', bairro: p.neighborhood || 'Região',
      cidade: p.city || tenant.city, preco: p.price, preco_formatado: null,
      quartos: p.bedrooms, suites: null, vagas: null, area_util: null,
      link: p.url || (websiteBase && p.external_id ? `${websiteBase}/imovel/${p.external_id}` : ''),
      foto_destaque: p.images?.length > 0 ? p.images[0] : null,
      descricao: p.description, valor_condominio: null,
    }));

    await supabase.from('conversation_states').upsert({
      tenant_id: tenantId, phone_number: phoneNumber, pending_properties: formattedProperties,
      current_property_index: 0, awaiting_property_feedback: true,
      last_search_params: { semantic_query: semanticQuery, ...args }, updated_at: new Date().toISOString(),
    }, { onConflict: 'tenant_id,phone_number' });

    // C5: Enviar top 3 imóveis individualmente com foto + caption rico
    const maxToSend = Math.min(formattedProperties.length, 3);
    for (let i = 0; i < maxToSend; i++) {
      const prop = formattedProperties[i];
      const caption = formatConsultativeProperty(prop, i, formattedProperties.length);
      if (prop.foto_destaque) {
        await sendWhatsAppImage(phoneNumber, prop.foto_destaque, caption, tenant);
      } else {
        await sendWhatsAppMessage(phoneNumber, caption, tenant);
      }
      if (i < maxToSend - 1) await sleep(1500);
    }
    const remaining = formattedProperties.length - maxToSend;
    return remaining > 0
      ? `[SISTEMA — INSTRUÇÃO CRÍTICA] ${maxToSend} imóveis já foram enviados ao cliente como cards individuais com foto e link. Restam ${remaining} opções não enviadas ainda. PROIBIDO: listar, numerar, descrever, mencionar bairro, preço, quartos ou qualquer detalhe dos imóveis no texto. Sua resposta deve ser SOMENTE uma frase curta natural, sem emoji, sem exclamação. Exemplo: "Enviei algumas opções. Dá uma olhada e me conta o que achou de cada uma." — aguarde a resposta do cliente antes de enviar mais.`
      : `[SISTEMA — INSTRUÇÃO CRÍTICA] ${maxToSend} imóveis já foram enviados ao cliente como cards individuais com foto e link. PROIBIDO: listar, numerar, descrever, mencionar bairro, preço, quartos ou qualquer detalhe dos imóveis no texto. Sua resposta deve ser SOMENTE uma frase curta natural, sem emoji, sem exclamação. Exemplo: "Enviei algumas opções. Dá uma olhada e me conta o que achou."`;

  } catch (error) {
    console.error('❌ Property search execution error:', error);
    return 'Tive um problema ao buscar imóveis em nosso catálogo. Vou tentar novamente.';
  }
}

async function legacyExecuteLeadHandoff(
  supabase: any, tenantId: string, phoneNumber: string,
  conversationId: string, contactId: string, args: any, qualData: any
): Promise<string> {
  try {
    await supabase.functions.invoke('c2s-create-lead', {
      body: { tenant_id: tenantId, phone_number: phoneNumber, conversation_id: conversationId, contact_id: contactId, reason: args.motivo, qualification_data: qualData },
    });
    await supabase.from('conversation_states').upsert({
      tenant_id: tenantId, phone_number: phoneNumber, is_ai_active: false,
      operator_takeover_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    }, { onConflict: 'tenant_id,phone_number' });
    await supabase.from('messages').insert({ tenant_id: tenantId, conversation_id: conversationId, direction: 'outbound', body: 'Lead transferido para atendimento humano via CRM.', sender_type: 'system', event_type: 'ai_paused', created_at: new Date().toISOString() });
    await supabase.from('conversation_events').insert({ tenant_id: tenantId, conversation_id: conversationId, event_type: 'ai_paused', metadata: { reason: args.motivo, crm: 'c2s' } });
    return 'Lead transferido com sucesso para atendimento humano.';
  } catch (error) {
    console.error('❌ Lead handoff error:', error);
    return 'Vou transferir você para um corretor. Aguarde um momento.';
  }
}

async function legacyExecuteCreateTicket(
  supabase: any, tenantId: string, phoneNumber: string,
  conversationId: string, contactId: string, args: any
): Promise<string> {
  try {
    const { titulo, categoria, descricao, prioridade } = args;
    const { data: categoryRow } = await supabase.from('ticket_categories').select('id, sla_hours').eq('tenant_id', tenantId).eq('name', categoria).eq('is_active', true).maybeSingle();
    const { data: defaultStage } = await supabase.from('ticket_stages').select('id').eq('tenant_id', tenantId).eq('order_index', 0).maybeSingle();
    const slaHours = categoryRow?.sla_hours || 48;
    const slaDeadline = new Date(Date.now() + slaHours * 60 * 60 * 1000).toISOString();
    const { data: ticket, error } = await supabase.from('tickets').insert({
      tenant_id: tenantId, title: titulo, category: categoria, category_id: categoryRow?.id || null,
      description: descricao, priority: prioridade || 'media', stage: 'Novo', stage_id: defaultStage?.id || null,
      phone: phoneNumber, source: 'whatsapp_ai', contact_id: contactId || null, conversation_id: conversationId || null,
      department_code: 'administrativo', sla_deadline: slaDeadline,
    }).select('id').single();
    if (error) return 'Houve um problema ao criar o chamado. Vou transferir para um atendente humano.';
    await logActivity(supabase, tenantId, 'ticket_created', 'tickets', ticket.id, { category: categoria, priority: prioridade, source: 'ai_agent', conversation_id: conversationId });
    return `Chamado #${ticket.id.slice(0, 8)} criado com sucesso. Categoria: ${categoria}. Prioridade: ${prioridade}. A equipe administrativa será notificada.`;
  } catch (error) {
    console.error('❌ Ticket creation execution error:', error);
    return 'Não consegui registrar o chamado automaticamente. Vou transferir para atendimento humano.';
  }
}

async function legacyExecuteAdminHandoff(
  supabase: any, tenantId: string, phoneNumber: string,
  conversationId: string, args: any
): Promise<string> {
  try {
    await supabase.from('conversation_states').upsert({
      tenant_id: tenantId, phone_number: phoneNumber, is_ai_active: false,
      operator_takeover_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    }, { onConflict: 'tenant_id,phone_number' });
    await supabase.from('messages').insert({ tenant_id: tenantId, conversation_id: conversationId, direction: 'outbound', body: `Atendimento transferido para operador humano. Motivo: ${args.motivo}`, sender_type: 'system', event_type: 'ai_paused', created_at: new Date().toISOString() });
    await supabase.from('conversation_events').insert({ tenant_id: tenantId, conversation_id: conversationId, event_type: 'ai_paused', metadata: { reason: args.motivo } });
    await logActivity(supabase, tenantId, 'admin_handoff', 'conversations', conversationId, { reason: args.motivo, department: 'administrativo' });
    return `Atendimento transferido para operador humano. Motivo: ${args.motivo}`;
  } catch (error) {
    console.error('❌ Admin handoff error:', error);
    return 'Vou transferir você para um atendente. Aguarde um momento.';
  }
}
