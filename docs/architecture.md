# Aimee.iA — Architecture Document

**Generated:** 2026-03-30

---

## 1. Architecture Overview

Aimee.iA follows a **SPA + Serverless** architecture:

- **Frontend**: React SPA (Vite) deployed on Vercel
- **Backend**: Supabase Edge Functions (Deno) + PostgreSQL with RLS
- **Communication**: Supabase JS Client (direct DB) + Edge Function HTTP calls
- **Realtime**: Supabase Realtime subscriptions (messages, tickets, campaigns)

```
┌─────────────────────────────────────────────────────────────┐
│                        VERCEL (Frontend)                     │
│  React 18 + TypeScript + Tailwind + Shadcn/UI               │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐       │
│  │ Dashboard │ │   Chat   │ │  Admin   │ │  AI Lab  │       │
│  └─────┬────┘ └─────┬────┘ └─────┬────┘ └─────┬────┘       │
└────────┼────────────┼────────────┼────────────┼─────────────┘
         │            │            │            │
    ┌────▼────────────▼────────────▼────────────▼────┐
    │              SUPABASE                           │
    │  ┌────────────────────────────────────────┐     │
    │  │         Edge Functions (24)             │     │
    │  │  ┌──────────┐  ┌───────────┐           │     │
    │  │  │ ai-agent │  │ whatsapp- │           │     │
    │  │  │ (LLM)    │  │ webhook   │           │     │
    │  │  └────┬─────┘  └─────┬─────┘           │     │
    │  │       │              │                  │     │
    │  │  ┌────▼──────────────▼──────────┐      │     │
    │  │  │     _shared/ (14 modules)    │      │     │
    │  │  │  agents/ triage/ qualify/    │      │     │
    │  │  └──────────────────────────────┘      │     │
    │  └────────────────────────────────────────┘     │
    │  ┌──────────────┐  ┌───────────────────┐        │
    │  │ PostgreSQL   │  │ Realtime          │        │
    │  │ 31 tables    │  │ messages, tickets │        │
    │  │ RLS + pgvector│ │ campaigns         │        │
    │  └──────────────┘  └───────────────────┘        │
    └─────────────────────────────────────────────────┘
         │              │              │
    ┌────▼───┐    ┌────▼────┐   ┌────▼─────┐
    │  Meta  │    │OpenRouter│   │  CRMs    │
    │WhatsApp│    │  (LLM)  │   │Vista/C2S │
    └────────┘    └─────────┘   └──────────┘
```

## 2. Multi-Tenancy Model

All data is isolated by `tenant_id` using PostgreSQL Row Level Security (RLS).

- **RLS function**: `get_user_tenant_id()` — extracts tenant_id from the authenticated user's profile
- **Policy pattern**: `tenant_id = get_user_tenant_id()` on SELECT/INSERT/UPDATE/DELETE
- **Super admin**: Bypasses tenant isolation via dedicated RLS policies
- **Tenant linking**: Users join tenants via `access_code` (validated by RPC `lookup_tenant_by_access_code`)

## 3. Authentication & Authorization

```
User Roles:
├── super_admin  — Platform admin (no tenant required, access all data)
├── admin        — Tenant admin (full tenant access)
├── operator     — Tenant operator (department-scoped, locked to department_code)
└── viewer       — Read-only tenant access
```

- **Auth provider**: Supabase Auth (email/password)
- **Session**: JWT tokens managed by `@supabase/supabase-js`
- **Frontend guards**: `AppLayout` checks auth state, redirects unauthenticated to `/auth`
- **Role-based UI**: `AppSidebar` filters navigation paths by role (`ROLE_PATHS` map)
- **Department filter**: Operators with `department_code` are locked to their department

## 4. AI Agent Architecture

The AI system uses a **multi-agent pattern** with a triage router:

```
Incoming WhatsApp Message
         │
    ┌────▼────┐
    │ Triage  │  → Greeting → Name extraction → Department selection
    └────┬────┘
         │
    ┌────▼─────────────────────────────┐
    │     Agent Router (by department) │
    ├──────────┬───────────┬───────────┤
    │Comercial │   Admin   │Remarketing│
    │(vendas/  │(admin/    │(remarketing│
    │ locacao) │ tickets)  │ VIP)      │
    └────┬─────┴─────┬─────┴─────┬─────┘
         │           │           │
    ┌────▼───────────▼───────────▼────┐
    │        LLM Call (OpenRouter)     │
    │  + Tools (property search,       │
    │    CRM handoff, ticket create)   │
    └────┬────────────────────────────┘
         │
    ┌────▼────┐
    │Anti-Loop│  → Detect repetition → Fallback responses
    └────┬────┘
         │
    ┌────▼────────┐
    │Pre-Completion│  → Sanitize internal data → Check quality
    └────┬────────┘
         │
    ┌────▼──────────┐
    │ WhatsApp Send  │  → Text + Media + TTS audio
    └───────────────┘
```

### Agent Modules

Each agent implements the `AgentModule` interface:
- `buildSystemPrompt()` — Context-aware prompt with directives, region knowledge, qualification data
- `getTools()` — Department-specific tool definitions
- `executeToolCall()` — Tool execution (property search, CRM handoff, ticket creation)
- `postProcess()` — Post-response processing

### Key AI Features

