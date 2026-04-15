# Sprint 5 — SDR Comercial + Canal Pro ZAP

**Criado**: 2026-04-14
**Deadline crítico**: 2026-05-07 (ZAP Canal Pro cutover — substituição da Lais)
**Janela total**: ~30 dias
**Posicionamento**: Aimee como PRODUTO competidor da Lais/Maya — nada pode ser hardcoded pra Smolka.

---

## Objetivos

1. **Substituir a Lais na Smolka** até 07/05 recebendo leads nativos do ZAP Canal Pro
2. **Lançar o módulo SDR comercial 24/7** (leads novos de venda/locação, distinto do remarketing)
3. **Integrar painel Aimee ↔ escala de plantão C2S** (corretor só vê seus leads)
4. **Disparar campanha remarketing de 3.500 leads** (venda primeiro) imediatamente

---

## Épicos

### E1 — Canal Pro ZAP (HARD deadline 2026-05-07)

**Por quê**: Smolka vai reconfigurar no dia 07/05. Depois disso, se estiver quebrado, nenhum lead novo chega.

| # | Task | Arquivo | Estimativa |
|---|---|---|---|
| E1.1 | Ajustar `portal-leads-webhook` pro payload nativo ZAP (Casio API: `advertiserId`, `contact`, `externalId`, `message`, `origin`, `transactionType`) | `supabase/functions/portal-leads-webhook/index.ts` | 1d |
| E1.2 | Autenticação do endpoint (HMAC ou token shared secret no header) | idem + secret no Supabase | 0,5d |
| E1.3 | Match `externalId` → `properties.external_id` (Vista) + anexar ficha no greeting | `portal-leads-webhook` + query `properties` | 0,5d |
| E1.4 | Diferenciar event type: `form_submit` vs `phone_click` (campo `origin`/`transactionType`) → trilhas distintas | `portal_leads_log.event_type` (nova coluna) | 0,5d |
| E1.5 | Multi-fonte (ZAP, VivaReal, OLX) — cada portal com mapper próprio em `_shared/portals/` | novo diretório | 1d |
| E1.6 | UI admin: listar leads do portal com fonte, status, conversão | `src/pages/admin/` ou aba nova | 1,5d |
| E1.7 | Testes end-to-end com payload real do ZAP (sandbox/cURL) | — | 0,5d |

**Gate**: funcionamento validado com payload real do ZAP até **2026-05-02** (5 dias de buffer).

---

### E2 — Busca de imóveis (lógica +30% + expansão geográfica)

**Por quê**: Transcrição deixa claro — cliente pede 1M, nunca mandar 700k (subestima) nem 2,5M (fora). Bairro é flexível, preço é rígido.

| # | Task | Arquivo |
|---|---|---|
| E2.1 | Ampliar filtro de preço de `budget * 1.15` → **range [budget, budget * 1.30]** | `_shared/agents/tool-executors.ts`, `comercial.ts` |
| E2.2 | Segunda passada automática `[budget * 1.30, budget * 1.60]` com aviso "um pouquinho acima do orçamento" | `tool-executors.ts` |
| E2.3 | Camadas geográficas: bairro pedido → vizinhos → região → Grande Floripa | nova função `expandNeighborhoods()` |
| E2.4 | Integração Google Maps API (centroid de bairros + distância) — Ian confirmou chave disponível | `_shared/maps.ts` (novo) |
| E2.5 | Prompt de consultoria: quando manda fora do bairro, justifica vantagens (distância ao centro, estrutura, praias) | `comercial.ts` system prompt |
| E2.6 | Regra dura: NUNCA mandar `price < budget * 0.85` | `tool-executors.ts` |

---

### E3 — SDR Comercial 24/7 (novo módulo)

**Por quê**: Leads novos de venda/locação têm fluxo diferente do remarketing. Prioridade: fora do horário do bolsão C2S (21h–8h).

| # | Task | Arquivo |
|---|---|---|
| E3.1 | Criar módulo `sdr-comercial.ts` em `_shared/agents/` — gêmeo de `remarketing.ts` mas para leads frios de portal | novo |
| E3.2 | `resolveActiveModule` reconhece `channel_source IN ('zap', 'vivareal', 'portal_*')` → roteia para `sdr-comercial` | `ai-agent/index.ts` |
| E3.3 | Handoff C2S: Aimee cria lead no C2S → recebe `corretor_id` → vincula em `conversations.assigned_broker_id` | `c2s-create-lead` + `tool-executors.ts` |
| E3.4 | Prompt de primeira mensagem (lead de portal com link): "quer visitar agora ou agendar?" | `sdr-comercial.ts` |
| E3.5 | Follow-up automático: se cliente não responder em X min → enviar 2 opções similares | `follow-up-check` cron |
| E3.6 | **Fallback mínimo** (se SDR completo não ficar pronto): template simples "Recebi, amanhã o corretor entra em contato" + roteamento para C2S | `sdr-fallback.ts` |

