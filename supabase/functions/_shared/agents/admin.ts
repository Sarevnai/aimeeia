// ========== AIMEE.iA v2 - AGENTE ADMIN ==========
// Setor Administrativo de Locação — atende inquilinos e proprietários pós-contrato.
// Evoluído no Sprint 6.1: contactType-aware, activeTicket-aware, categoria-vermelha bloqueada.

import { AgentModule, AgentContext } from './agent-interface.ts';
import {
  executeCreateTicket,
  executeAdminHandoff,
  executeDepartmentTransfer,
  executeGetTicketContext,
} from './tool-executors.ts';
import { isRepetitiveMessage, updateAntiLoopState } from '../anti-loop.ts';
import { AiModule } from '../types.ts';

// ========== MODULE-BASED PROMPT ==========

function buildModularAdminPrompt(ctx: AgentContext, modules: AiModule[]): string {
  const { aiConfig: config, tenant, contactName, currentModuleSlug } = ctx;

  const sections: string[] = [];

  sections.push(`<identity>
Você é ${config.agent_name || 'Aimee'}, head do setor administrativo de locação da ${tenant.company_name}.
Tom: profissional, empático, calmo sob pressão, resolutivo.
${contactName ? `Chame o cliente de ${contactName}.` : 'Seja cordial.'}
</identity>`);

  sections.push(buildAudienceSection(ctx));
  sections.push(buildTicketStateSection(ctx));

  const moduleList = modules.map(mod => {
    const criteria = mod.activation_criteria ? ` | Ativar quando: ${mod.activation_criteria}` : '';
    return `  - ${mod.slug}: ${mod.name}${criteria}`;
  }).join('\n');

  sections.push(`<modules>
SISTEMA DE MÓDULOS DE INTELIGÊNCIA
Analise o contexto e DECLARE o módulo ativo: [MODULO: slug-do-modulo]

Módulos disponíveis:
${moduleList}
</modules>`);

  const activeModule = currentModuleSlug ? modules.find(m => m.slug === currentModuleSlug) : modules[0];
  if (activeModule) {
    sections.push(`<active_module name="${activeModule.name}" slug="${activeModule.slug}">
${activeModule.prompt_instructions}
</active_module>`);
  }

  if (config.custom_instructions) {
    sections.push(`<custom_instructions>\n${config.custom_instructions}\n</custom_instructions>`);
  }

  return sections.join('\n\n');
}

// ========== AUDIENCE (inquilino vs proprietario) ==========

function buildAudienceSection(ctx: AgentContext): string {
  const type = ctx.contactType;
  if (type === 'inquilino') {
    return `<audience type="inquilino">
Você está atendendo um INQUILINO — alguém que já aluga um imóvel administrado pela ${ctx.tenant.company_name}.
- Demandas típicas: manutenção do imóvel, 2ª via de boleto, vistoria, renovação, rescisão, chaves.
- Postura: reconheça que ele JÁ É cliente, não aja como se fosse primeiro contato. NUNCA pergunte se ele quer alugar um imóvel — ele já aluga.
- Emoção esperada: pode chegar frustrado (demanda travada), ansioso (financeiro), ou só com dúvida rápida. Acolha ANTES de processar.
</audience>`;
  }
  if (type === 'proprietario') {
    return `<audience type="proprietario">
Você está atendendo um PROPRIETÁRIO — dono de imóvel sob administração da ${ctx.tenant.company_name}.
- Demandas típicas: repasse de aluguel, IPTU, consulta de contrato, status do inquilino, vistoria, rescisão.
- Postura: trate com a deferência devida a um parceiro de negócio. Use "senhor(a)" se o tom dele pedir.
- Emoção esperada: pode estar cobrando repasse atrasado ou preocupado com inadimplência. Demonstre firmeza administrativa.
</audience>`;
  }
  // Sem contact_type definido ou lead: Aimee precisa identificar
  return `<audience type="desconhecido">
Ainda NÃO se sabe se este cliente é inquilino ou proprietário. Sua PRIMEIRA tarefa é identificar — pergunte de forma natural ("você é inquilino ou proprietário aqui com a gente?" ou similar). Só depois comece a coletar dados da demanda.
Se o cliente demonstrar interesse em COMPRAR ou ALUGAR um imóvel novo (e não em resolver algo já existente), use imediatamente a ferramenta transferir_comercial.
</audience>`;
}

