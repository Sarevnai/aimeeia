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
import { loadRegions, expandRegionToNeighborhoods } from '../_shared/regions.ts';
import { isLoopingQuestion, isRepetitiveMessage, updateAntiLoopState } from '../_shared/anti-loop.ts';
import { formatConsultativeProperty, formatPropertySummary, buildSearchParams } from '../_shared/property.ts';
import { fragmentMessage, logError, logActivity, sleep } from '../_shared/utils.ts';
import { Tenant, AIAgentConfig, AIBehaviorConfig, ConversationState, ConversationMessage, PropertyResult, StructuredConfig, TriageConfig, QualificationData } from '../_shared/types.ts';

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

// Helper to decrypt a tenant API key stored as AES-GCM base64
async function decryptApiKey(encrypted: string | null | undefined): Promise<string | undefined> {
  if (!encrypted) return undefined;
  try {
    const secret = Deno.env.get('ENCRYPTION_KEY') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || 'default-fallback-key-32bytes!!!';
    const rawKey = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(secret));
    const cryptoKey = await crypto.subtle.importKey('raw', rawKey, { name: 'AES-GCM' }, false, ['decrypt']);
    const combined = Uint8Array.from(atob(encrypted), c => c.charCodeAt(0));
    const iv = combined.slice(0, 12);
    const data = combined.slice(12);
    const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, cryptoKey, data);
    return new TextDecoder().decode(decrypted);
  } catch (e) {
    console.warn('⚠️ Failed to decrypt API key, falling back to env var:', (e as Error).message);
    return undefined;
  }
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
      ai_model: 'gpt-4o-mini',
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

    // Decrypt tenant-specific API key (falls back to env var if not set)
    const tenantApiKey = await decryptApiKey((config as any)?.api_key_encrypted);
    const tenantProvider = (config as any)?.ai_provider || 'openai';

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
      .select('*')
      .eq('id', conversation_id)
      .single();

    // Existing qualification data (loaded from lead_qualification, not conversations)
    const { data: existingQual } = await supabase
      .from('lead_qualification')
      .select('detected_neighborhood, detected_property_type, detected_bedrooms, detected_budget_max, detected_interest, qualification_score')
      .eq('tenant_id', tenant_id)
      .eq('phone_number', phone_number)
      .maybeSingle();

    // Regions
    const regions = await loadRegions(supabase, tenant_id);

    // Behavior Config
    const { data: behaviorConfig } = await supabase
      .from('ai_behavior_config')
      .select('*')
      .eq('tenant_id', tenant_id)
      .maybeSingle();

    // ========== TRIAGE PHASE ==========

    // Extract triage config (Fase 1 customization) from ai_agent_config
    const triageConfig: TriageConfig | null = (config as any)?.triage_config || null;

    const triageResult = await handleTriage(
      supabase, tenant as Tenant, aiConfig, state as ConversationState | null,
      raw_message || { text: { body: message_body } },
      message_body, phone_number, conversation_id,
      triageConfig
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

      // Issue 2: Backfill department_code nas mensagens anteriores da conversa
      if (triageResult.department) {
        await supabase
          .from('messages')
          .update({ department_code: triageResult.department })
          .eq('conversation_id', conversation_id)
          .is('department_code', null);
      }

      return jsonResponse({
        action: 'triage',
        department: triageResult.department,
        ai_response: triageResult.responseMessages.join('\n'),
      });
    }

    // ========== NEXT PROPERTY HANDLER ==========
    // If lead is in property browsing mode, handle next/skip before calling main AI
    if (state?.awaiting_property_feedback && state?.pending_properties?.length > 0) {
      // Broader positive regex — catches "ver mais um", "pode mostrar", "gostaria de ver", etc.
      const positiveIntent = /\b(sim|pode|quero|próximo|proximo|outro|continua|bora|claro|vai|show|next|ver|mostrar|ok|gostaria)\b/i.test(message_body);
      const negativeIntent = /\b(não quero|nao quero|chega|prefiro|quero esse|quero essa|encerr|falar com|corretor|humano)\b/i.test(message_body);

      if (positiveIntent && !negativeIntent) {
        const nextIndex = (state.current_property_index || 0) + 1;
        const pending: PropertyResult[] = state.pending_properties;

        if (nextIndex < pending.length) {
          // Show next property
          const convDept = conversation?.department_code || null;
          const nextProperty = pending[nextIndex];
          // Track this property as shown (Anomalia 4 fix)
          const updatedShownIds = [...(state.shown_property_ids || []), nextProperty.codigo].filter(Boolean);
          await supabase
            .from('conversation_states')
            .update({
              current_property_index: nextIndex,
              shown_property_ids: updatedShownIds,
              updated_at: new Date().toISOString(),
            })
            .eq('tenant_id', tenant_id)
            .eq('phone_number', phone_number);

          await sendPropertyConsultive(
            phone_number, tenant as Tenant, pending, nextIndex, pending.length,
            contact_name, aiConfig.emoji_intensity === 'none',
            existingQual, tenantApiKey, tenantProvider, aiConfig.ai_model,
            supabase, tenant_id, conversation_id, convDept
          );

          return jsonResponse({ action: 'next_property', index: nextIndex });
        } else {
          // No more properties — clear state and fall through to main AI
          // The AI, seeing the conversation history, will ask "Qual chamou mais atenção?" and use encaminhar_humano
          await supabase
            .from('conversation_states')
            .update({ awaiting_property_feedback: false, updated_at: new Date().toISOString() })
            .eq('tenant_id', tenant_id)
            .eq('phone_number', phone_number);
          // ← No early return: fall through to AI PHASE
        }
      } else if (negativeIntent) {
        // Lead opted out of property browsing — clear state and let AI continue
        await supabase
          .from('conversation_states')
          .update({ awaiting_property_feedback: false, updated_at: new Date().toISOString() })
          .eq('tenant_id', tenant_id)
          .eq('phone_number', phone_number);
      } else {
        // Ambiguous response — clear awaiting flag so AI phase handles naturally
        // Keep pending_properties intact in case AI needs context
        await supabase
          .from('conversation_states')
          .update({ awaiting_property_feedback: false, updated_at: new Date().toISOString() })
          .eq('tenant_id', tenant_id)
          .eq('phone_number', phone_number);
      }
      // Fall through to main AI handling
    }

    // ========== AI PHASE ==========

    const department = conversation?.department_code || null;

    // Issue 1: Verificar se há ticket administrativo aberto para sobrepor departamento.
    // Previne que o AI use prompt de vendas/locação quando o contexto real é administrativo.
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
    const qualData = existingQual || {};

    // Load AI directive (with structured_config) — single query, reused by buildSystemPrompt
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

    // Extract qualification from current message
    const extracted = extractQualificationFromText(message_body, qualData, regions);
    const mergedQual = mergeQualificationData(qualData, extracted);

    // Save updated qualification
    if (Object.keys(extracted).length > 0) {
      await saveQualificationData(supabase, tenant_id, conversation_id, contact_id, mergedQual, phone_number);
    }

    // Load conversation history
    const history = await loadConversationHistory(supabase, tenant_id, conversation_id, aiConfig.max_history_messages || 10, effectiveDepartment);

    // Build system prompt (pass preloaded directive to avoid double DB query)
    const systemPrompt = await buildSystemPrompt(
      supabase, aiConfig, tenant, effectiveDepartment, regions,
      contact_name, mergedQual, history, behaviorConfig as AIBehaviorConfig | null,
      directive
    );

    // Get tools (enhanced with skill descriptions if structured_config defines them)
    const tools = getToolsForDepartment(effectiveDepartment, structuredConfig?.skills);

    // Anomalia 2 fix: track whether a property presentation tool ran during this cycle
    let toolPresentedProperty = false;

    // Call LLM with tool execution
    const noEmojis = aiConfig.emoji_intensity === 'none';
    const aiResponse = await callLLMWithToolExecution(
      systemPrompt,
      history,
      message_body,
      tools,
      async (toolName, args) => {
        const result = await executeToolCall(supabase, tenant as Tenant, tenant_id, phone_number, conversation_id, contact_id, toolName, args, mergedQual, effectiveDepartment, noEmojis, contact_name, tenantApiKey, tenantProvider, aiConfig.ai_model);
        // Mark flag so we can suppress the LLM's redundant text response
        // Only suppress if the tool actually presented a property successfully
        if (toolName === 'buscar_imoveis' || toolName === 'buscar_imovel_por_link') {
          if (typeof result === 'string' && result.includes('Apresentei')) {
            toolPresentedProperty = true;
          }
        }
        return result;
      },
      {
        model: aiConfig.ai_model || 'gpt-4o-mini',
        provider: tenantProvider,
        apiKey: tenantApiKey,
        temperature: 0.7,
        maxTokens: aiConfig.max_tokens || 500,
      }
    );

    // ========== PROPERTY TOOL GUARD (Anomalia 2 + 6 fix) ==========
    // Property presentation tools already sent [photo + text + "O que achou?"] directly.
    // Sending the LLM's aiResponse would create a disruptive 4th message and break
    // the consultive flow. Skip it entirely — the webhook releases the lock.
    if (toolPresentedProperty) {
      return jsonResponse({
        action: 'property_shown',
        department: effectiveDepartment,
        qualification_score: mergedQual.qualification_score,
      });
    }

    // ========== ANTI-LOOP CHECK ==========

    let finalResponse = aiResponse;

    if (isLoopingQuestion(finalResponse, mergedQual)) {
      if (isQualificationComplete(mergedQual)) {
        // Qualificação completa mas LLM gerou loop em vez de chamar a ferramenta.
        // Disparar busca de imóveis diretamente para não enviar uma promessa falsa.
        console.log('⚠️ Anti-loop + qualificação completa: forçando busca de imóveis');
        const semanticQuery = buildSemanticQueryFromQual(mergedQual, effectiveDepartment);
        const forcedArgs = {
          query_semantica: semanticQuery,
          finalidade: mergedQual.detected_interest || (effectiveDepartment === 'locacao' ? 'locacao' : 'venda'),
          preco_max: mergedQual.detected_budget_max || null,
          quartos: mergedQual.detected_bedrooms || null,
        };
        const searchResult = await executePropertySearch(
          supabase, tenant as Tenant, tenant_id, phone_number, conversation_id,
          forcedArgs, effectiveDepartment, noEmojis, contact_name,
          mergedQual, tenantApiKey, tenantProvider, aiConfig.ai_model
        );
        if (searchResult.includes('Apresentei')) {
          return jsonResponse({ action: 'property_shown', department: effectiveDepartment, qualification_score: mergedQual.qualification_score });
        }
        // Busca falhou ou sem resultados — deixar o resultado da ferramenta ser enviado
        finalResponse = searchResult;
      } else {
        // Qualificação incompleta — mostrar contexto e aguardar mais dados
        const contextSummary = buildContextSummary(mergedQual);
        finalResponse = `${contextSummary}\n\nBaseado no que já conversamos, posso te ajudar com mais alguma coisa?`;
      }
    }

    if (isRepetitiveMessage(finalResponse, state?.last_ai_messages || [])) {
      finalResponse = aiConfig.fallback_message || 'Posso te ajudar com mais alguma coisa?';
    }

    // ========== MULTI-PROPERTY GUARD (Anomalia 3 fix) ==========
    // Block LLM responses that list multiple properties as text (violates Rule R1).
    const multiPropertyPattern = /\b\d+\.\s+(?:apartamento|casa|imóvel|cobertura|terreno|loja|sala|sobrado|kitnet)/gi;
    const multiMatches = finalResponse.match(multiPropertyPattern);
    if (multiMatches && multiMatches.length >= 2) {
      console.warn('⚠️ [GUARDRAIL] Multi-property text listing detected, blocking response');
      finalResponse = 'O que achou do imóvel que te mostrei? Se quiser ver a próxima opção, é só me dizer!';
    }

    // Update anti-loop state
    await updateAntiLoopState(supabase, tenant_id, phone_number, finalResponse);

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

    // Log activity
    await logActivity(supabase, tenant_id, 'ai_response', 'conversations', conversation_id, {
      department: effectiveDepartment,
      qualification_score: mergedQual.qualification_score,
    });

    // Note: is_processing lock is released by the webhook after this response returns.
    return jsonResponse({
      action: 'responded',
      department: effectiveDepartment,
      ai_response: finalResponse,
      qualification_score: mergedQual.qualification_score,
    });

  } catch (error) {
    console.error('❌ AI Agent error:', error);
    return errorResponse((error as Error).message);
  }
});

