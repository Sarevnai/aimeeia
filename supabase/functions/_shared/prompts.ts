// ========== AIMEE.iA v2 - PROMPTS ==========
// Priority: ai_directives (DB) → ai_department_configs (DB) → hardcoded fallback
// NO hardcoded client names. Everything from config/tenant.

import { AIAgentConfig, AIBehaviorConfig, EssentialQuestion, ConversationMessage, QualificationData, DepartmentType, StructuredConfig, SkillConfig } from './types.ts';
import { generateRegionKnowledge } from './regions.ts';
import { Region } from './types.ts';
import { formatCurrency } from './utils.ts';

// ========== CONTEXT SUMMARY (anti-loop) ==========

export function buildContextSummary(qualificationData: QualificationData | null, contactName?: string | null, phoneNumber?: string | null): string {
  if (!qualificationData) return '';

  const collected: string[] = [];
  // MC-3: Include contact info so the LLM knows it already has name/phone
  if (contactName) collected.push(`👤 Nome: ${contactName}`);
  if (phoneNumber) collected.push(`📱 Telefone: ${phoneNumber}`);
  if (qualificationData.detected_neighborhood) collected.push(`📍 Região: ${qualificationData.detected_neighborhood}`);
  if (qualificationData.detected_property_type) collected.push(`🏠 Tipo: ${qualificationData.detected_property_type}`);
  if (qualificationData.detected_bedrooms) collected.push(`🛏️ Quartos: ${qualificationData.detected_bedrooms}`);
  if (qualificationData.detected_budget_max) collected.push(`💰 Orçamento: até ${formatCurrency(qualificationData.detected_budget_max)}`);
  if (qualificationData.detected_interest) collected.push(`🎯 Objetivo: ${qualificationData.detected_interest}`);
  if (qualificationData.detected_timeline) collected.push(`⏱️ Prazo: ${qualificationData.detected_timeline === '0-3m' ? 'até 3 meses' : qualificationData.detected_timeline === '3-6m' ? '3 a 6 meses' : 'acima de 6 meses'}`);

  if (collected.length === 0) return '';
  return `\n<lead_data>
📋 DADOS JÁ COLETADOS (NÃO PERGUNTE DE NOVO — use esses dados no handoff):
${collected.join('\n')}

Atenção:
- Separe mentalmente: operação (compra/locação), uso (moradia/investimento), localização, tipo, características.
- Se "Objetivo" disser "venda", isso indica operação de COMPRA do ponto de vista do cliente.
- Se algum desses pontos não estiver confirmado pelo cliente nesta conversa, confirme em vez de presumir.
</lead_data>\n`;
}

// ========== C4: RETURNING LEAD CONTEXT ==========

export function buildReturningLeadContext(previousQualData: QualificationData | null): string {
  if (!previousQualData) return '';

  const lines: string[] = [];
  if (previousQualData.detected_neighborhood) lines.push(`- Bairro: ${previousQualData.detected_neighborhood}`);
  if (previousQualData.detected_property_type) lines.push(`- Tipo: ${previousQualData.detected_property_type}`);
  if (previousQualData.detected_bedrooms) lines.push(`- Quartos: ${previousQualData.detected_bedrooms}`);
  if (previousQualData.detected_budget_max) lines.push(`- Orçamento: até ${formatCurrency(previousQualData.detected_budget_max)}`);
  if (previousQualData.detected_interest) lines.push(`- Objetivo: ${previousQualData.detected_interest === 'locacao' ? 'Locação' : 'Venda'}`);

  if (lines.length === 0) return '';

  return `
⚠️ LEAD RETORNANTE — REVALIDAÇÃO OBRIGATÓRIA
Este cliente já conversou com você anteriormente. Na conversa passada ele havia informado:
${lines.join('\n')}

IMPORTANTE: Estas preferências podem ter mudado. Você DEVE revalidar antes de assumir qualquer dado:
- Pergunte se ele deseja manter a mesma busca ou começar uma nova
- Ex: "Olá de novo! Na nossa última conversa você buscava [resumo]. Continua com a mesma ideia ou mudou alguma preferência?"
- NÃO assuma automaticamente os dados anteriores como atuais
- Se o cliente confirmar, use os dados. Se disser que mudou, inicie a qualificação do zero.
`;
}

// ========== OPENAI TOOLS ==========

export function getToolsForDepartment(department: DepartmentType, skills?: SkillConfig[]): any[] {
  const baseTools = getBaseToolsForDepartment(department);

  if (!skills || skills.length === 0) return baseTools;

  // Enhance tool descriptions with skill config
  return baseTools.map(tool => {
    const skill = skills.find(s => s.tool_name === tool.function.name);
    if (skill) {
      return {
        ...tool,
        function: {
          ...tool.function,
          description: skill.enhanced_description || tool.function.description,
        }
      };
    }
    return tool;
  });
}

