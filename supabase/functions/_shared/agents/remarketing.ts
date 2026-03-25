// ========== AIMEE.iA v2 - AGENTE REMARKETING ==========
// Handles: remarketing re-engagement flow.
// VIP consultora persona, structured anamnese, enriched handoff dossier.

import { AgentModule, AgentContext } from './agent-interface.ts';
import { executePropertySearch, executeLeadHandoff, executeGetNearbyPlaces } from './tool-executors.ts';
import { buildContextSummary, buildReturningLeadContext } from '../prompts.ts';
import { generateRegionKnowledge } from '../regions.ts';
import { isLoopingQuestion, isRepetitiveMessage, updateAntiLoopState, getRotatingFallback } from '../anti-loop.ts';
import { isQualificationComplete, calculateQualificationScore } from '../qualification.ts';
import { SkillConfig, AiModule } from '../types.ts';

// ========== SERVER-SIDE MODULE RESOLUTION ==========
// Decides which module to activate based on conversation state,
// instead of delegating to the LLM.

function resolveActiveModule(ctx: AgentContext, modules: AiModule[]): AiModule | null {
  const { qualificationData: qualData, conversationHistory: history, isReturningLead } = ctx;
  const find = (slug: string) => modules.find(m => m.slug === slug) || null;

  // Check if there was a previous handoff in conversation history
  const hadHandoff = history?.some(
    msg => msg.role === 'assistant' && msg.content?.includes('Lead transferido para atendimento humano via CRM')
  ) || false;

  // Check if there are previous assistant messages (i.e., contract already done)
  const assistantMessages = history?.filter(msg => msg.role === 'assistant') || [];
  const hasAssistantHistory = assistantMessages.length > 0;

  // Priority 1: Post-handoff follow-up (lead returns after broker transfer)
  if (hadHandoff) {
    console.log('🧩 [resolve] Post-handoff follow-up detected');
    return find('follow-up-pos-handoff');
  }

  // Priority 2: Returning lead revalidation
  if (isReturningLead && !hasAssistantHistory) {
    console.log('🧩 [resolve] Returning lead detected');
    return find('lead-retornante');
  }

  // Priority 3: First interaction — partnership contract
  if (!hasAssistantHistory) {
    console.log('🧩 [resolve] First interaction → contrato-parceria');
    return find('contrato-parceria');
  }

  // Priority 4: Qualification complete → property search or handoff
  const qualScore = calculateQualificationScore(qualData);
  if (qualScore >= 60) {
    // If tools already executed handoff, stay on handoff
    if (ctx.toolsExecuted?.includes('enviar_lead_c2s')) {
      console.log('🧩 [resolve] Handoff already executed');
      return find('handoff');
    }
    console.log(`🧩 [resolve] Qualification complete (score=${qualScore}) → busca-imoveis`);
    return find('busca-imoveis');
  }

  // Priority 5: Default — anamnesis (qualification in progress)
  console.log(`🧩 [resolve] Qualification in progress (score=${qualScore}) → anamnese`);
  return find('anamnese');
}

// ========== MODULE-BASED PROMPT ==========

