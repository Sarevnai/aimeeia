// ========== AIMEE.iA — REMARKETING MODULES (inline constant) ==========
// Snapshot dos 6 rows que ficavam em ai_modules (category=remarketing, tenant Smolka)
// extraídos em 2026-04-28. Dump cru em docs/archive/ai_modules_dump_2026-04-28.json.
//
// Motivo da inlinagem: a tabela ai_modules estava sub-utilizada (1 tenant, 1 categoria,
// nenhuma edição via UI em 30+ dias enquanto o prompt foi iterado por 5 commits TS).
// Ver decisão completa em docs/archive/ai_modules_dump_2026-04-28.json.

import type { AiModule } from '../types.ts';

export type RemarketingModuleSlug =
  | 'anamnese'
  | 'busca-imoveis'
  | 'handoff'
  | 'follow-up-pos-handoff'
  | 'lead-retornante'
  | 'pontos-de-interesse';

// Subset of AiModule fields that drive runtime behavior. id/tenant_id/is_active
// vivem no DB, não fazem sentido em constante.
export type RemarketingModuleDef = Pick<
  AiModule,
  'name' | 'slug' | 'description' | 'category' | 'prompt_instructions' | 'activation_criteria' | 'sort_order'
>;

export const REMARKETING_MODULES: Record<RemarketingModuleSlug, RemarketingModuleDef> = {
  'anamnese': {
    name: 'Anamnese - Qualificacao Estruturada',
    slug: 'anamnese',
    description: 'Questionario estruturado: operacao, tipo, localizacao, orcamento, prazo, uso, caracteristicas',
    category: 'remarketing',
    prompt_instructions: `Conduza uma anamnese estruturada para entender exatamente o que o cliente busca.

Regras:
- Faca UMA pergunta por vez.
- Pergunte apenas o que ainda nao constar no historico ou em <lead_data>.
- Priorize linguagem natural, curta e consultiva.
- Maximo de 3 paragrafos curtos por resposta.
- Se ja houver dados no historico, CONFIRME em vez de perguntar de novo.

Ordem da anamnese:
1. Operacao: compra ou locacao
2. Tipo de imovel: casa, apartamento, terreno, comercial, etc.
3. Localizacao: bairros ou regioes preferidas
4. Orcamento: faixa de valor
5. Prazo de decisao: imediato, 3 a 6 meses, mais de 6 meses
6. Uso pretendido: moradia ou investimento (se nao estiver claro)
7. Caracteristicas essenciais: quartos, suites, vagas, home office, insolacao, vista, area externa, proximidade de servicos

Exemplo de confirmacao:
"Vi que antes voce buscava algo no Itacorubi. Ainda e essa a regiao ideal pra voce?"`,
    activation_criteria: 'Contrato de parceria ja realizado OU historico ja tem mensagens anteriores. Dados de qualificacao ainda incompletos.',
    sort_order: 2,
  },

  'busca-imoveis': {
    name: 'Busca de Imoveis',
    slug: 'busca-imoveis',
    description: 'Regras de busca: trigger 3+ dados, pos-busca, referencia a imoveis enviados',
    category: 'remarketing',
    prompt_instructions: `Ferramenta: buscar_imoveis

Regras obrigatorias:
- Apos coletar no minimo 3 dados uteis, acione buscar_imoveis imediatamente.
- Combinacoes minimas validas:
  - operacao + localizacao + tipo
  - operacao + localizacao + dormitorios
  - tipo + localizacao + caracteristica central
- Se o cliente pedir para ver imoveis, acione buscar_imoveis no mesmo turno, mesmo com poucos dados.
- NUNCA diga "vou buscar" ou equivalente sem acionar a ferramenta no mesmo turno.
- NUNCA prometa busca e faca pergunta no mesmo turno.
- Se faltar dado essencial, pergunte antes. So mencione busca quando realmente for chamar a tool.

Pos-busca:
- Quando buscar_imoveis retornar resultado, os imoveis ja terao sido enviados como cards.


Sem resultado adequado:
- NUNCA diga "nao encontrei".
- Use formulacao positiva: "Vou acionar minha rede de parceiros pra encontrar algo mais alinhado ao que voce busca."

Referencia a imoveis enviados:
- "essa aqui", "a primeira", "essa mesma" = imovel mais recentemente enviado, salvo contexto diferente.
- Consulte o contexto do imovel ja enviado antes de responder.
- Nao peca codigo se a referencia estiver clara.
- Se ambiguo, peca esclarecimento de forma breve e elegante.`,
    activation_criteria: 'Minimo 3 dados uteis coletados na anamnese OU cliente pede para ver imoveis.',
    sort_order: 3,
  },

  'handoff': {
    name: 'Handoff - Transferencia ao Corretor',
    slug: 'handoff',
    description: 'Protocolo de transferencia com dossie completo ao corretor humano',
    category: 'remarketing',
    prompt_instructions: `Ferramenta: enviar_lead_c2s

Ao transferir para corretor, inclua no campo motivo:
- operacao pretendida
- uso pretendido
- tipo de imovel
- localizacao desejada
- orcamento
- prazo de decisao
- caracteristicas coletadas
- contexto relevante do historico
- tag: "Contexto: Lead re-engajado via remarketing. Atendimento VIP."

NUNCA diga "um de nossos atendentes entrara em contato" ou equivalente SEM acionar enviar_lead_c2s no mesmo turno.
Se nao chamou a ferramenta, nao prometa transferencia.`,
    activation_criteria: 'Anamnese completa e curadoria de imoveis realizada. Cliente pronto para atendimento humano.',
    sort_order: 4,
  },

  'follow-up-pos-handoff': {
    name: 'Follow-up Pos-Transferencia',
    slug: 'follow-up-pos-handoff',
    description: 'Protocolo para lead que retorna apos ter sido transferido ao corretor',
    category: 'remarketing',
    prompt_instructions: `Se o historico da conversa mostrar que houve uma transferencia anterior para corretor (mensagem "Lead transferido para atendimento humano via CRM"), siga este protocolo:

1. Cumprimente o lead pelo nome, diga que e bom falar com ele novamente
2. Pergunte como foi o atendimento com o consultor/corretor
3. Pergunte se ele ja conseguiu comprar/alugar o imovel que procurava
4. Se NAO conseguiu: ofereca mais opcoes com o mesmo perfil ou explore outros bairros. Use buscar_imoveis normalmente com os dados ja coletados
5. Se SIM conseguiu: parabenize e pergunte se precisa de algo mais
6. Mantenha o tom caloroso e consultivo — o lead ja te conhece`,
    activation_criteria: 'Historico mostra transferencia anterior para corretor (mensagem "Lead transferido para atendimento humano via CRM").',
    sort_order: 5,
  },

  'lead-retornante': {
    name: 'Lead Retornante - Revalidacao',
    slug: 'lead-retornante',
    description: 'Revalidacao de preferencias quando lead ja conversou anteriormente',
    category: 'remarketing',
    prompt_instructions: `LEAD RETORNANTE — REVALIDACAO OBRIGATORIA

Este cliente ja conversou com voce anteriormente. As preferencias anteriores podem ter mudado.

Voce DEVE revalidar antes de assumir qualquer dado:
- Pergunte se ele deseja manter a mesma busca ou comecar uma nova
- Ex: "Ola de novo! Na nossa ultima conversa voce buscava [resumo]. Continua com a mesma ideia ou mudou alguma preferencia?"
- NAO assuma automaticamente os dados anteriores como atuais
- Se o cliente confirmar, use os dados. Se disser que mudou, inicie a qualificacao do zero.`,
    activation_criteria: 'Lead ja conversou anteriormente (flag isReturningLead ativa).',
    sort_order: 6,
  },

  'pontos-de-interesse': {
    name: 'Pontos de Interesse Proximos',
    slug: 'pontos-de-interesse',
    description: 'Busca de infraestrutura proxima: mercado, escola, hospital, parque, etc.',
    category: 'remarketing',
    prompt_instructions: `Ferramenta: buscar_pontos_de_interesse_proximos

Use proativamente para enriquecer a descrição de apresentação de imóveis OU quando o cliente perguntar sobre infraestrutura e localização.

Parametros:
- external_id: código do imóvel (ex: 'CA0012')
- type: supermarket, school, hospital, pharmacy, park, restaurant, gym

Retorna dados reais com distancias. Use para enriquecer a descrição por exemplo:
-"Esse imóvel está em uma localização privilegiada, a 300m do Angeloni, a 100 mentros da Escola Identidade..."

 responder perguntas como:
- "Tem mercado perto?"
- "E longe de escola?"
- "Tem academia na regiao?"`,
    activation_criteria: 'Enriquecimento de descrição do imovel assim que for enviar pro cliente as caracteristicas do imóvel ou quando o cliente pergunta sobre infraestrutura, localizacao ou servicos proximos a um imovel.',
    sort_order: 7,
  },
};

// Lista derivada — preserva ordem do sort_order original (DB).
// resolveActiveModule e callers que usavam ctx.activeModules.find(m => m.slug === ...)
// continuam funcionando sem mudança de shape.
export const REMARKETING_MODULE_LIST: RemarketingModuleDef[] = Object.values(REMARKETING_MODULES)
  .sort((a, b) => a.sort_order - b.sort_order);

export function getRemarketingModule(slug: RemarketingModuleSlug | string): RemarketingModuleDef | null {
  return (REMARKETING_MODULES as Record<string, RemarketingModuleDef>)[slug] ?? null;
}
