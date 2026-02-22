// ========== AIMEE.iA v2 - MANAGE TEAM ==========
// Admin-only operations for team/profile management.
//
// Actions:
//   regenerate_code    -> Generate new access code for tenant
//   update_role        -> Change a member's role (admin only)
//   remove_member      -> Remove a member from the tenant (admin only)
//   register_new_member -> Create profile for new user after signup with access code
//
// Security: JWT verified + caller must be admin of the same tenant
// (except register_new_member which is self-service after signup)

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function corsResponse() {
  return new Response('ok', { headers: corsHeaders });
}

function jsonResponse(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function errorResponse(message: string, status = 500) {
  console.error(`❌ ${message}`);
  return jsonResponse({ error: message }, status);
}

function getSupabaseClient() {
  const url = Deno.env.get('SUPABASE_URL')!;
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
}

serve(async (req: Request) => {
    if (req.method === 'OPTIONS') return corsResponse();

    const supabase = getSupabaseClient();

    try {
        const body = await req.json();
        const { action } = body;

        if (!action) {
            return errorResponse('Missing action', 400);
        }

        // For register_new_member, we don't need admin check
        if (action === 'register_new_member') {
            return await registerNewMember(supabase, body);
        }

        // All other actions require tenant_id and admin verification
        const { tenant_id } = body;
        if (!tenant_id) {
            return errorResponse('Missing tenant_id', 400);
        }

        // Verify caller is admin of this tenant via Authorization header
        const authHeader = req.headers.get('Authorization');
        if (!authHeader) {
            return errorResponse('Missing Authorization header', 401);
        }

        const token = authHeader.replace('Bearer ', '');
        const { data: { user }, error: authError } = await supabase.auth.getUser(token);

        if (authError || !user) {
            return errorResponse('Invalid or expired token', 401);
        }

        // Check caller's profile and role
        const { data: callerProfile } = await supabase
            .from('profiles')
            .select('id, tenant_id, role')
            .eq('id', user.id)
            .single();

        if (!callerProfile) {
            return errorResponse('Caller profile not found', 403);
        }

        if (callerProfile.tenant_id !== tenant_id) {
            return errorResponse('Tenant mismatch', 403);
        }

        if (callerProfile.role !== 'admin' && callerProfile.role !== 'super_admin') {
            return errorResponse('Only admins can perform this action', 403);
        }

        switch (action) {
            case 'regenerate_code':
                return await regenerateCode(supabase, tenant_id);

            case 'update_role':
                return await updateRole(supabase, tenant_id, callerProfile.id, body);

            case 'remove_member':
                return await removeMember(supabase, tenant_id, callerProfile.id, body);

            default:
                return errorResponse(`Unknown action: ${action}`, 400);
        }

    } catch (error) {
        console.error('❌ Manage team error:', error);
        return errorResponse((error as Error).message);
    }
});

// ===============================================
// REGENERATE CODE: Generate new 6-char access code
// ===============================================

async function regenerateCode(supabase: any, tenantId: string): Promise<Response> {
    let newCode = '';
    let attempts = 0;

    while (attempts < 5) {
        newCode = generateAccessCode();

        const { error } = await supabase
            .from('tenants')
            .update({ access_code: newCode })
            .eq('id', tenantId);

        if (!error) break;

        if (error.code === '23505') {
            attempts++;
            continue;
        }

        return errorResponse(`Failed to update access code: ${error.message}`);
    }

    if (attempts >= 5) {
        return errorResponse('Failed to generate unique code after 5 attempts');
    }

    console.log(`🔑 Regenerated access code for tenant ${tenantId}`);

    return jsonResponse({ success: true, access_code: newCode });
}

// ===============================================
// UPDATE ROLE: Change a member's role
// ===============================================

async function updateRole(
    supabase: any,
    tenantId: string,
    callerId: string,
    body: any
): Promise<Response> {
    const { target_user_id, new_role } = body;

    if (!target_user_id || !new_role) {
        return errorResponse('Missing target_user_id or new_role', 400);
    }

    const validRoles = ['admin', 'operator', 'viewer'];
    if (!validRoles.includes(new_role)) {
        return errorResponse(`Invalid role: ${new_role}. Must be one of: ${validRoles.join(', ')}`, 400);
    }

    if (target_user_id === callerId) {
        return errorResponse('Cannot change your own role', 400);
    }

    const { data: targetProfile } = await supabase
        .from('profiles')
        .select('id, tenant_id, role')
        .eq('id', target_user_id)
        .single();

    if (!targetProfile || targetProfile.tenant_id !== tenantId) {
        return errorResponse('Target user not found in this tenant', 404);
    }

    if (targetProfile.role === 'admin' && new_role !== 'admin') {
        const { count } = await supabase
            .from('profiles')
            .select('id', { count: 'exact', head: true })
            .eq('tenant_id', tenantId)
            .eq('role', 'admin');

        if ((count ?? 0) <= 1) {
            return errorResponse('Cannot remove the last admin. Promote another user first.', 400);
        }
    }

    const { error } = await supabase
        .from('profiles')
        .update({ role: new_role })
        .eq('id', target_user_id);

    if (error) {
        return errorResponse(`Failed to update role: ${error.message}`);
    }

    console.log(`👤 Updated role for ${target_user_id} to ${new_role} in tenant ${tenantId}`);

    return jsonResponse({ success: true, target_user_id, new_role });
}

// ===============================================
// REMOVE MEMBER: Detach user from tenant
// ===============================================

async function removeMember(
    supabase: any,
    tenantId: string,
    callerId: string,
    body: any
): Promise<Response> {
    const { target_user_id } = body;

    if (!target_user_id) {
        return errorResponse('Missing target_user_id', 400);
    }

    if (target_user_id === callerId) {
        return errorResponse('Cannot remove yourself', 400);
    }

    const { data: targetProfile } = await supabase
        .from('profiles')
        .select('id, tenant_id, role, full_name')
        .eq('id', target_user_id)
        .single();

    if (!targetProfile || targetProfile.tenant_id !== tenantId) {
        return errorResponse('Target user not found in this tenant', 404);
    }

    if (targetProfile.role === 'admin') {
        const { count } = await supabase
            .from('profiles')
            .select('id', { count: 'exact', head: true })
            .eq('tenant_id', tenantId)
            .eq('role', 'admin');

        if ((count ?? 0) <= 1) {
            return errorResponse('Cannot remove the last admin', 400);
        }
    }

    const { error } = await supabase
        .from('profiles')
        .delete()
        .eq('id', target_user_id);

    if (error) {
        return errorResponse(`Failed to remove member: ${error.message}`);
    }

    console.log(`🗑️ Removed ${targetProfile.full_name} (${target_user_id}) from tenant ${tenantId}`);

    return jsonResponse({ success: true, removed_user_id: target_user_id });
}

// ===============================================
// REGISTER NEW MEMBER: Create profile after signup
// ===============================================

async function registerNewMember(supabase: any, body: any): Promise<Response> {
    const { user_id, tenant_id, full_name } = body;

    if (!user_id || !tenant_id || !full_name) {
        return errorResponse('Missing user_id, tenant_id, or full_name', 400);
    }

    const { data: tenant } = await supabase
        .from('tenants')
        .select('id, is_active')
        .eq('id', tenant_id)
        .single();

    if (!tenant) {
        return errorResponse('Tenant not found', 404);
    }

    if (!tenant.is_active) {
        return errorResponse('This organization is inactive', 403);
    }

    const { data: existing } = await supabase
        .from('profiles')
        .select('id')
        .eq('id', user_id)
        .maybeSingle();

    if (existing) {
        return errorResponse('Profile already exists for this user', 409);
    }

    const { error } = await supabase
        .from('profiles')
        .insert({
            id: user_id,
            user_id: user_id,
            tenant_id: tenant_id,
            full_name: full_name.trim(),
            role: 'operator',
        });

    if (error) {
        return errorResponse(`Failed to create profile: ${error.message}`);
    }

    console.log(`✅ Registered new member ${full_name} (${user_id}) in tenant ${tenant_id}`);

    return jsonResponse({ success: true, user_id, tenant_id, role: 'operator' });
}

// ===============================================
// HELPERS
// ===============================================

function generateAccessCode(): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
}
