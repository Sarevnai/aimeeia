// ========== AIMEE.iA v2 - AI AGENT SIMULATE (Production Parity) ==========
// Full simulation with: triage, MC-1 handoff, anti-loop, property cards, templates.
// Identical to ai-agent production flow but skips WhatsApp sending.
// Returns rich metadata for the AI Lab UI.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getSupabaseClient, corsHeaders, corsResponse, jsonResponse, errorResponse } from '../_shared/supabase.ts';
import { callLLMWithToolExecution } from '../_shared/ai-call.ts';
import { handleTriage } from '../_shared/triage.ts';
import { extractQualificationFromText, mergeQualificationData, saveQualificationData, generateTagsFromQualification, syncContactTags } from '../_shared/qualification.ts';
import { isLoopingQuestion, isRepetitiveMessage, getRotatingFallback, updateAntiLoopState } from '../_shared/anti-loop.ts';
import { loadRegions } from '../_shared/regions.ts';
import { formatCurrency } from '../_shared/utils.ts';
import { Tenant, AIAgentConfig, AIBehaviorConfig, StructuredConfig, AiModule, TriageConfig, ConversationState } from '../_shared/types.ts';
import { AgentModule, AgentContext, AgentType } from '../_shared/agents/agent-interface.ts';
import { comercialAgent } from '../_shared/agents/comercial.ts';
import { adminAgent } from '../_shared/agents/admin.ts';
import { remarketingAgent } from '../_shared/agents/remarketing.ts';
import { decryptApiKey, loadConversationHistory, loadRemarketingContext, executeLeadHandoff } from '../_shared/agents/tool-executors.ts';

function selectAgent(department: string | null, source: string): { agentType: AgentType; agent: AgentModule } {
  if (source === 'remarketing') return { agentType: 'remarketing', agent: remarketingAgent };
  if (department === 'administrativo') return { agentType: 'admin', agent: adminAgent };
  return { agentType: 'comercial', agent: comercialAgent };
}

