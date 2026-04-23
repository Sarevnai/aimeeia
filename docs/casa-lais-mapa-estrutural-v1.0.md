---
artefato: Mapa Estrutural casa.lais.ai
versao: 1.0
data_captura: 2026-04-22
capturado_por: Ian Veras (admin Smolka Imóveis — tenant, não superadmin)
url_base: https://casa.lais.ai
tenant_observado: Smolka Imóveis (agency=ca957a30-f67c-4454-82fd-7b639d9e3e70)
biblioteca_tecnica:
  - Dossiê Helena v?
  - Análise Comparativa Helena × Aimee v?
metodologia_observacional: Navegação autenticada via extensão Chrome MCP. Accessibility tree + walker de nós de texto como fontes primárias. Screenshots NÃO foram capturados nesta revisão (limitação do toolset usado) — todas as evidências referenciam a11y-tree snapshots timestampados. Plataforma é uma no-code Bubble.io (classes `bubble-element`, runtime `_hjSafeContext`/Intercom); isso afeta a observabilidade (ver §10).
---

# Mapa Estrutural casa.lais.ai — v1.0

## 0. Sumário
- Total de módulos: **12** (4 grupos pai × leafs + 1 raiz "Início")
- Total de rotas inventariadas: **12 rotas distintas** (1:1 com módulos, sem sub-rotas observadas)
- Total de features atômicas catalogadas: **34** (F-001 a F-034)
- Componentes recorrentes: **7** (C-001 a C-007)
- Integrações observadas: **9** (I-001 a I-009)
- Permissões inferidas: **3** (P-001 a P-003)
- Elementos fora do alcance: **6** (X-001 a X-006)
- **Limite observacional principal**: páginas renderizadas em Bubble.io frequentemente não expõem texto no accessibility tree — várias telas aparecem como "casca" (só sidebar). Marcado explicitamente por rota na §3.

## 1. Pré-scan (esqueleto de navegação)

Sidebar esquerda única (não há alternância tenant/admin-agência; o usuário é o próprio admin do tenant `Smolka Imóveis`). Hierarquia observada:

```
Sidebar
├── [header] Smolka Imóveis (nome do tenant)
├── Início                          → M-01 /
├── Atendimento comercial           (grupo expansível)
│   ├── Conversas                   → M-02 /chats
│   ├── Leads                       → M-03 /leads
│   ├── Visitas [NOVO]              → M-04 /visits
│   └── Relatório                   → M-05 /relatorio-v2
├── Gestão de prateleira de imóveis (grupo expansível)
│   ├── Empreendimentos             → M-06 /developments
│   ├── Atualização                 → M-07 /owners
│   └── Captação                    → M-08 /notifications?type=lead-property-acquisition
├── Configurações                   (grupo expansível)
│   ├── Minha Lais                  → M-09 /configs
│   ├── Financeiro                  → M-10 /finance
│   └── Acessos                     → M-11 /user_management
└── Ajuda                           (grupo expansível)
    ├── Guia da Lais                → M-12 /trainings_page
    └── Ajuda                       → abre Intercom Messenger (I-001)
```

Cabeçalho/Footer global:
- Avatar/nome do usuário logado ("Ian Veras") no topo da sidebar.
- Badge de identidade do tenant ("Smolka Imóveis") + contato do usuário-teste embutido no DOM ("Helena Smolka / +5548999409000").
- Botão flutuante Intercom (canto inferior direito).

URL-scheme observado:
- Query param obrigatório em todas as rotas: `agency=<UUID>`.
- Rotas com estado adicional via query: `/chats?chatId=...`, `/leads?u=<user>&createdAt=<range>&page=N`, `/notifications?type=<filtro>&page=N`, raiz `?month=MM&year=YYYY`.

## 2. Inventário de Módulos

### M-01 — Início
- **Rota base:** `/`
- **Escopo:** tenant (dashboard da agência).
- **Propósito inferido:** landing pós-login; concentra KPIs de consumo do plano, funil mensal e destaques/novidades editoriais da Lastro.
- **Evidência:** a11y-tree densa (~125 refs), contém todos os KPIs e séries temporais abaixo.
- **Rotas filhas:** nenhuma (módulo mono-rota).
- **Features expostas:** F-001, F-002, F-003, F-004, F-005, F-006, F-007, F-008, F-009, F-010, F-011.
- **Componentes recorrentes:** C-001 (KPI card), C-002 (carousel destaques), C-003 (tab-like filtro mês).
- **Integrações visíveis no módulo:** I-002 (Lais Visita — linha separada de "Solicitações"), canais I-003..I-009 aparecem como séries.
- **Estados observados:** populado (mês corrente abril/2026 com dados reais mascarados).
- **Permissões aparentes:** P-001 (admin tenant).

### M-02 — Conversas
- **Rota base:** `/chats`
- **Escopo:** tenant.
- **Propósito inferido:** inbox unificada de conversas Lais × leads. Ao entrar, auto-seleciona um `chatId` na query string.
- **Evidência:** URL confirma auto-select; a11y-tree da área de chat NÃO expõe conteúdo (renderização custom Bubble) — shape inferido por design paralelo ao Dossiê Helena §X (inbox com lista lateral + transcript + painel do cliente). **Marcada como observacional parcial.**
- **Rotas filhas:** nenhuma (estado via `chatId`).
- **Features expostas:** F-012, F-013 (inferidas da UX da Lais — ver Dossiê Helena).
- **Integrações visíveis:** I-003 a I-009 (canais aparecem aqui como origem das conversas).
- **Permissões aparentes:** P-001.