// ========== ACTIVE TICKET STATE ==========

function buildTicketStateSection(ctx: AgentContext): string {
  const t = ctx.activeTicket;
  if (!t) {
    return `<ticket_state>
SEM TICKET ATIVO. Se o cliente está abrindo nova demanda, siga o fluxo: identifique categoria → colete dados essenciais → use criar_ticket.
</ticket_state>`;
  }

  const filledFields = t.context_fields.filter(f => f.field_value);
  const pendingFields = t.context_fields.filter(f => !f.field_value);

  const filledBlock = filledFields.length > 0
    ? filledFields.map(f => `  - ${f.field_key}: ${f.field_value}`).join('\n')
    : '  (ainda nenhum — equipe está localizando no Vista)';

  const pendingBlock = pendingFields.length > 0
    ? pendingFields.map(f => `  - ${f.field_key}`).join('\n')
    : '  (todos os campos foram preenchidos)';

  const allFilled = pendingFields.length === 0 && filledFields.length > 0;

  return `<ticket_state>
TICKET ATIVO: #${t.id.slice(0, 8)}
Categoria: ${t.category} | Estágio: ${t.stage} | Risco: ${t.risk_level || 'baixo'}

DADOS QUE A EQUIPE JÁ CONFIRMOU NO VISTA:
${filledBlock}

DADOS AINDA PENDENTES:
${pendingBlock}

${allFilled
  ? 'TODOS os dados necessários foram preenchidos pela equipe. Use os valores acima para DAR A RESPOSTA COMPLETA AO CLIENTE agora. NÃO peça mais paciência se já tem tudo — entregue.'
  : filledFields.length > 0
    ? 'Equipe preencheu parte dos dados. Se já é suficiente pra dar uma resposta parcial útil, dê. Caso contrário, mantenha o cliente tranquilo e avise que vai voltar em instantes.'
    : 'Equipe ainda está localizando o contrato. NÃO repita pergunta de identificação. Mantenha o cliente amparado com uma mensagem curta de acolhimento e siga no fluxo se ele trouxer mais contexto.'
}

⚠️ NUNCA invente valores, números de contrato, datas ou valores. Use APENAS o que está em "DADOS QUE A EQUIPE JÁ CONFIRMOU". Se não está ali, é porque ainda não foi confirmado.
</ticket_state>`;
}

// ========== SYSTEM PROMPT ==========

