// ========== AIMEE.iA v2 - WHATSAPP WEBHOOK ==========
// Entry point. Handles both:
// 1. Direct Meta Cloud API webhooks
// 2. Make.com coexistence mode (pre-processed payload)
// Deduplicates, saves message, identifies conversation, invokes ai-agent.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getSupabaseClient, corsHeaders, corsResponse, jsonResponse, errorResponse } from '../_shared/supabase.ts';
import { resolveTenant } from '../_shared/whatsapp.ts';
import { isDuplicateMessage, logError, logActivity } from '../_shared/utils.ts';
import { Tenant, WhatsAppWebhookEntry, MakeWebhookRequest } from '../_shared/types.ts';

serve(async (req: Request) => {
  // CORS preflight
  if (req.method === 'OPTIONS') return corsResponse();

  const supabase = getSupabaseClient();

  try {
    // ========== GET: Webhook Verification ==========
    if (req.method === 'GET') {
      const url = new URL(req.url);
      const mode = url.searchParams.get('hub.mode');
      const token = url.searchParams.get('hub.verify_token');
      const challenge = url.searchParams.get('hub.challenge');

      // Verify token from env or any active tenant
      const verifyToken = Deno.env.get('WA_VERIFY_TOKEN');

      if (mode === 'subscribe' && token === verifyToken) {
        console.log('✅ Webhook verified');
        return new Response(challenge, { status: 200 });
      }

      return errorResponse('Verification failed', 403);
    }

    // ========== POST: Incoming Message ==========
    if (req.method === 'POST') {
      const body = await req.json();

      // Detect source: Meta webhook vs Make webhook
      if (body.phone_number && body.message_body !== undefined) {
        // Make.com coexistence mode
        return await handleMakeWebhook(supabase, body as MakeWebhookRequest);
      } else if (body.object === 'whatsapp_business_account') {
        // Direct Meta webhook
        return await handleMetaWebhook(supabase, body);
      }

      return errorResponse('Unknown webhook format', 400);
    }

    return errorResponse('Method not allowed', 405);

  } catch (error) {
    console.error('❌ Webhook error:', error);
    return errorResponse((error as Error).message);
  }
});

// ========== HANDLE DIRECT META WEBHOOK ==========

async function handleMetaWebhook(supabase: any, body: any): Promise<Response> {
  const entries = body.entry as WhatsAppWebhookEntry[] || [];

  for (const entry of entries) {
    for (const change of entry.changes) {
      if (change.field !== 'messages') continue;

      const value = change.value;
      const metadata = value.metadata;
      const waPhoneNumberId = metadata.phone_number_id;

      // Resolve tenant
      const tenant = await resolveTenant(supabase, waPhoneNumberId);
      if (!tenant) {
        console.warn('⚠️ No tenant for phone_number_id:', waPhoneNumberId);
        continue;
      }

      // Process status updates
      if (value.statuses) {
        for (const status of value.statuses) {
          await processStatusUpdate(supabase, tenant, status);
        }
      }

      // Process messages
      if (value.messages) {
        for (const message of value.messages) {
          const contactInfo = value.contacts?.[0];
          await processInboundMessage(supabase, tenant, {
            phoneNumber: message.from,
            messageBody: extractMessageBody(message),
            messageType: message.type,
            contactName: contactInfo?.profile?.name || null,
            waMessageId: message.id,
            waPhoneNumberId,
            rawMessage: message,
            timestamp: message.timestamp,
          });
        }
      }
    }
  }

  return jsonResponse({ status: 'ok' });
}

// ========== HANDLE MAKE.COM WEBHOOK ==========

async function handleMakeWebhook(supabase: any, payload: MakeWebhookRequest): Promise<Response> {
  const waPhoneNumberId = payload.wa_phone_number_id;

  // Resolve tenant
  let tenant: Tenant | null = null;
  if (waPhoneNumberId) {
    tenant = await resolveTenant(supabase, waPhoneNumberId);
  }

  if (!tenant) {
    // Fallback: try to find tenant from context or use first active
    const { data: firstTenant } = await supabase
      .from('tenants')
      .select('*')
      .eq('is_active', true)
      .limit(1)
      .maybeSingle();
    tenant = firstTenant as Tenant | null;
  }

  if (!tenant) return errorResponse('No active tenant found', 404);

  const result = await processInboundMessage(supabase, tenant, {
    phoneNumber: payload.phone_number,
    messageBody: payload.message_body || '',
    messageType: payload.message_type || 'text',
    contactName: payload.contact_name || null,
    waMessageId: payload.wa_message_id || `make_${Date.now()}`,
    waPhoneNumberId: tenant.wa_phone_number_id || '',
    rawMessage: payload,
    timestamp: payload.timestamp || String(Math.floor(Date.now() / 1000)),
  });

  // Return response in Make-expected format
  return jsonResponse({
    status: 'ok',
    ai_response: result.aiResponse || null,
    department: result.department || null,
    action: result.action || 'responded',
  });
}

// ========== PROCESS INBOUND MESSAGE ==========

interface InboundMessageParams {
  phoneNumber: string;
  messageBody: string;
  messageType: string;
  contactName: string | null;
  waMessageId: string;
  waPhoneNumberId: string;
  rawMessage: any;
  timestamp: string;
}

