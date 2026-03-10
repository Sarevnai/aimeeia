# Aimee.IA — Sprint Board

**Última atualização:** 2026-03-10

---

## Sprint Atual: Pré-Sprint 1 (Planejamento)

**Início previsto:** A definir
**Duração:** 2 semanas

---

## Sprint 1 — Fundação de Presença e Grupos

**Objetivo:** Criar a base para roteamento inteligente de conversas.
**Duração:** 2 semanas
**Status:** Planejado

### Backlog

| # | Task | Tipo | Responsável | Status | Notas |
|---|------|------|------------|--------|-------|
| 1.1 | Migration: tipo `operator_presence` + campos em `profiles` | Backend | — | A Fazer | `presence_status`, `presence_updated_at`, `max_concurrent_conversations` |
| 1.2 | Migration: tabela `groups` com campos de permissão | Backend | — | A Fazer | Mapeamento direto do Octadesk |
| 1.3 | Migration: tabela `group_members` | Backend | — | A Fazer | Membros + supervisores |
| 1.4 | Migration: tabela `group_phone_rules` | Backend | — | A Fazer | Restrição por número |
| 1.5 | Migration: migrar dados `department_code` → grupos padrão | Backend | — | A Fazer | Vendas, Locação, Administrativo |
| 1.6 | Edge Function: `update-presence` | Backend | — | A Fazer | POST com JWT auth |
| 1.7 | Supabase Realtime Presence por tenant | Backend | — | A Fazer | Canal `presence:{tenantId}` |
| 1.8 | UI: Seletor de status no AppHeader | Frontend | — | A Fazer | Dropdown: Disponível/Ausente/Offline |
| 1.9 | UI: Heartbeat (30s) + auto-offline (90s timeout) | Frontend | — | A Fazer | Supabase Presence tracking |
| 1.10 | UI: Página `/configuracoes/grupos` | Frontend | — | A Fazer | CRUD: criar, editar, ativar/desativar |
| 1.11 | UI: Gestão de membros do grupo | Frontend | — | A Fazer | Adicionar/remover operadores |
| 1.12 | RLS: Policies para groups, group_members, group_phone_rules | Backend | — | A Fazer | Isolamento por tenant |
| 1.13 | Testes: Presença e grupos | QA | — | A Fazer | Edge cases, RLS |

**Definition of Done:**
- [ ] Operador pode alterar status na UI e é refletido em real-time
- [ ] Admin pode criar/editar/desativar grupos com membros
- [ ] Dados de departamentos existentes foram migrados para grupos
- [ ] RLS funcionando corretamente em todas as novas tabelas
- [ ] Heartbeat e auto-offline funcionando

---

## Sprint 2 — Routing Engine

**Objetivo:** Distribuição automática de conversas para operadores disponíveis.
**Duração:** 3 semanas
**Status:** Aguardando Sprint 1

### Backlog

| # | Task | Tipo | Responsável | Status | Notas |
|---|------|------|------------|--------|-------|
| 2.1 | Migration: tabela `conversation_queue` | Backend | — | A Fazer | Status: waiting/assigned/abandoned |
| 2.2 | SQL View: `inbox_counters` | Backend | — | A Fazer | withoutResponsible, chatbot, timeExceeded |
| 2.3 | Edge Function: `route-conversation` | Backend | — | A Fazer | Algoritmo completo de roteamento |
| 2.4 | Roleta: weighted round-robin | Backend | — | A Fazer | Menor carga primeiro |
| 2.5 | Sticky routing: responsável por contato | Backend | — | A Fazer | Se disponível, atribuir direto |
| 2.6 | Limite de carga: excluir da roleta quando cheio | Backend | — | A Fazer | `max_concurrent_conversations` |
| 2.7 | Integrar `whatsapp-webhook` → `route-conversation` | Backend | — | A Fazer | Fire-and-forget após triagem |
| 2.8 | Integrar `ai-agent` → checar disponibilidade | Backend | — | A Fazer | Handoff automático |
| 2.9 | Realtime: broadcast `conversation_assigned` | Backend | — | A Fazer | Canal por operador |
| 2.10 | Fila: lógica de enfileiramento quando sem operador | Backend | — | A Fazer | IA continua atendendo |
| 2.11 | Fila: reassign quando operador fica disponível | Backend | — | A Fazer | Trigger ou pg_notify |
| 2.12 | RPC: `get_inbox_counters` | Backend | — | A Fazer | Função SQL para frontend |
| 2.13 | Testes: Routing engine | QA | — | A Fazer | Cenários complexos |

**Definition of Done:**
- [ ] Conversa atribuída automaticamente ao operador correto em < 30s
- [ ] Operadores offline ou no limite não recebem conversas
- [ ] Conversas sem operador entram na fila e IA continua
- [ ] Quando operador fica disponível, recebe conversa da fila
- [ ] Sticky routing funciona para contatos recorrentes

---

## Sprint 3 — UI Gerencial e Notificações