### M-03 — Leads
- **Rota base:** `/leads`
- **Escopo:** tenant.
- **Propósito inferido:** lista tabular de leads atendidos pela Lais, com filtros por usuário/período/página.
- **Evidência:** a11y-tree expõe cabeçalho e colunas da tabela; título auxiliar "Tenha a visão completa e organizada dos leads que entraram em contato com a Lais."
- **Rotas filhas:** nenhuma.
- **Features expostas:** F-014, F-015, F-016, F-017, F-018.
- **Componentes recorrentes:** C-004 (tabela com seleção), C-005 (paginação + itens por página).
- **Estados observados:** populado com 0 resultados no filtro ativo ("Exibindo 0 lead") + "Exibindo 1 de …" na paginação (inconsistência interna — série existe, filtro zera).

### M-04 — Visitas *(NOVO)*
- **Rota base:** `/visits`
- **Escopo:** tenant.
- **Propósito inferido:** gestão de visitas agendadas/realizadas. Marcado "NOVO" no menu — feature em rollout.
- **Evidência:** URL confirma rota; a11y-tree e text-walker retornam APENAS o chrome do app (sidebar + avatar + Intercom). Conteúdo da tela é renderizado por componente custom Bubble não acessível. **Shape do conteúdo fora do alcance observacional direto** (hipótese em §10).
- **Rotas filhas:** nenhuma observada.
- **Features expostas:** F-019 (inferida pelo rótulo).
- **Integrações visíveis:** I-002 (Lais Visita, aparece como série no dashboard Início).

### M-05 — Relatório
- **Rota base:** `/relatorio-v2`
- **Escopo:** tenant.
- **Propósito inferido:** relatórios sobre preferências dos leads para otimizar campanhas e captações. Sufixo `-v2` sinaliza refatoração sobre uma versão anterior.
- **Evidência:** a11y-tree mostra título, subtítulo ("Confira dados sobre as preferências dos seus leads…"), 3 tabs e filtro de mês.
- **Rotas filhas:** nenhuma formal; estado interno via tabs (§3).
- **Seções/tabs:** S-05.00.01 Aluguel · S-05.00.02 Imóveis · S-05.00.03 Bairros.
- **Features expostas:** F-020, F-021.
- **Componentes recorrentes:** C-003 (filtro mês/ano), C-006 (tabs).

### M-06 — Empreendimentos
- **Rota base:** `/developments`
- **Escopo:** tenant.
- **Propósito inferido:** catálogo próprio de empreendimentos (distinto do feed de imóveis dos portais) — a Lais usa pra "aquecer leads".
- **Evidência:** a11y-tree mostra empty state "Aumente as vendas adicionando empreendimentos / A Lais usa as informações cadastradas para aquecer seus leads." + CTAs.
- **Rotas filhas:** nenhuma observada (provável `/developments/:id` em fluxo de criação — fora do alcance).
- **Features expostas:** F-022, F-023.
- **Estados observados:** empty state (nenhum empreendimento cadastrado pelo tenant).

### M-07 — Atualização
- **Rota base:** `/owners`
- **Escopo:** tenant.
- **Propósito inferido:** fluxo de conversas automatizadas da Lais com proprietários para atualizar status/dados dos imóveis anunciados.
- **Evidência:** a11y-tree: título "Atualização de anúncios" + subtítulo "Conversas com proprietários para atualizar os imóveis anunciados."
- **Features expostas:** F-024.
- **Estados observados:** shape do conteúdo (lista/inbox de conversas com proprietários) não expôs no a11y tree — inferido pelo subtítulo.

### M-08 — Captação
- **Rota base:** `/notifications?type=lead-property-acquisition`
- **Escopo:** tenant.
- **Propósito inferido:** "Captação" é, estruturalmente, uma VIEW FILTRADA de `/notifications` (`type=lead-property-acquisition`) — a Lais detecta, em conversas com leads, menções a imóveis de terceiros que valem a pena captar, e notifica o corretor.
- **Evidência:** URL final após clique em "Captação" incluiu `type=lead-property-acquisition&page=1`. Conteúdo da tela não expôs em a11y tree. Hipótese de mecanismo sustentada por (a) path `/notifications`, (b) tipo de notificação, (c) posicionamento sob "Gestão de prateleira de imóveis".
- **Features expostas:** F-025.
- **Implicação arquitetural:** existe uma rota-mãe `/notifications` que pode hospedar outros `type=` não explorados (ver X-005).

### M-09 — Minha Lais
- **Rota base:** `/configs`
- **Escopo:** tenant.
- **Propósito inferido:** central de configurações do agente Lais (personalização de comportamento, horários, perguntas essenciais, integrações).
- **Evidência:** rota confirmada `/configs`. Conteúdo renderizado 100% fora do a11y tree — únicos text-nodes capturados são do chrome. Evidência cruzada: o dashboard (M-01) expõe cards "Personalizações de comportamento [NOVO] / Conferir todas" que linkam para este módulo (Pré-agendamento de visita, Perguntas essenciais, Reengajamento — F-009/F-010/F-011).
- **Seções inferidas (via §1 do dashboard, não visitadas diretamente):** S-09.00.01 Pré-agendamento de visita · S-09.00.02 Perguntas essenciais · S-09.00.03 Reengajamento. Outras seções prováveis fora do alcance (X-004).
- **Features expostas:** F-009, F-010, F-011, F-026 (inferidas).

