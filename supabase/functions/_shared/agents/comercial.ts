// ========== AIMEE.iA v2 - AGENTE COMERCIAL ==========
// Handles: locação + vendas departments.
// Focused prompt (~1.2K tokens), property search + CRM handoff tools.

import { AgentModule, AgentContext } from './agent-interface.ts';
import { executePropertySearch, executeLeadHandoff } from './tool-executors.ts';
import { buildContextSummary } from '../prompts.ts';
import { generateRegionKnowledge } from '../regions.ts';
import { isLoopingQuestion, isRepetitiveMessage, updateAntiLoopState } from '../anti-loop.ts';
import { isQualificationComplete } from '../qualification.ts';
import { SkillConfig, StructuredConfig } from '../types.ts';

// ========== SYSTEM PROMPT ==========

function buildComercialPrompt(ctx: AgentContext): string {
  const { aiConfig: config, tenant, regions, contactName, qualificationData: qualData, department, behaviorConfig, structuredConfig: sc } = ctx;

  // Priority 1: Structured config (Consultora VIP pattern)
  if (sc) {
    return buildStructuredComercialPrompt(ctx, sc);
  }

  // Priority 2: Legacy directive_content
  if (ctx.directive?.directive_content) {
    return buildLegacyDirectivePrompt(ctx);
  }

  // Priority 3: Built-in fallback
  const isLocacao = department === 'locacao';
  const finalidade = isLocacao ? 'locação' : 'vendas';

  return `Você é ${config.agent_name || 'Aimee'}, assistente virtual de ${finalidade} da ${tenant.company_name}, em ${tenant.city}/${tenant.state}.

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
${buildContextSummary(qualData, contactName)}${generateRegionKnowledge(regions)}${buildBehaviorInstructionsLocal(ctx)}${config.custom_instructions ? `\n📌 INSTRUÇÕES ESPECIAIS:\n${config.custom_instructions}` : ''}${buildPostHandoffFollowup()}`;
}

function buildStructuredComercialPrompt(ctx: AgentContext, sc: StructuredConfig): string {
  const { aiConfig: config, tenant, regions, contactName, qualificationData: qualData, behaviorConfig } = ctx;

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

  // Identity
  sections.push(`# IDENTIDADE E PAPEL`);
  sections.push(replaceVars(sc.role.identity));
  sections.push(`\n**Essência:** ${replaceVars(sc.role.essence)}`);
  sections.push(`**Proposta de valor:** ${replaceVars(sc.role.value_proposition)}`);
  if (sc.role.not_allowed?.length > 0) {
    sections.push(`\n**Você NÃO é:**`);
    sc.role.not_allowed.forEach(item => sections.push(`- ${replaceVars(item)}`));
  }

  // Directives
  if (sc.directives?.length > 0) {
    sections.push(`\n# DIRETIVAS FUNDAMENTAIS`);
    sc.directives.forEach(d => {
      sections.push(`**${d.code} - ${d.title}:** ${replaceVars(d.instruction)}`);
    });
  }

  // Phases (2-4)
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

  // Handoff protocol
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

  // Skills
  if (sc.skills && sc.skills.length > 0) {
    sections.push(`\n# SKILLS (FERRAMENTAS)`);
    sc.skills.forEach(skill => {
      sections.push(`\n**${skill.skill_name}** (ferramenta: ${skill.tool_name}):`);
      sections.push(replaceVars(skill.usage_instructions));
    });
  }

  // Guardrails
  if (sc.guardrails?.length > 0) {
    sections.push(`\n# GUARDRAILS (RESTRIÇÕES OPERACIONAIS)`);
    sc.guardrails.forEach(g => sections.push(`- ${replaceVars(g)}`));
  }

  // Tone & Style
  const emojiRule = config.emoji_intensity === 'none'
    ? 'NÃO use emojis em hipótese alguma.'
    : config.emoji_intensity === 'low'
    ? 'Use emojis com moderação (máximo 1-2 por mensagem).'
    : 'Use emojis de forma amigável.';
  sections.push(`\n# TOM E ESTILO`);
  sections.push(`- Tom: ${config.tone || 'friendly'}`);
  sections.push(`- ${emojiRule}`);
  sections.push(`- Responda de forma concisa e objetiva. Máximo 3 parágrafos curtos.`);

  // Dynamic sections
  const contextSummary = buildContextSummary(qualData, contactName);
  if (contextSummary) sections.push(contextSummary);

  const regionKnowledge = generateRegionKnowledge(regions);
  if (regionKnowledge) sections.push(regionKnowledge);

  const behaviorInstr = buildBehaviorInstructionsLocal(ctx);
  if (behaviorInstr) sections.push(behaviorInstr);

  if (config.custom_instructions) {
    sections.push(`\n📌 INSTRUÇÕES ESPECIAIS:\n${config.custom_instructions}`);
  }

  sections.push(buildPostHandoffFollowup());

  return sections.join('\n');
}

