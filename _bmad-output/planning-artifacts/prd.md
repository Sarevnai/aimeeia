---
stepsCompleted:
  - step-01-init
  - step-02-discovery
  - step-02b-vision
  - step-02c-executive-summary
  - step-03-success
  - step-04-journeys
  - step-05-domain
  - step-06-innovation
inputDocuments:
  - docs/index.md
  - docs/project-overview.md
  - docs/architecture.md
  - docs/data-models.md
  - docs/api-contracts.md
  - docs/component-inventory.md
  - docs/development-guide.md
  - docs/source-tree-analysis.md
  - docs/UX_UI_AUDIT.md
  - docs/comparativo_octadesk_vs_aimee.md
  - docs/plano_implementacao_aimee.md
  - docs/analysis-reports/sim-remarketing-1-v1.md
  - docs/analysis-reports/sim-remarketing-2-v1.md
  - supabase/functions/_shared/agents/remarketing.ts
  - supabase/functions/ai-agent-simulate/index.ts
  - supabase/functions/ai-agent/index.ts
  - directives/flow-triage.md
  - directives/flow-qualification.md
  - directives/flow-operator-handoff.md
  - directives/flow-crm-handoff.md
  - directives/flow-property-search.md
  - directives/flow-anti-loop.md
documentCounts:
  briefs: 0
  research: 0
  brainstorming: 0
  projectDocs: 22
workflowType: 'prd'
classification:
  projectType: saas_b2b
  domain: real_estate_tech
  complexity: high
  projectContext: brownfield
scope:
  name: "Remarketing Flow v2 — Core Loop Fix"
  goal: "Score de simulação ≥ 9.5/10, zero erros críticos de fabricação/alucinação"
  premise: "SLA de callback ≤ 30 minutos após handoff (responsabilidade operacional, não técnica)"
  impact: "Fixes em shared modules — afetam todos os agentes (comercial, admin, remarketing). Validação foca em remarketing. Regressão verificada via F5."
  prerequisite: "Bug #0: Confirmar que saveQualificationData() persiste na tabela lead_qualification"
  order: "Bug #0 → F1 → F2 → F3 → F4 → F5"
  fronts:
    - id: F1
      name: "Zero Fabricação"
      objective: "Qualificação só persiste dados explícitos do cliente"
      ac: "0 campos com source != client_explicit em 3 simulações. Múltiplos bairros extraídos."
      files: ["qualification.ts", "migration lead_qualification"]
    - id: F2
      name: "Zero Alucinação"
      objective: "LLM nunca referencia conteúdo não produzido"
      ac: "0 turnos com referência a ações não executadas em 3 simulações. Guardrail sandwich."
      files: ["remarketing.ts", "prompts.ts"]
    - id: F3
      name: "Handoff Humanizado"
      objective: "Despedida natural, mensagem de sistema separada"
      ac: "Turno de handoff ≥ 9.0/10 em todas simulações. pre-completion-check não sanitiza handoff."
      files: ["tool-executors.ts", "pre-completion-check.ts"]
    - id: F4
      name: "Paridade Sim↔Prod"
      objective: "Mesmos caminhos de código"
      ac: "Simulador e produção importam mesmos shared modules. Lógica de estado extraída de sendAndSave()."
      files: ["ai-agent-simulate/index.ts", "ai-agent/index.ts", "tool-executors.ts"]
    - id: F5
      name: "Smoke Test de Regressão"
      objective: "Regressão bloqueada antes de deploy"
      ac: "3 cenários fixos (happy path, edge case, handoff), score ≥ 8.5 cada. Valida remarketing + comercial."
      files: ["novo script/edge function"]
elicitation:
  methods_applied:
    - pre-mortem-analysis
    - 5-whys-deep-dive
    - failure-mode-analysis
    - cross-functional-war-room
    - critique-and-refine
  key_findings:
    - "Root cause F1: Sem distinção source client_explicit vs inferred nos campos de qualificação"
    - "Root cause F2: Módulo busca-imoveis não distingue 'vai buscar' de 'já buscou'"
    - "Root cause F3: tool-executors tem responsabilidade dupla (log + instrução LLM)"
    - "Top failure mode: Prompt longo + guardrail ignorado → sandwich technique essencial"
    - "lead_qualification com 0 rows é Bug #0 bloqueador"
    - "Simulação já tem handoff humanizado hardcoded, produção não — paridade invertida"