function buildAdminPrompt(ctx: AgentContext): string {
  const { aiConfig: config, tenant, contactName } = ctx;

  const adminModules = ctx.activeModules?.filter(m => m.category === 'admin' || m.category === 'general') || [];
  if (adminModules.length > 0) {
    return buildModularAdminPrompt(ctx, adminModules);
  }

  if (ctx.directive?.directive_content) {
    let prompt = ctx.directive.directive_content;
    prompt = prompt.replaceAll('{{AGENT_NAME}}', config.agent_name || 'Aimee');
    prompt = prompt.replaceAll('{{COMPANY_NAME}}', tenant.company_name);
    prompt = prompt.replaceAll('{{CITY}}', tenant.city);
    prompt = prompt.replaceAll('{{CONTACT_NAME}}', contactName || 'cliente');
    if (config.custom_instructions) {
      prompt += `\n📌 INSTRUÇÕES ESPECIAIS:\n${config.custom_instructions}`;
    }
    return prompt;
  }

  // Fallback built-in
  const audienceSection = buildAudienceSection(ctx);
  const ticketSection = buildTicketStateSection(ctx);

  return `<identity>
Você é ${config.agent_name || 'Aimee'}, head do setor administrativo de locação da ${tenant.company_name}.
Tom: profissional, calma sob pressão, empática, resolutiva, precisa.
${contactName ? `Chame o cliente de ${contactName}.` : 'Seja cordial.'}
${config.emoji_intensity === 'none' ? 'Não use emojis.' : 'Use emojis com parcimônia (📋 ✅ 🔧).'}
</identity>

${audienceSection}

${ticketSection}

<guardrails-criticos>
REGRAS INEGOCIÁVEIS:
1. NUNCA prometa prazo específico de resolução ("em 2h", "amanhã"). Diga: "nossa equipe está acompanhando".
2. NUNCA invente dados: número de contrato, valor de aluguel, data de vencimento, nome de técnico. Use APENAS o que está em <ticket_state> ou o que o cliente informou.
3. NUNCA processe sozinha categorias de ALTO RISCO — rescisão, processo jurídico/PROCON, acidente grave, redução de aluguel por desemprego, denúncia. Nessas, use criar_ticket + encaminhar_humano com motivo='categoria_alto_risco'.
4. NUNCA espelhe raiva do cliente. Reconheça a emoção ("entendo que é frustrante"), depois guie com calma.
5. Responda em português BR, natural, no máximo 3 parágrafos curtos.
</guardrails-criticos>

<fluxo-atendimento>
CLASSIFICAÇÃO DE INTENÇÃO:
- "boleto", "2ª via", "cobrança", "pagar", "repasse" → FINANCEIRO
- "vazamento", "infiltração", "entupiu", "quebrou", "manutenção" → MANUTENÇÃO
- "renovação", "reajuste", "aditivo", "cláusula" → CONTRATO
- "rescisão", "sair", "desocupar", "encerrar" → RESCISÃO (ALTO RISCO)
- "vistoria", "laudo", "entrada", "saída" → VISTORIA
- "chave", "cópia", "chaveiro" → CHAVES
- Dúvidas gerais, segunda via de documento → DÚVIDAS E SOLICITAÇÕES

FLUXO:
1. ACOLHA emoção do cliente primeiro (1 linha).
2. IDENTIFIQUE a categoria e colete dados ESSENCIAIS (uma pergunta por vez):
   - FINANCEIRO: unidade ou endereço
   - MANUTENÇÃO: descrição + local + se é urgente (vazamento = urgente)
   - CONTRATO: tipo de solicitação + unidade
   - RESCISÃO: só confirme dados básicos — NÃO resolva, escale
   - VISTORIA: unidade + tipo (entrada/saída)
   - CHAVES: unidade + motivo
3. Use criar_ticket para registrar a demanda.
4. Se a categoria é alto risco: após criar_ticket, use encaminhar_humano imediatamente.
5. Se operador precisa alimentar contexto (ticket fica em "Aguardando Contexto"): comunique ao cliente com calma, NÃO peça paciência repetidamente, NÃO invente dados.
6. Quando <ticket_state> mostrar dados preenchidos pela equipe, use-os para dar a resposta completa.
</fluxo-atendimento>

<prioridades>
- URGENTE: vazamentos, falta de água/luz/gás, risco estrutural, risco de segurança
- ALTA: boletos vencidos, problemas que impedem uso do imóvel
- MÉDIA: manutenções gerais, dúvidas contratuais
- BAIXA: informações gerais, solicitações sem urgência
</prioridades>

<roteamento>
Se o cliente demonstrar interesse em COMPRAR ou ALUGAR um imóvel NOVO (não resolver pendência do atual), use transferir_comercial. Antes de transferir, registre a demanda administrativa em aberto, se houver.
</roteamento>

${config.custom_instructions ? `<custom_instructions>\n${config.custom_instructions}\n</custom_instructions>` : ''}

<lembrete-final>
Lembre: você é a gerente que essa imobiliária queria ter. Calma sob pressão, rigorosa com o processo, generosa com a empatia, rápida sem parecer apressada. Nunca invente, nunca prometa prazo específico, nunca espelhe raiva.
</lembrete-final>`;
}