| Feature | Implementation |
|---------|---------------|
| Triage | Button-based department selection via WhatsApp interactive messages |
| Qualification | NLP extraction: interest, property type, neighborhood, bedrooms, budget (score 0-100) |
| Property Search | pgvector semantic search on property embeddings |
| CRM Handoff | C2S API lead creation + operator notification |
| Anti-Loop | DB-persisted detection, rotating fallback pool, meta-loop prevention |
| TTS | ElevenLabs voice synthesis for audio responses |
| Audio Input | Gemini multimodal transcription of WhatsApp voice messages |
| Follow-up | Cron-triggered reengagement after 30min inactivity (max 2 per silence) |

## 5. Data Flow

### WhatsApp Message Flow (Inbound)

```
Meta Cloud API → whatsapp-webhook
  ├── Deduplication check
  ├── Contact upsert (create if new)
  ├── Conversation upsert (create if new)
  ├── Message save to DB
  ├── Audio? → Gemini transcription
  ├── AI enabled? → Invoke ai-agent
  │   ├── Load tenant config + state
  │   ├── Triage (if new conversation)
  │   ├── Agent selection (by department)
  │   ├── LLM call (OpenRouter)
  │   ├── Tool execution (if needed)
  │   ├── Anti-loop check
  │   ├── Pre-completion sanitization
  │   ├── Send WhatsApp response
  │   └── Save state + trace
  └── Update conversation status
```

### Property Sync Flow

```
Vista CRM API → crm-sync-properties (daily cron)
  ├── Paginated fetch (all properties)
  ├── For each property:
  │   ├── Generate embedding (Gemini)
  │   └── Upsert to properties table
  └── Delete orphaned properties
```

## 6. State Management (Frontend)

The frontend uses a **simple state model** (no Redux/Zustand):

| Layer | Mechanism | Scope |
|-------|-----------|-------|
| Auth | `AuthContext` | Global (user, session, profile) |
| Tenant | `TenantContext` | Global (tenantId, tenantInfo) |
| Department | `DepartmentFilterContext` | Global (department filter) |
| Page data | `useState` + `useEffect` | Local per-page |
| Search/Filters | `useSessionState` (localStorage) | Persisted across navigation |
| Server data | Direct Supabase queries | No caching layer |
| Realtime | Supabase subscriptions | Per-component |

**Note**: No `react-query` or data caching layer is used. All pages make direct Supabase calls on mount.

## 7. Database Schema (Key Tables)

### Core Tables
| Table | Purpose |
|-------|---------|
| `tenants` | Multi-tenant orgs (company_name, wa_phone_id, access_code) |
| `profiles` | Users (linked to auth.users, has tenant_id, role, department_code) |
| `conversations` | WhatsApp conversations (contact_id, status, department, ai_enabled) |
| `messages` | Individual messages (conversation_id, direction, content, wa_message_id) |
| `contacts` | Leads/contacts (phone, name, neighborhood, crm_id, crm_status) |

### AI Tables
| Table | Purpose |
|-------|---------|
| `ai_agent_config` | Per-tenant AI config (provider, model, persona, triage_config) |
| `ai_directives` | System prompts by agent type (comercial, admin, remarketing) |
| `ai_behavior_config` | Behavior parameters (response length, formality, etc.) |
| `ai_department_configs` | Per-department tool/behavior config |
| `ai_modules` | Custom intelligence modules (activated during conversations) |
| `ai_error_log` | AI error tracking |
| `ai_traces` | Full observability traces (tokens, cost, latency) |
| `conversation_states` | AI conversation state (triage_stage, active_module, last_ai_messages) |

### Business Tables
| Table | Purpose |
|-------|---------|
| `properties` | Real estate listings (with pgvector embedding) |
| `developments` | Property developments (empreendimentos) |
| `lead_qualification` | Qualification data (interest, budget, score) |
| `campaigns` | WhatsApp mass campaigns |
| `campaign_results` | Per-phone campaign delivery results |
| `tickets` | Support tickets (kanban stages) |
| `ticket_comments` | Ticket comments thread |
| `whatsapp_templates` | WABA message templates |

## 8. Deployment Architecture

```
┌──────────────┐     ┌──────────────────┐
│   Vercel     │     │    Supabase      │
│  (Frontend)  │     │   (Backend)      │
│              │     │                  │
│ React SPA    │────▶│ Edge Functions   │
│ Static files │     │ PostgreSQL       │
│ Rewrites →   │     │ Realtime         │
│ index.html   │     │ Storage          │
└──────────────┘     │ Auth             │
                     └──────────────────┘
                            │
              ┌─────────────┼─────────────┐
              │             │             │
        ┌─────▼───┐  ┌─────▼────┐  ┌─────▼────┐
        │Meta API │  │OpenRouter│  │ Vista/C2S│
        │WhatsApp │  │  LLMs   │  │   CRMs   │
        └─────────┘  └──────────┘  └──────────┘
```

- **Frontend**: Vercel with `vercel.json` rewrites (all routes → `index.html`)
- **Backend**: Supabase hosted (project ID: `vnysbpnggnplvgkfokin`)
- **Edge Functions**: All deployed with `--no-verify-jwt` (internal auth handled in code)
- **Cron jobs**: `follow-up-check` (inactive conversations), `crm-sync-properties` (daily Vista sync)
