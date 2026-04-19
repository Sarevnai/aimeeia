// ========== AIMEE.iA v2 - AGENTE ADMIN ==========
// Handles: administrativo department.
// Focused prompt (~800 tokens), ticket creation + human handoff tools.

import { AgentModule, AgentContext } from './agent-interface.ts';
import { executeCreateTicket, executeAdminHandoff, executeDepartmentTransfer } from './tool-executors.ts';
import { isRepetitiveMessage, updateAntiLoopState } from '../anti-loop.ts';
import { AiModule } from '../types.ts';

// ========== MODULE-BASED PROMPT ==========

function buildModularAdminPrompt(ctx: AgentContext, modules: AiModule[]): string {
  const { aiConfig: config, tenant, contactName, currentModuleSlug } = ctx;

  const sections: string[] = [];

  sections.push(`<identity>
Você é ${config.agent_name || 'Aimee'}, assistente virtual do setor administrativo da ${tenant.company_name}.
Tom: profissional, empático e resolutivo.
${contactName ? `Chame o cliente de ${contactName}.` : 'Seja cordial.'}
</identity>`);

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

  return sections.join('\n');
}

// ========== SYSTEM PROMPT ==========

function buildAdminPrompt(ctx: AgentContext): string {
  const { aiConfig: config, tenant, contactName } = ctx;

  // Priority 0: Intelligence Modules (if tenant has active modules for admin category)
  const adminModules = ctx.activeModules?.filter(m => m.category === 'admin' || m.category === 'general') || [];
  if (adminModules.length > 0) {
    return buildModularAdminPrompt(ctx, adminModules);
  }

  // Priority 1: Legacy directive_content (structured_config is less common for admin)
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

  // Priority 2: Built-in fallback
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

# ROTEAMENTO — TRANSFERÊNCIA PARA COMERCIAL
Se durante o atendimento o cliente demonstrar interesse em COMPRAR ou ALUGAR um imóvel novo (não apenas resolver questões do imóvel atual), use a ferramenta transferir_comercial. Exemplos: "queria comprar uma casa", "tô procurando outro apto pra alugar", "meu filho vai morar sozinho, preciso de um apartamento". Antes de transferir, resolva ou registre a questão administrativa em aberto.
${config.custom_instructions ? `\n📌 INSTRUÇÕES ESPECIAIS:\n${config.custom_instructions}` : ''}`;
}

// ========== TOOLS ==========

function getAdminTools(): any[] {
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
              description: "Prioridade baseada na urgência",
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
    {
      type: "function",
      function: {
        name: "transferir_comercial",
        description: "Encaminha a conversa para o setor comercial. Use quando o cliente demonstrar interesse em comprar ou alugar um imóvel novo (diferente do que ele já tem com a imobiliária). NÃO use para questões administrativas — só quando há intenção comercial real.",
        parameters: {
          type: "object",
          properties: {
            motivo: { type: "string", description: "O que o cliente mencionou que indica interesse comercial (ex: 'cliente inquilino disse que quer comprar uma casa')." },
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