---

### E4 — Painel ↔ escala C2S (RLS por corretor)

**Por quê**: Corretor só pode ver SEUS leads (não os dos colegas). Botão "pausar IA" per-conversa.

| # | Task | Arquivo |
|---|---|---|
| E4.1 | Coluna `conversations.assigned_broker_id` (uuid → `profiles.id`) | migration |
| E4.2 | RLS policy: corretor (role=operator) só lê conversations onde `assigned_broker_id = auth.uid()` OU `tenant_admin` | migration |
| E4.3 | Sync `c2s_broker_id` ↔ `profiles.c2s_user_id` (backfill manual no painel admin) | `src/components/admin/` |
| E4.4 | Botão "pausar IA" na conversa (já existe?) validar que respeita per-corretor | `src/pages/Chat.tsx` |
| E4.5 | Template WhatsApp "corretor, atenda o fulano" + SLA 2h | `send-wa-template` + cron |
| E4.6 | Escalation: se corretor não ler em 2h → alerta gerente OU reatribui próximo na fila | novo cron/trigger |

---

### E5 — Pré-agendamento de visita (3 opções)

**Por quê**: Erro conhecido da Lais — confirma horário sem checar proprietário/chave. Cliente vai no imóvel fechado.

| # | Task | Arquivo |
|---|---|---|
| E5.1 | Prompt: "me dê 3 sugestões de data/hora, vou verificar disponibilidade e o corretor confirma qual" | `comercial.ts` / `sdr-comercial.ts` |
| E5.2 | Tool `request_visit_slots` (grava 3 opções em `visit_requests` e notifica corretor) | `tool-executors.ts` + nova tabela |
| E5.3 | UI corretor: ver pedidos pendentes + confirmar slot | painel |

---

### E6 — Disparo remarketing 3.500 leads (ação imediata)

**Por quê**: Lista já pronta (Sprint 4). Botão "executar".

| # | Task |
|---|---|
| E6.1 | Filtrar lista em vendas apenas (subset dos 3.500) |
| E6.2 | Validar limites Meta (templates por dia, qualidade da conta) |
| E6.3 | Disparar em lotes de ~500/dia via `dispatch-campaign` |
| E6.4 | Monitorar taxa de resposta + opt-out + qualidade |

---

## Cronograma (4 semanas)

| Semana | Foco | Gate |
|---|---|---|
| **1** (14-20/04) | E1.1–E1.5 (ZAP webhook), E2.1–E2.2 (preço +30%), E6 (disparo remarketing) | ZAP recebe payload de teste OK |
| **2** (21-27/04) | E1.6–E1.7 (UI + e2e), E2.3–E2.6 (expansão geo), E4.1–E4.3 (RLS corretor) | Busca com expansão funcionando no AI Lab |
| **3** (28/04-04/05) | E3.1–E3.4 (SDR core), E5 (pré-agendamento), E4.4–E4.6 (painel) | SDR atende lead ZAP end-to-end em staging |
| **4** (05-11/05) | **07/05: CUTOVER ZAP**, E3.5–E3.6 (follow-up + fallback), bugfixes | Smolka operando full em produção |

**Buffer**: toda a semana 4 é ajuste fino + incidentes do cutover. Não aceitar novas features aqui.

---

## Riscos

1. **Payload ZAP indocumentado**: se o formato exato não estiver claro até 20/04, pedir sandbox ao contato na Smolka — bloqueia E1 inteiro.
2. **Google Maps API custo**: cache agressivo de centroides de bairros (não consultar em cada busca).
3. **3.500 disparos + Meta rate limit**: hoje a conta corporativa suporta quanto por dia? Validar antes de E6.3.
4. **RLS quebrando painel atual**: rodar RLS nova em staging, testar todos os roles (admin, operator, viewer, super_admin).
5. **Cutover ZAP 07/05 falha**: ter plano B — manter Lais recebendo em paralelo por 48h se possível.

---

## Não-escopo (explícito — "banquete" pós-30 dias)

- Consultoria completa com comparativos de bairro (vantagens de Coqueiros vs Agronômica)
- Multi-canal: ligação automática + e-mail
- Voice call com ElevenLabs
- Dashboard de conversão ZAP vs VivaReal vs OLX
- SDR para leads que chegam direto pelo WhatsApp (sem portal)

---

## Princípios

- **Multi-tenant sempre**: cada feature precisa funcionar para tenants além da Smolka
- **Config por imobiliária**: bairros/região, templates, horário de plantão, SLA — tudo em `tenant_config` ou tabela correlata
- **Inspiração Lais, mas melhor**: match exato de imóvel é inegociável (zero tolerância a imóvel errado)
- **Deploy**: `--no-verify-jwt` em todas as functions, commits PT-BR `{Categoria}_{Sessão}`, auto-push