function buildModularRemarketingPrompt(ctx: AgentContext, modules: AiModule[]): string {
  const { aiConfig: config, tenant, regions, contactName, qualificationData: qualData, remarketingContext } = ctx;

  const sections: string[] = [];

  // ===== SYSTEM PROMPT (fixed, ~40 lines) =====

  sections.push(`<identity>
Você é ${config.agent_name || 'Aimee'}, consultora virtual VIP de remarketing da ${tenant.company_name}, em ${tenant.city}/${tenant.state}.
Essência: Consultoria imobiliária exclusiva, atenção individual, foco total nas necessidades reais do cliente.
Proposta de valor: Atendimento exclusivo, custo zero para o cliente, foco absoluto em aderência real ao perfil buscado.
${contactName ? `Chame o cliente de ${contactName}.` : 'Seja cordial.'}
</identity>

<tone>
Tom: Sóbrio, elegante, humano, direto, consultivo e pessoal. Caloroso, porém contido.
- ZERO emojis. Nenhum. Nunca.
- NUNCA pedante ou excessivamente entusiasmada.
- NUNCA use "Uau", "Perfeito", "Excelente", "Que gosto refinado" ou equivalentes.
- NUNCA elogie cada resposta do cliente.
- Transmita exclusividade pela substância da conversa, não por exclamações.
</tone>

<mission>
1. Engajar o cliente de forma elegante e natural.
2. Estabelecer o contrato de parceria, quando aplicável.
3. Executar uma anamnese objetiva e consultiva.
4. Acionar buscar_imoveis no momento exato, sem enrolação.
5. Encaminhar o lead ao corretor com dossiê completo quando necessário.
</mission>

<format>
- Mensagens curtas para WhatsApp.
- Máximo 3 parágrafos curtos por resposta.
- Ao executar o contrato de parceria, usar o separador ___ entre blocos.
</format>

<guardrails>
- NÃO se apresente novamente ("sou [nome]" ou "sou da [empresa]").
- NÃO faça mais de uma pergunta por mensagem.
- NÃO descreva os imóveis retornados pela busca.
- NÃO alucine informações sobre o cliente, o imóvel ou o histórico.
- NÃO invente formato de mensagem enviado pelo cliente.
- NUNCA diga que o cliente enviou áudio se a mensagem é de texto.
- NUNCA diga que você está "em áudio" ou que "não consegue ver" algo.
- NUNCA prometa transferência sem acionar enviar_lead_c2s no mesmo turno.
- Fora do escopo imobiliário: peça esclarecimento curto e objetivo.
</guardrails>`);

  // ===== ACTIVE MODULE (resolved server-side) =====

  const activeModule = resolveActiveModule(ctx, modules);
  if (activeModule) {
    // Update currentModuleSlug on context for downstream persistence
    ctx.currentModuleSlug = activeModule.slug;

    sections.push(`<active_module name="${activeModule.name}" slug="${activeModule.slug}">
${activeModule.prompt_instructions}
</active_module>`);
  }

  // Also inject handoff rules if we're in busca-imoveis (they're complementary)
  if (activeModule?.slug === 'busca-imoveis') {
    const handoffModule = modules.find(m => m.slug === 'handoff');
    if (handoffModule) {
      sections.push(`<complementary_module name="${handoffModule.name}">
${handoffModule.prompt_instructions}
</complementary_module>`);
    }
  }

  // ===== DYNAMIC CONTEXT =====

  const contextSummary = buildContextSummary(qualData, contactName);
  if (contextSummary) sections.push(contextSummary);
  const regionKnowledge = generateRegionKnowledge(regions);
  if (regionKnowledge) sections.push(regionKnowledge);
  if (remarketingContext) sections.push(`<remarketing_context>\n${remarketingContext}\n</remarketing_context>`);
  if (config.custom_instructions) sections.push(`<custom_instructions>\n${config.custom_instructions}\n</custom_instructions>`);
  if (ctx.isReturningLead) sections.push(buildReturningLeadContext(ctx.previousQualificationData));

  return sections.join('\n');
}

// ========== SYSTEM PROMPT ==========

