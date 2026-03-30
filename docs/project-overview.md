# Aimee.iA — Project Overview

**Generated:** 2026-03-30
**Scan Level:** Exhaustive
**Repository Type:** Monolith (with serverless backend)

---

## Executive Summary

Aimee.iA is a multi-tenant AI-powered WhatsApp CRM platform for the Brazilian real estate market. It automates lead qualification, property search, and CRM handoff through intelligent WhatsApp conversations, while providing operators with a full management dashboard.

## Tech Stack Summary

| Category | Technology | Version |
|----------|-----------|---------|
| **Frontend Framework** | React | 18.3.1 |
| **Language** | TypeScript | 5.8.3 |
| **Build Tool** | Vite | 5.4.19 |
| **CSS** | Tailwind CSS | 3.4.17 |
| **UI Library** | Shadcn/UI (Radix) | Multiple |
| **State Management** | React Context + useState | - |
| **Data Fetching** | Supabase JS Client (direct) | 2.97.0 |
| **Routing** | React Router DOM | 6.30.1 |
| **Charts** | Recharts | 2.15.4 |
| **Forms** | React Hook Form + Zod | 7.61.1 / 3.25.76 |
| **Drag & Drop** | @dnd-kit | 6.3.1 |
| **Spreadsheets** | SheetJS (xlsx) | 0.18.5 |
| **Backend** | Supabase (Edge Functions - Deno) | - |
| **Database** | PostgreSQL (Supabase) | - |
| **Auth** | Supabase Auth (JWT) | - |
| **Realtime** | Supabase Realtime | - |
| **Storage** | Supabase Storage | - |
| **Hosting** | Vercel (frontend) + Supabase (backend) | - |
| **Testing** | Vitest | 3.2.4 |

## Architecture Classification

- **Type:** Web application (SPA + Serverless)
- **Pattern:** Component-based frontend with serverless microservices backend
- **Multi-tenancy:** Row-level security (RLS) via `tenant_id` + `get_user_tenant_id()` function
- **Auth Model:** Supabase Auth with JWT, 4 roles: `super_admin`, `admin`, `operator`, `viewer`
- **AI Architecture:** Multi-agent system (comercial, admin, remarketing) with triage router

## Key Numbers

| Metric | Count |
|--------|-------|
| Frontend Pages | 23 (tenant) + 11 (admin) + 6 (lab) |
| Edge Functions | 24 |
| Shared Modules | 14 |
| Database Tables | 31 |
| Database Migrations | 43 |
| Component Directories | 9 |
| Contexts | 3 |
| Custom Hooks | 5 |
| External Integrations | 9 |

## External Services

| Service | Purpose |
|---------|---------|
| Meta Cloud API | WhatsApp messaging (send/receive) |
| Meta Graph API | WABA template management |
| OpenRouter | LLM gateway (Gemini, OpenAI, Anthropic) |
| OpenAI | Quality analysis (GPT 5.4 Mini) |
| Google Gemini | Embeddings, audio transcription |
| Vista CRM API | Property sync (full/delta) |
| C2S CRM API | Lead handoff |
| ElevenLabs | Text-to-speech |
| Google Maps Places | Nearby POI search |

## Repository Structure

```
aimeeia/
├── src/                    # React frontend
│   ├── components/         # UI components (9 subdirectories)
│   ├── contexts/           # Auth, Tenant, DepartmentFilter
│   ├── hooks/              # Custom hooks (5)
│   ├── integrations/       # Supabase client + types
│   ├── lib/                # Utils + agent constants
│   ├── pages/              # Route pages (23 tenant + admin/)
│   └── test/               # Test setup
├── supabase/
│   ├── functions/          # 24 Edge Functions + _shared/
│   └── migrations/         # 43 SQL migrations
├── docs/                   # Project documentation
├── directives/             # AI flow directives (14 files)
├── execution/              # Execution guides
├── public/                 # Static assets
└── dist/                   # Build output
```

## Page Status Summary

| Status | Count | Details |
|--------|-------|---------|
| Fully Functional | 32 | Connected to real Supabase data |
| Mostly Functional | 2 | HistoryPage (rating UI-only), LeadsPage (filters not wired) |
| Mock/Placeholder | 2 | FinancePage (no billing), AdminBillingPage (100% mock) |
| Static Content | 1 | GuiaPage (hardcoded help articles) |
| Dead Code | 1 | Index.tsx (Lovable scaffold, unused) |

## Known Issues

- No billing system (FinancePage and AdminBillingPage are mock)
- No react-query usage (all pages use direct useState/useEffect)
- N+1 query patterns in AdminTenantsPage and AdminMetricsPage
- AdminAgentPage is legacy duplicate of AgentGlobalSettingsPage
- LeadsPage filters UI not wired to queries
- HistoryPage AI rating buttons have no backend action
- All Edge Functions deployed with `--no-verify-jwt`
- `lead_qualification` table may have 0 rows (qualification not persisting)
