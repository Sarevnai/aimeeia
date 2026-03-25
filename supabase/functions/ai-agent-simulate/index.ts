// ========== AIMEE.iA v2 - AI AGENT SIMULATE ==========
// Simulation endpoint for testing agent behavior without WhatsApp.
// Reuses shared agent logic but skips WA sending, triage, TTS, and processing locks.
// Returns metadata (active module, qualification, tags, tools) for the simulation UI.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getSupabaseClient, corsHeaders, corsResponse, jsonResponse, errorResponse } from '../_shared/supabase.ts';
import { callLLMWithToolExecution } from '../_shared/ai-call.ts';
import { extractQualificationFromText, mergeQualificationData, saveQualificationData, generateTagsFromQualification, syncContactTags } from '../_shared/qualification.ts';
import { loadRegions } from '../_shared/regions.ts';
import { Tenant, AIAgentConfig, AIBehaviorConfig, StructuredConfig, AiModule } from '../_shared/types.ts';
import { AgentModule, AgentContext, AgentType } from '../_shared/agents/agent-interface.ts';
import { comercialAgent } from '../_shared/agents/comercial.ts';
import { adminAgent } from '../_shared/agents/admin.ts';
import { remarketingAgent } from '../_shared/agents/remarketing.ts';
import { decryptApiKey, loadConversationHistory } from '../_shared/agents/tool-executors.ts';

