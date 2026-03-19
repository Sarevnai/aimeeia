# Analise de Leads Ativos - Aimee.iA

**Data:** 13/03/2026
**Tenant:** Smolka Imoveis
**Agente AI:** Helena Smolka (Claude Sonnet 4.6 via Anthropic)
**Total de Leads Ativos:** 6 (5 remarketing + 1 organico)

---

## Resumo Executivo

Este relatorio analisa individualmente cada lead ativo no sistema Aimee.iA, documentando todos os processos executados pela IA, ferramentas chamadas, cadencia de atendimento, respostas dos leads, e a funcao de codigo responsavel por cada mensagem enviada.

### Bugs Criticos Encontrados

| # | Bug | Severidade | Status |
|---|-----|-----------|--------|
| 1 | `lead_qualification` vazio para TODOS os leads | CRITICA | Nao corrigido |
| 2 | Nome "Como Esta?" extraido como nome real | ALTA | Parcialmente corrigido (extractName atualizado, mas lead pre-correcao) |
| 3 | buscar_imoveis falhou 2x para Lead #2 (instabilidade) | ALTA | Nao investigado |
| 4 | Emojis no remarketing VIP (Lead Endrie) | MEDIA | Corrigido no commit 0eb36fe (leads anteriores nao afetados) |
| 5 | Post-handoff sem controle (Lead Ian voltou e IA reativou) | ALTA | buildPostHandoffFollowup() implementado, mas nao esta funcionando |
| 6 | Imoveis repetidos sem rastreamento (shown_property_ids vazio) | MEDIA | Nao corrigido |
| 7 | IA diz "nao tenho links" mas imoveis TEM foto_destaque | MEDIA | Nao corrigido |

### Metricas Gerais

| Metrica | Valor |
|---------|-------|
| Leads com handoff realizado | 1 (Ian Veras) |
| Leads com busca de imoveis executada | 4 (Ian, Endrie, Graciele, Teste Bot) |
| Leads em anamnese (aguardando dados) | 1 (Eduardo) |
| Leads com falha na busca | 1 ("Como Esta?") |
| Tempo medio ate primeira busca | ~3-5 min apos inicio da anamnese |
| Mensagens medias por conversa | 15.5 |

---

## Lead 1: Ian Veras

### Dados do Lead

| Campo | Valor |
|-------|-------|
| Telefone | 554888182882 |
| Source | remarketing |
| Departamento | vendas |
| Campaign ID | 7c2e0a07 |
| Status | active |
| Total de mensagens | 28 |
| Primeira mensagem | 13/03 18:26 |
| Ultima mensagem | 13/03 19:20 |
| Handoff realizado | Sim (19:07) |

### Timeline Completa de Mensagens

| # | Hora | Direcao | Tipo | Mensagem | Funcao Geradora |
|---|------|---------|------|----------|-----------------|
| 1 | 18:26 | IN | customer | "Pode me explicar" | - |
| 2 | 18:26 | IN | customer | "Ola, voce esta ai?" | - |
| 3 | 18:27 | IN | customer | "Gostaria de saber do que se trata" | - |
| 4 | 18:32 | IN | customer | "Gostaria de saber mais" | - |
| 5 | 18:32 | OUT | ai | Pitch Consultora VIP (identidade + exclusividade) | `remarketing.ts -> buildSystemPrompt()` usando `buildRemarketingAnamnese()` Phase 1 - VIP intro |
| 6 | 18:32 | OUT | ai | Vantagens (custo zero, maior pauta, centraliza) | `remarketing.ts -> buildSystemPrompt()` continuacao do pitch VIP |
| 7 | 18:32 | IN | customer | "Quero sim" | - |
| 8 | 18:32 | OUT | ai | Buy-in confirmado + pedido de honestidade | `remarketing.ts` -> anamnese Phase 2 (buy-in aceito, pede sinceridade) |
| 9 | 18:32 | OUT | ai | "Vou fazer perguntas rapidas pra entender..." | `remarketing.ts` -> transicao para anamnese ativa |
| 10 | 18:33 | IN | customer | "Pode ser" | - |
| 11 | 18:33 | OUT | ai | "Voce esta buscando comprar ou alugar?" | `buildRemarketingAnamnese()` -> Fase 1: finalidade |
| 12 | 18:33 | IN | customer | "Comprar" | - |
| 13 | 18:33 | OUT | ai | "Tem alguma regiao ou bairro...?" | `buildRemarketingAnamnese()` -> Fase 2: localizacao |
| 14 | 18:33 | IN | customer | "Centro" | - |
| 15 | 18:33 | OUT | ai | "Que tipo de imovel... quantos dormitorios?" | `buildRemarketingAnamnese()` -> Fase 3: tipo/quartos |
| 16 | 18:34 | IN | customer | "Um apartamento, de 2 a 4 dormitorios" | - |
| 17 | 18:34 | OUT | ai | "Encontrei 5 apartamentos no Centro..." | `tool-executors.ts -> executePropertySearch()` chamou `buscar_imoveis` com query "apartamento 4 dormitorios no Centro" -> resultado da LLM formatando os imoveis |
| 18 | 18:35 | IN | customer | "Quero ver o proximo" | - |
| 19 | 18:35 | OUT | ai | Lista com precos dos 5 imoveis | LLM reformatou os mesmos `pending_properties` do state |
| 20 | 18:35 | IN | customer | "Tenho 1.500.000 pra pagamento a vista" | - |
| 21 | 18:36 | OUT | ai | Opcoes filtradas por orcamento + sugestao de handoff | `tool-executors.ts -> executePropertySearch()` nova busca com `preco_max: 1500000` -> LLM formata + sugere corretor |
| 22 | 19:05 | IN | customer | "?" | - |
| 23 | 19:06 | OUT | ai | Repete mesma lista + pergunta sobre consultor | LLM re-apresenta `pending_properties` sem nova busca |
| 24 | 19:06 | IN | customer | "Pode sim" | - |
| 25 | 19:07 | OUT | system | "Lead transferido para atendimento humano via CRM" | `tool-executors.ts -> executeLeadHandoff()` -> `c2s-create-lead` Edge Function |
| 26 | 19:07 | OUT | ai | "Ian, ja passei suas informacoes para um consultor..." | LLM pos-handoff confirmation |
| 27 | 19:20 | IN | customer | "Agora voce consegue me mandar imoveis" | - |
| 28 | 19:20 | OUT | ai | Nova lista com 5 imoveis incluindo Garden | `tool-executors.ts -> executePropertySearch()` nova busca ativada pos-handoff |