// MC-1 Handoff intent detection (same as production)
const handoffIntentRegex = /\b(quero|preciso|pode|gostaria|solicito)\s+(d[oae]\s+)?(atendimento|corretor|corretora|humano|atendente|falar\s+com|agendar\s+visita|visitar)/i;
const directHandoffRegex = /\b(falar?\s+com\s+(um\s+)?(corretor|humano|atendente|pessoa))\b/i;

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return corsResponse();

  const supabase = getSupabaseClient();

  try {
    const {
      tenant_id,
      message_body,
      department,
      conversation_id: existingConvId,
      simulate_template,
    } = await req.json();

    if (!tenant_id || (!message_body && !simulate_template)) {
      return errorResponse('Missing tenant_id or message_body', 400);
    }

    // Get auth user for simulation phone number
    const authHeader = req.headers.get('Authorization');
    let userId = 'anonymous';
    if (authHeader) {
      const { data: { user } } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''));
      if (user) userId = user.id;
    }
    const simPhone = `SIM-${userId.slice(0, 8)}`;

    // ========== LOAD CONTEXT ==========

    const { data: tenant } = await supabase.from('tenants').select('*').eq('id', tenant_id).single();
    if (!tenant) return errorResponse('Tenant not found', 404);

    const { data: aiConfig } = await supabase.from('ai_agent_config').select('*').eq('tenant_id', tenant_id).single();
    if (!aiConfig) return errorResponse('AI config not found', 404);

    const { data: behaviorConfig } = await supabase.from('ai_behavior_config').select('*').eq('tenant_id', tenant_id).maybeSingle();
    const regions = await loadRegions(supabase, tenant_id);

    // Get or create simulation conversation
    let conversation_id = existingConvId;
    const effectiveDepartment = department || 'vendas';
    const isRemarketing = effectiveDepartment === 'remarketing';
    const conversationSource = isRemarketing ? 'remarketing' : 'simulation';

    if (!conversation_id) {
      const { data: existing } = await supabase
        .from('conversations')
        .select('id')
        .eq('tenant_id', tenant_id)
        .eq('phone_number', simPhone)
        .eq('source', conversationSource)
        .eq('status', 'active')
        .maybeSingle();

      if (existing) {
        conversation_id = existing.id;
      } else {
        const { data: newConv } = await supabase
          .from('conversations')
          .insert({
            tenant_id,
            phone_number: simPhone,
            department_code: isRemarketing ? 'vendas' : effectiveDepartment,
            source: conversationSource,
            status: 'active',
          })
          .select('id')
          .single();
        conversation_id = newConv?.id;
      }
    }
    if (!conversation_id) return errorResponse('Failed to create simulation conversation', 500);

    // Get or create simulation contact
    let contact_id: string | null = null;
    const { data: existingContact } = await supabase
      .from('contacts')
      .select('id, name')
      .eq('tenant_id', tenant_id)
      .eq('phone', simPhone)
      .maybeSingle();

    if (existingContact) {
      contact_id = existingContact.id;
    } else {
      const { data: newContact } = await supabase
        .from('contacts')
        .insert({ tenant_id, phone: simPhone, name: 'Simulação', channel_source: 'simulation' })
        .select('id')
        .single();
      contact_id = newContact?.id || null;
    }

    const contactName = existingContact?.name || 'Simulação';

    // ========== TEMPLATE SIMULATION ==========

    if (simulate_template?.template_name) {
      const { data: template } = await supabase
        .from('whatsapp_templates')
        .select('*')
        .eq('tenant_id', tenant_id)
        .eq('name', simulate_template.template_name)
        .maybeSingle();

      if (!template) return errorResponse(`Template "${simulate_template.template_name}" not found`, 404);

      // Render template with auto-resolved params
      const agentName = aiConfig.agent_name || 'Aimee';
      let renderedBody = '';
      const components = template.components || [];

      for (const comp of components) {
        if (comp.type === 'BODY') {
          renderedBody = comp.text || '';
          // Auto-resolve named params
          const namedParams = comp.example?.body_text_named_params || [];
          for (const param of namedParams) {
            const value = param.param_name === 'nome' ? contactName
              : param.param_name === 'agente' ? agentName
              : param.param_name === 'empresa' ? tenant.company_name
              : param.example || `{{${param.param_name}}}`;
            renderedBody = renderedBody.replace(new RegExp(`\\{\\{${param.param_name}\\}\\}`, 'g'), value);
          }
          // Also resolve positional {{1}}, {{2}}
          renderedBody = renderedBody.replace(/\{\{1\}\}/g, contactName);
          renderedBody = renderedBody.replace(/\{\{2\}\}/g, agentName);
        }
      }

      // Save template message
      await supabase.from('messages').insert({
        tenant_id,
        conversation_id,
        direction: 'outbound',
        sender_type: 'ai',
        body: `[Template: ${template.name}] ${renderedBody}`,
        media_type: 'template',
      });

      // Initialize triage stage for remarketing
      if (isRemarketing) {
        await supabase.from('conversation_states').upsert({
          tenant_id,
          phone_number: simPhone,
          triage_stage: 'remarketing_vip_pitch',
          is_ai_active: true,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'tenant_id,phone_number' });
      }

      return jsonResponse({
        ai_response: renderedBody,
        conversation_id,
        action: 'template_sent',
        triage_stage: isRemarketing ? 'remarketing_vip_pitch' : 'greeting',
        active_module: null,
        qualification: {},
        tags: [],
        tools_executed: [],
        agent_type: isRemarketing ? 'remarketing' : 'comercial',
        property_cards: [],
        conversation_state: { pending_properties_count: 0, current_property_index: 0, awaiting_property_feedback: false, shown_property_ids: [] },
        model_used: null,
        handoff_detected: false,
        loop_detected: false,
        template_rendered: {
          name: template.name,
          body: renderedBody,
          components,
        },
      });
    }

    // ========== SAVE INBOUND MESSAGE ==========

    await supabase.from('messages').insert({
      tenant_id,
      conversation_id,
      direction: 'inbound',
      sender_type: 'customer',
      body: message_body,
    });

    // ========== LOAD STATE ==========

    const { data: state } = await supabase
      .from('conversation_states')
      .select('*')
      .eq('tenant_id', tenant_id)
      .eq('phone_number', simPhone)
      .maybeSingle();

    const triageConfig: TriageConfig | null = (aiConfig as any)?.triage_config || null;

    // ========== TRIAGE PHASE (production parity) ==========

    const triageResult = await handleTriage(
      supabase,
      tenant as Tenant,
      aiConfig,
      state as ConversationState | null,
      { text: { body: message_body } }, // simulate raw_message format
      message_body,
      simPhone,
      conversation_id,
      triageConfig,
      contactName,
      conversationSource,
    );

    if (triageResult.shouldContinue) {
      const triageResponse = triageResult.responseMessages.join('\n___\n');

      // Save triage response
      if (triageResponse) {
        await supabase.from('messages').insert({
          tenant_id,
          conversation_id,
          direction: 'outbound',
          sender_type: 'ai',
          body: triageResponse,
        });
      }

      // Update contact name if extracted
      if (triageResult.contactName) {
        await supabase.from('contacts').update({ name: triageResult.contactName }).eq('id', contact_id);
      }

      // Read updated triage stage
      const { data: updatedState } = await supabase
        .from('conversation_states')
        .select('triage_stage')
        .eq('tenant_id', tenant_id)
        .eq('phone_number', simPhone)
        .maybeSingle();

      return jsonResponse({
        ai_response: triageResponse || 'Como posso te ajudar?',
        conversation_id,
        action: 'triage',
        triage_stage: updatedState?.triage_stage || 'greeting',
        active_module: null,
        qualification: {},
        tags: [],
        tools_executed: [],
        agent_type: isRemarketing ? 'remarketing' : 'comercial',
        property_cards: [],
        conversation_state: { pending_properties_count: 0, current_property_index: 0, awaiting_property_feedback: false, shown_property_ids: [] },
        model_used: null,
        handoff_detected: false,
        loop_detected: false,
        department_resolved: triageResult.department || null,
        contact_name: triageResult.contactName || contactName,
      });
    }

    // ========== QUALIFICATION ==========

    const { data: qualRow } = await supabase
      .from('lead_qualification')
      .select('*')
      .eq('conversation_id', conversation_id)
      .maybeSingle();

    const qualData = qualRow || {};
    const extracted = effectiveDepartment === 'administrativo' ? {} : extractQualificationFromText(message_body, qualData, regions);
    const mergedQual = mergeQualificationData(qualData, extracted);

    if (Object.keys(extracted).length > 0) {
      await saveQualificationData(supabase, tenant_id, conversation_id, contact_id, mergedQual);
      const autoTags = generateTagsFromQualification(mergedQual);
      if (autoTags.length > 0 && contact_id) {
        await syncContactTags(supabase, contact_id, autoTags);
      }
    }

    // ========== MC-1 HANDOFF DETECTION ==========

    const qualScore = mergedQual.qualification_score || 0;
    const isHandoffIntent = handoffIntentRegex.test(message_body) || directHandoffRegex.test(message_body);
    let handoffDetected = false;

    if (isHandoffIntent && qualScore >= 65) {
      handoffDetected = true;
      console.log(`🚀 SIM MC-1: Handoff intent detected, score=${qualScore}`);

      const dossierLines = [
        `Nome: ${contactName}`,
        `Telefone: ${simPhone} (simulação)`,
        mergedQual.detected_interest ? `Finalidade: ${mergedQual.detected_interest === 'locacao' ? 'Locação' : 'Venda'}` : null,
        mergedQual.detected_property_type ? `Tipo: ${mergedQual.detected_property_type}` : null,
        mergedQual.detected_neighborhood ? `Região: ${mergedQual.detected_neighborhood}` : null,
        mergedQual.detected_bedrooms ? `Quartos: ${mergedQual.detected_bedrooms}` : null,
        mergedQual.detected_budget_max ? `Orçamento: até R$ ${Number(mergedQual.detected_budget_max).toLocaleString('pt-BR')}` : null,
      ].filter(Boolean).join('\n');

      const handoffMsg = `Perfeito, ${contactName}! Já encaminhei suas informações para um dos nossos corretores especialistas. Em breve você receberá contato para alinhar os detalhes. Qualquer dúvida, estou por aqui!`;

      await supabase.from('messages').insert({
        tenant_id,
        conversation_id,
        direction: 'outbound',
        sender_type: 'ai',
        body: handoffMsg,
      });

      const currentTags = generateTagsFromQualification(mergedQual);

      return jsonResponse({
        ai_response: handoffMsg,
        conversation_id,
        action: 'handoff_direct',
        triage_stage: 'completed',
        active_module: null,
        qualification: {
          detected_interest: mergedQual.detected_interest || null,
          detected_property_type: mergedQual.detected_property_type || null,
          detected_neighborhood: mergedQual.detected_neighborhood || null,
          detected_bedrooms: mergedQual.detected_bedrooms || null,
          detected_budget_max: mergedQual.detected_budget_max || null,
          detected_timeline: mergedQual.detected_timeline || null,
          qualification_score: qualScore,
        },
        tags: currentTags,
        tools_executed: ['handoff_mc1'],
        agent_type: isRemarketing ? 'remarketing' : 'comercial',
        property_cards: [],
        conversation_state: { pending_properties_count: 0, current_property_index: 0, awaiting_property_feedback: false, shown_property_ids: [] },
        model_used: null,
        handoff_detected: true,
        loop_detected: false,
        handoff_dossier: dossierLines,
      });
    }

    // ========== LOAD AI CONTEXT ==========

    const history = await loadConversationHistory(supabase, tenant_id, conversation_id, aiConfig.max_history_messages || 10, effectiveDepartment);

    // Inject pending_properties context (production parity)
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
        content: `[SISTEMA — CONTEXTO DE IMÓVEIS ENCONTRADOS]\nOs imóveis abaixo foram encontrados para este cliente. Use estas informações para responder perguntas sobre detalhes dos imóveis.\n\n${propSummaries}`,
      });
    }

    // Load directive
    const directiveDepartment = conversationSource === 'remarketing' ? 'remarketing' : effectiveDepartment;
    let directive: any = null;
    let structuredConfig: StructuredConfig | null = null;

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

    // Fallback directive for remarketing
    if (!directive && conversationSource === 'remarketing' && effectiveDepartment !== 'remarketing') {
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

    // Load modules
    const { data: activeModules } = await supabase
      .from('ai_modules')
      .select('*')
      .eq('tenant_id', tenant_id)
      .eq('is_active', true)
      .order('sort_order', { ascending: true });

    const currentModuleSlug = state?.current_module_slug || null;

    // Decrypt API key
    const tenantApiKey = await decryptApiKey((aiConfig as any)?.api_key_encrypted);
    const tenantProvider = (aiConfig as any)?.ai_provider || 'openai';

    // Load remarketing context
    let remarketingContext: string | null = null;
    if (conversationSource === 'remarketing') {
      remarketingContext = await loadRemarketingContext(supabase, tenant_id, contact_id);
    }

    // Returning lead detection
    let isReturningLead = false;
    if (qualRow && qualRow.conversation_id && qualRow.conversation_id !== conversation_id) {
      isReturningLead = true;
    }

    // ========== AGENT SELECTION & INVOCATION ==========

    const { agentType, agent } = selectAgent(
      effectiveDepartment,
      conversationSource,
    );

    const ctx: AgentContext = {
      tenantId: tenant_id,
      phoneNumber: simPhone,
      conversationId: conversation_id,
      contactId: contact_id || '',
      tenant: tenant as Tenant,
      aiConfig,
      behaviorConfig: behaviorConfig as AIBehaviorConfig | null,
      regions,
      department: effectiveDepartment,
      conversationSource,
      contactName,
      qualificationData: isReturningLead ? mergeQualificationData({}, extracted) : mergedQual,
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

    const systemPrompt = agent.buildSystemPrompt(ctx);
    const tools = agent.getTools(ctx);
    const modelUsed = aiConfig.ai_model || 'google/gemini-2.5-flash';

    // Collapse contract messages in history to prevent LLM from pattern-matching.
    // Without this, the LLM sees the contract as its last response and repeats it
    // even when the system prompt says to do anamnese.
    const llmHistory = history.map(msg => {
      if (msg.role === 'assistant' && msg.content &&
          /sinceridade total|consultoria de verdade|sem receio.*feedback|vaga apertada|face sem sol/i.test(msg.content) &&
          msg.content.includes('___')) {
        return {
          ...msg,
          content: '[Contrato de parceria VIP já realizado com sucesso. O cliente aceitou. Agora siga para a anamnese — pergunte o que falta.]',
        };
      }
      return msg;
    });

    const aiResponse = await callLLMWithToolExecution(
      systemPrompt,
      llmHistory,
      message_body,
      tools,
      async (toolName: string, args: any) => {
        ctx.toolsExecuted.push(toolName);
        return agent.executeToolCall(ctx, toolName, args);
      },
      {
        model: modelUsed,
        provider: tenantProvider,
        apiKey: tenantApiKey,
        temperature: 0.7,
        maxTokens: aiConfig.max_tokens || 500,
      }
    );

    let finalResponse = await agent.postProcess(ctx, aiResponse);

    // Strip module tags
    finalResponse = finalResponse.replace(/\[\s*MODULO\s*:\s*[^\]\n]*?\s*\]\s*/gi, '').trim();

    // Anti-loop is handled inside agent.postProcess() — do NOT run it again here.
    // Running it twice caused double-saving to last_ai_messages, exhausting the
    // small fallback pool in 2 turns and creating a meta-loop.
    const loopDetected = ctx._loopDetected || false;

    // ========== PERSIST MODULE ==========

    let activeModuleInfo: { slug: string; name: string } | null = null;
    if (ctx.currentModuleSlug) {
      const resolvedModule = (activeModules as AiModule[])?.find(m => m.slug === ctx.currentModuleSlug);
      if (resolvedModule) {
        activeModuleInfo = { slug: ctx.currentModuleSlug, name: resolvedModule.name };
      }
      if (ctx.currentModuleSlug !== currentModuleSlug) {
        await supabase
          .from('conversation_states')
          .upsert({
            tenant_id,
            phone_number: simPhone,
            current_module_slug: ctx.currentModuleSlug,
            is_ai_active: true,
            updated_at: new Date().toISOString(),
          }, { onConflict: 'tenant_id,phone_number' });
      }
    }

    // ========== EXTRACT PROPERTY CARDS ==========

    // Read updated conversation_state for property data
    const { data: updatedState } = await supabase
      .from('conversation_states')
      .select('pending_properties, current_property_index, awaiting_property_feedback, shown_property_ids')
      .eq('tenant_id', tenant_id)
      .eq('phone_number', simPhone)
      .maybeSingle();

    const propertyCards: any[] = [];
    if (updatedState?.pending_properties && Array.isArray(updatedState.pending_properties)) {
      // Get the properties that were shown in this turn
      const shownInThisTurn = updatedState.pending_properties.slice(0, updatedState.current_property_index || 0);
      for (const prop of shownInThisTurn) {
        propertyCards.push({
          codigo: prop.codigo,
          tipo: prop.tipo,
          bairro: prop.bairro,
          cidade: prop.cidade,
          preco_formatado: prop.preco_formatado || (prop.preco ? formatCurrency(prop.preco) : null),
          foto_url: prop.foto_destaque || null,
          caption: prop.caption || null,
          link: prop.link || null,
          quartos: prop.quartos || null,
          suites: prop.suites || null,
          vagas: prop.vagas || null,
          area_util: prop.area_util || null,
        });
      }
    }

    // ========== SAVE AI RESPONSE ==========

    await supabase.from('messages').insert({
      tenant_id,
      conversation_id,
      direction: 'outbound',
      sender_type: 'ai',
      body: finalResponse,
    });

    await supabase
      .from('conversations')
      .update({ last_message_at: new Date().toISOString() })
      .eq('id', conversation_id);

    // ========== RETURN RICH METADATA ==========

    const currentTags = generateTagsFromQualification(mergedQual);

    return jsonResponse({
      ai_response: finalResponse,
      conversation_id,
      action: 'ai_response',
      triage_stage: 'completed',
      active_module: activeModuleInfo,
      qualification: {
        detected_interest: mergedQual.detected_interest || null,
        detected_property_type: mergedQual.detected_property_type || null,
        detected_neighborhood: mergedQual.detected_neighborhood || null,
        detected_bedrooms: mergedQual.detected_bedrooms || null,
        detected_budget_max: mergedQual.detected_budget_max || null,
        detected_timeline: mergedQual.detected_timeline || null,
        qualification_score: mergedQual.qualification_score || 0,
      },
      tags: currentTags,
      tools_executed: ctx.toolsExecuted,
      agent_type: agentType,
      property_cards: propertyCards,
      conversation_state: {
        pending_properties_count: updatedState?.pending_properties?.length || 0,
        current_property_index: updatedState?.current_property_index || 0,
        awaiting_property_feedback: updatedState?.awaiting_property_feedback || false,
        shown_property_ids: updatedState?.shown_property_ids || [],
      },
      model_used: modelUsed,
      handoff_detected: handoffDetected,
      loop_detected: loopDetected,
      system_prompt_preview: systemPrompt.slice(0, 500),
    });

  } catch (error) {
    console.error('❌ Simulation error:', error);
    return errorResponse((error as Error).message);
  }
});
