# Artefato 2: Comparativo Técnico — Octadesk vs. Aimee.IA
### Revisão 2.0 — Baseado em dados ao vivo do Octadesk

> Dados do Octadesk marcados com ✅ são confirmados via inspeção direta do app. Dados da Aimee.IA são confirmados via leitura do código-fonte.

---

## 1. Tabela Comparativa de Features

### 1.1 Roteamento e Distribuição de Conversas

| Feature | Octadesk | Aimee.IA (Atual) | Status |
|---------|----------|-----------------|--------|
| Múltiplos operadores / número único | ✅ Core product | ✅ WhatsApp Cloud API | Paridade |
| Detecção de departamento | ✅ Bot/keywords configurable | ✅ Gemini AI (ai-agent) | Paridade funcional |
| Roleta (round-robin automático) | ✅ `chatPreferences.roulette` toggle | ❌ Não existe | **GAP CRÍTICO** |
| Fila `withoutResponsible` | ✅ `inboxCounters.withoutResponsible` | ❌ Sem contador/fila | **GAP CRÍTICO** |
| Atribuição automática ao assumir | ✅ `automaticSetReponsible` (sticky) | ❌ Não implementado | **GAP CRÍTICO** |
| Transferência entre agentes | ✅ Dropdown com busca | ✅ Modal de transferência | Paridade básica |
| Transferência para grupo | ✅ Seção "Transferir para um grupo" | ❌ Só para agentes individuais | GAP médio |
| Filtro por disponibilidade na transferência | ✅ Só mostra status=disponível | ❌ Sem filtro de disponibilidade | GAP alto |
| Roteamento por número de telefone | ✅ "Restringir grupo a números" | ❌ Não implementado | GAP médio |
| Sticky routing (responsável permanente) | ✅ `automaticSetReponsible` | ❌ Não implementado | GAP médio |

### 1.2 Presença e Disponibilidade de Operadores

| Feature | Octadesk | Aimee.IA (Atual) | Status |
|---------|----------|-----------------|--------|
| Estados de presença | ✅ Disponível / Ausente / Offline | ❌ `profiles` sem campo status | **GAP CRÍTICO** |
| Selector de status na UI | ✅ Avatar → dropdown 3 estados | ❌ Não existe | **GAP CRÍTICO** |
| Agentes offline excluídos da roleta | ✅ Automático por status | ❌ Sem mecanismo | **GAP CRÍTICO** |
| Agentes offline ocultos na transferência | ✅ Só `disponível` aparece | ❌ Sem filtro | GAP alto |
| Dashboard de presença gerencial | ✅ `chat.onlineAgents` no Vuex | ❌ Não existe | GAP alto |
| Inatividade → transferência automática | ✅ Per-group toggle | ❌ Não implementado | GAP médio |

### 1.3 Limites de Carga por Operador

| Feature | Octadesk | Aimee.IA (Atual) | Status |
|---------|----------|-----------------|--------|
| Limite de conversas simultâneas | ✅ `maxServices.limit` (global) | ❌ Sem limite | **GAP CRÍTICO** |
| Override de limite por grupo | ✅ Per-group `maxServices` | ❌ Sem estrutura | GAP alto |
| Override manual (admin) | ✅ `allowManualLimitOverride` flag | ❌ Sem estrutura | GAP baixo |
| Agente cheio = sai da roleta | ✅ Automático | ❌ Sem mecanismo | GAP alto |
| Contador de conversas ativas por agente | ✅ `inboxCounters.byAgent` | ❌ Não rastreado | GAP alto |

### 1.4 Grupos de Atendimento

