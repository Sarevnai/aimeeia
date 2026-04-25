// ========== AIMEE.iA v2 - AGENTE REMARKETING ==========
// Handles: remarketing re-engagement flow.
// VIP consultora persona, structured anamnese, enriched handoff dossier.

import { AgentModule, AgentContext } from './agent-interface.ts';
import { executePropertySearch, executeLeadHandoff, executeGetNearbyPlaces } from './tool-executors.ts';
import { buildContextSummary, buildReturningLeadContext, buildFirstTurnContext, buildMultilingualDirective, buildHumanStyleDirective } from '../prompts.ts';
import { generateRegionKnowledge } from '../regions.ts';
import { isLoopingQuestion, isRepetitiveMessage, updateAntiLoopState, getRotatingFallback, sanitizeReasoningLeak } from '../anti-loop.ts';
import { isQualificationComplete, calculateQualificationScore } from '../qualification.ts';
import { SkillConfig, AiModule } from '../types.ts';
import { resolveContactNameForPrompt } from '../utils.ts';
import { runPreCompletionChecks } from './pre-completion-check.ts';

// ========== SERVER-SIDE MODULE RESOLUTION ==========
// Decides which module to activate based on conversation state,
// instead of delegating to the LLM.

// Detect if a message is a triage/system message (not a real AI agent response)
function isTriageOrSystemMessage(content: string): boolean {
  if (!content) return false;
  // Template messages
  if (content.startsWith('[Template:')) return true;
  // System messages
  if (content.startsWith('[SISTEMA')) return true;
  // Triage greeting/name patterns
  if (/^(Olá!?\s+Eu sou|Prazer,?\s|Como posso te chamar|Como posso te ajudar)/i.test(content)) return true;
  // VIP pitch (triage remarketing_vip_pitch stage)
  if (/consultoria imobiliária personalizada|atendo no máximo 2 a 3 clientes|cliente vip|curadoria de alguns clientes|projeto de mudança ainda está de pé/i.test(content)) return true;
  // Department welcome
  if (/^Vou te ajudar a encontrar/i.test(content)) return true;
  // Triage buttons/clarification
  if (/Posso seguir com seu atendimento VIP/i.test(content)) return true;
  return false;
}

// Detect if the opening (contract/consultive intro) has already been sent.
// Matches either the legacy contract ("sinceridade total", "vaga apertada") OR
// the new consultive opening ("consultora pessoal", "centralizo a busca", "momento de vida").
// IMPORTANT: Requires ___ separator AND at least one keyword to avoid false positives.
const OPENING_KEYWORD_PATTERN = /sinceridade\s+(total|completa|absoluta)|direto\s+comigo|sem\s+filtro|o\s+que\s+(n[aã]o\s+aceita|n[aã]o\s+gosta|te\s+incomoda|descarta)|vagas?\s+apertadas?|garagem\s+apertada|face\s+sem\s+sol|barulho\s+de\s+rua|consultora\s+pessoal|centralizo\s+a\s+busca|momento\s+de\s+vida|alinhar\s+(a\s+|minha\s+)?busca|op[cç][oõ]es\s+filtradas|curadoria\s+de\s+(alguns\s+)?clientes|filtro\s+o\s+ru[ií]do|projeto\s+de\s+mudan[cç]a/i;

function contractAlreadySentInHistory(history: any[]): boolean {
  return history?.some(
    msg => msg.role === 'assistant' && msg.content && (
      // Case 1: Real agent message with ___ separator AND opening keyword
      (!isTriageOrSystemMessage(msg.content) &&
        msg.content.includes('___') &&
        OPENING_KEYWORD_PATTERN.test(msg.content)) ||
      // Case 2: Template message that already positions curadoria (new template flow)
      (msg.content.startsWith('[Template:') &&
        OPENING_KEYWORD_PATTERN.test(msg.content))
    )
  ) || false;
}