// ========== GENERATE CONSULTIVE MESSAGE (LLM) ==========

/**
 * Calls the LLM to generate a personalized, consultive property presentation message.
 * Falls back to formatConsultativeProperty() if the call fails.
 */
async function generateConsultiveMessage(
  property: PropertyResult,
  index: number,
  totalToShow: number,
  contactName?: string,
  qualData?: any,
  apiKey?: string,
  provider?: string,
  model = 'gpt-4o-mini'
): Promise<string> {
  // Build lead profile summary
  const qualParts: string[] = [];
  if (qualData?.detected_budget_max) qualParts.push(`Orçamento: até R$ ${Number(qualData.detected_budget_max).toLocaleString('pt-BR')}`);
  if (qualData?.detected_neighborhood) qualParts.push(`Bairro preferido: ${qualData.detected_neighborhood}`);
  if (qualData?.detected_bedrooms) qualParts.push(`Quartos desejados: ${qualData.detected_bedrooms}`);
  if (qualData?.detected_interest) qualParts.push(`Interesse: ${qualData.detected_interest}`);
  const qualSummary = qualParts.length > 0 ? qualParts.join(' | ') : 'Não informado';

  const withinBudget = qualData?.detected_budget_max && property.preco <= Number(qualData.detected_budget_max);

  // Ordinal position
  const ordinais = ['primeira', 'segunda', 'terceira', 'quarta', 'quinta'];
  const ordinal = ordinais[index] ?? `${index + 1}ª`;

  const prompt = `Você é Aimee, corretora consultiva de imóveis. Escreva a mensagem de apresentação deste imóvel para o lead.

LEAD:
- Nome: ${contactName || 'não informado'}
- Perfil conhecido: ${qualSummary}

IMÓVEL (${ordinal} de ${totalToShow}):
- Tipo: ${property.tipo} | Quartos: ${property.quartos}${property.suites ? ` | Suítes: ${property.suites}` : ''}
- Área útil: ${property.area_util ? `${property.area_util}m²` : 'não informada'}${property.vagas ? ` | Vagas: ${property.vagas}` : ''}
- Preço: R$ ${property.preco.toLocaleString('pt-BR')}${property.valor_condominio ? ` | Condomínio: R$ ${property.valor_condominio.toLocaleString('pt-BR')}` : ''}
- Localização: ${property.bairro}${property.cidade ? `, ${property.cidade}` : ''}${property.endereco ? ` — ${property.endereco}` : ''}
- Descrição: ${(property.descricao || '').slice(0, 300)}
- Link: ${property.link}

FORMATO OBRIGATÓRIO (4 parágrafos, SEM emojis, SEM CTA, SEM pergunta):

§1 — Intro: "[Nome se houver], a ${ordinal} opção que tenho pra te mostrar ali na [bairro] é [esse/essa] [tipo], [título curto e descritivo extraído da descrição — ex: 'com ampla varanda e vista privilegiada']."

§2 — Preço: "O valor de investimento que estamos trabalhando é de R$ X,00${withinBudget ? ', o que está dentro do orçamento que você me falou e me parece ser uma boa opção' : ''}."
(SOMENTE mencione orçamento se withinBudget=true. Se não souber o orçamento, não mencione.)

§3 — Características: "É [um/uma] [tipo] [com área]m² de área privativa${property.vagas ? `, ${property.vagas} vaga${property.vagas > 1 ? 's' : ''} de garagem` : ''}${property.valor_condominio ? `, condomínio de R$ X.XXX,00` : ''}. [amenidades que conversem com o perfil do lead ou extraídas da descrição]."

§4 — Localização + link: "Fica próximo de [2-3 pontos de referência reais desta região em ${property.cidade || 'Florianópolis'} — use seu conhecimento geográfico].

Você pode acessar mais informações aqui:
${property.link}"

Escreva apenas os 4 parágrafos, sem cabeçalhos, sem numeração, sem CTA.`;

  const result = await callLLM('', [], prompt, [], {
    model,
    provider,
    apiKey,
    maxTokens: 280,
    temperature: 0.7,
  });

  return result.content.trim();
}

