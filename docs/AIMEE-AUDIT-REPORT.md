# Aimee.iA - Relat\u00f3rio de Auditoria End-to-End

> **Data**: 22/02/2026
> **Vers\u00e3o**: 1.0
> **Autor**: Auditoria automatizada via Claude Code

---

## 1. O QUE \u00c9 A APLICA\u00c7\u00c3O

**Aimee.iA** \u00e9 uma plataforma SaaS de IA conversacional para o mercado imobili\u00e1rio brasileiro. Funciona como uma assistente virtual que atende leads via WhatsApp, qualifica automaticamente, busca im\u00f3veis no cat\u00e1logo do CRM, e encaminha leads qualificados para corretores.

### Para quem \u00e9
- Imobili\u00e1rias de m\u00e9dio/grande porte que recebem alto volume de leads via portais (ZAP, VivaReal, OLX, ImovelWeb) e WhatsApp
- Principalmente loca\u00e7\u00e3o e vendas residenciais

### Proposta de valor
- Atendimento 24/7 via IA no WhatsApp
- Triagem autom\u00e1tica (loca\u00e7\u00e3o vs vendas vs administrativo)
- Qualifica\u00e7\u00e3o inteligente (bairro, tipo de im\u00f3vel, quartos, faixa de pre\u00e7o)
- Busca de im\u00f3veis no cat\u00e1logo real do CRM (Vista Software)
- Handoff para CRM quando lead qualificado (C2S/Jetimob)
- Campanhas de WhatsApp em massa
- Atualiza\u00e7\u00e3o de cadastro de propriet\u00e1rios
- Pipeline Kanban para gest\u00e3o de atendimentos

### Stack T\u00e9cnica
- **Frontend**: React 18 + TypeScript + Vite + Tailwind + Shadcn/UI
- **Backend**: Supabase (PostgreSQL + Edge Functions + Auth + Storage + Realtime)
- **IA**: Google Gemini via OpenRouter (`ai-call.ts`)
- **WhatsApp**: Meta Cloud API
- **Deploy frontend**: Lovable
- **Deploy backend**: Supabase Cloud (project: `vnysbpnggnplvgkfokin`)

### Arquitetura
```
Usu\u00e1rio \u2192 WhatsApp \u2192 Meta Cloud API \u2192 whatsapp-webhook (Edge Function)
                                            \u2193
                                    ai-agent (Edge Function)
                                    \u251c\u2500\u2500 triage.ts (departamento)
                                    \u251c\u2500\u2500 qualification.ts (dados do lead)
                                    \u251c\u2500\u2500 property.ts \u2192 vista-search-properties
                                    \u251c\u2500\u2500 anti-loop.ts (evita repeti\u00e7\u00e3o)
                                    \u2514\u2500\u2500 c2s-create-lead (handoff CRM)
                                            \u2193
                                    send-wa-message (resposta)
                                            \u2193
                                    WhatsApp \u2192 Usu\u00e1rio

Portal (ZAP, VivaReal) \u2192 portal-leads-webhook \u2192 IA assume conversa
```

---

## 2. O QUE EXISTE - INVENT\u00c1RIO COMPLETO

### 2.1 P\u00e1ginas do Frontend (17 p\u00e1ginas + 6 admin)