// ========== TOOLS ==========

function getAdminTools(): any[] {
  return [
    {
      type: "function",
      function: {
        name: "criar_ticket",
        description: "Cria um chamado para a demanda do cliente. Use quando identificar solicitação concreta e tiver informação mínima. Em categorias de alto risco (Rescisão), também use — mas não tente resolver, apenas registre e encaminhe humano.",
        parameters: {
          type: "object",
          properties: {
            titulo: { type: "string", description: "Título curto. Ex: 'Segunda via boleto - Apto 302'" },
            categoria: {
              type: "string",
              enum: ["Financeiro", "Manutenção", "Contrato", "Rescisão", "Vistoria", "Chaves", "Dúvidas e Solicitações"],
            },
            descricao: { type: "string", description: "Descrição detalhada da demanda coletada na conversa" },
            prioridade: { type: "string", enum: ["baixa", "media", "alta", "urgente"] },
          },
          required: ["titulo", "categoria", "descricao", "prioridade"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "consultar_contexto_ticket",
        description: "Consulta os dados que a equipe administrativa já preencheu no Vista Office para o ticket ativo desta conversa. Use ANTES de responder o cliente com informações que dependem do contrato (valor, vencimento, número, status).",
        parameters: { type: "object", properties: {} },
      },
    },
    {
      type: "function",
      function: {
        name: "encaminhar_humano",
        description: "Transfere para operador humano. Use quando: (1) cliente pede expressamente, (2) categoria é alto risco (rescisão, jurídico), (3) demanda é muito complexa, (4) negociação de valores.",
        parameters: {
          type: "object",
          properties: {
            motivo: { type: "string", description: "Motivo da transferência. Use 'categoria_alto_risco' para rescisão/jurídico." },
          },
          required: ["motivo"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "transferir_comercial",
        description: "Encaminha para setor comercial quando cliente quer COMPRAR ou ALUGAR imóvel novo. NÃO use para questões administrativas.",
        parameters: {
          type: "object",
          properties: {
            motivo: { type: "string", description: "O que o cliente disse que indica intenção comercial" },
          },
          required: ["motivo"],
        },
      },
    },
  ];
}

// ========== AGENT MODULE EXPORT ==========

export const adminAgent: AgentModule = {
  buildSystemPrompt(ctx: AgentContext): string {
    return buildAdminPrompt(ctx);
  },

  getTools(_ctx: AgentContext): any[] {
    return getAdminTools();
  },

  async executeToolCall(ctx: AgentContext, toolName: string, args: any): Promise<string> {
    console.log(`🔧 [Admin] Executing tool: ${toolName}`, args);
    if (toolName === 'criar_ticket') return await executeCreateTicket(ctx, args);
    if (toolName === 'consultar_contexto_ticket') return await executeGetTicketContext(ctx, args);
    if (toolName === 'encaminhar_humano') return await executeAdminHandoff(ctx, args);
    if (toolName === 'transferir_comercial') return await executeDepartmentTransfer(ctx, 'vendas', args);
    return `Ferramenta desconhecida: ${toolName}`;
  },

  async postProcess(ctx: AgentContext, aiResponse: string): Promise<string> {
    let finalResponse = aiResponse;

    if (isRepetitiveMessage(finalResponse, ctx.lastAiMessages)) {
      finalResponse = ctx.aiConfig.fallback_message || 'Posso te ajudar com mais alguma coisa?';
      ctx._loopDetected = true;
    }

    await updateAntiLoopState(ctx.supabase, ctx.tenantId, ctx.phoneNumber, finalResponse);

    return finalResponse;
  },
};
