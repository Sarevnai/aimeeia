// ========== AIMEE.iA v2 - WHATSAPP MESSAGING ==========
// Send messages via Meta Cloud API. Multi-tenant: credentials from tenant.

import { Tenant } from './types.ts';

const META_API_VERSION = 'v21.0';
const META_API_BASE = 'https://graph.facebook.com';

// ========== RESOLVE TENANT FROM PHONE NUMBER ID ==========

export async function resolveTenant(
  supabase: any,
  waPhoneNumberId: string
): Promise<Tenant | null> {
  const { data, error } = await supabase
    .from('tenants')
    .select('*')
    .eq('wa_phone_number_id', waPhoneNumberId)
    .eq('is_active', true)
    .maybeSingle();

  if (error || !data) {
    console.error('❌ Tenant not found for phone_number_id:', waPhoneNumberId, error);
    return null;
  }
  return data as Tenant;
}

// ========== SEND TEXT MESSAGE ==========

export async function sendWhatsAppMessage(
  phoneNumber: string,
  message: string,
  tenant: Tenant
): Promise<{ success: boolean; messageId?: string }> {
  if (!tenant.wa_phone_number_id || !tenant.wa_access_token) {
    console.error('❌ Tenant missing WhatsApp credentials');
    return { success: false };
  }

  const url = `${META_API_BASE}/${META_API_VERSION}/${tenant.wa_phone_number_id}/messages`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${tenant.wa_access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: phoneNumber,
        type: 'text',
        text: { body: message },
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('❌ WhatsApp API error:', JSON.stringify(data));
      return { success: false };
    }

    const messageId = data.messages?.[0]?.id;
    console.log(`✅ Message sent to ${phoneNumber}: ${messageId}`);
    return { success: true, messageId };

  } catch (error) {
    console.error('❌ WhatsApp send error:', error);
    return { success: false };
  }
}

// ========== SEND IMAGE MESSAGE ==========

export async function sendWhatsAppImage(
  phoneNumber: string,
  imageUrl: string,
  caption: string,
  tenant: Tenant
): Promise<{ success: boolean; messageId?: string }> {
  if (!tenant.wa_phone_number_id || !tenant.wa_access_token) {
    return { success: false };
  }

  const url = `${META_API_BASE}/${META_API_VERSION}/${tenant.wa_phone_number_id}/messages`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${tenant.wa_access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: phoneNumber,
        type: 'image',
        image: { link: imageUrl, caption },
      }),
    });

    const data = await response.json();
    if (!response.ok) {
      console.error('❌ WhatsApp image error:', JSON.stringify(data));
      return { success: false };
    }

    return { success: true, messageId: data.messages?.[0]?.id };
  } catch (error) {
    console.error('❌ WhatsApp image send error:', error);
    return { success: false };
  }
}

// ========== SEND INTERACTIVE BUTTONS ==========

export async function sendWhatsAppButtons(
  phoneNumber: string,
  bodyText: string,
  buttons: Array<{ id: string; title: string }>,
  tenant: Tenant,
  headerText?: string
): Promise<{ success: boolean; messageId?: string }> {
  if (!tenant.wa_phone_number_id || !tenant.wa_access_token) {
    return { success: false };
  }

  const url = `${META_API_BASE}/${META_API_VERSION}/${tenant.wa_phone_number_id}/messages`;

  const interactive: any = {
    type: 'button',
    body: { text: bodyText },
    action: {
      buttons: buttons.slice(0, 3).map(b => ({
        type: 'reply',
        reply: { id: b.id, title: b.title.slice(0, 20) },
      })),
    },
  };

  if (headerText) {
    interactive.header = { type: 'text', text: headerText };
  }

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${tenant.wa_access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: phoneNumber,
        type: 'interactive',
        interactive,
      }),
    });

    const data = await response.json();
    if (!response.ok) {
      console.error('❌ WhatsApp buttons error:', JSON.stringify(data));
      return { success: false };
    }

    return { success: true, messageId: data.messages?.[0]?.id };
  } catch (error) {
    console.error('❌ WhatsApp buttons send error:', error);
    return { success: false };
  }
}

// ========== MARK AS READ ==========

export async function markAsRead(
  waMessageId: string,
  tenant: Tenant
): Promise<void> {
  if (!tenant.wa_phone_number_id || !tenant.wa_access_token) return;

  const url = `${META_API_BASE}/${META_API_VERSION}/${tenant.wa_phone_number_id}/messages`;

  try {
    await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${tenant.wa_access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        status: 'read',
        message_id: waMessageId,
      }),
    });
  } catch (e) {
    // Non-critical, don't throw
    console.warn('⚠️ Failed to mark as read:', e);
  }
}

// ========== SAVE OUTBOUND MESSAGE ==========

export async function saveOutboundMessage(
  supabase: any,
  tenantId: string,
  conversationId: string | null,
  phoneNumber: string,
  body: string,
  waMessageId?: string,
  departmentCode?: string,
  mediaType?: string,
  mediaUrl?: string
) {
  await supabase.from('messages').insert({
    tenant_id: tenantId,
    conversation_id: conversationId,
    wa_message_id: waMessageId || null,
    wa_from: 'system',
    wa_to: phoneNumber,
    direction: 'outbound',
    body,
    department_code: departmentCode || null,
    media_type: mediaType || null,
    media_url: mediaUrl || null,
    created_at: new Date().toISOString(),
  });
}
