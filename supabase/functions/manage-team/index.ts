// ========== AIMEE.iA v2 - MANAGE TEAM ==========
// Admin-only operations to manage users within tenants.
// Requires caller to be authenticated as super_admin.
// verify_jwt is OFF — auth is handled entirely in our code below.
//
// Actions:
//   create_user    → Create user immediately with password (no email confirmation)
//   remove_user    → Remove user from tenant (deletes profile + auth user)
//   update_role    → Change a user's role in the profiles table
//   reset_password → Set a new password for a user via admin API

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

// ── CORS helpers ──

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function corsResponse() {
    return new Response('ok', { headers: corsHeaders });
}

function jsonResponse(data: unknown, status = 200) {
    return new Response(JSON.stringify(data), {
        status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
}

function errorResponse(message: string, status = 500) {
    console.error(`❌ ${message}`);
    return jsonResponse({ error: message }, status);
}

// ─────────────────────────────────────────────────────────────────────

serve(async (req: Request) => {
    if (req.method === 'OPTIONS') return corsResponse();

    try {
        // ── Auth: verify caller is super_admin ──────────────────────────
        const authHeader = req.headers.get('Authorization');

        // 🔍 Diagnostic logging
        console.log('🔍 [DIAG] Auth header present:', !!authHeader);
        if (authHeader) {
            const token = authHeader.replace('Bearer ', '');
            try {
                const payload = JSON.parse(atob(token.split('.')[1]));
                console.log('🔍 [DIAG] JWT role:', payload.role, '| sub:', payload.sub?.substring(0, 8) || 'none', '| iss:', payload.iss);
            } catch (_) {
                console.log('🔍 [DIAG] Could not decode JWT payload');
            }
        }

        if (!authHeader) return errorResponse('Missing Authorization header', 401);

        const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
        const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
        const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;

        // Admin client: bypasses RLS - used for all DB + auth operations
        const admin = createClient(supabaseUrl, serviceRoleKey, {
            auth: { autoRefreshToken: false, persistSession: false },
        });

        // Caller client: validates JWT identity
        const caller = createClient(supabaseUrl, anonKey, {
            global: { headers: { Authorization: authHeader } },
            auth: { autoRefreshToken: false, persistSession: false },
        });

        const { data: { user: callerUser }, error: callerErr } = await caller.auth.getUser();
        console.log('🔍 [DIAG] getUser result:', callerUser ? `user=${callerUser.id}` : `error=${callerErr?.message}`);

        if (callerErr || !callerUser) return errorResponse('Unauthorized: invalid or expired session', 401);

        const { data: callerProfile, error: profileErr } = await admin
            .from('profiles')
            .select('role')
            .eq('id', callerUser.id)
            .single();

        console.log('🔍 [DIAG] Profile lookup:', callerProfile ? `role=${callerProfile.role}` : `error=${profileErr?.message}`);

        if (profileErr || callerProfile?.role !== 'super_admin') {
            return errorResponse('Forbidden: requires super_admin role', 403);
        }

        // ── Route action ─────────────────────────────────────────────────
        const body = await req.json();
        const { action } = body;
        console.log('✅ [DIAG] Auth passed. Action:', action);

        if (action === 'create_user') {
            return await createUser(admin, body);
        }

        if (action === 'remove_user') {
            return await removeUser(admin, body);
        }

        if (action === 'update_role') {
            return await updateRole(admin, body);
        }

        if (action === 'reset_password') {
            return await resetPassword(admin, body);
        }

        return errorResponse(`Unknown action: ${action}`, 400);

    } catch (err) {
        console.error('❌ manage-team error:', err);
        return errorResponse((err as Error).message);
    }
});

// ═══════════════════════════════════════════════
// CREATE USER: Directly create user with password
// ═══════════════════════════════════════════════

// deno-lint-ignore no-explicit-any
async function createUser(admin: any, body: any): Promise<Response> {
    const { email, password, full_name, tenant_id, role } = body;

    if (!email || !password || !full_name || !tenant_id || !role) {
        return errorResponse('Missing required fields: email, password, full_name, tenant_id, role', 400);
    }

    const allowedRoles = ['admin', 'operator', 'viewer'];
    if (!allowedRoles.includes(role)) {
        return errorResponse(`Invalid role. Must be one of: ${allowedRoles.join(', ')}`, 400);
    }

    if (password.length < 8) {
        return errorResponse('Password must be at least 8 characters', 400);
    }

    console.log(`👤 Creating user ${email} in tenant ${tenant_id} as ${role}`);

    const { data, error } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name, tenant_id, role },
    });

    if (error) {
        console.error('❌ Create user error:', error);
        if (
            error.message?.includes('already been registered') ||
            error.message?.includes('already registered') ||
            error.status === 422
        ) {
            return jsonResponse(
                { error: 'Este e-mail já está cadastrado no sistema.' },
                409
            );
        }
        return errorResponse(error.message, 400);
    }

    console.log(`✅ User created: ${data.user?.id}`);
    return jsonResponse({ success: true, user_id: data.user?.id });
}

