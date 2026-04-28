// ========== AIMEE.iA v2 - TOOL EXECUTORS ==========
// Extracted from ai-agent/index.ts. Shared by all agent modules.
// Each function receives AgentContext instead of individual parameters.

import { AgentContext } from './agent-interface.ts';
import { sendWhatsAppMessage, sendWhatsAppImage, sendWhatsAppAudio, saveOutboundMessage } from '../whatsapp.ts';
import { logActivity, formatCurrency } from '../utils.ts';
import { ConversationMessage, PropertyResult } from '../types.ts';
import { insertTrace, estimateTokens, estimateCost } from '../ai-call.ts';

// ========== SHOWN PROPERTIES (CROSS-CONVERSATION MEMORY) ==========
// Persiste em contacts.shown_property_codes os imóveis já apresentados ao lead,
// de modo que uma nova conversa (rewarm, novo webhook) não repita os mesmos
// imóveis. Complementa conversation_states.shown_property_ids (per-conversation).

export async function getShownPropertyCodes(ctx: AgentContext): Promise<Set<string>> {
  const codes = new Set<string>();
  try {
    if (ctx.contactId) {
      // Caso Daniela 28/04: lead C2S arquivada com crm_property_ref="[56957] 56957"
      // (imóvel já mostrado pelo corretor humano em 2025, motivo do arquivamento
      // "sem opções"). Aimee re-mostrou o MESMO imóvel hoje porque o filtro só
      // lia shown_property_codes (interno) e ignorava o histórico C2S. Agora
      // parseia também o crm_property_ref pra evitar repetição cross-system.
      const { data: contact } = await ctx.supabase
        .from('contacts')
        .select('shown_property_codes, crm_property_ref')
        .eq('id', ctx.contactId)
        .maybeSingle();
      const arr = Array.isArray(contact?.shown_property_codes) ? contact.shown_property_codes : [];
      for (const entry of arr) {
        if (entry?.code) codes.add(String(entry.code));
      }
      // Parse crm_property_ref: aceita "[56957] desc", "[56957] 56957", "[XXXXX-LP]
      // descrição" — só pega códigos numéricos (skip refs como [VILLA-MAGGIORE]).
      const ref = String(contact?.crm_property_ref || '');
      const refMatch = ref.match(/^\[(\d{3,8})\]/);
      if (refMatch) codes.add(refMatch[1]);
    }
    const { data: state } = await ctx.supabase
      .from('conversation_states')
      .select('shown_property_ids')
      .eq('tenant_id', ctx.tenantId)
      .eq('phone_number', ctx.phoneNumber)
      .maybeSingle();
    for (const c of (state?.shown_property_ids || []) as string[]) {
      codes.add(String(c));
    }
  } catch (err) {
    console.warn('⚠️ getShownPropertyCodes failed:', (err as Error).message);
  }
  return codes;
}

export async function recordShownProperty(ctx: AgentContext, code: string, reaction: 'interest' | 'declined' | 'no_response' | 'unknown' = 'unknown'): Promise<void> {
  if (!ctx.contactId || !code) return;
  try {
    const { data: contact } = await ctx.supabase
      .from('contacts')
      .select('shown_property_codes')
      .eq('id', ctx.contactId)
      .maybeSingle();
    const current = Array.isArray(contact?.shown_property_codes) ? contact.shown_property_codes : [];
    // Se já tem esse code, atualiza reaction se melhor (interest > declined > unknown)
    const idx = current.findIndex((e: any) => e?.code === code);
    const entry = {
      code,
      shown_at: new Date().toISOString(),
      reaction,
      conversation_id: ctx.conversationId,
    };
    if (idx >= 0) {
      current[idx] = { ...current[idx], ...entry };
    } else {
      current.push(entry);
    }
    await ctx.supabase
      .from('contacts')
      .update({ shown_property_codes: current, updated_at: new Date().toISOString() })
      .eq('id', ctx.contactId);
  } catch (err) {
    console.warn('⚠️ recordShownProperty failed:', (err as Error).message);
  }
}

// ========== PROPERTY CAPTION GENERATION (AI) ==========

export async function generatePropertyCaption(
  property: PropertyResult,
  agentName: string,
  clientNeeds?: string,
  nearbyPlaces?: string,
  traceCtx?: { supabase: any; tenant_id?: string; conversation_id?: string }
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

  const systemPrompt = `Você é ${agentName}, consultora imobiliária VIP apresentando UM imóvel para um cliente via WhatsApp. Escreva 3 a 5 frases curtas e naturais, como uma consultora atenciosa falando com alguém que ela conhece.

ESTRUTURA OBRIGATÓRIA:
1. PRIMEIRA FRASE: conecte o imóvel DIRETAMENTE ao critério mais importante do cliente. Use os dados exatos que o cliente informou (bairro, quartos, orçamento). Ex: "Esse aqui é no Centro, com 3 quartos e tá dentro do seu orçamento de R$ 1,2M."
2. SEGUNDA FRASE: mencione um diferencial concreto do imóvel (área, vagas, suítes, condomínio) que agregue valor. Ex: "Tem 95m², 2 vagas e o condomínio é R$ 800."
3. TERCEIRA FRASE (se houver dados de geolocalização): mencione proximidade a algo relevante pro cliente de forma natural. Ex: "E tem uma escola a 300m, que você mencionou ser importante."
4. ÚLTIMA FRASE: pergunte a opinião do cliente de forma consultiva. Ex: "O que acha? Quer que eu busque mais opções ou esse te interessou?"

REGRA CRÍTICA: Você DEVE mencionar pelo menos 2 critérios específicos que o cliente pediu (bairro, quartos, preço, tipo) na apresentação. NUNCA apresente de forma genérica como "achei um apartamento que pode te interessar". Seja ESPECÍFICA e CONSULTIVA.

Regras de formato: português brasileiro, texto corrido e conversacional (nunca lista), PROIBIDO copiar ou parafrasear a descrição do anúncio original, PROIBIDO usar travessão (— ou –), PROIBIDO usar emojis, PROIBIDO expressões de anúncio como "segue", "confira", "não perca", "oportunidade", "venha conhecer", "destaque". O texto deve soar como uma conversa pessoal de consultora, não como um anúncio.`;

  try {
    const apiKey = Deno.env.get('OPENAI_API_KEY') || Deno.env.get('LOVABLE_API_KEY') || '';
    if (!apiKey) throw new Error('No API key available');

    const model = 'gpt-5.4-mini';
    const userContent = `Apresente este imóvel:\n${details}${clientContext}${geoContext}`;
    const startTime = Date.now();

    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userContent },
        ],
        max_tokens: 350,
        temperature: 0.7,
      }),
    });

    const latencyMs = Date.now() - startTime;

    if (!response.ok) throw new Error(`API error: ${response.status}`);
    const data = await response.json();
    const text = (data.choices?.[0]?.message?.content || '').trim();
    if (!text) throw new Error('Empty response');

    // Trace cost
    if (traceCtx?.supabase) {
      const promptTokens = estimateTokens(systemPrompt + userContent);
      const completionTokens = estimateTokens(text);
      insertTrace(traceCtx.supabase, {
        tenant_id: traceCtx.tenant_id,
        conversation_id: traceCtx.conversation_id,
        call_type: 'caption',
        model, provider: 'google',
        prompt_tokens: promptTokens, completion_tokens: completionTokens,
        latency_ms: latencyMs,
        cost_usd: estimateCost(model, promptTokens, completionTokens),
        success: true,
      });
    }

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