**Objetivo:** Visibilidade da fila e notificações em tempo real.
**Duração:** 2 semanas
**Status:** Aguardando Sprint 2

### Backlog

| # | Task | Tipo | Responsável | Status | Notas |
|---|------|------|------------|--------|-------|
| 3.1 | Sidebar: badges com contadores (SLA/fila/ativo) | Frontend | — | A Fazer | Cores: vermelho/amarelo/verde |
| 3.2 | Sidebar: atualização real-time dos badges | Frontend | — | A Fazer | Supabase Realtime |
| 3.3 | Página `/inbox/fila`: lista de operadores + carga | Frontend | — | A Fazer | Presença + conversas ativas |
| 3.4 | Página `/inbox/fila`: lista de espera com timer | Frontend | — | A Fazer | Tempo de cada conversa |
| 3.5 | Botão "Forçar atribuição" (admin only) | Frontend | — | A Fazer | Dropdown com operadores |
| 3.6 | Toast notification ao receber conversa | Frontend | — | A Fazer | Sonner + som |
| 3.7 | Wiring: "Minha Aimee" — questions API | Backend | — | A Fazer | Salvar/carregar config |
| 3.8 | Wiring: "Minha Aimee" — functions API | Backend | — | A Fazer | Salvar/carregar config |
| 3.9 | Wiring: "Minha Aimee" — behavior config | Backend | — | A Fazer | Greeting, tone, emojis |
| 3.10 | Testes: Notificações e badges | QA | — | A Fazer | Edge cases |

**Definition of Done:**
- [ ] Admin vê fila de espera com tempo real de cada conversa
- [ ] Admin vê carga de cada operador em tempo real
- [ ] Operador recebe toast + som ao receber conversa
- [ ] Badges na sidebar atualizam sem refresh
- [ ] "Minha Aimee" totalmente funcional (salvar e carregar configs)

---

## Sprint 4 — Preferências e Refinamentos

**Objetivo:** Configurações avançadas e polimento para go-to-market.
**Duração:** 2 semanas
**Status:** Aguardando Sprint 3

### Backlog

| # | Task | Tipo | Responsável | Status | Notas |
|---|------|------|------------|--------|-------|
| 4.1 | Migration: novos campos em `ai_agent_config` | Backend | — | A Fazer | roulette, maxServices, SLA, etc. |
| 4.2 | UI: `/configuracoes/preferencias-atendimento` | Frontend | — | A Fazer | Cards com toggles |
| 4.3 | SLA de primeira resposta em conversas | Backend | — | A Fazer | Campo + cálculo de deadline |
| 4.4 | pg_cron: alertas de SLA breach | Backend | — | A Fazer | Cron job periódico |
| 4.5 | Auto-close por inatividade do contato | Backend | — | A Fazer | Configurável por grupo |
| 4.6 | Página financeira funcional | Frontend | — | A Fazer | Integrar com billing_plans |
| 4.7 | Transferência para grupo (não só agente) | Frontend | — | A Fazer | UI no chat |
| 4.8 | Filtro de disponibilidade na transferência | Frontend | — | A Fazer | Só mostrar disponíveis |
| 4.9 | Testes end-to-end: fluxo completo | QA | — | A Fazer | Webhook → IA → routing → chat |

**Definition of Done:**
- [ ] Admin pode configurar todas as preferências de atendimento
- [ ] SLA breach gera alerta visual no dashboard
- [ ] Conversas inativas fecham automaticamente (configurável)
- [ ] Transferência para grupo funciona
- [ ] Fluxo completo testado end-to-end

---

## Velocity e Estimativas

| Sprint | Tasks | Duração | Complexidade |
|--------|-------|---------|-------------|
| Sprint 1 | 13 | 2 semanas | Media |
| Sprint 2 | 13 | 3 semanas | Alta |
| Sprint 3 | 10 | 2 semanas | Media |
| Sprint 4 | 9 | 2 semanas | Media |
| **Total** | **45** | **9 semanas** | — |

---

## Como Usar Este Board

### Status das Tasks
- **A Fazer** — Não iniciado
- **Em Progresso** — Sendo trabalhado
- **Em Review** — Pronto para revisão
- **Concluído** — Entregue e testado
- **Bloqueado** — Dependência não resolvida

### Atualização
1. Ao iniciar uma task, mudar status para "Em Progresso"
2. Ao terminar, mudar para "Em Review"
3. Após validação, mudar para "Concluído"
4. Se bloqueado, anotar a dependência na coluna "Notas"

### Sprint Review
Ao final de cada sprint:
1. Verificar Definition of Done
2. Atualizar `TRACKING.md` com progresso
3. Mover tasks não concluídas para o próximo sprint
4. Documentar lições aprendidas

---

## Lições Aprendidas

*(Preencher ao final de cada sprint)*

### Sprint 1
- (pendente)

### Sprint 2
- (pendente)

### Sprint 3
- (pendente)

### Sprint 4
- (pendente)

---

*Board atualizado em cada daily/weekly sync.*
