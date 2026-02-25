// ========== AIMEE.iA v2 - MANAGE TEAM ==========
// Admin-only operations to invite and remove users from tenants.
// Requires caller to be authenticated as super_admin.
// verify_jwt is OFF — auth is handled entirely in our code below.
//
// Actions:
//   invite_user  → Invite a new user via email with tenant/role metadata
//   remove_user  → Remove user from tenant (deletes profile + auth user)

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

        if (action === 'invite_user') {
            return await inviteUser(admin, req, body);
        }

        if (action === 'remove_user') {
            return await removeUser(admin, body);
        }

        return errorResponse(`Unknown action: ${action}`, 400);

    } catch (err) {
        console.error('❌ manage-team error:', err);
        return errorResponse((err as Error).message);
    }
});

// ═══════════════════════════════════════════════
// INVITE: Send email invitation with tenant/role
// ═══════════════════════════════════════════════

// deno-lint-ignore no-explicit-any
async function inviteUser(admin: any, req: Request, body: any): Promise<Response> {
    const { email, full_name, tenant_id, role } = body;

    if (!email || !full_name || !tenant_id || !role) {
        return errorResponse('Missing required fields: email, full_name, tenant_id, role', 400);
    }

    const allowedRoles = ['admin', 'operator', 'viewer'];
    if (!allowedRoles.includes(role)) {
        return errorResponse(`Invalid role. Must be one of: ${allowedRoles.join(', ')}`, 400);
    }

    const origin = req.headers.get('origin') || req.headers.get('referer') || 'https://app.aimee.ia';
    const redirectTo = `${new URL(origin).origin}/auth`;

    console.log(`📧 Inviting ${email} to tenant ${tenant_id} as ${role}`);

    const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
        redirectTo,
        data: { full_name, tenant_id, role },
    });

    if (error) {
        console.error('❌ Invite error:', error);
        if (
            error.message?.includes('already been registered') ||
            error.message?.includes('already registered') ||
            error.status === 422
        ) {
            return jsonResponse(
                { error: 'Este e-mail já está cadastrado no sistema. O usuário pode fazer login normalmente.' },
                409
            );
        }
        return errorResponse(error.message, 400);
    }

    console.log(`✅ Invitation sent to ${email}, user id: ${data.user?.id}`);
    return jsonResponse({ success: true, user_id: data.user?.id });
}

// ═══════════════════════════════════════════════
// REMOVE: Delete profile + auth user
// ═══════════════════════════════════════════════

// deno-lint-ignore no-explicit-any
async function removeUser(admin: any, body: any): Promise<Response> {
    const { user_id } = body;

    if (!user_id) {
        return errorResponse('Missing required field: user_id', 400);
    }

    console.log(`🗑️ Removing user ${user_id}`);

    const { error: profileErr } = await admin
        .from('profiles')
        .delete()
        .eq('id', user_id);

    if (profileErr) {
        console.warn('⚠️ Profile delete warning:', profileErr.message);
    }

    const { error: authErr } = await admin.auth.admin.deleteUser(user_id);

    if (authErr) {
        console.error('❌ Auth user delete error:', authErr.message);
        return errorResponse(authErr.message, 400);
    }

    console.log(`✅ User ${user_id} removed`);
    return jsonResponse({ success: true });
}