function getBaseToolsForDepartment(department: DepartmentType): any[] {
  if (department === 'locacao' || department === 'vendas') {
    return [
      {
        type: "function",
        function: {
          name: "buscar_imoveis",
          description: "Busca imóveis no catálogo interno usando busca semântica inteligente. Use quando o cliente tiver informado características ou regiões desejadas.",
          parameters: {
            type: "object",
            properties: {
              query_semantica: {
                type: "string",
                description: "Uma frase descritiva, rica e natural contendo TUDO o que o lead pediu. Ex: 'apartamento de 2 quartos no centro ou cambuí com varanda gourmet que aceite animais'"
              },
              tipo_imovel: {
                type: "string",
                description: "Tipo de imóvel desejado pelo cliente. Use EXATAMENTE o tipo que o cliente pediu. Se o cliente pediu 'casa', use 'casa'. Se pediu 'apartamento', use 'apartamento'. Este filtro é OBRIGATÓRIO quando o cliente especificou o tipo.",
                enum: ["casa", "apartamento", "cobertura", "terreno", "kitnet", "sobrado", "comercial"]
              },
              preco_max: {
                type: "number",
                description: "Valor máximo do imóvel em reais, se o cliente informou"
              },
              finalidade: {
                type: "string",
                description: "Use 'locacao' para alugar, 'venda' para comprar",
                enum: ["venda", "locacao"]
              },
            },
            required: ["query_semantica", "finalidade"],
          },
        },
      },
      {
        type: "function",
        function: {
          name: "enviar_lead_c2s",
          description: "Transferir lead qualificado para corretor humano. Use quando o cliente demonstrar interesse real.",
          parameters: {
            type: "object",
            properties: {
              motivo: { type: "string", description: "Razão da transferência" },
            },
            required: ["motivo"],
          },
        },
      },
      {
        type: "function",
        function: {
          name: "buscar_pontos_de_interesse_proximos",
          description: "Use esta ferramenta QUANDO O CLIENTE PERGUNTAR especificamente sobre a localização, raio, o que tem perto, escolas, mercados ou infraestrutura. Retorna dados reais e distâncias.",
          parameters: {
            type: "object",
            properties: {
              external_id: { type: "string", description: "O CÓDIGO (external_id) do imóvel que você quer analisar. Exemplo: 'CA0012'" },
              type: {
                type: "string",
                description: "Tipo de local desejado",
                enum: ["supermarket", "school", "hospital", "pharmacy", "park", "restaurant", "gym"]
              }
            },
            required: ["external_id", "type"],
          },
        },
      },
    ];
  }

  if (department === 'administrativo') {
    return [
      {
        type: "function",
        function: {
          name: "criar_ticket",
          description: "Cria um chamado/ticket para a demanda do cliente. Use quando identificar uma solicitação concreta (boleto, manutenção, contrato, etc.).",
          parameters: {
            type: "object",
            properties: {
              titulo: {
                type: "string",
                description: "Título curto e descritivo do chamado. Ex: 'Segunda via de boleto - Apto 302'"
              },
              categoria: {
                type: "string",
                description: "Categoria principal da demanda",
                enum: ["Financeiro", "Manutenção", "Contrato", "Rescisão", "Vistoria", "Chaves", "Outros"]
              },
              descricao: {
                type: "string",
                description: "Descrição detalhada coletada na conversa com o cliente"
              },
              prioridade: {
                type: "string",
                description: "Prioridade baseada na urgência. Use 'urgente' para vazamentos, falta de água/luz. Use 'alta' para boletos vencidos, problemas de segurança. Use 'media' para manutenções gerais. Use 'baixa' para dúvidas e informações.",
                enum: ["baixa", "media", "alta", "urgente"]
              },
            },
            required: ["titulo", "categoria", "descricao", "prioridade"],
          },
        },
      },
      {
        type: "function",
        function: {
          name: "encaminhar_humano",
          description: "Transfere o atendimento para um operador humano. Use quando o cliente solicitar expressamente um humano, quando a demanda for muito complexa para resolver via IA, ou quando envolver negociação de valores.",
          parameters: {
            type: "object",
            properties: {
              motivo: {
                type: "string",
                description: "Motivo detalhado da transferência para o operador"
              },
            },
            required: ["motivo"],
          },
        },
      },
    ];
  }

  return [];
}

// ========== SYSTEM PROMPT BUILDER ==========

