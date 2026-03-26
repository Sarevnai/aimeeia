// ========== AIMEE.iA v2 - TOOL EXECUTORS ==========
// Extracted from ai-agent/index.ts. Shared by all agent modules.
// Each function receives AgentContext instead of individual parameters.

import { AgentContext } from './agent-interface.ts';
import { sendWhatsAppMessage, sendWhatsAppImage, sendWhatsAppAudio, saveOutboundMessage } from '../whatsapp.ts';
import { logActivity, formatCurrency } from '../utils.ts';
import { ConversationMessage, PropertyResult } from '../types.ts';

// ========== PROPERTY CAPTION GENERATION (AI) ==========

export async function generatePropertyCaption(
  property: PropertyResult,
  agentName: string,
  clientNeeds?: string,
  nearbyPlaces?: string
): Promise<string> {
  // Truncar descrição do Vista para evitar que o modelo copie textos longos
  const descricaoResumo = property.descricao
    ? property.descricao.slice(0, 150).replace(/\s+\S*$/, '...')
    : null;

  const details = [
    `Tipo: ${property.tipo}`,
    `Bairro: ${property.bairro}`,
    `Cidade: ${property.cidade}`,
    property.preco && property.preco > 1 ? `Preço: ${property.preco_formatado || formatCurrency(property.preco)}` : null,
    property.quartos ? `Quartos: ${property.quartos}` : null,
    property.suites ? `Suítes: ${property.suites}` : null,
    property.vagas ? `Vagas: ${property.vagas}` : null,
    property.area_util ? `Área útil: ${property.area_util}m²` : null,
    property.valor_condominio && property.valor_condominio > 1 ? `Condomínio: ${formatCurrency(property.valor_condominio)}` : null,
    descricaoResumo ? `Referência (NÃO copie): ${descricaoResumo}` : null,
  ].filter(Boolean).join('\n');

  const clientContext = clientNeeds ? `\nO que o cliente busca: ${clientNeeds}` : '';
  const geoContext = nearbyPlaces ? `\nPontos próximos ao imóvel: ${nearbyPlaces}` : '';

  const systemPrompt = `Você é ${agentName}, consultora imobiliária apresentando UM imóvel para um cliente via WhatsApp. Escreva 3 a 4 frases curtas e naturais, como uma pessoa de verdade falando.

ESTRUTURA OBRIGATÓRIA:
1. Comece conectando o imóvel ao que o cliente pediu (ex: "Achei esse apartamento no Centro que combina bem com o que você descreveu")
2. Descreva brevemente o imóvel (tipo, bairro, preço, diferenciais) de forma fluida
3. Se houver informação de pontos próximos, mencione UMA facilidade de acesso de forma natural (ex: "Fica a 500m do supermercado X" ou "Tem escola bem pertinho")

Regras obrigatórias: português brasileiro, texto corrido e conversacional (nunca lista), PROIBIDO copiar ou parafrasear a descrição do anúncio original, PROIBIDO usar travessão (— ou –), PROIBIDO usar emojis, PROIBIDO expressões de anúncio como "segue", "confira", "não perca", "oportunidade", "venha conhecer", "destaque". O texto deve soar como uma conversa curta e pessoal, não como um anúncio.`;

  try {
    const apiKey = Deno.env.get('OPENAI_API_KEY') || Deno.env.get('LOVABLE_API_KEY') || '';
    if (!apiKey) throw new Error('No API key available');

    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `Apresente este imóvel:\n${details}${clientContext}${geoContext}` },
        ],
        max_tokens: 250,
        temperature: 0.7,
      }),
    });

    if (!response.ok) throw new Error(`API error: ${response.status}`);
    const data = await response.json();
    const text = (data.choices?.[0]?.message?.content || '').trim();
    if (!text) throw new Error('Empty response');

    // Remover travessões e similares mesmo que o modelo ignore a instrução
    return text.replace(/[—–]/g, ',').replace(/ - /g, ', ');
  } catch (e) {
    console.warn('⚠️ generatePropertyCaption fallback:', (e as Error).message);
    return buildFallbackCaption(property);
  }
}

