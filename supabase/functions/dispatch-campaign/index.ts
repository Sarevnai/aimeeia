// ========== AIMEE.iA v2 - DISPATCH CAMPAIGN ==========
// Processes bulk sending of a remarketing campaign.
// Iterates over pending campaign_results and sends via Meta Cloud API.
//
// Payload:
//   campaign_id: string
//   tenant_id: string
//   message_template?: string   (with {{nome}}, {{natureza}}, {{bairro}} vars)

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getSupabaseClient, corsHeaders, corsResponse, jsonResponse, errorResponse } from '../_shared/supabase.ts';
import { Tenant } from '../_shared/types.ts';

const META_API_VERSION = 'v21.0';
const META_API_BASE = 'https://graph.facebook.com';

function resolveMessage(template: string, contact: Record<string, string | null>): string {
  const natureza = contact.crm_natureza === 'Aluguel' ? 'aluguel'
    : contact.crm_natureza === 'Compra' ? 'compra'
    : 'busca de imóvel';
  const bairroStr = contact.neighborhood ? ` em ${contact.neighborhood}` : '';

  return template
    .replace(/\{\{nome\}\}/g, (contact.name || 'você').split(' ')[0])
    .replace(/\{\{natureza\}\}/g, natureza)
    .replace(/\{\{bairro\}\}/g, bairroStr);
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return corsResponse();

  const supabase = getSupabaseClient();

  try {
    const { campaign_id, tenant_id, message_template } = await req.json();

    if (!campaign_id || !tenant_id) {
      return errorResponse('Missing required fields: campaign_id, tenant_id', 400);
    }

    // ── Load campaign ──
    const { data: campaign } = await supabase
      .from('campaigns')
      .select('*')
      .eq('id', campaign_id)
      .eq('tenant_id', tenant_id)
      .single();

    if (!campaign) return errorResponse('Campaign not found', 404);

    // ── Load tenant ──
    const { data: tenantRow } = await supabase
      .from('tenants')
      .select('*')
      .eq('id', tenant_id)
      .single();

    if (!tenantRow) return errorResponse('Tenant not found', 404);

    const tenant = tenantRow as Tenant;
    if (!tenant.wa_phone_number_id || !tenant.wa_access_token) {
      return errorResponse('Tenant missing WhatsApp credentials', 400);
    }

    // ── Mark campaign as sending ──
    await supabase
      .from('campaigns')
      .update({ status: 'sending' })
      .eq('id', campaign_id);

    // ── Load pending campaign results with contact data ──
    const { data: results } = await supabase
      .from('campaign_results')
      .select('id, contact_id, phone, contacts(name, crm_natureza, neighborhood)')
      .eq('campaign_id', campaign_id)
      .eq('status', 'pending');

    if (!results || results.length === 0) {
      await supabase.from('campaigns').update({ status: 'sent' }).eq('id', campaign_id);
      return jsonResponse({ success: true, sent: 0 });
    }

    const templateName = campaign.template_name;
    const useTemplate = !!templateName;
    const messageTemplate = message_template ||
      (campaign.target_audience as any)?.message_template ||
      '';

    let sentCount = 0;
    let failedCount = 0;

    const metaUrl = `${META_API_BASE}/${META_API_VERSION}/${tenant.wa_phone_number_id}/messages`;

    for (const result of results) {
      const contact = (result.contacts as any) || {};
      const phone = result.phone;

      let payload: Record<string, unknown>;

      if (useTemplate) {
        // Send approved WhatsApp template
        const bodyParams = messageTemplate
          ? [resolveMessage(messageTemplate, contact)]
          : undefined;

        payload = {
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: phone,
          type: 'template',
          template: {
            name: templateName,
            language: { code: 'pt_BR' },
            ...(bodyParams
              ? {
                  components: [
                    {
                      type: 'body',
                      parameters: bodyParams.map((text) => ({ type: 'text', text })),
                    },
                  ],
                }
              : {}),
          },
        };
      } else {
        // Send free-form text message (only works for open conversations)
        if (!messageTemplate) {
          await supabase
            .from('campaign_results')
            .update({ status: 'failed', error_message: 'No message template or template name provided' })
            .eq('id', result.id);
          failedCount++;
          continue;
        }

        const text = resolveMessage(messageTemplate, contact);
        payload = {
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: phone,
          type: 'text',
          text: { body: text },
        };
      }

      const response = await fetch(metaUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${tenant.wa_access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (!response.ok) {
        console.error(`❌ Failed to send to ${phone}:`, data?.error?.message);
        await supabase
          .from('campaign_results')
          .update({
            status: 'failed',
            error_message: data?.error?.message || 'Meta API error',
          })
          .eq('id', result.id);
        failedCount++;
      } else {
        const waMessageId = data.messages?.[0]?.id;
        await supabase
          .from('campaign_results')
          .update({
            status: 'sent',
            sent_at: new Date().toISOString(),
            wa_message_id: waMessageId || null,
          })
          .eq('id', result.id);
        sentCount++;
      }
    }

    // ── Update campaign totals ──
    await supabase
      .from('campaigns')
      .update({
        status: 'sent',
        sent_count: sentCount,
      })
      .eq('id', campaign_id);

    console.log(`✅ Campaign ${campaign_id} dispatched: ${sentCount} sent, ${failedCount} failed`);

    return jsonResponse({
      success: true,
      sent: sentCount,
      failed: failedCount,
      total: results.length,
    });
  } catch (error) {
    console.error('❌ Dispatch campaign error:', error);
    return errorResponse((error as Error).message);
  }
});
