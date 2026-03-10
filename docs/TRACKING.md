# Aimee.IA — Acompanhamento de Progresso

**Última atualização:** 2026-03-10

---

## Resumo Executivo

| Indicador | Valor |
|-----------|-------|
| **Progresso geral do MVP** | 72% |
| **Fases concluídas** | 4 de 6 |
| **Fase atual** | Fase 5 — Gaps Críticos |
| **Sprint atual** | Pré-Sprint 1 (planejamento) |
| **Nota UX/UI** | 9.5/10 |
| **Tabelas no banco** | 34+ |
| **Edge Functions** | 15 |
| **Páginas da aplicação** | 20+ |

---

## O Que Já Foi Feito (Inventário Completo)

### Infraestrutura e DevOps
- [x] Projeto Supabase configurado (PostgreSQL + Auth + Storage + Realtime)
- [x] Vite + React 18 + TypeScript configurados
- [x] ESLint + Vitest configurados
- [x] Deploy via Lovable (git-push)
- [x] 34 migrations aplicadas
- [x] RLS multi-tenant em todas as tabelas
- [x] Storage bucket para imagens de empreendimentos
- [x] Scripts de execução (deploy, teste, diagnóstico)

### Autenticação e Autorização
- [x] Login email/senha via Supabase Auth
- [x] Roles: super_admin, admin, operator, viewer
- [x] Contexto de autenticação (AuthContext)
- [x] Contexto de tenant (TenantContext)
- [x] Filtro por departamento (DepartmentFilterContext)
- [x] Proteção de rotas por role
- [x] Página de login (`AuthPage`)

### Motor de IA
- [x] Edge Function `ai-agent` (orquestrador principal)
- [x] Triagem em 4 estágios (FSM)
- [x] Qualificação de leads (regex + scoring)
- [x] Busca de imóveis (Vista API)
- [x] Anti-loop (detecção de repetição)
- [x] Prompts customizáveis por tenant
- [x] Prompts por departamento
- [x] Error logging (tabela `ai_error_log`)
- [x] Diretivas de IA (`ai_directives`)

### WhatsApp
- [x] Webhook de recebimento (`whatsapp-webhook`)
- [x] Envio de texto (`send-wa-message`)
- [x] Envio de mídia (`send-wa-media`)
- [x] Envio de templates (`send-wa-template`)
- [x] Gestão de templates (`manage-templates`)
- [x] Ingestão de leads via portal (`portal-leads-webhook`)

### Integração CRM
- [x] Vista Landscape (busca + detalhes de imóveis)
- [x] Fila XML para sync de catálogo
- [x] Config XML por tenant
- [x] Handoff para CRM (`c2s-create-lead`)
- [x] Vetores pgvector para busca semântica

### Interface — Operação
- [x] Inbox (lista de conversas com filtros, busca, tabs)
- [x] Chat (histórico, sidebar de qualificação, upload, toggle IA)
- [x] Leads (tabela paginada, filtros, ações em lote, exportação)
- [x] Pipeline Kanban (drag-drop, stages customizáveis)
- [x] Dashboard (funil, canais, tendências diárias/horárias)
- [x] Relatórios (conversão, bairros, scores, gráficos)
- [x] Histórico de conversas

### Interface — Gestão
- [x] Tickets/Chamados (Kanban + categorias + SLA)
- [x] Detalhe de ticket (histórico, comentários, resolução)
- [x] Campanhas WhatsApp (criar, enviar, acompanhar)
- [x] Detalhe de campanha (resultados de entrega)
- [x] Empreendimentos (CRUD com upload de imagens)
- [x] Templates WhatsApp (CRUD)

### Interface — Admin (Super Admin)
- [x] Dashboard administrativo
- [x] Lista de tenants (com status)
- [x] Detalhe de tenant (configuração)
- [x] Billing (assinaturas, MRR)
- [x] Configuração de agente IA
- [x] Métricas da plataforma
- [x] Gestão de campanhas

### Design System
- [x] Componente PageHeader (reutilizável)
- [x] Componente ConfirmDialog
- [x] Componente EmptyState
- [x] Componentes Skeleton (MetricCard, TableRow, ListCard, etc.)
- [x] Animações (fade-in, slide-up, skeleton-pulse)
- [x] Card hover interativo (.card-interactive)
- [x] Focus ring acessível
- [x] Scrollbar customizada
- [x] Tema dark mode (next-themes)
- [x] 8pt grid system aplicado

