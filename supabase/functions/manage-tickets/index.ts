// ========== AIMEE.iA v2 - MANAGE TICKETS ==========
// CRUD operations for tickets, comments, and stage transitions.
// JWT ON - requires authenticated caller.
//
// Actions:
//   list_tickets     → List tickets for tenant (with filters)
//   get_ticket       → Get single ticket with comments
//   create_ticket    → Create a new ticket manually
//   update_ticket    → Update ticket fields (stage, priority, assigned_to, etc.)
//   add_comment      → Add a comment to a ticket
//   list_categories  → List ticket categories for tenant
//   list_stages      → List ticket stages for tenant

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { sendWhatsAppMessage } from "../_shared/whatsapp.ts";

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

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return corsResponse();

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return errorResponse('Missing Authorization header', 401);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;

    // Admin client: bypasses RLS
    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Caller client: validates JWT identity
    const caller = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: { user }, error: userErr } = await caller.auth.getUser();
    if (userErr || !user) return errorResponse('Unauthorized', 401);

    // Get caller profile (for tenant_id and role)
    const { data: profile } = await admin
      .from('profiles')
      .select('tenant_id, role')
      .eq('id', user.id)
      .single();

    if (!profile?.tenant_id) return errorResponse('User has no tenant', 403);

    const tenantId = profile.tenant_id;
    const userId = user.id;

    const body = await req.json();
    const { action } = body;

    switch (action) {
      case 'list_tickets':
        return await listTickets(admin, tenantId, body);
      case 'get_ticket':
        return await getTicket(admin, tenantId, body);
      case 'create_ticket':
        return await createTicket(admin, tenantId, userId, body);
      case 'update_ticket':
        return await updateTicket(admin, tenantId, userId, body);
      case 'add_comment':
        return await addComment(admin, tenantId, userId, body);
      case 'list_categories':
        return await listCategories(admin, tenantId);
      case 'list_stages':
        return await listStages(admin, tenantId);
      default:
        return errorResponse(`Unknown action: ${action}`, 400);
    }
  } catch (err) {
    console.error('❌ manage-tickets error:', err);
    return errorResponse((err as Error).message);
  }
});

// ═══════════════════════════════════════════════
// LIST TICKETS
// ═══════════════════════════════════════════════

async function listTickets(admin: any, tenantId: string, body: any): Promise<Response> {
  const { category, priority, stage_id, assigned_to, limit = 50, offset = 0 } = body;

  let query = admin
    .from('tickets')
    .select(`
      *,
      contact:contacts(id, name, phone, email, contact_type),
      assigned:profiles!tickets_assigned_to_fkey(id, full_name, avatar_url),
      stage_ref:ticket_stages!tickets_stage_id_fkey(id, name, color, is_terminal),
      category_ref:ticket_categories!tickets_category_id_fkey(id, name, sla_hours)
    `, { count: 'exact' })
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (category) query = query.eq('category', category);
  if (priority) query = query.eq('priority', priority);
  if (stage_id) query = query.eq('stage_id', stage_id);
  if (assigned_to) query = query.eq('assigned_to', assigned_to);

  const { data, error, count } = await query;

  if (error) return errorResponse(error.message);
  return jsonResponse({ tickets: data, total: count });
}

// ═══════════════════════════════════════════════
// GET SINGLE TICKET (with comments)
// ═══════════════════════════════════════════════

