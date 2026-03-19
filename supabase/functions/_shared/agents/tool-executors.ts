// ========== AIMEE.iA v2 - TOOL EXECUTORS ==========
// Extracted from ai-agent/index.ts. Shared by all agent modules.
// Each function receives AgentContext instead of individual parameters.

import { AgentContext } from './agent-interface.ts';
import { sendWhatsAppMessage, sendWhatsAppImage, saveOutboundMessage } from '../whatsapp.ts';
import { formatConsultativeProperty } from '../property.ts';
import { logActivity } from '../utils.ts';
import { ConversationMessage, PropertyResult } from '../types.ts';

// ========== EMBEDDING GENERATION ==========

export async function generateEmbedding(text: string): Promise<number[]> {
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

// ========== API KEY DECRYPTION ==========

export async function decryptApiKey(encrypted: string | null | undefined): Promise<string | undefined> {
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

// ========== PROPERTY SEARCH ==========

export async function executePropertySearch(
  ctx: AgentContext,
  args: any
): Promise<string> {
  try {
    const semanticQuery = args.query_semantica ||
      `Imóvel para ${args.finalidade || ctx.department || 'locacao'}`;

    // C1: Aplicar margem de 30% acima do orçamento informado pelo cliente
    // "O cliente pediu 1 milhão, mandamos de 1M até 1.3M" — regra de negociação imobiliária
    const clientBudget = args.preco_max || null;
    const searchBudget = clientBudget ? Math.round(clientBudget * 1.3) : null;

    console.log(`🔍 Buscando imóveis via vector search para: "${semanticQuery}" | Budget cliente: ${clientBudget} → Busca: ${searchBudget}`);

    const queryEmbedding = await generateEmbedding(semanticQuery);

    const { data: properties, error } = await ctx.supabase.rpc('match_properties', {
      query_embedding: queryEmbedding,
      match_tenant_id: ctx.tenantId,
      match_threshold: 0.2,
      match_count: 5,
      filter_max_price: searchBudget,
      filter_tipo: args.tipo_imovel || null,
    });

    if (error) {
      console.error('❌ Property search vector error:', error);
      return 'Não consegui buscar imóveis no nosso catálogo inteligente no momento. Tente novamente em instantes.';
    }

    // C2: Filtrar imóveis sem preço válido — "sob consulta" não existe no sistema
    let validProperties = (properties || []).filter((p: any) => p.price && p.price > 1);

    // C6: Expansão geográfica proativa — se poucos resultados, busca ampla (sem bairro específico)
    if (validProperties.length <= 1) {
      console.log(`🌍 C6: Apenas ${validProperties.length} resultado(s) válido(s). Tentando expansão geográfica...`);
      const expandedQuery = args.tipo_imovel
        ? `${args.tipo_imovel} para ${args.finalidade || 'venda'} em ${ctx.tenant.city}`
        : `imóvel para ${args.finalidade || 'venda'} em ${ctx.tenant.city}`;
      const expandedEmbedding = await generateEmbedding(expandedQuery);
      const { data: expandedProps } = await ctx.supabase.rpc('match_properties', {
        query_embedding: expandedEmbedding,
        match_tenant_id: ctx.tenantId,
        match_threshold: 0.15, // Threshold mais baixo para busca ampla
        match_count: 5,
        filter_max_price: searchBudget,
        filter_tipo: args.tipo_imovel || null,
      });

      const expandedValid = (expandedProps || []).filter((p: any) => p.price && p.price > 1);
      // Mesclar: resultados originais primeiro, depois os expandidos (sem duplicatas)
      const originalIds = new Set(validProperties.map((p: any) => p.external_id));
      const newExpanded = expandedValid.filter((p: any) => !originalIds.has(p.external_id));
      const allProperties = [...validProperties, ...newExpanded];

      if (allProperties.length === 0) {
        return 'Não encontrei imóveis disponíveis com esses critérios no momento. Quer que eu ajuste a faixa de preço ou o tipo de imóvel?';
      }

      // Substituir validProperties com o resultado combinado e sinalizar expansão
      console.log(`🌍 C6: Expansão trouxe ${newExpanded.length} resultado(s) adicional(is) em bairros próximos.`);
      validProperties.push(...newExpanded);
    }

    if (validProperties.length === 0) {
      return 'Não encontrei imóveis disponíveis com esses critérios. Quer que eu ajuste algum filtro?';
    }

    // C7: Construir URL do imóvel — usa p.url do DB se disponível,
    // senão constrói a partir do website_url configurado no ai_agent_config + external_id
    const websiteBase = (ctx.aiConfig as any).website_url?.replace(/\/$/, '') || '';
    const formattedProperties: PropertyResult[] = validProperties.map((p: any) => ({
      codigo: p.external_id,
      tipo: p.type || 'Imóvel',
      bairro: p.neighborhood || 'Região',
      cidade: p.city || ctx.tenant.city,
      preco: p.price,
      preco_formatado: null,
      quartos: p.bedrooms,
      suites: null,
      vagas: null,
      area_util: null,
      link: p.url || (websiteBase && p.external_id ? `${websiteBase}/imovel/${p.external_id}` : ''),
      foto_destaque: p.images && p.images.length > 0 ? p.images[0] : null,
      descricao: p.description,
      valor_condominio: null,
    }));

    await ctx.supabase
      .from('conversation_states')
      .upsert({
        tenant_id: ctx.tenantId,
        phone_number: ctx.phoneNumber,
        pending_properties: formattedProperties,
        current_property_index: 0,
        awaiting_property_feedback: true,
        last_search_params: { semantic_query: semanticQuery, ...args },
        updated_at: new Date().toISOString(),
      }, { onConflict: 'tenant_id,phone_number' });

    // C5: Enviar top 3 imóveis individualmente com foto + caption rico
    const maxToSend = Math.min(formattedProperties.length, 3);
    for (let i = 0; i < maxToSend; i++) {
      const prop = formattedProperties[i];
      const caption = formatConsultativeProperty(prop, i, formattedProperties.length);
      if (prop.foto_destaque) {
        await sendWhatsAppImage(ctx.phoneNumber, prop.foto_destaque, caption, ctx.tenant);
      } else {
        // Sem foto: envia como texto com link
        const { sendWhatsAppMessage: sendMsg } = await import('../whatsapp.ts');
        await sendMsg(ctx.phoneNumber, caption, ctx.tenant);
      }
      // Pequeno delay entre envios para não sobrecarregar
      if (i < maxToSend - 1) {
        await new Promise(r => setTimeout(r, 1500));
      }
    }

    // C5: Retorna instrução para o LLM NÃO gerar lista de texto — os cards já foram enviados
    const remaining = formattedProperties.length - maxToSend;
    const hint = remaining > 0
      ? `[SISTEMA — INSTRUÇÃO CRÍTICA] ${maxToSend} imóveis já foram enviados ao cliente como cards individuais com foto e link. Restam ${remaining} opções não enviadas ainda. PROIBIDO: listar, numerar, descrever, mencionar bairro, preço, quartos ou qualquer detalhe dos imóveis no texto. Sua resposta deve ser SOMENTE uma frase curta natural, sem emoji, sem exclamação. Exemplo: "Enviei algumas opções. Dá uma olhada e me conta o que achou de cada uma." — aguarde a resposta do cliente antes de enviar mais.`
      : `[SISTEMA — INSTRUÇÃO CRÍTICA] ${maxToSend} imóveis já foram enviados ao cliente como cards individuais com foto e link. PROIBIDO: listar, numerar, descrever, mencionar bairro, preço, quartos ou qualquer detalhe dos imóveis no texto. Sua resposta deve ser SOMENTE uma frase curta natural, sem emoji, sem exclamação. Exemplo: "Enviei algumas opções. Dá uma olhada e me conta o que achou."`;
    return hint;

  } catch (error) {
    console.error('❌ Property search execution error:', error);
    return 'Tive um problema ao buscar imóveis em nosso catálogo. Vou tentar novamente.';
  }
}

// ========== LEAD HANDOFF (C2S CRM) ==========

export async function executeLeadHandoff(
  ctx: AgentContext,
  args: any
): Promise<string> {
  try {
    await ctx.supabase.functions.invoke('c2s-create-lead', {
      body: {
        tenant_id: ctx.tenantId,
        phone_number: ctx.phoneNumber,
        conversation_id: ctx.conversationId,
        contact_id: ctx.contactId,
        reason: args.motivo,
        qualification_data: ctx.qualificationData,
      },
    });

    await ctx.supabase
      .from('conversation_states')
      .upsert({
        tenant_id: ctx.tenantId,
        phone_number: ctx.phoneNumber,
        is_ai_active: false,
        operator_takeover_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }, { onConflict: 'tenant_id,phone_number' });

    await ctx.supabase.from('messages').insert({
      tenant_id: ctx.tenantId,
      conversation_id: ctx.conversationId,
      direction: 'outbound',
      body: 'Lead transferido para atendimento humano via CRM.',
      sender_type: 'system',
      event_type: 'ai_paused',
      created_at: new Date().toISOString(),
    });

    await ctx.supabase.from('conversation_events').insert({
      tenant_id: ctx.tenantId,
      conversation_id: ctx.conversationId,
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

export async function executeCreateTicket(
  ctx: AgentContext,
  args: any
): Promise<string> {
  try {
    const { titulo, categoria, descricao, prioridade } = args;

    const { data: categoryRow } = await ctx.supabase
      .from('ticket_categories')
      .select('id, sla_hours')
      .eq('tenant_id', ctx.tenantId)
      .eq('name', categoria)
      .eq('is_active', true)
      .maybeSingle();

    const { data: defaultStage } = await ctx.supabase
      .from('ticket_stages')
      .select('id')
      .eq('tenant_id', ctx.tenantId)
      .eq('order_index', 0)
      .maybeSingle();

    const slaHours = categoryRow?.sla_hours || 48;
    const slaDeadline = new Date(Date.now() + slaHours * 60 * 60 * 1000).toISOString();

    const { data: ticket, error } = await ctx.supabase
      .from('tickets')
      .insert({
        tenant_id: ctx.tenantId,
        title: titulo,
        category: categoria,
        category_id: categoryRow?.id || null,
        description: descricao,
        priority: prioridade || 'media',
        stage: 'Novo',
        stage_id: defaultStage?.id || null,
        phone: ctx.phoneNumber,
        source: 'whatsapp_ai',
        contact_id: ctx.contactId || null,
        conversation_id: ctx.conversationId || null,
        department_code: 'administrativo',
        sla_deadline: slaDeadline,
      })
      .select('id')
      .single();

    if (error) {
      console.error('❌ Ticket creation error:', error);
      return 'Houve um problema ao criar o chamado. Vou transferir para um atendente humano.';
    }

    await logActivity(ctx.supabase, ctx.tenantId, 'ticket_created', 'tickets', ticket.id, {
      category: categoria,
      priority: prioridade,
      source: 'ai_agent',
      conversation_id: ctx.conversationId,
    });

    console.log(`✅ Ticket created: ${ticket.id} | Category: ${categoria} | Priority: ${prioridade}`);

    return `Chamado #${ticket.id.slice(0, 8)} criado com sucesso. Categoria: ${categoria}. Prioridade: ${prioridade}. A equipe administrativa será notificada.`;

  } catch (error) {
    console.error('❌ Ticket creation execution error:', error);
    return 'Não consegui registrar o chamado automaticamente. Vou transferir para atendimento humano.';
  }
}

// ========== ADMIN OPERATOR HANDOFF ==========

export async function executeAdminHandoff(
  ctx: AgentContext,
  args: any
): Promise<string> {
  try {
    await ctx.supabase
      .from('conversation_states')
      .upsert({
        tenant_id: ctx.tenantId,
        phone_number: ctx.phoneNumber,
        is_ai_active: false,
        operator_takeover_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }, { onConflict: 'tenant_id,phone_number' });

    await ctx.supabase.from('messages').insert({
      tenant_id: ctx.tenantId,
      conversation_id: ctx.conversationId,
      direction: 'outbound',
      body: `Atendimento transferido para operador humano. Motivo: ${args.motivo}`,
      sender_type: 'system',
      event_type: 'ai_paused',
      created_at: new Date().toISOString(),
    });

    await ctx.supabase.from('conversation_events').insert({
      tenant_id: ctx.tenantId,
      conversation_id: ctx.conversationId,
      event_type: 'ai_paused',
      metadata: { reason: args.motivo },
    });

    await logActivity(ctx.supabase, ctx.tenantId, 'admin_handoff', 'conversations', ctx.conversationId, {
      reason: args.motivo,
      department: 'administrativo',
    });

    console.log(`🔄 Admin handoff: conversation ${ctx.conversationId} | Reason: ${args.motivo}`);

    return `Atendimento transferido para operador humano. Motivo: ${args.motivo}`;

  } catch (error) {
    console.error('❌ Admin handoff error:', error);
    return 'Vou transferir você para um atendente. Aguarde um momento.';
  }
}

// ========== CONVERSATION HISTORY LOADER ==========

export async function loadConversationHistory(
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
    .not('body', 'is', null);

  if (departmentCode) {
    query = query.or(`department_code.eq.${departmentCode},department_code.is.null`);
  }

  const { data: messages } = await query
    .order('created_at', { ascending: false })
    .limit(maxMessages);

  if (!messages || messages.length === 0) return [];

  return messages.reverse().map((m: any) => ({
    role: m.direction === 'inbound' ? 'user' : 'assistant',
    content: m.sender_type === 'system' ? `[SISTEMA: ${m.body}]` : m.body,
  })) as ConversationMessage[];
}

// ========== REMARKETING CONTEXT LOADER ==========

export async function loadRemarketingContext(
  supabase: any,
  tenantId: string,
  contactId: string
): Promise<string | null> {
  try {
    const sections: string[] = [];

    const { data: contact } = await supabase
      .from('contacts')
      .select('name, crm_archive_reason, crm_natureza, neighborhood, city, notes')
      .eq('id', contactId)
      .maybeSingle();

    if (contact) {
      sections.push('📋 CONTEXTO DO LEAD (REMARKETING):');
      sections.push('- Lead re-engajado via campanha de remarketing');
      if (contact.crm_archive_reason) sections.push(`- Motivo de arquivamento anterior: ${contact.crm_archive_reason}`);
      if (contact.crm_natureza) sections.push(`- Interesse anterior: ${contact.crm_natureza}`);
      if (contact.neighborhood || contact.city) {
        const location = [contact.neighborhood, contact.city].filter(Boolean).join(', ');
        sections.push(`- Região anterior: ${location}`);
      }
      if (contact.notes) sections.push(`- Observações: ${contact.notes}`);
    }

    const { data: archivedConv } = await supabase
      .from('conversations')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('contact_id', contactId)
      .eq('status', 'archived')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (archivedConv) {
      const { data: prevMessages } = await supabase
        .from('messages')
        .select('body, direction, sender_type')
        .eq('conversation_id', archivedConv.id)
        .not('body', 'is', null)
        .neq('sender_type', 'system')
        .order('created_at', { ascending: false })
        .limit(15);

      if (prevMessages && prevMessages.length > 0) {
        const summary = prevMessages.reverse().map((m: any) => {
          const role = m.direction === 'inbound' ? 'Cliente' : 'Aimee';
          return `${role}: ${m.body?.slice(0, 100)}`;
        }).join('\n');
        sections.push(`\n📜 RESUMO DA ÚLTIMA CONVERSA:\n${summary}`);
      }
    }

    if (sections.length === 0) return null;

    sections.push('\n⚠️ USE este contexto para personalizar o atendimento.');
    sections.push('NÃO pergunte informações que já foram coletadas antes.');

    return sections.join('\n');
  } catch (error) {
    console.error('⚠️ Error loading remarketing context:', error);
    return null;
  }
}

// ========== SEND AND SAVE HELPER ==========

export async function sendAndSave(
  supabase: any,
  tenant: any,
  tenantId: string,
  conversationId: string,
  phoneNumber: string,
  message: string,
  department: string | null
) {
  const { messageId } = await sendWhatsAppMessage(phoneNumber, message, tenant);
  await saveOutboundMessage(supabase, tenantId, conversationId, phoneNumber, message, messageId, department || undefined);
}