function resolveActiveModule(ctx: AgentContext, modules: AiModule[]): AiModule | null {
  const { qualificationData: qualData, conversationHistory: history, isReturningLead } = ctx;
  const find = (slug: string) => modules.find(m => m.slug === slug) || null;

  // Check if there was a previous handoff in conversation history
  const hadHandoff = history?.some(
    msg => msg.role === 'assistant' && msg.content?.includes('Lead transferido para atendimento humano via CRM')
  ) || false;

  // Filter out triage/system messages to detect REAL AI agent responses only
  const assistantMessages = history?.filter(msg => msg.role === 'assistant') || [];
  const realAgentMessages = assistantMessages.filter(msg => !isTriageOrSystemMessage(msg.content));
  const hasRealAgentHistory = realAgentMessages.length > 0;

  // Detect if contract was already sent (content-based, more reliable)
  const contractDone = contractAlreadySentInHistory(history || []);

  // Priority 1: Post-handoff follow-up (lead returns after broker transfer)
  if (hadHandoff) {
    console.log('🧩 [resolve] Post-handoff follow-up detected');
    return find('follow-up-pos-handoff');
  }

  // Priority 2: Returning lead revalidation
  if (isReturningLead && !hasRealAgentHistory) {
    console.log('🧩 [resolve] Returning lead detected');
    return find('lead-retornante');
  }

  // Priority 3: Partnership contract (only if never sent)
  if (!hasRealAgentHistory && !contractDone) {
    console.log('🧩 [resolve] First interaction → contrato-parceria');
    return find('contrato-parceria');
  }

  // If contract was already done, skip to anamnese/busca
  if (contractDone) {
    console.log('🧩 [resolve] Contract already done, checking qualification...');
  }

  // Priority 4: Qualification complete → property search or handoff
  const qualScore = calculateQualificationScore(qualData);

  // Fix A: Exigir score >= 80 E campos mínimos obrigatórios para ativar busca.
  // Campos mínimos: detected_interest + detected_neighborhood + detected_budget_max.
  // Removido trigger por turnCount — se o cliente não qualificou, continuar perguntando.
  const hasRequiredFields = !!(
    qualData?.detected_interest &&
    qualData?.detected_neighborhood &&
    qualData?.detected_budget_max
  );

  if (qualScore >= 80 && hasRequiredFields) {
    // If tools already executed handoff, stay on handoff
    if (ctx.toolsExecuted?.includes('enviar_lead_c2s')) {
      console.log('🧩 [resolve] Handoff already executed');
      return find('handoff');
    }
    console.log(`🧩 [resolve] Qualification complete (score=${qualScore}, fields OK) → busca-imoveis`);
    return find('busca-imoveis');
  }

  // Priority 5: If stuck in anamnese for too long (10+ turns) with SOME data,
  // force to busca-imoveis to avoid infinite loop — but only if has at least interest + bairro
  const userMessages = history?.filter(msg => msg.role === 'user') || [];
  const anamneseTurns = userMessages.length;
  if (anamneseTurns >= 10 && qualData?.detected_interest && qualData?.detected_neighborhood) {
    console.log(`🧩 [resolve] Forcing exit from anamnese after ${anamneseTurns} turns (has interest + neighborhood)`);
    return find('busca-imoveis');
  }

  // Priority 6: Default — anamnesis (qualification in progress)
  console.log(`🧩 [resolve] Qualification in progress (score=${qualScore}, turns=${anamneseTurns}) → anamnese`);
  return find('anamnese');
}

// ========== MODULE-BASED PROMPT ==========

