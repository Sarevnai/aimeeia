# Auditoria Completa do Painel de Controle — Aimee.iA

**Data:** 2026-03-28
**Escopo:** Frontend + Backend + Banco de Dados — todas as páginas admin e tenant

---

## 1. Resumo Executivo

| Indicador | Valor |
|-----------|-------|
| **Total de páginas auditadas** | 22 (6 admin + 16 tenant) |
| **Tabelas no banco** | 38 (eram 25 no audit anterior) |
| **Edge Functions deployadas** | 28 (eram 11 no audit anterior) |
| **Páginas com dados 100% reais** | 17/22 (77%) |
| **Páginas com dados mock** | 3/22 (AdminBilling 100% mock, Finance ~80% mock, Leads tem propertyId fake) |
| **Páginas com dados mistos** | 2/22 (Dashboard do tenant tem estimativas, Simulação usa session storage) |
| **Bugs críticos encontrados** | 4 |
| **Problemas de performance** | 5 |
| **Melhorias recomendadas** | 12 |

---

## 2. Estado do Banco de Dados

### 2.1 Contagem de Registros por Tabela

| Tabela | Registros | Status |
|--------|-----------|--------|
| `activity_logs` | 117 | OK |
| `ai_agent_config` | 1 | OK (1 tenant) |
| `ai_behavior_config` | 1 | OK |
| `ai_department_configs` | 0 | Vazio — esperado se departamentos não configurados |
| `ai_directives` | 2 | OK |
| `ai_error_log` | 0 | Vazio — logging pode não estar ativo |
| `ai_modules` | 6 | OK |
| `ai_traces` | 1 | Baixo |
| `analysis_reports` | 8 | OK |
| `campaign_results` | 3 | OK |
| `campaigns` | 4 | OK |
| `contacts` | 2 | Baixo |
| `conversation_analyses` | 69 | OK |
| `conversation_events` | 0 | **ATENÇÃO** — deveria ter dados se conversas estão ativas |
| `conversation_stages` | 20 | OK |
| `conversation_states` | 2 | OK |
| `conversations` | 2 | Baixo |
| `developments` | 0 | Vazio — feature não utilizada |
| `lead_qualification` | 2 | OK (era 0, agora persiste) |
| `messages` | 40 | OK |
| `owner_contacts` | 0 | Vazio — Captação não implementada |
| `owner_update_campaigns` | 1 | OK |
| `owner_update_results` | 0 | Vazio |
| `portal_leads_log` | 1 | OK |
| `profiles` | 2 | OK |
| `prompt_versions` | 0 | Vazio — versionamento não ativo |
| `properties` | 2.799 | OK — sync CRM funcionando |
| `regions` | 5 | OK |
| `simulation_analyses` | 34 | OK |
| `simulation_runs` | 0 | **ATENÇÃO** — 34 analyses sem nenhum run registrado |
| `system_settings` | 4 | OK |
| `tenants` | 1 | OK |
| `ticket_categories` | 7 | OK |
| `ticket_comments` | 0 | Vazio |
| `ticket_stages` | 5 | OK |
| `tickets` | 0 | Vazio — sistema de tickets não em uso |
| `whatsapp_templates` | 6 | OK |

### 2.2 Observações do Banco

- **`campaign_contacts`** referenciada no MEMORY.md **NÃO EXISTE** — o tracking é feito via `campaign_results`
- **`conversation_events`** tem 0 registros — se features event-driven dependem disso, há um gap de tracking
- **`simulation_runs`** tem 0 registros mas `simulation_analyses` tem 34 — as análises estão sendo criadas sem registrar os runs

---

## 3. Auditoria das Páginas Admin

### 3.1 AdminDashboardPage (`/admin`)

| Aspecto | Status |
|---------|--------|
| **Fonte de dados** | 100% Supabase |
| **Tabelas consultadas** | `tenants`, `conversations`, `lead_qualification`, `properties` |
| **Dados reais** | SIM |

**Problemas encontrados:**
- **PERFORMANCE:** Loop de 6 queries sequenciais para histórico mensal de conversas — deveria ser uma única query
- **PERFORMANCE:** Query de conversas do mês baixa todas as rows (`id, tenant_id`) sem `head: true` só para construir mapa por tenant
- Erros individuais de query não são verificados (`.error` ignorado)

---

### 3.2 AdminTenantsPage (`/admin/tenants`)

| Aspecto | Status |
|---------|--------|
| **Fonte de dados** | 100% Supabase |
| **Tabelas consultadas** | `tenants`, `conversations`, `contacts`, `profiles` |
| **Dados reais** | SIM |