### Ferramentas Chamadas

| Ferramenta | Momento | Parametros | Resultado |
|-----------|---------|------------|-----------|
| `buscar_imoveis` | 18:34 | query: "apartamento 4 dormitorios Centro", finalidade: venda | 5 imoveis encontrados |
| `buscar_imoveis` | 18:36 | query: "apartamento 4 dormitorios Centro", preco_max: 1500000 | 4 imoveis filtrados |
| `enviar_lead_c2s` | 19:07 | Dossie: compra, apto, Centro, 4 dorms, R$1.5M a vista | Sucesso - lead transferido |
| `buscar_imoveis` | 19:20 | query: "apartamento 4 dormitorios Centro", preco_max: 1500000 | 5 imoveis (inclui Garden) |

### Cadencia de Atendimento

- **18:26-18:32 (6 min)**: Lead enviou 4 mensagens sem resposta. Gap de 6 minutos ate a IA responder. **GARGALO**: A IA demorou para processar as primeiras mensagens.
- **18:32-18:34 (2 min)**: Cadencia excelente - respostas em 5-6 segundos
- **18:34-18:36 (2 min)**: Busca de imoveis em ~26 segundos (bom)
- **19:05-19:07 (2 min)**: Lead voltou apos 29 min de silencio. IA respondeu em ~19 segundos
- **19:20**: Lead retorna pos-handoff, IA responde em ~24 segundos

### Analise Detalhada

**Pontos Positivos:**
- Anamnese eficiente: coletou finalidade, regiao, tipo, quartos, orcamento em 4 perguntas
- Handoff executado corretamente com dossie completo (nome, interesse, tipo, regiao, orcamento, prazo)
- Tone VIP consistente (sem emojis apos correcao)
- Busca semantica funcionou bem para Centro + 4 dormitorios

**Gargalos Identificados:**

1. **Gap inicial de 6 minutos** - O lead enviou 4 mensagens entre 18:26-18:32 sem resposta. Provavelmente causado pelo lock de processamento (MC-4) ou delay na invocacao do Edge Function.

2. **Imoveis repetidos 3 vezes** - Msgs #17, #19 e #23 mostram essencialmente os mesmos imoveis com formatacao diferente. O `shown_property_ids` esta null no conversation_state, indicando que o sistema NAO rastreia imoveis ja mostrados.

3. **Post-handoff sem controle** - Apos handoff as 19:07, o lead voltou as 19:20 e a IA fez nova busca normalmente. O `buildPostHandoffFollowup()` foi implementado para orientar a IA a informar que "o consultor ja esta cuidando", mas a IA ignorou e fez nova busca. Causa provavel: `is_ai_active` foi resetado para `true` no conversation_state apos o lead enviar nova mensagem.