---

# Product Requirements Document - aimeeia

**Author:** Ianveras
**Date:** 2026-03-30

## Executive Summary

Aimee.iA is a multi-tenant AI-powered WhatsApp CRM platform for the Brazilian real estate market, competing directly with Laís (Lastro). The platform automates lead qualification, property search, and CRM handoff through intelligent WhatsApp conversations.

This PRD addresses the **Remarketing Flow v2**, the platform's core differentiator: a VIP consultative AI agent that reengages cold leads via WhatsApp, qualifies them through structured anamnesis, performs semantic property search, and delivers a complete dossier to the broker. Today, this flow scores 6.9-8.0/10 in simulation — below the 9.5 threshold required for production confidence. Three systemic bugs (data fabrication in qualification, LLM hallucination of unsent content, and dehumanized handoff messages) account for 80%+ of critical errors. Additionally, a simulation-production parity gap means fixes validated in the simulator may not transfer to production.

The scope covers 5 fronts executed sequentially: (F1) zero data fabrication in qualification extraction, (F2) zero LLM hallucination via reinforced guardrails, (F3) humanized handoff with separated system/client messaging, (F4) simulation-production parity in shared modules, and (F5) regression smoke tests blocking deploys below score thresholds. A prerequisite Bug #0 must confirm that `saveQualificationData()` actually persists to the `lead_qualification` table.

### What Makes This Special

While Laís (Lastro) offers remarketing via template dispatch, Aimee's remarketing flow is **conversational and consultative** — a VIP persona conducts a structured anamnesis, performs pgvector semantic property search, and hands off a qualified lead with full context. No competing product in the Brazilian real estate market combines AI-driven qualification, semantic property matching, and enriched CRM handoff in a single WhatsApp conversation flow.

Fixing this core loop is the difference between "demo that impresses" and "product that generates revenue." Each broken conversation is a lost lead and an argument for the competitor. Beyond this PRD, the long-term vision includes solving problems that even Laís hasn't addressed — such as property classification accuracy (sale vs. rental misclassification) — positioning Aimee as the market reference.

## Project Classification

- **Type:** SaaS B2B (multi-tenant platform)
- **Domain:** Real Estate Tech (PropTech) — AI-powered conversational CRM
- **Complexity:** High — multi-tenant RLS, WhatsApp Cloud API, multiple CRM integrations (Vista, C2S), multi-agent AI system (Gemini via OpenRouter), pgvector semantic search
- **Context:** Brownfield — mature codebase with 31 tables, 24 Edge Functions, 40+ pages, ~60-65% MVP ready
- **Competitive landscape:** Direct competitor is Laís (Lastro); indirect competitors include Octadesk (generic) and traditional CRMs without AI

## Success Criteria

### User Success (Lead Experience)

- Lead receives VIP consultative experience indistinguishable from a skilled human consultant
- Zero moments where the lead detects "this is a bot" due to fabricated data, hallucinated actions, or robotic handoff messages
- Lead's stated preferences are accurately captured — never told "I found apartments in Agronômica" when they said "Centro ou Agronômica"
- Handoff moment feels like a warm introduction to a broker, not an abrupt system transfer
- Lead receives relevant property suggestions based on their **actual** stated criteria, not inferred/fabricated data

### Business Success

- **3-month target:** Simulation score ≥ 9.5/10 across all standard test scenarios, enabling confident production deployment for new tenants
- **6-month target:** Remarketing flow generates measurably more qualified handoffs than template-only dispatch (Laís-equivalent approach)
- **Conversion signal:** Tenants report that leads arriving via remarketing flow are "warmer" and require less broker effort than cold leads
- **Competitive positioning:** Remarketing flow becomes the primary sales demo for new tenant acquisition vs. Laís

### Technical Success

