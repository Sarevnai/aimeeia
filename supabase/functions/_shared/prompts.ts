// ========== AIMEE.iA v2 - PROMPTS ==========
// Priority: ai_directives (DB) → ai_department_configs (DB) → hardcoded fallback
// NO hardcoded client names. Everything from config/tenant.

import { AIAgentConfig, ConversationMessage, QualificationData, DepartmentType } from './types.ts';
import { Region, generateRegionKnowledge } from './regions.ts';
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
          description: "Busca imóveis no catálogo. Use quando o cliente tiver informado região/bairro.",
          parameters: {
            type: "object",
            properties: {
              tipo: { type: "string", description: "Tipo do imóvel", enum: ["apartamento", "casa", "terreno", "comercial", "cobertura", "kitnet", "sobrado", "sala"] },
              bairro: { type: "string", description: "Nome do bairro" },
              cidade: { type: "string", description: "Nome da cidade" },
              preco_min: { type: "number", description: "Valor mínimo em reais" },
              preco_max: { type: "number", description: "Valor máximo em reais" },
              quartos: { type: "number", description: "Número de dormitórios" },
              finalidade: { type: "string", description: "Use 'locacao' para alugar, 'venda' para comprar", enum: ["venda", "locacao"] },
            },
            required: ["finalidade"],
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
  conversationHistory: ConversationMessage[]
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
  switch (department) {
    case 'locacao': return buildLocacaoPrompt(config, tenant, regions, contactName, qualificationData);
    case 'vendas': return buildVendasPrompt(config, tenant, regions, contactName, qualificationData);
    case 'administrativo': return buildAdminPrompt(config, tenant, contactName);
    default: return buildDefaultPrompt(config, tenant, contactName);
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
Qualificar o lead para locação coletando: região/bairro, tipo de imóvel, quartos, orçamento.
Quando tiver dados suficientes, use a ferramenta buscar_imoveis.

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
Qualificar o lead para compra coletando: região, tipo, quartos, faixa de investimento.
Use buscar_imoveis quando tiver dados suficientes.

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
