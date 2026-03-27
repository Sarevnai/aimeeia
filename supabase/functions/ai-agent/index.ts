// ========== AIMEE.iA v2 - AI AGENT (Multi-Agent Router) ==========
// Thin router that orchestrates: triage → agent selection → LLM call → response.
// Agents: comercial (locacao+vendas), admin (administrativo), remarketing.
// Feature flag MULTI_AGENT_ENABLED controls new vs legacy path.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getSupabaseClient, corsHeaders, corsResponse, jsonResponse, errorResponse } from '../_shared/supabase.ts';
import { callLLMWithToolExecution } from '../_shared/ai-call.ts';
import { sendWhatsAppMessage, sendWhatsAppButtons, sendWhatsAppImage, sendWhatsAppAudio, saveOutboundMessage } from '../_shared/whatsapp.ts';
import { handleTriage } from '../_shared/triage.ts';
import { buildSystemPrompt, getToolsForDepartment, buildContextSummary } from '../_shared/prompts.ts';
import { extractQualificationFromText, mergeQualificationData, saveQualificationData, isQualificationComplete, generateTagsFromQualification, syncContactTags } from '../_shared/qualification.ts';
import { loadRegions } from '../_shared/regions.ts';
import { isLoopingQuestion, isRepetitiveMessage, updateAntiLoopState, getRotatingFallback } from '../_shared/anti-loop.ts';
import { formatConsultativeProperty, formatPropertySummary, buildSearchParams } from '../_shared/property.ts';
import { fragmentMessage, logError, logActivity, sleep, formatCurrency } from '../_shared/utils.ts';
import { Tenant, AIAgentConfig, AIBehaviorConfig, ConversationState, ConversationMessage, PropertyResult, StructuredConfig, TriageConfig, AiModule } from '../_shared/types.ts';