// ========== PROPERTY CONSULTIVE SEND ==========

/**
 * Sends a property presentation as 3 separate WhatsApp messages with delays:
 * [1] Photo → [2s] → [2] Consultive text → [2s] → [3] "O que achou?"
 * After sending, updates last_property_shown_at so the cron can send a follow-up
 * after 3 minutes of no response.
 */
async function sendPropertyConsultive(
  phoneNumber: string,
  tenant: Tenant,
  properties: PropertyResult[],
  index: number,
  totalToShow: number,
  contactName?: string,
  noEmojis = false,
  qualData?: any,
  apiKey?: string,
  provider?: string,
  model?: string,
  supabase?: any,
  tenantId?: string,
  conversationId?: string,
  department?: string | null
): Promise<void> {
  const property = properties[index];
  const isLast = index >= totalToShow - 1;

  // Helper: send + save to DB (so AI sees it in conversation history)
  const send = async (body: string, mediaType?: string, mediaUrl?: string) => {
    if (mediaType === 'image') {
      await sendWhatsAppImage(phoneNumber, mediaUrl!, '', tenant);
    } else {
      await sendWhatsAppMessage(phoneNumber, body, tenant);
    }
    if (supabase && tenantId && conversationId) {
      const saveBody = (mediaType === 'image' && !body) ? '[Foto do imóvel]' : body;
      await saveOutboundMessage(supabase, tenantId, conversationId, phoneNumber, saveBody, undefined, department || undefined, mediaType, mediaUrl, 'ai');
    }
  };

  // [1] Photo
  if (property.foto_destaque) {
    await send('', 'image', property.foto_destaque);
    // Anomalia 7 fix: randomized delay to avoid robotic fixed-cadence fingerprint
    await sleep(1800 + Math.floor(Math.random() * 800));
  }

  // [2] Consultive text — deterministic function guarantees correct ordinal (Anomalia 5 fix).
  // Previously used a 2nd LLM call (generateConsultiveMessage) which caused ordinal drift
  // and added 1–2s of latency. The deterministic fallback is equally good and always correct.
  const consultiveText = formatConsultativeProperty(property, index, totalToShow, contactName, noEmojis);
  await send(consultiveText);
  // Anomalia 7 fix: randomized delay
  await sleep(1800 + Math.floor(Math.random() * 800));

  // [3] "O que achou?"
  await send('O que achou?');

  // Update last_property_shown_at so the cron can send a follow-up after 3 min of silence
  if (supabase && tenantId) {
    await supabase
      .from('conversation_states')
      .update({ last_property_shown_at: new Date().toISOString() })
      .eq('tenant_id', tenantId)
      .eq('phone_number', phoneNumber);
  }
}

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
  department: string | null,
  noEmojis = false,
  contactName?: string,
  apiKey?: string,
  provider?: string,
  model?: string
): Promise<string> {
  console.log(`🔧 Executing tool: ${toolName}`, args);

  if (toolName === 'buscar_imoveis') {
    return await executePropertySearch(supabase, tenant, tenantId, phoneNumber, conversationId, args, department, noEmojis, contactName, qualData, apiKey, provider, model);
  }

  if (toolName === 'buscar_imovel_por_link') {
    return await executeSearchByLink(supabase, tenant, tenantId, phoneNumber, conversationId, args, department, noEmojis, contactName, qualData, apiKey, provider, model);
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

// ========== SEMANTIC QUERY BUILDER ==========

function buildSemanticQueryFromQual(qual: QualificationData, department: string): string {
  const parts: string[] = [];
  const tipo = qual.detected_property_type || 'imóvel';
  const finalidade = qual.detected_interest || (department === 'locacao' ? 'locação' : 'venda');
  parts.push(`${tipo} para ${finalidade}`);
  if (qual.detected_neighborhood) parts.push(`em ${qual.detected_neighborhood}`);
  if (qual.detected_bedrooms) parts.push(`com ${qual.detected_bedrooms} quartos`);
  if (qual.detected_budget_max) {
    const budget = qual.detected_budget_max.toLocaleString('pt-BR');
    parts.push(`até R$ ${budget}`);
  }
  return parts.join(' ');
}

// ========== PROPERTY MAPPING HELPER ==========

function mapPropertyToResult(p: any, fallbackCity?: string): PropertyResult {
  return {
    codigo: p.external_id,
    tipo: p.raw_data?.Categoria || 'Imóvel',
    bairro: p.neighborhood || p.raw_data?.Bairro || 'Região',
    cidade: p.city || p.raw_data?.Cidade || fallbackCity || '',
    endereco: p.raw_data?.Endereco || p.raw_data?.Logradouro || null,
    preco: parseFloat(p.price) || parseFloat(p.raw_data?.ValorLocacao) || parseFloat(p.raw_data?.ValorVenda) || 0,
    preco_formatado: null,
    quartos: p.bedrooms || parseInt(p.raw_data?.Dormitorios) || 0,
    suites: parseInt(p.raw_data?.Suites) || null,
    vagas: p.parking_spaces || parseInt(p.raw_data?.Vagas) || null,
    area_util: p.area || parseFloat(p.raw_data?.AreaPrivativa || p.raw_data?.AreaTotal) || null,
    link: p.external_id ? `https://smolkaimoveis.com.br/imovel/${p.external_id}` : '',
    foto_destaque: p.raw_data?.FotoDestaque || null,
    descricao: p.description || p.raw_data?.DescricaoWeb || '',
    valor_condominio: parseFloat(p.raw_data?.ValorCondominio) || null,
  };
}

// ========== SEARCH BY PORTAL LINK ==========

async function executeSearchByLink(
  supabase: any,
  tenant: Tenant,
  tenantId: string,
  phoneNumber: string,
  conversationId: string,
  args: any,
  department: string | null,
  noEmojis = false,
  contactName?: string,
  qualData?: any,
  apiKey?: string,
  provider?: string,
  model?: string
): Promise<string> {
  try {
    const { url } = args;
    if (!url) return 'URL não informada.';

    let propertyCode: string | null = null;

    // Strategy 1: extract code from URL path (smolkaimoveis.com.br/imovel/CODIGO or /imovel/CODIGO)
    const ownSiteMatch = url.match(/\/imovel\/([A-Za-z0-9\-_]+)/i);
    if (ownSiteMatch) {
      propertyCode = ownSiteMatch[1];
      console.log(`🔗 Código extraído da URL própria: ${propertyCode}`);
    }

    // Strategy 2: fetch external portal page and extract "Código do anunciante"
    if (!propertyCode) {
      console.log(`🌐 Buscando página externa para extrair código: ${url}`);
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'pt-BR,pt;q=0.9',
        },
      });

      if (response.ok) {
        const html = await response.text();

        const codePatterns = [
          /[Cc]ódigo do anunciante[:\s"]+([A-Za-z0-9\-_]+)/,
          /[Cc]ód(?:igo)?\.?\s*(?:do\s+imóvel|anunciante)?[:\s"]+([A-Za-z0-9\-_]+)/,
          /"codigoAnuncio"[:\s]+"([^"]+)"/,
          /"advertiserCode"[:\s]+"([^"]+)"/,
          /"referenceId"[:\s]+"([^"]+)"/,
          /"externalId"[:\s]+"([^"]+)"/,
          /data-ref(?:erence)?="([A-Za-z0-9\-_]+)"/,
          /Referência[:\s]+([A-Za-z0-9\-_]+)/i,
          /Código[:\s]+([A-Za-z0-9\-_]+)/i,
        ];

        for (const pattern of codePatterns) {
          const match = html.match(pattern);
          if (match && match[1]) {
            propertyCode = match[1];
            console.log(`🔍 Código encontrado via regex "${pattern}": ${propertyCode}`);
            break;
          }
        }
      } else {
        console.warn(`⚠️ Falha ao buscar URL (${response.status}): ${url}`);
      }
    }

    if (!propertyCode) {
      return 'Não consegui identificar o código do imóvel nesse link. Pode me informar o código do anúncio ou descrever o que está procurando?';
    }

    // Lookup property by external_id in database
    const { data: property, error } = await supabase
      .from('properties')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('external_id', propertyCode)
      .eq('is_active', true)
      .maybeSingle();

    if (error) {
      console.error('❌ DB error on buscar_imovel_por_link:', error);
      return 'Tive um problema ao consultar nosso catálogo. Tente novamente em instantes.';
    }

    if (!property) {
      return `O imóvel com código *${propertyCode}* não foi encontrado em nosso portfólio ativo. Pode ser que ele já tenha sido vendido/alugado ou que pertença a outra imobiliária. Quer que eu busque opções similares?`;
    }

    const mapped = mapPropertyToResult(property, tenant.city);

    // Save to conversation_states and send consultively
    await supabase
      .from('conversation_states')
      .upsert({
        tenant_id: tenantId,
        phone_number: phoneNumber,
        pending_properties: [mapped],
        current_property_index: 0,
        awaiting_property_feedback: true,
        last_search_params: { url },
        updated_at: new Date().toISOString(),
      }, { onConflict: 'tenant_id,phone_number' });

    await sendPropertyConsultive(
      phoneNumber, tenant, [mapped], 0, 1, contactName, noEmojis, qualData, apiKey, provider, model,
      supabase, tenantId, conversationId, department
    );

    return `Encontrei o imóvel código ${propertyCode} em nosso portfólio e apresentei ao lead via WhatsApp. NÃO descreva o imóvel em texto. Aguarde a resposta do lead.`;

  } catch (error) {
    console.error('❌ executeSearchByLink error:', error);
    return 'Não consegui acessar o link informado. Pode me descrever o imóvel que está procurando?';
  }
}

