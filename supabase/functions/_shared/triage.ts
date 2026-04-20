// ========== AIMEE.iA v2 - TRIAGE ==========
// Minimal structural router: decides which department owns the conversation
// (via contacts.contact_type), marks triage complete, and hands over to the
// AI agent from the very first turn. No more hardcoded greetings or name
// prompts — the agent introduces itself and responds to intent contextually.

import { DepartmentType, Tenant, AIAgentConfig, ConversationState, TriageConfig } from './types.ts';

// ========== TRIAGE FLOW ==========

export interface TriageResult {
  shouldContinue: boolean;    // true = message handled by triage, don't pass to AI
  responseMessages: string[]; // messages to send back
  department?: DepartmentType;
  contactName?: string;
}

export async function handleTriage(
  supabase: any,
  tenant: Tenant,
  _config: AIAgentConfig,
  state: ConversationState | null,
  _message: any,
  _messageBody: string,
  phoneNumber: string,
  conversationId: string,
  _triageConfig?: TriageConfig | null,
  _contactName?: string | null,
  conversationSource?: string | null,
  _messageType?: string | null
): Promise<TriageResult> {
  const stage = state?.triage_stage || 'greeting';

  // DNC conversations are already handled at the webhook layer; don't invoke the agent.
  if (stage === 'dnc') return { shouldContinue: true, responseMessages: [] };

  // If triage already completed, pass straight through to the AI.
  if (stage === 'completed') return { shouldContinue: false };

  // Everything else (greeting / awaiting_name / legacy stages): resolve the
  // department once, mark triage complete, and let the AI agent take over from
  // the very first turn. No more hardcoded greetings — the agent introduces
  // itself and responds to intent contextually, using the WhatsApp profile name.
  const department = conversationSource === 'remarketing'
    ? 'remarketing'
    : await resolveDepartmentFromContact(supabase, tenant.id, phoneNumber);

  await completeTriage(supabase, tenant.id, phoneNumber, conversationId, department);
  return { shouldContinue: false };
}

// ========== DEPARTMENT RESOLUTION ==========

// Reads contacts.contact_type for this phone. Returns the department that should
// own the conversation. Defaults to 'vendas' when the contact doesn't exist yet
// or is just a generic lead — the comercial agent handles vendas+locacao and
// can transfer to admin mid-conversation via the transferir_administrativo tool.
export async function resolveDepartmentFromContact(
  supabase: any,
  tenantId: string,
  phoneNumber: string
): Promise<DepartmentType> {
  const { data: contact } = await supabase
    .from('contacts')
    .select('contact_type, department_code')
    .eq('tenant_id', tenantId)
    .eq('phone', phoneNumber)
    .maybeSingle();

  if (!contact) return 'vendas';

  if (contact.contact_type === 'proprietario' || contact.contact_type === 'inquilino') {
    return 'administrativo';
  }

  // Respect an explicit department already set on the contact (e.g. imported with
  // department_code=locacao from a portal), otherwise default to vendas.
  if (contact.department_code === 'locacao' || contact.department_code === 'administrativo') {
    return contact.department_code;
  }

  return 'vendas';
}

export async function updateTriageStage(
  supabase: any,
  tenantId: string,
  phoneNumber: string,
  stage: string
) {
  await supabase
    .from('conversation_states')
    .upsert({
      tenant_id: tenantId,
      phone_number: phoneNumber,
      triage_stage: stage,
      is_ai_active: true,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'tenant_id,phone_number' });
}

async function completeTriage(
  supabase: any,
  tenantId: string,
  phoneNumber: string,
  conversationId: string,
  department: DepartmentType
) {
  // Update triage stage
  await supabase
    .from('conversation_states')
    .upsert({
      tenant_id: tenantId,
      phone_number: phoneNumber,
      triage_stage: 'completed',
      is_ai_active: true,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'tenant_id,phone_number' });

  // Assign department to conversation
  const { data: firstStage } = await supabase
    .from('conversation_stages')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('department_code', department)
    .order('order_index', { ascending: true })
    .limit(1)
    .maybeSingle();

  const updateData: any = { department_code: department };
  if (firstStage) updateData.stage_id = firstStage.id;

  await supabase
    .from('conversations')
    .update(updateData)
    .eq('id', conversationId);

  // Sync department to contact (don't overwrite contact_type — the import owns that)
  await supabase
    .from('contacts')
    .update({ department_code: department })
    .eq('tenant_id', tenantId)
    .eq('phone', phoneNumber);
}