| Rota | P\u00e1gina | Acesso | Status |
|------|--------|--------|--------|
| `/` | Dashboard | Todos | **Funcional** - queries reais ao Supabase |
| `/inbox` | Inbox (Conversas) | Todos | **Funcional** - lista conversas reais |
| `/chat/:id` | Chat Individual | Todos | **Funcional** - mensagens em tempo real |
| `/history/:id` | Hist\u00f3rico de Conversa | Todos | **Funcional** - visualiza\u00e7\u00e3o readonly |
| `/leads` | Lista de Leads | Todos | **Parcial** - bot\u00e3o exportar `disabled` |
| `/pipeline` | Pipeline Kanban | Todos | **Funcional** - drag & drop com stages |
| `/campanhas` | Campanhas WhatsApp | operator+ | **Funcional** - cria/gerencia campanhas |
| `/campanhas/:id` | Detalhe da Campanha | operator+ | **Funcional** - resultados de envio |
| `/relatorios` | Relat\u00f3rios | Todos | **A verificar** - pode ter dados mock |
| `/empreendimentos` | Empreendimentos | operator+ | **Funcional** - CRUD com Supabase |
| `/empreendimentos/novo` | Novo Empreendimento | admin+ | **Funcional** - form com upload de imagem |
| `/captacao` | Capta\u00e7\u00e3o de Leads | operator+ | **Funcional** - mostra qualifica\u00e7\u00f5es do DB |
| `/atualizacao` | Atualiza\u00e7\u00e3o de Im\u00f3veis | operator+ | **Funcional** - campanhas de propriet\u00e1rios |
| `/templates` | Templates WhatsApp | operator+ | **Funcional** - sync com Meta API |
| `/minha-aimee` | Configura\u00e7\u00f5es IA | admin+ | **Parcial** - parte mock, parte funcional |
| `/acessos` | Gest\u00e3o de Equipe | admin+ | **Funcional** - via Edge Function manage-team |
| `/financeiro` | Financeiro | admin+ | **Mock completo** - dados hardcoded |
| `/guia` | Guia/Onboarding | Todos | **A verificar** |
| `/admin/*` | Central de Comando | super_admin | **Mock** - ver se\u00e7\u00e3o 4 |

### 2.2 Edge Functions em Produ\u00e7\u00e3o (11 fun\u00e7\u00f5es)

| Fun\u00e7\u00e3o | Prop\u00f3sito | JWT | Status |
|--------|-----------|-----|--------|
| `ai-agent` | C\u00e9rebro da IA - processa mensagens, triagem, qualifica\u00e7\u00e3o, busca im\u00f3veis | Off | **Funcional** |
| `whatsapp-webhook` | Recebe mensagens do Meta Cloud API | Off | **Funcional** |
| `send-wa-message` | Envia mensagem de texto via WhatsApp | Off | **Funcional** |
| `send-wa-media` | Envia m\u00eddia (imagem/doc) via WhatsApp | Off | **Funcional** |
| `send-wa-template` | Envia templates aprovados do WhatsApp | Off | **Funcional** |
| `manage-templates` | Sync/CRUD de templates com Meta API | Off | **Funcional** |
| `vista-search-properties` | Busca im\u00f3veis no CRM Vista | Off | **Funcional** |
| `vista-get-property` | Detalhe de im\u00f3vel no Vista | Off | **Funcional** |
| `c2s-create-lead` | Envia lead qualificado para CRM C2S | Off | **Funcional** |
| `portal-leads-webhook` | Recebe leads de portais imobili\u00e1rios | Off | **Funcional** |
| `manage-team` | Gest\u00e3o de equipe/acessos | Off | **Funcional** |

### 2.3 Banco de Dados (25 tabelas no Supabase)

**Tabelas Core:**
- `tenants` (1 row) - multi-tenant principal
- `profiles` (2 rows) - usu\u00e1rios vinculados a tenants, roles: admin/operator/viewer/super_admin
- `contacts` (1 row) - contatos/leads
- `conversations` (1 row) - conversas WhatsApp
- `messages` (22 rows) - mensagens das conversas
- `conversation_states` (2 rows) - estado da conversa com IA (triagem, IA ativa, propriedades pendentes)
- `conversation_stages` (14 rows) - est\u00e1gios do pipeline Kanban
- `lead_qualification` (0 rows) - dados de qualifica\u00e7\u00e3o (bairro, tipo, quartos, or\u00e7amento)