export async function buildSystemPrompt(
  supabase: any,
  config: AIAgentConfig,
  tenant: any,
  department: DepartmentType,
  regions: Region[],
  contactName: string | null,
  qualificationData: QualificationData | null,
  conversationHistory: ConversationMessage[],
  behaviorConfig?: AIBehaviorConfig | null,
  preloadedDirective?: any | null,
  conversationSource?: string | null,
  remarketingContext?: string | null,
  isReturningLead?: boolean,
  previousQualificationData?: QualificationData | null
): Promise<string> {
  // Priority 1: Check ai_directives table for custom prompt
  try {
    const directive = preloadedDirective ?? (await supabase
      .from('ai_directives')
      .select('directive_content, structured_config')
      .eq('tenant_id', tenant.id)
      .eq('department', department)
      .eq('is_active', true)
      .maybeSingle())?.data;

    const postHandoff = buildPostHandoffFollowup();
    // C4: Contexto de lead retornante
    const returningContext = isReturningLead ? buildReturningLeadContext(previousQualificationData || null) : '';

    // Priority 1A: Structured config (Consultora VIP pattern)
    if (directive?.structured_config) {
      let prompt = buildStructuredPrompt(
        directive.structured_config as StructuredConfig,
        config, tenant, regions, contactName, qualificationData, behaviorConfig
      );
      if (returningContext) prompt += returningContext;
      if (conversationSource === 'remarketing') {
        prompt += buildRemarketingAnamnese(remarketingContext);
      }
      prompt += postHandoff;
      return prompt;
    }

    // Priority 1B: Flat text directive (legacy)
    if (directive?.directive_content) {
      let prompt = directive.directive_content;
      prompt = prompt.replaceAll('{{AGENT_NAME}}', config.agent_name || 'Aimee');
      prompt = prompt.replaceAll('{{COMPANY_NAME}}', tenant.company_name);
      prompt = prompt.replaceAll('{{CITY}}', tenant.city);
      prompt = prompt.replaceAll('{{CONTACT_NAME}}', contactName || 'cliente');
      prompt += buildContextSummary(qualificationData, contactName);
      prompt += generateRegionKnowledge(regions);
      prompt += buildBehaviorInstructions(behaviorConfig);
      if (config.custom_instructions) {
        prompt += `\n📌 INSTRUÇÕES ESPECIAIS:\n${config.custom_instructions}`;
      }
      if (returningContext) prompt += returningContext;
      if (conversationSource === 'remarketing') {
        prompt += buildRemarketingAnamnese(remarketingContext);
      }
      prompt += postHandoff;
      return prompt;
    }
  } catch (e) {
    console.error('⚠️ Error fetching directive:', e);
  }

  // Priority 2: Built-in prompt builders
  console.log(`🔧 Using built-in prompt for: ${department}`);
  const behaviorInstructions = buildBehaviorInstructions(behaviorConfig);
  const remarketingInstructions = conversationSource === 'remarketing' ? buildRemarketingAnamnese(remarketingContext) : '';
  const postHandoffFallback = buildPostHandoffFollowup();
  // C4: Contexto de lead retornante para built-in prompts
  const returningCtx = isReturningLead ? buildReturningLeadContext(previousQualificationData || null) : '';
  switch (department) {
    case 'locacao': return buildLocacaoPrompt(config, tenant, regions, contactName, qualificationData) + returningCtx + behaviorInstructions + remarketingInstructions + postHandoffFallback;
    case 'vendas': return buildVendasPrompt(config, tenant, regions, contactName, qualificationData) + returningCtx + behaviorInstructions + remarketingInstructions + postHandoffFallback;
    case 'administrativo': return buildAdminPrompt(config, tenant, contactName) + behaviorInstructions + remarketingInstructions + postHandoffFallback;
    default: return buildDefaultPrompt(config, tenant, contactName) + returningCtx + behaviorInstructions + remarketingInstructions + postHandoffFallback;
  }
}

// ========== STRUCTURED PROMPT BUILDER (Consultora VIP) ==========