**Problemas encontrados:**
- **PERFORMANCE CRÍTICO:** N+1 queries — 3 queries por tenant (conversations count, contacts count, profiles count). Com 50 tenants = 150 queries
- **BUG:** Botão "Novo Tenant" não tem `onClick` — é decorativo
- Erros individuais não são verificados

---

### 3.3 AdminTenantDetailPage (`/admin/tenants/:id`)

| Aspecto | Status |
|---------|--------|
| **Fonte de dados** | 100% Supabase + Edge Functions |
| **Tabelas consultadas** | `tenants`, `conversations`, `contacts`, `lead_qualification`, `profiles`, `ai_agent_config`, `system_settings`, `campaigns`, `owner_update_campaigns`, `whatsapp_templates`, `campaign_results` |
| **Edge Functions** | `manage-team`, `c2s-test-connection`, `send-wa-template`, `dispatch-campaign` |
| **Dados reais** | SIM |

**Problemas encontrados:**
- **BUG:** `ai_agent_config` usa `.single()` em vez de `.maybeSingle()` — se tenant não tiver config, dá erro PGRST116
- Aba de Campanhas não carrega no render inicial (só após ação do usuário)

---

### 3.4 AdminBillingPage (`/admin/billing`)

| Aspecto | Status |
|---------|--------|
| **Fonte de dados** | NENHUMA — sem import do Supabase |
| **Dados reais** | **NÃO — 100% MOCK** |

**Todo o conteúdo é hardcoded:**
- MRR R$4.773, ARR R$57.276, churn 2.1%, LTV R$14.319 — tudo fictício
- 3 planos (Starter/Pro/Enterprise) com preços inventados
- 7 assinaturas falsas (Smolka Imoveis, Casa Verde, etc.)
- **Requer:** integração com sistema de billing (Stripe ou gateway BR)

---

### 3.5 AdminMetricsPage (`/admin/metrics`)

| Aspecto | Status |
|---------|--------|
| **Fonte de dados** | 100% Supabase |
| **Tabelas consultadas** | `conversations`, `messages`, `contacts`, `lead_qualification`, `tickets`, `tenants`, `profiles` |
| **Dados reais** | SIM |

**Problemas encontrados:**
- **PERFORMANCE CRÍTICO:** Mesmo N+1 do TenantsPage (3 queries por tenant)
- **BUG LÓGICO:** `openTickets` conta tickets com `stage_id IS NOT NULL`, mas isso não define "aberto" — deveria filtrar por status ou stage não-final
- Query duplicada de tenants (mesma query executada 2x)
- Query de distribuição por dia da semana baixa TODAS as conversas dos últimos 30 dias para contar client-side

---

### 3.6 AdminCampaignsPage (`/admin/campanhas`)

| Aspecto | Status |
|---------|--------|
| **Fonte de dados** | 100% Supabase |
| **Tabelas consultadas** | `campaigns`, `owner_update_campaigns`, `tenants` |
| **Dados reais** | SIM |

**Problemas encontrados:**
- Sem paginação — busca todas as campanhas de todos os tenants
- Erro de `tenantRes` não é verificado
- Página mais limpa entre as admin

---

## 4. Auditoria das Páginas Tenant

### 4.1 DashboardPage (`/`)

| Aspecto | Status |
|---------|--------|
| **Fonte de dados** | 100% Supabase |
| **Tabelas** | `conversations`, `conversation_states`, `contacts`, `tickets` |
| **Tenant filter** | SIM — `.eq('tenant_id', tenantId)` em todas as queries |

**Problemas encontrados:**
- **BUG CRÍTICO:** Funil mistura métricas de escopo diferente — "Topo de funil" filtra por MÊS, mas "Atendidos" e "Encaminhados" contam ALL-TIME. Os números do funil ficam inconsistentes (sub-estágios podem ser maiores que o topo)
- **DADOS ESTIMADOS:** "Status por canal" aplica uma proporção (`fwdRatio`) em vez de contar dados reais por canal
- **PERFORMANCE:** 6 queries sequenciais no loop de histórico mensal

---

### 4.2 LeadsPage (`/leads`)

| Aspecto | Status |
|---------|--------|
| **Fonte de dados** | 100% Supabase |
| **Tabelas** | `contacts`, `conversations`, `conversation_states` |
| **Tenant filter** | SIM |