export async function generateEmbedding(
  text: string,
  traceCtx?: { supabase: any; tenant_id?: string },
  taskType: 'RETRIEVAL_DOCUMENT' | 'RETRIEVAL_QUERY' = 'RETRIEVAL_QUERY',
): Promise<number[]> {
  const apiKey = Deno.env.get('GOOGLE_AI_API_KEY');
  if (!apiKey) throw new Error('GOOGLE_AI_API_KEY not configured for embeddings');

  const model = 'gemini-embedding-001';
  const startTime = Date.now();

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:embedContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content: { parts: [{ text }] },
        taskType,
        outputDimensionality: 768,
      }),
    },
  );

  const latencyMs = Date.now() - startTime;

  if (!response.ok) {
    const error = await response.text();
    if (traceCtx?.supabase) {
      const promptTokens = estimateTokens(text);
      insertTrace(traceCtx.supabase, {
        tenant_id: traceCtx.tenant_id,
        call_type: 'embedding',
        model, provider: 'google',
        prompt_tokens: promptTokens, completion_tokens: 0,
        latency_ms: latencyMs,
        cost_usd: 0, success: false,
        error_message: `API error ${response.status}`,
      });
    }
    throw new Error(`Gemini Embedding API error (${response.status}): ${error}`);
  }

  const data = await response.json();

  if (traceCtx?.supabase) {
    const promptTokens = estimateTokens(text);
    insertTrace(traceCtx.supabase, {
      tenant_id: traceCtx.tenant_id,
      call_type: 'embedding',
      model, provider: 'google',
      prompt_tokens: promptTokens, completion_tokens: 0,
      latency_ms: latencyMs,
      cost_usd: 0, success: true,
    });
  }

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
    // Fix E (v2): Gate — rejeitar busca se qualificação mínima não atingida.
    // Regra: OBRIGATÓRIO ter pelo menos BAIRRO ou BUDGET do cliente.
    // Interesse (compra/locação) sozinho NÃO é suficiente para disparar busca.
    // Isso impede que o LLM dispare busca prematura sem critérios reais do cliente.
    const hasBairro = !!(args.bairro || ctx.qualificationData?.detected_neighborhood);
    const hasBudget = !!(args.preco_max || ctx.qualificationData?.detected_budget_max);
    if (!hasBairro && !hasBudget) {
      console.log(`🚫 [PropertySearch] Rejeitado: sem bairro (${hasBairro}) nem budget (${hasBudget}). Args: bairro=${args.bairro}, preco_max=${args.preco_max}`);
      return '[SISTEMA] Busca de imóveis bloqueada: o cliente ainda não informou bairro/região NEM faixa de orçamento. Antes de buscar, pergunte ao cliente pelo menos: qual bairro ou região de interesse e/ou qual faixa de orçamento. Conduza a qualificação de forma natural e empática. NÃO chame buscar_imoveis novamente até ter pelo menos um desses dados.';
    }

    // If qualification detected 'ambos', override LLM's finalidade to avoid biased search
    const qualInterest = ctx.qualificationData?.detected_interest;
    const effectiveFinalidade = qualInterest === 'ambos' ? 'ambos' : (args.finalidade || qualInterest || ctx.department || 'locacao');
    const semanticFinalidade = effectiveFinalidade === 'ambos' ? 'venda ou locação' : effectiveFinalidade;
    const semanticQuery = args.query_semantica
      ? (qualInterest === 'ambos' && !args.query_semantica.includes('venda')
        ? args.query_semantica.replace(/para (locação|locacao|venda)/i, 'para venda ou locação')
        : args.query_semantica)
      : `Imóvel para ${semanticFinalidade}`;

    // C1: Aplicar margem de 30% acima do orçamento informado pelo cliente
    // "O cliente pediu 1 milhão, mandamos de 1M até 1.3M" — regra de negociação imobiliária
    // FALLBACK: Se o LLM não passou preco_max, usar o orçamento já extraído da qualificação
    const clientBudget = args.preco_max
      || (ctx.qualificationData?.detected_budget_max ? Number(ctx.qualificationData.detected_budget_max) : null);
    const searchBudget = clientBudget ? Math.round(clientBudget * 1.3) : null;

    // Resolve finalidade_imovel: map venda/locação to RESIDENCIAL/COMERCIAL when specified
    const filterFinalidade = args.finalidade_imovel || null; // RESIDENCIAL, COMERCIAL, or null

    // SAFETY NET: Se o LLM não preencheu bairro mas o query_semantica menciona um bairro, extrair
    if (!args.bairro && semanticQuery) {
      const knownNeighborhoods = [
        'Santa Mônica', 'Santa Monica', 'Agronômica', 'Centro', 'Itacorubi', 'Trindade',
        'Córrego Grande', 'Corrego Grande', 'João Paulo', 'Joao Paulo', 'Saco Grande',
        'Saco dos Limões', 'Saco dos Limoes', 'Pantanal', 'Carvoeira', 'Coqueiros',
        'Estreito', 'Capoeiras', 'Kobrasol', 'Campinas', 'Barreiros', 'Ingleses',
        'Canasvieiras', 'Jurerê', 'Jurere', 'Jurerê Internacional', 'Campeche',
        'Lagoa da Conceição', 'Lagoa da Conceicao', 'Cachoeira do Bom Jesus',
        'Cacupé', 'Cacupe', 'Ratones', 'Santo Antônio de Lisboa', 'Ribeirão da Ilha',
        'Praia Brava', 'Santinho', 'São João do Rio Vermelho', 'Pedra Branca',
        'Forquilhas', 'Barra da Lagoa', 'Rio Tavares', 'Morro das Pedras',
      ];
      const queryLower = semanticQuery.toLowerCase();
      for (const nh of knownNeighborhoods) {
        if (queryLower.includes(nh.toLowerCase())) {
          args.bairro = nh;
          console.log(`🔧 SAFETY NET: Bairro extraído do query_semantica → "${nh}"`);
          break;
        }
      }
    }

    // FALLBACK: Se LLM não preencheu bairro/quartos, usar dados da qualificação
    if (!args.bairro && ctx.qualificationData?.detected_neighborhood) {
      args.bairro = ctx.qualificationData.detected_neighborhood;
      console.log(`🔧 FALLBACK: Bairro da qualificação → "${args.bairro}"`);
    }
    if (!args.quartos && ctx.qualificationData?.detected_bedrooms) {
      args.quartos = Number(ctx.qualificationData.detected_bedrooms);
      console.log(`🔧 FALLBACK: Quartos da qualificação → ${args.quartos}`);
    }
    // FALLBACK TIPO: Se nem LLM nem qualificação definiram tipo, defaultar para Apartamentos
    // (terreno é nicho raro — apartamento é o mais procurado)
    if (!args.tipo_imovel && ctx.qualificationData?.detected_property_type) {
      args.tipo_imovel = ctx.qualificationData.detected_property_type;
      console.log(`🔧 FALLBACK: Tipo da qualificação → "${args.tipo_imovel}"`);
    }
    if (!args.tipo_imovel) {
      args.tipo_imovel = 'Apartamentos';
      console.log(`🔧 DEFAULT: Tipo não informado → defaultando para "Apartamentos"`);
    }

    console.log(`🔍 Buscando imóveis via vector search para: "${semanticQuery}" | Bairro: ${args.bairro || 'NENHUM'} | Tipo: ${args.tipo_imovel || 'NENHUM'} | Quartos: ${args.quartos || 'NENHUM'} | Finalidade: ${filterFinalidade || 'NENHUM'} | Budget cliente: ${clientBudget} → Busca: ${searchBudget}`);

    // Bug fix: args.finalidade vem do LLM como 'venda'/'locacao' (transação), mas o filter_finalidade
    // do RPC espera o mesmo formato. O nome confuso `finalidade_imovel` mistura com tipo de uso.
    // Usa effectiveFinalidade que sempre tem o valor correto (venda/locacao).
    const rpcFinalidade = (effectiveFinalidade === 'venda' || effectiveFinalidade === 'locacao') ? effectiveFinalidade : null;

    // Filtro de financiamento (28/04, caso Daniela): se o cliente sinalizou
    // financiamento (entrada, FGTS, ou flag explícita), só busca imóveis que
    // aceitam (NULL passa — conservador). Imóveis "NÃO ACEITA FINANCIAMENTO"
    // ficam fora pra evitar mostrar opção impossível pro perfil do cliente.
    const qualNeedsFin = ctx.qualificationData?.detected_needs_financing === true;
    const qualHasEntrada = !!ctx.qualificationData?.detected_down_payment;
    const filterNeedsFinancing = (qualNeedsFin || qualHasEntrada) ? true : null;

    // Tenta busca semântica via embedding. Se falhar (cap estourado, timeout, etc),
    // ou retornar vazio, cai no fallback SQL puro (filtros estruturados sem similarity).
    let properties: any[] | null = null;
    let error: any = null;
    let usedFallback = false;

    try {
      const queryEmbedding = await generateEmbedding(semanticQuery);
      const result = await ctx.supabase.rpc('match_properties', {
        query_embedding: queryEmbedding,
        match_tenant_id: ctx.tenantId,
        match_threshold: 0.05,
        match_count: 5,
        filter_max_price: searchBudget,
        filter_tipo: args.tipo_imovel || null,
        filter_neighborhood: args.bairro || null,
        filter_bedrooms: args.quartos || null,
        filter_finalidade: rpcFinalidade,
        filter_needs_financing: filterNeedsFinancing,
      });
      properties = result.data;
      error = result.error;
    } catch (embErr) {
      console.warn(`⚠️ Embedding falhou, usando fallback SQL puro: ${embErr}`);
      usedFallback = true;
      const fallbackResult = await ctx.supabase.rpc('match_properties_no_embedding', {
        match_tenant_id: ctx.tenantId,
        match_count: 5,
        filter_max_price: searchBudget,
        filter_tipo: args.tipo_imovel || null,
        filter_neighborhood: args.bairro || null,
        filter_bedrooms: args.quartos || null,
        filter_finalidade: rpcFinalidade,
        filter_needs_financing: filterNeedsFinancing,
      });
      properties = fallbackResult.data;
      error = fallbackResult.error;
    }

    // Se RPC vetorial voltou vazia mas embedding rodou, tenta fallback SQL antes de desistir
    if (!error && (!properties || properties.length === 0) && !usedFallback) {
      console.log('🔄 RPC vetorial voltou vazia, tentando fallback SQL puro');
      usedFallback = true;
      const fallbackResult = await ctx.supabase.rpc('match_properties_no_embedding', {
        match_tenant_id: ctx.tenantId,
        match_count: 5,
        filter_max_price: searchBudget,
        filter_tipo: args.tipo_imovel || null,
        filter_neighborhood: args.bairro || null,
        filter_bedrooms: args.quartos || null,
        filter_finalidade: rpcFinalidade,
        filter_needs_financing: filterNeedsFinancing,
      });
      properties = fallbackResult.data;
      error = fallbackResult.error;
    }

    console.log(`🔍 Property search ${usedFallback ? '(SQL fallback)' : '(vector)'} retornou ${properties?.length || 0} | finalidade=${rpcFinalidade} | bairro=${args.bairro} | quartos=${args.quartos} | budget=${searchBudget}`);

    if (error) {
      console.error('❌ Property search error:', error);
      return 'Não consegui buscar imóveis no nosso catálogo inteligente no momento. Tente novamente em instantes.';
    }

    // C2: Filtrar imóveis sem preço válido — "sob consulta" não existe no sistema
    let validProperties = (properties || []).filter((p: any) => p.price && p.price > 1);

    // C8: Pós-filtro hard — rejeitar imóveis acima do budget + 15% tolerância
    if (clientBudget && clientBudget > 0) {
      const hardCeiling = Math.round(clientBudget * 1.15);
      const beforeCount = validProperties.length;
      validProperties = validProperties.filter((p: any) => p.price <= hardCeiling);
      if (beforeCount !== validProperties.length) {
        console.log(`🔒 C8: Pós-filtro budget removeu ${beforeCount - validProperties.length} imóvel(is) acima de ${hardCeiling}`);
      }
    }

    // C10: Pós-filtro piso de preço — evitar mostrar imóveis muito abaixo do budget
    // Cliente com R$4M não quer ver imóvel de R$1M. Piso = 40% do budget.
    // Sanity: caso Daniela 28/04 — qualifier corrompido gravou budget=40M (na verdade
    // R$40k de entrada). Acima de R$ 30M é budget impossível em FLN: ignora o piso.
    const budgetIsSane = clientBudget && clientBudget >= 200000 && clientBudget <= 30_000_000;
    if (budgetIsSane) {
      const priceFloor = Math.round(clientBudget * 0.4);
      const beforeCount = validProperties.length;
      validProperties = validProperties.filter((p: any) => p.price >= priceFloor);
      if (beforeCount !== validProperties.length) {
        console.log(`🔒 C10: Piso de preço removeu ${beforeCount - validProperties.length} imóvel(is) abaixo de ${priceFloor} (budget=${clientBudget})`);
      }
    } else if (clientBudget && clientBudget > 30_000_000) {
      console.warn(`⚠️ C10 SANITY: budget=${clientBudget} acima de R$30M — provável corrupção do qualifier, ignorando piso de preço`);
    }

    // C9: Pós-filtro finalidade — se cliente quer comprar, remover prováveis aluguéis (preço < 50k)
    // Pós-filtro por finalidade — agora usa coluna estruturada `finalidade` (vinda da RPC)
    // em vez da heurística antiga `price < 50k` (que falhava em locações de alto padrão).
    // Para tenants com `min_rental_budget` configurado, também aplica o piso comercial aqui.
    const clientFinalidade = effectiveFinalidade;
    if (clientFinalidade && clientFinalidade !== 'ambos') {
      const beforeCount = validProperties.length;
      if (clientFinalidade === 'venda') {
        validProperties = validProperties.filter((p: any) => !p.finalidade || p.finalidade === 'venda' || p.finalidade === 'ambos');
      } else if (clientFinalidade === 'locacao') {
        validProperties = validProperties.filter((p: any) => p.finalidade === 'locacao' || p.finalidade === 'ambos' || (!p.finalidade && Number(p.price) < 50000));
        // Aplica piso de locação se configurado no tenant
        const minRental = (ctx.tenant as any)?.min_rental_budget;
        if (minRental && Number(minRental) > 0) {
          validProperties = validProperties.filter((p: any) => Number(p.price) >= Number(minRental));
        }
      }
      if (beforeCount !== validProperties.length) {
        console.log(`🔒 C9: Pós-filtro finalidade (${clientFinalidade}) removeu ${beforeCount - validProperties.length} imóvel(is) incompatível(is)`);
      }
    }

    // C9b: Pivot inteligente para interest=ambos — quando só uma finalidade tem resultados,
    // sinalizar qual tem e qual não tem para o hint guiar a resposta.
    let pivotNotice = '';
    if (clientFinalidade === 'ambos' && validProperties.length > 0) {
      const vendaProps = validProperties.filter((p: any) => p.finalidade === 'venda' || p.finalidade === 'ambos' || (!p.finalidade && Number(p.price) >= 50000));
      const locacaoProps = validProperties.filter((p: any) => p.finalidade === 'locacao' || p.finalidade === 'ambos' || (!p.finalidade && Number(p.price) < 50000));
      if (vendaProps.length > 0 && locacaoProps.length === 0) {
        pivotNotice = `\n\n⚠️ PIVOT OBRIGATÓRIO: O cliente pediu compra E locação, mas no ${args.bairro || 'bairro solicitado'} só encontramos opções para COMPRA. Você DEVE informar isso de forma natural e empática. Exemplo: "Devido à alta demanda, não temos apartamentos para locação no ${args.bairro || 'bairro'} nesse momento, mas como você também se interessa por compra, separei uma ótima opção!" NÃO pule essa explicação. Depois apresente o imóvel de venda. Se o cliente insistir que quer locação, sugira bairros vizinhos com disponibilidade (ex: Rio Tavares, Lagoa da Conceição, Ribeirão da Ilha).`;
        // Keep only venda properties
        validProperties = vendaProps;
      } else if (locacaoProps.length > 0 && vendaProps.length === 0) {
        pivotNotice = `\n\n⚠️ PIVOT OBRIGATÓRIO: O cliente pediu compra E locação, mas no ${args.bairro || 'bairro solicitado'} só encontramos opções para LOCAÇÃO. Você DEVE informar isso de forma natural e empática. Exemplo: "Para compra no ${args.bairro || 'bairro'} não temos disponibilidade no momento, mas encontrei ótimas opções de aluguel!" NÃO pule essa explicação. Depois apresente o imóvel de locação. Se o cliente insistir que quer compra, sugira bairros vizinhos com disponibilidade.`;
        validProperties = locacaoProps;
      }
      // If both have results, no pivot needed — show mix
    }

    // C6: Expansão inteligente quando poucos resultados
    if (validProperties.length <= 1 && args.bairro) {
      console.log(`🌍 C6: Apenas ${validProperties.length} resultado(s) no ${args.bairro}. Tentando flexibilizar...`);

      // PASSO 1: Tentar MESMO bairro sem filtro de tipo (ex: cliente quer apt no Santa Mônica, mas só tem casas)
      const flexQuery = `imóvel para ${semanticFinalidade} no bairro ${args.bairro}, ${ctx.tenant.city}`;
      const flexEmbedding = await generateEmbedding(flexQuery);
      const { data: flexProps } = await ctx.supabase.rpc('match_properties', {
        query_embedding: flexEmbedding,
        match_tenant_id: ctx.tenantId,
        match_threshold: 0.15,
        match_count: 5,
        filter_max_price: searchBudget,
        filter_tipo: null, // Remove filtro de tipo, mantém bairro
        filter_neighborhood: args.bairro,
        filter_bedrooms: args.quartos || null,
        filter_finalidade: filterFinalidade,
        filter_needs_financing: filterNeedsFinancing,
      });
      const flexValid = (flexProps || []).filter((p: any) => p.price && p.price > 1);

      if (flexValid.length > 0) {
        // C6 ASK-FIRST: só perguntar quando o tipo encontrado é GENUINAMENTE diferente
        // do que o cliente pediu. Se flexValid contém o mesmo tipo (caso comum: filtro
        // estrutural barrou por algum motivo, mas a busca larga acha o tipo certo),
        // mandar direto — fluxo normal de envio. Caso Daniela 28/04: cliente pediu
        // apartamento, flex achou apartamentos, mas o ASK-FIRST disparava e ainda
        // forçava Helena a parafrasear "encontrei apts... quer que eu te mostre?".
        const tiposEncontrados = [...new Set(flexValid.map((p: any) => p.type || 'imóvel'))];
        const tipoSolicitado = (args.tipo_imovel || '').toLowerCase().trim();
        const tipoSolicitadoSingular = tipoSolicitado.replace(/s$/, '');
        const tipoBate = !!tipoSolicitado && tiposEncontrados.some((t: string) => {
          const tn = String(t || '').toLowerCase();
          return tn.includes(tipoSolicitadoSingular) || tipoSolicitadoSingular.includes(tn);
        });
        if (tipoBate) {
          console.log(`🌍 C6 type-match: flex achou tipo solicitado "${args.tipo_imovel}" — promove flexValid pra fluxo normal de envio`);
          validProperties = flexValid;
          // cai pro fluxo normal abaixo (formattedProperties + envio)
        } else {
          // Tipo realmente diferente — PERGUNTAR antes de mostrar
          const tiposStr = tiposEncontrados.join(', ');
          const faixaPrecos = flexValid.map((p: any) => p.price).filter(Boolean);
          const precoMin = Math.min(...faixaPrecos);
          const precoMax = Math.max(...faixaPrecos);
          const faixaStr = precoMin === precoMax
            ? `por ${formatCurrency(precoMin)}`
            : `de ${formatCurrency(precoMin)} a ${formatCurrency(precoMax)}`;
          console.log(`🌍 C6: Encontrou ${flexValid.length} imóvel(is) no ${args.bairro} mas tipo diferente: ${tiposStr}. Perguntando ao cliente antes de expandir.`);
          return `[SISTEMA — INSTRUÇÃO OBRIGATÓRIA] Não encontramos ${args.tipo_imovel || 'apartamento'} disponível no ${args.bairro} neste momento. Porém, temos ${flexValid.length} opção(ões) de ${tiposStr} no mesmo bairro (${faixaStr}). Você DEVE:\n1. Informar que não tem ${args.tipo_imovel || 'apartamento'} disponível no ${args.bairro}\n2. Dizer que encontrou ${tiposStr} na mesma região\n3. PERGUNTAR se o cliente quer ver essas opções ou prefere buscar ${args.tipo_imovel || 'apartamento'} em outro bairro\n\nExemplo: "No ${args.bairro} não encontrei ${args.tipo_imovel || 'apartamento'} disponível no momento, mas temos ${tiposStr} na região (${faixaStr}). Quer que eu te mostre, ou prefere que eu busque ${args.tipo_imovel || 'apartamento'} em outro bairro?"\n\nNÃO envie imóvel sem autorização. NÃO diga "vou buscar" — a busca já foi feita.`;
        }
      } else {
        // PASSO 2: Nada no bairro pedido — informar DIRETAMENTE e NÃO expandir silenciosamente
        console.log(`🌍 C6: Nenhum imóvel no ${args.bairro} com budget ${searchBudget}. Informando o cliente.`);
        const budgetStr = clientBudget ? ` com orçamento de até R$ ${clientBudget.toLocaleString('pt-BR')}` : '';
        return `[SISTEMA — INSTRUÇÃO OBRIGATÓRIA] Não existe nenhum imóvel para ${semanticFinalidade} no bairro ${args.bairro}${budgetStr} no nosso catálogo atual. Você DEVE informar isso ao cliente de forma direta e honesta. Diga claramente que não tem disponibilidade no bairro pedido. Depois sugira alternativas: bairros vizinhos, ajustar orçamento, ou outro tipo de imóvel. NUNCA diga "vou buscar" ou "deixa eu procurar" — a busca já foi feita e não encontrou. NUNCA envie imóveis de outro bairro sem autorização explícita do cliente.`;
      }
    } else if (validProperties.length <= 1 && !args.bairro) {
      // Sem bairro especificado: expansão geográfica normal
      console.log(`🌍 C6: Apenas ${validProperties.length} resultado(s) sem bairro definido. Expandindo...`);
      const expandedQuery = args.tipo_imovel
        ? `${args.tipo_imovel} para ${semanticFinalidade} em ${ctx.tenant.city}`
        : `imóvel para ${semanticFinalidade} em ${ctx.tenant.city}`;
      const expandedEmbedding = await generateEmbedding(expandedQuery);
      const { data: expandedProps } = await ctx.supabase.rpc('match_properties', {
        query_embedding: expandedEmbedding,
        match_tenant_id: ctx.tenantId,
        match_threshold: 0.15,
        match_count: 5,
        filter_max_price: searchBudget,
        filter_tipo: args.tipo_imovel || null,
        filter_neighborhood: null,
        filter_bedrooms: args.quartos || null,
        filter_finalidade: filterFinalidade,
        filter_needs_financing: filterNeedsFinancing,
      });
      const expandedValid = (expandedProps || []).filter((p: any) => p.price && p.price > 1);
      const originalIds = new Set(validProperties.map((p: any) => p.external_id));
      const newExpanded = expandedValid.filter((p: any) => !originalIds.has(p.external_id));

      if ([...validProperties, ...newExpanded].length === 0) {
        return 'Não encontrei imóveis disponíveis com esses critérios no momento. Quer que eu ajuste a faixa de preço ou o tipo de imóvel?';
      }
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
      preco_formatado: p.price ? formatCurrency(p.price) : null,
      quartos: p.bedrooms,
      suites: p.suites || null,
      vagas: p.parking_spots || p.vagas || null,
      area_util: p.useful_area || p.area_util || null,
      link: p.url || (websiteBase && p.external_id ? `${websiteBase}/imovel/${p.external_id}` : ''),
      foto_destaque: p.images && p.images.length > 0 ? p.images[0] : null,
      descricao: p.description,
      valor_condominio: p.condo_fee || null,
      accepts_financing: p.accepts_financing,
    }));

    // Filter out properties already shown to this lead — inclui cross-conversation
    // (contacts.shown_property_codes), não só a conversa atual.
    const shownIds = await getShownPropertyCodes(ctx);
    let formattedProperties = allFormattedProperties.filter(p => !shownIds.has(p.codigo));

    // Auto-expansão dedup-empty (28/04, caso Daniela): cliente C2S tinha
    // crm_property_ref=[56957] (único 2BR Estreito ≤ 600k). Filtro de já-mostrados
    // zerou tudo. Antes a Aimee só pedia "quer que eu amplie?" devolvendo trabalho
    // pro cliente. Agora tenta uma rodada com filter_neighborhood=null antes de
    // desistir, mantendo type/bedrooms/budget/financing.
    if (formattedProperties.length === 0 && args.bairro) {
      console.log(`🔄 Dedup-empty auto-expansão: ${shownIds.size} já mostrados em ${args.bairro}, tentando cidade toda`);
      const expandedQuery = args.tipo_imovel
        ? `${args.tipo_imovel} para ${semanticFinalidade} em ${ctx.tenant.city}`
        : `imóvel para ${semanticFinalidade} em ${ctx.tenant.city}`;
      try {
        const expEmbedding = await generateEmbedding(expandedQuery);
        const { data: expProps } = await ctx.supabase.rpc('match_properties', {
          query_embedding: expEmbedding,
          match_tenant_id: ctx.tenantId,
          match_threshold: 0.10,
          match_count: 8,
          filter_max_price: searchBudget,
          filter_tipo: args.tipo_imovel || null,
          filter_neighborhood: null,
          filter_bedrooms: args.quartos || null,
          filter_finalidade: rpcFinalidade,
          filter_needs_financing: filterNeedsFinancing,
        });
        let expValid = (expProps || []).filter((p: any) => p.price && p.price > 1);
        // Aplica os mesmos pós-filtros C8 (teto budget) e C10 (piso 40%) usados
        // na busca principal pra coerência.
        if (clientBudget && clientBudget > 0) {
          const hardCeiling = Math.round(clientBudget * 1.15);
          expValid = expValid.filter((p: any) => p.price <= hardCeiling);
        }
        if (budgetIsSane) {
          const priceFloor = Math.round(clientBudget! * 0.4);
          expValid = expValid.filter((p: any) => p.price >= priceFloor);
        }
        // Pós-filtro finalidade (mesma regra C9 abreviada)
        if (rpcFinalidade === 'venda') {
          expValid = expValid.filter((p: any) => !p.finalidade || p.finalidade === 'venda' || p.finalidade === 'ambos');
        } else if (rpcFinalidade === 'locacao') {
          expValid = expValid.filter((p: any) => p.finalidade === 'locacao' || p.finalidade === 'ambos');
        }
        const expFormatted: PropertyResult[] = expValid.map((p: any) => ({
          codigo: p.external_id,
          tipo: p.type || 'Imóvel',
          bairro: p.neighborhood || 'Região',
          cidade: p.city || ctx.tenant.city,
          preco: p.price,
          preco_formatado: p.price ? formatCurrency(p.price) : null,
          quartos: p.bedrooms,
          suites: p.suites || null,
          vagas: p.parking_spots || p.vagas || null,
          area_util: p.useful_area || p.area_util || null,
          link: p.url || (websiteBase && p.external_id ? `${websiteBase}/imovel/${p.external_id}` : ''),
          foto_destaque: p.images && p.images.length > 0 ? p.images[0] : null,
          descricao: p.description,
          valor_condominio: p.condo_fee || null,
          accepts_financing: p.accepts_financing,
        })).filter((p: PropertyResult) => !shownIds.has(p.codigo));

        if (expFormatted.length > 0) {
          console.log(`🌍 Dedup-empty auto-expansão achou ${expFormatted.length} novas opções fora de ${args.bairro}`);
          (args as any)._previously_shown_in_bairro = args.bairro;
          formattedProperties = expFormatted;
        }
      } catch (expErr) {
        console.warn('⚠️ Auto-expansão dedup-empty falhou:', (expErr as Error).message);
      }
    }

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
        shown_property_ids: [...Array.from(shownIds)],
        last_search_params: { semantic_query: semanticQuery, ...args },
        updated_at: new Date().toISOString(),
      }, { onConflict: 'tenant_id,phone_number' });

    // C5: Enviar UM imóvel por vez com foto + caption rico + contexto de geolocalização
    const agentName = (ctx.aiConfig as any).agent_name || 'Aimee';
    const { sendWhatsAppMessage: sendMsg } = await import('../whatsapp.ts');
    const prop = formattedProperties[0];

    // Construir contexto RICO do que o cliente busca — combina args da busca + qualificação completa
    const qual = ctx.qualificationData || {};
    const clientNeeds = [
      args.finalidade || qual.detected_interest ? `Finalidade: ${args.finalidade || (qual.detected_interest === 'ambos' ? 'venda e locação' : qual.detected_interest === 'locacao' ? 'locação' : 'venda')}` : null,
      args.tipo_imovel || qual.detected_property_type ? `Tipo desejado: ${args.tipo_imovel || qual.detected_property_type}` : null,
      args.bairro || qual.detected_neighborhood ? `Bairro que o cliente pediu: ${args.bairro || qual.detected_neighborhood}` : null,
      args.quartos || qual.detected_bedrooms ? `Quartos: ${args.quartos || qual.detected_bedrooms}` : null,
      clientBudget || qual.detected_budget_max ? `Orçamento do cliente: até ${formatCurrency(clientBudget || Number(qual.detected_budget_max))}` : null,
      qual.detected_timeline ? `Prazo: ${qual.detected_timeline}` : null,
      ctx.contactName && ctx.contactName !== 'Cliente' ? `Nome do cliente: ${ctx.contactName}` : null,
    ].filter(Boolean).join(', ');

    // Buscar pontos de interesse: primeiro tenta cache (google_pois), fallback pra API
    let nearbyPlacesText = '';
    try {
      const { data: propData } = await ctx.supabase
        .from('properties')
        .select('latitude, longitude, raw_data')
        .eq('tenant_id', ctx.tenantId)
        .eq('external_id', prop.codigo)
        .maybeSingle();

      const cachedPois = propData?.raw_data?.google_pois as any[] | undefined;

      if (cachedPois && cachedPois.length > 0) {
        // Usar POIs pré-computados (instantâneo, sem chamada à API)
        const uniqueTypes = new Set<string>();
        const selected: any[] = [];
        for (const poi of cachedPois) {
          if (!uniqueTypes.has(poi.type) && selected.length < 3) {
            uniqueTypes.add(poi.type);
            const distStr = poi.distance_m > 1000
              ? `${(poi.distance_m / 1000).toFixed(1)}km`
              : `${poi.distance_m}m`;
            selected.push(`${poi.name} a ${distStr}`);
          }
        }
        nearbyPlacesText = selected.join('; ');
      } else if (propData?.latitude && propData?.longitude) {
        // Fallback: chamada à API Google (imóvel sem cache)
        const poiTypes = ['supermarket', 'school', 'restaurant'];
        const allPlaces: string[] = [];
        for (const poiType of poiTypes) {
          try {
            const { data: poiData } = await ctx.supabase.functions.invoke('get-nearby-places', {
              body: {
                latitude: propData.latitude,
                longitude: propData.longitude,
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
      console.warn('⚠️ POI enrichment failed, proceeding without:', (geoErr as Error).message);
    }

    const aiCaption = await generatePropertyCaption(prop, agentName, clientNeeds, nearbyPlacesText, { supabase: ctx.supabase, tenant_id: ctx.tenantId, conversation_id: ctx.conversationId });
    const rawCaption = prop.link ? `${aiCaption}\n\n${prop.link}` : aiCaption;
    const caption = `*${agentName}*\n\n${rawCaption}`;

    // Store generated caption on the property for the frontend card
    prop.caption = aiCaption;

    let sentCount = 0;
    const isSimulation = ctx.phoneNumber.startsWith('SIM-');

    if (isSimulation) {
      // In simulation mode, skip WhatsApp sending — simulate success
      sentCount = 1;
      console.log(`📤 SIM: Skipping WhatsApp send for property ${prop.codigo} (simulation mode)`);
    } else if (prop.foto_destaque) {
      const imgResult = await sendWhatsAppImage(ctx.phoneNumber, prop.foto_destaque, caption, ctx.tenant);
      if (imgResult.success) {
        sentCount = 1;
        // Caso Clelia 25/04: card ia pro WhatsApp do cliente mas sumia do painel —
        // sendWhatsAppImage não persiste, então o operador via só a 2ª mensagem do LLM
        // sem foto/link. Mesmo padrão do executePropertyByCode (mais abaixo).
        await saveOutboundMessage(
          ctx.supabase, ctx.tenantId, ctx.conversationId, ctx.phoneNumber,
          caption, imgResult.messageId, 'vendas', 'image', prop.foto_destaque,
        );
      } else {
        console.warn(`⚠️ Image send failed for property ${prop.codigo}, falling back to text`);
        const textResult = await sendMsg(ctx.phoneNumber, caption, ctx.tenant);
        sentCount = textResult?.success ? 1 : 0;
        if (sentCount > 0) {
          await saveOutboundMessage(
            ctx.supabase, ctx.tenantId, ctx.conversationId, ctx.phoneNumber,
            caption, textResult?.messageId, 'vendas',
          );
        }
      }
    } else {
      const textResult = await sendMsg(ctx.phoneNumber, caption, ctx.tenant);
      sentCount = textResult?.success ? 1 : 0;
      if (sentCount > 0) {
        await saveOutboundMessage(
          ctx.supabase, ctx.tenantId, ctx.conversationId, ctx.phoneNumber,
          caption, textResult?.messageId, 'vendas',
        );
      }
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

      // Cross-conversation: persiste no contact pra não repetir em rewarm futuro
      if (prop.codigo) await recordShownProperty(ctx, prop.codigo);
    }

    // C5: Persist lead qualification data — MERGE with existing data, never overwrite with null.
    // IMPORTANT: Only use tool args if they match what was already extracted from conversation text.
    // Do NOT blindly trust Gemini's tool call args — they may be hallucinated.
    // The authoritative qualification data comes from extractQualificationFromText(), stored in ctx.qualificationData.
    const { data: existingQual } = await ctx.supabase
      .from('lead_qualification')
      .select('*')
      .eq('tenant_id', ctx.tenantId)
      .eq('phone_number', ctx.phoneNumber)
      .maybeSingle();

    // Use existing extracted qualification data as the source of truth, NOT tool call args
    const safeQual = ctx.qualificationData || existingQual || {};

    // Bug: usar clientBudget como fallback persistia args.preco_max hallucinado pelo LLM
    // como detected_budget_max permanente. Hoje confiamos APENAS no que veio do extractor
    // (regex em qualification.ts), nunca em args do LLM. Se safeQual.detected_budget_max
    // for null, mantém null — vai ser preenchido quando o cliente realmente disser.
    await ctx.supabase
      .from('lead_qualification')
      .upsert({
        tenant_id: ctx.tenantId,
        phone_number: ctx.phoneNumber,
        detected_property_type: safeQual.detected_property_type || null,
        detected_budget_max: safeQual.detected_budget_max || null,
        detected_interest: safeQual.detected_interest || null,
        detected_neighborhood: safeQual.detected_neighborhood || null,
        detected_bedrooms: safeQual.detected_bedrooms || null,
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
    // Stress test 25/04 (Mario T7): cliente pediu até R$ 6 mil, Aimee mostrou R$ 6.500
    // sem mencionar overshoot. Se imóvel está acima do teto (mas dentro da tolerância C8 15%),
    // instrui Aimee a ser TRANSPARENTE: "está um pouquinho acima do que você queria, mas..."
    const overshootNotice = (clientBudget && Number(sentProp.preco) > clientBudget)
      ? `\n\n⚠️ TRANSPARÊNCIA OBRIGATÓRIA: Este imóvel custa ${sentProp.preco_formatado || formatCurrency(sentProp.preco)}, que está ${Math.round(((Number(sentProp.preco) - clientBudget) / clientBudget) * 100)}% acima do teto que o cliente mencionou (${formatCurrency(clientBudget)}). Você DEVE mencionar isso na apresentação de forma honesta e empática. Sugestão: "Esse fica um pouquinho acima do teto que você mencionou (${sentProp.preco_formatado || formatCurrency(sentProp.preco)} vs. ${formatCurrency(clientBudget)}), mas vale a pena ver porque [diferencial concreto]". NUNCA omita o overshoot — cliente sente quando é enrolado.`
      : '';
    // Inform if the type was expanded (e.g., client wanted apt but only houses exist in that neighborhood)
    const tipoExpandidoNotice = (args as any)._tipo_expandido
      ? `\n\n⚠️ AVISO IMPORTANTE: O cliente pediu "${args.tipo_imovel || 'imóvel'}" no ${args.bairro}, mas não encontramos esse tipo lá. Encontramos ${(args as any)._tipos_encontrados} no bairro. Você DEVE informar o cliente dessa situação ANTES de apresentar o imóvel. Exemplo: "No Santa Mônica não encontrei apartamentos disponíveis, mas achei uma casa de 3 quartos por R$ 850 mil que pode funcionar pra você. O que acha?"`
      : '';
    // Financiamento (28/04, caso Daniela): se o cliente sinalizou que precisa
    // financiar, mencionar explicitamente que o imóvel aceita financiamento dá
    // segurança e elimina dúvida. Filtro já excluiu os "NÃO ACEITA"; resta
    // confirmar quando há sinal positivo e silenciar quando é null.
    const finNotice = ((qualNeedsFin || qualHasEntrada) && (sentProp as any).accepts_financing === true)
      ? `\n\n💳 FINANCIAMENTO: O cliente sinalizou que precisa financiar. Este imóvel aceita financiamento bancário — mencione isso na apresentação (1 frase curta, ex: "esse aceita financiamento, dá pra usar seu FGTS / parcelar").`
      : '';
    // Expansão transparente (28/04, caso Daniela): a busca no bairro original do
    // cliente esgotou todas as opções já mostradas anteriormente (inclui histórico
    // C2S via crm_property_ref). Auto-expansão pegou imóvel em outro bairro.
    // Helena precisa reconhecer o esgotamento e ser transparente sobre a expansão.
    const expansionNotice = (args as any)._previously_shown_in_bairro
      ? `\n\n🔄 EXPANSÃO TRANSPARENTE (OBRIGATÓRIO MENCIONAR): Você JÁ TINHA mostrado todas as opções do bairro ${(args as any)._previously_shown_in_bairro} que cabiam no perfil deste cliente em atendimentos anteriores. Esta nova opção em ${sentProp.bairro} foi encontrada após ampliar a busca pra outras regiões da cidade. Você DEVE: 1. Reconhecer que as opções no ${(args as any)._previously_shown_in_bairro} se esgotaram pra esse perfil. 2. Mencionar que ampliou a busca pra outras regiões. 3. Apresentar essa nova opção em ${sentProp.bairro}. Exemplo: "No ${(args as any)._previously_shown_in_bairro} as opções no seu perfil que tínhamos disponíveis você já viu. Ampliei pra outras regiões da cidade e encontrei esse aqui em ${sentProp.bairro} — [dados]." NÃO finja que é primeira busca. NÃO peça desculpa explicitamente — só seja transparente sobre a expansão.`
      : '';
    // Build client profile context for personalization
    const clientProfile = [
      args.finalidade ? `Finalidade: ${args.finalidade}` : null,
      args.tipo_imovel ? `Busca: ${args.tipo_imovel}` : null,
      args.bairro ? `Bairro desejado: ${args.bairro}` : null,
      args.quartos ? `Quartos: ${args.quartos}` : null,
    ].filter(Boolean).join(', ');
    const singularPlural = sentCount === 1
      ? `Use SINGULAR ("esse imóvel", "essa opção"). NÃO pergunte "qual das opções" — só há 1 imóvel. Confirme se o cliente gostou DESTE imóvel específico.`
      : `O cliente recebeu ${sentCount} opções. Pode perguntar qual chamou mais atenção.`;
    const poiHint = nearbyPlacesText
      ? `\n\nPONTOS DE REFERÊNCIA PRÓXIMOS: ${nearbyPlacesText}`
      : '';
    const poiRule = nearbyPlacesText
      ? `\n3. OBRIGATÓRIO mencionar pelo menos 1 ponto de referência próximo para posicionar o imóvel (use os dados de PONTOS DE REFERÊNCIA). Ex: "Fica pertinho do ${nearbyPlacesText.split(';')[0]?.trim() || 'centro'}."`
      : '';
    const poiExample = nearbyPlacesText
      ? `, pertinho do ${nearbyPlacesText.split(';')[0]?.trim() || 'centro'}`
      : '';
    const baseHint = `[SISTEMA — INSTRUÇÃO CRÍTICA] ${sentCount} imóvel(is) enviado(s) ao cliente com foto e link.\n\n🏠 IMÓVEL ENVIADO (use EXATAMENTE estes dados na resposta): ${propContext}.${pivotNotice}${tipoExpandidoNotice}${overshootNotice}${finNotice}${expansionNotice}${poiHint}\n\nPERFIL DO CLIENTE: ${clientProfile}\n\nREGRA DE SINGULAR/PLURAL: ${singularPlural}\n\nREGRAS DE RESPOSTA (APRESENTAÇÃO CONSULTIVA):\n1. Apresente o imóvel com DADOS CONCRETOS: mencione bairro, quartos, preço${sentProp.area_util ? ', metragem' : ''}${sentProp.vagas ? ', vagas' : ''} na sua mensagem.\n2. OBRIGATÓRIO conectar pelo menos 2 critérios que o cliente pediu (bairro, quartos, orçamento, proximidade).${poiRule}\n4. Exemplo BOM: "Esse ${sentProp.tipo || 'apartamento'} no ${sentProp.bairro} tem ${sentProp.quartos} quartos${sentProp.area_util ? ', ' + sentProp.area_util + 'm²' : ''} e fica por ${sentProp.preco_formatado || formatCurrency(sentProp.preco)}${poiExample}. O que achou?"\n5. PROIBIDO frases genéricas como "encontrei um imóvel que pode te interessar", "separei uma opção pra você", "dá uma olhadinha", "me conta o que achou". Seja ESPECÍFICA com números, dados reais e localização.\n6. ⚠️ CRÍTICO: Use APENAS os dados do IMÓVEL ENVIADO acima. NÃO misture com dados de outros imóveis da fila. O preço que você deve mencionar é EXATAMENTE ${sentProp.preco_formatado || formatCurrency(sentProp.preco)} — qualquer outro valor é ERRO.\n7. Finalize perguntando a opinião do cliente sobre ESTE imóvel específico de forma consultiva.\n\nSe o cliente gostar, ótimo. Se não gostar ou quiser ver mais, você tem mais ${remaining} opção(ões) na fila.`;
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

// ========== PROPERTY BY CODE (portal leads) ==========
// Lookup direto por external_id. Uso prioritário quando o lead veio do portal
// com um código de imóvel específico (ZAP, VivaReal, OLX). Não passa por gate
// de qualificação — o código É a qualificação.
export async function executePropertyByCode(
  ctx: AgentContext,
  args: { codigo: string }
): Promise<string> {
  try {
    const code = String(args.codigo || '').trim();
    if (!code) return '[SISTEMA] Código do imóvel não informado.';

    const { data: prop, error } = await ctx.supabase
      .from('properties')
      .select('*')
      .eq('tenant_id', ctx.tenantId)
      .eq('external_id', code)
      .maybeSingle();

    if (error) {
      console.error('❌ executePropertyByCode error:', error);
      return '[SISTEMA] Erro ao consultar o imóvel. Tente novamente.';
    }
    if (!prop) {
      return `[SISTEMA] O imóvel de código ${code} não foi encontrado no nosso catálogo (pode ter sido vendido, desativado ou o código pode estar incorreto). Informe isso ao cliente de forma honesta e ofereça buscar alternativas parecidas, perguntando preferências (bairro, quartos, orçamento).`;
    }

    // Build PropertyResult
    const websiteBase = (ctx.aiConfig as any)?.website_url?.replace(/\/$/, '') || '';
    const formatted: PropertyResult = {
      codigo: prop.external_id,
      tipo: prop.type || 'Imóvel',
      bairro: prop.neighborhood || 'Região',
      cidade: prop.city || ctx.tenant.city,
      preco: prop.price,
      preco_formatado: prop.price ? formatCurrency(prop.price) : null,
      quartos: prop.bedrooms,
      suites: prop.suites || null,
      vagas: prop.parking_spots || null,
      area_util: prop.useful_area || null,
      link: prop.url || (websiteBase && prop.external_id ? `${websiteBase}/imovel/${prop.external_id}` : ''),
      foto_destaque: prop.images && prop.images.length > 0 ? prop.images[0] : null,
      descricao: prop.description,
      valor_condominio: prop.condo_fee || null,
    };

    // Persist em pending_properties pra enviar_lead_c2s usar depois
    // + marca shown_property_ids + limpa portal_property_code (já foi atendido)
    const { data: prevState } = await ctx.supabase
      .from('conversation_states')
      .select('shown_property_ids')
      .eq('tenant_id', ctx.tenantId)
      .eq('phone_number', ctx.phoneNumber)
      .maybeSingle();
    const shownIds: string[] = Array.from(new Set([...(prevState?.shown_property_ids || []), formatted.codigo].filter(Boolean)));

    await ctx.supabase
      .from('conversation_states')
      .upsert({
        tenant_id: ctx.tenantId,
        phone_number: ctx.phoneNumber,
        pending_properties: [formatted],
        current_property_index: 0,
        awaiting_property_feedback: true,
        shown_property_ids: shownIds,
        // Manter portal_property_code sticky — só limpar quando cliente rejeitar explicitamente o imóvel.
        // Enquanto o código estiver setado, Aimee só fala desse imóvel (regra no prompt comercial).
        last_property_shown_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }, { onConflict: 'tenant_id,phone_number' });

    // Cross-conversation: persiste no contact pra não repetir em rewarm futuro
    if (formatted.codigo) await recordShownProperty(ctx, formatted.codigo);

    // Enviar foto + caption no WhatsApp
    const agentName = (ctx.aiConfig as any)?.agent_name || 'Aimee';
    const precoStr = formatted.preco_formatado || (formatted.preco ? formatCurrency(formatted.preco) : 'Sob consulta');
    const captionLines = [
      `*${agentName}*`,
      '',
      `🏠 *${formatted.tipo} no ${formatted.bairro}*`,
      `Código: ${formatted.codigo}`,
      formatted.quartos ? `Quartos: ${formatted.quartos}${formatted.suites ? ` (${formatted.suites} suíte${formatted.suites > 1 ? 's' : ''})` : ''}` : null,
      formatted.area_util ? `Área útil: ${formatted.area_util}m²` : null,
      formatted.vagas ? `Vagas: ${formatted.vagas}` : null,
      `Valor: ${precoStr}`,
      formatted.valor_condominio && formatted.valor_condominio > 1 ? `Condomínio: ${formatCurrency(formatted.valor_condominio)}` : null,
      formatted.link ? `\n${formatted.link}` : null,
    ].filter(Boolean).join('\n');

    const isSimulation = ctx.phoneNumber.startsWith('SIM-');
    if (!isSimulation) {
      if (formatted.foto_destaque) {
        const imgRes = await sendWhatsAppImage(ctx.phoneNumber, formatted.foto_destaque, captionLines, ctx.tenant);
        if (imgRes.success) {
          // Persistir no inbox para o painel renderizar (sem isso, foto vai pro WA mas não aparece no chat do admin)
          await saveOutboundMessage(
            ctx.supabase, ctx.tenantId, ctx.conversationId, ctx.phoneNumber,
            captionLines, imgRes.messageId, 'vendas', 'image', formatted.foto_destaque,
          );
        } else {
          const txt = await sendWhatsAppMessage(ctx.phoneNumber, captionLines, ctx.tenant);
          await saveOutboundMessage(
            ctx.supabase, ctx.tenantId, ctx.conversationId, ctx.phoneNumber,
            captionLines, txt?.messageId, 'vendas',
          );
        }
      } else {
        const txt = await sendWhatsAppMessage(ctx.phoneNumber, captionLines, ctx.tenant);
        await saveOutboundMessage(
          ctx.supabase, ctx.tenantId, ctx.conversationId, ctx.phoneNumber,
          captionLines, txt?.messageId, 'vendas',
        );
      }
    }

    // Hint pro LLM responder consciente
    return `[SISTEMA] Imóvel ${formatted.codigo} encontrado e apresentado ao cliente (foto + detalhes já enviados no WhatsApp). Dados: ${formatted.tipo}, ${formatted.quartos || '?'} quartos, ${formatted.area_util || '?'}m², ${formatted.bairro}/${formatted.cidade}, ${precoStr}. NÃO repita os dados — complemente: pergunte se o cliente quer visitar, se quer saber sobre condomínio/financiamento, ou se tem alguma dúvida. Use tom consultivo. Se o cliente demonstrar interesse real (quer visitar/falar com corretor), chame enviar_lead_c2s com codigo_imovel=${formatted.codigo}.`;

  } catch (error) {
    console.error('❌ executePropertyByCode exception:', error);
    return '[SISTEMA] Falha inesperada ao consultar o imóvel.';
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
  // Sprint 6.2 — blindagem admin: setor administrativo NÃO usa C2S, nem envia leads pra vendas.
  // Se por algum motivo essa função foi chamada num contexto admin, converte pra handoff humano local.
  if (ctx.department === 'administrativo' || ctx.contactType === 'inquilino' || ctx.contactType === 'proprietario') {
    console.warn(`⛔ executeLeadHandoff bloqueado — dept=${ctx.department} contactType=${ctx.contactType}. Admin não usa C2S.`);
    await logActivity(ctx.supabase, ctx.tenantId, 'lead_handoff_blocked_admin', 'conversations', ctx.conversationId, {
      reason: 'admin_sector_no_c2s',
      department: ctx.department,
      contact_type: ctx.contactType,
    });
    // Faz handoff humano local (sem C2S)
    return await executeAdminHandoff(ctx, { motivo: args?.motivo || 'handoff_humano_admin' });
  }

  try {
    let developmentId = args.codigo_imovel || null;
    let developmentTitle = args.titulo_imovel || null;

    // Fallback: se a IA não passou o imóvel, tentar extrair do conversation_states
    // Busca SEMPRE para garantir que temos prop_ref mesmo quando a IA omite
    if (!developmentId) {
      try {
        const { data: convState } = await ctx.supabase
          .from('conversation_states')
          .select('pending_properties, current_property_index, last_property_shown_at')
          .eq('tenant_id', ctx.tenantId)
          .eq('phone_number', ctx.phoneNumber)
          .single();

        if (convState?.pending_properties?.length) {
          // current_property_index aponta para o PRÓXIMO a mostrar; o último mostrado é index-1
          // Se index=0 e last_property_shown_at existe, significa que mostramos o primeiro (index 0)
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
            console.log(`📦 Fallback prop_ref: [${developmentId}] ${developmentTitle}`);
          } else {
            console.warn('⚠️ pending_properties[0] has no codigo field:', JSON.stringify(prop).slice(0, 200));
          }
        } else {
          console.warn('⚠️ No pending_properties found for fallback prop_ref');
        }
      } catch (fbErr) {
        console.warn('⚠️ Fallback property lookup failed:', fbErr);
      }
    }

    console.log(`🏠 Lead handoff prop_ref: development_id=${developmentId || 'NULL'}, development_title=${developmentTitle || 'NULL'}, source=${args.codigo_imovel ? 'AI_ARGS' : 'FALLBACK'}${ctx.simulate ? ' [SIMULATE]' : ''}`);

    // F4: Skip CRM integration in simulate mode
    if (!ctx.simulate) {
      try {
        const crmResult = await ctx.supabase.functions.invoke('c2s-create-lead', {
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
        if (crmResult.error) {
          console.error('⚠️ c2s-create-lead returned error:', crmResult.error);
        }
      } catch (crmErr) {
        console.error('⚠️ c2s-create-lead invocation failed:', crmErr);
        // Continue with handoff even if CRM fails — don't block the user experience
      }
    }

    // Fix F: In simulate mode, skip DB side-effects (conversation_states, messages, events)
    // to avoid corrupting state or hitting constraint errors with simulation data
    if (!ctx.simulate) {
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
    } else {
      console.log('🧪 [Simulate] Skipping handoff DB side-effects');
    }

    if (!ctx.simulate) {
      await ctx.supabase.from('conversation_events').insert({
        tenant_id: ctx.tenantId,
        conversation_id: ctx.conversationId,
        event_type: 'ai_paused',
        metadata: { reason: args.motivo, crm: 'c2s' },
      });
    }

    // F3: Dual output — DB log stays as system message, LLM gets instruction to generate humanized farewell
    // P3 cutover 07/05: label de setor visível ao cliente (paridade Lais dossiê §4).
    // Lastro escreve literalmente "o Consultor Imobiliário" / "o Atendente de Locação",
    // fixando a expectativa do lead. Fazemos o mesmo aqui, dept-aware.
    const setorLabel = ctx.department === 'locacao'
      ? 'nosso Atendente de Locação'
      : 'nosso Consultor de Venda';
    return `Handoff concluído com sucesso. Agora se despeça do cliente de forma calorosa e natural. Mencione que ${setorLabel} entrará em contato em breve para alinhar os detalhes. Seja breve, elegante e humano. NÃO repita "Lead transferido" ou qualquer mensagem técnica.`;

  } catch (error) {
    console.error('❌ Lead handoff error:', error);
    const setorLabel = ctx.department === 'locacao'
      ? 'nosso Atendente de Locação'
      : 'nosso Consultor de Venda';
    return `Houve um imprevisto técnico, mas vou garantir que ${setorLabel} entre em contato. Despeça-se do cliente de forma calorosa, mencionando que ${setorLabel} entrará em contato em breve.`;
  }
}

// ========== ADMIN TICKET CREATION ==========

export async function executeCreateTicket(
  ctx: AgentContext,
  args: any
): Promise<string> {
  try {
    const { titulo, categoria, descricao, prioridade } = args;

    // Sprint 6.1: puxa risk_level + aimee_can_resolve + context_template
    const { data: categoryRow } = await ctx.supabase
      .from('ticket_categories')
      .select('id, sla_hours, risk_level, aimee_can_resolve, context_template')
      .eq('tenant_id', ctx.tenantId)
      .eq('name', categoria)
      .eq('is_active', true)
      .maybeSingle();

    const canResolve = categoryRow?.aimee_can_resolve !== false;
    const riskLevel = categoryRow?.risk_level || 'baixo';
    const contextTemplate = Array.isArray(categoryRow?.context_template) ? categoryRow.context_template : [];

    // Se tem template → começa em "Aguardando Contexto" pra operador alimentar Vista
    // Se não tem template → vai direto pra "Novo"
    const targetStageName = contextTemplate.length > 0 ? 'Aguardando Contexto' : 'Novo';
    const { data: targetStage } = await ctx.supabase
      .from('ticket_stages')
      .select('id')
      .eq('tenant_id', ctx.tenantId)
      .eq('name', targetStageName)
      .maybeSingle();

    const slaHours = categoryRow?.sla_hours || 48;
    const slaDeadline = new Date(Date.now() + slaHours * 60 * 60 * 1000).toISOString();

    const nowIso = new Date().toISOString();
    const { data: ticket, error } = await ctx.supabase
      .from('tickets')
      .insert({
        tenant_id: ctx.tenantId,
        title: titulo,
        category: categoria,
        category_id: categoryRow?.id || null,
        description: descricao,
        priority: prioridade || 'media',
        stage: targetStageName,
        stage_id: targetStage?.id || null,
        phone: ctx.phoneNumber,
        source: 'whatsapp_ai',
        contact_id: ctx.contactId || null,
        conversation_id: ctx.conversationId || null,
        department_code: 'administrativo',
        sla_deadline: slaDeadline,
        first_response_at: nowIso, // Sprint 6.1 métrica TTFR — ticket criado já é a primeira resposta substantiva
      })
      .select('id')
      .single();

    if (error) {
      console.error('❌ Ticket creation error:', error);
      return 'Houve um problema ao criar o chamado. Vou transferir para um atendente humano.';
    }

    // Sprint 6.1: sementeia context_fields pedidos pela Aimee
    if (contextTemplate.length > 0) {
      const rows = contextTemplate.map((t: any) => ({
        tenant_id: ctx.tenantId,
        ticket_id: ticket.id,
        field_key: t.key,
        field_value: null,
        filled_by: null,
        requested_by_aimee: true,
      }));
      const { error: ctxErr } = await ctx.supabase.from('ticket_context_fields').insert(rows);
      if (ctxErr) console.error('⚠️ context_fields seed error:', ctxErr);
    }

    await logActivity(ctx.supabase, ctx.tenantId, 'ticket_created', 'tickets', ticket.id, {
      category: categoria,
      priority: prioridade,
      risk_level: riskLevel,
      aimee_can_resolve: canResolve,
      source: 'ai_agent',
      conversation_id: ctx.conversationId,
    });

    console.log(`✅ Ticket created: ${ticket.id} | Categoria: ${categoria} | Risco: ${riskLevel} | Aimee resolve: ${canResolve}`);

    // Sprint 6.1: instrução contextual pro LLM conforme risco
    if (!canResolve || riskLevel === 'alto') {
      return `Chamado #${ticket.id.slice(0, 8)} registrado como CATEGORIA DE ALTO RISCO (${categoria}). Você NÃO deve tentar resolver sozinha. Chame a ferramenta encaminhar_humano agora com motivo='categoria_alto_risco' para que um gerente assuma. Antes do handoff, comunique ao cliente de forma calma e resolutiva que um especialista da equipe vai cuidar pessoalmente dessa questão.`;
    }

    if (contextTemplate.length > 0) {
      const fieldsLabels = contextTemplate.map((t: any) => t.label || t.key).join(', ');
      return `Chamado #${ticket.id.slice(0, 8)} aberto (${categoria}). Estou aguardando a equipe me passar: ${fieldsLabels}. Comunique ao cliente com segurança que a solicitação já está sendo tratada e que você volta com os detalhes em instantes — NÃO prometa prazo específico, apenas demonstre cuidado e controle da situação.`;
    }

    return `Chamado #${ticket.id.slice(0, 8)} criado (${categoria}, prioridade ${prioridade}). Comunique ao cliente de forma breve e calorosa que a solicitação foi registrada e a equipe vai acompanhar.`;

  } catch (error) {
    console.error('❌ Ticket creation execution error:', error);
    return 'Não consegui registrar o chamado automaticamente. Vou transferir para atendimento humano.';
  }
}

// ========== ADMIN: CONSULTAR CONTEXTO DO TICKET ==========
// Sprint 6.1 — Aimee chama essa tool mid-turn pra checar se operador alimentou dados do Vista

export async function executeGetTicketContext(
  ctx: AgentContext,
  _args: any
): Promise<string> {
  try {
    const activeTicketId = ctx.activeTicket?.id;
    if (!activeTicketId) {
      return 'Nenhum ticket ativo para esta conversa. Se o cliente ainda não teve a demanda registrada, use criar_ticket.';
    }

    const { data: fields } = await ctx.supabase
      .from('ticket_context_fields')
      .select('field_key, field_value, filled_by, filled_at, requested_by_aimee')
      .eq('ticket_id', activeTicketId);

    const { data: ticket } = await ctx.supabase
      .from('tickets')
      .select('id, stage, category, category_id')
      .eq('id', activeTicketId)
      .maybeSingle();

    const filled = (fields || []).filter((f: any) => f.field_value !== null && f.field_value !== '');
    const pending = (fields || []).filter((f: any) => !f.field_value);

    const filledLines = filled.map((f: any) => `- ${f.field_key}: ${f.field_value}`).join('\n') || '(nenhum ainda)';
    const pendingLines = pending.map((f: any) => `- ${f.field_key}`).join('\n') || '(nenhum)';

    return `Ticket #${activeTicketId.slice(0, 8)} | Estágio: ${ticket?.stage || '?'} | Categoria: ${ticket?.category || '?'}\n\nCAMPOS PREENCHIDOS PELA EQUIPE:\n${filledLines}\n\nAINDA PENDENTES:\n${pendingLines}\n\nUse APENAS os valores preenchidos acima ao responder o cliente. NÃO invente dados que não estão aqui.`;
  } catch (error) {
    console.error('❌ getTicketContext error:', error);
    return 'Não consegui consultar o contexto agora. Mantenha o cliente tranquilo e informe que a equipe está trabalhando na solicitação.';
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

    // F3: Dual output — DB log stays as system message, LLM gets instruction to generate humanized farewell
    // P3: label "nosso Setor Administrativo" (paridade Lais dossiê §4, Manoel/Estevan).
    return 'Transferência concluída. Agora se despeça do cliente de forma calorosa e natural. Mencione que nosso Setor Administrativo entrará em contato para ajudá-lo. Seja breve e humano. NÃO repita mensagens técnicas.';

  } catch (error) {
    console.error('❌ Admin handoff error:', error);
    return 'Houve um imprevisto, mas vou garantir que nosso Setor Administrativo entre em contato. Despeça-se do cliente de forma calorosa, mencionando que nosso Setor Administrativo entrará em contato em breve.';
  }
}

// ========== DEPARTMENT TRANSFER (mid-conversation routing) ==========

// Reroutes the conversation to another department. The next inbound message
// will be picked up by the target agent (selectAgent reads conversation.department_code
// fresh every turn). Optionally updates contacts.contact_type when the lead
// self-identified as inquilino/proprietario so future sessions auto-route too.
export async function executeDepartmentTransfer(
  ctx: AgentContext,
  targetDept: 'administrativo' | 'vendas' | 'locacao',
  args: { motivo: string; tipo_relacao?: string }
): Promise<string> {
  try {
    const { data: firstStage } = await ctx.supabase
      .from('conversation_stages')
      .select('id')
      .eq('tenant_id', ctx.tenantId)
      .eq('department_code', targetDept)
      .order('order_index', { ascending: true })
      .limit(1)
      .maybeSingle();

    const conversationUpdate: any = { department_code: targetDept };
    if (firstStage) conversationUpdate.stage_id = firstStage.id;

    await ctx.supabase
      .from('conversations')
      .update(conversationUpdate)
      .eq('id', ctx.conversationId);

    const contactUpdate: any = { department_code: targetDept };
    if (args.tipo_relacao === 'inquilino' || args.tipo_relacao === 'proprietario') {
      contactUpdate.contact_type = args.tipo_relacao;
    }

    await ctx.supabase
      .from('contacts')
      .update(contactUpdate)
      .eq('tenant_id', ctx.tenantId)
      .eq('phone', ctx.phoneNumber);

    await ctx.supabase.from('conversation_events').insert({
      tenant_id: ctx.tenantId,
      conversation_id: ctx.conversationId,
      event_type: 'department_transferred',
      metadata: {
        from: ctx.department,
        to: targetDept,
        reason: args.motivo,
        tipo_relacao: args.tipo_relacao || null,
      },
    });

    await logActivity(ctx.supabase, ctx.tenantId, 'department_transferred', 'conversations', ctx.conversationId, {
      from: ctx.department,
      to: targetDept,
      reason: args.motivo,
    });

    console.log(`🔄 Department transferred: ${ctx.department} → ${targetDept} | Reason: ${args.motivo}`);

    const toneByDept: Record<string, string> = {
      administrativo: 'Reconheça com naturalidade que vai cuidar dessa questão administrativa. Pergunte apenas o dado essencial que falta pra abrir o chamado (ex: qual imóvel, qual boleto, qual problema). NÃO diga "vou te transferir" nem mencione setor — apenas continue acolhendo.',
      vendas: 'Reconheça com naturalidade que vai te ajudar a encontrar um imóvel pra comprar. Faça a próxima pergunta de qualificação (tipo, região ou orçamento). NÃO diga "vou te transferir".',
      locacao: 'Reconheça com naturalidade que vai te ajudar a encontrar um imóvel pra alugar. Faça a próxima pergunta de qualificação (tipo, região ou orçamento). NÃO diga "vou te transferir".',
    };

    return `[SISTEMA] Conversa agora roteada para ${targetDept}. ${toneByDept[targetDept] || 'Continue ajudando o cliente de forma natural.'}`;
  } catch (error) {
    console.error('❌ Department transfer error:', error);
    return 'Não consegui ajustar o atendimento agora, mas vou te ajudar por aqui mesmo.';
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
      .select(`
        name,
        crm_archive_reason,
        crm_natureza,
        crm_neighborhood,
        crm_property_ref,
        crm_price_hint,
        crm_source,
        crm_broker_notes,
        crm_status,
        notes,
        reactivation_attempts,
        reactivation_last_attempt_at
      `)
      .eq('id', contactId)
      .maybeSingle();

    // Reaquecimento automático: lead arquivado recentemente pelo corretor, disparado pelo cron
    const isAutoRewarm = contact?.reactivation_attempts >= 1
      && contact?.reactivation_last_attempt_at
      && (Date.now() - new Date(contact.reactivation_last_attempt_at).getTime()) < 7 * 24 * 60 * 60 * 1000;

    if (contact) {
      if (isAutoRewarm) {
        sections.push('🔁 CONTEXTO CRÍTICO — REAQUECIMENTO AUTOMÁTICO DE LEAD ARQUIVADO:');
        sections.push('- Este lead foi arquivado pelo corretor há poucos dias e você (Aimee) está retomando o contato automaticamente.');
        sections.push('- Seja DELICADA e sem pressão. O lead pode não estar esperando novo contato.');
        sections.push('- Começe a conversa reconhecendo SUTILMENTE que houve contato anterior (ex: "vi que você chegou a conversar com a gente"). NÃO revele detalhes específicos do arquivamento.');
        sections.push('- Se o lead demonstrar que NÃO quer mais ser contatado ou que já resolveu, encerre com educação: agradeça, desejo sucesso, e chame `finalizar_atendimento` com motivo "Arquivado pela Aimee após reaquecimento: <resumo da resposta do lead>".');
        sections.push('- Se o lead responder interessado, continue o fluxo comercial normal (qualificar, buscar imóveis, encaminhar via `encaminhar_para_corretor` quando qualificado).');
      } else {
        sections.push('📋 CONTEXTO DO LEAD (EX-C2S, CAMPANHA DE REMARKETING):');
        sections.push('- Este lead já foi atendido antes pelo CRM anterior e está sendo re-engajado agora.');
      }
      if (contact.crm_status) sections.push(`- Status anterior no CRM: ${contact.crm_status}`);
      if (contact.crm_archive_reason) sections.push(`- Motivo do arquivamento: ${contact.crm_archive_reason}`);
      if (contact.crm_natureza) sections.push(`- Natureza do interesse: ${contact.crm_natureza}`);
      if (contact.crm_neighborhood) sections.push(`- Bairro de interesse: ${contact.crm_neighborhood}`);
      if (contact.crm_property_ref) sections.push(`- Imóvel visto anteriormente: ${contact.crm_property_ref}`);
      if (contact.crm_price_hint) sections.push(`- Faixa de preço na busca anterior: ${contact.crm_price_hint}`);
      if (contact.crm_source) sections.push(`- Portal de origem do lead: ${contact.crm_source}`);
      if (contact.crm_broker_notes) sections.push(`- Anotações do corretor (leitura obrigatória): ${contact.crm_broker_notes}`);
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

    sections.push('');
    sections.push('⚠️ INSTRUÇÕES DE USO DESTE CONTEXTO:');
    sections.push('- Reconheça sutilmente que já houve contato anterior, mas NÃO liste esses dados de volta pro cliente (ele não lembra dos detalhes).');
    sections.push('- Se as anotações do corretor apontarem uma necessidade específica (budget menor, tipo de imóvel diferente, objeção), ajuste a abordagem respeitando isso.');
    sections.push('- NÃO re-pergunte informações que já estão nesse contexto (bairro, faixa de preço, natureza do interesse).');
    sections.push('- O motivo do arquivamento indica POR QUE o lead esfriou — use pra escolher o tom de re-abertura (ex: "só pesquisando" pede abordagem leve; "fechou em outro lugar" pode pedir pra explorar se ainda faz sentido).');

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

// ========== ATUALIZAÇÃO SECTOR — VISTA MUTATIONS ==========
// Sprint 6.2 — helpers pro setor de atualização de imóveis ADM.
// Integrado às tabelas owner_update_results + owner_update_campaigns (UI /atualizacao).

async function callVistaUpdate(
  ctx: AgentContext,
  propertyCode: string,
  fields: Record<string, any>
): Promise<{ ok: boolean; response: any; error?: string }> {
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

    const resp = await fetch(`${supabaseUrl}/functions/v1/vista-update-property`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${serviceKey}`,
      },
      body: JSON.stringify({
        tenant_id: ctx.tenantId,
        property_code: propertyCode,
        fields,
      }),
    });

    const data = await resp.json();
    if (!resp.ok || !data.ok) {
      return { ok: false, response: data, error: data.error || `HTTP ${resp.status}` };
    }
    return { ok: true, response: data.vista_response };
  } catch (e) {
    return { ok: false, response: null, error: (e as Error).message };
  }
}

async function writeAuditLog(
  ctx: AgentContext,
  action: string,
  oldValue: any,
  newValue: any,
  reason: string,
  executed: boolean,
  vistaResponse: any,
  errorMessage: string | null
): Promise<void> {
  const entry = ctx.activeUpdateEntry;
  if (!entry) return;
  await ctx.supabase.from('vista_audit_log').insert({
    tenant_id: ctx.tenantId,
    property_code: entry.propertyCode,
    property_id: entry.propertyIdLocal,
    action,
    old_value: oldValue,
    new_value: newValue,
    reason,
    conversation_id: ctx.conversationId,
    executed,
    vista_response: vistaResponse,
    error_message: errorMessage,
  });
}

// Fecha o owner_update_result + incrementa contadores na campanha.
async function closeOwnerUpdateResult(
  ctx: AgentContext,
  propertyStatus: 'available' | 'rented' | 'sold' | 'unavailable' | 'price_changed' | null,
  aiSummary: string,
  resultStatus: 'completed' | 'failed' = 'completed'
): Promise<void> {
  const entry = ctx.activeUpdateEntry;
  if (!entry) return;
  await ctx.supabase
    .from('owner_update_results')
    .update({
      status: resultStatus,
      property_status: propertyStatus,
      ai_summary: aiSummary,
      completed_at: new Date().toISOString(),
    })
    .eq('id', entry.resultId);

  // Incrementa updated_count da campanha (contador agregado)
  if (resultStatus === 'completed') {
    const { data: camp } = await ctx.supabase
      .from('owner_update_campaigns')
      .select('updated_count, responded_count')
      .eq('id', entry.campaignId)
      .maybeSingle();
    if (camp) {
      await ctx.supabase
        .from('owner_update_campaigns')
        .update({
          updated_count: (camp.updated_count || 0) + 1,
          responded_count: (camp.responded_count || 0) + (propertyStatus ? 1 : 0),
        })
        .eq('id', entry.campaignId);
    }
  }

  // Reflete no properties local, se tiver
  if (entry.propertyIdLocal) {
    const propPatch: any = { last_availability_check_at: new Date().toISOString() };
    if (propertyStatus === 'unavailable' || propertyStatus === 'sold' || propertyStatus === 'rented') {
      propPatch.is_active = false;
    }
    await ctx.supabase
      .from('properties')
      .update(propPatch)
      .eq('id', entry.propertyIdLocal);
  }
}

export async function executeConfirmAvailability(
  ctx: AgentContext,
  args: any
): Promise<string> {
  try {
    const entry = ctx.activeUpdateEntry;
    if (!entry) {
      console.error('❌ confirmar_disponibilidade called without activeUpdateEntry');
      return 'Não encontrei a referência do imóvel nesta conversa. Despeça-se do proprietário com naturalidade e avise que a equipe vai retomar o contato.';
    }

    await writeAuditLog(
      ctx,
      'confirm_available',
      { status: entry.currentStatus },
      { status: entry.currentStatus }, // sem mudança
      args.observacao || 'Proprietário confirmou disponibilidade sem alterações.',
      true, // confirmação não requer Vista call
      null,
      null
    );

    await closeOwnerUpdateResult(ctx, 'available', args.observacao || 'Proprietário confirmou disponibilidade sem alterações.');

    await logActivity(ctx.supabase, ctx.tenantId, 'atualizacao_confirmed_available', 'owner_update_results', entry.resultId, {
      property_code: entry.propertyCode,
      campaign_id: entry.campaignId,
      conversation_id: ctx.conversationId,
    });

    console.log(`✅ Availability confirmed: ${entry.propertyCode}`);

    return 'Disponibilidade confirmada com sucesso. Agora se despeça do proprietário com uma linha breve e respeitosa, agradecendo o retorno. Não adicione assunto novo.';
  } catch (error) {
    console.error('❌ executeConfirmAvailability error:', error);
    return 'Registrei sua confirmação. Despeça-se com naturalidade.';
  }
}

export async function executeUpdatePropertyValue(
  ctx: AgentContext,
  args: { tipo_valor: 'venda' | 'locacao'; novo_valor: number; motivo: string }
): Promise<string> {
  try {
    const entry = ctx.activeUpdateEntry;
    if (!entry) {
      console.error('❌ atualizar_valor called without activeUpdateEntry');
      return 'Não encontrei a referência do imóvel nesta conversa. Despeça-se com naturalidade e avise que a equipe retoma o contato.';
    }

    const autoExecute = (ctx.tenant as any).atualizacao_auto_execute === true;
    const field = args.tipo_valor === 'venda' ? 'ValorVenda' : 'ValorLocacao';
    const oldValue = args.tipo_valor === 'venda' ? entry.currentValorVenda : entry.currentValorLocacao;

    let vistaResponse: any = null;
    let executed = false;
    let errorMessage: string | null = null;

    if (autoExecute) {
      const result = await callVistaUpdate(ctx, entry.propertyCode, { [field]: args.novo_valor });
      vistaResponse = result.response;
      executed = result.ok;
      errorMessage = result.error || null;
    } else {
      errorMessage = 'auto_execute=false — mutation não enviada ao Vista, apenas registrada.';
    }

    await writeAuditLog(
      ctx,
      'update_value',
      { [field]: oldValue },
      { [field]: args.novo_valor },
      args.motivo,
      executed,
      vistaResponse,
      errorMessage
    );

    await closeOwnerUpdateResult(
      ctx,
      'price_changed',
      `${args.motivo} | Novo ${args.tipo_valor}: R$ ${args.novo_valor.toLocaleString('pt-BR')}`,
      executed ? 'completed' : 'failed'
    );

    await logActivity(ctx.supabase, ctx.tenantId, 'atualizacao_value_updated', 'owner_update_results', entry.resultId, {
      property_code: entry.propertyCode,
      field,
      old_value: oldValue,
      new_value: args.novo_valor,
      executed,
      conversation_id: ctx.conversationId,
    });

    console.log(`💰 Value update queued: ${entry.propertyCode} ${field}: ${oldValue} → ${args.novo_valor} (executed=${executed})`);

    if (executed) {
      return `Novo valor de ${args.tipo_valor} registrado com sucesso no sistema. Agora confirme ao proprietário em uma linha breve que o ajuste foi feito e agradeça o retorno. Não adicione assunto novo.`;
    }
    return `Registrei o ajuste pra nossa equipe aplicar. Confirme ao proprietário com naturalidade que a equipe vai atualizar e agradeça o retorno.`;
  } catch (error) {
    console.error('❌ executeUpdatePropertyValue error:', error);
    return 'Registrei sua atualização. Despeça-se com naturalidade.';
  }
}

export async function executeMarkUnavailable(
  ctx: AgentContext,
  args: { motivo: string }
): Promise<string> {
  try {
    const entry = ctx.activeUpdateEntry;
    if (!entry) {
      console.error('❌ marcar_indisponivel called without activeUpdateEntry');
      return 'Não encontrei a referência do imóvel. Despeça-se com naturalidade.';
    }

    const autoExecute = (ctx.tenant as any).atualizacao_auto_execute === true;
    const newFields = { Status: 'Inativo', ExibirNoSite: 'Nao' };

    let vistaResponse: any = null;
    let executed = false;
    let errorMessage: string | null = null;

    if (autoExecute) {
      const result = await callVistaUpdate(ctx, entry.propertyCode, newFields);
      vistaResponse = result.response;
      executed = result.ok;
      errorMessage = result.error || null;
    } else {
      errorMessage = 'auto_execute=false — mutation não enviada ao Vista, apenas registrada.';
    }

    await writeAuditLog(
      ctx,
      'mark_unavailable',
      { Status: entry.currentStatus },
      newFields,
      args.motivo,
      executed,
      vistaResponse,
      errorMessage
    );

    await closeOwnerUpdateResult(
      ctx,
      'unavailable',
      `Proprietário retirou do mercado: ${args.motivo}`,
      executed ? 'completed' : 'failed'
    );

    await logActivity(ctx.supabase, ctx.tenantId, 'atualizacao_marked_unavailable', 'owner_update_results', entry.resultId, {
      property_code: entry.propertyCode,
      motivo: args.motivo,
      executed,
      conversation_id: ctx.conversationId,
    });

    console.log(`🚫 Marked unavailable: ${entry.propertyCode} (executed=${executed})`);

    if (executed) {
      return 'Imóvel marcado como indisponível no sistema. Despeça-se do proprietário com uma linha breve, agradecendo por avisar. Não adicione assunto novo.';
    }
    return 'Registrei sua solicitação — a equipe vai suspender o anúncio em breve. Despeça-se com naturalidade e agradeça.';
  } catch (error) {
    console.error('❌ executeMarkUnavailable error:', error);
    return 'Registrei sua solicitação. Despeça-se com naturalidade.';
  }
}

export async function executeMarkSoldElsewhere(
  ctx: AgentContext,
  args: { tipo_transacao: 'venda' | 'locacao'; canal?: string }
): Promise<string> {
  try {
    const entry = ctx.activeUpdateEntry;
    if (!entry) {
      console.error('❌ marcar_vendido_terceiros called without activeUpdateEntry');
      return 'Não encontrei a referência do imóvel. Despeça-se com naturalidade.';
    }

    const autoExecute = (ctx.tenant as any).atualizacao_auto_execute === true;
    const novoStatus = args.tipo_transacao === 'venda' ? 'Vendido' : 'Alugado';
    const situacao = args.tipo_transacao === 'venda' ? 'Vendido Terceiros' : 'Alugado Terceiros';
    const newFields = { Status: novoStatus, Situacao: situacao, ExibirNoSite: 'Nao' };

    let vistaResponse: any = null;
    let executed = false;
    let errorMessage: string | null = null;

    if (autoExecute) {
      const result = await callVistaUpdate(ctx, entry.propertyCode, newFields);
      vistaResponse = result.response;
      executed = result.ok;
      errorMessage = result.error || null;
    } else {
      errorMessage = 'auto_execute=false — mutation não enviada ao Vista, apenas registrada.';
    }

    await writeAuditLog(
      ctx,
      'mark_sold_elsewhere',
      { Status: entry.currentStatus },
      newFields,
      `Fechou por ${args.canal || 'canal não especificado'}`,
      executed,
      vistaResponse,
      errorMessage
    );

    const mappedStatus = args.tipo_transacao === 'venda' ? 'sold' : 'rented';
    await closeOwnerUpdateResult(
      ctx,
      mappedStatus,
      `Fechou por ${args.canal || 'canal não especificado'} (${args.tipo_transacao})`,
      executed ? 'completed' : 'failed'
    );

    await logActivity(ctx.supabase, ctx.tenantId, 'atualizacao_marked_sold_elsewhere', 'owner_update_results', entry.resultId, {
      property_code: entry.propertyCode,
      tipo_transacao: args.tipo_transacao,
      canal: args.canal,
      executed,
      conversation_id: ctx.conversationId,
    });

    console.log(`🏠 Marked sold elsewhere: ${entry.propertyCode} (${args.tipo_transacao}, executed=${executed})`);

    if (executed) {
      return 'Imóvel registrado como fechado por terceiros no sistema. Despeça-se do proprietário com uma linha calorosa — parabenize-o pela transação e agradeça por avisar. Não adicione assunto novo.';
    }
    return 'Registrei a informação — a equipe vai atualizar o anúncio. Despeça-se, parabenize pela transação e agradeça por avisar.';
  } catch (error) {
    console.error('❌ executeMarkSoldElsewhere error:', error);
    return 'Registrei sua informação. Despeça-se com naturalidade.';
  }
}

export async function executeAtualizacaoHandoff(
  ctx: AgentContext,
  args: { motivo: string }
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
      body: `Atualização transferida para supervisor humano. Motivo: ${args.motivo}`,
      sender_type: 'system',
      event_type: 'ai_paused',
      created_at: new Date().toISOString(),
    });

    await ctx.supabase.from('conversation_events').insert({
      tenant_id: ctx.tenantId,
      conversation_id: ctx.conversationId,
      event_type: 'ai_paused',
      metadata: { reason: args.motivo, sector: 'atualizacao' },
    });

    if (ctx.activeUpdateEntry) {
      await closeOwnerUpdateResult(
        ctx,
        null,
        `Transferido pra supervisor: ${args.motivo}`,
        'failed'
      );
    }

    await logActivity(ctx.supabase, ctx.tenantId, 'atualizacao_handoff', 'conversations', ctx.conversationId, {
      reason: args.motivo,
      property_code: ctx.activeUpdateEntry?.propertyCode,
    });

    console.log(`🔄 Atualizacao handoff: ${ctx.conversationId} | Reason: ${args.motivo}`);

    // P3 cutover 07/05: label "nosso Supervisor de Carteira" (paridade Lais
    // dossiê §4) — proprietários em contato ativo com a administração esperam
    // saber quem vai retornar, e "supervisor de carteira" é o título que a
    // operação da Smolka usa internamente pra quem lida com renegociação,
    // reclamação e ajuste de valor em imóvel já contratado.
    return 'Transferência concluída. Agora se despeça do proprietário de forma calorosa e natural. Mencione que nosso Supervisor de Carteira vai retomar o contato em breve. Seja breve e humano. NÃO repita mensagens técnicas.';
  } catch (error) {
    console.error('❌ Atualizacao handoff error:', error);
    return 'Houve um imprevisto, mas vou garantir que nosso Supervisor de Carteira entre em contato. Despeça-se de forma calorosa, mencionando que nosso Supervisor de Carteira vai retomar o contato em breve.';
  }
}

// ========== WIKI LLM (Sprint Wiki — Fase 2) ==========
// Consulta a knowledge base do tenant (wiki_pages) em runtime. Usada quando
// a Aimee precisa lembrar política interna, perfil de bairro, objeção típica,
// ou contexto histórico de um lead específico — em vez de inventar resposta.

const WIKI_TYPES = ['bairro', 'empreendimento', 'corretor', 'objecao', 'politica', 'lead'] as const;

export async function executeWikiSearch(ctx: AgentContext, args: any): Promise<string> {
  const query = (args?.query || '').toString().trim();
  const type = args?.type && WIKI_TYPES.includes(args.type) ? args.type : null;
  if (!query) return '[SISTEMA] wiki_search exige um campo "query".';

  const { data, error } = await ctx.supabase.rpc('wiki_search_pages', {
    p_tenant_id: ctx.tenantId,
    p_query: query,
    p_type: type,
    p_limit: 3,
    p_snippet_opts: 'StartSel=«,StopSel=»,MaxFragments=2,MaxWords=22,MinWords=8,ShortWord=2',
  });

  if (error) {
    console.error('❌ executeWikiSearch RPC failed:', error.message);
    return `[SISTEMA] Erro consultando wiki: ${error.message}`;
  }

  const rows = Array.isArray(data) ? data : [];
  if (rows.length === 0) {
    return `[SISTEMA] Nenhum resultado na wiki pra "${query}". Responda baseado no que você já sabe; se for política interna ou dado factual de bairro/imóvel e você não tem certeza, diga que vai confirmar com o time.`;
  }

  const lines = rows.map((r: any, i: number) => {
    const conf = r.confidence === 'high' ? '✓' : r.confidence === 'low' ? '?' : '~';
    const snippet = String(r.snippet || '').replace(/\s+/g, ' ').trim();
    return `${i + 1}. [${r.page_type}/${r.slug}] ${conf} ${r.title}\n   ${snippet}`;
  }).join('\n\n');

  return `[WIKI ${ctx.tenantId.slice(0, 8)}] ${rows.length} resultado(s) pra "${query}":\n\n${lines}\n\n[INSTRUÇÃO] Use os fatos acima como base autoritativa. Não invente além do que está aqui. Se precisar de mais detalhe de uma página, chame wiki_search com query mais específica.`;
}

export async function executeWikiReadLead(ctx: AgentContext, args: any): Promise<string> {
  const contactId = args?.contact_id || ctx.contactId;
  if (!contactId) return '[SISTEMA] wiki_read_lead exige contact_id.';

  const { data, error } = await ctx.supabase
    .from('wiki_pages')
    .select('title, content, sources, related, confidence, updated_at')
    .eq('tenant_id', ctx.tenantId)
    .eq('page_type', 'lead')
    .eq('slug', contactId)
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error('❌ executeWikiReadLead failed:', error.message);
    return `[SISTEMA] Erro lendo página do lead: ${error.message}`;
  }
  if (!data) {
    return `[SISTEMA] Sem página de lead na wiki pra contact ${contactId}. Use a memória já injetada (lead_memory) e qualification atual; conduza a conversa naturalmente.`;
  }

  const sources = (data.sources || []).join(', ') || '(sem fonte)';
  return `[WIKI lead ${contactId}] Atualizado em ${data.updated_at}\nFontes: ${sources}\n\n${data.content}\n\n[INSTRUÇÃO] Trate como contexto interno. Não cite fatos de volta pro cliente como "vi aqui que...". Personalize, não recite.`;
}