- `ai-agent-analyze-batch` scores ≥ 9.5/10 average across 3 standard simulation scenarios (happy path, edge case, handoff)
- Zero critical errors of type "Data Fabrication" or "Hallucination" in any simulation run
- Handoff turn scores ≥ 9.0/10 in all simulation runs
- `lead_qualification` table has non-zero rows for every completed remarketing conversation (Bug #0 resolved)
- Simulation and production execute identical code paths through shared modules — no divergent logic
- Smoke test suite blocks deployment if any scenario scores < 8.5/10

### Measurable Outcomes

| Metric | Current | Target | Measurement |
|--------|---------|--------|-------------|
| Simulation average score | 6.9-8.0 | ≥ 9.5 | `ai-agent-analyze-batch` |
| Critical errors per simulation | 10-23 | 0 | Analysis report error count (high severity) |
| Handoff turn score | 5.8 | ≥ 9.0 | Per-turn analysis on handoff turns |
| Data fabrication incidents | 6+ per sim | 0 | Fields with `source != client_explicit` |
| lead_qualification rows | 0 (broken) | 1 per completed conversation | DB query |
| Sim↔Prod code path divergence | Multiple | 0 | Shared module import diff |

## Product Scope

### MVP (This PRD)

- **Bug #0:** Fix `saveQualificationData()` persistence
- **F1:** Zero fabrication — `source` field per qualification datum, extract only from `role: 'user'` messages
- **F2:** Zero hallucination — sandwich guardrails, module state injection (`tools_executed` awareness)
- **F3:** Humanized handoff — dual output in tool executors (system log + LLM instruction), `pre-completion-check` bypass for handoff
- **F4:** Sim↔Prod parity — extract state logic from `sendAndSave()`, shared execution paths
- **F5:** Smoke test — 3 fixed scenarios, score threshold gate before deploy

### Growth Features (Post-MVP)

- Multiple neighborhood extraction in single message ("Centro ou Agronômica")
- Property classification accuracy (sale vs. rental — a bug even Laís has)
- Expanded test corpus with real conversation transcripts
- AI traces in simulator for cost/latency monitoring
- TTS flow simulation (indicate where audio would be generated)

### Vision (Future)

- Score ≥ 9.8 across all agent types (comercial, admin, remarketing)
- Automated CI/CD pipeline: PR → simulate → analyze → block/approve
- Self-improving prompts based on simulation feedback loops
- Parity with Laís on all features (chat 3-panel, client sidebar, mass actions) while maintaining AI quality advantage

## User Journeys

### Journey 1: Mariana (Lead Fria) — Happy Path

**Situação:** Mariana visitou um apartamento de 2 quartos no Centro há 3 meses via portal. Não fechou, esfriou. Está no CRM como "arquivada".

**Opening Scene:** Mariana recebe uma mensagem no WhatsApp de "Aimee, consultora VIP" da imobiliária. A mensagem é calorosa, personalizada — menciona que ela havia demonstrado interesse em imóveis na região central. Mariana está no ônibus, responde com um "oi, quem é?"

**Rising Action:** Aimee se apresenta como consultora especializada, inicia a anamnese estruturada. Pergunta sobre o que mudou desde a última visita, qual o orçamento atual, se prefere compra ou aluguel, quais bairros interessam. Mariana responde "Centro ou Agronômica, até 350k, compra, 2 quartos mínimo." A qualificação extrai **exatamente** o que Mariana disse — sem inventar tipologia, sem inferir renda.

**Climax:** Aimee executa busca semântica via pgvector. Encontra 3 imóveis compatíveis. Apresenta cada um com foto, metragem, valor — tudo real, tudo correspondente aos critérios **declarados** por Mariana. Mariana demonstra interesse no segundo imóvel.

**Resolution:** Aimee faz o handoff: "Mariana, vou conectar você com o João, nosso especialista na região do Centro. Ele já tem todo o contexto da nossa conversa e vai agendar uma visita no horário que funcionar melhor para você. Foi um prazer te atender!" O corretor recebe um dossier completo: preferências declaradas, imóveis de interesse, e histórico da conversa.

**Requisitos revelados:** Extração de qualificação sem fabricação (F1), busca semântica precisa, handoff humanizado (F3), dossier para corretor.

### Journey 2: Mariana (Lead Fria) — Edge Case com Falha Atual

**Situação:** Mesmo cenário, mas com os bugs atuais.

**Opening Scene:** Mariana recebe a mesma mensagem. Responde "oi".

**Rising Action:** Aimee faz anamnese. Mariana diz "Centro ou Agronômica". O `extractQualificationFromText()` registra **apenas "Agronômica"** (perde o múltiplo). Pior: infere `tipologia: "apartamento"` e `quartos: 2` sem Mariana ter dito isso — **fabricação**. O `qualScore` infla para 65, ativando o módulo `busca-imoveis` prematuramente.

**Climax (falha):** Aimee diz: "Dá uma olhada no que te enviei!" — mas **nenhum imóvel foi enviado ainda**. A LLM alucinou uma ação que não aconteceu. Mariana fica confusa: "Não recebi nada." A conversa descarrila.

**Resolution (falha):** Quando finalmente faz o handoff, Aimee diz: "Lead transferido para atendimento humano via CRM. Protocolo #4521." Mariana lê uma mensagem de sistema robótica. Pensa "isso é um robô" e bloqueia o número. Lead perdida.

**Requisitos revelados:** Source tracking por campo (F1), guardrail sandwich contra alucinação (F2), separação mensagem sistema vs cliente (F3).

### Journey 3: João (Corretor/Broker) — Recebendo Handoff

**Situação:** João é corretor sênior na imobiliária, especialista na região central. Recebe leads via CRM (Vista).

**Opening Scene:** João recebe notificação no CRM: novo lead qualificado via Aimee. Abre o registro.

**Rising Action (cenário atual com bugs):** O dossier mostra "Interesse: Agronômica, apartamento, 2 quartos" — mas quando João liga para Mariana, ela diz "eu falei Centro **ou** Agronômica, e não disse que queria apartamento." João perde credibilidade. A qualificação fabricada atrapalhou mais do que ajudou.

**Climax (cenário corrigido):** O dossier mostra exatamente o que Mariana declarou: `bairros: ["Centro", "Agronômica"], orçamento: "até 350k", operação: "compra", quartos: "mínimo 2"` — cada campo com `source: client_explicit`. João liga com informações corretas, Mariana se impressiona: "nossa, você já sabe tudo que eu preciso!"

**Resolution:** João agenda visita no mesmo dia. Conversão acontece porque a qualificação foi precisa e o handoff foi quente.

**Requisitos revelados:** Qualificação sem fabricação (F1), múltiplos bairros (Growth), dossier preciso para CRM handoff.

### Journey 4: Ricardo (Admin do Tenant) — Validando via Simulador

**Situação:** Ricardo é admin da imobiliária, configura o Aimee. Precisa validar que o fluxo de remarketing funciona antes de rodar em produção com leads reais.

**Opening Scene:** Ricardo acessa o AI Lab, seleciona "Simulação Remarketing" e roda o cenário padrão.

**Rising Action:** A simulação executa 7-8 turnos. Ricardo vê a conversa acontecer: anamnese, qualificação, busca, handoff. O `ai-agent-analyze-batch` pontua cada turno.

**Climax:** Score final: **9.6/10**. Zero erros críticos de fabricação. Zero alucinações. Handoff humanizado com score 9.2. Ricardo tem confiança para ativar o fluxo em produção.

**Resolution:** Ricardo ativa o remarketing para o segmento de leads frios dos últimos 90 dias. Sabe que os mesmos caminhos de código da simulação rodarão em produção (F4 garantiu paridade).

**Ponto de falha (cenário atual):** Simulação dá score 8.0 mas produção se comporta diferente — simulador tem handoff humanizado hardcoded que produção não tem. Ricardo não tem como saber que produção vai falhar onde simulação passou. **Paridade quebrada.**

**Requisitos revelados:** Paridade Sim↔Prod (F4), smoke test de regressão (F5), score threshold como gate.

### Journey Requirements Summary

| Jornada | Fronts Revelados | Capacidades Necessárias |
|---------|-----------------|------------------------|
| Mariana Happy Path | F1, F3 | Extração precisa, busca semântica, handoff humanizado, dossier CRM |
| Mariana Edge Case | F1, F2, F3 | Source tracking, guardrail sandwich, separação mensagem sistema/cliente |
| João (Corretor) | F1 | Qualificação sem fabricação, dossier preciso, múltiplos bairros |
| Ricardo (Admin) | F4, F5 | Paridade simulação-produção, smoke test, score threshold gate |

## Domain-Specific Requirements

### Compliance & Regulatory

- **LGPD (Lei Geral de Proteção de Dados):** Dados de leads (nome, telefone, preferências) são dados pessoais. Qualificação deve registrar apenas dados explicitamente fornecidos pelo cliente (`source: client_explicit`). Dados inferidos devem ser marcados como tal e nunca apresentados como fato ao corretor.
- **Meta WhatsApp Business Policy:** Mensagens de remarketing devem respeitar janela de 24h (template obrigatório fora da janela). Opt-out deve ser respeitado imediatamente. Bloqueio do número = remoção permanente da lista.
- **Multi-tenancy isolation:** RLS via `tenant_id` em todas as tabelas. Dados de um tenant nunca podem vazar para outro. `lead_qualification` deve respeitar o mesmo padrão.

### Technical Constraints

- **LLM non-determinism:** Gemini via OpenRouter não garante resposta idêntica para o mesmo input. Guardrails devem ser reforçados via sandwich technique (início e fim do prompt). Guardrails críticos: nunca fabricar dados, nunca referenciar ações não executadas.
- **WhatsApp message delivery:** Mensagens podem falhar silenciosamente (telefone inválido, número bloqueado). O sistema deve tratar falhas de envio sem quebrar o fluxo de conversação.
- **Simulation fidelity:** Simulador não envia mensagens reais nem grava no CRM, mas deve executar **exatamente** os mesmos caminhos de código dos shared modules. Divergências invalidam o teste.
- **Edge Function cold start:** Supabase Edge Functions têm cold start. Conversações longas (8+ turnos) podem exceder timeout. State management via banco, não em memória.

### Integration Requirements

- **CRM Vista:** Handoff cria lead no Vista via API. Dossier deve incluir: dados de qualificação (com source), imóveis apresentados, histórico resumido. Formato conforme API Vista existente.
- **CRM C2S (Construtor de Vendas):** Integração parcial. Mesmo contrato de dossier, wrapper JSON API diferente.
- **pgvector (Supabase):** Busca semântica de imóveis. Embeddings já indexados. Query deve usar apenas critérios `client_explicit` — nunca dados fabricados.
- **OpenRouter → Gemini:** Model: Gemini 2.5 Flash (nunca 2.0 Flash, deprecated). Rate limits e custos por token devem ser monitorados.

### Risk Mitigations

| Risco | Impacto | Mitigação |
|-------|---------|-----------|
| LLM ignora guardrail em prompt longo | Fabricação/alucinação em produção | Sandwich technique: guardrail no início E no fim do system prompt |
| `lead_qualification` não persiste (Bug #0) | Qualificação descartada, dossier vazio | Verificar persistência antes de qualquer outro fix |
| Simulação passa mas produção falha | Falsa confiança, bugs em leads reais | F4: shared modules idênticos + F5: smoke test pré-deploy |
| Score inflado por dados fabricados | Módulo busca-imoveis ativa prematuramente | F1: apenas `client_explicit` conta para `qualScore` |
| Handoff robótico causa bloqueio do número | Lead perdida permanentemente + risco de ban WhatsApp | F3: mensagem humana para cliente, log técnico separado |

## Innovation & Novel Patterns

### Detected Innovation Areas

1. **Remarketing Conversacional com Anamnese AI:** Enquanto concorrentes disparam templates de remarketing em massa, Aimee conduz uma conversa consultiva personalizada — persona VIP que faz anamnese estruturada, qualifica em tempo real, e adapta a abordagem. Nenhum concorrente no PropTech brasileiro combina AI conversacional + qualificação + busca semântica em um único fluxo WhatsApp.

2. **Busca Semântica de Imóveis via pgvector em Conversa:** A busca acontece dentro da conversa, usando embeddings semânticos alimentados pelos critérios declarados pelo lead. O lead não precisa acessar portal.

3. **Dossier Enriquecido para CRM Handoff:** Entrega de dossier completo ao corretor: preferências declaradas (com source tracking), imóveis apresentados, histórico resumido da conversa.

### Validation Approach

- Score ≥ 9.5/10 via `ai-agent-analyze-batch` em 3 cenários fixos antes de deploy
- Comparar taxa de conversão remarketing conversacional vs. template dispatch
- Feedback qualitativo de corretores sobre qualidade dos leads

### Risk Mitigation

| Risco de Inovação | Mitigação |
|-------------------|-----------|
| LLM não mantém qualidade em escala | Guardrails reforçados (F2) + smoke test pré-deploy (F5) |
| Leads acham conversa invasiva | Persona VIP calorosa + opt-out + tom consultivo |
| Corretores não confiam no dossier | Source tracking (F1) garante dados do cliente |
| Custo por conversa alto | Monitorar via AI traces (Growth) + otimizar prompt |