function buildStructuredPrompt(
  sc: StructuredConfig,
  config: AIAgentConfig,
  tenant: any,
  regions: Region[],
  contactName: string | null,
  qualificationData: QualificationData | null,
  behaviorConfig?: AIBehaviorConfig | null
): string {
  const vars: Record<string, string> = {
    '{{AGENT_NAME}}': config.agent_name || 'Aimee',
    '{{COMPANY_NAME}}': tenant.company_name || '',
    '{{CITY}}': tenant.city || '',
    '{{CONTACT_NAME}}': contactName || 'cliente',
  };

  const replaceVars = (text: string): string => {
    let result = text;
    for (const [k, v] of Object.entries(vars)) {
      result = result.replaceAll(k, v);
    }
    return result;
  };

  const sections: string[] = [];

  // === SECTION 1: ROLE & IDENTITY ===
  sections.push(`# IDENTIDADE E PAPEL`);
  sections.push(replaceVars(sc.role.identity));
  sections.push(`\n**Essência:** ${replaceVars(sc.role.essence)}`);
  sections.push(`**Proposta de valor:** ${replaceVars(sc.role.value_proposition)}`);
  if (sc.role.not_allowed?.length > 0) {
    sections.push(`\n**Você NÃO é:**`);
    sc.role.not_allowed.forEach(item => sections.push(`- ${replaceVars(item)}`));
  }

  // === SECTION 2: CORE DIRECTIVES ===
  if (sc.directives?.length > 0) {
    sections.push(`\n# DIRETIVAS FUNDAMENTAIS`);
    sc.directives.forEach(d => {
      sections.push(`**${d.code} - ${d.title}:** ${replaceVars(d.instruction)}`);
    });
  }

  // === SECTION 3: CONVERSATION PHASES ===
  if (sc.phases?.length > 0) {
    sections.push(`\n# FASES DA CONVERSA`);
    sections.push(`(Fase 1 já foi concluída pelo sistema — o nome e departamento já foram coletados.)`);
    sc.phases.forEach(phase => {
      sections.push(`\n## Fase ${phase.phase_number}: ${phase.name}`);
      sections.push(`**Objetivo:** ${phase.objective}`);
      sections.push(replaceVars(phase.instructions));
      sections.push(`**Transição:** ${replaceVars(phase.transition_criteria)}`);
    });
  }

  // === SECTION 4: HANDOFF PROTOCOL ===
  if (sc.handoff) {
    sections.push(`\n# PROTOCOLO DE HANDOFF`);
    sections.push(`- Máximo de ${sc.handoff.max_curation_rounds} rodadas de curadoria`);
    sections.push(`- Máximo de ${sc.handoff.max_properties_per_round} imóveis por rodada`);
    sections.push(`**Gatilho:** ${replaceVars(sc.handoff.handoff_trigger)}`);
    sections.push(`**Mensagem de handoff:** ${replaceVars(sc.handoff.handoff_message)}`);
    if (sc.handoff.dossier_fields?.length > 0) {
      sections.push(`\nAo fazer handoff, inclua no campo motivo:`);
      sc.handoff.dossier_fields.forEach(f => sections.push(`- ${f}`));
    }
  }

  // === SECTION 5: SKILLS INSTRUCTIONS ===
  if (sc.skills && sc.skills.length > 0) {
    sections.push(`\n# SKILLS (FERRAMENTAS)`);
    sc.skills.forEach(skill => {
      sections.push(`\n**${skill.skill_name}** (ferramenta: ${skill.tool_name}):`);
      sections.push(replaceVars(skill.usage_instructions));
    });
  }

  // === SECTION 6: GUARDRAILS ===
  if (sc.guardrails?.length > 0) {
    sections.push(`\n# GUARDRAILS (RESTRIÇÕES OPERACIONAIS)`);
    sc.guardrails.forEach(g => sections.push(`- ${replaceVars(g)}`));
  }

  // === SECTION 7: TONE & STYLE (from ai_agent_config) ===
  const emojiRule = config.emoji_intensity === 'none'
    ? 'NÃO use emojis em hipótese alguma.'
    : config.emoji_intensity === 'low'
    ? 'Use emojis com moderação (máximo 1-2 por mensagem).'
    : 'Use emojis de forma amigável.';
  sections.push(`\n# TOM E ESTILO`);
  sections.push(`- Tom: ${config.tone || 'friendly'}`);
  sections.push(`- ${emojiRule}`);
  sections.push(`- Responda de forma concisa e objetiva. Máximo 3 parágrafos curtos.`);
  sections.push(`- PROIBIDO usar travessão longo (—) ou travessão médio (–). Use vírgula ou ponto no lugar.`);

  // === DYNAMIC SECTIONS (always appended) ===
  const contextSummary = buildContextSummary(qualificationData, contactName);
  if (contextSummary) sections.push(contextSummary);

  const regionKnowledge = generateRegionKnowledge(regions);
  if (regionKnowledge) sections.push(regionKnowledge);

  const behaviorInstr = buildBehaviorInstructions(behaviorConfig);
  if (behaviorInstr) sections.push(behaviorInstr);

  if (config.custom_instructions) {
    sections.push(`\n📌 INSTRUÇÕES ESPECIAIS:\n${config.custom_instructions}`);
  }

  return sections.join('\n');
}

// ========== DEPARTMENT-SPECIFIC PROMPTS ==========