function buildFallbackCaption(property: PropertyResult): string {
  const preco = property.preco && property.preco > 1
    ? (property.preco_formatado || formatCurrency(property.preco))
    : null;
  const info = [
    property.tipo,
    `em ${property.bairro}`,
    preco ? `por ${preco}` : null,
    property.quartos ? `com ${property.quartos} quarto${property.quartos > 1 ? 's' : ''}` : null,
  ].filter(Boolean).join(' ');
  return info + '.';
}

// ========== EMBEDDING GENERATION ==========

export async function generateEmbedding(text: string): Promise<number[]> {
  const apiKey = Deno.env.get('GOOGLE_AI_API_KEY');
  if (!apiKey) throw new Error('GOOGLE_AI_API_KEY not configured for embeddings');

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content: { parts: [{ text }] },
        outputDimensionality: 768,
      }),
    },
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Gemini Embedding API error (${response.status}): ${error}`);
  }

  const data = await response.json();
  return data.embedding.values;
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

    console.log(`🔍 Buscando imóveis via vector search para: "${semanticQuery}" | Bairro filtro: ${args.bairro || 'NENHUM'} | Tipo: ${args.tipo_imovel || 'NENHUM'} | Budget cliente: ${clientBudget} → Busca: ${searchBudget}`);

    const queryEmbedding = await generateEmbedding(semanticQuery);

    const { data: properties, error } = await ctx.supabase.rpc('match_properties', {
      query_embedding: queryEmbedding,
      match_tenant_id: ctx.tenantId,
      match_threshold: 0.2,
      match_count: 5,
      filter_max_price: searchBudget,
      filter_tipo: args.tipo_imovel || null,
      filter_neighborhood: args.bairro || null,
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
        filter_neighborhood: null, // Expansão intencional: sem filtro de bairro
      });
      console.log(`🌍 C6: Expansão sem filtro de bairro (bairro original: ${args.bairro || 'nenhum'})`);

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
    const allFormattedProperties: PropertyResult[] = validProperties.map((p: any) => ({
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

    // Filter out properties already shown to this lead
    const { data: prevState } = await ctx.supabase
      .from('conversation_states')
      .select('shown_property_ids')
      .eq('tenant_id', ctx.tenantId)
      .eq('phone_number', ctx.phoneNumber)
      .maybeSingle();

    const shownIds = new Set((prevState?.shown_property_ids || []) as string[]);
    const formattedProperties = allFormattedProperties.filter(p => !shownIds.has(p.codigo));

    if (formattedProperties.length === 0) {
      return 'Já te mostrei todas as opções que encontrei com esses critérios. Quer que eu amplie a busca para bairros vizinhos ou ajuste algum filtro?';
    }

    console.log(`🔍 Filtered: ${allFormattedProperties.length} found, ${shownIds.size} already shown, ${formattedProperties.length} new to send`);

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

    // C5: Enviar UM imóvel por vez com foto + caption rico + contexto de geolocalização
    const agentName = (ctx.aiConfig as any).agent_name || 'Aimee';
    const { sendWhatsAppMessage: sendMsg } = await import('../whatsapp.ts');
    const prop = formattedProperties[0];

    // Construir contexto do que o cliente busca para personalizar a apresentação
    const clientNeeds = [
      args.finalidade ? `Finalidade: ${args.finalidade}` : null,
      args.tipo_imovel ? `Tipo: ${args.tipo_imovel}` : null,
      args.bairro ? `Bairro desejado: ${args.bairro}` : null,
      args.quartos ? `Quartos: ${args.quartos}` : null,
      clientBudget ? `Orçamento: até ${formatCurrency(clientBudget)}` : null,
    ].filter(Boolean).join(', ');

    // Buscar pontos de interesse próximos para enriquecer a apresentação
    let nearbyPlacesText = '';
    try {
      const { data: propGeo } = await ctx.supabase
        .from('properties')
        .select('latitude, longitude')
        .eq('tenant_id', ctx.tenantId)
        .eq('external_id', prop.codigo)
        .maybeSingle();

      if (propGeo?.latitude && propGeo?.longitude) {
        // Search multiple POI types to enrich the property description
        const poiTypes = ['supermarket', 'school', 'restaurant'];
        const allPlaces: string[] = [];
        for (const poiType of poiTypes) {
          try {
            const { data: poiData } = await ctx.supabase.functions.invoke('get-nearby-places', {
              body: {
                latitude: propGeo.latitude,
                longitude: propGeo.longitude,
                radius: 1500,
                type: poiType,
              }
            });
            const places = (poiData?.places || []).slice(0, 1) as any[];
            places.forEach((p: any) => {
              const distStr = p.distance_meters > 1000
                ? `${(p.distance_meters / 1000).toFixed(1)}km`
                : `${p.distance_meters}m`;
              allPlaces.push(`${p.name} a ${distStr}`);
            });
          } catch {}
        }
        nearbyPlacesText = allPlaces.slice(0, 3).join('; ');
      }
    } catch (geoErr) {
      console.warn('⚠️ Geolocation enrichment failed, proceeding without:', (geoErr as Error).message);
    }

    const aiCaption = await generatePropertyCaption(prop, agentName, clientNeeds, nearbyPlacesText);
    const rawCaption = prop.link ? `${aiCaption}\n\n${prop.link}` : aiCaption;
    const caption = `*${agentName}*\n\n${rawCaption}`;
    let sentCount = 0;
    if (prop.foto_destaque) {
      const imgResult = await sendWhatsAppImage(ctx.phoneNumber, prop.foto_destaque, caption, ctx.tenant);
      if (imgResult.success) {
        sentCount = 1;
      } else {
        console.warn(`⚠️ Image send failed for property ${prop.codigo}, falling back to text`);
        const textResult = await sendMsg(ctx.phoneNumber, caption, ctx.tenant);
        sentCount = textResult?.success ? 1 : 0;
      }
    } else {
      const textResult = await sendMsg(ctx.phoneNumber, caption, ctx.tenant);
      sentCount = textResult?.success ? 1 : 0;
    }

    console.log(`📤 Property sent: ${sentCount}/1 delivered | ${formattedProperties.length - 1} remaining in queue`);

    // Track shown property and advance index
    if (sentCount > 0) {
      const { data: currentState } = await ctx.supabase
        .from('conversation_states')
        .select('shown_property_ids')
        .eq('tenant_id', ctx.tenantId)
        .eq('phone_number', ctx.phoneNumber)
        .maybeSingle();

      const shownIds = currentState?.shown_property_ids || [];
      if (prop.codigo && !shownIds.includes(prop.codigo)) {
        shownIds.push(prop.codigo);
      }

      await ctx.supabase
        .from('conversation_states')
        .upsert({
          tenant_id: ctx.tenantId,
          phone_number: ctx.phoneNumber,
          shown_property_ids: shownIds,
          current_property_index: 1,
          last_property_shown_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }, { onConflict: 'tenant_id,phone_number' });
    }

    // Persist lead qualification data — use bairro from args or first result, NOT the full semantic query
    const detectedBairro = args.bairro || (formattedProperties.length > 0 ? formattedProperties[0].bairro : null);
    await ctx.supabase
      .from('lead_qualification')
      .upsert({
        tenant_id: ctx.tenantId,
        phone_number: ctx.phoneNumber,
        detected_property_type: args.tipo_imovel || null,
        detected_budget_max: args.preco_max || null,
        detected_interest: args.finalidade || null,
        detected_neighborhood: detectedBairro || null,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'tenant_id,phone_number' });

    // Construir resumo dos imóveis para o LLM poder responder perguntas do cliente
    const propertySummaries = formattedProperties.map((p, i) => {
      const descResumo = p.descricao ? p.descricao.slice(0, 500) : 'Sem descrição disponível';
      const details = [
        `Código: ${p.codigo}`,
        `Tipo: ${p.tipo}`,
        `Bairro: ${p.bairro}`,
        p.preco ? `Preço: ${p.preco_formatado || formatCurrency(p.preco)}` : null,
        p.quartos ? `Quartos: ${p.quartos}` : null,
        p.suites ? `Suítes: ${p.suites}` : null,
        p.vagas ? `Vagas: ${p.vagas}` : null,
        p.area_util ? `Área útil: ${p.area_util}m²` : null,
        p.valor_condominio && p.valor_condominio > 1 ? `Condomínio: ${formatCurrency(p.valor_condominio)}` : null,
        p.link ? `Link: ${p.link}` : null,
        `Descrição: ${descResumo}`,
      ].filter(Boolean).join(', ');
      return `${i === 0 ? 'Imóvel ENVIADO' : `Imóvel na fila ${i}`}: ${details}`;
    }).join('\n');

    const remaining = formattedProperties.length - 1;

    if (sentCount === 0) {
      const textHint = `[SISTEMA] A busca encontrou ${formattedProperties.length} imóveis, mas houve falha no envio via WhatsApp. Apresente o primeiro imóvel ao cliente em texto corrido, conectando as necessidades dele com o imóvel, mencionando alguma facilidade de acesso se souber.\n\n[DADOS DOS IMÓVEIS]\n${propertySummaries}`;
      return textHint;
    }

    // Build dynamic context so the LLM references the ACTUAL property sent, not a generic example
    const sentProp = formattedProperties[0];
    const propContext = [
      sentProp.tipo ? `Tipo: ${sentProp.tipo}` : null,
      sentProp.bairro ? `Bairro: ${sentProp.bairro}` : null,
      sentProp.preco ? `Preço: ${sentProp.preco_formatado || formatCurrency(sentProp.preco)}` : null,
      sentProp.quartos ? `Quartos: ${sentProp.quartos}` : null,
      sentProp.suites ? `Suítes: ${sentProp.suites}` : null,
      sentProp.area_util ? `Área: ${sentProp.area_util}m²` : null,
    ].filter(Boolean).join(', ');
    const baseHint = `[SISTEMA — INSTRUÇÃO CRÍTICA] 1 imóvel já foi enviado ao cliente com foto, descrição personalizada e link clicável. O imóvel enviado é: ${propContext}.\n\nREGRAS DE RESPOSTA:\n1. NÃO liste detalhes técnicos — o cliente já recebeu tudo no card.\n2. Responda com 1-2 frases CURTAS conectando o imóvel ao perfil do cliente.\n3. OBRIGATÓRIO mencionar o bairro e tipo REAIS do imóvel (${sentProp.bairro || 'não informado'}, ${sentProp.tipo || 'imóvel'}).\n4. Destaque UM diferencial relevante para o cliente.\n5. Finalize convidando o cliente a dar uma olhada e dar feedback.\n6. NUNCA invente bairros, tipos ou características que não existem no imóvel enviado.\n\nSe o cliente gostar, ótimo. Se não gostar ou quiser ver mais, você tem mais ${remaining} opção(ões) na fila.`;
    const detailHint = `\n\n[DADOS DOS IMÓVEIS — use para responder perguntas do cliente]\n${propertySummaries}`;
    const remainingHint = remaining > 0
      ? `\n\n[FILA] Restam ${remaining} imóvel(is). Quando o cliente pedir mais opções, alterar critérios (mais quartos, outro bairro, mais suítes), ou não gostar, CHAME buscar_imoveis com os critérios atualizados. NÃO responda com texto genérico pedindo mais informações se já tem o perfil do cliente.`
      : '\n\n[FILA VAZIA] Não há mais imóveis na fila. Se o cliente pedir mais opções, CHAME buscar_imoveis com critérios atualizados.';
    const hint = baseHint + detailHint + remainingHint;
    return hint;

  } catch (error) {
    console.error('❌ Property search execution error:', error);
    return 'Tive um problema ao buscar imóveis em nosso catálogo. Vou tentar novamente.';
  }
}

// ========== LEAD HANDOFF (C2S CRM) ==========
// ========== GOOGLE MAPS POI SEARCH ==========

export async function executeGetNearbyPlaces(
  ctx: AgentContext,
  args: { external_id: string; type?: string }
): Promise<string> {
  try {
    const { tenantId, supabase } = ctx;
    const { external_id, type = 'supermarket' } = args;

    // 1. Encontrar o imóvel no banco para pegar Lat/Lng
    const { data: property } = await supabase
      .from('properties')
      .select('latitude, longitude, title, neighborhood')
      .eq('tenant_id', tenantId)
      .eq('external_id', external_id)
      .single();

    if (!property || !property.latitude || !property.longitude) {
      return `[RESULTADO] Não foi possível encontrar a localização exata no mapa para o imóvel ${external_id}. Use seu conhecimento geral sobre o bairro ${property?.neighborhood || ''} para responder.`;
    }

    // 2. Chamar a Edge Function get-nearby-places
    const { data: responseData, error } = await supabase.functions.invoke('get-nearby-places', {
      body: {
        latitude: property.latitude,
        longitude: property.longitude,
        radius: 2000, // 2km radius
        type: type,
      }
    });

    if (error || !responseData?.places) {
      console.error('❌ Error calling get-nearby-places:', error || responseData);
      return `[RESULTADO] Falha ao buscar pontos de interesse próximos no mapa. Use seu conhecimento geral para responder.`;
    }

    const places = responseData.places as any[];
    if (places.length === 0) {
      return `[RESULTADO] Nenhum local do tipo '${type}' encontrado num raio de 2km do imóvel.`;
    }

    const lines = places.slice(0, 3).map((p: any) => {
      const distStr = p.distance_meters > 1000 
        ? `${(p.distance_meters / 1000).toFixed(1)}km` 
        : `${p.distance_meters}m`;
      return `- ${p.name} (${distStr} de distância)`;
    });

    return `[RESULTADO] Pontos de interesse (${type}) próximos ao imóvel:\n${lines.join('\n')}\nBaseado nisso, formule uma resposta natural ao cliente destacando a proximidade.`;

  } catch (err: any) {
    console.error('❌ executeGetNearbyPlaces error:', err);
    return `[ERRO] ${err.message}`;
  }
}


export async function executeLeadHandoff(
  ctx: AgentContext,
  args: any
): Promise<string> {
  try {
    let developmentId = args.codigo_imovel || null;
    let developmentTitle = args.titulo_imovel || null;

    // Fallback: se a IA não passou o imóvel, tentar extrair do conversation_states
    if (!developmentId) {
      try {
        const { data: convState } = await ctx.supabase
          .from('conversation_states')
          .select('pending_properties, current_property_index')
          .eq('tenant_id', ctx.tenantId)
          .eq('phone_number', ctx.phoneNumber)
          .single();

        if (convState?.pending_properties?.length) {
          // Pegar o último imóvel mostrado (current_property_index - 1, pois incrementa após mostrar)
          const idx = Math.max(0, (convState.current_property_index || 1) - 1);
          const prop = convState.pending_properties[idx] || convState.pending_properties[0];
          if (prop?.codigo) {
            developmentId = prop.codigo;
            const tipo = prop.tipo?.replace(/s$/, '') || 'Imóvel';
            const quartos = prop.quartos ? `com ${prop.quartos} dormitórios` : '';
            const bairro = prop.bairro || '';
            const cidade = prop.cidade || '';
            const localStr = [bairro, cidade].filter(Boolean).join(', ');
            developmentTitle = [tipo, quartos, localStr ? `no ${localStr}` : ''].filter(Boolean).join(' ');
            console.log(`📦 Fallback prop_ref: [${developmentId}] ${developmentTitle}`);
          }
        }
      } catch (fbErr) {
        console.warn('⚠️ Fallback property lookup failed:', fbErr);
      }
    }

    await ctx.supabase.functions.invoke('c2s-create-lead', {
      body: {
        tenant_id: ctx.tenantId,
        phone_number: ctx.phoneNumber,
        conversation_id: ctx.conversationId,
        contact_id: ctx.contactId,
        reason: args.motivo,
        qualification_data: ctx.qualificationData,
        development_id: developmentId,
        development_title: developmentTitle,
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

// ========== SEND AUDIO AND SAVE HELPER ==========

export async function sendAndSaveAudio(
  supabase: any,
  tenant: any,
  tenantId: string,
  conversationId: string,
  phoneNumber: string,
  textContent: string,
  audioUrl: string,
  department: string | null
) {
  const { messageId } = await sendWhatsAppAudio(phoneNumber, audioUrl, tenant);
  await saveOutboundMessage(
    supabase, tenantId, conversationId, phoneNumber,
    textContent, messageId, department || undefined,
    'audio', audioUrl
  );
}
