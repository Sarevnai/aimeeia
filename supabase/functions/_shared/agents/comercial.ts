// ========== AIMEE.iA v2 - AGENTE COMERCIAL ==========
// Handles: locação + vendas departments.
// Focused prompt (~1.2K tokens), property search + CRM handoff tools.

import { AgentModule, AgentContext } from './agent-interface.ts';
import { executePropertySearch, executeLeadHandoff, executeGetNearbyPlaces, executeDepartmentTransfer } from './tool-executors.ts';
import { buildContextSummary, buildReturningLeadContext, buildFirstTurnContext, buildMultilingualDirective } from '../prompts.ts';
import { generateRegionKnowledge } from '../regions.ts';
import { isLoopingQuestion, isRepetitiveMessage, updateAntiLoopState, getRotatingFallback, sanitizeReasoningLeak } from '../anti-loop.ts';
import { isQualificationComplete } from '../qualification.ts';
import { SkillConfig, StructuredConfig, AiModule } from '../types.ts';
import { resolveContactNameForPrompt } from '../utils.ts';
import { runPreCompletionChecks } from './pre-completion-check.ts';

// ========== MODULE-BASED PROMPT ==========

function buildModularPrompt(ctx: AgentContext, modules: AiModule[]): string {
  const { aiConfig: config, tenant, regions, contactName, qualificationData: qualData, currentModuleSlug, behaviorConfig } = ctx;

  const sections: string[] = [];

  // Identity (XML format consistent with existing prompts)
  sections.push(`<identity>
Você é ${config.agent_name || 'Aimee'}, assistente virtual da ${tenant.company_name}, em ${tenant.city}/${tenant.state}.
Tom: ${config.tone || 'friendly'}.
${config.emoji_intensity === 'none' ? 'NÃO use emojis em hipótese alguma.' : config.emoji_intensity === 'low' ? 'Use emojis com moderação (máximo 1-2 por mensagem).' : 'Use emojis de forma amigável.'}
Responda de forma concisa e objetiva. Máximo 3 parágrafos curtos.
${config.use_customer_name && contactName ? `Chame o cliente de ${contactName}.` : 'Seja cordial.'}
</identity>`);

  // First-turn context — instruct the agent to open the dialogue instead of relying on hardcoded triage
  const firstTurnCtx = buildFirstTurnContext({
    isFirstTurn: !!ctx.isFirstTurn,
    contactName: contactName || null,
    userMessage: ctx.userMessage || '',
    agentName: config.agent_name || 'Aimee',
    companyName: tenant.company_name,
    conversationSource: ctx.conversationSource,
  });
  if (firstTurnCtx) sections.push(firstTurnCtx);

  // Module menu — tells the LLM which modules are available
  const moduleList = modules.map(mod => {
    const criteria = mod.activation_criteria ? ` | Ativar quando: ${mod.activation_criteria}` : '';
    return `  - ${mod.slug}: ${mod.name}${criteria}`;
  }).join('\n');

  sections.push(`<modules>
SISTEMA DE MÓDULOS DE INTELIGÊNCIA
Você opera em módulos especializados. Analise o contexto da conversa e DECLARE qual módulo está ativo.
OBRIGATÓRIO: Inclua no início da sua resposta: [MODULO: slug-do-modulo]

Módulos disponíveis:
${moduleList}
</modules>`);

  // Active module instructions — inject ONLY the current module's full instructions
  const activeModule = currentModuleSlug
    ? modules.find(m => m.slug === currentModuleSlug)
    : modules[0]; // Default to first module on first turn

  if (activeModule) {
    sections.push(`<active_module name="${activeModule.name}" slug="${activeModule.slug}">
${activeModule.prompt_instructions}
</active_module>`);
  }

  // Dynamic sections (same XML format as existing prompts)
  const contextSummary = buildContextSummary(qualData, contactName, ctx.phoneNumber, ctx._qualChangedThisTurn);
  if (contextSummary) sections.push(contextSummary);

  const regionKnowledge = generateRegionKnowledge(regions);
  if (regionKnowledge) sections.push(regionKnowledge);

  const behaviorInstr = buildBehaviorInstructionsLocal(ctx);
  if (behaviorInstr) sections.push(behaviorInstr);

  if (config.custom_instructions) {
    sections.push(`<custom_instructions>\n${config.custom_instructions}\n</custom_instructions>`);
  }

  // Returning lead context
  if (ctx.isReturningLead) {
    sections.push(buildReturningLeadContext(ctx.previousQualificationData));
  }

  sections.push(buildAdminTransferRule());
  sections.push(buildPostHandoffFollowup());
  sections.push(buildMultilingualDirective());

  // Fix J1: Guardrails anti-reasoning-leak — OBRIGATÓRIO no final do prompt
  sections.push(`<formato-resposta>
REGRA ABSOLUTA DE FORMATO:
Sua resposta DEVE conter APENAS a mensagem destinada ao cliente.
NUNCA inclua na resposta: análises internas, notas para si mesma, raciocínio sobre o perfil do cliente,
planejamento de próximos passos, interpretações sobre a vida pessoal do cliente, ou qualquer texto que
não seja diretamente uma mensagem conversacional para o cliente.

Se precisar organizar seu pensamento, use a tag <pensamento>...</pensamento>.
Tudo dentro de <pensamento> será removido automaticamente antes de chegar ao cliente.

PROIBIDO na resposta ao cliente:
- "Preciso ser receptiva/cuidadosa/empática..." (isso é meta-instrução, não conversa)
- "Tenho os dados: compra, prazo..." (isso é nota interna)
- "A próxima pergunta mais natural é..." (isso é planejamento)
- "Esse contexto é delicado..." (isso é análise psicológica)
- "Vou seguir a anamnese..." (isso é instrução técnica)
- Qualquer inferência sobre separação, divórcio, herança, problemas pessoais

FORMATO CORRETO: Apenas a mensagem que a cliente verá no WhatsApp. Curta, natural, humana.
</formato-resposta>`);

  return sections.join('\n');
}

