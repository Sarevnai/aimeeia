# Aimee.iA — Source Tree Analysis

**Generated:** 2026-03-30

---

## Frontend (`src/`)

```
src/
├── App.tsx                          # Root component — all routes defined here
├── App.css                          # Global app styles
├── main.tsx                         # Entry point — renders <App /> to DOM
├── index.css                        # Tailwind base + custom CSS variables
├── vite-env.d.ts                    # Vite type declarations
│
├── contexts/                        # React Context providers
│   ├── AuthContext.tsx               # Auth state (user, session, profile, signIn/Out)
│   ├── TenantContext.tsx             # Current tenant ID + info
│   └── DepartmentFilterContext.tsx   # Department filter (all/locacao/vendas/admin/remarketing)
│
├── hooks/                           # Custom React hooks
│   ├── use-mobile.tsx               # Mobile viewport detection (<768px)
│   ├── use-toast.ts                 # Shadcn toast notification system
│   ├── useAdminTenants.ts           # Super_admin tenant selector + sessionStorage
│   ├── useAgentData.ts              # AI agent config CRUD (directives, behavior, department)
│   └── useSessionState.ts           # localStorage-backed useState (sim_ prefix)
│
├── lib/                             # Shared utilities
│   ├── utils.ts                     # cn() — Tailwind class merge utility
│   └── agent-constants.ts           # 3 AI agent types, providers, models, defaults
│
├── integrations/
│   └── supabase/
│       ├── client.ts                # Supabase client singleton (typed)
│       └── types.ts                 # Auto-generated DB types (31 tables, 2 RPCs, 5 enums)
│
├── components/                      # UI Components
│   ├── AppLayout.tsx                # Auth guard + sidebar + header + outlet
│   ├── AppHeader.tsx                # Department filter + user avatar + logout
│   ├── AppSidebar.tsx               # Role-based nav (6 groups, badge counts)
│   ├── MobileBottomNav.tsx          # Mobile bottom nav (5 items)
│   ├── NavLink.tsx                  # React Router NavLink wrapper
│   ├── PageHeader.tsx               # Reusable page header (title, icon, actions)
│   ├── ConfirmDialog.tsx            # Reusable confirmation dialog
│   ├── Skeletons.tsx                # Loading skeletons collection
│   ├── EmptyState.tsx               # Empty state with icon + action
│   ├── admin/                       # Admin panel components
│   ├── campaigns/                   # Campaign + remarketing components
│   ├── chat/                        # Chat UI components
│   ├── finance/                     # Finance/billing components
│   ├── lab/                         # AI Lab components (simulator, analyzer)
│   ├── modules/                     # AI modules editor
│   ├── settings/                    # Settings components (minha-aimee)
│   ├── simulation/                  # Simulation UI components
│   └── ui/                          # Shadcn/UI base components
│
├── pages/                           # Route pages
│   ├── AuthPage.tsx                 # /auth — Login + signup (access code)
│   ├── DashboardPage.tsx            # / — Operator dashboard (funnel, charts)
│   ├── InboxPage.tsx                # /inbox — Active conversations (realtime)
│   ├── ChatPage.tsx                 # /chat/:id — Full chat + lead sidebar
│   ├── HistoryPage.tsx              # /history/:id — Read-only conversation view
│   ├── LeadsPage.tsx                # /leads — Contacts table + filters
│   ├── PipelinePage.tsx             # /pipeline — Kanban drag-and-drop
│   ├── CampaignsPage.tsx            # /campanhas — Campaign list
│   ├── CampaignDetailPage.tsx       # /campanhas/:id — Campaign metrics (realtime)
│   ├── ReportsPage.tsx              # /relatorios — Analytics + date range
│   ├── DevelopmentsPage.tsx         # /empreendimentos — Property developments
│   ├── DevelopmentFormPage.tsx       # /empreendimentos/novo|:id/editar — CRUD form
│   ├── AcessosPage.tsx              # /acessos — Team management
│   ├── CaptacaoPage.tsx             # /captacao — AI-detected acquisition opportunities
│   ├── AtualizacaoPage.tsx          # /atualizacao — Owner outreach campaigns
│   ├── FinancePage.tsx              # /financeiro — Billing (MOCK)
│   ├── TicketsPage.tsx              # /chamados — Ticket kanban + list (realtime)
│   ├── TicketDetailPage.tsx         # /chamados/:id — Ticket detail + comments
│   ├── ModulosPage.tsx              # /modulos — AI modules CRUD
│   ├── MinhaAimeePage.tsx           # /minha-aimee — Agent settings hub
│   ├── GuiaPage.tsx                 # /guia — Help articles (static)
│   ├── Index.tsx                    # (unused — Lovable scaffold)
│   ├── NotFound.tsx                 # * — 404 page
│   │
│   ├── admin/                       # Admin panel pages (super_admin only)
│   │   ├── AdminDashboardPage.tsx   # /admin — Platform KPIs
│   │   ├── AdminTenantsPage.tsx     # /admin/tenants — All tenants list
│   │   ├── AdminTenantDetailPage.tsx # /admin/tenants/:id — Tenant detail (7 tabs)
│   │   ├── AdminBillingPage.tsx     # /admin/billing — Billing (100% MOCK)
│   │   ├── AdminMetricsPage.tsx     # /admin/metrics — Product health metrics
│   │   ├── AdminCampaignsPage.tsx   # /admin/campanhas — Cross-tenant campaigns
│   │   ├── AdminAgentPage.tsx       # /admin/agent — Legacy agent config
│   │   ├── AgentsOverviewPage.tsx   # /admin/agents — Agent overview per tenant
│   │   ├── AgentDetailPage.tsx      # /admin/agents/:agentType — Agent type detail
│   │   ├── AgentGlobalSettingsPage.tsx # /admin/agents/settings — Global AI settings
│   │   ├── AdminModulosPage.tsx     # /admin/modulos — AI modules per tenant
│   │   │
│   │   └── lab/                     # AI Lab (nested under /admin/lab)
│   │       ├── LabLayout.tsx        # Lab sidebar layout
│   │       ├── LabSimulatorPage.tsx  # /admin/lab — AI simulator
│   │       ├── LabRealConversationsPage.tsx # /admin/lab/real-conversations
│   │       ├── LabPromptsPage.tsx   # /admin/lab/prompts (wraps AdminModulosPage)
│   │       ├── LabAgentConfigPage.tsx # /admin/lab/agent-config (wraps AgentsOverview)
│   │       ├── LabTriagePage.tsx    # /admin/lab/triage — Flow visualization
│   │       └── LabAnalysisPage.tsx  # /admin/lab/analysis — Analysis reports
│   │
│   └── finance/                     # (empty — no files)
│
└── test/
    └── setup.ts                     # Vitest setup
```