### Documentação
- [x] Diretivas de fluxo (triage, qualification, property, anti-loop, handoff, tickets)
- [x] Tenant onboarding checklist
- [x] Comparativo Octadesk vs Aimee.IA
- [x] Plano de implementação (grupos/presença)
- [x] Auditoria UX/UI
- [x] Workflow de debug de autenticação

---

## O Que Precisa Ser Feito

### Prioridade Crítica (Bloqueadores para Go-to-Market)

| # | Item | Esforço | Dependência | Sprint |
|---|------|---------|-------------|--------|
| 1 | Presença de operadores (available/away/offline) | M | Nenhuma | Sprint 1 |
| 2 | Tabela `groups` + CRUD (substituir enum) | G | Nenhuma | Sprint 1 |
| 3 | UI seletor de status no header | P | #1 | Sprint 1 |
| 4 | Página de gestão de grupos | M | #2 | Sprint 1 |
| 5 | Routing engine (`route-conversation`) | G | #1, #2 | Sprint 2 |
| 6 | Roleta automática (round-robin) | G | #5 | Sprint 2 |
| 7 | Handoff automático bot → humano | M | #5 | Sprint 2 |
| 8 | Fila `withoutResponsible` | M | #5 | Sprint 2 |
| 9 | Limite de carga por operador | P | #5 | Sprint 2 |

**Legenda de esforço:** P = Pequeno (1-2 dias), M = Médio (3-5 dias), G = Grande (5-10 dias)

### Prioridade Alta

| # | Item | Esforço | Dependência | Sprint |
|---|------|---------|-------------|--------|
| 10 | Badges/contadores na sidebar | M | #8 | Sprint 3 |
| 11 | Dashboard de fila (`/inbox/fila`) | M | #8 | Sprint 3 |
| 12 | Notificações de conversa atribuída | M | #6 | Sprint 3 |
| 13 | Backend wiring "Minha Aimee" | M | Nenhuma | Sprint 3 |
| 14 | Sticky routing (responsável por contato) | P | #5 | Sprint 3 |
| 15 | Forçar atribuição (admin) | P | #8 | Sprint 3 |

### Prioridade Média

| # | Item | Esforço | Dependência | Sprint |
|---|------|---------|-------------|--------|
| 16 | Preferências de atendimento (toggles) | M | #2 | Sprint 4 |
| 17 | SLA em conversas (primeira resposta) | M | Nenhuma | Sprint 4 |
| 18 | pg_cron para alertas de SLA breach | P | #17 | Sprint 4 |
| 19 | Auto-close por inatividade | P | Nenhuma | Sprint 4 |
| 20 | Página financeira funcional | M | Nenhuma | Sprint 4 |

### Prioridade Baixa (Pós-MVP)

| # | Item | Esforço | Sprint |
|---|------|---------|--------|
| 21 | Onboarding tour para novos usuários | M | Pós-MVP |
| 22 | Email de notificação (convites, alertas) | M | Pós-MVP |
| 23 | Página de acessos/permissões completa | M | Pós-MVP |
| 24 | Tooltips na sidebar colapsada | P | Pós-MVP |
| 25 | Atalhos de teclado | P | Pós-MVP |
| 26 | Documentação do usuário (Guia interativo) | G | Pós-MVP |
| 27 | Testes automatizados (cobertura >70%) | G | Pós-MVP |
| 28 | SSO/SAML | G | Pós-MVP |
| 29 | 2FA | M | Pós-MVP |

---

## Métricas de Progresso por Área

| Área | Completo | Total | % |
|------|----------|-------|---|
| Infraestrutura | 8 | 8 | 100% |
| Autenticação | 7 | 7 | 100% |
| Motor de IA | 9 | 9 | 100% |
| WhatsApp | 6 | 6 | 100% |
| CRM | 5 | 5 | 100% |
| Interface Operação | 7 | 7 | 100% |
| Interface Gestão | 6 | 6 | 100% |
| Interface Admin | 7 | 7 | 100% |
| Design System | 10 | 10 | 100% |
| Roteamento | 0 | 9 | 0% |
| Gerencial | 0 | 6 | 0% |
| Preferências | 0 | 5 | 0% |
| Polish/Launch | 0 | 9 | 0% |
| **TOTAL** | **65** | **94** | **69%** |

---

## Changelog

### 2026-03-10
- Criado roadmap do MVP
- Criada estrutura de acompanhamento
- Inventário completo de features existentes
- Priorização de gaps críticos para go-to-market

---

*Atualizar este documento ao final de cada sprint.*
