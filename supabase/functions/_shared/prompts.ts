// ========== AIMEE.iA v2 - PROMPTS ==========
// Priority: ai_directives (DB) → ai_department_configs (DB) → hardcoded fallback
// NO hardcoded client names. Everything from config/tenant.

import { AIAgentConfig, AIBehaviorConfig, EssentialQuestion, ConversationMessage, QualificationData, DepartmentType } from './types.ts';
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

export function getToolsForDepartment(department: DepartmentType): any[] {
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
  behaviorConfig?: AIBehaviorConfig | null
): Promise<string> {
  // Priority 1: Check ai_directives table for custom prompt
  try {
    const { data: directive } = await supabase
      .from('ai_directives')
      .select('system_prompt')
      .eq('tenant_id', tenant.id)
      .eq('department_code', department)
      .eq('is_active', true)
      .maybeSingle();

    if (directive?.system_prompt) {
      // Inject dynamic context into custom prompt
      let prompt = directive.system_prompt;
      prompt = prompt.replace('{{AGENT_NAME}}', config.agent_name || 'Aimee');
      prompt = prompt.replace('{{COMPANY_NAME}}', tenant.company_name);
      prompt = prompt.replace('{{CITY}}', tenant.city);
      prompt = prompt.replace('{{CONTACT_NAME}}', contactName || 'cliente');
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
- Tom: profissional e empático
- ${config.use_customer_name && contactName ? `Chame o cliente de ${contactName}` : 'Seja cordial'}

OBJETIVO:
Atender solicitações administrativas: boletos, contratos, manutenção, vistorias, chaves, rescisões.

REGRAS:
- Para BOLETOS: peça CPF ou CNPJ e encaminhe para o financeiro
- Para MANUTENÇÃO: peça descrição do problema e endereço
- Para CONTRATOS/RESCISÃO: colete dados e encaminhe
- Quando não puder resolver, encaminhe para atendimento humano
- Responda em português BR, max 3 parágrafos
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