### M-10 — Financeiro
- **Rota base:** `/finance`
- **Escopo:** tenant (autogestão de cobrança).
- **Propósito inferido:** gestão financeira do contrato Lais — boleto do ciclo, plano contratado, histórico.
- **Evidência:** a11y-tree: "Financeiro / Faça a gestão financeira da Lais" + "Boleto / Indisponível / Baixar boleto" + "Plano / Alterar plano" + "Atendimentos contratados" + "Boletos anteriores / Ainda não houveram outros pagamentos."
- **Features expostas:** F-027, F-028, F-029.
- **Estados observados:** conta sem boleto emitido no ciclo corrente; sem histórico.
- **Observação linguística:** "houveram" (erro de concordância na UI oficial) — registrar em §10.

### M-11 — Acessos
- **Rota base:** `/user_management`
- **Escopo:** tenant.
- **Propósito inferido:** gerenciar quem da imobiliária pode acessar a Casa da Lais; mecanismo primário é **código de acesso compartilhável**, não convite individual por email.
- **Evidência:** a11y-tree: "Acessos / Gerencie quem pode acessar e administrar sua Casa da Lais / Acesso por código / Comunique esse código com seus colaboradores para que eles possam acessar o Histórico do Cliente. / Código da Lais".
- **Features expostas:** F-030, F-031.
- **Permissão observada:** usuário autenticado é admin (pode ver/regerar o código) — P-001.

### M-12 — Guia da Lais
- **Rota base:** `/trainings_page`
- **Escopo:** tenant (onboarding/educação).
- **Propósito inferido:** trilha de conhecimento in-app com vídeos curtos. "Aprenda a usar a Lais para vender mais e operar com menos esforço."
- **Evidência:** a11y-tree: "Trilha de conhecimento / Boas vindas / O que torna a Lais diferente e mais avançada (4 min) / Onde a Lais atua e como funciona a integração (2 min) / Introdução à Casa da Lais / Faça mais com a Casa da Lais".
- **Features expostas:** F-032, F-033, F-034.
- **Integração visível:** provavelmente vídeo hospedado externamente (Vimeo/YouTube) — não confirmado por a11y (X-006).

## 3. Detalhamento de Rotas

### R-01.01 `/` — Início (dashboard)
- **Seções:**
  - S-01.01.01 **Header do tenant**: nome da agência + seletor de mês ("Abril, 2026").
  - S-01.01.02 **Consumo do plano** (dois medidores):
    - 279 / 500 — 55,80% — rótulo "Cobranças de atendimento" (mensal).
    - 6.705 / 6.000 — 112,00% — rótulo "Solicitações via Lais Visita" (anual, acima do plano).
  - S-01.01.03 **Destaques** (carousel 4 slides, botões "Previous/Next slide" + indicadores "Go to slide 1..4" + links internos por slide).
  - S-01.01.04 **"Tire suas dúvidas ao vivo com nosso time." / Acessar a sala** — call-to-action para sessão síncrona com suporte.
  - S-01.01.05 **Personalizações de comportamento** [NOVO] — preview de 3 cards que deep-linkam para §M-09:
    - "Pré-agendamento de visita — Quando a Lais deve oferecer pré-agendamento de visita?" (F-009)
    - "Perguntas essenciais — O que a Lais deve perguntar para seus leads?" (F-010)
    - "Reengajamento — Como a Lais deve lidar com leads que pararam de responder?" (F-011)
    - Botão "Conferir todas".
  - S-01.01.06 **Dados gerais de atendimento — Funil de topo**:
    - Topo de funil: 368 leads "chegaram pelos canais" (100%).
    - Atendimentos: 279 "foram atendidos pela Lais" (75.82%).
    - Encaminhados: 159 "foram enviados ao CRM pela Lais" (43.21%).
  - S-01.01.07 **Leads por canal** — controle "Visão Geral" + série por canal: Grupo Zap · WhatsApp · Imovelweb · Chaves Na Mão · Site próprio · Facebook · Wimóveis.
  - S-01.01.08 **Status por canal** — quebra por Enviado ao CRM / Erro no envio ao CRM / Não pronto, repetindo os 7 canais.
  - S-01.01.09 **Leads por horário em abril** — distribuição horária (10h…23h) + KPI "41,03% leads foram atendidos fora do horário comercial".
  - S-01.01.10 **Leads semanais em abril** — distribuição por dia da semana (Dom…Sáb) + KPI "Melhor dia da semana em abril: Segunda-feira".
  - S-01.01.11 **Leads nos últimos 6 meses** — série mensal Nov→Abr + stacked "Enviado ao CRM" × "Não enviado ao CRM" (valores observados mascarados para evitar vazamento).
- **Controles de filtro globais:** mês/ano por query (`?month=04&year=2026`) e seletor "Visão Geral" em cada bloco de série.
- **Navegação de saída:** cards de personalização deep-linkam para M-09; "Conferir todas" idem.

