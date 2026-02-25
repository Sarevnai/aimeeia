# Workflow A: Supabase Auth & Profile Fetch Debugging

## Layer 1: Directive (Goal & Context)
**Goal:** Identify why a user with a valid Supabase authentication record cannot load their `profile` (resulting in missing roles/classifications) and diagnose the resulting infinite redirect loops within the application.

**Context:** The application uses `AuthContext.tsx` to establish a session and then fetch the user's profile from the `profiles` table. When this query fails or returns null, the routing logic (e.g., in `App.tsx` or `AppLayout.tsx`) may cause a redirect loop by repeatedly bouncing the user between authenticated but unauthorized states.

## Diagnostics Checklist (To be executed by the Orchestrator)

### Phase 1: Validate Supabase Profile Query & RLS
1. **Check Database Existence:** Verify if the user's UUID actually exists in the `profiles` table. The Supabase auth system registers the user, but the corresponding `profile` might not be created via the trigger.
2. **Review Row Level Security (RLS):** Check the RLS policies on the `profiles` table. The user might not have `SELECT` privileges for their own row due to a missing or misconfigured policy.
3. **Inspect the Fetch Query:** In `AuthContext.tsx`, `fetchProfile` executes: 
   ```javascript
   supabase.from('profiles').select('id, tenant_id, full_name, avatar_url, role').eq('id', userId).single()
   ```
   Check if any error is being caught and swallowed in the client network logs.

### Phase 2: Identify Redirect Loop Source
1. **Analyze `RequireAuth` / Route Guards:** Review routing components (`App.tsx`, `AppLayout.tsx`, `AdminLayout.tsx`). 
2. **Condition Mismatch:** A loop happens when:
   - Route requires `profile` -> `profile` is null -> redirects off route (e.g. to `/auth`).
   - `/auth` route checks `session` -> `session` exists -> redirects back to protected route.
   - *Action:* We need to handle the state where `session` is valid but `profile` is null properly (e.g., redirect to an onboarding or error page, not back and forth).

### Phase 3: Network & Request Body Consistency
1. **Inspect API Payload:** Check if `.env` keys (Anon Key vs Service Role) are correctly configured in the client. 
2. **Tenant ID issues:** Verify if the failure is related to a missing `tenant_id` causing the app context to crash or reject the user.

## Layer 3: Execution Plan
- [ ] Script or query Supabase to check if the specific user has a record in the `profiles` table.
- [ ] Read `src/App.tsx` to map out the exact router redirect loop.
- [ ] Trace the `supabase.auth.onAuthStateChange` to see if a race condition leads to premature router navigation.

**Self-annealing notes:** Once the bottleneck is confirmed (e.g., missing RLS policy or missing profile trigger), we will apply the fix SQL snippet, test creating a new user, and update this directive with the final solution.