async function executePropertySearch(
  supabase: any,
  tenant: Tenant,
  tenantId: string,
  phoneNumber: string,
  conversationId: string,
  args: any,
  department: string | null,
  noEmojis = false,
  contactName?: string,
  qualData?: any,
  apiKey?: string,
  provider?: string,
  model?: string
): Promise<string> {
  try {
    // Determine the query intent
    const semanticQuery = args.query_semantica ||
      `Imóvel para ${args.finalidade || department || 'locacao'}`;

    console.log(`🔍 Buscando imóveis via vector search para: "${semanticQuery}"`);

    // Anomalia 4 fix: load already-shown property IDs to exclude them from results
    const { data: currentState } = await supabase
      .from('conversation_states')
      .select('shown_property_ids')
      .eq('tenant_id', tenantId)
      .eq('phone_number', phoneNumber)
      .maybeSingle();

    const shownIds: string[] = currentState?.shown_property_ids || [];

    // 1. Generate text embedding for the semantic query
    const queryEmbedding = await generateEmbedding(semanticQuery);

    // 1b. Resolve neighborhood filter from qualification data or semantic query
    let neighborhoodsFilter: string[] | null = null;
    try {
      const regions = await loadRegions(supabase, tenantId);
      if (regions.length > 0) {
        // First: check qualification data for detected neighborhood/region
        if (qualData?.detected_neighborhood) {
          const expanded = expandRegionToNeighborhoods(qualData.detected_neighborhood, regions);
          if (expanded.length > 0) {
            neighborhoodsFilter = expanded;
            console.log(`📍 Neighborhood filter from qualification: ${qualData.detected_neighborhood} → ${expanded.length} bairros`);
          }
        }
        // Fallback: detect region/neighborhood from the semantic query text
        if (!neighborhoodsFilter) {
          const queryLower = semanticQuery.toLowerCase();
          for (const region of regions) {
            if (queryLower.includes(region.region_name.toLowerCase())) {
              neighborhoodsFilter = region.neighborhoods;
              console.log(`📍 Neighborhood filter from query: "${region.region_name}" → ${region.neighborhoods.length} bairros`);
              break;
            }
          }
        }
      }
    } catch (e) {
      console.error('⚠️ Failed to load regions for neighborhood filter:', e);
    }

    // 2. Query search_properties_semantic RPC — fetch extra results to compensate for exclusions
    const fetchCount = Math.min(3 + shownIds.length, 10);
    const { data: properties, error } = await supabase.rpc('search_properties_semantic', {
      query_embedding: queryEmbedding,
      tenant_id_param: tenantId,
      match_count: fetchCount,
      price_min: args.preco_min || null,
      price_max: args.preco_max || null,
      bedrooms_min: args.quartos || null,
      neighborhoods_param: neighborhoodsFilter,
    });

    if (error) {
      console.error('❌ Property search vector error:', error);
      return 'Não consegui buscar imóveis no nosso catálogo inteligente no momento. Tente novamente em instantes.';
    }

    if (!properties || properties.length === 0) {
      return 'Não encontrei imóveis exatos com esses critérios. Quer tentar expandir a busca ou remover alguns filtros como valor máximo?';
    }

    // Format and filter out already-shown properties (Anomalia 4 fix)
    const allFormatted: PropertyResult[] = properties.map((p: any) => mapPropertyToResult(p, tenant.city));
    const freshProperties = shownIds.length > 0
      ? allFormatted.filter(p => !shownIds.includes(p.codigo))
      : allFormatted;

    if (freshProperties.length === 0) {
      console.log(`ℹ️ All ${allFormatted.length} results already shown. Shown IDs: ${shownIds.join(', ')}`);
      return 'Já apresentei todas as opções disponíveis com esses critérios. Quer que eu expanda a busca ou altere os filtros?';
    }

    const toShow = freshProperties.slice(0, 3);
    const totalToShow = toShow.length;

    // Add first property to shown_ids immediately (subsequent ones added as lead requests them)
    const updatedShownIds = [...shownIds, toShow[0].codigo].filter(Boolean);

    // Save properties to conversation state for consultative flow
    await supabase
      .from('conversation_states')
      .upsert({
        tenant_id: tenantId,
        phone_number: phoneNumber,
        pending_properties: toShow,
        current_property_index: 0,
        awaiting_property_feedback: true,
        shown_property_ids: updatedShownIds,
        last_search_params: { semantic_query: semanticQuery, ...args },
        last_property_shown_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }, { onConflict: 'tenant_id,phone_number' });

    // Send first property in consultive flow
    await sendPropertyConsultive(
      phoneNumber, tenant, toShow, 0, totalToShow, contactName, noEmojis, qualData, apiKey, provider, model,
      supabase, tenantId, conversationId, department
    );

    // Return a clear instruction to the AI — do NOT describe or list properties in text
    return `Apresentei a primeira opção ao lead via WhatsApp (foto + mensagem consultiva + "O que achou?"). Total de ${totalToShow} opções novas salvas para apresentação. NÃO descreva nem liste imóveis em texto. Aguarde a resposta do lead sobre essa primeira opção.`;

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
    // Fetch pending_properties from conversation_states to enrich the handoff
    const { data: convState } = await supabase
      .from('conversation_states')
      .select('pending_properties, current_property_index')
      .eq('tenant_id', tenantId)
      .eq('phone_number', phoneNumber)
      .maybeSingle();

    const pendingProperties = convState?.pending_properties || [];
    const currentIndex = convState?.current_property_index || 0;
    // Properties already shown = those up to (and including) the current index
    const shownProperties = pendingProperties.slice(0, currentIndex + 1);

    // Invoke c2s-create-lead
    await supabase.functions.invoke('c2s-create-lead', {
      body: {
        tenant_id: tenantId,
        phone_number: phoneNumber,
        conversation_id: conversationId,
        contact_id: contactId,
        reason: args.motivo,
        qualification_data: qualData,
        shown_properties: shownProperties,
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

    // Insert system event message
    await supabase.from('messages').insert({
      tenant_id: tenantId,
      conversation_id: conversationId,
      direction: 'outbound',
      body: 'Lead transferido para atendimento humano via CRM.',
      sender_type: 'system',
      event_type: 'ai_paused',
      created_at: new Date().toISOString(),
    });

    // Record event in conversation_events
    await supabase.from('conversation_events').insert({
      tenant_id: tenantId,
      conversation_id: conversationId,
      event_type: 'ai_paused',
      metadata: { reason: args.motivo, crm: 'c2s' },
    });

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

    // Insert system event message (visible in chat)
    await supabase.from('messages').insert({
      tenant_id: tenantId,
      conversation_id: conversationId,
      direction: 'outbound',
      body: `Atendimento transferido para operador humano. Motivo: ${args.motivo}`,
      sender_type: 'system',
      event_type: 'ai_paused',
      created_at: new Date().toISOString(),
    });

    // Record event in conversation_events audit log
    await supabase.from('conversation_events').insert({
      tenant_id: tenantId,
      conversation_id: conversationId,
      event_type: 'ai_paused',
      metadata: { reason: args.motivo },
    });

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
  maxMessages: number,
  departmentCode: string | null = null
): Promise<ConversationMessage[]> {
  let query = supabase
    .from('messages')
    .select('direction, body, sender_type')
    .eq('tenant_id', tenantId)
    .eq('conversation_id', conversationId)
    .not('body', 'is', null)
    .neq('sender_type', 'system');

  if (departmentCode) {
    query = query.or(`department_code.eq.${departmentCode},department_code.is.null`);
  }

  const { data: messages } = await query
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