## Backend (`supabase/`)

```
supabase/
├── config.toml                      # Supabase local config
├── seed.sql                         # Database seed (empty)
│
├── functions/                       # 24 Edge Functions (Deno runtime)
│   ├── _shared/                     # Shared modules
│   │   ├── supabase.ts              # Client factory + CORS + response helpers
│   │   ├── types.ts                 # TypeScript interfaces (Tenant, AIConfig, etc.)
│   │   ├── utils.ts                 # formatCurrency, formatPhone, logError, etc.
│   │   ├── whatsapp.ts              # WhatsApp messaging (Meta Cloud API)
│   │   ├── ai-call.ts              # Multi-provider LLM gateway (OpenRouter)
│   │   ├── analyze.ts              # AI quality analysis (GPT 5.4 Mini)
│   │   ├── prompts.ts              # System prompt builder (directives + context)
│   │   ├── anti-loop.ts            # Repetitive response detection (v3, DB-persisted)
│   │   ├── audio-transcription.ts  # WhatsApp audio → Gemini transcription
│   │   ├── tts.ts                  # ElevenLabs text-to-speech
│   │   ├── triage.ts               # Greeting + name + department selection
│   │   ├── qualification.ts        # Lead qualification NLP (scoring 0-100)
│   │   ├── property.ts             # Property formatting + search params
│   │   ├── regions.ts              # Region/neighborhood data loader
│   │   └── agents/                  # Agent modules
│   │       ├── agent-interface.ts   # AgentModule interface definition
│   │       ├── comercial.ts         # Comercial agent (vendas + locacao)
│   │       ├── admin.ts             # Admin agent (tickets + handoff)
│   │       ├── remarketing.ts       # Remarketing agent (VIP persona)
│   │       ├── tool-executors.ts    # Shared tool execution functions
│   │       └── pre-completion-check.ts # Response sanitization rules
│   │
│   ├── whatsapp-webhook/            # ← ENTRY POINT: All incoming WhatsApp messages
│   ├── ai-agent/                    # Main AI orchestrator (triage → agent → LLM → reply)
│   ├── ai-agent-simulate/           # AI simulator (Lab, production parity)
│   ├── ai-agent-analyze/            # Single-turn quality analysis
│   ├── ai-agent-analyze-batch/      # Full conversation analysis
│   ├── send-wa-message/             # Send text via WhatsApp
│   ├── send-wa-media/               # Send media via WhatsApp
│   ├── send-wa-template/            # Send template messages
│   ├── manage-templates/            # WABA template CRUD
│   ├── manage-team/                 # User management (super_admin)
│   ├── manage-tickets/              # Ticket CRUD
│   ├── follow-up-check/             # Cron: inactive conversation follow-up
│   ├── crm-sync-properties/         # Vista CRM property sync
│   ├── vista-get-property/          # Vista single property fetch
│   ├── vista-search-properties/     # Vista property search
│   ├── c2s-create-lead/             # C2S CRM lead handoff
│   ├── c2s-test-connection/         # C2S connectivity test
│   ├── generate-property-embedding/ # DB webhook: embedding generation
│   ├── batch-regenerate-embeddings/ # Batch embedding regeneration
│   ├── get-nearby-places/           # Google Maps POI search
│   ├── elevenlabs-voices/           # ElevenLabs voice listing
│   ├── portal-leads-webhook/        # Real estate portal lead ingestion
│   ├── process-xml-queue-item/      # XML feed item processing
│   └── sync-catalog-xml/            # XML feed ingestion + queuing
│
└── migrations/                      # 43 SQL migrations (Feb-Mar 2026)
    ├── 20260218*.sql                # Initial schema + RLS + seeds
    ├── 20260219*.sql                # Channel source
    ├── 20260220*.sql                # Admin central + templates + invoices
    ├── 20260223-24*.sql             # RLS recursion fixes + super_admin
    ├── 20260225*.sql                # Property vectors + XML config
    ├── 20260301*.sql                # Tickets system + sender fields + departments
    ├── 20260302*.sql                # Realtime on messages
    ├── 20260304*.sql                # Structured config (ai_directives)
    ├── 20260318*.sql                # Timeline detection + follow-up tracking
    ├── 20260322-23*.sql             # Vista CRM cron + XML removal + coordinates
    ├── 20260327*.sql                # Remarketing department
    └── 20260328*.sql                # AI traces (observability)
```

