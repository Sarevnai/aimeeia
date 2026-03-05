# Artefato 3: Plano de Implementação — Roteamento WhatsApp e Gestão de Grupos (Aimee.IA)
### Revisão 2.0 — Baseado em arquitetura confirmada do Octadesk

> **Escopo**: Roadmap estratégico para fechar os gaps críticos identificados no Comparativo. Nenhum código de implementação ainda — apenas especificação de design, schemas e decisões arquiteturais. Aprovação necessária antes de iniciar.

---

## Visão Geral

**Objetivo**: Implementar na Aimee.IA o mesmo modelo de roteamento confirmado no Octadesk:
- Presença de operadores (Disponível / Ausente / Offline)
- Roleta automática por grupo
- Limite de carga por operador
- Grupos como entidade configurável (não enum fixo)
- Fila rastreável com `withoutResponsible` counter
- Handoff automático bot → humano quando disponível

**Princípio de design**: Reaproveitar 100% da infraestrutura existente (Supabase Realtime, Edge Functions Deno, PostgreSQL) — sem nova dependência de serviços externos.

---

## Etapa 0 — Presença de Operadores (Fundação)

> **Bloqueador**: todas as etapas seguintes dependem disso. Implementar primeiro.

### 0.1 Migration: `presence_status` em `profiles`

```sql
-- Mapeamento direto do Octadesk: idContactStatus → presence_status
-- Octadesk estados: Disponível / Ausente / Offline

CREATE TYPE operator_presence AS ENUM ('available', 'away', 'offline');

ALTER TABLE profiles
  ADD COLUMN presence_status   operator_presence NOT NULL DEFAULT 'offline',
  ADD COLUMN presence_updated_at TIMESTAMPTZ DEFAULT NOW(),
  ADD COLUMN max_concurrent_conversations INTEGER NOT NULL DEFAULT 5;

-- Octadesk equivalent: allowManualLimitOverride
ALTER TABLE profiles
  ADD COLUMN allow_limit_override BOOLEAN NOT NULL DEFAULT false;
```

### 0.2 Edge Function: `update-presence`

```
POST /functions/v1/update-presence
Body: { status: 'available' | 'away' | 'offline' }
Auth: JWT obrigatório

→ UPDATE profiles SET presence_status = $1, presence_updated_at = NOW()
  WHERE id = $requester_profile_id
```

### 0.3 Supabase Realtime Presence (sem Pusher/Socket.io)

O Supabase já implementa o mesmo modelo do socket do Octadesk via channels:

```typescript
// Equivalente ao socket-vendor do Octadesk
// Canal por tenant (não global) para escalar
const channel = supabase.channel(`presence:${tenantId}`)
channel
  .on('presence', { event: 'sync' }, () => {
    // Atualiza lista de operadores online no dashboard
  })
  .track({ profile_id, department_code, status: 'available' })
  .subscribe()
// Ao fechar aba: untrack automático
```

### 0.4 UI: Seletor de status no AppHeader

Equivalente ao avatar-dropdown do Octadesk (Disponível / Ausente / Offline):

```
AppHeader (atual: filtro de departamento)
  + [● Disponível ▾] → dropdown: Disponível / Ausente / Offline
```

- Verde / Amarelo / Cinza conforme o modelo Octadesk
- Muda status via `update-presence` Edge Function
- Heartbeat de 30s; timeout de 90s → marca `offline` automaticamente

---

## Etapa 1 — Grupos como Entidade (Substituir Enum Fixo)

> Octadesk: entidade `groups` com CRUD completo (create/update/enable/disable/removeAgent). Aimee.IA tem apenas `department_code` enum.

### 1.1 Nova tabela: `groups`

```sql
-- Mapeamento direto dos campos do formulário Octadesk:
-- Nome do Grupo, Membros, Responsáveis, Permissões

CREATE TABLE groups (
  id                              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                       UUID NOT NULL REFERENCES tenants(id),
  name                            TEXT NOT NULL,  -- "Vendas", "Locação", "Admin"
  department_code                 department_type, -- compatibilidade com enum existente
  is_enabled                      BOOLEAN NOT NULL DEFAULT true,

  -- Permissões (mapeamento direto do Octadesk)
  roulette                        BOOLEAN NOT NULL DEFAULT false,
  max_services_enabled            BOOLEAN NOT NULL DEFAULT false,
  max_services_limit              INTEGER NOT NULL DEFAULT 5,
  transfer_on_user_inactivity     BOOLEAN NOT NULL DEFAULT false,
  inactivity_transfer_delay_min   INTEGER DEFAULT 10,
  restricted_visibility           BOOLEAN NOT NULL DEFAULT false,
  hide_other_member_conversations BOOLEAN NOT NULL DEFAULT false,
  auto_close_on_contact_inactivity BOOLEAN NOT NULL DEFAULT false,
  auto_close_delay_min            INTEGER DEFAULT 20,

  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE (tenant_id, name)
);

-- Membros do grupo
CREATE TABLE group_members (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id    UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  profile_id  UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  is_supervisor BOOLEAN NOT NULL DEFAULT false,  -- "Responsável pelo grupo"
  joined_at   TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (group_id, profile_id)
);

-- Restrição por número de telefone (Octadesk: "Restringir grupo a números")
CREATE TABLE group_phone_rules (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id    UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  phone_pattern TEXT NOT NULL,  -- ex: "+5511%" ou número exato
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- RLS padrão em todas as tabelas
ALTER TABLE groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE group_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE group_phone_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation" ON groups
  FOR ALL USING (tenant_id = get_user_tenant_id());
```

