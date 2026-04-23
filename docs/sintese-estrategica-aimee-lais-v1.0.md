---
artefato: Síntese Estratégica Aimee × Lais
versao: 1.0
tipo: síntese de biblioteca técnica
data: 2026-04-22
autor: Ian Veras (Greattings / Aimee)
leitor_alvo: time Aimee (decisão de roadmap)
fontes:
  - LAIS.v1.0 — Mapa Estrutural casa.lais.ai (black-box, docs/casa-lais-mapa-estrutural-v1.0.md)
  - AIMEE.v1.0 — Mapa Estrutural Aimee (white-box, docs/aimee-mapa-estrutural-v1.0.md, commit df7b437)
  - Dossiê Helena v? (referenciado; não localizado no repo)
  - Análise Comparativa Helena × Aimee v? (referenciada; não localizada no repo)
escopo: plataforma (não duplica análise de agente existente)
protocolo_paridade: toda afirmação em §4, §6 e §7 carrega marcador [verificada / não-verificada / assimétrica]
---

# Síntese Estratégica Aimee × Lais — v1.0

## 1. Sumário Executivo

- A paridade real entre as duas plataformas é **mais alta do que aparenta** quando se controla pela assimetria epistêmica: a Aimee tem débito e drift catalogados (AIMEE.Q-###); a Lais tem o mesmo, só não é observável (ver §2 e §5).
- A Aimee tem **diferenciais estruturais verificáveis** em pipeline operacional (Kanban, tickets, AI Lab, multi-agente federado, realtime+áudio), enquanto a Lais tem **diferenciais estruturais verificáveis** em dois módulos-produto: **Visitas** (LAIS.M-04) e **Captação** (LAIS.M-08). Ver §6 e BENCH.O-01, BENCH.O-02.
- A arquitetura "Identity/Memory/Soul/Governance" **não existe como camadas no código da Aimee** (AIMEE.Q-001). Isso é o drift arquitetural mais relevante da síntese — decidir em §9 (BENCH.O-08) se refatora ou se reescreve o briefing.
- Exposição **LGPD em `ai_traces`** (AIMEE.Q-008, 30.715 linhas sem máscara de PII) é o risco estratégico #1 (BENCH.R-01) e bloqueia comercialização enterprise independentemente do que a Lais faça.
- **Mocks em /financeiro, /admin/billing, /admin/metrics** (AIMEE.Q-011) são a barreira contratual para sair da Smolka. Lais tem esses módulos vivos (LAIS.M-10) — mas marcar como "vantagem Lais" seria erro epistêmico: é **ausência de feature na Aimee**, não superioridade da Lais (paridade verificada via a11y).
- Modelo de acesso da Lais (código compartilhado único, LAIS.P-002) é **arquiteturalmente primitivo** se comparado ao modelo de roles da Aimee (super_admin/admin/operator/viewer por usuário). Este é um BENCH.D.A verificado. Ver §11 para a rejeição deliberada.
- **Postura estratégica recomendada:** *diferenciar em governança e operação multi-agente, parear em Visitas e Captação (BENCH.O-01/O-02), rejeitar o modelo de acesso por código e a UI monolítica Bubble.*

## 2. Nota Metodológica de Paridade Epistêmica

**O que LAIS.v1.0 vê:** accessibility tree + text-walker de 12 rotas autenticadas como admin do tenant Smolka (LAIS §Apêndice B). Zero screenshots, zero código, zero prompts, zero schema, zero logs. Várias rotas (LAIS.M-02 /chats, LAIS.M-04 /visits, LAIS.M-08 /notifications, LAIS.M-09 /configs) expuseram **apenas o chrome do app** (Bubble.io sem `aria-*`), deixando o conteúdo interno fora do alcance (LAIS.X-002). A plataforma é Bubble.io — o que *parece polido* pode esconder débito estrutural equivalente ou superior ao da Aimee.

**O que AIMEE.v1.0 vê:** código completo, 64 migrations, 43 edge functions, 22 prompt builders, 45 tabelas, 30.7k traces, churn por arquivo, drift arquitetural declarado, débito catalogado (AIMEE.Q-001..Q-013). Isso gera **viés pessimista** quando comparado cru com LAIS.v1.0 — vemos as cicatrizes da Aimee, não as da Lais.

**Regra de leitura:** toda célula das §4, §6 e §7 carrega marcador explícito `[verificada]` (evidência dupla), `[não-verificada]` (verificado só de um lado) ou `[assimétrica]` (não comparável por natureza). Sem marcador a célula é inválida. Afirmações de "fraqueza da Aimee" que não podem ser verificadas na Lais vão para §5 (BENCH.E), **não** para §4.3. Afirmações de "força da Lais" que não podem ser verificadas na Aimee idem.

## 3. Matriz de Paridade

| # | Capacidade | Aimee (§AIMEE) | Lais (§LAIS) | Categoria | BENCH |
|---|---|---|---|---|---|
| 1 | Dashboard de KPIs do tenant | AIMEE.R-01.01, R-01.22 | LAIS.M-01 | simétrica | BENCH.P-01 |
| 2 | Inbox de conversas WA × lead | AIMEE.R-01.02/03 | LAIS.M-02 | simétrica | BENCH.P-02 |
| 3 | Tabela de leads com filtros | AIMEE.R-01.05 | LAIS.M-03 | simétrica | BENCH.P-03 |
| 4 | Relatórios analíticos | AIMEE.R-01.10 | LAIS.M-05 | simétrica | BENCH.P-04 |
| 5 | Cadastro de empreendimentos | AIMEE.R-01.12..14, T-041 (0 rows) | LAIS.M-06 (empty state) | simétrica (ambos vazios em produção) | BENCH.P-05 |
| 6 | Atualização de anúncios (IA × proprietário) | AIMEE.R-01.18 Sprint 6.2 | LAIS.M-07 | simétrica | BENCH.P-06 |
| 7 | Captação (IA detecta imóvel de 3º) | — | LAIS.M-08, LAIS.F-025 | **dif-L verificado** | BENCH.D.L-01 |
| 8 | Agendamento/gestão de Visitas | — (pré-agendamento via tool, sem módulo) | LAIS.M-04 [NOVO] | **dif-L verificado** | BENCH.D.L-02 |
| 9 | Configuração do agente | AIMEE.R-01.15, T-021, T-023..025 | LAIS.M-09 (conteúdo fora do a11y — LAIS.X-004) | assimétrica (shape Lais desconhecido) | BENCH.E-01 |
| 10 | Financeiro/billing do tenant | AIMEE.R-01.19 **mock** (AIMEE.Q-011) | LAIS.M-10 (boleto/plano vivos) | **dif-L verificado** | BENCH.D.L-03 |
| 11 | Gestão de acessos | AIMEE.R-01.16 roles granulares | LAIS.M-11 código compartilhado único | **dif-A verificado** | BENCH.D.A-01 |
| 12 | Onboarding in-app | AIMEE.R-01.26 /guia | LAIS.M-12 trilha de vídeos | simétrica (existência); conteúdo assimétrico | BENCH.P-07 |
| 13 | Pipeline Kanban de funil | AIMEE.R-01.06 | — (não observado) | **dif-A verificado** | BENCH.D.A-02 |
| 14 | Campanhas (marketing + remarketing) | AIMEE.R-01.08/09, T-050..053 | LAIS.F-017 Remarketing (botão) | assimétrica parcial (Aimee: módulo; Lais: botão) | BENCH.E-02 |
| 15 | Tickets / setor admin locação | AIMEE.R-01.20/21, T-060..064 | — | **dif-A verificado** | BENCH.D.A-03 |
| 16 | AI Lab (simulador, prompts, análise) | AIMEE.R-03.01..06 | — | **dif-A verificado** | BENCH.D.A-04 |
| 17 | Arquitetura multi-agente federada (dept) | AIMEE.A-05, 4 domain agents | comportamento unificado (Dossiê Helena §?) | **dif-A verificado** via ausência comportamental | BENCH.D.A-05 |
| 18 | Kill-switch IA por conversa | AIMEE.T-011 `is_ai_active` | não observado na UI | assimétrica | BENCH.E-03 |
| 19 | DNC / opt-out guardrail | AIMEE.R-01.24, M-23 | não observado | assimétrica | BENCH.E-04 |
| 20 | Realtime cockpit + áudio live + TTS | AIMEE.I-006, H-009 | não observado | assimétrica (Lais pode ter; não verificável) | BENCH.E-05 |
| 21 | Multilingual espelhamento | AIMEE.PR-012 | não observado | assimétrica | BENCH.E-06 |
| 22 | Espelho CRM cliente (C2S Analytics) | AIMEE.R-01.11, I-005 | — (Lais abstrai CRM — coluna "CRM" genérica em LAIS.F-016) | **dif-A verificado** | BENCH.D.A-06 |
| 23 | Modelo de permissões por role | AIMEE.P-001..004 | LAIS.P-001 + código compartilhado | dif-A estrutural | BENCH.D.A-01 (ref) |
| 24 | Intercom/widget suporte in-app | — | LAIS.I-001 | **dif-L verificado** | BENCH.D.L-04 |
| 25 | Plataforma no-code vs custom | custom React+Vite | Bubble.io (LAIS.I-011) | dif-A estrutural (+ manutenibilidade, −velocidade UI) | BENCH.D.A-07 |

## 4. SWOT Ancorado

### 4.1 Forças da Aimee (BENCH.S.A-###)

- **BENCH.S.A-01** — Arquitetura multi-agente federada por `department` com contrato explícito `AgentModule/AgentContext` (AIMEE.M-03, §4 A-05). Dim: 3 (arquitetura). Paridade: [verificada — Lais unifica comportamento; Dossiê Helena §? descreve agente único].
- **BENCH.S.A-02** — Modelo de permissões granular por role + vínculo corretor (AIMEE.T-002, T-054; P-001..004). Dim: 7 (multi-tenant). Paridade: [verificada — LAIS.M-11 evidencia apenas código compartilhado].
- **BENCH.S.A-03** — AI Lab operacional (simulador, prompts, análise, replay; AIMEE.R-03.01..06). Dim: 5 (observabilidade). Paridade: [verificada — sem equivalente em LAIS.M-01..12].
- **BENCH.S.A-04** — Pipeline Kanban como visão de funil (AIMEE.R-01.06). Dim: 1 (experiência operador). Paridade: [verificada — LAIS.M-03 é tabela-only].
- **BENCH.S.A-05** — `ai_traces` com 30.715 linhas como trace caseiro (AIMEE.T-026, D-060). Dim: 5. Paridade: [não-verificada — Lais pode ter trace interno].
- **BENCH.S.A-06** — Realtime cockpit com áudio live + TTS + multilingual (AIMEE.H-009, I-006, PR-012). Dim: 1, 6. Paridade: [não-verificada no outro lado].
- **BENCH.S.A-07** — Espelho C2S em tempo real com delta-sync 1min (AIMEE.E-024, T-056). Dim: 6. Paridade: [verificada — LAIS.M-03 "coluna CRM" é abstração opaca].
- **BENCH.S.A-08** — Tickets / setor admin para locação administrativa (AIMEE.T-060..064). Dim: 1, 9. Paridade: [verificada — ausente em LAIS.M-*].

### 4.2 Forças da Lais (BENCH.S.L-###)

- **BENCH.S.L-01** — Módulo Visitas dedicado com medidor de quota anual (LAIS.M-04 + KPI "Solicitações via Lais Visita" em LAIS.M-01). Dim: 1, 2. Paridade: [verificada — AIMEE.R-01.* não tem equivalente].
- **BENCH.S.L-02** — Captação como pipeline inverso (IA detecta imóvel de 3º em conversa — LAIS.M-08, F-025). Dim: 2, 9. Paridade: [verificada — AIMEE não tem].
- **BENCH.S.L-03** — Billing vivo em M-10 (boleto, plano, atendimentos contratados, histórico). Dim: 4, 7. Paridade: [verificada — AIMEE.Q-011 confirma mock].
- **BENCH.S.L-04** — Funil mensal de 3 níveis com taxa de encaminhamento ao CRM (LAIS.F-005, F-007). Dim: 1, 5. Paridade: [verificada — AIMEE tem dashboard mas sem a mesma granularidade de "Status por canal"].
- **BENCH.S.L-05** — Trilha de vídeos in-app polida (LAIS.M-12, F-032/F-033). Dim: 1. Paridade: [não-verificada — AIMEE.R-01.26 /guia existe mas conteúdo não comparado].
- **BENCH.S.L-06** — Destaques editoriais da Lastro no dashboard (LAIS.F-003, carousel 4 slides). Dim: 1. Paridade: [não-verificada — valor estratégico: canal de comunicação Lastro↔tenant].

### 4.3 Fraquezas da Aimee (BENCH.W.A-###)

- **BENCH.W.A-01** — Drift arquitetural Identity/Memory/Soul/Governance (AIMEE.Q-001). Dim: 3. Paridade: [assimétrica — Lais não tem briefing arquitetural verificável]. Severidade alta.
- **BENCH.W.A-02** — PII não-mascarada em `ai_traces` (AIMEE.Q-008). Dim: 4 (governança/LGPD). Paridade: [assimétrica — mas aqui a assimetria **não absolve**: LGPD é obrigação legal unilateral]. Severidade crítica.
- **BENCH.W.A-03** — `lead_qualification` com 2 rows apesar de 5.9k contatos e 30.7k traces (AIMEE.Q-003). Dim: 9 (modelo de dados). Paridade: [não-verificada no lado Lais]. Severidade alta.
- **BENCH.W.A-04** — Orquestrador monolítico `ai-agent/index.ts` ~1.3k LOC, 61 commits/3mo (AIMEE.H-001). Dim: 8 (manutenibilidade). Paridade: [assimétrica por natureza — inobservável na Lais].
- **BENCH.W.A-05** — `/financeiro`, `/admin/billing`, `/admin/metrics` são mocks (AIMEE.Q-011). Dim: 4, 7. Paridade: [verificada — LAIS.M-10 vivo]. Severidade alta para comercialização.
- **BENCH.W.A-06** — Ausência de módulo de Visitas (gap direto vs. LAIS.M-04). Dim: 1, 2. Paridade: [verificada].
- **BENCH.W.A-07** — Ausência de módulo de Captação (gap direto vs. LAIS.M-08). Dim: 2, 9. Paridade: [verificada].
- **BENCH.W.A-08** — 43 edge functions com `verify_jwt=false` (AIMEE.Q-013). Dim: 4, 7. Paridade: [assimétrica].
- **BENCH.W.A-09** — Zero testes em `prompts.ts` (841 LOC) e `qualification.ts` (646 LOC) — o core cognitivo. Dim: 8. Paridade: [assimétrica].
- **BENCH.W.A-10** — 7 tabelas com 0 rows (slots reservados, AIMEE.Q-010) + `buildLegacy*Prompt` candidatos a morto (Q-004). Dim: 8. Paridade: [assimétrica].

### 4.4 Fraquezas da Lais (BENCH.W.L-###)

- **BENCH.W.L-01** — Modelo de acesso por código compartilhado único (LAIS.M-11, P-002). Dim: 4, 7. Paridade: [verificada — AIMEE.R-01.16 tem roles granulares]. Bloqueia governança enterprise.
- **BENCH.W.L-02** — UI renderizada em Bubble.io sem `aria-*` em vários módulos (LAIS.X-002). Dim: 1, 8. Paridade: [verificada via LAIS §10, método observacional]. Implicação: acessibilidade, automação, SEO de app interno, e *sinal de plataforma no-code com limite estrutural*.
- **BENCH.W.L-03** — `/relatorio-v2` sugere rota anterior em transição/deprecação (LAIS.X-005). Dim: 8. Paridade: [não-verificada — assumindo débito similar na Aimee, vai para §5].
- **BENCH.W.L-04** — Erro de concordância "Ainda não houveram outros pagamentos" em UI oficial (LAIS §10). Dim: 1. Paridade: [verificada]. Sinal baixo mas diagnóstico de maturidade editorial.
- **BENCH.W.L-05** — Quota anual em 112% (LAIS.M-01, "Solicitações via Lais Visita 6.705/6.000") sem UI de upgrade contextual visível. Dim: 1, 4. Paridade: [não-verificada].
- **BENCH.W.L-06** — Inconsistência "Exibindo 0 lead / Exibindo 1 de …" em LAIS.M-03 (regressão de paginação). Dim: 1. Paridade: [verificada via a11y].

## 5. Assimetrias Epistêmicas Puras (BENCH.E-###)

Itens que **parecem** diferenciais mas são apenas ausência de verificação. **Não contam como SWOT.**

- **BENCH.E-01** — Shape completo de LAIS.M-09 /configs (configuração do agente). Aimee tem `ai_agent_config/ai_directives/ai_modules/ai_behavior_config` + AI Lab. Lais tem *3 cards preview* (Pré-agendamento, Perguntas essenciais, Reengajamento) + conteúdo interno fora do a11y.
- **BENCH.E-02** — Profundidade de Campanhas: Aimee tem módulo com T-050..053; Lais tem botão "Programar Remarketing" (LAIS.F-017) sem shape visível.
- **BENCH.E-03** — Kill-switch IA: Aimee tem `is_ai_active` (AIMEE.A-04); Lais pode ter mecanismo equivalente invisível na UI.
- **BENCH.E-04** — DNC/opt-out: Aimee tem `/dnc` + filtro (AIMEE.M-23); Lais não observado mas deveria ter por LGPD.
- **BENCH.E-05** — Realtime + áudio live + TTS: Aimee verificada; Lais não observável (Bubble + conteúdo fora do a11y).
- **BENCH.E-06** — Multilingual espelhamento: Aimee verificada (PR-012); Lais idem.
- **BENCH.E-07** — Débito técnico catalogado: só a Aimee tem (por ser white-box). Isso **não é vantagem da Lais** — é assimetria por natureza.
- **BENCH.E-08** — Integração CRM: Aimee tem C2S + Vista nomeados, com espelho analytics; Lais tem coluna "CRM" abstrata e métricas "Enviado/Erro ao CRM" sem nome de CRM específico.
- **BENCH.E-09** — Observabilidade server-side: Aimee tem `ai_traces` + `conversation_analyses`; Lais tem Hotjar (LAIS.I-010) como analytics de *UI*, não de *agente*.
- **BENCH.E-10** — Painel superadmin cross-tenant (LAIS.X-001): Aimee tem `/admin/*` com 13 rotas; Lais presumido mas não observado.

## 6. Diferenciais Estruturais Verificados

### 6.1 Diferenciais da Aimee (BENCH.D.A-###)

Cada item: presença em AIMEE + ausência verificável em LAIS.

- **BENCH.D.A-01** — Acesso por roles individuais (super_admin/admin/operator/viewer) + vínculo a corretor (AIMEE.T-002, T-054). Ausência verificada em LAIS.M-11 (só código compartilhado). Dim: 4, 7.
- **BENCH.D.A-02** — Pipeline Kanban 7 colunas (AIMEE.R-01.06). Ausência verificada em LAIS.M-03 (tabela-only). Dim: 1.
- **BENCH.D.A-03** — Tickets / setor admin locação (AIMEE.T-060..064, R-01.20/21). Ausência verificada em LAIS.M-01..12. Dim: 1, 9.
- **BENCH.D.A-04** — AI Lab (simulador, prompts, triage, real-conversations, analysis — AIMEE.R-03.01..06). Ausência verificada na sidebar Lais. Dim: 5.
- **BENCH.D.A-05** — Multi-agente federado por `department` com 4 agentes paralelos (comercial/admin/remarketing/atualizacao). Ausência verificada comportamentalmente (Dossiê Helena §? — agente único). Dim: 3.
- **BENCH.D.A-06** — Espelho C2S em tempo real com delta-sync 1min (AIMEE.E-024). Ausência verificada em LAIS.M-03 (coluna "CRM" abstrata). Dim: 6, 9.
- **BENCH.D.A-07** — Stack custom (React+Vite+Supabase) vs. no-code Bubble. Verificada via LAIS.I-011. Dim: 8. *Observação:* é diferencial de manutenibilidade a longo prazo, mas penaliza velocidade de UI-tweak no curto prazo.

### 6.2 Diferenciais da Lais (BENCH.D.L-###)

- **BENCH.D.L-01** — **Captação**: IA detecta, em conversas com leads, imóveis de outras agências e notifica corretor (LAIS.M-08, F-025). Ausência verificada na Aimee (AIMEE §15 "Exclusivos Lais"). Dim: 2, 9. **Importante**: captação gera valor de negócio direto (novo imóvel no pipeline da imobiliária).
- **BENCH.D.L-02** — **Visitas**: módulo dedicado `/visits` + medidor de quota anual separado no dashboard (LAIS.M-04, F-019). Ausência verificada — Aimee tem pré-agendamento via tool mas sem rota/módulo. Dim: 1, 2.
- **BENCH.D.L-03** — **Billing vivo**: boleto + plano + histórico + quota (LAIS.M-10, F-027..F-029). Ausência verificada (AIMEE.Q-011 mock). Dim: 4, 7.
- **BENCH.D.L-04** — **Intercom embutido** em todas as rotas (LAIS.I-001). Ausência verificada na Aimee. Dim: 1 (suporte in-app).
- **BENCH.D.L-05** — **Funil granular "Status por canal"** (Enviado/Erro/Não pronto por 7 canais — LAIS.F-007). Ausência verificada (Aimee tem dashboard mas sem breakdown canal × status CRM).

## 7. Análise por Dimensão Estratégica

**Dim 1 — Experiência operador:** Aimee puxa por Kanban (BENCH.D.A-02), Tickets (D.A-03) e cockpit realtime+áudio (S.A-06). Lais puxa por Intercom (D.L-04), trilha de vídeos polida (S.L-05) e funil visual (S.L-04). **Empate tático, com Aimee ganhando em profundidade operacional e Lais em polimento editorial.**

**Dim 2 — Experiência do lead:** Convergente (BENCH.P-02). Captação (D.L-01) e Visitas (D.L-02) são lacunas da Aimee que afetam diretamente esta dimensão. [Para análise de tom/comportamento do agente, ver Dossiê Helena + Análise Comparativa Helena × Aimee — *escopo fora deste artefato*.]

**Dim 3 — Arquitetura de agente:** Aimee federada (D.A-05) vs. Lais unificada (inferido via Dossiê Helena). **Vantagem estrutural Aimee**, com contrapartida do drift Identity/Memory/Soul (W.A-01).

**Dim 4 — Governança e compliance:** Roles granulares (D.A-01) é vantagem Aimee. PII em traces (W.A-02) é fraqueza crítica Aimee. Lais: modelo de código compartilhado (W.L-01) é fraqueza. **Aimee ganha em estrutura de acesso, perde em LGPD.** Bloqueia enterprise até Q-008 resolvido.

**Dim 5 — Observabilidade:** Aimee com AI Lab (D.A-04) + ai_traces (S.A-05); Lais com Hotjar (E-09) focado em UI, não agente. **Vantagem clara Aimee.**

**Dim 6 — Integrações:** Aimee tem CRM nomeado (D.A-06) e delta-sync 1min. Lais abstrai integrações (E-08). **Vantagem Aimee para o cliente que já usa C2S/Vista; desvantagem se o cliente usa CRM X qualquer (Lais provavelmente escala pra mais CRMs porque abstrai).**

**Dim 7 — Multi-tenant:** Aimee com roles e RLS explícita. Lais com código compartilhado e agency-UUID em query string. **Vantagem Aimee.**

**Dim 8 — Manutenibilidade:** Custom React vs. Bubble (D.A-07 / W.L-02). Contradição: Aimee ganha em teto de longo prazo mas penaliza em velocidade de UI. Hotspots H-001/H-002 (1.3k/1.7k LOC) são o preço. **[Assimétrico por natureza — não mensurável para a Lais.]**

**Dim 9 — Modelo de dados:** 45 tabelas RLS-protegidas + embeddings de imóvel (AIMEE.E-016). Lais inobservável. Captação (D.L-01) é feature de dados não replicável trivialmente.

**Dim 10 — Postura de produto:** Aimee recua via kill-switch `is_ai_active` e DNC (BENCH.E-03, E-04). Lais: não observado.

## 8. Drift Arquitetural e Débito Técnico (lado Aimee)

Síntese assimétrica por natureza — débito equivalente na Lais não é observável, portanto esta seção é unilateral.

Prioridade por impacto combinado (churn + risco):

1. **🔴 AIMEE.Q-008 (LGPD/PII em traces)** — bloqueia enterprise.
2. **🔴 AIMEE.Q-003 (lead_qualification vazia)** — invalida cognição do agente.
3. **🔴 AIMEE.Q-001 (drift Identity/Memory/Soul)** — decisão de produto: refatora ou reescreve briefing.
4. **🟠 AIMEE.H-001/H-002 (orquestrador + tool-executors monolíticos)** — custo de evolução crescente.
5. **🟠 AIMEE.Q-011 (mocks de billing/metrics)** — bloqueia comercialização.
6. **🟡 AIMEE.Q-013 (JWT off em 43 functions)** — compensar com rate-limit.
7. **🟡 AIMEE.Q-004/Q-009 (código morto candidato)** — higiene.
8. **🟡 AIMEE.Q-010 (7 tabelas com 0 rows)** — slots não realizados.
9. **🟢 AIMEE.Q-002 (3 env vars Google AI redundantes)** — trivial.

Todas as entradas acima são **invisíveis na Lais** e não devem ser lidas como vantagem competitiva da Lais (protocolo §2).

## 9. Backlog Priorizado de Oportunidades (BENCH.O-###)

RICE: Reach (0-100% base de tenants afetada) × Impact (1-3) × Confidence (0-100%) / Effort (dias). Todas aterram numa camada AIMEE.A-##.

| ID | Oportunidade | Camada | Reach | Impact | Conf | Effort | RICE | Ref Análise Comp. | Justificativa ancorada |
|---|---|---|---|---|---|---|---|---|---|
| BENCH.O-01 | Módulo Visitas (rota + schema + agendamento + fluxo pré-cutover) | A-05 (orquestração) + A-03 (prompt tool) + nova T-### | 100% | 3 | 80% | 10 | **24.0** | **novo** (não observado em AC) | BENCH.D.L-02 verificado + deadline 07/05 exige capacidade mínima de agendamento |
| BENCH.O-02 | Módulo Captação (sub-tipo de `/notifications` na Aimee; detecção em tool-use) | A-03 (novo agente ou sub-módulo) + A-05 | 100% | 3 | 60% | 15 | **12.0** | **novo** | BENCH.D.L-01 verificado; feature geradora de receita (novo imóvel) |
| BENCH.O-03 | Mascaramento de PII em `ai_traces` + backfill | A-04 (governance) + A-02 (memory) | 100% | 3 | 90% | 5 | **54.0** | **novo** | BENCH.W.A-02 (Q-008) — crítico LGPD |
| BENCH.O-04 | Persistência real de `lead_qualification` (ligar trace → DB) | A-02 (memory) | 100% | 3 | 80% | 3 | **80.0** | reforço (ver Sprint 3 bug #0 na memória) | BENCH.W.A-03 (Q-003) |
| BENCH.O-05 | Billing real (Stripe ou gateway BR) + desmock `/financeiro` e `/admin/billing/metrics` | nova camada (fora de A-##); tangencia A-04 | 100% | 3 | 70% | 25 | **8.4** | reforço (memória MVP) | BENCH.D.L-03 verificado + bloqueia comercialização |
| BENCH.O-06 | Rate-limit + validação de origem em edge functions (compensar JWT off) | A-04 | 100% | 2 | 90% | 4 | **45.0** | **novo** | BENCH.W.A-08 (Q-013) |
| BENCH.O-07 | Extrair context-loader, trace-writer e tool-dispatch do `ai-agent/index.ts` | A-05 | 100% | 2 | 80% | 8 | **20.0** | **novo** | BENCH.W.A-04 (H-001) — velocidade futura |
| BENCH.O-08 | Decidir: refatorar p/ camadas Identity/Memory/Soul OU reescrever briefing arquitetural p/ refletir "orchestrator + 4 domain agents" | A-03 + A-02 + A-04 (ou todas) | 100% | 2 | 50% | ? (depende da decisão) | — | **novo** | BENCH.W.A-01 (Q-001) |
| BENCH.O-09 | Memory unificada (abstração por agente com TTL + sumarização + embedding de conversa — hoje só imóveis) | A-02 | 100% | 2 | 60% | 20 | **6.0** | **novo** | BENCH.W.A-03 + Q-006 + gap vs. agente maduro |
| BENCH.O-10 | Breakdown "Status por canal" (Enviado ao CRM / Erro / Não pronto) no dashboard | A-05 + UI | 70% | 1 | 90% | 3 | **21.0** | **novo** | BENCH.D.L-05 — paridade de diagnóstico |
| BENCH.O-11 | Suporte in-app (Intercom ou equivalente — não precisa ser Intercom) | UI + nova integração I-### | 100% | 1 | 85% | 4 | **21.3** | **novo** | BENCH.D.L-04 — friction de suporte |
| BENCH.O-12 | Testes em `prompts.ts` e `qualification.ts` (core cognitivo) | A-03 + A-02 | 100% | 2 | 85% | 6 | **28.3** | **novo** | BENCH.W.A-09 |
| BENCH.O-13 | Carousel de destaques/changelog do produto no dashboard do tenant | UI | 100% | 1 | 90% | 2 | **45.0** | **novo** | BENCH.S.L-06 — canal Greattings↔cliente, baixíssimo esforço |
| BENCH.O-14 | Desligar `MULTI_AGENT_ENABLED` flag e deletar `buildLegacy*Prompt` | A-03 | 100% | 1 | 95% | 1 | **95.0** | **novo** | BENCH.W.A-10 (Q-004) — higiene |

**Top 5 por RICE:** O-14, O-04, O-03, O-06/O-13, O-12. **Top 5 por impacto estratégico:** O-03 (LGPD), O-05 (billing), O-01 (Visitas — deadline), O-04 (qualification), O-02 (Captação — receita).

## 10. Riscos Estratégicos (BENCH.R-###)

- **BENCH.R-01 — PII em `ai_traces` sem máscara (LGPD).** Origem: BENCH.W.A-02 / AIMEE.Q-008. Probabilidade: 100% (já ocorreu/ocorre). Impacto: crítico (multa + bloqueio de enterprise). Mitigação: BENCH.O-03. Dono: A-04 (Governance).
- **BENCH.R-02 — Drift arquitetural que contamina decisões de roadmap.** Origem: BENCH.W.A-01 / AIMEE.Q-001. Se o time planeja sobre "Identity/Memory/Soul" mas o código não tem, todo sprint com contrato de camada é ficção. Prob: alta. Impacto: alto (retrabalho). Mitigação: BENCH.O-08 (decidir lado). Dono: A-03 + A-02 + A-04 (produto).
- **BENCH.R-03 — Hotspots H-001/H-002 acumulando churn.** 61 + 53 commits em 3 meses em dois arquivos. Prob: conflito de merge e regressão crescentes. Impacto: alto (velocidade). Mitigação: BENCH.O-07. Dono: A-05.
- **BENCH.R-04 — 43 edge functions com JWT off.** Prob: escaneamento público com fuzzing. Impacto: alto (dados cross-tenant). Mitigação: BENCH.O-06. Dono: A-04.
- **BENCH.R-05 — Cutover 07/05 sem módulo Visitas.** Canal Pro ZAP pode incluir eventos de agendamento; Aimee sem rota dedicada vira falha operacional visível. Prob: média. Impacto: alto (credibilidade na Smolka). Mitigação: BENCH.O-01. Dono: A-05.
- **BENCH.R-06 — Gap de captação afeta narrativa comercial.** A Lais tem uma história de ROI via captação (novos imóveis) que a Aimee não consegue contar. Prob: alta (narrativa competitiva). Impacto: médio (venda). Mitigação: BENCH.O-02. Dono: produto.

## 11. Rejeições Deliberadas

Padrões da Lais que a Aimee **não deve** adotar:

- **Modelo de acesso por código compartilhado** (LAIS.M-11). *Justificativa:* fere A-04 (governança) e A-07 (multi-tenant com trilha de auditoria por usuário). Aimee já tem BENCH.D.A-01.
- **Plataforma no-code como runtime de UI** (LAIS.I-011 Bubble). *Justificativa:* teto de manutenibilidade e observabilidade (LAIS.X-002 evidencia o custo: conteúdo inobservável em 5+ rotas). A arquitetura Identity/Memory/Soul (mesmo em sua forma aspiracional) exige controle total do runtime.
- **Configuração do agente como cards soltos em `/configs` sem contrato explícito** (LAIS.M-09 + deep-links do dashboard). *Justificativa:* Aimee já tem `ai_directives/ai_modules/ai_behavior_config` como contrato — aprofundar isso, não regredir para UX de cards.
- **Funil de 3 níveis hardcoded (Topo/Atendimento/CRM)** (LAIS.F-005). *Justificativa:* Aimee tem Pipeline Kanban configurável (BENCH.D.A-02); não regredir para funil linear.
- *(Aspectos de comportamento de agente — tom, anamnese, resposta — ver §10 da Análise Comparativa Helena × Aimee; fora de escopo deste artefato.)*

## 12. Próximos Passos Epistêmicos

Para reduzir a assimetria declarada em §2:

- **Screenshots autorizados** da Lais (computer-use ou toolset com PNG) para recuperar conteúdo Bubble fora do a11y (LAIS.X-002). Prioridade: LAIS.M-02, M-04, M-08, M-09.
- **DOM-scraping com `getComputedStyle/getBoundingClientRect`** em Bubble para remontar shape dos módulos cegos (LAIS §10 já sugere).
- **Observar mudanças visuais da Lais ao longo do tempo** (changelog editorial no carousel LAIS.F-003, rotação de badges NOVO) como proxy de velocidade de evolução.
- **Tentar acessar tenant de teste em outra imobiliária** para comparar estados populados (Smolka tem várias telas vazias).
- **Localizar e linkar fisicamente** Dossiê Helena e Análise Comparativa no repo (`docs/` ou memory) para tornar a biblioteca técnica auto-contida.
- **Medir latência e taxa de erro** em conversas reais Aimee (`ai_traces` já permite) e buscar amostras Lais via conversas observadas pelo cliente Smolka.
- **Pedir acesso temporário ao código da Lais** via partnership ou NDA (baixa probabilidade dado competição, mas registrado).

## 13. Postura Estratégica Recomendada

Diferenciar em **governança** (roles, DNC, kill-switch, LGPD pós-O-03), **operação multi-agente** (A-05 federado + tickets + Kanban) e **observabilidade** (AI Lab + ai_traces maskados). Parear em **Visitas** (O-01, inadiável pelo cutover 07/05) e **Captação** (O-02, narrativa comercial). Rejeitar o **modelo de acesso por código**, a **UI no-code como runtime** e o **funil linear**. A tese competitiva é *"Aimee é uma Lais com chão estrutural — multi-agente verdadeiro, governança de primeira classe, CRM espelhado, multi-tenant com roles"* — mas essa tese só se sustenta publicamente depois que O-03 (PII), O-04 (qualification) e O-05 (billing) estiverem fechados. Antes disso, o chão é concreto pintado.

---

## Apêndice A — Índice de IDs BENCH

**Paridade (§3):** P-01..P-07.
**Forças Aimee (§4.1):** S.A-01..S.A-08.
**Forças Lais (§4.2):** S.L-01..S.L-06.
**Fraquezas Aimee (§4.3):** W.A-01..W.A-10.
**Fraquezas Lais (§4.4):** W.L-01..W.L-06.
**Assimetrias (§5):** E-01..E-10.
**Diferenciais Aimee (§6.1):** D.A-01..D.A-07.
**Diferenciais Lais (§6.2):** D.L-01..D.L-05.
**Oportunidades (§9):** O-01..O-14.
**Riscos (§10):** R-01..R-06.

## Apêndice B — Mapa de Referências Cruzadas

| BENCH | → LAIS.v1.0 | → AIMEE.v1.0 | → Dossiê Helena | → Análise Comparativa |
|---|---|---|---|---|
| S.A-01 | — | A-05, M-03 | referenciar §? (agente único) | referenciar §? |
| S.A-02 | M-11, P-002 | T-002, T-054, P-001..004 | — | — |
| S.A-03 | — | R-03.01..06 | — | — |
| S.A-05 | — | T-026, D-060 | — | — |
| S.A-07 | — | E-024, T-056 | — | — |
| S.L-01 | M-04, F-019, M-01 KPI | — | — | — |
| S.L-02 | M-08, F-025 | — | — | — |
| S.L-03 | M-10, F-027..F-029 | R-01.19 (mock), Q-011 | — | — |
| W.A-01 | — | Q-001, A-01..A-04 | — | referenciar §? (se discute arquitetura) |
| W.A-02 | — | Q-008, T-026 | — | — |
| W.A-03 | — | Q-003, T-020 | — | reforço sprint 3 (bug #0) |
| W.A-05 | M-10 | Q-011, R-01.19 | — | — |
| W.A-06 | M-04 | §15 exclusivos Lais | — | — |
| W.A-07 | M-08 | §15 exclusivos Lais | — | — |
| W.L-01 | M-11, P-002 | — | — | — |
| W.L-02 | I-011, X-002 | — | — | — |
| D.A-01 | M-11 | T-002, P-001..004 | — | — |
| D.A-02 | M-03 | R-01.06 | — | — |
| D.A-03 | — | T-060..064 | — | — |
| D.A-04 | — | R-03.* | — | — |
| D.A-05 | — | A-05, M-07..M-10 | §? (agente único) | §? |
| D.A-06 | M-03 col. CRM | E-024, R-01.11 | — | — |
| D.L-01 | M-08, F-025 | §15 | — | — |
| D.L-02 | M-04 | §15 | — | — |
| D.L-03 | M-10 | Q-011 | — | — |
| D.L-04 | I-001 | — | — | — |
| D.L-05 | F-007 | — | — | — |
| O-01 | M-04 | (novo módulo) | — | verificar não-duplicação |
| O-02 | M-08 | (novo módulo) | — | verificar não-duplicação |
| O-03 | — | Q-008 | — | — |
| O-04 | — | Q-003, T-020 | — | reforço (bug #0) |
| O-05 | M-10 | Q-011 | — | memória MVP |
| O-13 | F-003 | UI nova | — | — |

## Apêndice C — Tabela de Paridade Não-Verificada

Consolidação para investigação futura (compor com §12):

| Item | Lado verificado | Lado não-verificado | Próxima ação |
|---|---|---|---|
| Kill-switch IA | Aimee (AIMEE.A-04) | Lais | observar operador "assumir" em LAIS.M-02 |
| DNC/opt-out | Aimee (/dnc) | Lais | procurar UI de block list |
| Realtime/áudio/TTS | Aimee | Lais | entrar em /chats com evento de áudio |
| Multilingual | Aimee (PR-012) | Lais | testar mensagem em outro idioma |
| Shape de /configs | — | ambos (Lais por Bubble, Aimee documentado) | screenshots Lais; dump ai_agent_config Aimee |
| Campanhas em massa | Aimee (T-050..053) | Lais | clicar "Programar Remarketing" em LAIS.M-03 |
| Débito técnico | Aimee (Q-###) | Lais | indiretos (changelog, status page) |
| CRM nomeado | Aimee (C2S, Vista) | Lais (coluna genérica) | observar config de CRM em LAIS.M-09 |
| Painel superadmin | Aimee (/admin/*) | Lais (LAIS.X-001) | tentar rotas `/admin`, `/god` no domínio Lais |
| Observabilidade agente | Aimee (ai_traces) | Lais | via parceria ou inferência |
| Relatório v1 deprecada | Lais (LAIS.X-005) | Aimee (n/a) | acessar `/relatorio` em casa.lais.ai |
| Quota excedida 112% | Lais (LAIS.M-01) | Aimee (sem billing) | depende de O-05 |
| Intercom | Lais (I-001) | Aimee (ausente) | decisão de produto O-11 |
| Erro "houveram" | Lais (LAIS §10) | Aimee (n/a) | sinal baixo; útil como indicador |

---
*Fim do artefato v1.0. Próxima síntese (v1.1) deve ser gerada após BENCH.O-01/O-03/O-04 entregues e após localização física de Dossiê Helena + Análise Comparativa no repo.*
