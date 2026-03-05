// ========== AIMEE.iA v2 - PROMPTS ==========
// Priority: ai_directives (DB) → ai_department_configs (DB) → hardcoded fallback
// NO hardcoded client names. Everything from config/tenant.

import { AIAgentConfig, AIBehaviorConfig, EssentialQuestion, ConversationMessage, QualificationData, DepartmentType, StructuredConfig, SkillConfig } from './types.ts';
import { generateRegionKnowledge } from './regions.ts';
import { Region } from './types.ts';
import { formatCurrency } from './utils.ts';

// ========== CONTEXT SUMMARY (anti-loop) ==========

export function buildContextSummary(qualificationData: QualificationData | null): string {
  if (!qualificationData) return '';

  const collected: string[] = [];
  if (qualificationData.detected_neighborhood) collected.push(`📍 Região: ${qualificationData.detected_neighborhood}`);
  if (qualificationData.detected_property_type) collected.push(`🏠 Tipo: ${qualificationData.detected_property_type}`);
  if (qualificationData.detected_bedrooms) collected.push(`🛏️ Quartos: ${qualificationData.detected_bedrooms}`);
  if (qualificationData.detected_budget_max) collected.push(`💰 Orçamento: até ${formatCurrency(qualificationData.detected_budget_max)}`);
  if (qualificationData.detected_interest) collected.push(`🎯 Objetivo: ${qualificationData.detected_interest}`);

  if (collected.length === 0) return '';
  return `\n📋 DADOS JÁ COLETADOS (NÃO PERGUNTE DE NOVO):\n${collected.join('\n')}\n`;
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
  preloadedDirective?: any | null
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

    // Priority 1A: Structured config (Consultora VIP pattern)
    if (directive?.structured_config) {
      return buildStructuredPrompt(
        directive.structured_config as StructuredConfig,
        config, tenant, regions, contactName, qualificationData, behaviorConfig
      );
    }

    // Priority 1B: Flat text directive (legacy)
    if (directive?.directive_content) {
      let prompt = directive.directive_content;
      prompt = prompt.replaceAll('{{AGENT_NAME}}', config.agent_name || 'Aimee');
      prompt = prompt.replaceAll('{{COMPANY_NAME}}', tenant.company_name);
      prompt = prompt.replaceAll('{{CITY}}', tenant.city);
      prompt = prompt.replaceAll('{{CONTACT_NAME}}', contactName || 'cliente');
      prompt += buildContextSummary(qualificationData);
      prompt += generateRegionKnowledge(regions);
      prompt += buildBehaviorInstructions(behaviorConfig);
      if (config.custom_instructions) {
        prompt += `\n📌 INSTRUÇÕES ESPECIAIS:\n${config.custom_instructions}`;
      }
      return prompt;
    }
  } catch (e) {
    console.error('⚠️ Error fetching directive:', e);
  }

  // Priority 2: Built-in prompt builders
  console.log(`🔧 Using built-in prompt for: ${department}`);
  const behaviorInstructions = buildBehaviorInstructions(behaviorConfig);
  switch (department) {
    case 'locacao': return buildLocacaoPrompt(config, tenant, regions, contactName, qualificationData) + behaviorInstructions;
    case 'vendas': return buildVendasPrompt(config, tenant, regions, contactName, qualificationData) + behaviorInstructions;
    case 'administrativo': return buildAdminPrompt(config, tenant, contactName) + behaviorInstructions;
    default: return buildDefaultPrompt(config, tenant, contactName) + behaviorInstructions;
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

  // === DYNAMIC SECTIONS (always appended) ===
  const contextSummary = buildContextSummary(qualificationData);
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
Qualificar o lead conversando de forma natural. 
Não seja uma máquina de perguntas. Use a ferramenta buscar_imoveis ASSIM QUE POSSÍVEL, mesmo com poucas informações (ex: apenas bairro ou tipo), para manter o lead interessado. Use a ferramenta IMEDIATAMENTE se o usuário pedir para ver imóveis.

REGRAS:
- NUNCA invente imóveis. Use SOMENTE a ferramenta buscar_imoveis
- Pergunte UMA informação por vez
- Se o cliente pedir atendimento humano, use enviar_lead_c2s
- Responda em português BR, max 3 parágrafos
${buildContextSummary(qualData)}${generateRegionKnowledge(regions)}${config.custom_instructions ? `\n📌 INSTRUÇÕES ESPECIAIS:\n${config.custom_instructions}` : ''}`;
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
Qualificar o lead de forma natural e rápida. Não seja uma máquina de perguntas!
Assim que tiver 1 ou 2 dados (ex: Campeche e até 3M), USE A FERRAMENTA buscar_imoveis para enviar opções. Se o lead pedir para ver imóveis AGORA, chame a ferramenta AGORA MESMO.

REGRAS:
- NUNCA invente imóveis. Use SOMENTE buscar_imoveis
- Pergunte UMA informação por vez
- Se o cliente mencionar empreendimentos específicos, destaque diferenciais
- Se pedir atendimento humano, use enviar_lead_c2s
- Responda em português BR, max 3 parágrafos
${buildContextSummary(qualData)}${generateRegionKnowledge(regions)}${config.custom_instructions ? `\n📌 INSTRUÇÕES ESPECIAIS:\n${config.custom_instructions}` : ''}`;
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