### 1.2 Migrar `department_code` para `group_id`

- `conversations.department_code` → manter como referência + adicionar `group_id UUID REFERENCES groups(id)`
- `profiles.department_code` → manter como compatibilidade + migrar para `group_members`
- Migration script: inserir grupos padrão (vendas, locacao, administrativo) e migrar membros existentes

---

## Etapa 2 — Fila de Conversas e InboxCounters

> Octadesk: `inboxCounters.withoutResponsible`, `inboxCounters.chatbot`, `inboxCounters.timeExceeded`. Aimee.IA não tem nenhum desses.

### 2.1 View: `inbox_counters`

```sql
-- Equivalente ao inboxCounters do Octadesk, calculado sob demanda
-- Sem nova tabela: derivado das existentes

CREATE VIEW inbox_counters AS
SELECT
  c.tenant_id,
  COUNT(*) FILTER (WHERE cs.is_ai_active = false AND cs.operator_id IS NOT NULL)
    AS by_agent,
  COUNT(*) FILTER (WHERE cs.is_ai_active = true)
    AS chatbot,
  COUNT(*) FILTER (WHERE cs.operator_id IS NULL AND cs.is_ai_active = false)
    AS without_responsible,  -- ← equivalente ao Octadesk withoutResponsible
  COUNT(*) FILTER (
    WHERE t.sla_deadline IS NOT NULL AND t.sla_deadline < NOW()
    AND t.resolved_at IS NULL
  ) AS time_exceeded,        -- ← equivalente ao Octadesk timeExceeded
  COUNT(*) AS all_count
FROM conversations c
JOIN conversation_states cs ON cs.conversation_id = c.id  -- assumindo FK
LEFT JOIN tickets t ON t.conversation_id = c.id
WHERE c.status = 'active'
GROUP BY c.tenant_id;
```

### 2.2 Tabela: `conversation_queue`

```sql
-- Para casos onde a conversa aguarda agente disponível
-- Equivalente ao room.status = 'withoutResponsible' no Octadesk

CREATE TYPE queue_status AS ENUM ('waiting', 'assigned', 'abandoned');

CREATE TABLE conversation_queue (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id            UUID NOT NULL REFERENCES tenants(id),
  conversation_id      UUID NOT NULL REFERENCES conversations(id),
  group_id             UUID REFERENCES groups(id),
  priority             INTEGER NOT NULL DEFAULT 0,
  status               queue_status NOT NULL DEFAULT 'waiting',
  queued_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  assigned_at          TIMESTAMPTZ,
  assigned_operator_id UUID REFERENCES profiles(id),
  sla_deadline         TIMESTAMPTZ,
  UNIQUE (conversation_id) WHERE status = 'waiting'
);

CREATE INDEX idx_queue_tenant_group ON conversation_queue
  (tenant_id, group_id, status, queued_at);

ALTER TABLE conversation_queue ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON conversation_queue
  FOR ALL USING (tenant_id = get_user_tenant_id());
```

---

## Etapa 3 — Routing Engine

> Octadesk: routing engine no backend com acesso a `available agents`, `group membership`, `maxServices`. Aimee.IA: criar Edge Function `route-conversation`.

### 3.1 Edge Function: `route-conversation`

**Invocada por**: `whatsapp-webhook` após `triage_stage = 'completed'`

**Algoritmo** (equivalente ao Octadesk confirmado):