// Multi-agent imports
import { AgentModule, AgentContext, AgentType } from '../_shared/agents/agent-interface.ts';
import { comercialAgent } from '../_shared/agents/comercial.ts';
import { adminAgent } from '../_shared/agents/admin.ts';
import { remarketingAgent } from '../_shared/agents/remarketing.ts';
import { decryptApiKey, loadConversationHistory, loadRemarketingContext, sendAndSave, sendAndSaveAudio, generateEmbedding, executeLeadHandoff, generatePropertyCaption, executeAdminHandoff, executeGetNearbyPlaces } from '../_shared/agents/tool-executors.ts';
import { shouldSendAudio, generateTTSAudio, uploadAudioToStorage } from '../_shared/tts.ts';
import { AudioConfig } from '../_shared/types.ts';

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
      quoted_message_body,
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

    // Load qualification data from lead_qualification table (keyed by tenant_id + phone_number)
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
      contact_name || null,
      conversation?.source || null
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
    // MC-1: Only bypass LLM for direct handoff if properties were already shown
    const hasShownProperties = (state?.shown_property_ids || []).length > 0;

    if (isHandoffIntent && qualScore >= 65 && hasShownProperties) {
      console.log(`🚀 MC-1: Handoff intent detected ("${message_body.slice(0, 60)}"), score=${qualScore}, shown=${state?.shown_property_ids?.length}. Bypassing LLM.`);

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
        tenantApiKey, tenantProvider, supabase, lastAiMessages: [], toolsExecuted: [],
        activeModules: [], currentModuleSlug: null,
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
    // For remarketing source, try to load a 'remarketing' directive first;
    // fall back to the effective department directive if not found.
    let directive: any = null;
    let structuredConfig: StructuredConfig | null = null;
    const directiveDepartment = conversationSource === 'remarketing' ? 'remarketing' : effectiveDepartment;

    if (directiveDepartment) {
      const { data: directiveRow } = await supabase
        .from('ai_directives')
        .select('directive_content, structured_config')
        .eq('tenant_id', tenant_id)
        .eq('department', directiveDepartment)
        .eq('is_active', true)
        .maybeSingle();

      if (directiveRow) {
        directive = directiveRow;
        structuredConfig = directiveRow.structured_config as StructuredConfig | null;
      }
    }

    // Fallback: if remarketing directive not found, try the effective department
    if (!directive && conversationSource === 'remarketing' && effectiveDepartment && effectiveDepartment !== 'remarketing') {
      const { data: fallbackRow } = await supabase
        .from('ai_directives')
        .select('directive_content, structured_config')
        .eq('tenant_id', tenant_id)
        .eq('department', effectiveDepartment)
        .eq('is_active', true)
        .maybeSingle();

      if (fallbackRow) {
        directive = fallbackRow;
        structuredConfig = fallbackRow.structured_config as StructuredConfig | null;
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
      await saveQualificationData(supabase, tenant_id, phone_number, contact_id, mergedQual);

      // Auto-tag contact based on qualification data
      const autoTags = generateTagsFromQualification(mergedQual);
      if (autoTags.length > 0 && contact_id) {
        await syncContactTags(supabase, contact_id, autoTags);
      }

      // Invalidate pending_properties when a critical qualification field changes significantly
      // (e.g., budget changed from unknown to 5M, or neighborhood changed)
      const budgetChanged = extracted.detected_budget_max && (!qualData.detected_budget_max || Math.abs(Number(extracted.detected_budget_max) - Number(qualData.detected_budget_max)) / Math.max(Number(qualData.detected_budget_max), 1) > 0.3);
      const neighborhoodChanged = extracted.detected_neighborhood && qualData.detected_neighborhood && extracted.detected_neighborhood !== qualData.detected_neighborhood;

      if (budgetChanged || neighborhoodChanged) {
        console.log(`🔄 Qualification changed significantly (budget: ${budgetChanged}, neighborhood: ${neighborhoodChanged}). Invalidating pending properties.`);
        await supabase
          .from('conversation_states')
          .update({
            pending_properties: null,
            current_property_index: 0,
            awaiting_property_feedback: false,
            updated_at: new Date().toISOString(),
          })
          .eq('tenant_id', tenant_id)
          .eq('phone_number', phone_number);
        // Also clear from local state so the LLM doesn't see stale data
        if (state) {
          state.pending_properties = null;
          state.awaiting_property_feedback = false;
        }
      }
    }

    // Load conversation history
    const history = await loadConversationHistory(supabase, tenant_id, conversation_id, aiConfig.max_history_messages || 10, effectiveDepartment);

    // Inject pending_properties context so the LLM can answer property questions on subsequent turns
    // Only inject if there are actual media/property messages in the conversation history
    // (prevents claiming properties were "sent" when WhatsApp sends failed)
    if (state?.pending_properties && Array.isArray(state.pending_properties) && state.pending_properties.length > 0) {
      const propSummaries = state.pending_properties.slice(0, 5).map((prop: any, i: number) => {
        const descResumo = prop.descricao ? prop.descricao.slice(0, 500) : 'Sem descrição disponível';
        const details = [
          `Código: ${prop.codigo}`,
          `Tipo: ${prop.tipo}`,
          `Bairro: ${prop.bairro}`,
          prop.preco ? `Preço: ${prop.preco_formatado || formatCurrency(prop.preco)}` : null,
          prop.quartos ? `Quartos: ${prop.quartos}` : null,
          prop.suites ? `Suítes: ${prop.suites}` : null,
          prop.vagas ? `Vagas: ${prop.vagas}` : null,
          prop.area_util ? `Área útil: ${prop.area_util}m²` : null,
          prop.valor_condominio && prop.valor_condominio > 1 ? `Condomínio: ${formatCurrency(prop.valor_condominio)}` : null,
          prop.link ? `Link: ${prop.link}` : null,
          `Descrição: ${descResumo}`,
        ].filter(Boolean).join(', ');
        return `Imóvel ${i + 1}: ${details}`;
      }).join('\n');

      history.push({
        role: 'assistant',
        content: `[SISTEMA — CONTEXTO DE IMÓVEIS ENCONTRADOS]\nOs imóveis abaixo foram encontrados para este cliente. Use estas informações para responder perguntas sobre detalhes dos imóveis. Se o cliente pedir novos imóveis ou quiser ver opções diferentes, use a ferramenta buscar_imoveis normalmente.\n\n${propSummaries}`,
      });
    }

    // Load remarketing context if applicable
    let remarketingContext: string | null = null;
    if (conversationSource === 'remarketing') {
      remarketingContext = await loadRemarketingContext(supabase, tenant_id, contact_id);
    }

    // ========== ENRICH MESSAGE WITH QUOTED CONTEXT ==========

    // If the lead replied to a specific message, prepend the quoted context
    // so the LLM understands which message the lead is responding to.
    const enrichedMessageBody = quoted_message_body
      ? `[Em resposta a: "${quoted_message_body}"]\n${message_body}`
      : message_body;

    // ========== LOAD INTELLIGENCE MODULES ==========

    const { data: activeModules } = await supabase
      .from('ai_modules')
      .select('*')
      .eq('tenant_id', tenant_id)
      .eq('is_active', true)
      .order('sort_order', { ascending: true });

    const currentModuleSlug = state?.current_module_slug || null;

    if (activeModules?.length > 0) {
      console.log(`🧩 Modules loaded: ${activeModules.length} active (current: ${currentModuleSlug || 'none'})`);
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
        toolsExecuted: [],
        activeModules: (activeModules as AiModule[]) || [],
        currentModuleSlug,
        supabase,
      };

      let systemPrompt = agent.buildSystemPrompt(ctx);
      const tools = agent.getTools(ctx);

      // Inject audio-awareness instructions when TTS is enabled
      if (aiConfig.audio_enabled && aiConfig.audio_mode !== 'text_only') {
        systemPrompt += `\n\n🎙️ MODO DE RESPOSTA POR ÁUDIO:
IMPORTANTE: Você ENVIA suas respostas por áudio (o sistema converte seu texto em voz). Porém o CLIENTE te escreve por TEXTO. NUNCA diga que o cliente mandou áudio. NUNCA diga que você está "em áudio" e por isso não consegue ver algo. Você lê texto normalmente.
Sua resposta será convertida em áudio e enviada como mensagem de voz no WhatsApp.
REGRAS OBRIGATÓRIAS PARA ÁUDIO:
- Escreva como se estivesse conversando naturalmente.
- NÃO use emojis, asteriscos, bullet points, listas numeradas ou qualquer formatação visual.
- NÃO use abreviações como "apt", "dorm", "m²" — fale por extenso: "apartamento", "dormitórios", "metros quadrados".
- NÃO inclua links ou URLs no texto — eles não funcionam em áudio.
- Use frases curtas e naturais. Evite parágrafos longos.
- Dê pausas naturais usando pontuação (vírgulas, pontos).
- Se precisar listar opções, apresente de forma conversacional: "Temos uma opção no bairro X, e outra no bairro Y".
- Mantenha o tom acolhedor e humano, como uma consultora falando ao telefone.
- Limite sua resposta a no máximo ${aiConfig.audio_max_chars || 500} caracteres para não ficar longo demais.`;
      }

      // Collapse ALL assistant messages with ___ (contract format) to prevent LLM pattern-matching.
      // Triage messages (VIP pitch) are identified and left intact.
      const isTriageMsg = (content: string) => {
        if (!content) return false;
        return content.startsWith('[Template:') || content.startsWith('[SISTEMA') ||
          /^(Olá!?\s+Eu sou|Prazer,?\s|Como posso te chamar|Como posso te ajudar)/i.test(content) ||
          /consultoria imobiliária personalizada|atendo no máximo 2 a 3 clientes|cliente vip/i.test(content) ||
          /^Vou te ajudar a encontrar/i.test(content) ||
          /Posso seguir com seu atendimento VIP/i.test(content);
      };
      const agentLlmHistory = history.map(msg => {
        if (msg.role === 'assistant' && msg.content &&
            msg.content.includes('___') && !isTriageMsg(msg.content)) {
          return {
            ...msg,
            content: '[Contrato de parceria VIP já realizado. O cliente aceitou. Siga para a anamnese — pergunte APENAS o que falta.]',
          };
        }
        return msg;
      });

      const aiResponse = await callLLMWithToolExecution(
        systemPrompt,
        agentLlmHistory,
        enrichedMessageBody,
        tools,
        async (toolName, args) => {
          ctx.toolsExecuted.push(toolName);
          return agent.executeToolCall(ctx, toolName, args);
        },
        {
          model: aiConfig.ai_model || 'gpt-4o-mini',
          provider: tenantProvider,
          apiKey: tenantApiKey,
          temperature: 0.7,
          maxTokens: aiConfig.max_tokens || 500,
        }
      );

      finalResponse = await agent.postProcess(ctx, aiResponse);

      // Persist server-resolved module slug if it changed
      if (ctx.currentModuleSlug && ctx.currentModuleSlug !== currentModuleSlug) {
        await supabase
          .from('conversation_states')
          .update({ current_module_slug: ctx.currentModuleSlug, updated_at: new Date().toISOString() })
          .eq('tenant_id', tenant_id)
          .eq('phone_number', phone_number);
        console.log(`🧩 Module persisted: ${ctx.currentModuleSlug}`);
      }

    } else {
      // === LEGACY: Monolithic Path (fallback) ===
      console.log(`🔧 Legacy mode | dept: ${effectiveDepartment} | source: ${conversationSource}`);

      let systemPrompt = await buildSystemPrompt(
        supabase, aiConfig, tenant, effectiveDepartment, regions,
        contact_name, mergedQual, history, behaviorConfig as AIBehaviorConfig | null,
        directive, conversationSource, remarketingContext,
        isReturningLead, isReturningLead ? qualData : null
      );

      // Inject audio-awareness instructions when TTS is enabled
      if (aiConfig.audio_enabled && aiConfig.audio_mode !== 'text_only') {
        systemPrompt += `\n\n🎙️ MODO DE RESPOSTA POR ÁUDIO:
IMPORTANTE: Você ENVIA suas respostas por áudio (o sistema converte seu texto em voz). Porém o CLIENTE te escreve por TEXTO. NUNCA diga que o cliente mandou áudio. NUNCA diga que você está "em áudio" e por isso não consegue ver algo. Você lê texto normalmente.
Sua resposta será convertida em áudio e enviada como mensagem de voz no WhatsApp.
REGRAS OBRIGATÓRIAS PARA ÁUDIO:
- Escreva como se estivesse conversando naturalmente.
- NÃO use emojis, asteriscos, bullet points, listas numeradas ou qualquer formatação visual.
- NÃO use abreviações como "apt", "dorm", "m²" — fale por extenso: "apartamento", "dormitórios", "metros quadrados".
- NÃO inclua links ou URLs no texto — eles não funcionam em áudio.
- Use frases curtas e naturais. Evite parágrafos longos.
- Dê pausas naturais usando pontuação (vírgulas, pontos).
- Se precisar listar opções, apresente de forma conversacional: "Temos uma opção no bairro X, e outra no bairro Y".
- Mantenha o tom acolhedor e humano, como uma consultora falando ao telefone.
- Limite sua resposta a no máximo ${aiConfig.audio_max_chars || 500} caracteres para não ficar longo demais.`;
      }

      const tools = getToolsForDepartment(effectiveDepartment, structuredConfig?.skills);

      const aiResponse = await callLLMWithToolExecution(
        systemPrompt,
        history,
        enrichedMessageBody,
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
      const lastMsgs = state?.last_ai_messages || [];
      const legacyQualified = isQualificationComplete(mergedQual);

      if (isLoopingQuestion(finalResponse, mergedQual)) {
        console.log('🔄 [Legacy] Loop detected → rotating fallback');
        finalResponse = getRotatingFallback(legacyQualified, lastMsgs);
      }

      if (isRepetitiveMessage(finalResponse, lastMsgs)) {
        console.log('🔄 [Legacy] Repetition detected → rotating fallback');
        finalResponse = getRotatingFallback(legacyQualified, lastMsgs);
      }

      await updateAntiLoopState(supabase, tenant_id, phone_number, finalResponse);
    }

    // ========== STRIP MODULE TAGS ==========
    // LLM no longer needs to declare [MODULO: slug] — resolved server-side.
    // Strip any tags the LLM may still emit for backward compat.
    finalResponse = finalResponse.replace(/\[\s*MODULO\s*:\s*[^\]\n]*?\s*\]\s*/gi, '').trim();

    // ========== SEND RESPONSE ==========

    // Prefixar com nome do agente para identificação no WhatsApp
    const agentName = aiConfig.agent_name || 'Aimee';
    // Strip any agent name prefix the AI may have already included to avoid duplication
    // e.g. "*Helena*\n\n..." or "*Helena Smolka*\n\n..."
    finalResponse = finalResponse.replace(/^\*[^*]+\*\s*\n+/, '');
    // Keep clean text (without agent name prefix) for TTS — so ElevenLabs doesn't speak the name
    const ttsText = finalResponse;
    finalResponse = `*${agentName}*\n\n${finalResponse}`;

    const audioConfig: AudioConfig = {
      audio_enabled: aiConfig.audio_enabled,
      audio_voice_id: aiConfig.audio_voice_id,
      audio_voice_name: aiConfig.audio_voice_name,
      audio_mode: aiConfig.audio_mode,
      audio_max_chars: aiConfig.audio_max_chars || 500,
      audio_channel_mirroring: aiConfig.audio_channel_mirroring,
      audio_voice_stability: aiConfig.audio_voice_stability ?? 0.5,
      audio_voice_similarity: aiConfig.audio_voice_similarity ?? 0.75,
    };

    const wantAudio = shouldSendAudio(audioConfig, message_type, ttsText.length);

    if (wantAudio) {
      const elevenLabsKey = Deno.env.get('ELEVENLABS_API_KEY');
      if (!elevenLabsKey) {
        console.warn('⚠️ ELEVENLABS_API_KEY not set, falling back to text');
        await sendAndSave(supabase, tenant as Tenant, tenant_id, conversation_id, phone_number, finalResponse, effectiveDepartment);
      } else {
        try {
          const audioBytes = await generateTTSAudio(ttsText, audioConfig.audio_voice_id, elevenLabsKey, audioConfig.audio_voice_stability, audioConfig.audio_voice_similarity);
          const audioUrl = await uploadAudioToStorage(supabase, audioBytes, tenant_id);

          if (audioConfig.audio_mode === 'text_and_audio') {
            // Send text message and save to DB
            await sendAndSave(supabase, tenant as Tenant, tenant_id, conversation_id, phone_number, finalResponse, effectiveDepartment);
            await sleep(500);
            // Send audio via WhatsApp but do NOT save duplicate row in messages table
            // The text row above already has the content; audio is just a companion format
            await sendWhatsAppAudio(phone_number, audioUrl, tenant as Tenant);
          } else {
            // audio_only mode: send only audio and save with audio metadata
            await sendAndSaveAudio(supabase, tenant as Tenant, tenant_id, conversation_id, phone_number, finalResponse, audioUrl, effectiveDepartment);
          }
        } catch (ttsError) {
          console.error('❌ TTS error, falling back to text:', ttsError);
          await sendAndSave(supabase, tenant as Tenant, tenant_id, conversation_id, phone_number, finalResponse, effectiveDepartment);
        }
      }
    } else if (aiConfig.fragment_long_messages) {
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
  if (toolName === 'buscar_pontos_de_interesse_proximos') {
    // Wrap arguments to simulate AgentContext for the shared tool executor
    const mockCtx = {
      tenantId,
      supabase,
    } as any;
    return await executeGetNearbyPlaces(mockCtx, args);
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
      filter_neighborhood: args.bairro || null,
      filter_bedrooms: args.quartos || null,
      filter_finalidade: null,
    });
    if (error) return 'Não consegui buscar imóveis no nosso catálogo inteligente no momento. Tente novamente em instantes.';

    // C2: Filtrar imóveis sem preço válido
    let validProperties = (properties || []).filter((p: any) => p.price && p.price > 1);

    // C6: Expansão inteligente quando poucos resultados
    if (validProperties.length <= 1 && args.bairro) {
      // PASSO 1: Mesmo bairro, sem filtro de tipo
      console.log(`🌍 [Legacy] C6: Apenas ${validProperties.length} resultado(s) no ${args.bairro}. Flexibilizando tipo...`);
      const flexQuery = `imóvel para ${args.finalidade || 'venda'} no bairro ${args.bairro}, ${tenant.city}`;
      const flexEmbedding = await generateEmbedding(flexQuery);
      const { data: flexProps } = await supabase.rpc('match_properties', {
        query_embedding: flexEmbedding, match_tenant_id: tenantId,
        match_threshold: 0.15, match_count: 5,
        filter_max_price: searchBudget, filter_tipo: null,
        filter_neighborhood: args.bairro,
        filter_bedrooms: args.quartos || null,
        filter_finalidade: null,
      });
      const flexValid = (flexProps || []).filter((p: any) => p.price && p.price > 1);
      if (flexValid.length > 0) {
        validProperties = flexValid;
      } else {
        // Nada no bairro — informar honestamente
        return `[SISTEMA] Não encontrei nenhum imóvel disponível para ${args.finalidade || 'venda'} no bairro ${args.bairro} com orçamento de até R$ ${(clientBudget || 0).toLocaleString('pt-BR')}. Informe o cliente de forma natural e sugira: 1) Outros bairros próximos, 2) Aumentar orçamento, 3) Considerar outro tipo de imóvel. NÃO envie imóveis de outro bairro sem perguntar antes.`;
      }
    } else if (validProperties.length <= 1 && !args.bairro) {
      console.log(`🌍 [Legacy] C6: Apenas ${validProperties.length} resultado(s). Expansão geográfica...`);
      const expandedQuery = args.tipo_imovel
        ? `${args.tipo_imovel} para ${args.finalidade || 'venda'} em ${tenant.city}`
        : `imóvel para ${args.finalidade || 'venda'} em ${tenant.city}`;
      const expandedEmbedding = await generateEmbedding(expandedQuery);
      const { data: expandedProps } = await supabase.rpc('match_properties', {
        query_embedding: expandedEmbedding, match_tenant_id: tenantId,
        match_threshold: 0.15, match_count: 5,
        filter_max_price: searchBudget, filter_tipo: args.tipo_imovel || null,
        filter_neighborhood: null,
        filter_bedrooms: null,
        filter_finalidade: null,
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

    // C5: Enviar top 3 imóveis individualmente com foto + caption gerado por IA
    const agentName = aiConfig.agent_name || 'Aimee';
    const maxToSend = Math.min(formattedProperties.length, 3);
    for (let i = 0; i < maxToSend; i++) {
      const prop = formattedProperties[i];
      const aiCaption = await generatePropertyCaption(prop, agentName);
      const caption = prop.link ? `${aiCaption}\n\n${prop.link}` : aiCaption;
      if (prop.foto_destaque) {
        await sendWhatsAppImage(phoneNumber, prop.foto_destaque, caption, tenant);
      } else {
        await sendWhatsAppMessage(phoneNumber, caption, tenant);
      }
      if (i < maxToSend - 1) await sleep(1500);
    }
    const remaining = formattedProperties.length - maxToSend;

    // Construir resumo dos imóveis enviados para o LLM poder responder perguntas do cliente
    const propertySummaries = formattedProperties.slice(0, maxToSend).map((prop, i) => {
      const descResumo = prop.descricao ? prop.descricao.slice(0, 500) : 'Sem descrição disponível';
      const details = [
        `Tipo: ${prop.tipo}`,
        `Bairro: ${prop.bairro}`,
        prop.preco ? `Preço: ${prop.preco_formatado || formatCurrency(prop.preco)}` : null,
        prop.quartos ? `Quartos: ${prop.quartos}` : null,
        prop.area_util ? `Área útil: ${prop.area_util}m²` : null,
        `Descrição: ${descResumo}`,
      ].filter(Boolean).join(', ');
      return `Imóvel ${i + 1}: ${details}`;
    }).join('\n');

    const baseHint = `[SISTEMA — INSTRUÇÃO CRÍTICA] ${maxToSend} imóveis já foram enviados ao cliente como cards individuais com foto e link. NÃO repita a lista completa. Responda com uma frase curta natural, sem emoji, sem exclamação. Exemplo: "Enviei algumas opções. Dá uma olhada e me conta o que achou."`;
    const detailHint = `\n\n[DADOS DOS IMÓVEIS ENVIADOS — use para responder perguntas do cliente sobre detalhes]\n${propertySummaries}`;
    const remainingHint = remaining > 0 ? `\nRestam ${remaining} opções não enviadas. Aguarde a resposta do cliente antes de enviar mais.` : '';
    return baseHint + detailHint + remainingHint;

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
    let developmentId = args.codigo_imovel || null;
    let developmentTitle = args.titulo_imovel || null;

    // Fallback: se a IA não passou o imóvel, extrair do conversation_states
    if (!developmentId) {
      try {
        const { data: convState } = await supabase
          .from('conversation_states')
          .select('pending_properties, current_property_index, last_property_shown_at')
          .eq('tenant_id', tenantId)
          .eq('phone_number', phoneNumber)
          .single();
        if (convState?.pending_properties?.length) {
          const idx = convState.current_property_index > 0
            ? convState.current_property_index - 1
            : (convState.last_property_shown_at ? 0 : 0);
          const prop = convState.pending_properties[idx] || convState.pending_properties[0];
          if (prop?.codigo) {
            developmentId = prop.codigo;
            const tipo = prop.tipo?.replace(/s$/, '') || 'Imóvel';
            const quartos = prop.quartos ? `com ${prop.quartos} dormitórios` : '';
            const bairro = prop.bairro || '';
            const cidade = prop.cidade || '';
            const localStr = [bairro, cidade].filter(Boolean).join(', ');
            developmentTitle = [tipo, quartos, localStr ? `no ${localStr}` : ''].filter(Boolean).join(' ');
            console.log(`📦 Legacy fallback prop_ref: [${developmentId}] ${developmentTitle}`);
          } else {
            console.warn('⚠️ Legacy: pending_properties[0] has no codigo field:', JSON.stringify(prop).slice(0, 200));
          }
        } else {
          console.warn('⚠️ Legacy: No pending_properties found for fallback prop_ref');
        }
      } catch (fbErr) { console.warn('⚠️ Legacy fallback property lookup failed:', fbErr); }
    }

    console.log(`🏠 Legacy lead handoff prop_ref: development_id=${developmentId || 'NULL'}, source=${args.codigo_imovel ? 'AI_ARGS' : 'FALLBACK'}`);

    await supabase.functions.invoke('c2s-create-lead', {
      body: { tenant_id: tenantId, phone_number: phoneNumber, conversation_id: conversationId, contact_id: contactId, reason: args.motivo, qualification_data: qualData, development_id: developmentId, development_title: developmentTitle },
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
