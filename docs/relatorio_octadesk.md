# Artefato 1: Relatório Técnico — Octadesk
### Revisão 2.0 — Análise com acesso ao app ao vivo (app.octadesk.com)

> **Metodologia**: Análise direta do app via Chrome DevTools + inspeção do Vuex store + captura de network requests em tempo real + exploração da UI. Dados marcados com ✅ são **confirmados ao vivo**. Dados marcados com 🔍 são **inferidos** de padrões observáveis.

---

## 1. Stack Tecnológico (Confirmado)

| Camada | Tecnologia | Evidência |
|--------|-----------|-----------|
| **Frontend Framework** | **Vue 2** com Vuex | `el.__vue__`, `store._actions`, `vue-composition-api` nos assets ✅ |
| **State Management** | **Vuex** (28+ módulos) | `store.state` com módulos: chat, chatPreferences, socket, auth, bot... ✅ |
| **Build** | Vite (asset hashing: `-DapQdQkP.js`) | URLs `/assets/*.js` com hash ✅ |
| **Real-time** | Socket customizado (`socket-vendor-DapQdQkP.js`) | Asset carregado, `socket.connected: true` no Vuex ✅ |
| **API principal** | REST sobre HTTPS | `southamerica-east1-001.prod.octadesk.services` ✅ |
| **Auth service** | `nucleus.octadesk.com` + JWT | `auth.jwtoken: eyJhbGci...` no Vuex ✅ |
| **Tenant config** | `pantheon.octadesk.services` | `GET /nucleus-auth/tenants/{id}/configs` ✅ |
| **Analytics infra** | Google Cloud Run (US East) | `mpc2-prod-28-is5qnl632q-ue.a.run.app` ✅ |
| **Infra cloud** | **GCP São Paulo** (`southamerica-east1`) | hostname confirmado ✅ |
| **Billing** | Serviço dedicado `/credit-management` | `GET /credit-management/balance` ✅ |

---

## 2. Arquitetura de Microsserviços (Confirmada via Network)