### R-02.01 `/chats` — Conversas
- **Seções:** não observadas no a11y tree. Inferência mínima a partir do URL-scheme: `chatId=<UUID>` → um painel de conversa selecionada; presumivelmente existe lista lateral.
- **Controles/filtros:** não observados.
- **Estado observável:** selecionou chatId automaticamente ao entrar (`87e39718-…`).
- **Observação crítica:** conteúdo rico (transcript, sidebar do cliente, painel de imóveis, botões de handoff) inferidos a partir do Dossiê Helena §X — não repetir aqui; esta rota é a PORTA para aquelas observações.

### R-03.01 `/leads` — Leads
- **Seções:**
  - S-03.01.01 Cabeçalho: "Leads / Tenha a visão completa e organizada dos leads que entraram em contato com a Lais."
  - S-03.01.02 Barra de controle: "Filtros" · "Exibindo 0 lead" · checkbox de seleção em massa.
  - S-03.01.03 Tabela (C-004) com colunas: **Lead · Contato · Operação · Canal · CRM**.
  - S-03.01.04 Rodapé: "Itens por página" · paginação "Exibindo 1 de …" · ações em massa "Baixar selecionados" · "Enviar selecionados" · botão "Programar Remarketing" + link "Como funciona o Remarketing?".
- **Filtros via query:** `u=<userId>`, `createdAt=<YYYY-MM-DD,YYYY-MM-DD>`, `page=N`.
- **Navegação de saída:** presume-se drill-down em um lead → detalhe/histórico (não confirmado no a11y, X-003).

### R-04.01 `/visits` — Visitas (NOVO)
- **Seções:** não observáveis no a11y tree (ver §10 Bubble-render-limit).
- **Hipótese de shape** (derivada de M-01 onde aparece métrica "Solicitações via Lais Visita" e do conector I-002): calendário/lista de visitas solicitadas pela Lais; estados prováveis: solicitada · confirmada · realizada · cancelada.

### R-05.01 `/relatorio-v2` — Relatório
- **Seções:**
  - S-05.01.01 Cabeçalho "Relatórios / Confira dados sobre as preferências dos seus leads e otimize suas campanhas e captações."
  - S-05.01.02 Tabs (C-006): **Aluguel · Imóveis · Bairros**.
  - S-05.01.03 Filtro mês/ano (C-003): "Abril, 2026".
- **Dados exibidos:** shape inferido (não acessível via a11y) — provavelmente gráficos/top-N de bairros, tipologias e faixas de preço mais procurados.
- **Observação:** o sufixo `-v2` sugere que `/relatorio` (v1) pode ainda existir como rota deprecada (X-005).

### R-06.01 `/developments` — Empreendimentos
- **Seções:**
  - S-06.01.01 Cabeçalho "Empreendimentos / Adicione e gerencie empreendimentos."
  - S-06.01.02 Empty state: "Aumente as vendas adicionando empreendimentos / A Lais usa as informações cadastradas para aquecer seus leads." + CTAs "Adicionar empreendimento" e "Saiba mais".
- **Navegação de saída:** "Adicionar empreendimento" presume fluxo modal/rota `/developments/new` (não acionado — X-003).

### R-07.01 `/owners` — Atualização
- **Seções:**
  - S-07.01.01 Cabeçalho "Atualização de anúncios / Conversas com proprietários para atualizar os imóveis anunciados."
  - Conteúdo abaixo do cabeçalho não acessível.
- **Hipótese de shape:** inbox de conversas com proprietários (espelho de M-02 mas com proprietário em vez de lead).

### R-08.01 `/notifications?type=lead-property-acquisition` — Captação
- **Seções:** conteúdo não acessível em a11y; cabeçalho sequer aparece (diferente de M-06/M-07).
- **Filtros via query:** `type=lead-property-acquisition`, `page=N`.
- **Hipótese de shape:** lista de notificações geradas pela IA ao detectar, em conversas com leads, menções a imóveis de outras agências que valem a pena captar.

### R-09.01 `/configs` — Minha Lais
- **Seções inferidas a partir do dashboard (M-01) e não visitadas individualmente:**
  - S-09.01.01 Pré-agendamento de visita (F-009).
  - S-09.01.02 Perguntas essenciais (F-010).
  - S-09.01.03 Reengajamento (F-011).
  - Outras seções possíveis (horários, mensagens padrão, integrações, handoff, personalidade): X-004.

### R-10.01 `/finance` — Financeiro
- **Seções:**
  - S-10.01.01 Cabeçalho "Financeiro / Faça a gestão financeira da Lais."
  - S-10.01.02 Bloco Boleto: "Boleto / Indisponível" + botão "Baixar boleto" (desabilitado implícito — sem boleto vigente).
  - S-10.01.03 Bloco Plano: título "Plano" + botão "Alterar plano".
  - S-10.01.04 Bloco "Atendimentos contratados" (valor não observável — shape: medidor/quota anual + mensal, consistente com KPIs de M-01).
  - S-10.01.05 Bloco "Boletos anteriores" com empty state "Ainda não houveram outros pagamentos."