interface ProcessResult {
  aiResponse?: string;
  department?: string;
  action?: string;
}

async function processInboundMessage(
  supabase: any,
  tenant: Tenant,
  params: InboundMessageParams
): Promise<ProcessResult> {
  const { phoneNumber, messageBody, waMessageId } = params;

  console.log(`📨 Inbound from ${phoneNumber}: "${messageBody?.slice(0, 100)}"`);

  // 1. Deduplicate
  if (await isDuplicateMessage(supabase, tenant.id, waMessageId)) {
    console.log('⏭️ Duplicate message, skipping');
    return { action: 'duplicate' };
  }

  // 2. Find or create contact
  const contact = await findOrCreateContact(supabase, tenant.id, phoneNumber, params.contactName);

  // 3. Find or create conversation
  const conversation = await findOrCreateConversation(supabase, tenant.id, phoneNumber, contact.id);

  // 4. Save inbound message
  await supabase.from('messages').insert({
    tenant_id: tenant.id,
    conversation_id: conversation.id,
    wa_message_id: waMessageId,
    wa_from: phoneNumber,
    wa_to: params.waPhoneNumberId,
    direction: 'inbound',
    body: messageBody,
    media_type: params.messageType !== 'text' ? params.messageType : null,
    department_code: conversation.department_code,
    raw: params.rawMessage,
    created_at: new Date().toISOString(),
  });

  // 5. Update conversation last_message_at
  await supabase
    .from('conversations')
    .update({ last_message_at: new Date().toISOString() })
    .eq('id', conversation.id);

  // 6. Check if AI is active
  const { data: state } = await supabase
    .from('conversation_states')
    .select('*')
    .eq('tenant_id', tenant.id)
    .eq('phone_number', phoneNumber)
    .maybeSingle();

  if (state?.is_ai_active === false) {
    console.log('🤚 AI disabled for this conversation (operator takeover)');
    return { action: 'operator_active' };
  }

  // 7. Invoke ai-agent
  try {
    const aiResponse = await supabase.functions.invoke('ai-agent', {
      body: {
        tenant_id: tenant.id,
        phone_number: phoneNumber,
        message_body: messageBody,
        message_type: params.messageType,
        contact_name: contact.name || params.contactName,
        conversation_id: conversation.id,
        contact_id: contact.id,
        raw_message: params.rawMessage,
      },
    });

    const data = aiResponse.data;
    return {
      aiResponse: data?.ai_response,
      department: data?.department,
      action: data?.action || 'responded',
    };

  } catch (error) {
    console.error('❌ Error invoking ai-agent:', error);
    await logError(supabase, tenant.id, 'whatsapp-webhook', error, { phoneNumber });
    return { action: 'error' };
  }
}

// ========== HELPERS ==========

async function findOrCreateContact(
  supabase: any,
  tenantId: string,
  phone: string,
  name: string | null
): Promise<{ id: string; name: string | null }> {
  const { data: existing } = await supabase
    .from('contacts')
    .select('id, name')
    .eq('tenant_id', tenantId)
    .eq('phone', phone)
    .maybeSingle();

  if (existing) {
    // Update name if we have one and contact doesn't
    if (name && !existing.name) {
      await supabase.from('contacts').update({ name }).eq('id', existing.id);
    }
    return existing;
  }

  const { data: newContact } = await supabase
    .from('contacts')
    .insert({
      tenant_id: tenantId,
      phone,
      name,
      status: 'ativo',
    })
    .select('id, name')
    .single();

  return newContact!;
}

async function findOrCreateConversation(
  supabase: any,
  tenantId: string,
  phoneNumber: string,
  contactId: string
): Promise<{ id: string; department_code: string | null }> {
  // Find active conversation
  const { data: existing } = await supabase
    .from('conversations')
    .select('id, department_code')
    .eq('tenant_id', tenantId)
    .eq('phone_number', phoneNumber)
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existing) return existing;

  // Create new conversation
  const { data: newConv } = await supabase
    .from('conversations')
    .insert({
      tenant_id: tenantId,
      phone_number: phoneNumber,
      contact_id: contactId,
      status: 'active',
      last_message_at: new Date().toISOString(),
    })
    .select('id, department_code')
    .single();

  // Initialize conversation state
  await supabase
    .from('conversation_states')
    .upsert({
      tenant_id: tenantId,
      phone_number: phoneNumber,
      triage_stage: 'greeting',
      is_ai_active: true,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'tenant_id,phone_number' });

  return newConv!;
}

function extractMessageBody(message: any): string {
  if (message.type === 'text') return message.text?.body || '';
  if (message.type === 'interactive') {
    return message.interactive?.button_reply?.title ||
           message.interactive?.list_reply?.title || '';
  }
  if (message.type === 'button') return message.button?.text || '';
  if (message.type === 'image') return message.image?.caption || '[Imagem]';
  if (message.type === 'audio') return '[Áudio]';
  if (message.type === 'document') return `[Documento: ${message.document?.filename || 'arquivo'}]`;
  return '';
}

async function processStatusUpdate(supabase: any, tenant: Tenant, status: any) {
  // Update message status (delivered, read, etc.)
  if (status.id) {
    await supabase
      .from('messages')
      .update({ raw: { ...status, status_update: true } })
      .eq('tenant_id', tenant.id)
      .eq('wa_message_id', status.id);
  }
}