```
┌─────────────────────────────────────────────────────────────────┐
│                   OCTADESK — INFRAESTRUTURA REAL                │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  nucleus.octadesk.com           → Billing, plano, resumo       │
│  pantheon.octadesk.services     → Auth, tenant configs         │
│  prod.octadesk.services         → API principal (chat, groups, │
│  (southamerica-east1-001)         rooms, agents, WA, AI)       │
│  mpc2-prod-*.a.run.app          → Analytics / Marketing events │
│  (GCP Cloud Run, US East)                                       │
│                                                                  │
│  app.octadesk.com               → SPA Vue 2 (CDN)              │
│  cdn.octadesk.com               → Assets estáticos             │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 3. API Endpoints Confirmados (via Network Requests ao vivo)

### 3.1 Chat / Conversas
| Endpoint | Método | Descrição |
|----------|--------|-----------|
| `GET /chat/configs` | GET | Configurações gerais do chat |
| `POST /chat/rooms/list` | POST | Listar conversas (com filtros) |
| `POST /chat/rooms/count` | POST | Contagem de conversas por filtro |
| `GET /chat/rooms/waiting-count` | GET | **Fila de espera — sem atribuição** ✅ |
| `GET /chat/rooms/{id}/open/page?page=1&limit=15` | GET | Mensagens paginadas |
| `PUT /chat/rooms/{id}/messages/read` | PUT | Marcar mensagens como lidas |
| `GET /chat/inbox/groups` | GET | Grupos disponíveis na inbox |

### 3.2 Agentes e Grupos
| Endpoint | Método | Descrição |
|----------|--------|-----------|
| `GET /chat/agents/` | GET | Listar todos os agentes do tenant |
| `GET /chat/agents/{id}` | GET | Dados do agente (status, grupos, limite) |
| `GET /chat/groups` | GET | Listar grupos de atendimento |
| `GET /chat/groups/restricted` | GET | Grupos restritos do agente |
| `GET /chat/groups/agent/{agentId}` | GET | Grupos de um agente específico |

### 3.3 WhatsApp e Canais
| Endpoint | Método | Descrição |
|----------|--------|-----------|
| `GET /whatsapp/numbers` | GET | Números WhatsApp do tenant |
| `GET /chat/integrator/whatsapp/numbers` | GET | Números via integrator |
| `GET /facebook/accounts/{id}` | GET | Conta Facebook/Instagram vinculada |

### 3.4 Automação e IA
| Endpoint | Método | Descrição |
|----------|--------|-----------|
| `GET /ai/agents` | GET | Agentes WOZ (retornou 500 — não configurado no trial) |
| `POST /chat/macros/avaliables` | POST | Macros disponíveis para o agente |
| `POST /chat/quick-reply/filter` | POST | Respostas rápidas filtradas |
| `GET /api/custom-fields/system-type/{n}` | GET | Campos customizados da conversa |

### 3.5 Billing / Créditos
| Endpoint | Método | Descrição |
|----------|--------|-----------|
| `GET /credit-management/balance?products=WHATSAPP,WHATSAPP_MARKETING,GENERAL_ATTENDANCE,GENERAL,WOZ_COPILOT` | GET | Saldo por produto ✅ |
| `GET /credit-management/categories` | GET | Categorias de crédito |
| `GET /nucleus.octadesk.com/Billing/{tenantId}/summary` | GET | Resumo de billing |

---

## 4. Vuex Store — Módulos Confirmados

```
app, auth, summary, checkout, creditAlerts, onboarding,
botBuilder, dataSource, integrations, loader, language,
signup, embeddedNavigation, navigation, featureToggle,
user, globalAlert, whatsappModule, nucleusModule, global,
reminder, whatsAppOfficial, socket, automationsInactivityEvents,
bot, bulkMessages, chat, chatConfigurations, chatPreferences
```

**Módulos críticos para roteamento:**
- `chat` — agentes, grupos, rooms, inbox, onlineAgents, sidebar
- `chatPreferences` — roulette, maxServices, serviceTimeout, notifyAgents
- `chatConfigurations` — settings globais, companyFeatures
- `socket` — estado da conexão WebSocket

---

## 5. Sistema de Presença de Operadores (Confirmado ao vivo ✅)

### 5.1 Estados
Acessíveis via clique no avatar no canto inferior esquerdo:

| Status | Cor | Efeito no Roteamento |
|--------|-----|---------------------|
| **Disponível** | 🟢 Verde | Elegível para receber conversas na roleta |
| **Ausente** | 🟡 Amarelo | **Não aparece** na lista de transferência |
| **Offline** | ⚫ Cinza | **Não aparece** na lista de transferência |

### 5.2 Modelo de dados do agente (Vuex `chat.agent`)
```json
{
  "id": "01db19e3-...",
  "name": "Ian Veras",
  "idContactStatus": "00000000-...",
  "contactStatusEvents": {},
  "roleType": 1,
  "permissionType": 1,
  "participantPermission": 0,
  "idsGroups": ["8eb45383-..."],
  "tenantProfile": { "tenantProfileId": null, "name": null },
  "permissionView": 0
}
```

### 5.3 InboxCounters (Vuex `chat.inbox.inboxCounters`) — confirmado ✅
```json
{
  "all": 1,
  "byAgent": 0,
  "unread": 0,
  "mentioned": 0,
  "participation": 0,
  "withoutResponsible": 1,   ← conversas na fila (sem agente)
  "chatbot": 0,
  "timeExceeded": 0          ← SLA violado
}
```

---

## 6. Sistema de Distribuição Automática (Roleta) — Confirmado ✅

### 6.1 Configuração Global (Preferências)
Localização: `Configurações > Geral > Preferências`
URL: `/chat-settings/general/chat-preferences`

Vuex key: `chatPreferences.roulette`

```json
{
  "roulette": false,
  "maxServices": {
    "enabled": false,
    "limit": 1,
    "allowManualLimitOverride": false,
    "onlyAdminLimitOverride": false
  },
  "notifyAgents": {
    "enabled": true,
    "option": "all",
    "delay": 60
  },
  "automaticSetReponsible": false,
  "inactivityTimeout": { "enabled": false, "delay": 20 },
  "serviceTimeout": {
    "agents": { "enabled": false, "delay": null },
    "clients": { "enabled": false, "delay": null }
  }
}
```

### 6.2 Configuração por Grupo (Override granular)
Cada grupo tem suas próprias permissões que **sobrescrevem as globais**:

| Permissão | Chave provável | Descrição |
|-----------|---------------|-----------|
| Distribuir automaticamente | `roulette` por grupo | Roleta apenas para este grupo |
| Transferir após inatividade do usuário | `transferOnUserInactivity` | Reatribui se operador inativo |
| Limitar conversas por usuário | `maxServices` por grupo | Override do limite global |
| Visível só para o grupo | `restrictedVisibility` | Isolamento total de inbox |
| Membros não veem conv. de outros | `hideOtherMembersConversations` | Privacidade intra-grupo |
| Restringir a números de telefone | `phoneNumberRestriction` | **Roteamento por número** ✅ |
| Encerrar após inatividade do contato | `autoCloseOnContactInactivity` | Timeout de fechamento |

---

## 7. Grupos de Atendimento — Estrutura Confirmada ✅

URL: `/chat-settings/groups/create`
Vuex mutations: `groups/octadesk/chat/setGroups`, `createGroup`, `updateGroup`, `removeGroup`, `enableGroup`, `disableGroup`, `removeAgentInGroup`, `SET_AGENTS_SORTED`, `SET_WHATSAPP_NUMBERS`

### 7.1 Campos do formulário
```
Nome do Grupo *          → string (ex: "Suporte", "Vendas")
Membros do grupo *       → UUID[] (agentes membros)
Responsáveis pelo grupo  → UUID[] (supervisores do grupo)
Permissões               → boolean flags (ver Seção 6.2)
```

### 7.2 Hierarquia de roteamento
```
Tenant (global)
  └── Grupo A (ex: Vendas)
        ├── Membros: [Agente 1, Agente 2]
        ├── Responsáveis: [Supervisor]
        ├── Roulette: true/false (override global)
        ├── MaxServices: 5 (override global)
        └── Restrito a números: [+5511...]

  └── Grupo B (ex: Suporte)
        ├── ...
        └── Restrito a números: [+5521...]
