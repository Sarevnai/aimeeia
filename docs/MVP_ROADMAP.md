# Aimee.IA — Roadmap MVP

**Produto:** Plataforma SaaS de Atendimento Inteligente para Imobiliárias
**Última atualização:** 2026-03-10
**Status geral:** Em desenvolvimento

---

## Visão do Produto

A Aimee.IA é uma plataforma multi-tenant que combina IA conversacional com CRM imobiliário, automatizando o atendimento via WhatsApp — desde a triagem inicial até a qualificação de leads e busca de imóveis.

**Proposta de valor:** Substituir ferramentas genéricas (Octadesk, Zendesk) por uma solução especializada no mercado imobiliário brasileiro, com custo inferior e IA treinada para o setor.

---

## Definição do MVP

O MVP contempla as funcionalidades mínimas para que uma imobiliária possa:

1. Conectar seu WhatsApp Business
2. Ter a IA atendendo automaticamente
3. Operadores assumirem conversas quando necessário
4. Gerenciar leads no pipeline
5. Acompanhar métricas básicas

---

## Fases do MVP

### FASE 1 — Fundação (Concluída)
> Infraestrutura core, autenticação e estrutura do banco

| Item | Status | Detalhes |
|------|--------|----------|
| Setup Supabase (PostgreSQL + Auth + Storage) | **Concluído** | Multi-tenant com RLS |
| Autenticação email/senha | **Concluído** | Supabase Auth + JWT |
| Estrutura de tenants | **Concluído** | Tabela `tenants` com config WhatsApp/CRM |
| Perfis e roles (super_admin/admin/operator/viewer) | **Concluído** | Tabela `profiles` com RLS |
| Design system base (shadcn/ui + Tailwind) | **Concluído** | Nota UX 9.5/10 |
| Layout responsivo (Sidebar + Header + Mobile Nav) | **Concluído** | AppLayout, AppSidebar, MobileBottomNav |
| Skeleton loading + Empty states | **Concluído** | Componentes reutilizáveis |

### FASE 2 — Motor de IA e WhatsApp (Concluída)
> Integração WhatsApp + IA conversacional

| Item | Status | Detalhes |
|------|--------|----------|
| Webhook WhatsApp (receber mensagens) | **Concluído** | Edge Function `whatsapp-webhook` |
| Envio de mensagens (texto, mídia, templates) | **Concluído** | Edge Functions `send-wa-message`, `send-wa-media`, `send-wa-template` |
| AI Agent (triagem em 4 estágios) | **Concluído** | FSM: saudação → nome → departamento → completado |
| Qualificação de leads (bairro, tipo, quartos, orçamento) | **Concluído** | Extração regex + score 0-100 |
| Busca de imóveis via Vista/JetiMob | **Concluído** | Edge Functions `vista-search-properties`, `vista-get-property` |
| Anti-loop (evitar perguntas repetitivas) | **Concluído** | `anti-loop.ts` shared module |
| Handoff IA → operador (manual) | **Concluído** | Toggle `is_ai_active` na UI |
| Devolver para IA | **Concluído** | Botão na interface do chat |
| Config de comportamento da IA por tenant | **Concluído** | Tabela `ai_agent_config` |

### FASE 3 — Interface Operacional (Concluída)
> Telas para operação diária

| Item | Status | Detalhes |
|------|--------|----------|
| Inbox (lista de conversas com filtros) | **Concluído** | Filtro por departamento, busca, "Todos/Meus" |
| Chat (interface completa de conversa) | **Concluído** | Histórico, sidebar de qualificação, upload de mídia |
| Leads (tabela com paginação e filtros) | **Concluído** | Exportação, ações em lote |
| Pipeline Kanban (drag-and-drop) | **Concluído** | Stages customizáveis por departamento via @dnd-kit |
| Dashboard (métricas e KPIs) | **Concluído** | Funil, distribuição por canal, tendências |
| Relatórios | **Concluído** | Conversão de leads, tendências por bairro, scores |

### FASE 4 — Módulos Complementares (Concluída)
> Features adicionais para operação completa