4. **Mensagens fragmentadas** - Msgs #5/#6 e #8/#9 foram fragmentadas (2 msgs do agente em sequencia). Isso pode confundir o lead no WhatsApp.

### Nota de Qualidade: 7/10
- Atendimento eficaz com handoff bem executado
- Perde pontos pela repeticao de imoveis e falta de controle pos-handoff

---

## Lead 2: "Como Esta?" (Organico)

### Dados do Lead

| Campo | Valor |
|-------|-------|
| Telefone | 554896426215 |
| Source | organic |
| Departamento | locacao |
| Nome no Contacts | "Como Esta?" |
| Status | active |
| Total de mensagens | 15 |
| Primeira mensagem | 13/03 14:44 |
| Ultima mensagem | 13/03 19:14 |
| Handoff | Nao (operador assumiu manualmente) |

### BUG CRITICO: Extracao de Nome

O lead enviou duas mensagens quase simultaneas:
- 14:44:55.443 - "Ola"
- 14:44:55.875 - "Como esta?"

A funcao `extractName()` em `triage.ts` processou "Como esta?" como o nome do lead. O greeting respondeu "Prazer em te conhecer, Como Esta?!" e todas as mensagens subsequentes usam esse "nome".

**Funcao responsavel:** `triage.ts -> handleTriage() -> extractName()`

**Status da correcao:** O commit `0eb36fe` (13/03) adicionou ~50 filtros ao `extractName()`, incluindo frases interrogativas. Porem, este lead foi processado em 13/03 14:44, ou seja, ANTES ou DEPOIS da correcao depende do horario do deploy. Se o Edge Function ja estava atualizado, "como esta" deveria estar na lista de rejeicao.

**Verificacao necessaria:** Checar se "como esta" ou "como esta?" esta na lista de `REJECT_PATTERNS` do `extractName()` atualizado.

### Timeline Completa

| # | Hora | Direcao | Tipo | Mensagem | Funcao Geradora |
|---|------|---------|------|----------|-----------------|
| 1 | 14:44 | IN | customer | "Ola" | - |
| 2 | 14:44 | IN | customer | "Como esta?" | - |
| 3 | 14:44 | OUT | ai | Greeting: "Ola! Eu sou a Helena Smolka..." | `triage.ts -> handleTriage() stage=greeting` usando `triage_config.greeting_message` com emojis |
| 4 | 14:44 | OUT | ai | "Prazer em te conhecer, Como Esta?!" | `triage.ts -> handleTriage() stage=awaiting_name` -> `extractName("Como esta?")` retornou "Como Esta?" -> `triage_config.name_confirmation_template` |
| 5 | 14:45 | OUT | ai | VIP intro com "Como Esta?" como nome | `triage_config.vip_intro` com {{NAME}} substituido por "Como Esta?" |
| 6 | 14:45 | IN | customer | "Topp, um apartamento para uma pessoa no campeche" | - |
| 7 | 14:45 | IN | customer | "Alugar" | - |
| 8 | 14:45 | OUT | ai | "Perfeito! Vou te ajudar a encontrar..." | `triage.ts -> department_welcome["locacao"]` |
| 9 | 14:46 | IN | customer | "Um apartamento para uma pessoa na regiao do campeche" | - |
| 10 | 14:46 | OUT | ai | "Que otima escolha... tive instabilidade na busca..." | `comercial.ts -> buildSystemPrompt()` -> LLM tentou `buscar_imoveis` mas FALHOU |
| 11 | 14:48 | IN | customer | "Por volta de uns 2500" | - |
| 12 | 14:49 | OUT | ai | "Estou tendo instabilidade no sistema..." | `comercial.ts` -> LLM tentou `buscar_imoveis` novamente e FALHOU de novo |
| 13 | 19:14 | OUT | system | "Operador teste 1 assumiu a conversa" | Manual - operador assumiu via UI |
| 14 | 19:14 | OUT | operator | "ai e complicado, 2500 no campeche e loucura" | Mensagem manual do operador |
| 15 | 19:14 | OUT | system | "Operador devolveu a conversa para a IA" | Manual - operador devolveu |

### Ferramentas Chamadas

| Ferramenta | Momento | Parametros | Resultado |
|-----------|---------|------------|-----------|
| `buscar_imoveis` | 14:46 | query: "apartamento campeche alugar" | **FALHOU** - instabilidade |
| `buscar_imoveis` | 14:49 | query: "apartamento campeche alugar R$2500" | **FALHOU** - instabilidade |

### Analise Detalhada

**Gargalos Criticos:**

1. **BUG DE NOME** - Lead ficou com nome "Como Esta?" em todo o sistema. Impacto: todas as mensagens usam esse nome, destruindo a experiencia VIP.