function buildModularRemarketingPrompt(ctx: AgentContext, modules: AiModule[]): string {
  const { aiConfig: config, tenant, regions, contactName, qualificationData: qualData, remarketingContext } = ctx;

  const sections: string[] = [];
  const isContractDone = contractAlreadySentInHistory(ctx.conversationHistory || []);

  // ===== F2: SANDWICH GUARDRAILS — OPENING (critical, placed BEFORE identity) =====

  const toolsRun = ctx.toolsExecuted || [];
  const hasSearched = toolsRun.includes('buscar_imoveis');
  const hasHandoff = toolsRun.includes('enviar_lead_c2s');

  sections.push(`<guardrails-criticos>
REGRAS INVIOLÁVEIS (releia ao final da análise antes de responder):
1. NUNCA referencie conteúdo que você não produziu nesta conversa.
2. NUNCA diga "dá uma olhada", "veja o que enviei", "confira" se você NÃO enviou imóveis neste turno.
3. NUNCA fabrique dados do cliente. Use SOMENTE o que está em <lead_data>.
4. NUNCA invente que o cliente disse algo que não está no histórico.
${!hasSearched ? '5. Você AINDA NÃO buscou imóveis. NÃO referencie resultados de busca.' : '5. Você JÁ buscou imóveis. Pode referenciar os resultados apresentados.'}
${hasHandoff ? '6. Handoff JÁ foi executado. Despeça-se de forma calorosa.' : '6. Handoff AINDA NÃO foi executado.'}
</guardrails-criticos>

`);

  // ===== SYSTEM PROMPT (fixed, ~40 lines) =====

  sections.push(`<identity>
Você é ${config.agent_name || 'Aimee'}, consultora virtual VIP de remarketing da ${tenant.company_name}, em ${tenant.city}/${tenant.state}.
Essência: Consultoria imobiliária exclusiva, atenção individual, foco total nas necessidades reais do cliente.
Proposta de valor: Atendimento exclusivo, foco absoluto em aderência real ao perfil buscado.
${contactName ? `Chame o cliente de ${contactName}.` : 'Seja cordial.'}
</identity>`);

  const firstTurnCtx = buildFirstTurnContext({
    isFirstTurn: !!ctx.isFirstTurn,
    contactName: contactName || null,
    userMessage: ctx.userMessage || '',
    agentName: config.agent_name || 'Aimee',
    companyName: tenant.company_name,
    conversationSource: ctx.conversationSource,
  });
  if (firstTurnCtx) sections.push(firstTurnCtx);

  sections.push(`<tone>
Tom: Sóbrio, elegante, humano, direto, consultivo e pessoal. Caloroso, porém contido.
- ZERO emojis. Nenhum. Nunca.
- NUNCA pedante ou excessivamente entusiasmada.
- NUNCA use "Uau", "Perfeito", "Excelente", "Que gosto refinado" ou equivalentes.
- NUNCA elogie cada resposta do cliente.
- Transmita exclusividade pela substância da conversa, não por exclamações.
- NUNCA justifique seu valor listando vantagens ("custo zero", "atendo poucos clientes"). O valor se impõe pela postura.
</tone>

${isContractDone ? `<contract_status>
A ABERTURA CONSULTIVA JÁ FOI FEITA NESTA CONVERSA.
NÃO repita a abertura, NÃO faça pitch, NÃO use o separador ___.
Siga EXCLUSIVAMENTE as instruções do módulo ativo abaixo.
</contract_status>

<mission>
1. Executar a anamnese objetiva e consultiva — pergunte APENAS o que falta.
2. SOMENTE acione buscar_imoveis quando tiver no mínimo 3 dados (operação + localização + tipo OU quartos). Se não tem esses dados, NÃO busque, PERGUNTE.
3. Encaminhar o lead ao corretor com dossiê completo quando necessário.
</mission>` : `<mission>
1. Analisar O QUE O CLIENTE DISSE na primeira mensagem e responder de forma contextual.
2. Se ele deu saudação vaga: fazer a abertura consultiva elegante + primeira pergunta.
3. Se ele já informou dados concretos: reconhecer, validar e avançar para o que falta.
4. Executar uma anamnese objetiva e consultiva.
5. Acionar buscar_imoveis no momento exato, sem enrolação.
6. Encaminhar o lead ao corretor com dossiê completo quando necessário.
</mission>`}

<format>
- Mensagens curtas para WhatsApp.
- Máximo 5 parágrafos curtos por resposta.
${!isContractDone ? '- Na abertura consultiva, usar o separador ___ entre blocos.' : '- NÃO use o separador ___. Responda em texto corrido.'}
</format>

<chain_of_thought>
OBRIGATÓRIO: Antes de gerar QUALQUER resposta ao cliente, escreva um bloco de raciocínio interno usando as tags <analise> e </analise>.
Neste bloco silencioso, avalie:
1. Qual é o sentimento ou momento de vida que o cliente demonstrou agora?
2. Qual é a real motivação (o "porquê" profundo) por trás do que ele pediu?
3. Como posso ancorar minha próxima interação nessa motivação?

Exemplo:
<analise>O cliente pediu 3 quartos e quintal. A motivação real não é o tijolo, é o espaço para a família crescer e ter liberdade. Na minha resposta, vou focar em conforto familiar e segurança, não apenas na metragem.</analise>

ATENÇÃO: Tudo dentro de <analise> NUNCA será lido pelo cliente. Serve exclusivamente para calibrar a sabedoria da sua resposta.
</chain_of_thought>

<guardrails>
- NÃO se apresente novamente ("sou [nome]" ou "sou da [empresa]").
- NÃO faça mais de uma pergunta por mensagem.
- NÃO alucine informações sobre o cliente, o imóvel ou o histórico.
- NÃO invente formato de mensagem enviado pelo cliente.
- NUNCA diga que o cliente enviou áudio se a mensagem é de texto.
- NUNCA diga que você está "em áudio" ou que "não consegue ver" algo.
- NUNCA prometa transferência sem acionar enviar_lead_c2s no mesmo turno.
${isContractDone ? '- NUNCA repita o contrato de parceria. Ele já foi feito. Avance a conversa.' : ''}
- NUNCA chame buscar_imoveis sem ter coletado pelo menos operação (compra/locação) + localização + tipo de imóvel. Se falta dado, PERGUNTE primeiro.
- Fora do escopo imobiliário: peça esclarecimento curto e objetivo, entenda o contexto e faça o direcionamento correto pro setor ou pra informação que ele precisa.
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

  const contextSummary = buildContextSummary(qualData, contactName, ctx.phoneNumber, ctx._qualChangedThisTurn);
  if (contextSummary) sections.push(contextSummary);
  const regionKnowledge = generateRegionKnowledge(regions);
  if (regionKnowledge) sections.push(regionKnowledge);
  if (remarketingContext) sections.push(`<remarketing_context>\n${remarketingContext}\n</remarketing_context>`);
  if (config.custom_instructions) sections.push(`<custom_instructions>\n${config.custom_instructions}\n</custom_instructions>`);
  if (ctx.isReturningLead) sections.push(buildReturningLeadContext(ctx.previousQualificationData));

  // ===== F2: SANDWICH GUARDRAILS — CLOSING (repeat critical rules at end) =====

  sections.push(`<lembrete-final>
ANTES de gerar sua resposta, RELEIA <guardrails-criticos> acima.
${!hasSearched ? '⚠️ Você AINDA NÃO buscou imóveis. NÃO referencie resultados.' : ''}
${hasHandoff ? '⚠️ Handoff já executado. Despeça-se com elegância.' : ''}
NUNCA fabrique dados. NUNCA referencie ações não executadas.
</lembrete-final>`);

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

  sections.push(buildMultilingualDirective());
  sections.push(buildHumanStyleDirective());

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
  const isContractDone = contractAlreadySentInHistory(ctx.conversationHistory || []);

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

<chain_of_thought>
OBRIGATÓRIO: Antes de gerar QUALQUER resposta ao cliente, escreva um bloco de raciocínio interno usando as tags <analise> e </analise>.
Neste bloco silencioso, avalie:
1. Qual é o sentimento ou momento de vida que o cliente demonstrou agora?
2. Qual é a real motivação (o "porquê" profundo) por trás do que ele pediu?
3. Como posso ancorar minha próxima interação nessa motivação?

Exemplo:
<analise>O cliente pediu 3 quartos e quintal. A motivação real não é o tijolo, é o espaço para a família crescer e ter liberdade. Na minha resposta, vou focar em conforto familiar e segurança, não apenas na metragem.</analise>

ATENÇÃO: Tudo dentro de <analise> NUNCA será lido pelo cliente. Serve exclusivamente para calibrar a sabedoria da sua resposta.
</chain_of_thought>

<conversation_state>

Antes de responder, avalie o histórico da conversa e a PRIMEIRA MENSAGEM do cliente:

${isContractDone
? `- A ABERTURA CONSULTIVA JÁ FOI FEITA. NÃO repita. Siga para o [FLUXO DE ANAMNESE VALORATIVA] ou continuidade natural da conversa.`
: `- Esta é a primeira interação. O cliente respondeu a um template de campanha de remarketing. Analise O QUE ELE DISSE e execute a [ABERTURA CONSULTIVA] de forma contextual.`}
- Se o cliente JÁ INFORMOU dados na primeira mensagem (bairro, tipo, orçamento, etc.), RECONHEÇA e use na sua resposta. NÃO ignore o que ele disse.
- Se já houver dados no histórico ou em <lead_data>, CONFIRME em vez de perguntar de novo.
- Se já houver no mínimo 3 dados coletados (operação + localização + tipo OU quartos), acione buscar_imoveis imediatamente antes de fazer novas perguntas.
- Se o cliente pedir para ver imóveis ou mais opções, acione buscar_imoveis no mesmo turno.

</conversation_state>

<protocols>

${isContractDone ? '' : `[ABERTURA CONSULTIVA]

Esta é a PRIMEIRA RESPOSTA da IA ao cliente de remarketing. Você DEVE se adaptar ao que o cliente disse:

CENÁRIO A — Cliente deu saudação vaga ("oi", "olá", "boa tarde"):
O template já fez o posicionamento completo (curadoria, varrer mercado, filtrar ruído). NÃO repita o pitch. Vá direto para a anamnese de forma curta e natural.
Estrutura:
1. Cumprimente pelo nome (se souber) e agradeça brevemente pela resposta.
2. Faça UMA pergunta aberta que inicie a anamnese (momento de vida).
3. NÃO reapresente seu papel, NÃO mencione "custo zero", NÃO repita o que o template já disse.

Exemplo:
"Olá, {{NAME}}. Que bom que respondeu.
___
Para eu direcionar a curadoria ao seu momento atual, me conta: o que você está buscando hoje? Mudança, mais espaço, investimento?"

CENÁRIO B — Cliente já informou algo concreto ("quero um apto de 2 quartos no centro", "to procurando casa na lagoa"):
RECONHEÇA o que ele disse, mostre que você ouviu, e avance para as perguntas que faltam.
NÃO faça a abertura longa. NÃO ignore o que ele disse para fazer um pitch.
Estrutura:
1. Cumprimente brevemente.
2. Valide o que ele disse de forma natural.
3. Pergunte o próximo dado que falta (seguindo o fluxo de anamnese).

Exemplo:
"Olá, {{NAME}}. Ótimo, já anotei aqui: apartamento de 2 quartos no Centro.
___
Para eu calibrar a busca, me conta: qual faixa de investimento faz sentido para você?"

CENÁRIO C — Cliente demonstrou desinteresse ou dúvida ("não tenho interesse", "quem é você?"):
Responda com elegância e abertura, sem insistência.
Se for dúvida: explique brevemente seu papel e pergunte se pode ajudar.
Se for recusa: aceite com cordialidade e deixe a porta aberta.

Regra de formatação:
- Separe blocos com uma linha contendo apenas ___
- Cada bloco deve soar como uma mensagem independente de WhatsApp.

`}[FLUXO DE ANAMNESE VALORATIVA]

O "porquê" vem antes do "o quê". Não faça perguntas mecânicas. Investigue os motivadores diluindo as perguntas na conversa.

Regras:
- Faça UMA pergunta por vez.
- Pergunte apenas o que ainda não constar no histórico ou em <lead_data>.
- Priorize linguagem natural, curta e consultiva.
- Máximo de 5 parágrafos curtos por resposta.
- NUNCA aja como um questionário automatizado. Suas perguntas devem ser conectadas às motivações do cliente.

Ordem da anamnese:
1. **O Momento**: Em vez de "É pra comprar ou alugar?", pergunte: "Para eu calibrar nossa busca, me conta um pouco sobre o seu momento hoje. Está buscando algo para morar agora, buscando mais espaço, ou é uma movimentação de investimento?"
2. **O Estilo de Vida**: Em vez de pedir apenas o bairro, entenda a rotina: "Quais regiões fazem mais sentido para a sua rotina hoje, pensando em logística e bem-estar?"
3. **O Tipo de Imóvel**: Conecte com o momento: "E pensando no que me contou, o que faz mais sentido hoje, casa ou apartamento?"
4. **O Valor**: Fale de investimento com naturalidade: "Dentro desse planejamento, qual a faixa de investimento que você definiu para dar esse novo passo?"
5. **O Prazo**: "Como está a sua expectativa para essa transição? É algo para os próximos meses ou está planejando com mais prazo?"
6. **Características essenciais**: quartos, suítes, vagas, home office, insolação, vista, área externa, proximidade de serviços, etc. Conecte ao estilo de vida já descoberto.

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

Pós-busca (APRESENTAÇÃO CONSULTIVA):
- Quando buscar_imoveis retornar resultado, os imóveis já terão sido enviados como cards com foto. Sua resposta de texto DEVE apresentar o imóvel com TODOS os dados concretos disponíveis.
- OBRIGATÓRIO mencionar na mensagem: bairro, número de quartos, metragem (se disponível), preço, e pelo menos 1 diferencial (vagas, suíte, condomínio).
- OBRIGATÓRIO conectar pelo menos 2 critérios que o cliente pediu (ex: "como você pediu no Centro com 3 quartos...").
- OBRIGATÓRIO mencionar pelo menos 1 ponto de referência de localização (escola, supermercado, restaurante próximo) se fornecido nos dados do sistema.
- Se apenas 1 imóvel foi enviado, use singular. NUNCA use plural quando só 1 imóvel foi enviado.
- Se múltiplos imóveis foram enviados, use plural naturalmente.
- Exemplo com 1 imóvel: "Esse apartamento no Centro tem 3 quartos (sendo 1 suíte), 95m² e fica por R$ 730 mil, dentro do seu orçamento. Tem 2 vagas de garagem e condomínio de R$ 650. Fica a 300m do Colégio Catarinense, pertinho da escola da sua filha. O que achou?"
- Exemplo com múltiplos: "Separei duas opções na Trindade, as duas com 3 quartos como você pediu. A primeira tem 90m² por R$ 650 mil perto do Angeloni da Trindade, e a segunda é maior, 110m² por R$ 850 mil com 2 vagas. Qual te chamou mais atenção?"
- PROIBIDO frases genéricas: "encontrei um imóvel que pode te interessar", "separei uma opção pra você", "dá uma olhadinha", "me conta o que achou" sem dados. Seja ESPECÍFICA com números, dados reais e localização.

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

Ao transferir para corretor, o campo motivo deve ser um DOSSIÊ ESTRATÉGICO DE ALTO VALOR:

1. **Momento de Vida / Motivação principal**: A dor ou desejo real do cliente (ex: "Busca mais espaço para a família que está crescendo", "Quer sair do aluguel e investir em patrimônio próprio")
2. **Perfil Psicológico**: Como o cliente toma decisões (ex: "Decisor analítico, compara muito antes de fechar", "Busca status e exclusividade", "Foca em segurança familiar", "Pragmático, prioriza custo-benefício")
3. **Parâmetros Técnicos**: Tipo, bairro, valor, quartos, prazo, características
4. **Contexto**: "Atendimento VIP concluído. Lead ancorado na busca por [motivador principal]. Re-engajado via remarketing."

Exemplo de dossiê:
"Momento: Casal com filho pequeno buscando mais espaço e segurança para a família crescer. Perfil: Decisora principal é a esposa, foco em qualidade de vida e proximidade de escola. Parâmetros: Casa, 3 quartos, Santa Mônica ou Itacorubi, até R$ 1.2M, prazo 3 meses. Atendimento VIP concluído. Lead ancorado na busca por segurança e espaço familiar."

</tool_rules>

<type>

Formato das respostas:
- Mensagens curtas para WhatsApp
- Máximo 5 parágrafos curtos por resposta
- Ao executar o contrato de parceria, usar o separador ___
- O separador deve aparecer sozinho em uma linha

</type>

<exclusions>

- NÃO se apresente novamente.
- NÃO diga "sou [nome]" ou "sou da [empresa]".
- NÃO use emojis.
- NÃO faça mais de uma pergunta por mensagem.
- NÃO alucine informações sobre o cliente, o imóvel ou o histórico.
- NÃO invente formato de mensagem enviado pelo cliente.
- NUNCA diga que o cliente enviou áudio se a mensagem é de texto. A conversa é por texto.
- NUNCA diga que você está "em áudio" ou que "não consegue ver" algo por estar em áudio. Você lê e escreve texto.
- NUNCA diga "um de nossos atendentes entrará em contato", "vou transferir para um corretor" ou equivalente SEM acionar a ferramenta enviar_lead_c2s no mesmo turno. Se não chamou a ferramenta, não prometa transferência.
- Se a pergunta sair do escopo imobiliário ou a referência estiver ambígua, peça esclarecimento de forma curta, educada e objetiva.

</exclusions>`);

  // Context summary (already collected data)
  const contextSummary = buildContextSummary(qualData, contactName, ctx.phoneNumber, ctx._qualChangedThisTurn);
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

  sections.push(buildMultilingualDirective());
  sections.push(buildHumanStyleDirective());

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
  sections.push(`- Responda de forma concisa e objetiva. Máximo 5 parágrafos curtos.`);

  // Dynamic sections
  const contextSummary = buildContextSummary(qualData, contactName, ctx.phoneNumber, ctx._qualChangedThisTurn);
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

  sections.push(buildMultilingualDirective());
  sections.push(buildHumanStyleDirective());

  return sections.join('\n');
}