| Item | Status | Detalhes |
|------|--------|----------|
| Tickets/Chamados (módulo admin) | **Concluído** | Kanban + categorias + SLA |
| Campanhas WhatsApp (envio em massa) | **Concluído** | Templates, status tracking |
| Empreendimentos (CRUD de imóveis) | **Concluído** | Upload de imagens, status |
| Templates WhatsApp (gestão) | **Concluído** | CRUD via Edge Function |
| Painel Admin (super_admin) | **Concluído** | Tenants, billing, métricas |

### FASE 5 — Gaps Críticos para Go-to-Market (Em andamento)
> Funcionalidades essenciais para competir com Octadesk e fechar os primeiros clientes

| Item | Status | Prioridade | Sprint |
|------|--------|-----------|--------|
| Sistema de presença de operadores | **Pendente** | Crítica | Sprint 1 |
| Roleta automática (round-robin) | **Pendente** | Crítica | Sprint 2 |
| Handoff automático bot → humano | **Pendente** | Crítica | Sprint 2 |
| Grupos de atendimento (substituir enum) | **Pendente** | Crítica | Sprint 1 |
| Fila de conversas `withoutResponsible` | **Pendente** | Crítica | Sprint 2 |
| Limite de carga por operador | **Pendente** | Alta | Sprint 2 |
| Contadores na inbox (SLA/fila/ativo) | **Pendente** | Alta | Sprint 3 |
| Notificações (conversa atribuída) | **Pendente** | Alta | Sprint 3 |
| Página "Minha Aimee" (backend wiring) | **Pendente** | Média | Sprint 3 |
| Configurações de atendimento (toggles) | **Pendente** | Média | Sprint 4 |
| SLA em conversas (primeira resposta) | **Pendente** | Média | Sprint 4 |
| Auto-close por inatividade | **Pendente** | Baixa | Sprint 4 |

### FASE 6 — Polish e Lançamento (Futuro)
> Refinamentos para o lançamento oficial

| Item | Status | Prioridade |
|------|--------|-----------|
| Onboarding tour para novos usuários | **Pendente** | Alta |
| Página financeira funcional | **Pendente** | Alta |
| Página de acessos/permissões funcional | **Pendente** | Alta |
| Email de notificação (convites, alertas) | **Pendente** | Média |
| Tooltips na sidebar colapsada | **Pendente** | Baixa |
| Atalhos de teclado | **Pendente** | Baixa |
| Documentação do usuário (Guia) | **Pendente** | Média |
| Testes automatizados (cobertura >70%) | **Pendente** | Alta |

---

## Sprints Detalhados (Fase 5)

### Sprint 1 — Fundação de Presença e Grupos (2 semanas)

**Objetivo:** Criar a base para roteamento inteligente de conversas.

**Entregas:**
1. Migration: `presence_status` + `max_concurrent_conversations` em `profiles`
2. Migration: Tabelas `groups`, `group_members`, `group_phone_rules`
3. Edge Function: `update-presence` (JWT auth)
4. UI: Seletor de status no AppHeader (Disponível/Ausente/Offline)
5. UI: Página `/configuracoes/grupos` (CRUD básico)
6. Migration: Migrar `department_code` → `group_id` (mantendo backward-compat)
7. Supabase Realtime Presence: Canal por tenant

**Critérios de aceite:**
- Operador pode mudar seu status na UI
- Admin pode criar/editar/desativar grupos
- Presença é rastreada em tempo real
- Dados migrados sem perda

---

### Sprint 2 — Routing Engine (3 semanas)

**Objetivo:** Distribuição automática de conversas para operadores disponíveis.

**Entregas:**
1. Migration: Tabela `conversation_queue`
2. View SQL: `inbox_counters` (withoutResponsible, chatbot, timeExceeded)
3. Edge Function: `route-conversation` (algoritmo completo)
4. Modificar `whatsapp-webhook` → invocar `route-conversation` após triagem
5. Modificar `ai-agent` → checar disponibilidade antes de handoff
6. Realtime: Canal por operador para `conversation_assigned`
7. Sticky routing (responsável automático por contato)