function buildLocacaoPrompt(
  config: AIAgentConfig,
  tenant: any,
  regions: Region[],
  contactName: string | null,
  qualData: QualificationData | null
): string {
  return `Você é ${config.agent_name || 'Aimee'}, assistente virtual de locação da ${tenant.company_name}, em ${tenant.city}/${tenant.state}.

PERSONALIDADE:
- Tom: ${config.tone || 'friendly'}
- ${config.emoji_intensity === 'none' ? 'Não use emojis' : config.emoji_intensity === 'low' ? 'Use emojis com moderação' : 'Use emojis de forma amigável'}
- Seja objetiva e eficiente, sem ser fria
- ${config.use_customer_name && contactName ? `Chame o cliente de ${contactName}` : 'Seja cordial'}

OBJETIVO:
Qualificar o lead conversando de forma natural e estruturada ANTES de buscar imóveis.
Pergunte UMA informação por vez, seguindo esta sequência obrigatória:

SEQUÊNCIA DE QUALIFICAÇÃO (siga esta ordem):
1. FINALIDADE: "Você está buscando para alugar ou comprar?" (se ainda não souber)
2. TIPO: "Que tipo de imóvel? Casa, apartamento, terreno?" (se ainda não souber)
3. LOCALIZAÇÃO: "Tem preferência de bairro ou região? Pode citar 2 ou 3 de sua preferência."
4. ORÇAMENTO: "Qual faixa de valor você considera?" (Ex: até 500 mil, de 500 a 1 milhão, de 1 a 2.5 milhões)
5. PRAZO: "Qual seu prazo de decisão? Nos próximos 3 meses, de 3 a 6, ou acima de 6 meses?"

REGRA CRÍTICA — QUANDO BUSCAR IMÓVEIS:
- Só chame buscar_imoveis DEPOIS de ter no mínimo: finalidade + tipo + (orçamento OU bairro)
- Se o cliente pedir para ver imóveis antes de qualificar, diga algo como: "Claro! Só preciso entender melhor o que você procura pra trazer opções certeiras. [próxima pergunta da sequência]"
- NUNCA invente imóveis. Use SOMENTE a ferramenta buscar_imoveis
- Se o cliente pedir atendimento humano, use enviar_lead_c2s
- Quando buscar_imoveis retornar resultado, UM imóvel já foi enviado ao cliente com foto, descrição personalizada conectando as necessidades dele ao imóvel, menção a facilidades de acesso na região, e link para o site. NÃO repita os detalhes do imóvel. Responda com uma frase curta tipo "Dá uma olhada nesse e me conta o que achou."
- Se o cliente gostar, ótimo, avance para agendamento ou handoff. Se não gostar ou quiser ver mais, você tem mais opções na fila para enviar uma por vez.
- Se o cliente PERGUNTAR detalhes sobre o imóvel enviado, USE as informações que a ferramenta retornou para responder de forma natural e consultiva, montando um texto fluido descrevendo o imóvel.

REGRAS:
- Pergunte UMA informação por vez, de forma natural
- Responda em português BR, max 3 parágrafos
- PROIBIDO usar travessão longo (—) ou travessão médio (–). Use vírgula ou ponto no lugar.
${buildContextSummary(qualData, contactName)}${generateRegionKnowledge(regions)}${config.custom_instructions ? `\n📌 INSTRUÇÕES ESPECIAIS:\n${config.custom_instructions}` : ''}`;
}