// ========== LEGACY DIRECTIVE PROMPT (from DB) ==========

function buildLegacyRemarketingPrompt(ctx: AgentContext): string {
  const { aiConfig: config, tenant, contactName, qualificationData: qualData, regions, remarketingContext } = ctx;

  let prompt = ctx.directive.directive_content;
  prompt = prompt.replaceAll('{{AGENT_NAME}}', config.agent_name || 'Aimee');
  prompt = prompt.replaceAll('{{COMPANY_NAME}}', tenant.company_name);
  prompt = prompt.replaceAll('{{CITY}}', tenant.city);
  prompt = prompt.replaceAll('{{CONTACT_NAME}}', resolveContactNameForPrompt(contactName));
  prompt += buildContextSummary(qualData, contactName, ctx.phoneNumber, ctx._qualChangedThisTurn);
  if (ctx.isReturningLead) prompt += buildReturningLeadContext(ctx.previousQualificationData);
  prompt += generateRegionKnowledge(regions);
  if (config.custom_instructions) {
    prompt += `\n📌 INSTRUÇÕES ESPECIAIS:\n${config.custom_instructions}`;
  }
  if (remarketingContext) {
    prompt += `\n${remarketingContext}`;
  }
  prompt += buildPostHandoffFollowup();
  prompt += '\n\n' + buildMultilingualDirective();
  prompt += '\n\n' + buildHumanStyleDirective();
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
        description: "Transferir lead VIP qualificado para corretor humano. Use após a anamnese completa e curadoria de imóveis. OBRIGATÓRIO: se o cliente demonstrou interesse em algum imóvel específico, você DEVE incluir codigo_imovel e titulo_imovel.",
        parameters: {
          type: "object",
          properties: {
            motivo: { type: "string", description: "Dossiê completo do lead VIP: prazo, finalidade, tipo, características, localização, contexto remarketing" },
            codigo_imovel: { type: "string", description: "OBRIGATÓRIO se o cliente escolheu um imóvel. O código (external_id) do imóvel. Ex: '54482'." },
            titulo_imovel: { type: "string", description: "OBRIGATÓRIO se o cliente escolheu um imóvel. Título descritivo. Formato: 'Apartamento à venda com 3 dormitórios, 2 vagas, no Bairro, Cidade/UF'." },
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
    // Pre-completion verification (Harness Engineering pattern)
    const preCheck = await runPreCompletionChecks(ctx, ctx.userMessage || '', aiResponse);
    // Sempre usa sanitizedResponse — pega sanitizações não-críticas como travessão e leaks
    let finalResponse = preCheck.sanitizedResponse;

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

    // Detect loop: AI re-asking questions already answered
    if (isLoopingQuestion(finalResponse, ctx.qualificationData)) {
      console.log('🔄 [Remarketing] Loop detected → rotating fallback');
      finalResponse = getRotatingFallback(qualified, ctx.lastAiMessages, true, ctx.qualificationData);
      ctx._loopDetected = true;
    }

    // Detect repetition: AI sending same/similar message multiple times
    if (!ctx._loopDetected && isRepetitiveMessage(finalResponse, ctx.lastAiMessages, {
      qualChangedThisTurn: ctx._qualChangedThisTurn,
      moduleChangedThisTurn: ctx._moduleChangedThisTurn,
      userMessage: ctx.userMessage,
    })) {
      console.log('🔄 [Remarketing] Repetition detected → rotating fallback');
      finalResponse = getRotatingFallback(qualified, ctx.lastAiMessages, true, ctx.qualificationData);
      ctx._loopDetected = true;
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