async function getTicket(admin: any, tenantId: string, body: any): Promise<Response> {
  const { ticket_id } = body;
  if (!ticket_id) return errorResponse('Missing ticket_id', 400);

  const { data: ticket, error } = await admin
    .from('tickets')
    .select(`
      *,
      contact:contacts(id, name, phone, email, contact_type, property_unit),
      assigned:profiles!tickets_assigned_to_fkey(id, full_name, avatar_url),
      stage_ref:ticket_stages!tickets_stage_id_fkey(id, name, color, is_terminal),
      category_ref:ticket_categories!tickets_category_id_fkey(id, name, sla_hours)
    `)
    .eq('id', ticket_id)
    .eq('tenant_id', tenantId)
    .single();

  if (error) return errorResponse(error.message);

  // Load comments
  const { data: comments } = await admin
    .from('ticket_comments')
    .select(`
      *,
      author:profiles!ticket_comments_user_id_fkey(id, full_name, avatar_url)
    `)
    .eq('ticket_id', ticket_id)
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: true });

  // Load conversation messages if linked
  let messages = null;
  if (ticket.conversation_id) {
    const { data: msgs } = await admin
      .from('messages')
      .select('id, direction, body, media_type, media_url, created_at')
      .eq('conversation_id', ticket.conversation_id)
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: true })
      .limit(100);
    messages = msgs;
  }

  return jsonResponse({ ticket, comments: comments || [], messages });
}

// ═══════════════════════════════════════════════
// CREATE TICKET (manual, from frontend)
// ═══════════════════════════════════════════════

async function createTicket(admin: any, tenantId: string, userId: string, body: any): Promise<Response> {
  const { title, category, category_id, description, priority, phone, email, contact_id, conversation_id, property_address, property_code } = body;

  if (!title) return errorResponse('Missing title', 400);

  // Look up SLA from category
  let slaHours = 48;
  if (category_id) {
    const { data: cat } = await admin
      .from('ticket_categories')
      .select('sla_hours')
      .eq('id', category_id)
      .maybeSingle();
    if (cat?.sla_hours) slaHours = cat.sla_hours;
  }

  // Look up default stage
  const { data: defaultStage } = await admin
    .from('ticket_stages')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('order_index', 0)
    .maybeSingle();

  const slaDeadline = new Date(Date.now() + slaHours * 60 * 60 * 1000).toISOString();

  const { data: ticket, error } = await admin
    .from('tickets')
    .insert({
      tenant_id: tenantId,
      title,
      category: category || 'Outros',
      category_id: category_id || null,
      description,
      priority: priority || 'media',
      stage: 'Novo',
      stage_id: defaultStage?.id || null,
      phone: phone || '',
      email: email || null,
      source: 'manual',
      contact_id: contact_id || null,
      conversation_id: conversation_id || null,
      department_code: 'administrativo',
      sla_deadline: slaDeadline,
    })
    .select()
    .single();

  if (error) return errorResponse(error.message);

  return jsonResponse({ ticket }, 201);
}

// ═══════════════════════════════════════════════
// UPDATE TICKET
// ═══════════════════════════════════════════════

async function updateTicket(admin: any, tenantId: string, userId: string, body: any): Promise<Response> {
  const { ticket_id, ...updates } = body;
  if (!ticket_id) return errorResponse('Missing ticket_id', 400);

  // Only allow specific fields to be updated
  const allowedFields = ['title', 'category', 'category_id', 'description', 'priority', 'stage', 'stage_id', 'assigned_to', 'resolution_notes', 'subcategory', 'property_address', 'property_code'];
  const safeUpdates: Record<string, any> = {};

  for (const key of allowedFields) {
    if (updates[key] !== undefined) {
      safeUpdates[key] = updates[key];
    }
  }

  // Check if stage is terminal (resolved/closed)
  if (updates.stage_id) {
    const { data: stage } = await admin
      .from('ticket_stages')
      .select('is_terminal, name')
      .eq('id', updates.stage_id)
      .maybeSingle();

    if (stage?.is_terminal && !safeUpdates.resolved_at) {
      safeUpdates.resolved_at = new Date().toISOString();
      safeUpdates.stage = stage.name;
    }
  }

  safeUpdates.updated_at = new Date().toISOString();

  const { data: ticket, error } = await admin
    .from('tickets')
    .update(safeUpdates)
    .eq('id', ticket_id)
    .eq('tenant_id', tenantId)
    .select('*, contact:contacts(name)')
    .single();

  if (error) return errorResponse(error.message);

  // Sprint 6.4 — dispara NPS quando ticket acabou de ser resolvido e ainda não foi pedido
  if (safeUpdates.resolved_at && !ticket.nps_requested_at && ticket.phone) {
    await triggerNpsRequest(admin, tenantId, ticket).catch((err) =>
      console.error('⚠️ NPS dispatch failed (non-blocking):', err),
    );
  }

  return jsonResponse({ ticket });
}