// ========== SYSTEM PROMPT ==========

function buildComercialPrompt(ctx: AgentContext): string {
  const { aiConfig: config, tenant, regions, contactName, qualificationData: qualData, department, behaviorConfig, structuredConfig: sc } = ctx;

  // Priority 0: Intelligence Modules (if tenant has active modules for comercial)
  const comercialModules = ctx.activeModules?.filter(m => m.category === 'comercial' || m.category === 'general') || [];
  if (comercialModules.length > 0) {
    return buildModularPrompt(ctx, comercialModules);
  }

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
Qualificar o lead conversando de forma natural e estruturada ANTES de buscar imóveis.
Pergunte UMA informação por vez, seguindo esta sequência obrigatória:

SEQUÊNCIA DE QUALIFICAÇÃO (siga esta ordem):
1. FINALIDADE: "${isLocacao ? 'Confirmar que é locação' : 'É para comprar para morar ou investir?'}"
2. TIPO: "Que tipo de imóvel? Casa, apartamento, terreno?"
3. LOCALIZAÇÃO: "Tem preferência de bairro ou região? Pode citar 2 ou 3 de sua preferência."
4. ORÇAMENTO: "Qual faixa de valor você considera?" (Ex: até 500 mil, de 500 a 1 milhão, de 1 a 2.5 milhões)
5. PRAZO: "Qual seu prazo de decisão? Nos próximos 3 meses, de 3 a 6, ou acima de 6 meses?"

REGRA CRÍTICA — QUANDO BUSCAR IMÓVEIS:
- Só chame buscar_imoveis DEPOIS de ter no mínimo: finalidade + tipo + (orçamento OU bairro)
- Se o cliente pedir para ver imóveis antes de qualificar, diga: "Claro! Só preciso entender melhor o que você procura pra trazer opções certeiras. [próxima pergunta]"
- NUNCA invente imóveis. Use SOMENTE a ferramenta buscar_imoveis
- Se o cliente pedir atendimento humano, use enviar_lead_c2s
- Quando buscar_imoveis retornar resultado, os imóveis JÁ FORAM ENVIADOS ao cliente como cards com foto e link.
- Sua resposta DEVE apresentar o imóvel com DADOS CONCRETOS: bairro, quartos, metragem (se disponível), preço, e pelo menos 1 diferencial (vagas, suíte, condomínio).
- OBRIGATÓRIO conectar pelo menos 2 critérios que o cliente pediu. Ex: "Esse apartamento no Centro tem 3 quartos e 90m², por R$ 730 mil, dentro do seu orçamento."
- Se apenas 1 imóvel, use singular. NUNCA use plural quando só 1 imóvel foi enviado.
- Se múltiplos imóveis, descreva brevemente cada um. Ex: "A primeira opção é no Centro, 3 quartos, 95m² por R$ 730 mil. A segunda é na Trindade, mesma faixa mas com 2 vagas."
- Se dados de pontos de referência (escola, supermercado, restaurante) estiverem disponíveis, OBRIGATÓRIO mencionar pelo menos 1 na apresentação para posicionar o imóvel.
- PROIBIDO frases genéricas como "encontrei um imóvel que pode te interessar", "dá uma olhadinha", "me conta o que achou" sem dados concretos. Seja ESPECÍFICO com números e localização.

REGRAS:
- Pergunte UMA informação por vez, de forma natural
- Siga a regra de idioma da seção <idioma>, espelhando o idioma do cliente. Máximo 3 parágrafos.
${buildContextSummary(qualData, contactName, ctx.phoneNumber, ctx._qualChangedThisTurn)}${ctx.isReturningLead ? buildReturningLeadContext(ctx.previousQualificationData) : ''}${generateRegionKnowledge(regions)}${buildBehaviorInstructionsLocal(ctx)}${config.custom_instructions ? `\n📌 INSTRUÇÕES ESPECIAIS:\n${config.custom_instructions}` : ''}${buildAdminTransferRule()}${buildPostHandoffFollowup()}\n\n${buildMultilingualDirective()}`;
}

function buildStructuredComercialPrompt(ctx: AgentContext, sc: StructuredConfig): string {
  const { aiConfig: config, tenant, regions, contactName, qualificationData: qualData, behaviorConfig } = ctx;

  const vars: Record<string, string> = {
    '{{AGENT_NAME}}': config.agent_name || 'Aimee',
    '{{COMPANY_NAME}}': tenant.company_name || '',
    '{{CITY}}': tenant.city || '',
    '{{CONTACT_NAME}}': resolveContactNameForPrompt(contactName),
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
  const contextSummary = buildContextSummary(qualData, contactName, ctx.phoneNumber, ctx._qualChangedThisTurn);
  if (contextSummary) sections.push(contextSummary);

  const regionKnowledge = generateRegionKnowledge(regions);
  if (regionKnowledge) sections.push(regionKnowledge);

  const behaviorInstr = buildBehaviorInstructionsLocal(ctx);
  if (behaviorInstr) sections.push(behaviorInstr);

  if (config.custom_instructions) {
    sections.push(`\n📌 INSTRUÇÕES ESPECIAIS:\n${config.custom_instructions}`);
  }

  // C4: Contexto de lead retornante
  if (ctx.isReturningLead) {
    sections.push(buildReturningLeadContext(ctx.previousQualificationData));
  }

  sections.push(buildAdminTransferRule());
  sections.push(buildPostHandoffFollowup());
  sections.push(buildMultilingualDirective());

  return sections.join('\n');
}

function buildLegacyDirectivePrompt(ctx: AgentContext): string {
  const { aiConfig: config, tenant, contactName, qualificationData: qualData, regions, behaviorConfig } = ctx;

  let prompt = ctx.directive.directive_content;
  prompt = prompt.replaceAll('{{AGENT_NAME}}', config.agent_name || 'Aimee');
  prompt = prompt.replaceAll('{{COMPANY_NAME}}', tenant.company_name);
  prompt = prompt.replaceAll('{{CITY}}', tenant.city);
  prompt = prompt.replaceAll('{{CONTACT_NAME}}', resolveContactNameForPrompt(contactName));
  prompt += buildContextSummary(qualData, contactName, ctx.phoneNumber, ctx._qualChangedThisTurn);
  if (ctx.isReturningLead) prompt += buildReturningLeadContext(ctx.previousQualificationData);
  prompt += generateRegionKnowledge(regions);
  prompt += buildBehaviorInstructionsLocal(ctx);
  if (config.custom_instructions) {
    prompt += `\n📌 INSTRUÇÕES ESPECIAIS:\n${config.custom_instructions}`;
  }
  prompt += buildAdminTransferRule();
  prompt += buildPostHandoffFollowup();
  prompt += '\n\n' + buildMultilingualDirective();
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
        description: "Transferir lead qualificado para corretor humano. Use quando o cliente demonstrar interesse real. OBRIGATÓRIO: se o cliente demonstrou interesse em algum imóvel específico durante a conversa, você DEVE incluir codigo_imovel e titulo_imovel. Sem esses dados, o corretor não saberá qual imóvel o cliente quer.",
        parameters: {
          type: "object",
          properties: {
            motivo: { type: "string", description: "Razão da transferência com detalhes da qualificação" },
            codigo_imovel: { type: "string", description: "OBRIGATÓRIO se o cliente escolheu um imóvel. O código (external_id) do imóvel. Ex: '54482'. Extraia do imóvel que foi apresentado ao cliente na conversa." },
            titulo_imovel: { type: "string", description: "OBRIGATÓRIO se o cliente escolheu um imóvel. Título descritivo. Formato: 'Apartamento à venda com 3 dormitórios, 2 vagas, no Bairro, Cidade/UF'. Extraia dos dados do imóvel apresentado." },
          },
          required: ["motivo"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "buscar_pontos_de_interesse_proximos",
        description: "Busca pontos de interesse próximos a um imóvel (mercados, escolas, restaurantes, etc). Use proativamente para enriquecer a apresentação de imóveis OU quando o cliente perguntar sobre infraestrutura e localização. Retorna dados reais com distâncias.",
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
    {
      type: "function",
      function: {
        name: "transferir_administrativo",
        description: "Encaminha a conversa para o setor administrativo. Use OBRIGATORIAMENTE quando o cliente disser que já é inquilino ou proprietário de imóvel da nossa imobiliária, ou quando trouxer assuntos administrativos: boleto, 2ª via, pagamento, cobrança, contrato, renovação, reajuste, rescisão, manutenção, vazamento, reparo, vistoria, chaves, chaveiro. NÃO tente resolver essas questões no comercial — a partir do próximo turno a conversa será atendida pelo agente administrativo.",
        parameters: {
          type: "object",
          properties: {
            motivo: { type: "string", description: "O que o cliente trouxe e por que é administrativo. Seja específico (ex: 'cliente é inquilino, pediu 2ª via do boleto do apto 302')." },
            tipo_relacao: {
              type: "string",
              description: "Como o cliente se identificou em relação ao imóvel. Use 'inquilino' se ele aluga de nós, 'proprietario' se ele é dono de imóvel que administramos, 'indefinido' se não ficou claro.",
              enum: ["inquilino", "proprietario", "indefinido"]
            },
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

function buildAdminTransferRule(): string {
  return `

# ROTEAMENTO — TRANSFERÊNCIA PARA ADMINISTRATIVO
A sua missão é comercial: ajudar o cliente a comprar ou alugar um imóvel. Existem demandas que NÃO são suas e devem ir para o setor administrativo IMEDIATAMENTE via a ferramenta transferir_administrativo.

CHAME transferir_administrativo quando o cliente:
- Se identificar como INQUILINO (aluga um imóvel nosso). Ex: "sou inquilino de vocês", "aluguei com vocês", "vocês administram meu aluguel"
- Se identificar como PROPRIETÁRIO de imóvel que administramos. Ex: "sou dono de um imóvel que vocês administram", "tenho um apto na gestão de vocês"
- Pedir BOLETO / 2ª via / segunda via / cobrança / pagamento / financeiro
- Pedir algo sobre CONTRATO em vigor (renovação, reajuste, cláusula, aditivo, rescisão)
- Reportar MANUTENÇÃO (vazamento, goteira, reparo, infiltração, quebrou, entupiu, não funciona)
- Pedir VISTORIA, CHAVES, cópia de chave, acesso

Quando transferir:
- Preencha \`motivo\` com o que o cliente trouxe (ex: "cliente inquilino pediu 2ª via do boleto").
- Preencha \`tipo_relacao\` com 'inquilino', 'proprietario' ou 'indefinido' conforme o cliente se identificou.
- Depois da transferência, apenas acolha com naturalidade — o próximo turno já será atendido pelo administrativo.

NÃO chame transferir_administrativo se o cliente só quer comprar ou alugar um imóvel novo — isso é com você mesma.
`;
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
    if (toolName === 'buscar_pontos_de_interesse_proximos') return await executeGetNearbyPlaces(ctx, args);
    if (toolName === 'transferir_administrativo') return await executeDepartmentTransfer(ctx, 'administrativo', args);
    return `Ferramenta desconhecida: ${toolName}`;
  },

  async postProcess(ctx: AgentContext, aiResponse: string): Promise<string> {
    // Pre-completion verification (Harness Engineering pattern)
    const preCheck = await runPreCompletionChecks(ctx, ctx.userMessage || '', aiResponse);
    let finalResponse = preCheck.hasCriticalIssue ? preCheck.sanitizedResponse : aiResponse;

    // Strip chain-of-thought blocks that LLM may leak to client (safety net)
    // Covers: <análise>, <anise>, <anamnese>, <invoke>, <parameter>, <tool_call>, etc.
    finalResponse = finalResponse
      .replace(/<pensamento>[\s\S]*?<\/pensamento>/gi, '')
      .replace(/<thinking>[\s\S]*?<\/thinking>/gi, '')
      .replace(/<invoke[^>]*>[\s\S]*?<\/invoke>/gi, '')
      .replace(/<parameter[^>]*>[\s\S]*?<\/parameter>/gi, '')
      .replace(/<tool_call[^>]*>[\s\S]*?<\/tool_call>/gi, '')
      .replace(/<an[a-záàãéêíóúç]{1,12}>[\s\S]*?<\/an[a-záàãéêíóúç]{1,12}>/gi, '')
      .replace(/<\/?pensamento>/gi, '')
      .replace(/<\/?thinking>/gi, '')
      .replace(/<\/?invoke[^>]*>/gi, '')
      .replace(/<\/?parameter[^>]*>/gi, '')
      .replace(/<\/?tool_call[^>]*>/gi, '')
      .replace(/<\/?an[a-záàãéêíóúç]{1,12}>/gi, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim();

    // Fix J2: Heuristic reasoning leak detector (catches plain-text reasoning the LLM didn't wrap in tags)
    finalResponse = sanitizeReasoningLeak(finalResponse, ctx.qualificationData);

    const qualified = isQualificationComplete(ctx.qualificationData);
    const isRemarketing = ctx.conversationSource === 'remarketing';

    if (isLoopingQuestion(finalResponse, ctx.qualificationData)) {
      console.log('🔄 [Comercial] Loop detected → rotating fallback');
      finalResponse = getRotatingFallback(qualified, ctx.lastAiMessages, isRemarketing, ctx.qualificationData);
      ctx._loopDetected = true;
    }

    if (!ctx._loopDetected && isRepetitiveMessage(finalResponse, ctx.lastAiMessages, {
      qualChangedThisTurn: ctx._qualChangedThisTurn,
      moduleChangedThisTurn: ctx._moduleChangedThisTurn,
    })) {
      console.log('🔄 [Comercial] Repetition detected → rotating fallback');
      finalResponse = getRotatingFallback(qualified, ctx.lastAiMessages, isRemarketing, ctx.qualificationData);
      ctx._loopDetected = true;
    }

    await updateAntiLoopState(ctx.supabase, ctx.tenantId, ctx.phoneNumber, finalResponse);

    // MC-5: Detect handoff promise without actual tool call
    const handoffPromiseRegex = /\b(corretor|consultor|especialista|atendente).{0,30}(contato|entrar em contato|vai te ligar|ligar|chamar)|encaminhei|transferi|atendimento humano/i;
    const promisedHandoff = handoffPromiseRegex.test(finalResponse);
    const actuallyCalledC2S = (ctx.toolsExecuted || []).includes('enviar_lead_c2s');

    if (promisedHandoff && !actuallyCalledC2S) {
      console.warn('⚠️ MC-5: Agent promised handoff but did NOT call enviar_lead_c2s. Auto-triggering.');
      try {
        const dossierLines = [
          ctx.contactName ? `Nome: ${ctx.contactName}` : null,
          `Telefone: ${ctx.phoneNumber}`,
          ctx.qualificationData?.detected_interest ? `Finalidade: ${ctx.qualificationData.detected_interest === 'locacao' ? 'Locação' : 'Venda'}` : null,
          ctx.qualificationData?.detected_neighborhood ? `Região: ${ctx.qualificationData.detected_neighborhood}` : null,
          ctx.qualificationData?.detected_property_type ? `Tipo: ${ctx.qualificationData.detected_property_type}` : null,
          ctx.qualificationData?.detected_budget_max ? `Orçamento: até R$ ${Number(ctx.qualificationData.detected_budget_max).toLocaleString('pt-BR')}` : null,
        ].filter(Boolean).join('\n');

        await executeLeadHandoff(ctx, { motivo: `[MC-5 auto-handoff] ${dossierLines}` });
      } catch (err) {
        console.error('❌ MC-5 auto-handoff failed:', err);
      }
    }

    return finalResponse;
  },
};