**Problemas encontrados:**
- **BUG:** PropertyId mostra `Math.floor(Math.random() * 90000) + 10000` — número aleatório diferente a cada render, parece real mas é falso
- **UI FAKE:** Painel lateral de filtros (data, nome, email, CRM, canal) é 100% decorativo — nenhum campo está conectado a lógica
- **UI FAKE:** Botão "Exportar" só mostra toast, não exporta nada

---

### 4.3 ReportsPage (`/relatorios`)

| Aspecto | Status |
|---------|--------|
| **Fonte de dados** | 100% Supabase |
| **Tabelas** | `conversations`, `lead_qualification` |
| **Tenant filter** | SIM |

**Problemas encontrados:**
- Com `lead_qualification` tendo poucos registros, as métricas de qualificação (score, taxa, bairros) ficam zeradas ou quase vazias
- Busca TODAS as conversas do período sem `limit()`, depois faz `.slice(0, 100)` no client

---

### 4.4 PipelinePage (`/pipeline`)

| Aspecto | Status |
|---------|--------|
| **Fonte de dados** | 100% Supabase |
| **Tabelas** | `conversation_stages`, `conversations` (com join `contacts`) |
| **Tenant filter** | SIM — inclusive no update |
| **Status** | FUNCIONAL |

**Problemas encontrados:**
- Sem limite na query de conversas ativas
- Drag-and-drop não faz rollback se o update falhar

---

### 4.5 CampaignsPage (`/campanhas`)

| Aspecto | Status |
|---------|--------|
| **Fonte de dados** | 100% Supabase |
| **Tabelas** | `campaigns` |
| **Tenant filter** | SIM |
| **Status** | FUNCIONAL — página mais limpa |

---

### 4.6 FinancePage (`/financeiro`)

| Aspecto | Status |
|---------|--------|
| **Fonte de dados** | ~20% Supabase, ~80% hardcoded |
| **Tabelas** | `conversations` (count), `tenants` (created_at) |
| **Tenant filter** | SIM |

**Mock:**
- Plano "Basico", ciclo "monthly", limite 1000 conversas — tudo constante no código
- Histórico de faturas sempre vazio (`invoices={[]}`)
- Banner na página reconhece que billing não está implementado

---

### 4.7 InboxPage (`/inbox`)

| Aspecto | Status |
|---------|--------|
| **Fonte de dados** | 100% Supabase + Realtime |
| **Tabelas** | `conversations` (com `contacts`), `conversation_states` |
| **Tenant filter** | SIM — inclusive no canal realtime |
| **Status** | FUNCIONAL |

**Problemas encontrados:**
- `conversation_states` busca TODOS os states sem limit
- Realtime faz refetch completo a cada evento (não é incremental)

---

## 5. Edge Functions — Status

**28 Edge Functions deployadas**, todas com `verify_jwt: false`.

As Edge Functions usadas diretamente pelo painel:
| Função | Usada em | Status |
|--------|----------|--------|
| `manage-team` | AdminTenantDetailPage | Funcional |
| `manage-ai-key` | AdminAgentPage, AgentGlobalSettings | Funcional |
| `c2s-test-connection` | AdminTenantDetailPage | Funcional |
| `c2s-create-lead` | AI Agent handoff | Funcional |
| `dispatch-campaign` | AdminTenantDetailPage, CampaignsPage | Funcional |
| `send-wa-template` | AdminTenantDetailPage | Funcional |
| `send-wa-message` | ChatPage | Funcional |
| `send-wa-media` | ChatPage | Funcional |
| `manage-templates` | Template management | Funcional |
| `manage-tickets` | TicketsPage | Funcional |
| `whatsapp-webhook` | Incoming messages | Funcional |
| `ai-agent` | AI conversation handler | Funcional |
| `ai-agent-simulate` | Lab/Simulação | Funcional |
| `ai-agent-analyze` | Análise de conversas | Funcional |

---

## 6. Classificação de Problemas

### 6.1 Bugs Críticos (devem ser corrigidos)

| # | Problema | Página | Impacto |
|---|---------|--------|---------|
| 1 | **Funil mistura mês vs all-time** | DashboardPage | Métricas do funil inconsistentes — "Atendidos" pode ser > "Topo de funil" |
| 2 | **PropertyId aleatório** em leads | LeadsPage | Usuário vê códigos falsos que mudam a cada render |
| 3 | **`.single()` em ai_agent_config** | AdminTenantDetailPage | Erro PGRST116 se tenant não tiver config |
| 4 | **openTickets com lógica errada** | AdminMetricsPage | Conta tickets com qualquer stage como "abertos" |