| Feature | Octadesk | Aimee.IA (Atual) | Status |
|---------|----------|-----------------|--------|
| Grupos com membros e supervisores | ✅ Nome + Membros + Responsáveis | ⚠️ Só `department_code` no profile | GAP alto |
| Permissões por grupo | ✅ 6 checkboxes configuráveis | ❌ Não existe | **GAP CRÍTICO** |
| Inbox segregada por grupo | ✅ `chat.groups/restricted` | ⚠️ DepartmentFilter (lock) | Paridade parcial |
| Contadores por grupo na inbox | ✅ `inboxCountersGroups` | ❌ Sem contadores | GAP médio |
| Visibilidade de conv. restrita ao grupo | ✅ Toggle per-group | ❌ Não existe | GAP médio |
| Roulette por grupo (override) | ✅ Toggle per-group | ❌ Sem estrutura | **GAP CRÍTICO** |
| Mutações Vuex de grupo | ✅ create/update/enable/disable/removeAgent | ❌ Sem CRUD de grupos | **GAP CRÍTICO** |

### 1.5 SLA e Timeouts

| Feature | Octadesk | Aimee.IA (Atual) | Status |
|---------|----------|-----------------|--------|
| SLA de primeira resposta | ✅ `serviceTimeout.agents` (delay) | ❌ Sem SLA em conversas | GAP alto |
| SLA do cliente (espera) | ✅ `serviceTimeout.clients` | ❌ Sem SLA em conversas | GAP alto |
| `timeExceeded` counter na inbox | ✅ `inboxCounters.timeExceeded` | ❌ Não existe | GAP alto |
| SLA em tickets | ✅ Sim | ✅ `sla_deadline` no schema | Paridade |
| Auto-close por inatividade do contato | ✅ Per-group toggle | ❌ Não implementado | GAP médio |
| Inatividade de usuário → transferência | ✅ Per-group toggle | ❌ Não implementado | GAP médio |

### 1.6 IA e Bot

| Feature | Octadesk | Aimee.IA (Atual) | Status |
|---------|----------|-----------------|--------|
| LLM Agent | ✅ WOZ (`/ai/agents`) | ✅ Gemini via OpenRouter | Paridade |
| `chatbot` counter na inbox | ✅ `inboxCounters.chatbot` | ❌ Sem separação | GAP médio |
| Handoff bot→humano automático | ✅ WOZ detecta disponibilidade | ❌ Manual "Assumir" | **GAP CRÍTICO** |
| Retorno humano→bot | ✅ Configurável | ✅ "Devolver para IA" | Paridade |
| Pesquisa imobiliária via CRM | ❌ Produto genérico | ✅ Vista + C2S + Jetimob | **Vantagem Aimee** |
| Qualificação de leads imobiliários | ❌ | ✅ `lead_qualification` table | **Vantagem Aimee** |

### 1.7 Notificações

| Feature | Octadesk | Aimee.IA (Atual) | Status |
|---------|----------|-----------------|--------|
| Notif. nova conversa sem atribuição | ✅ Visual + Sonora (toggle) | ❌ Não implementado | GAP médio |
| Notif. nova conversa atribuída a você | ✅ Visual + Sonora (toggle) | ❌ Sem notificação push | GAP médio |
| Delay de notificação | ✅ `notifyAgents.delay = 60s` | ❌ Não implementado | GAP baixo |
| Notificar todos ou grupo específico | ✅ `notifyAgents.option = "all"` | ❌ Não implementado | GAP baixo |

---

## 2. Gaps Arquiteturais Críticos (Confirmados ao vivo)

### GAP 1: Ausência de Status de Presença

**Octadesk (confirmado)**: O agente tem `idContactStatus` e `contactStatusEvents` no objeto de perfil. O seletor de status (Disponível/Ausente/Offline) é visível na UI e afeta diretamente:
- Quem aparece na roleta
- Quem aparece na lista de transferência
- Quem recebe notificações

**Aimee.IA**: A tabela `profiles` não possui o campo `presence_status`. Não há UI de seleção de status. O sistema não tem como saber se um operador está ativo.

**Impacto**: Sem presença, a roleta não pode ser implementada — distribuiria para operadores offline.

---

### GAP 2: Ausência da Roleta e da Fila `withoutResponsible`

**Octadesk (confirmado)**: O campo `inboxCounters.withoutResponsible = 1` rastreia conversas na fila aguardando atribuição. O toggle `roulette` (em `chatPreferences`) ativa a distribuição automática para agentes disponíveis.