### R-11.01 `/user_management` — Acessos
- **Seções:**
  - S-11.01.01 Cabeçalho "Acessos / Gerencie quem pode acessar e administrar sua Casa da Lais".
  - S-11.01.02 Bloco "Acesso por código / Comunique esse código com seus colaboradores para que eles possam acessar o Histórico do Cliente." + campo "Código da Lais" + botão de ação (regenerar/copiar — label vazio na a11y).
- **Modelo de acesso:** a unidade de controle é **código do tenant**, não usuário com email/senha individual. Implicação forte em §7 e §9.

### R-12.01 `/trainings_page` — Guia da Lais
- **Seções:**
  - S-12.01.01 Cabeçalho "Guia da Lais / Aprenda a usar a Lais para vender mais e operar com menos esforço."
  - S-12.01.02 "Trilha de conhecimento / Boas vindas" com vídeo 1: "O que torna a Lais diferente e mais avançada" (4 min) e vídeo 2: "Onde a Lais atua e como funciona a integração" (2 min).
  - S-12.01.03 "Introdução à Casa da Lais" (título de agrupamento — lista de vídeos não capturada integralmente).
  - S-12.01.04 "Faça mais com a Casa da Lais" (título de agrupamento).

## 4. Catálogo de Features (F-###)

| ID | Feature | Módulo(s) | Rota(s) | Evidência | Confiança |
|---|---|---|---|---|---|
| F-001 | Medidor de cobranças mensais (consumo do plano) | M-01 | R-01.01 | a11y "279 / 500 / 55,80% / Consumo do plano" | Alta |
| F-002 | Medidor de solicitações Lais Visita (anual) | M-01 | R-01.01 | a11y "6.705 / 6.000 / 112,00% / Consumo do plano anual" | Alta |
| F-003 | Carousel de destaques editoriais | M-01 | R-01.01 | a11y slides 1–4 + Prev/Next | Alta |
| F-004 | Call-to-action "sala ao vivo" com o time Lastro | M-01 | R-01.01 | a11y "Tire suas dúvidas ao vivo / Acessar a sala" | Alta |
| F-005 | Funil mensal (Topo → Atendimentos → Encaminhados) | M-01 | R-01.01 | a11y 3 KPIs + % | Alta |
| F-006 | Série "Leads por canal" | M-01 | R-01.01 | a11y 7 canais listados | Alta |
| F-007 | Série "Status por canal" (Enviado/Erro/Não pronto) | M-01 | R-01.01 | a11y | Alta |
| F-008 | Distribuição horária de leads + métrica fora-de-horário | M-01 | R-01.01 | a11y "41,03% fora do horário comercial" | Alta |
| F-009 | Personalização "Pré-agendamento de visita" | M-01→M-09 | R-01.01, R-09.01 | a11y card NOVO | Alta (card); Média (conteúdo) |
| F-010 | Personalização "Perguntas essenciais" | M-01→M-09 | R-01.01, R-09.01 | idem | idem |
| F-011 | Personalização "Reengajamento" | M-01→M-09 | R-01.01, R-09.01 | idem | idem |
| F-012 | Inbox unificada de conversas com leads | M-02 | R-02.01 | URL `/chats?chatId=…` (ver Dossiê Helena) | Média (shape) |
| F-013 | Seleção persistente de conversa via `chatId` na URL | M-02 | R-02.01 | comportamento de auto-select | Alta |
| F-014 | Filtros de lead (período, usuário responsável) | M-03 | R-03.01 | query `u=…&createdAt=…` | Alta |
| F-015 | Seleção em massa + ações "Baixar" / "Enviar" | M-03 | R-03.01 | a11y botões | Alta |
| F-016 | Colunas de tabela: Lead/Contato/Operação/Canal/CRM | M-03 | R-03.01 | a11y cabeçalho | Alta |
| F-017 | Programar Remarketing | M-03 | R-03.01 | botão + link "Como funciona" | Alta |
| F-018 | Paginação + itens por página | M-03 | R-03.01 | a11y | Alta |
| F-019 | Módulo de Visitas (NOVO) | M-04 | R-04.01 | rótulo NOVO + URL `/visits` + métrica "Lais Visita" em M-01 | Média (existência Alta; shape Baixa) |
| F-020 | Relatórios por eixo (Aluguel/Imóveis/Bairros) | M-05 | R-05.01 | tabs a11y | Alta |
| F-021 | Filtro mês/ano no relatório | M-05 | R-05.01 | a11y "Abril, 2026" | Alta |
| F-022 | Cadastro de empreendimentos (CTA "Adicionar") | M-06 | R-06.01 | a11y botão | Alta |
| F-023 | "A Lais usa empreendimentos cadastrados para aquecer leads" | M-06 | R-06.01 | a11y subtítulo | Alta (existência); Média (mecanismo) |
| F-024 | Conversas IA com proprietários para atualização de anúncios | M-07 | R-07.01 | a11y subtítulo | Alta |
| F-025 | Notificações de captação (IA detecta imóvel de 3º em conversa) | M-08 | R-08.01 | URL `type=lead-property-acquisition` | Média (existência Alta; shape Baixa) |
| F-026 | Configurações de comportamento do agente (genérico) | M-09 | R-09.01 | URL `/configs` + cards de M-01 | Média |
| F-027 | Emissão/download de boleto do ciclo corrente | M-10 | R-10.01 | a11y "Boleto/Baixar boleto" | Alta |
| F-028 | Alterar plano contratado | M-10 | R-10.01 | a11y "Plano / Alterar plano" | Alta |
| F-029 | Histórico de boletos anteriores | M-10 | R-10.01 | a11y "Boletos anteriores" | Alta |
| F-030 | Acesso por código do tenant (não por convite individual) | M-11 | R-11.01 | a11y "Acesso por código" | Alta |
| F-031 | Visualização/atualização do "Código da Lais" | M-11 | R-11.01 | a11y campo + botão | Alta |
| F-032 | Trilha de conhecimento com vídeos curtos | M-12 | R-12.01 | a11y itens | Alta |
| F-033 | Vídeo "O que torna a Lais diferente e mais avançada" (4 min) | M-12 | R-12.01 | a11y | Alta |
| F-034 | Seções "Introdução" / "Faça mais" (agrupamento) | M-12 | R-12.01 | a11y títulos | Alta |