**Tabelas IA:**
- `ai_agent_config` (1 row) - config do agente (nome, tom, modelo, greeting, fallback)
- `ai_behavior_config` (1 row) - comportamento (reengagement, CPF, cold leads, fun\u00e7\u00f5es)
- `ai_department_configs` (0 rows) - config por departamento (loca\u00e7\u00e3o/vendas/admin)
- `ai_directives` (1 row) - prompts/instru\u00e7\u00f5es customizadas da IA
- `ai_error_log` (0 rows) - log de erros da IA

**Tabelas Campanhas:**
- `campaigns` (0 rows) - campanhas de WhatsApp
- `campaign_results` (0 rows) - resultados por envio
- `whatsapp_templates` (10 rows) - templates aprovados pelo Meta

**Tabelas Atualiza\u00e7\u00e3o de Im\u00f3veis:**
- `owner_contacts` (0 rows) - propriet\u00e1rios de im\u00f3veis
- `owner_update_campaigns` (1 row) - campanhas de atualiza\u00e7\u00e3o
- `owner_update_results` (0 rows) - resultados por propriet\u00e1rio

**Tabelas Auxiliares:**
- `regions` (1 row) - regi\u00f5es e bairros por tenant
- `developments` (0 rows) - empreendimentos (nome, pre\u00e7o, bairro, FAQ, AI instructions)
- `portal_leads_log` (0 rows) - log de leads de portais
- `system_settings` (1 row) - configura\u00e7\u00f5es gen\u00e9ricas (JSON)
- `activity_logs` (9 rows) - log de atividades do sistema
- `tickets` (0 rows) - tickets de suporte/atendimento

### 2.4 Shared Code Backend (`supabase/functions/_shared/`)

| Arquivo | Fun\u00e7\u00e3o |
|---------|--------|
| `ai-call.ts` | Chamada ao LLM (OpenRouter) com tool calling e loop de execu\u00e7\u00e3o |
| `anti-loop.ts` | Detec\u00e7\u00e3o de perguntas repetitivas da IA (Jaccard similarity) |
| `property.ts` | Busca e formata\u00e7\u00e3o de im\u00f3veis do CRM |
| `qualification.ts` | Extra\u00e7\u00e3o de dados de qualifica\u00e7\u00e3o do lead via regex |
| `regions.ts` | Carregamento e normaliza\u00e7\u00e3o de bairros do DB |
| `supabase.ts` | Client Supabase + CORS helpers |
| `triage.ts` | Classifica\u00e7\u00e3o de departamento (loca\u00e7\u00e3o/vendas/admin) |
| `utils.ts` | Logging, formata\u00e7\u00e3o de moeda, activity logs |
| `whatsapp.ts` | Envio de mensagens WhatsApp via Meta API |
| `types.ts` | Tipos TypeScript compartilhados (Tenant, Region, etc.) |
| `prompts.ts` | Prompts do sistema para a IA |

### 2.5 Seguran\u00e7a
- **RLS**: Habilitado em todas as 25 tabelas
- **Fun\u00e7\u00e3o helper**: `get_user_tenant_id()` garante isolamento multi-tenant
- **Roles**: admin, operator, viewer, super_admin (enum `user_role`)
- **RoleGuard**: Componente React que restringe acesso por role m\u00ednimo
- **Edge Functions**: JWT desabilitado em todas (problema de seguran\u00e7a)

---

## 3. INTEGRA\u00c7\u00d5ES - COMO FUNCIONAM

### 3.1 WhatsApp (Meta Cloud API) - FUNCIONAL
- **Webhook inbound**: `whatsapp-webhook` recebe mensagens, processa via `ai-agent`
- **Envio de texto**: `send-wa-message` - chamada direta \u00e0 Meta API
- **Envio de m\u00eddia**: `send-wa-media` - imagens, documentos, \u00e1udio
- **Envio de template**: `send-wa-template` - templates aprovados com par\u00e2metros
- **Config por tenant**: `wa_phone_number_id`, `wa_access_token`, `wa_verify_token`, `waba_id` na tabela `tenants`
- **Templates**: `manage-templates` sincroniza com Meta Business API (list/create)
- **Fluxo**: Mensagem chega \u2192 webhook \u2192 ai-agent processa \u2192 responde via send-wa-message