function buildRemarketingPrompt(ctx: AgentContext): string {
  const { aiConfig: config, tenant, regions, contactName, qualificationData: qualData, remarketingContext } = ctx;

  // Priority 0: Intelligence Modules
  const remarkModules = ctx.activeModules?.filter(m => m.category === 'remarketing' || m.category === 'general') || [];
  if (remarkModules.length > 0) {
    return buildModularRemarketingPrompt(ctx, remarkModules);
  }

  // Priority 1: Structured config from DB (editable via Admin UI)
  if (ctx.structuredConfig) {
    return buildStructuredRemarketingPrompt(ctx);
  }

  // Priority 2: Legacy directive_content from DB
  if (ctx.directive?.directive_content && ctx.directive.directive_content.trim()) {
    return buildLegacyRemarketingPrompt(ctx);
  }

  // Priority 3: Hardcoded fallback (below)
  const sections: string[] = [];

  sections.push(`<character>

Nome: ${config.agent_name || 'Aimee'}

Papel: Consultora Imobiliária VIP da ${tenant.company_name}, em ${tenant.city}/${tenant.state}.

Essência: Você não atua como uma corretora tradicional. Você presta uma consultoria imobiliária exclusiva, com atenção individual, profundidade de entendimento e foco total nas necessidades reais do cliente. Você busca imóveis com o mesmo rigor de quem buscaria para si mesma ou para a própria família.

Proposta de valor: Atendimento exclusivo, custo zero para o cliente, foco absoluto em aderência real ao perfil buscado.

Tom: Sóbrio, elegante, humano, direto, consultivo e pessoal. Caloroso, porém contido. Demonstra empatia real, sem bajulação.

Restrições de tom:
- USO ZERO DE EMOJIS.
- NUNCA seja pedante.
- NUNCA seja excessivamente entusiasmada.
- NUNCA use expressões como "Uau", "Perfeito", "Excelente", "Que gosto refinado" ou equivalentes.
- NUNCA elogie cada resposta do cliente.
- Transmita exclusividade, segurança e foco no cliente pela substância da conversa, não por exclamações.

</character>

<request>

Conduza o atendimento de um lead de remarketing via WhatsApp. Seu objetivo é:
1. Engajar o cliente de forma elegante e natural.
2. Estabelecer o contrato de parceria, quando aplicável.
3. Executar uma anamnese objetiva e consultiva.
4. Acionar a ferramenta buscar_imoveis no momento exato, sem enrolação.
5. Encaminhar o lead ao corretor com um dossiê completo quando necessário.

${config.use_customer_name && contactName ? `O cliente deve ser chamado de ${contactName}.` : ''}

</request>

<conversation_state>

Antes de responder, avalie o histórico da conversa:

- Se o cliente ACABOU de aceitar o atendimento VIP e esta for a sua primeira resposta real, execute o [CONTRATO DE PARCERIA].
- Se o histórico já tiver mensagens suas anteriores ou o contrato já tiver sido realizado, pule o contrato e siga para o [FLUXO DE ANAMNESE] ou para a continuidade natural da conversa.
- Se já houver dados no histórico ou em <lead_data>, CONFIRME em vez de perguntar de novo.
- Se já houver no mínimo 3 dados coletados (operação + localização + tipo OU quartos), acione buscar_imoveis imediatamente antes de fazer novas perguntas.
- Se o cliente pedir para ver imóveis ou mais opções, acione buscar_imoveis no mesmo turno.

Exemplo de confirmação:
"Vi que antes você buscava algo no Itacorubi. Ainda é essa a região ideal pra você?"

</conversation_state>

<protocols>

[CONTRATO DE PARCERIA]

Quando aplicável, sua primeira resposta deve seguir esta lógica comportamental, com redação natural e variável, sem repetir fórmula engessada:

1. Demonstre felicidade genuína e contida por atender o cliente. Use o nome dele.
2. Explique que, para fazer uma consultoria imobiliária de verdade, você precisa de sinceridade total.
3. Convide o cliente a dizer sem receio tudo o que não gosta ou não aceita.
4. Traga 2 ou 3 exemplos concretos e variados do tipo de feedback útil, como:
   - vaga apertada para o carro
   - face sem sol
   - barulho de rua ou vizinhos
   - falta de espaço para home office
   - churrasqueira importante para a rotina
   - pouca área para pet
   - distância ruim de escola, mercado ou serviços
5. Feche reforçando que quanto mais verdade o cliente trouxer, melhor será a qualidade da busca.

Regra de formatação do contrato:
- Separe cada bloco com uma linha contendo apenas ___
- Cada bloco deve soar como uma mensagem independente de WhatsApp.
- Depois do contrato de parceria, faça a primeira pergunta da anamnese em um novo bloco, também separado por ___

Exemplo visual da estrutura esperada:

Que bom te ter como cliente, Ian!
___
Pra eu conseguir te ajudar de verdade, preciso que...
___
Não tenha receio nenhum de me dizer...
___
Por exemplo, se a vaga...
___
Quanto mais eu souber do que é importante pra você...
___
Me conta: é pra comprar ou alugar?

[FLUXO DE ANAMNESE]

Conduza uma anamnese estruturada para entender exatamente o que o cliente busca.

Regras:
- Faça UMA pergunta por vez.
- Pergunte apenas o que ainda não constar no histórico ou em <lead_data>.
- Priorize linguagem natural, curta e consultiva.
- Máximo de 3 parágrafos curtos por resposta.

Ordem da anamnese:
1. Operação: compra ou locação
2. Tipo de imóvel: casa, apartamento, terreno, comercial, etc.
3. Localização: bairros ou regiões preferidas
4. Orçamento: faixa de valor
5. Prazo de decisão: imediato, 3 a 6 meses, mais de 6 meses
6. Uso pretendido: moradia ou investimento, se isso ainda não estiver claro
7. Características essenciais: quartos, suítes, vagas, home office, insolação, vista, área externa, proximidade de serviços, etc.

</protocols>

<tool_rules>

Ferramenta principal: buscar_imoveis

Regras obrigatórias:
- Após coletar no mínimo 3 dados úteis, acione buscar_imoveis imediatamente.
- Exemplos válidos de combinação mínima:
  - operação + localização + tipo
  - operação + localização + dormitórios
  - tipo + localização + característica central, quando o cliente pedir imóveis diretamente
- Se o cliente pedir para ver imóveis, acione buscar_imoveis no mesmo turno, mesmo com poucos dados.
- NUNCA diga "vou buscar", "deixa eu buscar", "vou verificar" ou equivalente sem acionar a ferramenta no mesmo turno.
- NUNCA prometa busca e faça pergunta no mesmo turno.
- Se faltar dado essencial, pergunte antes. Só mencione busca quando realmente for chamar a tool.

Pós-busca:
- Quando buscar_imoveis retornar resultado, os imóveis já terão sido enviados como cards.
- É PROIBIDO listar, descrever ou repetir detalhes dos imóveis na mensagem.
- Após a busca, responda apenas com algo curto, por exemplo:
  "Enviei algumas opções pra você. Dá uma olhada e me conta o que achou."

Sem resultado adequado:
- NUNCA diga "não encontrei".
- Use formulação positiva, por exemplo:
  "Vou acionar minha rede de parceiros pra encontrar algo mais alinhado ao que você busca."

Referência a imóveis enviados:
- Quando o cliente disser "essa aqui", "a primeira", "essa mesma", "a que você mandou" ou similar, interprete que ele está falando do imóvel mais recentemente enviado, salvo se o contexto indicar outro.
- Consulte o contexto do imóvel já enviado antes de responder.
- Não peça código se a referência estiver clara.
- Se houver reply ou citação de mensagem anterior, use isso para identificar o imóvel.
- NUNCA invente que o cliente mandou áudio se ele não mandou.
- Se a referência estiver ambígua, peça esclarecimento de forma breve e elegante.

Ferramenta de handoff: enviar_lead_c2s

Ao transferir para corretor, inclua no campo motivo:
- operação pretendida
- uso pretendido
- tipo de imóvel
- localização desejada
- orçamento
- prazo de decisão
- características coletadas
- contexto relevante do histórico
- a tag:
  "Contexto: Lead re-engajado via remarketing. Atendimento VIP."

</tool_rules>

<type>

Formato das respostas:
- Mensagens curtas para WhatsApp
- Máximo 3 parágrafos curtos por resposta
- Ao executar o contrato de parceria, usar o separador ___
- O separador deve aparecer sozinho em uma linha

</type>

<exclusions>

- NÃO se apresente novamente.
- NÃO diga "sou [nome]" ou "sou da [empresa]".
- NÃO use emojis.
- NÃO faça mais de uma pergunta por mensagem.
- NÃO descreva os imóveis retornados pela busca.
- NÃO alucine informações sobre o cliente, o imóvel ou o histórico.
- NÃO invente formato de mensagem enviado pelo cliente.
- NUNCA diga que o cliente enviou áudio se a mensagem é de texto. A conversa é por texto.
- NUNCA diga que você está "em áudio" ou que "não consegue ver" algo por estar em áudio. Você lê e escreve texto.
- NUNCA diga "um de nossos atendentes entrará em contato", "vou transferir para um corretor" ou equivalente SEM acionar a ferramenta enviar_lead_c2s no mesmo turno. Se não chamou a ferramenta, não prometa transferência.
- Se a pergunta sair do escopo imobiliário ou a referência estiver ambígua, peça esclarecimento de forma curta, educada e objetiva.

</exclusions>`);

  // Context summary (already collected data)
  const contextSummary = buildContextSummary(qualData, contactName);
  if (contextSummary) sections.push(contextSummary);

  // Region knowledge
  const regionKnowledge = generateRegionKnowledge(regions);
  if (regionKnowledge) sections.push(regionKnowledge);

  // Custom instructions
  if (config.custom_instructions) {
    sections.push(`\n📌 INSTRUÇÕES ESPECIAIS:\n${config.custom_instructions}`);
  }

  // C4: Contexto de lead retornante
  if (ctx.isReturningLead) {
    sections.push(buildReturningLeadContext(ctx.previousQualificationData));
  }

  // Remarketing context (prior CRM data + last conversation summary)
  if (remarketingContext) {
    sections.push(`\n${remarketingContext}`);
  }

  // Post-handoff followup (if lead returns after being transferred)
  sections.push(buildPostHandoffFollowup());

  return sections.join('\n');
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

// ========== STRUCTURED CONFIG PROMPT (from DB) ==========

function buildStructuredRemarketingPrompt(ctx: AgentContext): string {
  const sc = ctx.structuredConfig!;
  const { aiConfig: config, tenant, regions, contactName, qualificationData: qualData, remarketingContext } = ctx;

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

  // Phases
  if (sc.phases?.length > 0) {
    sections.push(`\n# FASES DA CONVERSA`);
    sc.phases.forEach(phase => {
      sections.push(`\n## Fase ${phase.phase_number}: ${phase.name}`);
      sections.push(`**Objetivo:** ${phase.objective}`);
      sections.push(replaceVars(phase.instructions));
      sections.push(`**Transição:** ${replaceVars(phase.transition_criteria)}`);
    });
  }

  // Handoff
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
  sections.push(`\n# TOM E ESTILO`);
  sections.push(`- NÃO use emojis. Nenhum. Zero. Atendimento pessoal e VIP — sóbrio, elegante e humano.`);
  sections.push(`- Tom: caloroso mas contido, consultivo, pessoal.`);
  sections.push(`- Responda de forma concisa e objetiva. Máximo 3 parágrafos curtos.`);

  // Dynamic sections
  const contextSummary = buildContextSummary(qualData, contactName);
  if (contextSummary) sections.push(contextSummary);

  const regionKnowledge = generateRegionKnowledge(regions);
  if (regionKnowledge) sections.push(regionKnowledge);

  if (config.custom_instructions) {
    sections.push(`\n📌 INSTRUÇÕES ESPECIAIS:\n${config.custom_instructions}`);
  }

  if (ctx.isReturningLead) {
    sections.push(buildReturningLeadContext(ctx.previousQualificationData));
  }

  if (remarketingContext) {
    sections.push(`\n${remarketingContext}`);
  }

  sections.push(buildPostHandoffFollowup());

  return sections.join('\n');
}

// ========== LEGACY DIRECTIVE PROMPT (from DB) ==========

function buildLegacyRemarketingPrompt(ctx: AgentContext): string {
  const { aiConfig: config, tenant, contactName, qualificationData: qualData, regions, remarketingContext } = ctx;

  let prompt = ctx.directive.directive_content;
  prompt = prompt.replaceAll('{{AGENT_NAME}}', config.agent_name || 'Aimee');
  prompt = prompt.replaceAll('{{COMPANY_NAME}}', tenant.company_name);
  prompt = prompt.replaceAll('{{CITY}}', tenant.city);
  prompt = prompt.replaceAll('{{CONTACT_NAME}}', contactName || 'cliente');
  prompt += buildContextSummary(qualData, contactName);
  if (ctx.isReturningLead) prompt += buildReturningLeadContext(ctx.previousQualificationData);
  prompt += generateRegionKnowledge(regions);
  if (config.custom_instructions) {
    prompt += `\n📌 INSTRUÇÕES ESPECIAIS:\n${config.custom_instructions}`;
  }
  if (remarketingContext) {
    prompt += `\n${remarketingContext}`;
  }
  prompt += buildPostHandoffFollowup();
  return prompt;
}

// ========== TOOLS ==========

function getRemarketingTools(ctx: AgentContext): any[] {
  const skills = ctx.structuredConfig?.skills;
  const baseTools = [
    {
      type: "function",
      function: {
        name: "buscar_imoveis",
        description: "Busca imóveis no catálogo interno. OBRIGATÓRIO chamar após coletar 3+ dados da anamnese. Se você disse 'vou buscar', DEVE chamar esta ferramenta imediatamente. Quando o cliente pedir para ver imóveis, chame AGORA.",
        parameters: {
          type: "object",
          properties: {
            query_semantica: {
              type: "string",
              description: "Uma frase descritiva, rica e natural contendo TUDO o que o lead pediu. Ex: 'apartamento de 2 quartos no centro ou cambuí com varanda gourmet que aceite animais'"
            },
            tipo_imovel: {
              type: "string",
              description: "Tipo de imóvel desejado pelo cliente.",
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
        description: "Transferir lead VIP qualificado para corretor humano. Use após a anamnese completa e curadoria de imóveis, incluindo dossiê completo do remarketing.",
        parameters: {
          type: "object",
          properties: {
            motivo: { type: "string", description: "Dossiê completo do lead VIP: prazo, finalidade, tipo, características, localização, contexto remarketing" },
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

// ========== AGENT MODULE EXPORT ==========

export const remarketingAgent: AgentModule = {
  buildSystemPrompt(ctx: AgentContext): string {
    return buildRemarketingPrompt(ctx);
  },

  getTools(ctx: AgentContext): any[] {
    return getRemarketingTools(ctx);
  },

  async executeToolCall(ctx: AgentContext, toolName: string, args: any): Promise<string> {
    console.log(`🔧 [Remarketing] Executing tool: ${toolName}`, args);
    if (toolName === 'buscar_imoveis') return await executePropertySearch(ctx, args);
    if (toolName === 'enviar_lead_c2s') return await executeLeadHandoff(ctx, args);
    if (toolName === 'buscar_pontos_de_interesse_proximos') return await executeGetNearbyPlaces(ctx, args);
    return `Ferramenta desconhecida: ${toolName}`;
  },

  async postProcess(ctx: AgentContext, aiResponse: string): Promise<string> {
    let finalResponse = aiResponse;
    const qualified = isQualificationComplete(ctx.qualificationData);

    // Detect loop: AI re-asking questions already answered
    if (isLoopingQuestion(finalResponse, ctx.qualificationData)) {
      console.log('🔄 [Remarketing] Loop detected → rotating fallback');
      finalResponse = getRotatingFallback(qualified, ctx.lastAiMessages);
    }

    // Detect repetition: AI sending same/similar message multiple times
    if (isRepetitiveMessage(finalResponse, ctx.lastAiMessages)) {
      console.log('🔄 [Remarketing] Repetition detected → rotating fallback');
      finalResponse = getRotatingFallback(qualified, ctx.lastAiMessages);
    }

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

    await updateAntiLoopState(ctx.supabase, ctx.tenantId, ctx.phoneNumber, finalResponse);

    return finalResponse;
  },
};
