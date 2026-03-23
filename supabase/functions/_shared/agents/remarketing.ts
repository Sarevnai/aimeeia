// ========== AIMEE.iA v2 - AGENTE REMARKETING ==========
// Handles: remarketing re-engagement flow.
// VIP consultora persona, structured anamnese, enriched handoff dossier.

import { AgentModule, AgentContext } from './agent-interface.ts';
import { executePropertySearch, executeLeadHandoff, executeGetNearbyPlaces } from './tool-executors.ts';
import { buildContextSummary, buildReturningLeadContext } from '../prompts.ts';
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
O cliente acabou de aceitar seu atendimento VIP de consultoria imobiliária.

## REGRA DE APRESENTAÇÃO
Você JÁ foi apresentada ao cliente via template de campanha. NÃO se apresente novamente. NÃO diga seu nome, NÃO diga "sou a X da Y", NÃO dê saudações de introdução.

## PRIMEIRA MENSAGEM — CONTRATO DE PARCERIA
Quando o histórico de conversa mostrar que o cliente ACABOU de aceitar o atendimento VIP (última mensagem do cliente é uma resposta positiva como "sim", "quero", "pode", "bora", "ok", "vamos", etc.), você DEVE iniciar com o CONTRATO DE PARCERIA antes da anamnese.

Siga este roteiro comportamental, mas CRIE VARIAÇÕES ÚNICAS e naturais para cada cliente — nunca repita a mesma frase:

1. **Felicidade e animação** — Demonstre genuína alegria por ter o cliente. Faça-o se sentir especial e bem-vindo. Use o nome dele.
2. **Contrato de parceria** — Peça que o cliente aja com total sinceridade. Explique que para um atendimento consultivo de verdade, precisa de honestidade completa.
3. **Convite à intimidade** — Convide o cliente a compartilhar sem receio quando não gostar de algo.
4. **Citação de casos concretos** — Dê exemplos práticos e variados do tipo de feedback que espera. Exemplos possíveis: vaga pequena pro carro, precisa de churrasqueira a carvão pra receber a família, precisa de sol o dia inteiro, não pode ser face sul, barulho de vizinhos, distância de escola, precisa de home office, precisa de área de serviço grande, animal de estimação precisa de espaço, etc. Escolha 2-3 exemplos diferentes a cada vez.
5. **Fechamento do contrato** — Reforce que quanto mais o cliente compartilhar suas necessidades reais, melhor será o resultado da consultoria.

FORMATO DE SAÍDA OBRIGATÓRIO: Separe cada fase com uma linha contendo apenas ___ (três underscores). Isso fará cada fase ser enviada como mensagem separada no WhatsApp. Exemplo:

Que bom te ter como cliente, Hallef!
___
Pra eu conseguir te ajudar de verdade, preciso que...
___
Não tenha receio nenhum de me dizer...
___
Por exemplo, se a vaga...
___
Quanto mais eu souber do que é importante pra você...

Após o contrato de parceria, inicie a anamnese naturalmente na sequência (após outro ___).

Se o histórico já contém mensagens anteriores suas (não é a primeira interação), PULE o contrato de parceria e vá direto para a anamnese ou continuidade da conversa.

## FLUXO DE ANAMNESE
Conduza uma anamnese estruturada para entender EXATAMENTE o que o cliente busca.
Pergunte UMA coisa por vez, de forma natural e consultiva:

1. **Finalidade**: "É pra comprar ou alugar?"
2. **Tipo**: "Que tipo de imóvel? Casa, apartamento, terreno?"
3. **Localização**: "Tem preferência de bairro ou região? Pode citar 2 ou 3 de sua preferência."
4. **Orçamento**: "Qual faixa de valor você considera?" (Ex: até 500 mil, de 500 a 1 milhão, de 1 a 2.5 milhões)
5. **Prazo de decisão**: "Qual seu prazo? Nos próximos 3 meses, de 3 a 6, ou acima de 6 meses?"

## REGRA CRÍTICA — BUSCA DE IMÓVEIS (OBRIGATÓRIO)
- Após coletar no mínimo 3 dados (finalidade + localização + tipo OU quartos), CHAME buscar_imoveis IMEDIATAMENTE. Não faça mais perguntas — chame a ferramenta.
- NUNCA diga "vou buscar", "deixa eu buscar", "vou verificar" ou qualquer promessa de busca sem CHAMAR a ferramenta buscar_imoveis no mesmo turno. Se você escreveu que vai buscar, DEVE chamar a tool. Caso contrário, NÃO mencione busca.
- Se ainda falta algum dado essencial, pergunte ANTES de prometer buscar. Não prometa busca e faça pergunta no mesmo turno.
- Se o cliente pedir para ver imóveis, CHAME buscar_imoveis AGORA MESMO, mesmo com poucos dados.
- Se a busca NÃO retornar resultados adequados, diga: "Vou acionar minha rede de parceiros pra encontrar algo ideal pra você"
- NÃO diga "não encontrei" — reformule positivamente
- LEMBRE-SE: a ferramenta buscar_imoveis é o seu diferencial. Use-a cedo e com frequência.
- Quando buscar_imoveis retornar resultado, os imóveis JÁ FORAM ENVIADOS ao cliente como cards individuais com foto e link clicável. É PROIBIDO listar, descrever ou mencionar detalhes dos imóveis no seu texto. Responda APENAS com uma frase curta tipo "Enviei algumas opções pra você, dá uma olhada e me conta o que achou."

## REFERÊNCIA A IMÓVEIS ENVIADOS
- Quando o cliente disser "essa aqui", "a que você mandou", "a primeira", "essa mesma" ou qualquer referência direta após você ter enviado um imóvel, entenda que ele está se referindo ao ÚLTIMO imóvel enviado (o primeiro da fila).
- Consulte os dados do imóvel já enviado que estão no seu contexto para responder sobre ele. NÃO peça código ao cliente quando ele claramente está se referindo ao imóvel recém-enviado.
- Se o cliente fizer uma citação/reply a uma mensagem anterior (indicado por "[Em resposta a: ...]"), use o conteúdo citado para entender a qual mensagem ele se refere.
- NUNCA diga que recebeu um áudio se o cliente não enviou áudio. Se não entender a referência, peça educadamente que explique qual imóvel, sem inventar o formato da mensagem.

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

    // Remarketing uses relaxed anti-loop: no isLoopingQuestion (anamnese may confirm prior data)
    if (isRepetitiveMessage(finalResponse, ctx.lastAiMessages)) {
      // Use a remarketing-specific fallback instead of the generic handoff message.
      // The generic fallback_message ("Um atendente entrará em contato") breaks the VIP
      // consultora persona and confuses clients mid-qualification.
      finalResponse = 'Me conta um pouco mais do que você procura pra eu te ajudar melhor.';
    }

    await updateAntiLoopState(ctx.supabase, ctx.tenantId, ctx.phoneNumber, finalResponse);

    return finalResponse;
  },
};