**Critérios de aceite:**
- Conversa é atribuída automaticamente ao operador menos carregado
- Operadores offline não recebem conversas
- Operadores no limite não recebem mais conversas
- Conversas sem operador disponível entram na fila
- IA continua atendendo enquanto aguarda operador

---

### Sprint 3 — UI Gerencial e Notificações (2 semanas)

**Objetivo:** Visibilidade da fila e notificações em tempo real.

**Entregas:**
1. Sidebar: Badges com contadores por tipo (SLA/fila/ativo)
2. Página `/inbox/fila`: Dashboard de operadores + fila de espera
3. Botão "Forçar atribuição" para admins
4. Toast notification ao receber conversa (sonora + visual)
5. Wiring completo da página "Minha Aimee"

**Critérios de aceite:**
- Admin vê fila de espera com tempo de cada conversa
- Admin vê carga de cada operador em tempo real
- Operador recebe toast + som ao receber conversa
- Badges no sidebar atualizam em tempo real

---

### Sprint 4 — Preferências e Refinamentos (2 semanas)

**Objetivo:** Configurações avançadas e polimento.

**Entregas:**
1. Migration: Novos campos em `ai_agent_config`
2. UI: `/configuracoes/preferencias-atendimento` (toggles)
3. SLA de primeira resposta em conversas
4. Scheduler: `pg_cron` para alertas de SLA breach
5. Auto-close por inatividade do contato
6. Página financeira funcional

**Critérios de aceite:**
- Admin pode configurar roleta, limites, SLA por tenant
- SLA breach gera alerta no dashboard
- Conversas inativas são fechadas automaticamente (configurável)

---

## Stack Tecnológica

| Camada | Tecnologia |
|--------|-----------|
| Frontend | React 18 + TypeScript + Vite |
| UI | shadcn/ui + Tailwind CSS |
| State | React Context + React Query v5 |
| Backend | Supabase Edge Functions (Deno) |
| Database | PostgreSQL (Supabase) + pgvector |
| Auth | Supabase Auth (JWT) |
| Real-time | Supabase Realtime (channels + presence) |
| Storage | Supabase Storage (S3-compatible) |
| AI | OpenAI (via OpenRouter) |
| WhatsApp | Meta Cloud API |
| CRM | Vista Landscape + JetiMob + C2S |

---

## Métricas de Sucesso do MVP

| KPI | Meta | Como medir |
|-----|------|-----------|
| Tempo de atribuição (triagem → operador) | < 30s | `conversation_queue.assigned_at - queued_at` |
| % de atribuição automática | > 90% | `COUNT(status='assigned') / total` |
| SLA breach (> 5min sem resposta) | < 5% | `inbox_counters.time_exceeded` |
| Distribuição de carga | < 20% desvio | Desvio padrão de conversas por operador |
| Score de qualificação médio | > 40 | Média de `lead_qualification.score` |
| Uptime da plataforma | > 99.5% | Monitoramento Supabase |
| NPS dos operadores | > 7 | Pesquisa mensal |

---

## Planos e Precificação

| Plano | Preço/mês | Inclui |
|-------|----------|--------|
| Starter | R$ 297 | IA básica, 1 WhatsApp, 3 operadores |
| Pro | R$ 597 | IA avançada, campanhas, pipeline, 10 operadores |
| Enterprise | R$ 997 | Tudo + API, SLA custom, operadores ilimitados |

---

## Riscos e Mitigações

| Risco | Impacto | Mitigação |
|-------|---------|----------|
| Integração Vista instável | Alto | Fila XML com retry + fallback manual |
| Volume alto de mensagens | Médio | Edge Functions serverless escalam auto |
| WhatsApp API rate limits | Médio | Queue com backoff exponencial |
| Concorrência com Octadesk | Alto | Foco no diferencial imobiliário |
| Churn de operadores | Médio | UX polida + onboarding guiado |

---

*Documento vivo — atualizar a cada sprint review.*