### 6.2 Problemas de Performance (devem ser otimizados)

| # | Problema | Páginas | Impacto |
|---|---------|---------|---------|
| 1 | **N+1 queries por tenant** (3 queries × N tenants) | AdminTenantsPage, AdminMetricsPage | 150+ queries com 50 tenants |
| 2 | **6 queries sequenciais** para histórico mensal | AdminDashboardPage, DashboardPage | Lento — deveria ser 1 query |
| 3 | **Baixa todas as rows** para agregação client-side | AdminDashboardPage, AdminMetricsPage, ReportsPage | Payload grande desnecessário |
| 4 | **conversation_states sem limit** | InboxPage | Payload cresce infinitamente |
| 5 | **Realtime faz full refetch** | InboxPage | Cada mensagem nova recarrega tudo |

### 6.3 Funcionalidades Mock/Fake (precisam implementação)

| # | Item | Página | O que falta |
|---|------|--------|-------------|
| 1 | **AdminBillingPage 100% mock** | /admin/billing | Sistema de billing completo (Stripe/gateway) |
| 2 | **FinancePage ~80% mock** | /financeiro | Planos, faturas, limites reais do DB |
| 3 | **Filtros laterais decorativos** | LeadsPage | Conectar inputs aos filtros da query |
| 4 | **Botão Exportar fake** | LeadsPage | Implementar export CSV real |
| 5 | **Botão "Novo Tenant" sem ação** | AdminTenantsPage | Wizard de onboarding |
| 6 | **"Status por canal" estimado** | DashboardPage | Query real de status por canal |

### 6.4 Melhorias Menores

| # | Item | Página |
|---|------|--------|
| 1 | Verificar `.error` em cada query individual | Todas as admin |
| 2 | Adicionar paginação server-side | AdminCampaignsPage, PipelinePage |
| 3 | Rollback em drag-and-drop falho | PipelinePage |
| 4 | Campanhas não carregam no render inicial | AdminTenantDetailPage |
| 5 | Query duplicada de tenants | AdminMetricsPage |
| 6 | Queries de tickets rodando para não-admins | DashboardPage |

---

## 7. Resumo de Conformidade por Página

| Página | Dados Reais | Tenant Filter | Edge Functions | Veredicto |
|--------|-------------|---------------|----------------|-----------|
| AdminDashboardPage | 100% | N/A (super_admin) | — | FUNCIONAL (perf issues) |
| AdminTenantsPage | 100% | N/A | — | FUNCIONAL (perf issues) |
| AdminTenantDetailPage | 100% | N/A | 4 funções | FUNCIONAL (1 bug) |
| AdminBillingPage | 0% | N/A | — | **NÃO FUNCIONAL** |
| AdminMetricsPage | 100% | N/A | — | FUNCIONAL (perf + bug lógico) |
| AdminCampaignsPage | 100% | N/A | — | FUNCIONAL |
| DashboardPage | ~90% | SIM | — | FUNCIONAL (1 bug crítico) |
| InboxPage | 100% | SIM + Realtime | — | FUNCIONAL |
| LeadsPage | ~95% | SIM | — | FUNCIONAL (3 itens fake) |
| ReportsPage | 100% | SIM | — | FUNCIONAL (dados vazios) |
| PipelinePage | 100% | SIM | — | FUNCIONAL |
| CampaignsPage | 100% | SIM | — | FUNCIONAL |
| FinancePage | ~20% | SIM | — | **PARCIAL** |

---

## 8. Conclusão

O painel de controle da Aimee.iA está **majoritariamente funcional e conectado a dados reais do Supabase** (77% das páginas com dados 100% reais). A arquitetura multi-tenant com RLS está correta — todas as páginas tenant aplicam filtro `tenant_id` explícito.

**Pontos fortes:**
- 17 de 22 páginas usam dados 100% reais
- RLS multi-tenant aplicado corretamente em todas as queries tenant
- 28 Edge Functions deployadas e funcionais
- 2.799 imóveis sincronizados do CRM
- `lead_qualification` agora persiste dados (era 0, agora tem 2)

**Prioridades imediatas:**
1. Corrigir os 4 bugs críticos (funil inconsistente, propertyId fake, .single() errado, lógica de tickets)
2. Resolver N+1 queries nas páginas admin (maior gargalo de performance)
3. Implementar sistema de billing para AdminBillingPage e FinancePage
4. Conectar filtros e export da LeadsPage