```
FUNÇÃO route_conversation(conversation_id, tenant_id):

  1. Carregar conversa + group_id ou department_code

  2. Verificar sticky routing (automaticSetReponsible equivalente):
     → Existe responsável fixo para este contato?
     → Se sim E disponível: assign() direto

  3. Buscar candidatos elegíveis:
     SELECT p.id, COUNT(cs_active) as load
     FROM profiles p
     JOIN group_members gm ON gm.profile_id = p.id AND gm.group_id = $group_id
     WHERE p.presence_status = 'available'
       AND p.tenant_id = $tenant_id
       AND (
         NOT g.max_services_enabled
         OR COUNT(active_convs) < COALESCE(p.max_concurrent_conversations, g.max_services_limit)
       )
     ORDER BY load ASC, p.presence_updated_at ASC
     LIMIT 1
     -- Menor carga primeiro = weighted round-robin (modelo Octadesk)

  4. Se sem candidatos:
     → INSERT INTO conversation_queue (waiting)
     → Notificar gerentes
     → AI continua (is_ai_active = true)
     RETURN

  5. assign(conversation, operator):
     BEGIN TRANSACTION
       UPDATE conversation_states
         SET operator_id = $op_id, is_ai_active = false,
             operator_takeover_at = NOW()
       UPDATE conversation_queue SET status = 'assigned', assigned_at = NOW()
       INSERT INTO messages (system event: 'operator_joined')
       INSERT INTO conversation_events
     COMMIT
     → Broadcast via Supabase Realtime para o operador
```

### 3.2 Notificação ao Operador (equivalente ao socket-vendor Octadesk)

```typescript
// Octadesk usa socket-vendor próprio
// Aimee.IA usa Supabase Realtime Broadcast (mesmo modelo, zero dependência extra)

await supabase.channel(`operator:${operatorId}`)
  .send({
    type: 'broadcast',
    event: 'conversation_assigned',
    payload: { conversation_id, contact_name, group_name, queued_at }
  })

// Cliente React escuta:
supabase.channel(`operator:${profile.id}`)
  .on('broadcast', { event: 'conversation_assigned' }, ({ payload }) => {
    // Toast: "Nova conversa atribuída: João Silva (Vendas)"
    // Badge do sidebar atualiza via invalidateQuery
  })
```

---

## Etapa 4 — Modificar Fluxo Existente

### 4.1 `whatsapp-webhook/index.ts`

Após invocar `ai-agent`, checar se triagem completou e disparar routing:

```typescript
// Após processamento do ai-agent:
if (triageComplete && !currentState.operator_id) {
  // Fire-and-forget: não bloqueia o 200 para Meta
  supabase.functions.invoke('route-conversation', {
    body: { conversation_id, tenant_id, group_id: detectedGroup }
  })
}
```

### 4.2 `ai-agent/index.ts`

Retornar sinal de triagem completa + detectar se deve chamar humano:

```typescript
// Ao completar triage:
const availableOps = await checkAvailableOperators(groupId, tenantId)
if (availableOps > 0) {
  // Sinalizar para routing engine
  return { triage_complete: true, request_human: true, group_id: detectedGroup }
} else {
  // Continuar AI, mas colocar na fila
  return { triage_complete: true, request_human: false, queued: true }
}
```

---

## Etapa 5 — UI: Inbox Atualizada e Dashboard de Fila

### 5.1 Sidebar: Badges por tipo (equivalente ao inboxCounters Octadesk)

```typescript
// Substituir badge único por 3 contadores:
// Octadesk: all | byAgent | withoutResponsible | timeExceeded | chatbot

const { data: counters } = useQuery(['inbox-counters', tenantId], () =>
  supabase.rpc('get_inbox_counters', { p_tenant_id: tenantId, p_group_id })
)

// AppSidebar badge:
// 🔴 {counters.time_exceeded} → SLA violado
// 🟡 {counters.without_responsible} → aguardando atribuição
// 🟢 {counters.by_agent} → em atendimento ativo
```

### 5.2 Nova página `/inbox/fila` (Gerencial)

```
┌──────────────────────────────────────────────────────────┐
│  Fila de Atendimento                         [Atualizar] │
├─────────────────────┬────────────────────────────────────┤
│  OPERADORES         │  AGUARDANDO (withoutResponsible)   │
│                     │                                    │
│ ● Ana   Vendas  2/5 │  João Silva  00:02:34  Vendas      │
│ ● Pedro Locação 1/5 │  Maria Lima  00:05:11  Locação     │
│ ◑ Luis  Vendas  5/5 │  Carlos B.   00:00:47  Vendas      │
│ ○ Bruna (ausente)   │                                    │
│                     │  [Forçar atribuição ▾]             │
└─────────────────────┴────────────────────────────────────┘
```

### 5.3 Página de Grupos (`/configuracoes/grupos`)

CRUD completo equivalente ao Octadesk:
- Criar/editar grupo (Nome, Membros, Responsáveis)
- Checkboxes de permissões (mapeados da Etapa 1)
- Ativar/desativar grupo

