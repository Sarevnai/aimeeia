# Aimee.iA — Project Documentation Index

**Generated:** 2026-03-30 | **Scan Level:** Exhaustive | **Workflow:** BMad Document Project

---

## Project Overview

- **Type:** Monolith (SPA + Serverless)
- **Primary Language:** TypeScript
- **Architecture:** Component-based frontend + Serverless microservices backend
- **Multi-tenancy:** PostgreSQL RLS via `tenant_id`

### Quick Reference

- **Frontend:** React 18 + Vite + Tailwind + Shadcn/UI
- **Backend:** Supabase Edge Functions (Deno) + PostgreSQL
- **Entry Point:** `src/main.tsx` → `src/App.tsx` (routes)
- **Architecture Pattern:** SPA + Serverless + Multi-agent AI
- **Supabase Project:** `vnysbpnggnplvgkfokin`
- **Hosting:** Vercel (frontend) + Supabase (backend)

---

## Generated Documentation

### Core
- [Project Overview](./project-overview.md) — Executive summary, tech stack, key numbers
- [Architecture](./architecture.md) — System architecture, AI agent design, data flow, deployment
- [Source Tree Analysis](./source-tree-analysis.md) — Annotated directory tree with purpose descriptions

### Technical Reference
- [API Contracts](./api-contracts.md) — All 24 Edge Functions: methods, auth, request/response
- [Data Models](./data-models.md) — 31 tables, enums, relationships, key columns
- [Component Inventory](./component-inventory.md) — All UI components categorized by feature

### Guides
- [Development Guide](./development-guide.md) — Setup, commands, conventions, deployment, code patterns

---

## Existing Documentation

### Analysis & Reports
- [Panel Audit (2026-03-28)](./analysis-reports/PANEL-AUDIT-2026-03-28.md) — Latest panel audit
- [Leads Analysis (2026-03-13)](./ANALISE-LEADS-ATIVOS-2026-03-13.md) — Active leads analysis
- [UX/UI Audit](./UX_UI_AUDIT.md) — UX/UI audit findings
- [AI Analysis Log](./AI-ANALYSIS-LOG.md) — AI conversation analysis log

### Competitive Analysis
- [Octadesk Report](./relatorio_octadesk.md) — Octadesk platform analysis
- [Octadesk vs Aimee](./comparativo_octadesk_vs_aimee.md) — Feature comparison
- [Implementation Plan](./plano_implementacao_aimee.md) — Implementation roadmap

### Simulation Reports
- [Hallef/Ian Simulation](./analysis-reports/hallef-ian-v1.md)
- [Remarketing Sim 1](./analysis-reports/sim-remarketing-1-v1.md)
- [Remarketing Sim 2](./analysis-reports/sim-remarketing-2-v1.md)

---

## AI Flow Documentation (`directives/`)

| Directive | Purpose |
|-----------|---------|
| [flow-triage.md](../directives/flow-triage.md) | Triage flow specification |
| [flow-qualification.md](../directives/flow-qualification.md) | Lead qualification flow |
| [flow-property-search.md](../directives/flow-property-search.md) | Property search flow |
| [flow-crm-handoff.md](../directives/flow-crm-handoff.md) | CRM handoff flow |
| [flow-operator-handoff.md](../directives/flow-operator-handoff.md) | Operator handoff flow |
| [flow-ticket-creation.md](../directives/flow-ticket-creation.md) | Ticket creation flow |
| [flow-anti-loop.md](../directives/flow-anti-loop.md) | Anti-loop mechanism |
| [tenant-onboarding.md](../directives/tenant-onboarding.md) | Tenant onboarding guide |
| [deploy-edge-functions.md](../directives/deploy-edge-functions.md) | Edge Function deployment |
| [database-migrations.md](../directives/database-migrations.md) | Migration guide |
| [add-crm-integration.md](../directives/add-crm-integration.md) | CRM integration guide |
| [add-feature-frontend.md](../directives/add-feature-frontend.md) | Frontend feature guide |
| [debug-ai-agent.md](../directives/debug-ai-agent.md) | AI debugging guide |

---

## Getting Started

1. **Understand the architecture**: Read [Architecture](./architecture.md) first
2. **Set up dev environment**: Follow [Development Guide](./development-guide.md)
3. **Explore the codebase**: Reference [Source Tree Analysis](./source-tree-analysis.md)
4. **API reference**: Check [API Contracts](./api-contracts.md) for Edge Function specs
5. **Database schema**: See [Data Models](./data-models.md) for table definitions
6. **UI components**: Browse [Component Inventory](./component-inventory.md)

### For Brownfield PRD

When creating a PRD for new features, provide this index as input to the PRD workflow. Key references:
- For **UI features**: `architecture.md` + `component-inventory.md`
- For **AI features**: `architecture.md` (Section 4: AI Agent Architecture) + `api-contracts.md`
- For **full-stack features**: All docs above + `data-models.md`