## 5. Catálogo de Componentes (C-###)

| ID | Componente | Onde aparece | Descrição |
|---|---|---|---|
| C-001 | KPI-card com valor absoluto + percentual + denominador | M-01 | Usado em "Consumo do plano", "Funil", métricas derivadas. |
| C-002 | Carousel de destaques com prev/next e indicadores | M-01 | 4 slides, conteúdo editorial da Lastro (não do tenant). |
| C-003 | Filtro mês/ano com rótulo longo ("Abril, 2026") | M-01, M-05 | Query param `?month&year`. |
| C-004 | Tabela com seleção em massa + ações em lote | M-03 | Checkbox "select-all" + botões "Baixar/Enviar selecionados". |
| C-005 | Controle de paginação "Itens por página" + "Exibindo N de M" | M-03, (M-08 presumido) | Query `page=N`. |
| C-006 | Tab-bar horizontal (sem URL própria por tab) | M-05 | Aluguel/Imóveis/Bairros — estado in-memory. |
| C-007 | Card clicável de "personalização" com título + pergunta | M-01 | Deep-link para seção de M-09. |

## 6. Catálogo de Integrações (I-###)

| ID | Sistema | Tipo | Evidência | Onde |
|---|---|---|---|---|
| I-001 | **Intercom Messenger** | Confirmada (3º) | a11y `button "Open Intercom Messenger"` + text node "Intercom" em todas as rotas | Global |
| I-002 | **Lais Visita** | Inferida interna (produto irmão/feature destacada) | KPI "Solicitações via Lais Visita (6.705/6.000)" em M-01 + módulo M-04 | M-01, M-04 |
| I-003 | **Grupo Zap** (portal) | Confirmada (canal de origem de leads) | Série em M-01 | M-01, M-02 (origem) |
| I-004 | **WhatsApp** (Meta Cloud API, presumido) | Confirmada (canal) | Série em M-01 | M-01, M-02 |
| I-005 | **Imovelweb** | Confirmada (canal) | Série em M-01 | M-01 |
| I-006 | **Chaves Na Mão** | Confirmada (canal) | Série em M-01 | M-01 |
| I-007 | **Site próprio (do tenant)** | Confirmada (canal) | Série em M-01 | M-01 |
| I-008 | **Facebook** (lead ads, presumido) | Confirmada (canal) | Série em M-01 | M-01 |
| I-009 | **Wimóveis** | Confirmada (canal) | Série em M-01 | M-01 |
| I-010 | **Hotjar** | Confirmada (analytics 3º) | text node `_hjSafeContext` em DOM global | Global |
| I-011 | **Bubble.io** | Confirmada (plataforma de run-time) | classes `bubble-element`, IDs `groupFocus*`, padrões de CSS inline | Global |
| I-012 | **CRMs genéricos** | Confirmada (destino) | Coluna "CRM" em M-03 + métricas "Enviado/Erro ao CRM" em M-01 (CRM específico não nomeado na UI observada) | M-01, M-03 |

## 7. Modelo de Permissões Inferido (P-###)

| ID | Papel | Evidência | Capacidade observada |
|---|---|---|---|
| P-001 | **Admin do tenant (Agência)** | usuário observado | Navega todos os 12 módulos. Vê/regenera "Código da Lais" (M-11). Vê financeiro do tenant (M-10). Acessa configurações (M-09). |
| P-002 | **Colaborador com código** (inferido) | a11y M-11: "Comunique esse código com seus colaboradores para que eles possam acessar o Histórico do Cliente." | Acesso RESTRITO ao "Histórico do Cliente" (provavelmente view parcial de conversas/leads). Não confirmado visualmente — requer login com código. |
| P-003 | **Superadmin Lastro (global)** | Não observado. | Presumido: gestão cross-tenant, billing consolidado, feature flags. Ver X-001. |

**Observação:** não se observou UI de convite de usuário por email, nem lista de usuários ativos, nem gestão granular de papéis no painel. O modelo real é `1 admin + código compartilhado`, diferente do modelo multi-usuário com roles que a Aimee implementa.

## 8. Áreas Fora do Alcance (X-###)