// ═══════════════════════════════════════════════
// UPDATE ROLE: Change a user's role in profiles
// ═══════════════════════════════════════════════

// deno-lint-ignore no-explicit-any
async function updateRole(admin: any, body: any): Promise<Response> {
    const { user_id, role } = body;

    if (!user_id || !role) {
        return errorResponse('Missing required fields: user_id, role', 400);
    }

    const allowedRoles = ['admin', 'operator', 'viewer'];
    if (!allowedRoles.includes(role)) {
        return errorResponse(`Invalid role. Must be one of: ${allowedRoles.join(', ')}`, 400);
    }

    console.log(`✏️ Updating role of user ${user_id} to ${role}`);

    const { error } = await admin
        .from('profiles')
        .update({ role })
        .eq('id', user_id);

    if (error) {
        console.error('❌ Update role error:', error.message);
        return errorResponse(error.message, 400);
    }

    console.log(`✅ Role of user ${user_id} updated to ${role}`);
    return jsonResponse({ success: true });
}

// ═══════════════════════════════════════════════
// RESET PASSWORD: Set a new password for a user
// ═══════════════════════════════════════════════

// deno-lint-ignore no-explicit-any
async function resetPassword(admin: any, body: any): Promise<Response> {
    const { user_id, new_password } = body;

    if (!user_id || !new_password) {
        return errorResponse('Missing required fields: user_id, new_password', 400);
    }

    if (new_password.length < 8) {
        return errorResponse('Password must be at least 8 characters', 400);
    }

    console.log(`🔑 Resetting password for user ${user_id}`);

    const { error } = await admin.auth.admin.updateUserById(user_id, { password: new_password });

    if (error) {
        console.error('❌ Reset password error:', error.message);
        return errorResponse(error.message, 400);
    }

    console.log(`✅ Password reset for user ${user_id}`);
    return jsonResponse({ success: true });
}

// ═══════════════════════════════════════════════
// REMOVE: Nullify FK refs → delete profile → delete auth user
// ═══════════════════════════════════════════════

// deno-lint-ignore no-explicit-any
async function removeUser(admin: any, body: any): Promise<Response> {
    const { user_id } = body;

    if (!user_id) {
        return errorResponse('Missing required field: user_id', 400);
    }

    console.log(`🗑️ [1/3] Nullifying FK references for user ${user_id}`);

    // Step 1: Nullify all FK references across tables that block profile deletion.
    // All 9 foreign keys on profiles.id are ON DELETE NO ACTION, so they must be
    // cleared before the profile row can be removed.
    const nullifyOps = [
        admin.from('messages').update({ sender_id: null }).eq('sender_id', user_id),
        admin.from('conversation_states').update({ operator_id: null }).eq('operator_id', user_id),
        admin.from('conversation_events').update({ actor_id: null }).eq('actor_id', user_id),
        admin.from('conversation_events').update({ target_id: null }).eq('target_id', user_id),
        admin.from('activity_logs').update({ user_id: null }).eq('user_id', user_id),
        admin.from('tickets').update({ assigned_to: null }).eq('assigned_to', user_id),
        admin.from('ticket_comments').update({ user_id: null }).eq('user_id', user_id),
        admin.from('owner_update_campaigns').update({ created_by: null }).eq('created_by', user_id),
        admin.from('ai_directives').update({ updated_by: null }).eq('updated_by', user_id),
    ];

    const nullifyResults = await Promise.all(nullifyOps);
    for (const { error } of nullifyResults) {
        if (error) {
            // Log but do not abort — some tables may have no rows for this user
            console.warn('⚠️ Nullify warning:', error.message);
        }
    }

    console.log(`🗑️ [2/3] Deleting profile for user ${user_id}`);

    // Step 2: Delete profile row — now safe because FK refs have been cleared
    const { error: profileErr } = await admin
        .from('profiles')
        .delete()
        .eq('id', user_id);

    if (profileErr) {
        console.error('❌ Profile delete error:', profileErr.message);
        return errorResponse(`Falha ao remover perfil: ${profileErr.message}`, 400);
    }

    console.log(`🗑️ [3/3] Deleting auth user ${user_id}`);

    // Step 3: Delete auth user — profile is already gone, no cascading issues
    const { error: authErr } = await admin.auth.admin.deleteUser(user_id);

    if (authErr) {
        console.error('❌ Auth user delete error:', authErr.message);
        return errorResponse(authErr.message, 400);
    }

    console.log(`✅ User ${user_id} fully removed`);
    return jsonResponse({ success: true });
}