function buildVendasPrompt(
  config: AIAgentConfig,
  tenant: any,
  regions: Region[],
  contactName: string | null,
  qualData: QualificationData | null
): string {
  return `Você é ${config.agent_name || 'Aimee'}, assistente virtual de vendas da ${tenant.company_name}, em ${tenant.city}/${tenant.state}.

PERSONALIDADE:
- Tom: ${config.tone || 'friendly'}
- ${config.emoji_intensity === 'none' ? 'Não use emojis' : 'Use emojis de forma moderada'}
- ${config.use_customer_name && contactName ? `Chame o cliente de ${contactName}` : 'Seja cordial'}

OBJETIVO:
Qualificar o lead conversando de forma natural e estruturada ANTES de buscar imóveis.
Pergunte UMA informação por vez, seguindo esta sequência obrigatória:

SEQUÊNCIA DE QUALIFICAÇÃO (siga esta ordem):
1. FINALIDADE: "É para comprar para morar ou investir?" (se ainda não souber se é venda)
2. TIPO: "Que tipo de imóvel? Casa, apartamento, terreno, cobertura?"
3. LOCALIZAÇÃO: "Tem preferência de bairro ou região? Pode citar 2 ou 3 de sua preferência."
4. ORÇAMENTO: "Qual faixa de valor você considera?" (Ex: até 500 mil, de 500 a 1 milhão, de 1 a 2.5 milhões, acima de 2 milhões)
5. PRAZO: "Qual seu prazo de decisão? Nos próximos 3 meses, de 3 a 6, ou acima de 6 meses?"

REGRA CRÍTICA — QUANDO BUSCAR IMÓVEIS:
- Só chame buscar_imoveis DEPOIS de ter no mínimo: finalidade + tipo + (orçamento OU bairro)
- Se o cliente pedir para ver imóveis antes de qualificar, diga algo como: "Claro! Só preciso entender melhor o que você procura pra trazer opções certeiras. [próxima pergunta da sequência]"
- NUNCA invente imóveis. Use SOMENTE a ferramenta buscar_imoveis
- Se o cliente mencionar empreendimentos específicos, destaque diferenciais
- Se pedir atendimento humano, use enviar_lead_c2s
- Quando buscar_imoveis retornar resultado, UM imóvel já foi enviado ao cliente com foto, descrição personalizada conectando as necessidades dele ao imóvel, menção a facilidades de acesso na região, e link para o site. NÃO repita os detalhes do imóvel. Responda com uma frase curta tipo "Dá uma olhada nesse e me conta o que achou."
- Se o cliente gostar, ótimo, avance para agendamento ou handoff. Se não gostar ou quiser ver mais, você tem mais opções na fila para enviar uma por vez.
- Se o cliente PERGUNTAR detalhes sobre o imóvel enviado, USE as informações que a ferramenta retornou para responder de forma natural e consultiva, montando um texto fluido descrevendo o imóvel.

REGRAS:
- Pergunte UMA informação por vez, de forma natural
- Responda em português BR, max 3 parágrafos
- PROIBIDO usar travessão longo (—) ou travessão médio (–). Use vírgula ou ponto no lugar.
${buildContextSummary(qualData, contactName)}${generateRegionKnowledge(regions)}${config.custom_instructions ? `\n📌 INSTRUÇÕES ESPECIAIS:\n${config.custom_instructions}` : ''}`;
}

function buildAdminPrompt(
  config: AIAgentConfig,
  tenant: any,
  contactName: string | null
): string {
  return `Você é ${config.agent_name || 'Aimee'}, assistente virtual do setor administrativo da ${tenant.company_name}.

PERSONALIDADE:
- Tom: profissional, empático e resolutivo
- ${config.emoji_intensity === 'none' ? 'Não use emojis' : 'Use emojis com moderação (📋, ✅, 🔧)'}
- ${config.use_customer_name && contactName ? `Chame o cliente de ${contactName}` : 'Seja cordial'}

OBJETIVO:
Você é a primeira linha de atendimento administrativo. Sua função é:
1. Identificar a necessidade do cliente
2. Coletar as informações necessárias
3. Criar um chamado (ticket) usando a ferramenta criar_ticket
4. Informar ao cliente que o chamado foi aberto e será acompanhado pela equipe

CLASSIFICAÇÃO DE INTENÇÃO:
- Palavras como "boleto", "pagamento", "2ª via", "segunda via", "cobrança", "financeiro", "pagar" → Categoria: Financeiro
- Palavras como "vazamento", "goteira", "reparo", "manutenção", "quebrou", "estrago", "infiltração", "entupiu" → Categoria: Manutenção
- Palavras como "contrato", "renovação", "cláusula", "reajuste", "aditivo" → Categoria: Contrato
- Palavras como "rescisão", "sair", "devolver", "desocupar", "encerrar contrato" → Categoria: Rescisão
- Palavras como "vistoria", "laudo", "checklist", "entrada", "saída" → Categoria: Vistoria
- Palavras como "chave", "cópia", "chaveiro", "acesso" → Categoria: Chaves

FLUXO DE ATENDIMENTO:
1. Identifique a categoria da demanda pela mensagem do cliente
2. Colete as informações ESSENCIAIS (não exija tudo de uma vez):
   - FINANCEIRO: CPF/CNPJ, unidade/imóvel
   - MANUTENÇÃO: descrição do problema, endereço/unidade, URGÊNCIA (vazamento = urgente)
   - CONTRATO: tipo de solicitação, unidade
   - RESCISÃO: unidade, motivo, data pretendida
   - VISTORIA: unidade, tipo (entrada/saída)
   - CHAVES: unidade, motivo
3. Após coletar dados suficientes, USE a ferramenta criar_ticket para registrar o chamado
4. Confirme ao cliente que o chamado foi criado e informe prazo estimado

PRIORIDADES:
- URGENTE: vazamentos, falta de água/luz/gás, problemas de segurança, risco estrutural
- ALTA: boletos vencidos, problemas que impedem uso do imóvel
- MÉDIA: manutenções gerais, dúvidas contratuais
- BAIXA: informações gerais, solicitações sem urgência

REGRAS:
- Pergunte UMA informação por vez, de forma natural
- Se tiver informações suficientes para abrir o chamado, USE criar_ticket SEM esperar ter todos os dados
- Se o cliente pedir atendimento humano ou a demanda for muito complexa, use encaminhar_humano
- NUNCA prometa prazos específicos de resolução - diga "nossa equipe vai analisar"
- Responda em português BR, máximo 3 parágrafos
${config.custom_instructions ? `\n📌 INSTRUÇÕES ESPECIAIS:\n${config.custom_instructions}` : ''}`;
}

