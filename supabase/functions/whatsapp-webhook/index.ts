// ========== AIMEE.iA v2 - WHATSAPP WEBHOOK ==========
// Entry point. Handles both:
// 1. Direct Meta Cloud API webhooks
// 2. Make.com coexistence mode (pre-processed payload)
// Deduplicates, saves message, identifies conversation, invokes ai-agent.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getSupabaseClient, corsHeaders, corsResponse, jsonResponse, errorResponse } from '../_shared/supabase.ts';
import { resolveTenant, sendWhatsAppMessage } from '../_shared/whatsapp.ts';
import { isDuplicateMessage, logError, logActivity } from '../_shared/utils.ts';
import { transcribeWhatsAppAudio } from '../_shared/audio-transcription.ts';
import { downloadAndHostWhatsAppMedia } from '../_shared/whatsapp-media.ts';
import { classifyInbound, replyForReason } from '../_shared/inbound-filters.ts';
import { normalizePhone, phoneVariants } from '../_shared/phone.ts';
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
  const entries = body.entry || [];

  for (const entry of entries) {
    for (const change of entry.changes) {
      // ── MESSAGE TEMPLATE STATUS UPDATE ──
      // Meta sends this when a template is approved, rejected, or paused
      if (change.field === 'message_template_status_update') {
        await processTemplateStatusUpdate(supabase, entry.id, change.value);
        continue;
      }

      // ── ACCOUNT UPDATE (template quality, etc) ──
      if (change.field === 'account_update') {
        console.log('ℹ️ Account update:', JSON.stringify(change.value));
        continue;
      }

      // ── MESSAGES (inbound + delivery status) ──
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

      // Load AI config to check audio_enabled
      const { data: aiConfig } = await supabase
        .from('ai_agent_config')
        .select('audio_enabled')
        .eq('tenant_id', tenant.id)
        .maybeSingle();
      const audioEnabled = aiConfig?.audio_enabled === true;

      // Process delivery status updates (sent, delivered, read, failed)
      if (value.statuses) {
        for (const status of value.statuses) {
          await processStatusUpdate(supabase, tenant, status);
        }
      }

      // Process inbound messages
      if (value.messages) {
        for (const message of value.messages) {
          const contactInfo = value.contacts?.[0];

          // Resolve quoted message body if this is a reply
          let quotedMessageBody: string | null = null;
          if (message.context?.id) {
            const { data: quotedMsg } = await supabase
              .from('messages')
              .select('body')
              .eq('tenant_id', tenant.id)
              .eq('wa_message_id', message.context.id)
              .maybeSingle();
            if (quotedMsg?.body) {
              quotedMessageBody = quotedMsg.body;
              console.log(`💬 Quoted message resolved: "${quotedMessageBody?.slice(0, 80)}"`);
            }
          }

          // Extract message body (sync) + attempt audio transcription if enabled
          let messageBody = extractMessageBody(message);

          // DEBUG: Log audio transcription attempt to DB
          if (message.type === 'audio') {
            await supabase.from('activity_logs').insert({
              tenant_id: tenant.id,
              action_type: 'audio_debug',
              target_table: 'messages',
              metadata: {
                audioEnabled,
                hasAudioId: !!message.audio?.id,
                audioId: message.audio?.id,
                hasToken: !!tenant.wa_access_token,
                messageType: message.type,
                willTranscribe: !!(audioEnabled && message.audio?.id && tenant.wa_access_token),
              },
            });
          }

          if (message.type === 'audio' && audioEnabled && message.audio?.id && tenant.wa_access_token) {
            console.log(`🎙️ Audio detected (media_id: ${message.audio.id}, mime: ${message.audio.mime_type}). Attempting transcription...`);
            try {
              const transcription = await transcribeWhatsAppAudio(
                message.audio.id,
                message.audio.mime_type || 'audio/ogg',
                tenant.wa_access_token,
                { supabase, tenant_id: tenant.id }
              );
              if (transcription) {
                messageBody = `[Transcrição de áudio]: ${transcription}`;
                console.log(`🎙️ Audio transcribed (${transcription.length} chars): "${transcription.slice(0, 100)}"`);
              }
            } catch (err) {
              const errorMsg = (err as Error).message;
              console.error(`❌ Audio transcription failed: ${errorMsg}`);
              // Log to activity_logs (logError is broken — column mismatch with ai_error_log)
              await supabase.from('activity_logs').insert({
                tenant_id: tenant.id,
                action_type: 'audio_transcription_error',
                target_table: 'messages',
                metadata: {
                  error: errorMsg,
                  stack: (err as Error).stack?.slice(0, 500),
                  mediaId: message.audio.id,
                  mimeType: message.audio.mime_type,
                },
              });
            }
          } else if (message.type === 'audio') {
            console.log(`🎙️ Audio received but transcription skipped (audioEnabled=${audioEnabled}, hasAudioId=${!!message.audio?.id}, hasToken=${!!tenant.wa_access_token})`);
          }

          await processInboundMessage(supabase, tenant, {
            phoneNumber: message.from,
            messageBody,
            messageType: message.type,
            contactName: contactInfo?.profile?.name || null,
            waMessageId: message.id,
            waPhoneNumberId,
            rawMessage: message,
            timestamp: message.timestamp,
            quotedMessageBody,
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
    department: payload.department,
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
  department?: string;
  quotedMessageBody?: string | null;
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
  // Normaliza o número para forma canônica BR (sem 9 prefixo) — evita
  // criar entidades duplicadas quando Meta entrega sem o 9.
  const phoneNumber = normalizePhone(params.phoneNumber) || params.phoneNumber;
  const { messageBody, waMessageId } = params;

  console.log(`📨 Inbound from ${phoneNumber}${phoneNumber !== params.phoneNumber ? ` (raw: ${params.phoneNumber})` : ''}: "${messageBody?.slice(0, 100)}"`);

  // 1. Deduplicate
  if (await isDuplicateMessage(supabase, tenant.id, waMessageId)) {
    console.log('⏭️ Duplicate message, skipping');
    return { action: 'duplicate' };
  }

  // 2. Find or create contact
  const contact = await findOrCreateContact(supabase, tenant.id, phoneNumber, params.contactName);

  // 3. Find or create conversation
  const conversation = await findOrCreateConversation(supabase, tenant.id, phoneNumber, contact.id);

  // 3.5 Detect remarketing campaign response (new conversations only)
  const { data: convState } = await supabase
    .from('conversation_states')
    .select('triage_stage')
    .eq('tenant_id', tenant.id)
    .eq('phone_number', phoneNumber)
    .maybeSingle();

  if (convState?.triage_stage === 'greeting') {
    // Check if this phone has a recent remarketing campaign_result
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { data: remarketingResult } = await supabase
      .from('campaign_results')
      .select('id, campaign_id, campaigns!inner(id, campaign_type)')
      .eq('tenant_id', tenant.id)
      .eq('phone', phoneNumber)
      .gte('sent_at', sevenDaysAgo)
      .eq('campaigns.campaign_type', 'remarketing')
      .order('sent_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (remarketingResult) {
      console.log(`🎯 Remarketing response detected for ${phoneNumber}, campaign: ${remarketingResult.campaign_id}`);

      // Update conversation: source, campaign_id, department
      await supabase
        .from('conversations')
        .update({
          source: 'remarketing',
          campaign_id: remarketingResult.campaign_id,
          department_code: 'remarketing',
        })
        .eq('id', conversation.id);
      conversation.department_code = 'remarketing';

      // Update campaign_result as replied
      await supabase
        .from('campaign_results')
        .update({
          status: 'replied',
          replied_at: new Date().toISOString(),
        })
        .eq('id', remarketingResult.id);

      // Set triage to remarketing VIP pitch
      await supabase
        .from('conversation_states')
        .upsert({
          tenant_id: tenant.id,
          phone_number: phoneNumber,
          triage_stage: 'remarketing_vip_pitch',
          is_ai_active: true,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'tenant_id,phone_number' });

      // Assign first remarketing pipeline stage
      const { data: firstStage } = await supabase
        .from('conversation_stages')
        .select('id')
        .eq('tenant_id', tenant.id)
        .eq('department_code', 'remarketing')
        .order('order_index', { ascending: true })
        .limit(1)
        .maybeSingle();

      if (firstStage) {
        await supabase
          .from('conversations')
          .update({ stage_id: firstStage.id })
          .eq('id', conversation.id);
      }
    }
  }

  // 3.6 Update conversation department if provided via Make webhook
  if (params.department && conversation.department_code !== params.department) {
    await supabase.from('conversations').update({ department_code: params.department }).eq('id', conversation.id);
    conversation.department_code = params.department;

    // Issue 2: Backfill department_code em mensagens anteriores sem departamento
    await supabase
      .from('messages')
      .update({ department_code: params.department })
      .eq('conversation_id', conversation.id)
      .is('department_code', null);
  }

  // 3.9 Download and host inbound media (image/audio/video/document/sticker)
  // so the chat UI can render it. Meta download URLs expire in ~5 minutes and
  // require a bearer token, so we re-host to the public `chat-media` bucket.
  let mediaUrl: string | null = null;
  let mediaCaption: string | null = null;
  let mediaFilename: string | null = null;
  let mediaMimeType: string | null = null;

  const rawMsg = params.rawMessage || {};
  const mediaKinds = ['image', 'audio', 'video', 'document', 'sticker'];
  if (
    mediaKinds.includes(params.messageType) &&
    tenant.wa_access_token
  ) {
    const mediaBlock = rawMsg[params.messageType];
    const mediaId = mediaBlock?.id;
    if (mediaId) {
      try {
        const hosted = await downloadAndHostWhatsAppMedia(
          mediaId,
          params.messageType as any,
          tenant.wa_access_token,
          {
            supabase,
            tenantId: tenant.id,
            conversationId: conversation.id,
            originalFilename: rawMsg.document?.filename || null,
          }
        );
        mediaUrl = hosted.publicUrl;
        mediaFilename = rawMsg.document?.filename || hosted.filename;
        mediaMimeType = hosted.mimeType;
        mediaCaption = rawMsg.image?.caption || rawMsg.video?.caption || rawMsg.document?.caption || null;
        console.log(`📎 Hosted ${params.messageType} media: ${hosted.publicUrl}`);
      } catch (err) {
        const errorMsg = (err as Error).message;
        console.error(`❌ Media hosting failed (${params.messageType}): ${errorMsg}`);
        await supabase.from('activity_logs').insert({
          tenant_id: tenant.id,
          action_type: 'media_hosting_error',
          target_table: 'messages',
          metadata: {
            error: errorMsg,
            mediaId,
            messageType: params.messageType,
          },
        });
      }
    }
  }

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
    media_url: mediaUrl,
    media_caption: mediaCaption,
    media_filename: mediaFilename,
    media_mime_type: mediaMimeType,
    department_code: conversation.department_code,
    raw: params.rawMessage,
    sender_type: 'customer',
    created_at: new Date().toISOString(),
  });

  // 4.5 Reset follow-up flag (lead replied, so clear inactivity follow-up)
  await supabase
    .from('conversation_states')
    .update({ follow_up_sent_at: null, updated_at: new Date().toISOString() })
    .eq('tenant_id', tenant.id)
    .eq('phone_number', phoneNumber);

  // 4.6 Inbound filter: opt-out / auto-reply / wrong-audience detection.
  // If matched, we reply once (except auto-reply), mark the contact DNC,
  // close the conversation, and skip ai-agent entirely.
  const { data: contactRow } = await supabase
    .from('contacts')
    .select('id, name, dnc')
    .eq('id', contact.id)
    .maybeSingle();

  // Already flagged as DNC from a previous turn: silently drop and close.
  if (contactRow?.dnc) {
    console.log(`🚫 DNC contact ${phoneNumber}, silently ignoring.`);
    await supabase.from('conversations').update({ status: 'closed' }).eq('id', conversation.id);
    await supabase.from('conversation_states')
      .update({ is_ai_active: false, updated_at: new Date().toISOString() })
      .eq('tenant_id', tenant.id).eq('phone_number', phoneNumber);
    return { action: 'dnc_silent_drop' };
  }

  const filterHit = classifyInbound(messageBody);
  if (filterHit.reason) {
    console.log(`🚦 Inbound filter hit: ${filterHit.reason} ("${filterHit.matched}") for ${phoneNumber}`);

    // Mark contact as DNC and close conversation so ai-agent never sees it.
    await supabase.from('contacts').update({
      dnc: true,
      dnc_at: new Date().toISOString(),
      dnc_reason: filterHit.reason,
    }).eq('id', contact.id);

    await supabase.from('conversations').update({ status: 'closed' }).eq('id', conversation.id);

    await supabase.from('conversation_states')
      .upsert({
        tenant_id: tenant.id,
        phone_number: phoneNumber,
        is_ai_active: false,
        triage_stage: 'dnc',
        updated_at: new Date().toISOString(),
      }, { onConflict: 'tenant_id,phone_number' });

    // Polite one-shot reply (opt_out / wrong_audience). Auto-reply: stay silent.
    if (filterHit.reason !== 'auto_reply') {
      const replyText = replyForReason(filterHit.reason, contactRow?.name || null);
      try {
        const sent = await sendWhatsAppMessage(phoneNumber, replyText, tenant, waMessageId);
        await supabase.from('messages').insert({
          tenant_id: tenant.id,
          conversation_id: conversation.id,
          wa_message_id: sent.messageId || `dnc_${Date.now()}`,
          wa_from: tenant.wa_phone_number_id,
          wa_to: phoneNumber,
          direction: 'outbound',
          body: replyText,
          department_code: conversation.department_code,
          sender_type: 'ai',
          created_at: new Date().toISOString(),
        });
      } catch (err) {
        console.error('❌ Failed to send DNC reply:', (err as Error).message);
      }
    }

    await supabase.from('activity_logs').insert({
      tenant_id: tenant.id,
      action_type: 'inbound_filter_hit',
      target_table: 'contacts',
      target_id: contact.id,
      metadata: {
        reason: filterHit.reason,
        matched: filterHit.matched,
        phone: phoneNumber,
        conversation_id: conversation.id,
        message_body: messageBody.slice(0, 200),
      },
    });

    return { action: `filtered_${filterHit.reason}` };
  }

  // 5. Update conversation last_message_at
  await supabase
    .from('conversations')
    .update({ last_message_at: new Date().toISOString() })
    .eq('id', conversation.id);

  // 5.1 Sprint 6.4 — Captura NPS pós-resolução (admin setor locação)
  // Se Aimee pediu avaliação nas últimas 24h e msg é 1-5, grava e responde.
  const npsCaptured = await tryCaptureNps(supabase, tenant, phoneNumber, messageBody, conversation.id);
  if (npsCaptured) {
    return { action: 'nps_captured' };
  }

  // 5.5 Sprint 6.2 — registra mensagem no histórico do ticket (se houver),
  // mas NÃO curto-circuita o fluxo da IA. A Aimee Admin precisa continuar
  // conduzindo a conversa enquanto o operador alimenta contexto.
  // (Antes desse fix, uma mensagem chegando com ticket aberto virava só
  //  comentário interno, a IA nunca respondia — inclusive em áudio.)
  const { data: openTicket } = await supabase
    .from('tickets')
    .select('id, stage')
    .eq('tenant_id', tenant.id)
    .eq('phone', phoneNumber)
    .is('resolved_at', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (openTicket) {
    console.log(`🎫 Ticket aberto ${openTicket.id} — msg logada como comentário E segue pra IA.`);
    await supabase.from('ticket_comments').insert({
      tenant_id: tenant.id,
      ticket_id: openTicket.id,
      body: `[cliente no WhatsApp] ${messageBody}`,
      is_internal: true,
    });
    // NÃO retorna — continua pra IA responder.
  }

  // 6. Check if AI is active
  const { data: state } = await supabase
    .from('conversation_states')
    .select('*')
    .eq('tenant_id', tenant.id)
    .eq('phone_number', phoneNumber)
    .maybeSingle();

  if (state?.is_ai_active === false) {
    // BUG-5 fix: Don't reactivate AI if handoff was less than 5 minutes ago
    // This prevents double handoff when the client sends a follow-up message
    // right after being transferred (e.g. "Obrigado", "Perfeito").
    const handoffAgeMs = state?.operator_takeover_at
      ? Date.now() - new Date(state.operator_takeover_at).getTime()
      : Infinity;
    const HANDOFF_COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes

    if (handoffAgeMs < HANDOFF_COOLDOWN_MS) {
      console.log(`⏸️ AI reactivation skipped — handoff was ${Math.round(handoffAgeMs / 1000)}s ago (cooldown: ${HANDOFF_COOLDOWN_MS / 1000}s). Message saved but not processed by AI.`);
      return new Response(JSON.stringify({ status: 'skipped_handoff_cooldown' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    console.log('🔄 Reactivating AI after handoff — lead sent new message');
    await supabase.from('conversation_states').upsert({
      phone_number: phoneNumber,
      tenant_id: tenant.id,
      is_ai_active: true,
      operator_takeover_at: null,
      triage_stage: state?.triage_stage || 'greeting',
      updated_at: new Date().toISOString(),
    }, { onConflict: 'phone_number,tenant_id' });
    // Don't return — continue to step 7 to invoke ai-agent
  }

  // 6.5 MC-4: Debounce — if AI is already processing a message for this conversation,
  // skip invoking the agent. The current message is already saved (step 4) and will
  // be included in the conversation history when the agent reads it.
  // TTL: if lock is older than 2 minutes, consider it stale and proceed anyway.
  if (state?.is_processing === true) {
    const lockAgeMs = state?.updated_at
      ? Date.now() - new Date(state.updated_at).getTime()
      : 0;
    const LOCK_TTL_MS = 120_000; // 2 minutes

    if (lockAgeMs < LOCK_TTL_MS) {
      console.log(`⏳ MC-4: AI already processing (lock age: ${Math.round(lockAgeMs / 1000)}s). Message saved, skipping agent invocation.`);
      return { action: 'debounced' };
    }

    // Stale lock — release it and proceed
    console.warn(`⚠️ MC-4: Stale processing lock detected (age: ${Math.round(lockAgeMs / 1000)}s). Releasing and proceeding.`);
    await supabase
      .from('conversation_states')
      .update({ is_processing: false, updated_at: new Date().toISOString() })
      .eq('tenant_id', tenant.id)
      .eq('phone_number', phoneNumber);
  }

  // 6.6 MC-4: Acquire processing lock BEFORE invoking ai-agent to close the race window.
  // Previously the lock was only set inside ai-agent, leaving a gap where a second
  // webhook could pass the is_processing check before the first ai-agent invocation set it.
  await supabase
    .from('conversation_states')
    .upsert({
      tenant_id: tenant.id,
      phone_number: phoneNumber,
      is_processing: true,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'tenant_id,phone_number' });

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
        quoted_message_body: params.quotedMessageBody || null,
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
    // Release the processing lock on failure so the next message isn't blocked
    await supabase
      .from('conversation_states')
      .update({ is_processing: false, updated_at: new Date().toISOString() })
      .eq('tenant_id', tenant.id)
      .eq('phone_number', phoneNumber);
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
  // Meta às vezes entrega sem o 9 prefixo do celular BR. Busca tolerante por
  // todas as variantes antes de criar — evita duplicar o contato C2S.
  const variants = phoneVariants(phone);
  const canonical = variants[0] || phone;

  const { data: existing } = await supabase
    .from('contacts')
    .select('id, name, phone')
    .eq('tenant_id', tenantId)
    .in('phone', variants)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (existing) {
    if (name && !existing.name) {
      await supabase.from('contacts').update({ name }).eq('id', existing.id);
    }
    return existing;
  }

  const { data: newContact } = await supabase
    .from('contacts')
    .insert({
      tenant_id: tenantId,
      phone: canonical,
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
  const variants = phoneVariants(phoneNumber);
  const canonical = variants[0] || phoneNumber;

  const { data: existing } = await supabase
    .from('conversations')
    .select('id, department_code')
    .eq('tenant_id', tenantId)
    .in('phone_number', variants)
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existing) return existing;

  const { data: newConv } = await supabase
    .from('conversations')
    .insert({
      tenant_id: tenantId,
      phone_number: canonical,
      contact_id: contactId,
      status: 'active',
      last_message_at: new Date().toISOString(),
    })
    .select('id, department_code')
    .single();

  await supabase
    .from('conversation_states')
    .upsert({
      tenant_id: tenantId,
      phone_number: canonical,
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
  const waMessageId = status.id;
  const statusValue = status.status; // sent, delivered, read, failed
  const timestamp = status.timestamp;
  const recipientId = status.recipient_id;

  if (!waMessageId) return;

  console.log(`📊 Status update: ${waMessageId} → ${statusValue}`);

  // 1. Update message record
  await supabase
    .from('messages')
    .update({
      raw: { status_update: true, status: statusValue, timestamp, recipient_id: recipientId },
    })
    .eq('tenant_id', tenant.id)
    .eq('wa_message_id', waMessageId);

  // 2. Update campaign_results if this message is linked to a campaign
  const updateData: Record<string, any> = {};
  const now = new Date().toISOString();

  if (statusValue === 'delivered') {
    updateData.status = 'delivered';
    updateData.delivered_at = now;
  } else if (statusValue === 'read') {
    updateData.status = 'read';
    updateData.read_at = now;
  } else if (statusValue === 'failed') {
    updateData.status = 'failed';
    updateData.error_message = status.errors?.[0]?.message || 'Delivery failed';
  }

  if (Object.keys(updateData).length > 0) {
    // Try to find and update campaign_result by wa_message_id
    const { data: campaignResult } = await supabase
      .from('campaign_results')
      .select('id')
      .eq('tenant_id', tenant.id)
      .eq('wa_message_id', waMessageId)
      .maybeSingle();

    if (campaignResult) {
      await supabase
        .from('campaign_results')
        .update(updateData)
        .eq('id', campaignResult.id);
      console.log(`📊 Campaign result updated: ${campaignResult.id} → ${statusValue}`);
    }

    // Also check owner_update_results
    const { data: ownerResult } = await supabase
      .from('owner_update_results')
      .select('id')
      .eq('wa_message_id', waMessageId)
      .maybeSingle();

    if (ownerResult) {
      await supabase
        .from('owner_update_results')
        .update(updateData)
        .eq('id', ownerResult.id);
      console.log(`📊 Owner update result updated: ${ownerResult.id} → ${statusValue}`);
    }
  }
}

// ========== TEMPLATE STATUS UPDATE ==========
// Processes webhooks when Meta approves, rejects, or pauses a template.
// Payload format:
// {
//   "event": "APPROVED",
//   "message_template_id": 123456,
//   "message_template_name": "atualizacao_imovel_v1",
//   "message_template_language": "pt_BR",
//   "reason": "NONE" | "INCORRECT_CATEGORY" | ...
// }

async function processTemplateStatusUpdate(supabase: any, wabaId: string, value: any) {
  const event = value.event; // APPROVED, REJECTED, PAUSED, DISABLED, FLAGGED, REINSTATED
  const templateName = value.message_template_name;
  const templateLanguage = value.message_template_language;
  const reason = value.reason;

  console.log(`📋 Template status update: "${templateName}" (${templateLanguage}) → ${event}${reason ? ` (${reason})` : ''}`);

  if (!templateName) {
    console.warn('⚠️ Template status update missing template name');
    return;
  }

  // Map Meta event to our status
  const statusMap: Record<string, string> = {
    'APPROVED': 'APPROVED',
    'REJECTED': 'REJECTED',
    'PAUSED': 'PAUSED',
    'DISABLED': 'DISABLED',
    'FLAGGED': 'PAUSED',
    'REINSTATED': 'APPROVED',
    'PENDING_DELETION': 'DISABLED',
  };

  const newStatus = statusMap[event] || event;

  // Find tenant by WABA ID
  const { data: tenant } = await supabase
    .from('tenants')
    .select('id')
    .eq('waba_id', wabaId)
    .eq('is_active', true)
    .maybeSingle();

  if (!tenant) {
    console.warn(`⚠️ No tenant found for WABA ID: ${wabaId}`);
    return;
  }

  // Update template status in our DB
  const { error } = await supabase
    .from('whatsapp_templates')
    .update({ status: newStatus })
    .eq('tenant_id', tenant.id)
    .eq('name', templateName);

  if (error) {
    console.error(`❌ Failed to update template status: ${error.message}`);
  } else {
    console.log(`✅ Template "${templateName}" status updated to ${newStatus}`);
  }
}

// ========== NPS CAPTURE (Sprint 6.4) ==========
// Se Aimee enviou pedido de avaliação nas últimas 24h e cliente responde com 1-5,
// grava score + manda agradecimento, pulando o roteamento IA normal.

async function tryCaptureNps(
  supabase: any,
  tenant: Tenant,
  phoneNumber: string,
  messageBody: string,
  conversationId: string,
): Promise<boolean> {
  const trimmed = (messageBody || '').trim();
  // Só reconhece 1-5 puro ou com emoji número (1️⃣ etc). Aceita pontuação leve.
  const scoreMatch = trimmed.match(/^\s*([1-5])\s*(?:[.!]|️?⃣)?\s*$/);
  if (!scoreMatch) return false;
  const score = parseInt(scoreMatch[1], 10);

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data: ticket } = await supabase
    .from('tickets')
    .select('id, title, contact_id')
    .eq('tenant_id', tenant.id)
    .eq('phone', phoneNumber)
    .not('nps_requested_at', 'is', null)
    .is('nps_score', null)
    .gte('nps_requested_at', since)
    .order('nps_requested_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!ticket) return false;

  await supabase
    .from('tickets')
    .update({
      nps_score: score,
      nps_collected_at: new Date().toISOString(),
    })
    .eq('id', ticket.id);

  console.log(`📊 NPS captured: ticket ${ticket.id.slice(0, 8)} → score ${score}`);

  // Agradecimento adaptado ao score (tone guide: close with next step)
  const thanks =
    score >= 4
      ? `Obrigada pela avaliação! Fico feliz em ter ajudado. Qualquer coisa, tô por aqui. 🙌`
      : score === 3
        ? `Obrigada pelo retorno. Vou repassar seu feedback pra equipe pra melhorar. Se tiver algo específico que eu possa fazer, me conta.`
        : `Obrigada pelo retorno, sinto muito que o atendimento não atendeu sua expectativa. Vou pedir pro nosso gerente entrar em contato pra entender o que aconteceu e resolver.`;

  const sendResult = await sendWhatsAppMessage(phoneNumber, thanks, tenant);

  await supabase.from('messages').insert({
    tenant_id: tenant.id,
    conversation_id: conversationId,
    wa_from: tenant.wa_phone_number_id,
    wa_to: phoneNumber,
    wa_message_id: sendResult.messageId || null,
    direction: 'outbound',
    body: thanks,
    sender_type: 'ai',
    event_type: score <= 2 ? 'nps_alert' : 'nps_thanks',
    created_at: new Date().toISOString(),
  });

  // Score baixo (1-2) dispara alerta: pausa Aimee + aguarda gerente humano
  if (score <= 2) {
    await supabase
      .from('conversation_states')
      .upsert(
        {
          tenant_id: tenant.id,
          phone_number: phoneNumber,
          is_ai_active: false,
          operator_takeover_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'tenant_id,phone_number' },
      );
    console.log(`🚨 NPS alert (score ${score}) — Aimee pausada, gerente precisa assumir`);
  }

  return true;
}