| ID | Área | Por que fora do alcance | Hipótese |
|---|---|---|---|
| X-001 | Painel superadmin Lastro (cross-tenant) | Não há alternador visível no usuário observado — é admin de 1 tenant, não superadmin. | Existe em subdomínio interno ou rota protegida (`/admin`, `/god`, etc.). |
| X-002 | Conteúdo renderizado das rotas /chats, /visits, /configs, /notifications, /relatorio-v2 | Bubble.io renderiza sem expor texto no a11y tree. Screenshots não foram capturados com o toolset atual. | Shape inferível por cruzamento com Dossiê Helena e convenções de UX; detalhe fora do escopo observacional desta v1.0. |
| X-003 | Rotas de detalhe (drill-down de lead, detalhe de empreendimento, conversa aberta com proprietário) | Nenhum item clicado em profundidade durante a varredura (tenant sem dados populados em vários módulos). | Rotas prováveis: `/leads/:id`, `/developments/:id`, `/owners/:id`, possivelmente modais em vez de rotas. |
| X-004 | Seções completas de /configs além dos 3 cards destacados em M-01 | Rota visitada mas sem conteúdo a11y. | Provável: horários de atendimento, templates de mensagem, integrações CRM, perfil do agente, handoff humano. |
| X-005 | Outros `type=` em /notifications e rota `/relatorio` (v1 deprecada) | Só foi observado `type=lead-property-acquisition`. `-v2` no Relatório sugere v1 existir. | Possíveis tipos: alertas de SLA, novas conversas, falhas de CRM. v1 de relatório provavelmente redireciona/coexiste. |
| X-006 | Provedor de vídeo do Guia da Lais (M-12) | Player não acionado; URL/IFRAME não capturado. | Vimeo ou YouTube embed; irrelevante operacionalmente. |

## 9. Taxonomia Cruzada com Aimee

| ID Lais | Conceito | Equivalente Aimee |
|---|---|---|
| M-01 Início | Dashboard com KPIs de plano + funil mensal | `AdminDashboardPage` + painel tenant — **equivalente diferente por design** (Aimee separa admin-global de dashboard-tenant; Lais unifica). |
| M-02 Conversas | Inbox IA × lead (1 app, múltiplos canais) | `/chat` / `ConversationsPage` — **equivalente direto** (ver Dossiê Helena + Análise Comparativa). |
| M-03 Leads | Tabela de leads + ações em massa + Remarketing | `/leads` (LeadsPage) + `/campanhas` (LeadImportSheet remarketing C2S) — **equivalente direto parcial**; Aimee adiciona Pipeline Kanban (sem equivalente na Lais observada). |
| M-04 Visitas [NOVO] | Gestão de visitas agendadas pela IA | **Sem equivalente direto** na Aimee hoje; há pré-agendamento via ai-agent mas sem módulo/rota dedicada. |
| M-05 Relatório | Analytics eixos Aluguel/Imóveis/Bairros | `AdminDashboardPage` parcial — **equivalente diferente por design** (Aimee mistura nos gráficos do dashboard). |
| M-06 Empreendimentos | Catálogo próprio para "aquecer leads" | **Sem equivalente**: Aimee consome feed Vista mas não tem cadastro próprio de empreendimentos. |
| M-07 Atualização | IA conversando com proprietários para atualizar imóveis | `/atualizacao` (Sprint 6.2, ADM Smolka) — **equivalente direto**, construído em paralelo. |
| M-08 Captação | IA detecta imóvel de 3º e notifica corretor | **Sem equivalente** na Aimee (vantagem comparativa da Lais). |
| M-09 Minha Lais | Configuração do comportamento do agente | `AdminTenantDetailPage` + `ai_agent_config` + AI Lab — **equivalente diferente por design** (Aimee divide entre admin global e lab). |
| M-10 Financeiro | Boleto/plano/quota do próprio tenant | `/financeiro` (mock, sem billing real) — **equivalente futuro** (parte do MVP, ver memória). |
| M-11 Acessos | Acesso por código compartilhado | `/admin/usuarios` (convite individual com roles admin/operator/viewer/super_admin) — **equivalente diferente por design** (Aimee tem modelo de permissões mais granular). |
| M-12 Guia da Lais | Trilha de vídeos in-app | **Sem equivalente** na Aimee (potencial gap de onboarding). |
| I-001 Intercom | Suporte in-app | **Sem equivalente** na Aimee. |
| I-010 Hotjar | Heatmaps/session recording | **Sem equivalente** confirmado na Aimee. |

## 10. Mudanças Esperadas / Pontos de Instabilidade

- **Badge "NOVO"** em dois pontos:
  - M-04 Visitas (módulo inteiro é novo — rollout).
  - Card "Personalizações de comportamento" (M-01) — feature recente em M-09.