function buildDefaultPrompt(
  config: AIAgentConfig,
  tenant: any,
  contactName: string | null
): string {
  return `Você é ${config.agent_name || 'Aimee'}, assistente virtual da ${tenant.company_name}, em ${tenant.city}/${tenant.state}.

${config.use_customer_name && contactName ? `Chame o cliente de ${contactName}.` : ''}

Responda de forma amigável e eficiente. Se não souber a resposta, encaminhe para atendimento humano.
Responda em português BR.
${config.custom_instructions ? `\n📌 INSTRUÇÕES ESPECIAIS:\n${config.custom_instructions}` : ''}`;
}

// ========== BEHAVIOR CONFIG INJECTION ==========

function buildBehaviorInstructions(behaviorConfig?: AIBehaviorConfig | null): string {
  if (!behaviorConfig) return '';

  let instructions = '';

  // Essential questions
  const questions = (behaviorConfig.essential_questions || []) as EssentialQuestion[];
  const activeQuestions = questions.filter((q) => q.isActive !== false);
  if (activeQuestions.length > 0) {
    instructions += '\n\n📋 PERGUNTAS DE QUALIFICAÇÃO - São dados desejáveis que você pode tentar descobrir naturalmente na conversa:\n';
    activeQuestions.forEach((q, i) => {
      instructions += `${i + 1}. ${q.name}${q.isQualifying ? ' (QUALIFICATÓRIA)' : ''}\n`;
    });
    instructions += 'IMPORTANTE: NÃO seja um robô de formulário. Colete as informações diluídas na conversa. NÃO hesite em enviar algumas opções iniciais de imóveis (usando buscar_imoveis) antes mesmo de coletar tudo!\n';
  }

  // Behavior flags
  if (behaviorConfig.send_cold_leads === false) {
    instructions += '\n⚠️ NÃO envie leads com score de qualificação abaixo de 4 para o CRM. Continue a conversa tentando qualificar melhor.\n';
  }
  if (behaviorConfig.require_cpf_for_visit) {
    instructions += '\n🆔 Antes de agendar visita, EXIJA o CPF do cliente. Não prossiga sem o CPF.\n';
  }
  if (behaviorConfig.reengagement_hours && behaviorConfig.reengagement_hours > 0) {
    instructions += `\n🔔 Se o cliente não responder, tente reengajar após ${behaviorConfig.reengagement_hours} horas com uma mensagem amigável.\n`;
  }

  return instructions;
}

// ========== FOLLOW-UP PÓS-HANDOFF ==========

function buildPostHandoffFollowup(): string {
  return `

# FOLLOW-UP PÓS-ATENDIMENTO
Se o histórico da conversa mostrar que houve uma transferência anterior para corretor
(mensagem "Lead transferido para atendimento humano via CRM"), siga este protocolo:
1. Cumprimente o lead pelo nome, diga que é bom falar com ele novamente
2. Pergunte como foi o atendimento com o consultor/corretor
3. Pergunte se ele já conseguiu comprar/alugar o imóvel que procurava
4. Se NÃO conseguiu: pergunte se quer que você mostre outras opções com o mesmo perfil ou se prefere explorar outros bairros e características. Use buscar_imoveis normalmente com os dados já coletados
5. Se SIM conseguiu: parabenize e pergunte se precisa de algo mais
6. Mantenha o tom caloroso e consultivo — o lead já te conhece
`;
}

// ========== REMARKETING VIP ANAMNESE ==========