function selectAgent(department: string | null, source: string): { agentType: AgentType; agent: AgentModule } {
  if (source === 'remarketing') return { agentType: 'remarketing', agent: remarketingAgent };
  if (department === 'administrativo') return { agentType: 'admin', agent: adminAgent };
  return { agentType: 'comercial', agent: comercialAgent };
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return corsResponse();

  const supabase = getSupabaseClient();

  try {
    const { tenant_id, message_body, department, conversation_id: existingConvId } = await req.json();

    if (!tenant_id || !message_body) {
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

    // Load tenant
    const { data: tenant } = await supabase.from('tenants').select('*').eq('id', tenant_id).single();
    if (!tenant) return errorResponse('Tenant not found', 404);

    // Load AI config
    const { data: aiConfig } = await supabase.from('ai_agent_config').select('*').eq('tenant_id', tenant_id).single();
    if (!aiConfig) return errorResponse('AI config not found', 404);

    // Load behavior config
    const { data: behaviorConfig } = await supabase.from('ai_behavior_config').select('*').eq('tenant_id', tenant_id).maybeSingle();

    // Load regions
    const regions = await loadRegions(supabase, tenant_id);

    // Get or create simulation conversation
    let conversation_id = existingConvId;
    if (!conversation_id) {
      // Check for existing simulation conversation
      const { data: existing } = await supabase
        .from('conversations')
        .select('id')
        .eq('tenant_id', tenant_id)
        .eq('phone_number', simPhone)
        .eq('source', 'simulation')
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
            department_code: department || 'vendas',
            source: 'simulation',
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
      .select('id')
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

    // Save inbound simulation message
    await supabase.from('messages').insert({
      tenant_id,
      conversation_id,
      direction: 'inbound',
      sender_type: 'contact',
      body: message_body,
    });

    // Load qualification data
    const { data: qualRow } = await supabase
      .from('lead_qualification')
      .select('*')
      .eq('conversation_id', conversation_id)
      .maybeSingle();

    const qualData = qualRow || {};

    // Extract qualification from this message
    const extracted = extractQualificationFromText(message_body, qualData, regions);
    const mergedQual = mergeQualificationData(qualData, extracted);

    if (Object.keys(extracted).length > 0) {
      await saveQualificationData(supabase, tenant_id, conversation_id, contact_id, mergedQual);
      const autoTags = generateTagsFromQualification(mergedQual);
      if (autoTags.length > 0 && contact_id) {
        await syncContactTags(supabase, contact_id, autoTags);
      }
    }

    // Load conversation history
    const history = await loadConversationHistory(supabase, tenant_id, conversation_id, aiConfig.max_history_messages || 10, department);

    // Load directive
    const effectiveDepartment = department || 'vendas';
    const { data: directive } = await supabase
      .from('ai_directives')
      .select('*')
      .eq('tenant_id', tenant_id)
      .eq('department', effectiveDepartment)
      .eq('is_active', true)
      .maybeSingle();

    const structuredConfig: StructuredConfig | null = directive?.structured_config || null;

    // Load modules
    const { data: activeModules } = await supabase
      .from('ai_modules')
      .select('*')
      .eq('tenant_id', tenant_id)
      .eq('is_active', true)
      .order('sort_order', { ascending: true });

    // Load conversation state for current module
    const { data: state } = await supabase
      .from('conversation_states')
      .select('current_module_slug')
      .eq('tenant_id', tenant_id)
      .eq('phone_number', simPhone)
      .maybeSingle();

    const currentModuleSlug = state?.current_module_slug || null;

    // Decrypt API key
    const tenantApiKey = await decryptApiKey((aiConfig as any)?.api_key_encrypted);
    const tenantProvider = (aiConfig as any)?.ai_provider || 'openai';

    // Select agent
    const { agentType, agent } = selectAgent(effectiveDepartment, 'simulation');

    // Build context
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
      conversationSource: 'simulation',
      contactName: 'Simulação',
      qualificationData: mergedQual,
      conversationHistory: history,
      directive,
      structuredConfig,
      remarketingContext: null,
      isReturningLead: false,
      previousQualificationData: null,
      tenantApiKey,
      tenantProvider,
      lastAiMessages: [],
      toolsExecuted: [],
      activeModules: (activeModules as AiModule[]) || [],
      currentModuleSlug,
      supabase,
    };

    // Build prompt and call LLM
    const systemPrompt = agent.buildSystemPrompt(ctx);
    const tools = agent.getTools(ctx);

    const aiResponse = await callLLMWithToolExecution(
      systemPrompt,
      history,
      message_body,
      tools,
      async (toolName: string, args: any) => {
        ctx.toolsExecuted.push(toolName);
        return agent.executeToolCall(ctx, toolName, args);
      },
      {
        model: aiConfig.ai_model || 'google/gemini-2.0-flash-001',
        provider: tenantProvider,
        apiKey: tenantApiKey,
        temperature: 0.7,
        maxTokens: aiConfig.max_tokens || 500,
      }
    );

    let finalResponse = await agent.postProcess(ctx, aiResponse);

    // Parse module tag (same robust regex as ai-agent)
    let activeModuleInfo: { slug: string; name: string } | null = null;
    const moduleMatch = finalResponse.match(/\[\s*MODULO\s*:\s*([^\]\n]+?)\s*\]/i);
    if (moduleMatch) {
      const newSlug = moduleMatch[1].trim().toLowerCase().replace(/\s+/g, '-');
      finalResponse = finalResponse.replace(/\[\s*MODULO\s*:\s*[^\]\n]*?\s*\]\s*/gi, '').trim();

      // Validate slug against known modules
      const validModule = (activeModules as AiModule[])?.find(m => m.slug === newSlug);
      if (validModule) {
        await supabase
          .from('conversation_states')
          .upsert({
            tenant_id,
            phone_number: simPhone,
            current_module_slug: newSlug,
            is_ai_active: true,
            updated_at: new Date().toISOString(),
          }, { onConflict: 'tenant_id,phone_number' });
        activeModuleInfo = { slug: newSlug, name: validModule.name };
      }
    } else {
      // Strip any malformed module tags
      finalResponse = finalResponse.replace(/\[\s*MODULO\s*[:\s][^\]]*\]\s*/gi, '').trim();
    }

    // Save AI response message
    await supabase.from('messages').insert({
      tenant_id,
      conversation_id,
      direction: 'outbound',
      sender_type: 'ai',
      body: finalResponse,
    });

    // Update conversation timestamp
    await supabase
      .from('conversations')
      .update({ last_message_at: new Date().toISOString() })
      .eq('id', conversation_id);

    // Generate current tags
    const currentTags = generateTagsFromQualification(mergedQual);

    return jsonResponse({
      ai_response: finalResponse,
      conversation_id,
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
    });

  } catch (error) {
    console.error('❌ Simulation error:', error);
    return errorResponse((error as Error).message);
  }
});