2. **FALHA DUPLA NA BUSCA** - `buscar_imoveis` falhou 2 vezes consecutivas. A IA respondeu com "instabilidade no sistema" ambas as vezes. Causas possiveis:
   - Erro na geracao de embedding (OpenAI text-embedding-3-small)
   - Sem imoveis para locacao no Campeche na faixa de R$2.500
   - Erro de rede/timeout no `match_properties` RPC
   - O `pending_properties` esta vazio no state, confirmando que nenhum imovel foi encontrado

3. **LEAD ABANDONADO** - Apos a 2a falha as 14:49, nenhuma mensagem da IA ate o operador assumir as 19:14 (4h25 depois). O lead ficou sem atendimento por quase 5 horas.

4. **Emojis no fluxo organico** - Mensagens #3 e #5 usam emojis (wave, sparkles, house). Isso e aceitavel para fluxo organico nao-remarketing, pois a config `emoji_intensity: "none"` aparentemente nao esta sendo respeitada pelo agente comercial.

5. **Operador devolveu para IA sem resolver** - O operador assumiu, mandou UMA mensagem e devolveu. O lead permanece sem atendimento real.

### Nota de Qualidade: 2/10
- Falha completa: nome errado + busca falhou + lead abandonado

---

## Lead 3: Endrie

### Dados do Lead

| Campo | Valor |
|-------|-------|
| Telefone | 554884999001 |
| Source | remarketing |
| Departamento | vendas |
| Campaign ID | 3c7b34e0 |
| Status | active |
| Total de mensagens | 23 |
| Primeira mensagem | 11/03 20:47 |
| Ultima mensagem | 13/03 18:52 |

### Timeline Completa

| # | Hora | Direcao | Tipo | Mensagem | Funcao Geradora |
|---|------|---------|------|----------|-----------------|
| 1 | 11/03 20:47 | IN | customer | "Sim" (resposta ao remarketing) | - |
| 2 | 11/03 20:47 | OUT | ai | Pitch Consultora VIP | `remarketing.ts -> buildSystemPrompt()` VIP pitch |
| 3 | 11/03 20:47 | OUT | ai | Vantagens com emojis (checkmarks, maos levantadas) | `remarketing.ts` continuacao - **BUG: emojis no VIP** |
| 4 | 11/03 20:48 | IN | customer | "Gostei" | - |
| 5 | 11/03 20:48 | IN | customer | "Fale mais" | - |
| 6 | 11/03 20:48 | OUT | ai | Buy-in + pedido de honestidade (com emoji festa) | `remarketing.ts` anamnese buy-in - **BUG: emoji** |
| 7 | 11/03 20:48 | OUT | ai | "Vou fazer perguntas rapidas..." (com emoji musculo) | `remarketing.ts` transicao - **BUG: emoji** |
| 8 | 11/03 20:49 | IN | customer | "Ok" | - |
| 9 | 11/03 20:49 | OUT | ai | "Comprar ou alugar?" (com emoji sorriso) | `buildRemarketingAnamnese()` Fase 1 - **BUG: emoji** |
| 10 | 11/03 20:49 | IN | customer | "Comprar" | - |
| 11 | 11/03 20:49 | OUT | ai | "Qual regiao?" (com emoji casa) | `buildRemarketingAnamnese()` Fase 2 - **BUG: emoji** |
| 12 | 11/03 20:50 | IN | customer | "Coqueiros" | - |
| 13 | 11/03 20:50 | OUT | ai | "Tenho todas as informacoes. Vou buscar!" (emoji lupa) | `remarketing.ts` -> deveria ter chamado `buscar_imoveis` |
| --- | PAUSA DE 2 DIAS | --- | --- | --- | --- |
| 14 | 13/03 18:44 | IN | customer | "Sim" | Lead retorna apos 2 dias |
| 15 | 13/03 18:45 | OUT | ai | "Que tipo de imovel? Quantos dormitorios?" | `comercial.ts` (agora sem emojis - apos correcao) |
| 16 | 13/03 18:45 | IN | customer | "Casa" | - |
| 17 | 13/03 18:45 | OUT | ai | "Quantos dormitorios?" | `comercial.ts` follow-up |
| 18 | 13/03 18:46 | IN | customer | "4" | - |
| 19 | 13/03 18:47 | OUT | ai | "Encontrei opcoes em Coqueiros..." | `tool-executors.ts -> executePropertySearch()` sucesso |
| 20 | 13/03 18:51 | IN | customer | "Tem opcoes em bairros proximos?" | - |
| 21 | 13/03 18:52 | OUT | ai | "Em Abraao... encontrei opcoes" | `tool-executors.ts -> executePropertySearch()` nova busca Abraao |
| 22 | 13/03 18:52 | IN | customer | "Tem o link desse imovel pra ver fotos e video?" | - |
| 23 | 13/03 18:52 | OUT | ai | "Infelizmente nao tenho links diretos..." | LLM resposta - **BUG: imoveis TEM foto_destaque** |