```

---

## 8. UI de Transferência (Confirmado ao vivo ✅)

Acionado pelo botão de setas (↔) no header da conversa.
Componente: `ChatConversationHeaderSelectAgentAndGroup`

```
┌────────────────────────────────────────┐
│ [Busque agentes ou grupos            ] │
│                                        │
│ Transferir para um grupo               │
│   → Não existem grupos para atribuição │
│     (ou lista de grupos disponíveis)   │
│                                        │
│ Transferir para um usuário disponível  │
│   [Ian] Ian Veras                      │
│   [...]  (apenas status=disponível)    │
└────────────────────────────────────────┘
```

**Regra crítica confirmada**: Apenas agentes com status `disponível` aparecem na lista de transferência. Agentes `ausente` ou `offline` ficam ocultos.

---

## 9. Preferências Completas (Confirmado via UI + Vuex ✅)

Localização: `Configurações > Geral > Preferências`

| Configuração | Chave Vuex | Descrição |
|-------------|-----------|-----------|
| Abertura automática de ticket | `automaticOpenTicket` | Nova conversa → cria ticket automaticamente |
| Restrinja acesso agentes outros grupos | `restrictedGroups` | Agente só vê conv. do seu grupo |
| Limite de conversas simultâneas | `maxServices.enabled / limit` | Cap de carga por agente |
| Roleta (distribuição automática) | `roulette` | Round-robin para disponíveis |
| Cliente encerra conversa | `clientCanClose` | Self-service de encerramento |
| Enviar conversa por e-mail | `sendChatToClient` | Transcript pós-atendimento |
| Nome do agente no WhatsApp | Configuração específica | Exibe nome na mensagem WA |
| Tempo de resposta (SLA) | `serviceTimeout.agents/clients` | Alerta quando excede delay |
| Atribuir responsável automaticamente | `automaticSetReponsible` | Sticky routing: 1º agente = responsável permanente |

---

## 10. Planos e Billing (Produtos confirmados via API ✅)

Produtos detectados no endpoint `/credit-management/balance`:
- `WHATSAPP` — Mensagens WhatsApp
- `WHATSAPP_MARKETING` — Disparos em massa
- `GENERAL_ATTENDANCE` — Atendimentos gerais
- `GENERAL` — Geral
- `WOZ_COPILOT` — IA copiloto

---

## 11. Resumo Executivo de Arquitetura

```
FLUXO COMPLETO OCTADESK (Confirmado + Inferido)
================================================

[Cliente] → WhatsApp / Instagram / Chat
     ↓ webhook POST
[prod.octadesk.services] → valida tenant, dedup
     ↓
[Bot/WOZ] → triagem (se configurado)
     ↓ identifica grupo-alvo
[Routing Engine] → consulta chat.agents (disponíveis, grupo, maxServices)
     ├── Se roulette = ON: atribui ao agente com menor carga
     ├── Se automaticSetReponsible = ON: verifica contato já tem responsável
     └── Se sem agente disponível: room.status = 'withoutResponsible' (fila)
     ↓
[socket-vendor] → push evento para cliente Vue do agente
     ↓
[Vue 2 Client] → Vuex mutation → UI atualiza inbox + badge counter
```

*Evidências coletadas em: app.octadesk.com — conta trial, 04/03/2026*