### 3.2 CRM Vista Software - FUNCIONAL (busca)
- **Busca de im\u00f3veis**: `vista-search-properties` - filtros por bairro, tipo, quartos, pre\u00e7o min/max
- **Detalhe de im\u00f3vel**: `vista-get-property` - dados completos de um im\u00f3vel
- **Config**: `crm_type='vista'`, `crm_api_key`, `crm_api_url` na tabela `tenants`
- **Adapter pattern**: Verifica `crm_type` antes de chamar, extens\u00edvel para outros CRMs
- **Limita\u00e7\u00e3o**: Apenas busca. N\u00e3o h\u00e1 sincroniza\u00e7\u00e3o de im\u00f3veis para DB local
- **Tool calling**: A IA chama `search_properties` e `get_property_details` como tools

### 3.3 CRM C2S (Construtor de Vendas) - PARCIAL
- **Handoff de lead**: `c2s-create-lead` envia lead qualificado para C2S via API
- **Config**: via `system_settings` com key `c2s_config` (JSON com API key, URL)
- **Quando dispara**: Quando IA detecta lead qualificado e pronto para corretor
- **Limita\u00e7\u00e3o**: Sem UI dedicada para configurar C2S. Config via JSON gen\u00e9rico

### 3.4 CRM Jetimob - N\u00c3O IMPLEMENTADO
- Mencionado como CRM suportado mas sem c\u00f3digo de integra\u00e7\u00e3o
- O adapter pattern do Vista permite extens\u00e3o futura

### 3.5 Portais Imobili\u00e1rios - FUNCIONAL
- **Webhook**: `portal-leads-webhook` recebe leads de ZAP, VivaReal, OLX, ImovelWeb
- **Fluxo**: Recebe lead \u2192 normaliza telefone \u2192 cria/busca contato \u2192 cria conversa \u2192 envia greeting proativo \u2192 IA assume
- **Suporta**: lead_name, lead_phone, lead_email, property_code, property_title, development_id, source
- **Log**: Registra em `portal_leads_log` com payload raw

### 3.6 LLM (OpenRouter/Gemini) - FUNCIONAL
- **Chamada**: `ai-call.ts` via OpenRouter API (`openrouter.ai/api/v1/chat/completions`)
- **Modelo padr\u00e3o**: `gpt-4o-mini` (configur\u00e1vel por tenant em `ai_agent_config.ai_model`)
- **Tool calling**: Suporta tools (busca de im\u00f3veis, handoff CRM) com loop de execu\u00e7\u00e3o
- **Anti-loop**: Detecta perguntas repetitivas (similarity > 85%)
- **Hist\u00f3rico**: Carrega \u00faltimas N mensagens da conversa como contexto

---

## 4. CENTRAL DE COMANDO (Admin `/admin/*`)

### 4.1 Estado atual

| P\u00e1gina | Arquivo | Status |
|--------|---------|--------|
| `/admin` | `AdminDashboardPage.tsx` | **MOCK** - dados hardcoded |
| `/admin/tenants` | `AdminTenantsPage.tsx` | **MOCK** - lista fake |
| `/admin/tenants/:id` | `AdminTenantDetailPage.tsx` | **MOCK** - detalhe fake |
| `/admin/billing` | `AdminBillingPage.tsx` | **MOCK** - billing fake |
| `/admin/agent` | `AdminAgentPage.tsx` | **MOCK** - config est\u00e1tica |
| `/admin/metrics` | `AdminMetricsPage.tsx` | **MOCK** - m\u00e9tricas fake |

