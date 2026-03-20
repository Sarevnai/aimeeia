// ========== AIMEE.iA v2 - SEND WA TEMPLATE ==========
// Sends a validated WhatsApp template message via Meta Cloud API.
// Used by campaigns and owner-update flows.
//
// Payload:
//   tenant_id: string
//   phone_number: string
//   template_name: string       (e.g. "atualizacao_imovel_v1")
//   language_code?: string      (default "pt_BR")
//   header_params?: string[]    (header {{1}}, {{2}}, ...)
//   body_params?: string[]      (body positional {{1}}, {{2}}, ...)
//   named_body_params?: {name: string, value: string}[]  (named params e.g. {{nome}})
//   header_image_url?: string   (for IMAGE headers)
//   header_video_url?: string   (for VIDEO headers)
//   conversation_id?: string    (optional, to link in messages table)
//   campaign_id?: string        (optional, to update campaign_results)
//   contact_id?: string         (optional, to link to contact)

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getSupabaseClient, corsHeaders, corsResponse, jsonResponse, errorResponse } from '../_shared/supabase.ts';
import { saveOutboundMessage } from '../_shared/whatsapp.ts';
import { Tenant } from '../_shared/types.ts';

const META_API_VERSION = 'v21.0';
const META_API_BASE = 'https://graph.facebook.com';

