# Aimee.iA — Development Guide

**Generated:** 2026-03-30

---

## Prerequisites

| Tool | Version | Purpose |
|------|---------|---------|
| Node.js | 18+ | Frontend build/dev |
| npm | 9+ | Package management |
| Deno | 1.40+ | Edge Functions (Supabase CLI handles this) |
| Supabase CLI | Latest | Edge Function deploy + migrations |
| Vercel CLI | Latest | Frontend deploy (optional) |
| Git | 2.x | Version control |

## Environment Setup

### 1. Clone and Install

```bash
git clone <repo-url> aimeeia
cd aimeeia
npm install
```

### 2. Environment Variables

Create `.env` in project root:

```env
VITE_SUPABASE_URL=https://vnysbpnggnplvgkfokin.supabase.co
VITE_SUPABASE_ANON_KEY=<anon-key>
```

Edge Functions use Supabase secrets (set via dashboard or CLI):
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `OPENROUTER_API_KEY`
- `OPENAI_API_KEY`
- `WA_VERIFY_TOKEN`
- `ELEVENLABS_API_KEY`
- `GOOGLE_MAPS_API_KEY`

## Development Commands

| Command | Description |
|---------|-------------|
| `npm run dev` | Start Vite dev server (HMR) |
| `npm run build` | Production build |
| `npm run preview` | Preview production build |
| `npm run lint` | ESLint check |
| `npm run test` | Run Vitest tests |
| `npm run test:watch` | Vitest watch mode |

## Project Structure Conventions

### Frontend Pages
- Location: `src/pages/`
- Pattern: `{PageName}Page.tsx`
- Admin pages: `src/pages/admin/`
- Lab pages: `src/pages/admin/lab/`
- All routes defined in `src/App.tsx`

### Frontend Components
- Location: `src/components/`
- UI primitives: `src/components/ui/` (Shadcn/UI)
- Feature components: `src/components/{feature}/`
- Shared components: `src/components/` (top level)

### Edge Functions
- Location: `supabase/functions/{function-name}/index.ts`
- Shared code: `supabase/functions/_shared/`
- Agent modules: `supabase/functions/_shared/agents/`

### Database Migrations
- Location: `supabase/migrations/`
- Naming: `YYYYMMDDHHMMSS_{description}.sql`

## Deployment

### Frontend (Vercel)

```bash
# Automatic: push to main triggers Vercel deploy
git push origin main

# Manual:
npx vercel --prod
```

### Edge Functions (Supabase)

**CRITICAL**: Always deploy with `--no-verify-jwt`:

```bash
supabase functions deploy {function-name} --no-verify-jwt --project-ref vnysbpnggnplvgkfokin
```

### Database Migrations

```bash
# Apply all pending migrations
supabase db push --project-ref vnysbpnggnplvgkfokin

# Create new migration
supabase migration new {migration_name}
```

## Code Patterns

### Supabase Query Pattern (Pages)
```typescript
const { data, error } = await supabase
  .from('table_name')
  .select('*')
  .eq('tenant_id', tenantId)
  .order('created_at', { ascending: false });
```

### Realtime Subscription Pattern
```typescript
useEffect(() => {
  const channel = supabase
    .channel('channel-name')
    .on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'messages',
      filter: `conversation_id=eq.${id}`
    }, (payload) => { /* handle change */ })
    .subscribe();
  return () => { supabase.removeChannel(channel); };
}, [id]);
```

### Edge Function Pattern
```typescript
import { createClient, corsHeaders, jsonResponse, errorResponse } from "../_shared/supabase.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const { tenant_id, ...params } = await req.json();
    const supabase = createClient();
    // ... logic
    return jsonResponse({ success: true, data });
  } catch (error) {
    return errorResponse(error.message);
  }
});
```

### Auth Context Usage
```typescript
const { user, profile, loading } = useAuth();
const { tenantId } = useTenant();
const { department } = useDepartmentFilter();
```

## Commit Convention

Commits in PT-BR with format: `{Categoria}_{Sessao}: descricao`

Examples:
- `Fix_AILab: corrigir error tracking`
- `Upgrade_Observabilidade: rastreamento de custos`
- `Add_Remarketing: nova campanha`

Auto-push after commit.

## Testing

- Framework: Vitest + @testing-library/react
- Config: `vitest.config.ts`
- Test files: `*.test.ts` / `*.test.tsx`
- Setup: `src/test/setup.ts`
- Run: `npm run test`

**Note**: Test coverage is minimal. Most functionality is verified through manual testing and the AI Lab simulator.

## Key Files for New Developers

| File | Why It Matters |
|------|---------------|
| `src/App.tsx` | All routes — understand page structure |
| `src/contexts/AuthContext.tsx` | Auth flow + user profile |
| `src/contexts/TenantContext.tsx` | Multi-tenancy on frontend |
| `src/lib/agent-constants.ts` | AI agent type definitions |
| `supabase/functions/_shared/types.ts` | Backend type definitions |
| `supabase/functions/_shared/agents/agent-interface.ts` | Agent module interface |
| `supabase/functions/ai-agent/index.ts` | Main AI pipeline |
| `supabase/functions/whatsapp-webhook/index.ts` | WhatsApp entry point |
| `src/integrations/supabase/types.ts` | Auto-generated DB types |