- **Sufixo `-v2`** em `/relatorio-v2` — rota anterior (`/relatorio`) provavelmente em transição/deprecação (X-005).
- **Quota anual do plano em 112%** (M-01, "Solicitações via Lais Visita 6.705/6.000") — estado excedido sem UI de upgrade associada visível na tela de dashboard; provavelmente tratado em M-10. Sinal de que o produto Lais Visita escalou mais rápido que as projeções de contrato.
- **Módulos com conteúdo invisível ao a11y tree** (M-02, M-04, M-08, M-09 e parcialmente M-07): consequência da renderização Bubble.io com componentes custom sem `aria-*`. Inspeção futura deve usar screenshots + DOM-scraping com `getComputedStyle`/`getBoundingClientRect` para remontar o shape.
- **Inconsistência em /leads**: "Exibindo 0 lead" + "Exibindo 1 de …" simultâneos — possível regressão no estado da paginação quando filtros zeram resultados.
- **Erro de português oficial** em M-10: "Ainda não houveram outros pagamentos." — micro-indício de amadurecimento editorial do produto; típico em plataformas Bubble sem revisão linguística centralizada.
- **Modelo de acesso por código** (M-11) é arquiteturalmente primitivo se comparado a convites/roles. Se a Lastro evoluir pra enterprise real, essa tela é forte candidata a reforma.
- **Captação como sub-tipo de `/notifications`**: estruturalmente leve; se o produto der mais pilares de notificação, `/notifications` vira um módulo por si (hoje é oculto sob dois rótulos diferentes — Ajuda/Intercom e Captação/Notifications).
- **Ausência de UI pra CRM específico** em M-03 (coluna "CRM") e M-01 (métricas "Enviado ao CRM") — sugere integração abstrata/configurada em M-09 (fora do alcance desta v1.0).

## Apêndice A — Índice de Screenshots

**Nenhum screenshot foi capturado nesta revisão.** O toolset Claude-in-Chrome usado não inclui screenshot em PNG/JPG, e a alternativa (computer-use) não foi autorizada explicitamente para esta sessão. Toda evidência está ancorada em snapshots textuais do accessibility tree e de DOM text-walkers (§ Apêndice B).

Recomendação para v1.1: rodar novamente com autorização de `computer-use__screenshot` para anexar PNGs mascarados de cada rota.

## Apêndice B — Log de Varredura

| # | Rota | Método | Timestamp (ISO) | Completude | Obstáculo |
|---|---|---|---|---|---|
| 1 | `/?month=04&year=2026` | a11y-tree + text-walker | 2026-04-22T (sessão) | Total | — |
| 2 | `/chats?chatId=…` | a11y-tree + text-walker | idem | Parcial | Conteúdo custom Bubble fora do a11y |
| 3 | `/leads?u=…&createdAt=…&page=1` | a11y-tree | idem | Total | — |
| 4 | `/visits` | a11y-tree + text-walker | idem | Parcial | Conteúdo custom fora do a11y |
| 5 | `/relatorio-v2` | a11y-tree | idem | Total (header+tabs) | Gráficos não capturados |
| 6 | `/developments` | a11y-tree | idem | Total (empty state) | — |
| 7 | `/owners` | a11y-tree | idem | Parcial | Corpo da lista fora do a11y |
| 8 | `/notifications?type=lead-property-acquisition&page=1` | a11y-tree + text-walker | idem | Parcial | Conteúdo fora do a11y |
| 9 | `/configs` | a11y-tree + text-walker | idem | Parcial | Conteúdo fora do a11y |
| 10 | `/finance` | a11y-tree | idem | Total | — |
| 11 | `/user_management` | a11y-tree | idem | Total | — |
| 12 | `/trainings_page` | a11y-tree | idem | Parcial | Lista de vídeos parcialmente exposta |

Observações transversais:
- Todas as rotas exigem `agency=<UUID>`; redirecionam para login se ausente (não testado, inferido).
- Cliques na sidebar só disparavam com dispatch manual de `mousedown+mouseup+click` — Bubble.io usa handlers próprios que ignoram `.click()` simples. Registrar para automação futura.
- Vários rótulos aparecem/desaparecem conforme o grupo pai está colapsado/expandido (ex: "Financeiro" só visível quando "Configurações" expandido). Impacta snapshots comparativos.

## Apêndice C — Glossário

| Termo | Definição operacional (inferida) |
|---|---|
| **Casa da Lais** | Nome do console web (tenant space) do produto Lais. Análogo a "Painel da Aimee". |
| **Lais** | Agente IA da Lastro que atende leads por WhatsApp + portais. |
| **Lais Visita** | Sub-produto/feature que gerencia agendamento e execução de visitas; possui módulo próprio (M-04) e medidor anual separado no dashboard. |
| **Atendimento** | Unidade de cobrança do plano — 1 conversa efetiva com lead. Base da métrica "Cobranças de atendimento". |
| **Encaminhado ao CRM** | Lead considerado qualificado pela Lais e enviado ao CRM configurado no tenant. |
| **Captação** | Pipeline inverso ao de atendimento — a IA identifica, em conversas com leads, imóveis de outras agências que valem a pena captar, e notifica o corretor. |
| **Atualização** | Pipeline de conversas IA × proprietário para manter o anúncio vivo (preço, disponibilidade, fotos). Equivalente ao Sprint 6.2 da Aimee. |
| **Empreendimento** | Lançamento imobiliário cadastrado pelo tenant. Separado do feed de portais. |
| **Remarketing** | Campanha em massa para leads antigos (feature em M-03). Análogo ao Remarketing C2S da Aimee. |
| **Histórico do Cliente** | Artefato visível ao colaborador com "código da Lais" (P-002). Escopo exato fora do alcance. |
| **Trilha de conhecimento** | Onboarding em vídeo do Guia da Lais. |
| **Personalização de comportamento** | Configuração declarativa do que/quando a Lais deve perguntar/oferecer. Feature NOVO em M-09. |