### Ferramentas Chamadas

| Ferramenta | Momento | Parametros | Resultado |
|-----------|---------|------------|-----------|
| `buscar_imoveis` | 11/03 20:50 | "casa Coqueiros comprar" | Prometeu buscar mas NAO tem resultado no state antigo |
| `buscar_imoveis` | 13/03 18:47 | "casa 4 dormitorios Coqueiros" | 3 casas encontradas |
| `buscar_imoveis` | 13/03 18:52 | "casa 4 dormitorios Abraao" | 5 casas encontradas |

### Analise Detalhada

**Gargalos:**

1. **EMOJIS NO REMARKETING VIP (11/03)** - O atendimento iniciou em 11/03, ANTES da correcao anti-emoji de 13/03. Todas as msgs de 11/03 contem emojis (checkmarks, festa, musculo, sorriso, casa, lupa), violando a diretriz "ZERO emojis" do VIP.

2. **PROMESSA SEM ENTREGA (msg #13)** - A IA disse "Tenho todas as informacoes. Vou buscar!" mas NAO chamou `buscar_imoveis`. Isso esta exatamente no bug que a correcao de 13/03 tenta resolver: "Se voce escreve 'vou buscar', DEVE chamar a ferramenta no mesmo turno."

3. **PAUSA DE 2 DIAS SEM FOLLOW-UP** - O lead sumiu entre 11/03 e 13/03 (46 horas). Nenhum mecanismo de re-engajamento automatico foi acionado. A `ai_behavior_config` deveria ter regras de `reengagement_hours`, mas nao parece estar configurada.

4. **LINKS/FOTOS NAO COMPARTILHADOS** - O lead pediu links e fotos (msg #22) e a IA disse "nao tenho links diretos". FALSO: os imoveis no `pending_properties` possuem `foto_destaque` com URLs validas do CDN Vista. O agente deveria compartilhar.

5. **ANAMNESE INCOMPLETA NA RETOMADA** - Quando o lead voltou em 13/03, a IA esqueceu que ja sabia: finalidade (comprar), regiao (Coqueiros). Pediu tipo e quartos novamente (correto), mas poderia ter sido mais eficiente referenciando o que ja sabia.

### Nota de Qualidade: 5/10
- Busca funcionou bem na retomada, mas emojis, promessa sem entrega e falta de links prejudicam

---

## Lead 4: Graciele

### Dados do Lead

| Campo | Valor |
|-------|-------|
| Telefone | 554888520872 |
| Source | remarketing |
| Departamento | vendas |
| Campaign ID | 7c2e0a07 |
| Status | active |
| Total de mensagens | 12 |
| Primeira mensagem | 13/03 18:47 |
| Ultima mensagem | 13/03 18:51 |

### Timeline Completa

| # | Hora | Direcao | Tipo | Mensagem | Funcao Geradora |
|---|------|---------|------|----------|-----------------|
| 1 | 18:47 | IN | customer | "Boa tarde. Sim, estive, agora parei a busca, por enquanto, mas como funciona?" | - |
| 2 | 18:47 | OUT | ai | Pitch Consultora VIP | `remarketing.ts -> buildSystemPrompt()` VIP pitch (sem emojis - pos-correcao) |
| 3 | 18:47 | OUT | ai | Vantagens (sem emojis) | `remarketing.ts` continuacao |
| 4 | 18:48 | IN | customer | "Interessante, e o que voce teria na planta hoje para o continente? Ou quem sabe no bairro Joao Paulo?" | - |
| 5 | 18:48 | OUT | ai | Buy-in + pedido de honestidade | `remarketing.ts` anamnese buy-in |
| 6 | 18:48 | OUT | ai | "Vou fazer perguntas rapidas..." | `remarketing.ts` transicao |
| 7 | 18:48 | IN | customer | "Ok" | - |
| 8 | 18:48 | OUT | ai | "Que tipo de imovel e quantos dormitorios?" | `buildRemarketingAnamnese()` Fase 3 (pulou finalidade e localizacao pois ja informou) |
| 9 | 18:50 | IN | customer | "Nao tenho algo bem especifico, na planta para investimento, 2 quartos acima..." | - |
| 10 | 18:50 | OUT | ai | "Faz todo sentido. Imovel na planta para investimento... Qual faixa de investimento?" | `remarketing.ts` -> LLM resume + pede orcamento (Fase 4) |
| 11 | 18:51 | IN | customer | "Acima de 800 mil ate 1500 milhoes" | - |
| 12 | 18:51 | OUT | ai | "Encontrei 5 opcoes em Joao Paulo, R$950k a R$1.2M..." + sugere handoff | `tool-executors.ts -> executePropertySearch()` com preco_max: 1500000, query: "apartamento na planta investimento 2 quartos Continente Joao Paulo" |

### Ferramentas Chamadas

| Ferramenta | Momento | Parametros | Resultado |
|-----------|---------|------------|-----------|
| `buscar_imoveis` | 18:51 | query semantica: "apartamento na planta para investimento 2 quartos ou mais no Continente ou Joao Paulo", preco_max: 1500000 | 5 imoveis em Joao Paulo encontrados |

### Analise Detalhada

**Pontos Positivos:**
- **Sem emojis** - Correcao de 13/03 funcionou perfeitamente. Tom VIP sober mantido.
- **Anamnese inteligente** - A IA percebeu que a lead ja informou regiao (Continente/Joao Paulo) e finalidade (compra) na msg #4, e pulou essas fases.
- **Busca eficiente** - Uma unica busca semantica bem construida retornou 5 imoveis relevantes.
- **Cadencia rapida** - Respostas em 4-6 segundos consistentemente.

**Gargalos:**

1. **IGNOROU PERGUNTA DIRETA (msg #4)** - A lead perguntou "o que voce teria na planta hoje para o continente ou Joao Paulo?" e a IA NAO buscou imoveis. Em vez disso, seguiu o script de buy-in/honestidade. A regra do remarketing diz "apos 3+ dados, CHAME buscar_imoveis IMEDIATAMENTE", mas a IA ja tinha 3 dados na msg #4 (finalidade=compra, tipo=planta, regiao=Continente/JP) e nao chamou.

2. **Mensagens fragmentadas** - Msgs #2/#3 e #5/#6 foram fragmentadas em pares. No WhatsApp isso gera 2 notificacoes por resposta.

3. **Sugestao de handoff prematura** - Na msg #12, apos mostrar apenas 1 lote de imoveis, a IA ja sugere "vou te conectar com consultores especializados". O structured_config permite ate 3 rodadas de curadoria antes do handoff.

4. **Lead disse "parei a busca por enquanto"** - Sinal de lead frio/morno. A IA nao reconheceu isso e seguiu o script padrao. Uma abordagem mais sensivel seria reconhecer o timing e manter a porta aberta sem pressionar.

### Nota de Qualidade: 7.5/10
- Bom atendimento pos-correcao, mas perdeu oportunidade de buscar mais cedo

---

## Lead 5: Eduardo

### Dados do Lead

| Campo | Valor |
|-------|-------|
| Telefone | 554898068832 |
| Source | remarketing |
| Departamento | vendas |
| Campaign ID | 7c2e0a07 |
| Status | active |
| Total de mensagens | 8 |
| Primeira mensagem | 13/03 18:43 |
| Ultima mensagem | 13/03 18:44 |
| Estagio atual | Anamnese (aguardando "comprar ou alugar") |

### Timeline Completa

| # | Hora | Direcao | Tipo | Mensagem | Funcao Geradora |
|---|------|---------|------|----------|-----------------|
| 1 | 18:43 | IN | customer | "Funcionando" | - |
| 2 | 18:43 | OUT | ai | Pitch Consultora VIP | `remarketing.ts -> buildSystemPrompt()` VIP pitch (sem emojis) |
| 3 | 18:43 | OUT | ai | Vantagens (sem emojis) | `remarketing.ts` continuacao |
| 4 | 18:44 | IN | customer | "3 e muito. Quero exclusividade. (emojis rindo)" | - |
| 5 | 18:44 | OUT | ai | Buy-in + pedido de honestidade | `remarketing.ts` anamnese buy-in |
| 6 | 18:44 | OUT | ai | "Vou fazer perguntas rapidas..." | `remarketing.ts` transicao |
| 7 | 18:44 | IN | customer | "Ok" | - |
| 8 | 18:44 | OUT | ai | "Voce esta buscando comprar ou alugar?" | `buildRemarketingAnamnese()` Fase 1 |

### Analise Detalhada

**Pontos Positivos:**
- Sem emojis - tom VIP correto
- Cadencia rapida (respostas em 3-5 segundos)
- Lead engajado e com humor (respondeu com emojis de riso)

**Gargalos:**

1. **CADENCIA DE MENSAGENS PRE-ANAMNESE** - O lead recebeu 6 mensagens da IA (msgs #2, #3, #5, #6, e "perguntas rapidas" + primeira pergunta) antes de receber a PRIMEIRA pergunta util ("comprar ou alugar?"). Isso e o padrao mais claro do gargalo de "pitch longo demais".

2. **Lead nao respondeu** - Apos a pergunta #8, nenhuma resposta ate agora (quase 24h depois). Pode ter perdido interesse durante o pitch extenso.

3. **Humor nao reconhecido** - O lead brincou "3 e muito, quero exclusividade" (ironizando o "2 a 3 clientes por vez"). A IA ignorou a piada e seguiu o script. Uma resposta mais humana teria engajado melhor.

### Nota de Qualidade: 6/10
- Fluxo correto mas mecanico, nao adaptou ao humor do lead

---

## Lead 6: Teste Bot

### Dados do Lead

| Campo | Valor |
|-------|-------|
| Telefone | 5548999999999 |
| Source | remarketing |
| Departamento | vendas |
| Nome | Teste Bot |
| Status | active |
| Total de mensagens | 7 |
| Primeira mensagem | 13/03 17:06 |
| Ultima mensagem | 13/03 17:24 |

### Timeline Completa

| # | Hora | Direcao | Tipo | Mensagem | Funcao Geradora |
|---|------|---------|------|----------|-----------------|
| 1 | 17:10 | OUT | ai | "Comprar ou alugar?" | `buildRemarketingAnamnese()` Fase 1 (triage ja feito) |
| 2 | 17:11 | IN | customer | "Comprar" | - |
| 3 | 17:12 | OUT | ai | "Qual regiao?" | `buildRemarketingAnamnese()` Fase 2 |
| 4 | 17:13 | IN | customer | "Campeche" | - |
| 5 | 17:14 | OUT | ai | "Que tipo de imovel?" | `buildRemarketingAnamnese()` Fase 3 |
| 6 | 17:15 | OUT | ai | "Quantos dormitorios?" | `buildRemarketingAnamnese()` Fase 3 complementar |
| 7 | 17:24 | OUT | ai | "Encontrei opcoes no Campeche com 2 quartos, R$440k a R$3.5M..." | `tool-executors.ts -> executePropertySearch()` sucesso |

### Analise

Este e um teste interno. O fluxo funcionou corretamente:
- Anamnese direta sem pitch VIP extenso (possivelmente triage ja havia sido feito antes)
- Busca de imoveis executada com sucesso
- 5 imoveis no Campeche encontrados e armazenados em `pending_properties`
- Lead nao respondeu apos a apresentacao

**Anomalias:**
- Msgs #5 e #6 foram fragmentadas (tipo + dormitorios em msgs separadas)
- Gap de 9 minutos entre msg #5/#6 e msg #7 (17:15 -> 17:24) para a busca. Pode indicar lentidao na geracao de embedding ou na busca vetorial.
- Os timestamps das msgs iniciais (17:10-17:15) tem exatamente 1 minuto de intervalo, sugerindo dados simulados.

### Nota de Qualidade: N/A (teste)

---

## Analise Cruzada

### Gargalos Sistemicos

#### 1. lead_qualification vazio (BUG CRITICO)

A tabela `lead_qualification` tem **0 registros** para TODOS os 6 leads ativos. Isso significa que, apesar da IA coletar dados como bairro, tipo de imovel, quartos e orcamento durante a anamnese, esses dados NAO estao sendo persistidos na tabela de qualificacao.

**Impacto:**
- O `qualification_score` nunca e calculado
- O guardrail MC-1 (handoff automatico quando score >= 65) nunca e acionado automaticamente
- Nao ha dados para dashboards de qualificacao
- Os dados coletados so existem no historico de mensagens (texto livre)

**Causa provavel:** A funcao que deveria popular `lead_qualification` (possivelmente em `tool-executors.ts` ou `ai-agent/index.ts`) nao esta sendo chamada, ou a logica de extracao de dados da conversa para a tabela nao esta implementada.

#### 2. Pitch VIP Excessivamente Longo

Todos os leads remarketing recebem a mesma sequencia de 4-6 mensagens antes da primeira pergunta util:
1. Pitch identidade consultora
2. Vantagens (custo zero, maior pauta, centraliza)
3. Buy-in + pedido de honestidade
4. "Vou fazer perguntas rapidas"
5. Primeira pergunta real

**Tempo gasto:** ~2-3 minutos de leitura para o lead antes de ser util
**Sugestao:** Condensar em 1-2 mensagens e comecar a coletar dados mais cedo

#### 3. Fragmentacao de Mensagens

Em TODAS as conversas, a IA fragmenta respostas em 2 mensagens consecutivas. No WhatsApp, isso gera multiplas notificacoes e pode parecer spam. A funcao de fragmentacao em `sendAndSave()` esta configurada para dividir mensagens longas, mas o LLM esta gerando blocos separados.

#### 4. buscar_imoveis sem Tratamento de Erro Amigavel

Quando `buscar_imoveis` falha (Lead #2), a IA inventa uma desculpa ("instabilidade no sistema") em vez de ter um fallback estruturado. Nao ha mecanismo de retry automatico.

#### 5. shown_property_ids Nao Funciona

O campo `shown_property_ids` esta null ou vazio em TODOS os conversation_states, mesmo para leads que receberam multiplas rodadas de imoveis. Isso permite que os mesmos imoveis sejam mostrados repetidamente (caso Ian).

### Impacto das Correcoes Recentes

#### Correcao 1: Personalizacao de nome no remarketing (commit 42dd7e0, 10/03)
- **Status:** FUNCIONANDO - Leads de 13/03 (Ian, Graciele, Eduardo) receberam nome correto
- **Excecao:** Lead "Como Esta?" teve nome errado, mas por bug de extractName(), nao de personalizacao

#### Correcao 2: Anti-emoji no remarketing (commit 0eb36fe, 13/03)
- **Status:** FUNCIONANDO PARCIALMENTE
- Leads POS-correcao (Ian, Graciele, Eduardo): sem emojis, tom VIP correto
- Lead PRE-correcao (Endrie, 11/03): cheio de emojis, e o mesmo lead ao retornar em 13/03 nao recebeu mais emojis
- **Conclusao:** A correcao funciona para novas mensagens, mas nao retroage

#### Correcao 3: buildPostHandoffFollowup() (commit 0eb36fe, 13/03)
- **Status:** NAO FUNCIONANDO
- Lead Ian fez handoff as 19:07, voltou as 19:20, e a IA fez nova busca normalmente
- O prompt de follow-up nao esta sendo injetado ou nao esta efetivo o suficiente para impedir nova busca

#### Correcao 4: extractName() com 50+ filtros (commit 0eb36fe, 13/03)
- **Status:** PARCIALMENTE FUNCIONANDO
- Novos leads com nomes reais: OK
- Lead "Como Esta?": falhou (pode ter sido processado antes do deploy, ou "como esta" nao esta na lista)

#### Correcao 5: Remocao de last_ai_message_at do anti-loop (commit 42dd7e0, 10/03)
- **Status:** FUNCIONANDO - Nenhum erro silencioso de upsert detectado nas conversas analisadas

### Erros Residuais de Correcoes Anteriores

Nao foram detectados erros novos CAUSADOS pelas correcoes recentes. As correcoes resolveram os problemas para novos atendimentos, sem introduzir regressoes. Os problemas restantes sao:

1. `lead_qualification` vazio - BUG PRE-EXISTENTE, nao relacionado a correcoes recentes
2. `shown_property_ids` vazio - BUG PRE-EXISTENTE
3. Falta de compartilhamento de links/fotos - BUG PRE-EXISTENTE no prompt/LLM

---

## Recomendacoes

### Prioridade CRITICA

1. **Implementar persistencia de lead_qualification** - Apos cada turno da IA, extrair dados coletados e gravar em `lead_qualification` (bairro, tipo, quartos, orcamento, score)

2. **Corrigir post-handoff** - O `buildPostHandoffFollowup()` precisa ser mais restritivo: se `is_ai_active = false` e houve evento `ai_paused`, nao permitir nova busca. O lead deve ser informado que o consultor ja esta cuidando.

3. **Investigar falha de buscar_imoveis (Lead #2)** - Adicionar logs detalhados de erro no `executePropertySearch()`. Implementar retry com backoff.

### Prioridade ALTA

4. **Adicionar "como esta" ao extractName() reject list** - Verificar e garantir que variantes de saudacoes interrogativas estao filtradas

5. **Implementar shown_property_ids** - Atualizar `executePropertySearch()` para gravar IDs mostrados e filtrar na proxima busca

6. **Compartilhar foto_destaque** - Modificar a formatacao de imoveis no prompt para incluir a URL da foto e, quando possivel, enviar como imagem via WhatsApp

### Prioridade MEDIA

7. **Condensar pitch VIP** - Reduzir de 4-6 mensagens para 1-2 antes da anamnese

8. **Evitar fragmentacao** - Instruir o LLM a nao quebrar respostas em multiplos blocos

9. **Re-engajamento automatico** - Implementar cron que detecte leads sem resposta apos X horas e envie follow-up

10. **Tratamento de erro amigavel** - Quando `buscar_imoveis` falha, oferecer alternativa (outra regiao, ampliar orcamento) em vez de "instabilidade"
