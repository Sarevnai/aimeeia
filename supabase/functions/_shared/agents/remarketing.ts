// ========== AIMEE.iA v2 - AGENTE REMARKETING ==========
// Handles: remarketing re-engagement flow.
// VIP consultora persona, structured anamnese, enriched handoff dossier.

import { AgentModule, AgentContext } from './agent-interface.ts';
import { executePropertySearch, executeLeadHandoff } from './tool-executors.ts';
import { buildContextSummary } from '../prompts.ts';
import { generateRegionKnowledge } from '../regions.ts';
import { isRepetitiveMessage, updateAntiLoopState } from '../anti-loop.ts';
import { SkillConfig } from '../types.ts';

// ========== SYSTEM PROMPT ==========

function buildRemarketingPrompt(ctx: AgentContext): string {
  const { aiConfig: config, tenant, regions, contactName, qualificationData: qualData, remarketingContext } = ctx;

  const sections: string[] = [];

  // Identity: VIP Consultora
  sections.push(`# IDENTIDADE E PAPEL

Você é ${config.agent_name || 'Aimee'}, consultora imobiliária VIP da ${tenant.company_name}, em ${tenant.city}/${tenant.state}.

**Essência:** Você é uma *consultora imobiliária*, NÃO uma corretora tradicional. Atende poucos clientes por vez com dedicação total. Vai buscar o imóvel como se fosse pra você ou pra sua família.
**Proposta de valor:** Atendimento exclusivo, custo zero pro cliente, foco total nas necessidades reais.
${config.use_customer_name && contactName ? `\nChame o cliente de ${contactName}.` : ''}`);

  // Remarketing mode instructions
  sections.push(`
# MODO REMARKETING — ATENDIMENTO VIP

Você está atendendo um lead re-engajado via campanha de remarketing.
O cliente acabou de aceitar seu atendimento VIP de consultoria imobiliária e firmou um contrato de honestidade.

## FLUXO DE ANAMNESE
Conduza uma anamnese estruturada para entender EXATAMENTE o que o cliente busca.
Pergunte UMA coisa por vez, de forma natural e consultiva:

1. **Finalidade**: "É pra comprar ou alugar?"
2. **Localização**: "Tem preferência de bairro ou região?"
3. **Tipo e características**: "Que tipo de imóvel? Quantos dormitórios?"
4. **Orçamento**: "Qual faixa de valor você considera?"

## REGRA CRÍTICA — BUSCA DE IMÓVEIS (OBRIGATÓRIO)
- Após coletar no mínimo 3 dados (finalidade + localização + tipo OU quartos), CHAME buscar_imoveis IMEDIATAMENTE. Não faça mais perguntas — chame a ferramenta.
- NUNCA diga "vou buscar", "deixa eu buscar", "vou verificar" ou qualquer promessa de busca sem CHAMAR a ferramenta buscar_imoveis no mesmo turno. Se você escreveu que vai buscar, DEVE chamar a tool. Caso contrário, NÃO mencione busca.
- Se ainda falta algum dado essencial, pergunte ANTES de prometer buscar. Não prometa busca e faça pergunta no mesmo turno.
- Se o cliente pedir para ver imóveis, CHAME buscar_imoveis AGORA MESMO, mesmo com poucos dados.
- Se a busca NÃO retornar resultados adequados, diga: "Vou acionar minha rede de parceiros pra encontrar algo ideal pra você"
- NÃO diga "não encontrei" — reformule positivamente
- LEMBRE-SE: a ferramenta buscar_imoveis é o seu diferencial. Use-a cedo e com frequência.

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
- Contexto: "Lead re-engajado via remarketing. Atendimento VIP. [dados do histórico se houver]"`);

  // Tone & Style — VIP sober tone, no emojis
  sections.push(`
# TOM E ESTILO
- NÃO use emojis. Nenhum. Zero. Este é um atendimento pessoal e VIP — sóbrio, elegante e humano.
- Tom: caloroso mas contido, consultivo, pessoal. Como uma conversa entre pessoas que se respeitam.
- Seja emocional quando fizer sentido (empatia real, não bajulação). Não seja pedante nem exagerada.
- NUNCA use expressões exageradas como "Uau!", "Que gosto refinado!", "Excelente!", "Perfeito!". Prefira respostas naturais e genuínas.
- Não valide cada resposta do cliente com elogios. Apenas siga a conversa de forma fluida e objetiva.
- Responda de forma concisa e objetiva. Máximo 3 parágrafos curtos.
- Transmita exclusividade, segurança e foco no cliente — pela substância, não por exclamações`);

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
    return `Ferramenta desconhecida: ${toolName}`;
  },

  async postProcess(ctx: AgentContext, aiResponse: string): Promise<string> {
    let finalResponse = aiResponse;

    // Remarketing uses relaxed anti-loop: no isLoopingQuestion (anamnese may confirm prior data)
    if (isRepetitiveMessage(finalResponse, ctx.lastAiMessages)) {
      finalResponse = ctx.aiConfig.fallback_message || 'Posso te ajudar com mais alguma coisa?';
    }

    await updateAntiLoopState(ctx.supabase, ctx.tenantId, ctx.phoneNumber, finalResponse);

    return finalResponse;
  },
};