function buildLegacyDirectivePrompt(ctx: AgentContext): string {
  const { aiConfig: config, tenant, contactName, qualificationData: qualData, regions, behaviorConfig } = ctx;

  let prompt = ctx.directive.directive_content;
  prompt = prompt.replaceAll('{{AGENT_NAME}}', config.agent_name || 'Aimee');
  prompt = prompt.replaceAll('{{COMPANY_NAME}}', tenant.company_name);
  prompt = prompt.replaceAll('{{CITY}}', tenant.city);
  prompt = prompt.replaceAll('{{CONTACT_NAME}}', contactName || 'cliente');
  prompt += buildContextSummary(qualData, contactName);
  prompt += generateRegionKnowledge(regions);
  prompt += buildBehaviorInstructionsLocal(ctx);
  if (config.custom_instructions) {
    prompt += `\n📌 INSTRUÇÕES ESPECIAIS:\n${config.custom_instructions}`;
  }
  prompt += buildPostHandoffFollowup();
  return prompt;
}

// ========== TOOLS ==========

function getComercialTools(ctx: AgentContext): any[] {
  const skills = ctx.structuredConfig?.skills;
  const baseTools = [
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
              description: "Tipo de imóvel desejado pelo cliente. Use EXATAMENTE o tipo que o cliente pediu.",
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
  ];

  if (!skills || skills.length === 0) return baseTools;

  return baseTools.map(tool => {
    const skill = skills.find((s: SkillConfig) => s.tool_name === tool.function.name);
    if (skill) {
      return { ...tool, function: { ...tool.function, description: skill.enhanced_description || tool.function.description } };
    }
    return tool;
  });
}

// ========== HELPERS ==========

function buildBehaviorInstructionsLocal(ctx: AgentContext): string {
  const behaviorConfig = ctx.behaviorConfig;
  if (!behaviorConfig) return '';

  let instructions = '';

  const questions = (behaviorConfig.essential_questions || []).filter((q: any) => q.isActive !== false);
  if (questions.length > 0) {
    instructions += '\n\n📋 PERGUNTAS DE QUALIFICAÇÃO - São dados desejáveis que você pode tentar descobrir naturalmente na conversa:\n';
    questions.forEach((q: any, i: number) => {
      instructions += `${i + 1}. ${q.name}${q.isQualifying ? ' (QUALIFICATÓRIA)' : ''}\n`;
    });
    instructions += 'IMPORTANTE: NÃO seja um robô de formulário. Colete as informações diluídas na conversa. NÃO hesite em enviar algumas opções iniciais de imóveis (usando buscar_imoveis) antes mesmo de coletar tudo!\n';
  }

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

// ========== AGENT MODULE EXPORT ==========

export const comercialAgent: AgentModule = {
  buildSystemPrompt(ctx: AgentContext): string {
    return buildComercialPrompt(ctx);
  },

  getTools(ctx: AgentContext): any[] {
    return getComercialTools(ctx);
  },

  async executeToolCall(ctx: AgentContext, toolName: string, args: any): Promise<string> {
    console.log(`🔧 [Comercial] Executing tool: ${toolName}`, args);
    if (toolName === 'buscar_imoveis') return await executePropertySearch(ctx, args);
    if (toolName === 'enviar_lead_c2s') return await executeLeadHandoff(ctx, args);
    return `Ferramenta desconhecida: ${toolName}`;
  },

  async postProcess(ctx: AgentContext, aiResponse: string): Promise<string> {
    let finalResponse = aiResponse;

    if (isLoopingQuestion(finalResponse, ctx.qualificationData)) {
      const contextSummary = buildContextSummary(ctx.qualificationData);
      finalResponse = isQualificationComplete(ctx.qualificationData)
        ? `Com base no que conversamos, já tenho um bom perfil. Quer que eu busque opções pra você agora?`
        : `${contextSummary}\n\nBaseado no que já conversamos, posso te ajudar com mais alguma coisa?`;
    }

    if (isRepetitiveMessage(finalResponse, ctx.lastAiMessages)) {
      finalResponse = ctx.aiConfig.fallback_message || 'Posso te ajudar com mais alguma coisa?';
    }

    await updateAntiLoopState(ctx.supabase, ctx.tenantId, ctx.phoneNumber, finalResponse);

    return finalResponse;
  },
};