**Aimee.IA**: Não existe contador `withoutResponsible`. Conversas chegam e ficam na lista geral — não há distinção de "aguardando atribuição" vs "em atendimento".

---

### GAP 3: Ausência de Grupos com Permissões Granulares

**Octadesk (confirmado)**: Grupos têm 6 permissões próprias, incluindo roulette por grupo, limite de carga por grupo, visibilidade restrita e roteamento por número de telefone.

**Aimee.IA**: Existe `department_code` no perfil do operador (locacao/vendas/administrativo), mas não há uma entidade "grupo" com membros, supervisores e permissões configuráveis. É um enum fixo no código, não um registro gerenciável no banco.

---

### GAP 4: Ausência de Limite de Carga por Operador

**Octadesk (confirmado)**: `maxServices.limit` (padrão: 1) com flags `allowManualLimitOverride` e `onlyAdminLimitOverride`. Quando atingido, o agente sai da roleta automaticamente.

**Aimee.IA**: Sem qualquer limite. Um operador pode acumular N conversas sem restrição.

---

### GAP 5: Sem Handoff Automático Bot→Humano

**Octadesk (confirmado)**: O WOZ consulta disponibilidade antes de transferir. A lógica está integrada ao routing engine que verifica `available agents` no grupo-alvo.

**Aimee.IA**: O ai-agent não verifica disponibilidade. Continua respondendo ou para quando `is_ai_active = false` (setado só pelo operador manualmente).

---

## 3. Mapeamento Direto: Vuex Octadesk → Schema Aimee.IA

| Campo Vuex Octadesk | Equivalente Aimee.IA | Ação necessária |
|---------------------|---------------------|-----------------|
| `agent.idContactStatus` | ❌ Não existe | ADD `presence_status` em `profiles` |
| `chatPreferences.roulette` | ❌ Não existe | ADD config em `ai_agent_config` ou nova tabela |
| `chatPreferences.maxServices.limit` | ❌ Não existe | ADD `max_concurrent_conversations` em `profiles` |
| `chatPreferences.automaticSetReponsible` | ❌ Não existe | ADD como config do tenant |
| `chatPreferences.serviceTimeout` | ❌ Em conversas | Já existe em `tickets.sla_deadline` |
| `inboxCounters.withoutResponsible` | ❌ Não existe | Criar view/query derivada |
| `inboxCounters.timeExceeded` | ❌ Não existe | Derivar de `sla_deadline < NOW()` |
| `inboxCounters.chatbot` | ❌ Não existe | Derivar de `is_ai_active = true` |
| `chat.groups` (entidade) | ⚠️ `department_code` enum | Criar tabela `groups` com CRUD |
| `group.phoneNumberRestriction` | ❌ Não existe | Criar tabela `group_phone_rules` |
| `group.transferOnUserInactivity` | ❌ Não existe | Adicionar scheduler/cron |

---

## 4. Vantagens da Aimee.IA sobre o Octadesk

| Vantagem | Aimee.IA | Octadesk |
|----------|----------|----------|
| Especialização imobiliária | ✅ Qualificação de leads (budget, tipo, localização) | ❌ Produto genérico |
| Busca de imóveis em tempo real | ✅ Vista CRM + C2S + Jetimob | ❌ Não tem |
| Pipeline Kanban de vendas | ✅ Stages customizáveis com drag-drop | ❌ Não tem |
| Dados próprios (self-hosted DB) | ✅ PostgreSQL Supabase sob controle | ❌ Black-box SaaS |
| Custo por usuário | ✅ Serverless (Supabase Edge Functions) | ❌ R$ 309–619+/mês |
| Customização de prompts AI | ✅ 100% customizável (Gemini) | ❌ WOZ fechado |
| Audit trail completo | ✅ `conversation_events` + `activity_logs` | ⚠️ Limitado à plataforma |

---

*Evidências: app.octadesk.com ao vivo + código-fonte /Users/ianveras/Desktop/aimeeia*