serve(async (req: Request) => {
    if (req.method === 'OPTIONS') return corsResponse();

    const supabase = getSupabaseClient();

    try {
        const {
            tenant_id,
            phone_number,
            template_name,
            language_code = 'pt_BR',
            header_params,
            body_params,
            named_body_params,
            header_image_url,
            header_video_url,
            conversation_id,
            campaign_id,
            contact_id,
        } = await req.json();

        if (!tenant_id || !phone_number || !template_name) {
            return errorResponse('Missing required fields: tenant_id, phone_number, template_name', 400);
        }

        // ── Load tenant ──
        const { data: tenant } = await supabase
            .from('tenants')
            .select('*')
            .eq('id', tenant_id)
            .single();

        if (!tenant) return errorResponse('Tenant not found', 404);

        const t = tenant as Tenant;
        if (!t.wa_phone_number_id || !t.wa_access_token) {
            return errorResponse('Tenant missing WhatsApp credentials', 400);
        }

        // ── Build template components ──
        const components: any[] = [];

        // Header parameters (text or media)
        if (header_image_url) {
            components.push({
                type: 'header',
                parameters: [{ type: 'image', image: { link: header_image_url } }],
            });
        } else if (header_video_url) {
            components.push({
                type: 'header',
                parameters: [{ type: 'video', video: { link: header_video_url } }],
            });
        } else if (header_params && header_params.length > 0) {
            components.push({
                type: 'header',
                parameters: header_params.map((text: string) => ({ type: 'text', text })),
            });
        }

        // Body parameters — named params take precedence over positional
        // NOTE: We send named params as positional (without parameter_name) for
        // compatibility with Meta Cloud API v21.0 which doesn't support parameter_name.
        if (named_body_params && named_body_params.length > 0) {
            components.push({
                type: 'body',
                parameters: named_body_params.map(({ name, value }: { name: string; value: string }) => ({
                    type: 'text',
                    text: value,
                })),
            });
        } else if (body_params && body_params.length > 0) {
            components.push({
                type: 'body',
                parameters: body_params.map((text: string) => ({ type: 'text', text })),
            });
        }

        // ── Auto-detect named params from DB if no body params provided ──
        const hasBodyComponent = components.some((c) => c.type === 'body');
        if (!hasBodyComponent) {
            const { data: templateRow } = await supabase
                .from('whatsapp_templates')
                .select('components')
                .eq('name', template_name)
                .eq('tenant_id', tenant_id)
                .maybeSingle();

            if (templateRow?.components && Array.isArray(templateRow.components)) {
                const bodyComp = (templateRow.components as any[]).find((c: any) => c.type === 'BODY');
                const namedParams = bodyComp?.example?.body_text_named_params as
                    | Array<{ param_name: string; example: string }>
                    | undefined;

                if (namedParams && namedParams.length > 0) {
                    // Lookup contact name if we have contact_id
                    let contactName = '';
                    if (contact_id) {
                        const { data: contactRow } = await supabase
                            .from('contacts')
                            .select('name')
                            .eq('id', contact_id)
                            .maybeSingle();
                        contactName = contactRow?.name?.split(' ')[0] || '';
                    }

                    // Lookup agent name from ai_agent_config
                    let agentName = '';
                    const { data: agentConfig } = await supabase
                        .from('ai_agent_config')
                        .select('agent_name')
                        .eq('tenant_id', tenant_id)
                        .maybeSingle();
                    agentName = agentConfig?.agent_name || '';

                    // Resolve each named param
                    const paramResolvers: Record<string, string> = {
                        nome: contactName || 'você',
                        lead: contactName || 'você',
                        agente: agentName || t.company_name || '',
                        empresa: t.company_name || '',
                    };

                    const autoParams = namedParams.map((p) => ({
                        type: 'text',
                        text: paramResolvers[p.param_name] || p.example || '',
                    }));

                    components.push({ type: 'body', parameters: autoParams });
                    console.log(`🔄 Auto-detected named params: ${JSON.stringify(autoParams)}`);
                }
            }
        }

        // ── Send via Meta Cloud API ──
        const url = `${META_API_BASE}/${META_API_VERSION}/${t.wa_phone_number_id}/messages`;

        const payload: any = {
            messaging_product: 'whatsapp',
            recipient_type: 'individual',
            to: phone_number,
            type: 'template',
            template: {
                name: template_name,
                language: { code: language_code },
            },
        };

        if (components.length > 0) {
            payload.template.components = components;
        }

        console.log(`📤 Sending template "${template_name}" to ${phone_number}`, JSON.stringify(payload));

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${t.wa_access_token}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload),
        });

        const data = await response.json();

        if (!response.ok) {
            console.error('❌ Meta API error:', JSON.stringify(data));

            // If campaign result, update with error
            if (campaign_id && contact_id) {
                await supabase
                    .from('campaign_results')
                    .update({
                        status: 'failed',
                        error_message: data?.error?.message || 'Meta API error',
                    })
                    .eq('campaign_id', campaign_id)
                    .eq('contact_id', contact_id);
            }

            return errorResponse(data?.error?.message || 'Meta API error', 502);
        }

        const waMessageId = data.messages?.[0]?.id;
        console.log(`✅ Template sent to ${phone_number}, id: ${waMessageId}`);

        // ── Save outbound message ──
        const paramsPreview = named_body_params
            ? named_body_params.map(({ value }: { value: string }) => value).join(', ')
            : body_params?.join(', ') || '';
        const templateBody = `[Template: ${template_name}]${paramsPreview ? ' ' + paramsPreview : ''}`;
        await saveOutboundMessage(
            supabase,
            tenant_id,
            conversation_id || null,
            phone_number,
            templateBody,
            waMessageId,
            undefined,
            'template',
        );

        // ── Update campaign result if applicable ──
        if (campaign_id && contact_id) {
            await supabase
                .from('campaign_results')
                .update({
                    status: 'sent',
                    sent_at: new Date().toISOString(),
                    wa_message_id: waMessageId,
                })
                .eq('campaign_id', campaign_id)
                .eq('contact_id', contact_id);
        }

        // ── Update conversation last_message_at ──
        if (conversation_id) {
            await supabase
                .from('conversations')
                .update({ last_message_at: new Date().toISOString() })
                .eq('id', conversation_id);
        }

        return jsonResponse({
            success: true,
            message_id: waMessageId,
            template_name,
            phone_number,
        });

    } catch (error) {
        console.error('❌ Send template error:', error);
        return errorResponse((error as Error).message);
    }
});