## Configuration Files

```
aimeeia/
├── .env                             # Environment variables (Supabase URL/Key)
├── .gitignore                       # Git ignore rules
├── .mcp.json                        # MCP server configuration
├── index.html                       # Vite HTML entry point
├── package.json                     # NPM dependencies + scripts
├── tsconfig.json                    # TypeScript config (references)
├── tsconfig.app.json                # App TypeScript config
├── tsconfig.node.json               # Node TypeScript config
├── vite.config.ts                   # Vite build configuration
├── vitest.config.ts                 # Vitest test configuration
├── tailwind.config.ts               # Tailwind CSS configuration
├── postcss.config.js                # PostCSS configuration
├── eslint.config.js                 # ESLint configuration
├── components.json                  # Shadcn/UI configuration
├── vercel.json                      # Vercel deployment config
│
├── .vercel/                         # Vercel project settings
├── .lovable/                        # Lovable platform config
│   └── plan.md                      # Lovable development plan
│
├── directives/                      # AI flow documentation (14 .md files)
│   ├── flow-triage.md               # Triage flow spec
│   ├── flow-qualification.md        # Qualification flow spec
│   ├── flow-property-search.md      # Property search flow spec
│   ├── flow-crm-handoff.md          # CRM handoff flow spec
│   ├── flow-operator-handoff.md     # Operator handoff flow spec
│   ├── flow-ticket-creation.md      # Ticket creation flow spec
│   ├── flow-anti-loop.md            # Anti-loop mechanism spec
│   ├── add-crm-integration.md       # CRM integration guide
│   ├── add-feature-frontend.md      # Frontend feature guide
│   ├── database-migrations.md       # Migration guide
│   ├── debug-ai-agent.md            # AI debugging guide
│   ├── deploy-edge-functions.md     # Deployment guide
│   ├── tenant-onboarding.md         # Onboarding guide
│   └── workflow_A_auth_debug.md     # Auth debugging workflow
│
└── execution/                       # Execution/operational guides
```
