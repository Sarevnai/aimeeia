// ========== AIMEE.iA v2 - MANAGE TEMPLATES ==========
// CRUD operations on WhatsApp Message Templates via Meta Graph API.
//
// Actions:
//   sync     → Fetch all templates from Meta and upsert into DB
//   create   → Create a new template on Meta (submit for approval)
//   delete   → Delete a template from Meta
//
// Required: tenant must have waba_id AND wa_access_token set.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getSupabaseClient, corsHeaders, corsResponse, jsonResponse, errorResponse } from '../_shared/supabase.ts';

const META_API_VERSION = 'v21.0';
const META_API_BASE = 'https://graph.facebook.com';

interface MetaTemplate {
    id: string;
    name: string;
    category: string;
    language: string;
    status: string;
    components: any[];
}

serve(async (req: Request) => {
    if (req.method === 'OPTIONS') return corsResponse();

    const supabase = getSupabaseClient();

    try {
        const body = await req.json();
        const { tenant_id, action } = body;

        if (!tenant_id || !action) {
            return errorResponse('Missing tenant_id or action', 400);
        }

        // Load tenant
        const { data: tenant } = await supabase
            .from('tenants')
            .select('*')
            .eq('id', tenant_id)
            .single();

        if (!tenant) return errorResponse('Tenant not found', 404);

        const wabaId = tenant.waba_id;
        const accessToken = tenant.wa_access_token;

        if (!accessToken) {
            return errorResponse('Tenant missing wa_access_token', 400);
        }

        switch (action) {
            case 'sync':
                return await syncTemplates(supabase, tenant_id, wabaId, accessToken);

            case 'create':
                return await createTemplate(supabase, tenant_id, wabaId, accessToken, body);

            case 'delete':
                return await deleteTemplate(supabase, tenant_id, wabaId, accessToken, body);

            default:
                return errorResponse(`Unknown action: ${action}`, 400);
        }

    } catch (error) {
        console.error('❌ Manage templates error:', error);
        return errorResponse((error as Error).message);
    }
});

// ═══════════════════════════════════════════════
// SYNC: Fetch all templates from Meta → upsert DB
// ═══════════════════════════════════════════════

async function syncTemplates(
    supabase: any,
    tenantId: string,
    wabaId: string | null,
    accessToken: string
): Promise<Response> {
    if (!wabaId) {
        return errorResponse('Tenant missing waba_id (WhatsApp Business Account ID). Configure it in Settings.', 400);
    }

    const url = `${META_API_BASE}/${META_API_VERSION}/${wabaId}/message_templates?limit=250`;

    console.log(`🔄 Syncing templates from Meta for WABA: ${wabaId}`);

    const response = await fetch(url, {
        headers: { 'Authorization': `Bearer ${accessToken}` },
    });

    const data = await response.json();

    if (!response.ok) {
        console.error('❌ Meta API error:', JSON.stringify(data));
        return errorResponse(data?.error?.message || 'Failed to fetch templates from Meta', 502);
    }

    const metaTemplates: MetaTemplate[] = data.data || [];
    console.log(`📋 Found ${metaTemplates.length} templates on Meta`);

    // Upsert each template into whatsapp_templates
    let synced = 0;
    let errors = 0;

    for (const mt of metaTemplates) {
        const { error } = await supabase
            .from('whatsapp_templates')
            .upsert({
                tenant_id: tenantId,
                name: mt.name,
                category: mt.category,
                language: mt.language,
                status: mt.status,
                components: mt.components,
            }, {
                onConflict: 'tenant_id,name',
                ignoreDuplicates: false,
            });

        if (error) {
            console.warn(`⚠️ Failed to upsert template "${mt.name}":`, error.message);
            errors++;
        } else {
            synced++;
        }
    }

    // Mark templates in DB that no longer exist on Meta
    const metaNames = new Set(metaTemplates.map(t => t.name));
    const { data: dbTemplates } = await supabase
        .from('whatsapp_templates')
        .select('id, name')
        .eq('tenant_id', tenantId);

    if (dbTemplates) {
        for (const dbt of dbTemplates) {
            if (!metaNames.has(dbt.name)) {
                await supabase
                    .from('whatsapp_templates')
                    .update({ status: 'DISABLED' })
                    .eq('id', dbt.id);
            }
        }
    }

    console.log(`✅ Sync complete: ${synced} synced, ${errors} errors`);

    return jsonResponse({
        success: true,
        synced,
        errors,
        total_on_meta: metaTemplates.length,
    });
}

// ═══════════════════════════════════════════════
// CREATE: Submit new template to Meta for approval
// ═══════════════════════════════════════════════

async function createTemplate(
    supabase: any,
    tenantId: string,
    wabaId: string | null,
    accessToken: string,
    body: any
): Promise<Response> {
    if (!wabaId) {
        return errorResponse('Tenant missing waba_id', 400);
    }

    const { template_name, category, language_code, components } = body;

    if (!template_name || !category || !components) {
        return errorResponse('Missing template_name, category, or components', 400);
    }

    const url = `${META_API_BASE}/${META_API_VERSION}/${wabaId}/message_templates`;

    const payload = {
        name: template_name,
        category,
        language: language_code || 'pt_BR',
        components,
    };

    console.log(`📝 Creating template "${template_name}" on Meta`);

    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
    });

    const data = await response.json();

    if (!response.ok) {
        console.error('❌ Meta create template error:', JSON.stringify(data));
        return errorResponse(data?.error?.message || 'Failed to create template', 502);
    }

    console.log(`✅ Template created on Meta, id: ${data.id}`);

    // Save to our DB with PENDING status
    const { error: dbError } = await supabase
        .from('whatsapp_templates')
        .upsert({
            tenant_id: tenantId,
            name: template_name,
            category,
            language: language_code || 'pt_BR',
            status: 'PENDING',
            components,
        }, {
            onConflict: 'tenant_id,name',
        });

    if (dbError) {
        console.warn('⚠️ Template created on Meta but failed to save to DB:', dbError.message);
    }

    return jsonResponse({
        success: true,
        meta_template_id: data.id,
        status: data.status || 'PENDING',
    });
}

// ═══════════════════════════════════════════════
// DELETE: Delete template from Meta
// ═══════════════════════════════════════════════

async function deleteTemplate(
    supabase: any,
    tenantId: string,
    wabaId: string | null,
    accessToken: string,
    body: any
): Promise<Response> {
    if (!wabaId) {
        return errorResponse('Tenant missing waba_id', 400);
    }

    const { template_name } = body;
    if (!template_name) {
        return errorResponse('Missing template_name', 400);
    }

    const url = `${META_API_BASE}/${META_API_VERSION}/${wabaId}/message_templates?name=${encodeURIComponent(template_name)}`;

    console.log(`🗑️ Deleting template "${template_name}" from Meta`);

    const response = await fetch(url, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${accessToken}` },
    });

    const data = await response.json();

    if (!response.ok) {
        console.error('❌ Meta delete template error:', JSON.stringify(data));
        return errorResponse(data?.error?.message || 'Failed to delete template', 502);
    }

    // Delete from our DB
    await supabase
        .from('whatsapp_templates')
        .delete()
        .eq('tenant_id', tenantId)
        .eq('name', template_name);

    console.log(`✅ Template "${template_name}" deleted`);

    return jsonResponse({ success: true, deleted: template_name });
}