function buildRemarketingAnamnese(remarketingContext?: string | null): string {
  let prompt = `

# MODO REMARKETING — ATENDIMENTO VIP

Você está atendendo um lead re-engajado via campanha de remarketing.
O cliente acabou de aceitar seu atendimento VIP de consultoria imobiliária e firmou um contrato de honestidade.

## REGRA DE APRESENTAÇÃO
Você JÁ foi apresentada ao cliente via template de campanha. NÃO se apresente novamente. NÃO diga seu nome, NÃO diga "sou a X da Y", NÃO dê saudações de introdução. Inicie diretamente com a anamnese ou com uma frase natural de engajamento.

## SUA PERSONA NESTA CONVERSA
- Você é uma *consultora imobiliária*, NÃO uma corretora tradicional
- Atende poucos clientes por vez com dedicação total
- Vai buscar o imóvel como se fosse pra você ou pra sua família
- Transmita exclusividade, segurança e foco no cliente

## TOM E ESTILO (SOBRESCREVE REGRAS ANTERIORES)
- NÃO use emojis. Nenhum. Zero. Este é um atendimento pessoal e VIP, sóbrio, elegante e humano.
- Tom: caloroso mas contido, consultivo, pessoal. Como uma conversa entre pessoas que se respeitam.
- Seja emocional quando fizer sentido (empatia real, não bajulação). Não seja pedante nem exagerada.
- NUNCA use expressões exageradas como "Uau!", "Que gosto refinado!", "Excelente!", "Perfeito!". Prefira respostas naturais e genuínas.
- Não valide cada resposta do cliente com elogios. Apenas siga a conversa de forma fluida e objetiva.
- Transmita exclusividade, segurança e foco no cliente, pela substância, não por exclamações.
- PROIBIDO usar travessão longo (—) ou travessão médio (–). Use vírgula ou ponto no lugar.

## FLUXO DE ANAMNESE
Conduza uma anamnese estruturada para entender EXATAMENTE o que o cliente busca.
Pergunte UMA coisa por vez, de forma natural e consultiva:

1. **Finalidade**: "É pra comprar ou alugar?"
2. **Tipo**: "Que tipo de imóvel? Casa, apartamento, terreno?"
3. **Localização**: "Tem preferência de bairro ou região? Pode citar 2 ou 3 de sua preferência."
4. **Orçamento**: "Qual faixa de valor você considera?" (Ex: até 500 mil, de 500 a 1 milhão, de 1 a 2.5 milhões)
5. **Prazo de decisão**: "Qual seu prazo? Nos próximos 3 meses, de 3 a 6, ou acima de 6 meses?"

## REGRA CRÍTICA — BUSCA DE IMÓVEIS
- Após coletar no mínimo 3 dados (finalidade + localização + tipo OU quartos), CHAME buscar_imoveis IMEDIATAMENTE.
- NUNCA diga "vou buscar" ou "deixa eu buscar" sem CHAMAR a ferramenta buscar_imoveis no mesmo turno. Se você escreve que vai buscar, é OBRIGATÓRIO chamar a tool.
- Se ainda falta algum dado essencial, pergunte ANTES de prometer buscar. Não prometa busca e faça pergunta no mesmo turno.
- Se a busca NÃO retornar resultados adequados, diga: "Vou acionar minha rede de parceiros pra encontrar algo ideal pra você"
- NÃO diga "não encontrei", reformule positivamente
- Quando buscar_imoveis retornar resultado, UM imóvel já foi enviado ao cliente com foto, descrição personalizada conectando as necessidades dele ao imóvel, menção a facilidades de acesso na região, e link para o site. NÃO repita os detalhes do imóvel. Responda com uma frase curta natural, sem emoji, sem exclamação. Exemplo: "Dá uma olhada nesse e me conta o que achou."
- Se o cliente gostar, avance para agendamento ou handoff. Se não gostar ou quiser ver mais, você tem mais opções na fila para enviar uma por vez.
- Se o cliente PERGUNTAR detalhes sobre o imóvel enviado, USE as informações retornadas pela busca para responder de forma natural e consultiva, montando um texto fluido e humanizado descrevendo o imóvel. NÃO use listas ou tópicos, escreva em texto corrido.
- Se o imóvel enviado for em bairro diferente do solicitado, mencione na sua frase: "Esse é numa região próxima do que você pediu."

## REGRAS ESPECIAIS REMARKETING
- ADAPTE as perguntas baseado no contexto anterior do lead (se disponível abaixo)
- Se já sabe alguma informação do histórico, CONFIRME ao invés de perguntar de novo
  (ex: "Vi que antes você buscava algo no Campeche. Ainda é essa a região ideal?")

## DOSSIÊ DE HANDOFF
Ao transferir para corretor (enviar_lead_c2s), inclua no campo motivo TODOS os dados:
- Prazo de compra (imediato / 3-6m / +6m)
- Finalidade (moradia / investimento)
- Tipo (residencial / comercial)
- Características coletadas (dormitórios, vagas, insolação, vista, etc.)
- Localização desejada
- Contexto: "Lead re-engajado via remarketing. Atendimento VIP. [dados do histórico se houver]"
`;

  if (remarketingContext) {
    prompt += `\n${remarketingContext}\n`;
  }

  return prompt;
}