// ═══════════════════════════════════════════════
// NPS REQUEST (Sprint 6.4)
// ═══════════════════════════════════════════════
// Envia mensagem WhatsApp pedindo avaliação 1-5 pós-resolução.
// Cliente responde com o número → whatsapp-webhook captura e grava em tickets.nps_score.

async function triggerNpsRequest(admin: any, tenantId: string, ticket: any): Promise<void> {
  const { data: tenant } = await admin
    .from('tenants')
    .select('id, wa_phone_number_id, wa_access_token, company_name')
    .eq('id', tenantId)
    .maybeSingle();

  if (!tenant?.wa_phone_number_id || !tenant?.wa_access_token) {
    console.warn('⚠️ Tenant without WA credentials — NPS skipped');
    return;
  }

  const firstName = (ticket.contact?.name || '').split(' ')[0] || '';
  const ticketShort = ticket.id.slice(0, 8);
  const greeting = firstName ? `${firstName}, só` : 'Só';

  const body = `${greeting} pra fechar: como foi o atendimento do seu chamado #${ticketShort}?

1️⃣ Muito ruim   2️⃣ Ruim   3️⃣ Ok   4️⃣ Bom   5️⃣ Excelente

Responde só com o número, por favor. Obrigada! 🙌`;

  const result = await sendWhatsAppMessage(ticket.phone, body, tenant as any);
  if (!result.success) {
    console.warn('⚠️ NPS WhatsApp send failed');
    return;
  }

  await admin
    .from('tickets')
    .update({ nps_requested_at: new Date().toISOString() })
    .eq('id', ticket.id);

  // loga msg na conversa pra ficar no histórico
  if (ticket.conversation_id) {
    await admin.from('messages').insert({
      tenant_id: tenantId,
      conversation_id: ticket.conversation_id,
      wa_from: tenant.wa_phone_number_id,
      wa_to: ticket.phone,
      wa_message_id: result.messageId || null,
      direction: 'outbound',
      body,
      sender_type: 'ai',
      event_type: 'nps_requested',
      created_at: new Date().toISOString(),
    });
  }

  console.log(`✅ NPS requested for ticket ${ticketShort}`);
}

// ═══════════════════════════════════════════════
// ADD COMMENT
// ═══════════════════════════════════════════════

async function addComment(admin: any, tenantId: string, userId: string, body: any): Promise<Response> {
  const { ticket_id, comment, is_internal = false } = body;
  if (!ticket_id || !comment) return errorResponse('Missing ticket_id or comment', 400);

  const { data, error } = await admin
    .from('ticket_comments')
    .insert({
      tenant_id: tenantId,
      ticket_id,
      user_id: userId,
      body: comment,
      is_internal,
    })
    .select(`
      *,
      author:profiles!ticket_comments_user_id_fkey(id, full_name, avatar_url)
    `)
    .single();

  if (error) return errorResponse(error.message);

  return jsonResponse({ comment: data }, 201);
}

// ═══════════════════════════════════════════════
// LIST CATEGORIES
// ═══════════════════════════════════════════════

async function listCategories(admin: any, tenantId: string): Promise<Response> {
  const { data, error } = await admin
    .from('ticket_categories')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('is_active', true)
    .order('name');

  if (error) return errorResponse(error.message);
  return jsonResponse({ categories: data });
}

// ═══════════════════════════════════════════════
// LIST STAGES
// ═══════════════════════════════════════════════

async function listStages(admin: any, tenantId: string): Promise<Response> {
  const { data, error } = await admin
    .from('ticket_stages')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('order_index');

  if (error) return errorResponse(error.message);
  return jsonResponse({ stages: data });
}