### 4.2 Sobre a Atualiza\u00e7\u00e3o de Im\u00f3veis (Disparos)
A p\u00e1gina `/atualizacao` gerencia campanhas de atualiza\u00e7\u00e3o com propriet\u00e1rios:
1. Cadastrar propriet\u00e1rios (`owner_contacts`)
2. Criar campanha (`owner_update_campaigns`) com template de mensagem
3. Disparar mensagens via `send-wa-template`
4. Acompanhar respostas e status

**Pend\u00eancia**: N\u00e3o h\u00e1 sistema de cobran\u00e7a/or\u00e7amento para disparos. Modelo de cobran\u00e7a de mensagens ainda n\u00e3o definido.

---

## 5. BUGS, HARDCODED E PROBLEMAS

### 5.1 Dados Hardcoded / Mock

| Local | Problema | Criticidade |
|-------|----------|-------------|
| `src/pages/admin/AdminDashboardPage.tsx` | Todo mock - 12 tenants, MRR R$4773 | Alta |
| `src/pages/admin/AdminTenantsPage.tsx` | Lista de tenants fake | Alta |
| `src/pages/admin/AdminTenantDetailPage.tsx` | Detalhe de tenant fake | Alta |
| `src/pages/admin/AdminBillingPage.tsx` | Billing totalmente fake | Alta |
| `src/pages/admin/AdminAgentPage.tsx` | Config de agente est\u00e1tica | Alta |
| `src/pages/admin/AdminMetricsPage.tsx` | M\u00e9tricas fake | Alta |
| `src/pages/FinancePage.tsx` | Boleto, plano, hist\u00f3rico fake | Alta |
| `src/pages/MinhaAimeePage.tsx` | Refer\u00eancia `model: 'gpt-4o'` hardcoded | M\u00e9dia |
| `src/components/settings/MeuNegocioView.tsx` | Defaults com telefones reais (fallback) | Baixa |

### 5.2 Bugs e Problemas T\u00e9cnicos

| Problema | Local | Detalhes |
|----------|-------|----------|
| JWT desabilitado em todas Edge Functions | Produ\u00e7\u00e3o | `verify_jwt: false` - seguran\u00e7a fraca |
| Bot\u00e3o Exportar desabilitado | `LeadsPage.tsx` | `disabled` permanente sem funcionalidade |
| Bot\u00e3o "Baixar boleto" sem a\u00e7\u00e3o | `CurrentInvoiceCard.tsx` | Button sem onClick |
| `ai_department_configs` vazio | DB | Nenhuma config por departamento |
| `lead_qualification` vazio | DB | Pode indicar que qualifica\u00e7\u00e3o n\u00e3o persiste |
| `developments` vazio | DB | 0 empreendimentos cadastrados |
| Import path inconsistente | V\u00e1rios | `@/hooks/use-toast` vs `@/components/ui/use-toast` |
| CRM C2S sem UI de config | Frontend | Config via JSON gen\u00e9rico em system_settings |
| Sem rate limiting | Edge Functions | Sem prote\u00e7\u00e3o contra abuso |

### 5.3 Funcionalidades Visuais N\u00e3o Funcionais

| Feature | Onde | Status |
|---------|------|--------|
| Financeiro completo | `/financeiro` | 100% visual, 0% funcional |
| Central Admin completa | `/admin/*` | 100% visual, 0% funcional |
| Upgrade de plano | `PlanUpgradeDialog.tsx` | Visual sem backend |
| Download de boleto | `CurrentInvoiceCard.tsx` | Bot\u00e3o sem a\u00e7\u00e3o |
| Exportar leads | `LeadsPage.tsx` | Bot\u00e3o desabilitado |

---

## 6. AN\u00c1LISE MVP - PERCENTUAL E O QUE FALTA

### Pronto (~60-65%)