---

## Etapa 6 — Config de Tenant: Preferências de Atendimento

> Equivalente à página `Preferências` do Octadesk (`chatPreferences` Vuex)

### 6.1 Novos campos em `ai_agent_config` (ou nova tabela `chat_preferences`)

```sql
ALTER TABLE ai_agent_config
  ADD COLUMN roulette                    BOOLEAN DEFAULT false,
  ADD COLUMN max_services_enabled        BOOLEAN DEFAULT false,
  ADD COLUMN max_services_limit          INTEGER DEFAULT 5,
  ADD COLUMN automatic_set_responsible   BOOLEAN DEFAULT false,
  ADD COLUMN service_timeout_agents_min  INTEGER DEFAULT NULL,
  ADD COLUMN service_timeout_clients_min INTEGER DEFAULT NULL,
  ADD COLUMN notify_agents_option        TEXT DEFAULT 'all',
  ADD COLUMN notify_agents_delay_sec     INTEGER DEFAULT 60,
  ADD COLUMN inactivity_timeout_min      INTEGER DEFAULT NULL,
  ADD COLUMN show_agent_name_in_wa       BOOLEAN DEFAULT false,
  ADD COLUMN client_can_close            BOOLEAN DEFAULT false,
  ADD COLUMN auto_open_ticket            BOOLEAN DEFAULT false;
```

### 6.2 UI: `/configuracoes/preferencias-atendimento`

Cards equivalentes ao Octadesk (confirmados na tela real):
1. Abertura automática de ticket
2. Restrição de acesso entre grupos
3. Limite de conversas simultâneas
4. Distribuição automática (roleta)
5. Tempo de resposta (SLA) — com "Configurar"
6. Atribuir responsável automaticamente
7. Nome do agente nas mensagens WhatsApp
8. Cliente pode encerrar conversa

---

## Sequenciamento de Sprints

```
SPRINT 2 — Fundação (2 semanas)
  ├── Migration: presence_status + max_concurrent em profiles
  ├── Migration: tabela groups + group_members + group_phone_rules
  ├── EdgeFn: update-presence (JWT ON)
  ├── UI: seletor Disponível/Ausente/Offline no AppHeader
  └── UI: página /configuracoes/grupos (CRUD básico)

SPRINT 3 — Routing Engine (3 semanas)
  ├── Migration: conversation_queue table
  ├── View: inbox_counters
  ├── EdgeFn: route-conversation (algoritmo completo)
  ├── Modificar: whatsapp-webhook → invocar route-conversation
  ├── Modificar: ai-agent → checar disponibilidade antes de continuar
  └── Realtime: canal por operador para conversation_assigned

SPRINT 4 — UI Gerencial (2 semanas)
  ├── UI: badges por tipo no AppSidebar (SLA / fila / ativo)
  ├── UI: página /inbox/fila (dashboard de operadores + fila)
  ├── UI: botão "Forçar atribuição" para admins
  └── UI: toast notification ao receber conversa

SPRINT 5 — Preferências e Refinamentos (2 semanas)
  ├── Migration: novos campos em ai_agent_config
  ├── UI: /configuracoes/preferencias-atendimento (todos os toggles)
  ├── UI: sticky routing (responsável automático por contato)
  ├── Scheduler: pg_cron para SLA breach alerts
  └── Scheduler: auto-close por inatividade do contato
```

---

## Stack Recomendada

| Componente | Tecnologia | Justificativa |
|------------|-----------|---------------|
| Presença real-time | Supabase Realtime Presence | Já existe, mesmo modelo do socket Octadesk |
| Push de conversas | Supabase Realtime Broadcast | Equivalente ao socket-vendor Octadesk |
| Routing Engine | Supabase Edge Function (Deno) | Padrão do projeto |
| Fila persistente | PostgreSQL (conversation_queue) | Sem Redis — volume imobiliário não justifica |
| Scheduler SLA | Supabase pg_cron | Plano Pro ou Deno.cron no free |
| Toast notifications | Sonner (já no projeto) | Sem nova dependência |
| Grupos CRUD UI | Shadcn/UI + React Query | Já no projeto |

---

## KPIs de Sucesso

| KPI | Meta | Fonte |
|-----|------|-------|
| Tempo de atribuição (triagem → operador) | < 30s | `conversation_queue.assigned_at - queued_at` |
| % atribuição automática | > 90% | `COUNT WHERE status='assigned' / total` |
| SLA breach (> 5min sem resposta) | < 5% | `inbox_counters.time_exceeded` |
| Distribuição de carga entre operadores | < 20% desvio | `active_conversations_count` por operador |