- [x] Autentica\u00e7\u00e3o multi-tenant com roles
- [x] Dashboard com dados reais
- [x] Inbox/Chat com mensagens reais e realtime
- [x] IA conversacional com triagem e qualifica\u00e7\u00e3o
- [x] Busca de im\u00f3veis via Vista CRM
- [x] Pipeline Kanban com drag & drop
- [x] Campanhas de WhatsApp
- [x] Templates WhatsApp (sync com Meta)
- [x] Gest\u00e3o de equipe com c\u00f3digo de acesso
- [x] Portal leads webhook
- [x] Atualiza\u00e7\u00e3o de propriet\u00e1rios (estrutura)
- [x] Capta\u00e7\u00e3o (detec\u00e7\u00e3o de oportunidades)
- [x] Empreendimentos (CRUD)
- [x] RLS multi-tenant em todas as tabelas
- [x] Configura\u00e7\u00e3o de IA (parcial)
- [x] Anti-loop na IA
- [x] Handoff para CRM C2S

### Falta para MVP vend\u00e1vel (~35-40%)

**Cr\u00edtico:**
1. Sistema de billing/pagamentos (gateway, planos, faturas)
2. Central de Comando funcional (dados reais, CRUD tenants)
3. Onboarding de novo tenant (wizard de config)
4. Seguran\u00e7a das Edge Functions (JWT, rate limiting)

**Importante:**
5. Integra\u00e7\u00e3o CRM Jetimob
6. Exporta\u00e7\u00e3o de dados (CSV de leads)
7. Relat\u00f3rios com dados reais
8. Controle de custo de disparos
9. Notifica\u00e7\u00f5es (email/push)
10. Logs e auditoria vis\u00edvel

**Diferencial:**
11. Agendamento de visitas com calend\u00e1rio
12. Widget de chat para site
13. Dashboard de ROI
14. API p\u00fablica

---

## 7. DECIS\u00d5ES PENDENTES

| Decis\u00e3o | Op\u00e7\u00f5es | Status |
|---------|--------|--------|
| Gateway de pagamento | Stripe / Asaas / iugu | N\u00e3o definido |
| Planos e pricing | Starter / Pro / Enterprise | N\u00e3o definido |
| Cobran\u00e7a de mensagens | Incluso no plano / Por mensagem / Cr\u00e9ditos | N\u00e3o definido |
| Integra\u00e7\u00e3o Jetimob | Prioridade vs outros features | N\u00e3o definido |
| Onboarding | Self-service vs assistido | N\u00e3o definido |

---

## 8. ROADMAP

### Sprint 1 - Funda\u00e7\u00e3o (Central + Seguran\u00e7a) - EM ANDAMENTO
1. [x] Criar este relat\u00f3rio de auditoria
2. [ ] Ativar JWT nas Edge Functions cr\u00edticas
3. [ ] Conectar AdminDashboardPage a dados reais
4. [ ] Conectar AdminTenantsPage a dados reais
5. [ ] Conectar AdminTenantDetailPage a dados reais

### Sprint 2 - Billing + Financeiro (AGUARDANDO CONFIRMA\u00c7\u00c3O)
1. Definir modelo de planos
2. Integrar gateway de pagamento
3. Criar tabelas subscriptions/invoices
4. Conectar FinancePage a dados reais

### Sprint 3 - Onboarding + Polish (AGUARDANDO CONFIRMA\u00c7\u00c3O)
1. Wizard de onboarding para novo tenant
2. Exporta\u00e7\u00e3o de leads (CSV)
3. Relat\u00f3rios com dados reais
4. Modelo de cobran\u00e7a de mensagens

---

## 9. CHANGELOG

> Todas as mudan\u00e7as futuras devem ser registradas aqui.

| Data | Mudan\u00e7a | Arquivos |
|------|---------|----------|
| 22/02/2026 | Cria\u00e7\u00e3o do relat\u00f3rio de auditoria | `docs/AIMEE-AUDIT-REPORT.md` |
