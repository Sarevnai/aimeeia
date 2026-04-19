// ========== AIMEE.iA v2 - TRIAGE ==========
// Manages the initial conversation flow: greeting → name → department resolution.
// Department is decided by the lead's existing contact_type in the DB:
//   - proprietario / inquilino → administrativo
//   - everything else          → vendas (comercialAgent handles vendas+locacao)
// There are no buttons — the comercial agent detects mid-conversation if
// the lead self-identifies as inquilino/proprietario and transfers via tool.

import { DepartmentType, Tenant, AIAgentConfig, ConversationState, TriageConfig } from './types.ts';

// ========== DEPARTMENT WELCOME (default copy) ==========

const DEPARTMENT_WELCOME: Record<string, string> = {
  vendas: '\n\nEm que posso te ajudar hoje?',
  locacao: '\n\nEm que posso te ajudar hoje?',
  administrativo: '\n\nVi que você já é nosso cliente. Como posso te ajudar?',
};

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
  config: AIAgentConfig,
  state: ConversationState | null,
  _message: any,
  messageBody: string,
  phoneNumber: string,
  conversationId: string,
  triageConfig?: TriageConfig | null,
  contactName?: string | null,
  conversationSource?: string | null
): Promise<TriageResult> {
  const stage = state?.triage_stage || 'greeting';

  // For remarketing conversations, skip ALL triage — the client already engaged by replying
  // to the template. Let the AI agent handle everything contextually from the first message.
  if (stage === 'greeting' && conversationSource === 'remarketing') {
    await completeTriage(supabase, tenant.id, phoneNumber, conversationId, 'remarketing');
    return { shouldContinue: false };
  }
  const agentName = config.agent_name || 'Aimee';

  // Helper to replace triage template variables
  const replaceTvars = (text: string, name?: string): string => {
    return text
      .replaceAll('{{AGENT_NAME}}', agentName)
      .replaceAll('{{COMPANY_NAME}}', tenant.company_name)
      .replaceAll('{{CITY}}', tenant.city || '')
      .replaceAll('{{NAME}}', name || 'cliente');
  };

  // ========== STAGE: GREETING (Fase 1 — Ancoragem) ==========
  if (stage === 'greeting') {
    const greetingMsg = triageConfig?.greeting_message
      ? replaceTvars(triageConfig.greeting_message)
      : config.greeting_message ||
        `Olá! Eu sou a ${agentName}, assistente virtual da ${tenant.company_name}.\n\nComo posso te chamar?`;

    await updateTriageStage(supabase, tenant.id, phoneNumber, 'awaiting_name');

    return {
      shouldContinue: true,
      responseMessages: [greetingMsg],
    };
  }

  // ========== STAGE: AWAITING NAME → auto-route by contact_type ==========
  if (stage === 'awaiting_name') {
    const name = extractName(messageBody);

    // Save name to contact
    if (name) {
      await supabase
        .from('contacts')
        .update({ name })
        .eq('tenant_id', tenant.id)
        .eq('phone', phoneNumber);
    }

    // Decide department based on the contact's existing classification.
    // Inquilinos and proprietários go straight to admin; everyone else starts in comercial.
    const department = await resolveDepartmentFromContact(supabase, tenant.id, phoneNumber);
    await completeTriage(supabase, tenant.id, phoneNumber, conversationId, department);

    const messages: string[] = [];

    const nameConfirmation = triageConfig?.name_confirmation_template
      ? replaceTvars(triageConfig.name_confirmation_template, name || undefined)
      : name ? `Prazer, ${name}!` : `Prazer!`;

    // VIP intro override (keeps legacy consultora VIP behavior intact)
    if (triageConfig?.vip_intro) {
      messages.push(nameConfirmation);
      messages.push(replaceTvars(triageConfig.vip_intro, name || undefined));
    } else {
      const welcome = triageConfig?.department_welcome?.[department]
        ? replaceTvars(triageConfig.department_welcome[department], name || undefined)
        : DEPARTMENT_WELCOME[department] || '\n\nEm que posso te ajudar?';
      messages.push(nameConfirmation + welcome);
    }

    return {
      shouldContinue: true,
      responseMessages: messages,
      contactName: name || undefined,
      department,
    };
  }

  // ========== LEGACY STAGES (migrate stuck conversations forward) ==========
  // Any lead still parked on the old `awaiting_triage`, `remarketing_vip_pitch`, or
  // `remarketing_buyin` stages gets auto-completed so the AI agent picks up from here.
  if (stage === 'awaiting_triage') {
    const department = await resolveDepartmentFromContact(supabase, tenant.id, phoneNumber);
    await completeTriage(supabase, tenant.id, phoneNumber, conversationId, department);
    return { shouldContinue: false };
  }

  if (stage === 'remarketing_vip_pitch' || stage === 'remarketing_buyin') {
    await completeTriage(supabase, tenant.id, phoneNumber, conversationId, 'remarketing');
    return { shouldContinue: false };
  }

  // ========== COMPLETED — pass through to AI ==========
  return { shouldContinue: false, responseMessages: [] };
}

// ========== HELPER FUNCTIONS ==========

// Common greetings and filler words that should NOT be treated as names
const NOT_A_NAME = new Set([
  'olá', 'ola', 'oi', 'oii', 'oiii', 'ei', 'hey', 'hello', 'hi',
  'bom', 'boa', 'bom dia', 'boa tarde', 'boa noite', 'boa tarde!', 'bom dia!', 'boa noite!',
  'tudo', 'bem', 'tudo bem', 'tudo bom', 'ok', 'okay', 'sim', 'não', 'nao',
  'aqui', 'é', 'e', 'eu', 'de', 'da', 'do', 'me', 'meu', 'minha',
  'opa', 'eai', 'eaí', 'e aí', 'oi tudo', 'salve', 'fala', 'ae', 'aê',
  'como', 'como está', 'como esta', 'como vai', 'tudo certo', 'beleza',
  'obrigado', 'obrigada', 'valeu', 'vlw', 'blz',
]);

function extractName(text: string): string | null {
  const cleaned = text.trim();
  if (cleaned.length < 2 || cleaned.length > 60) return null;

  // Reject interrogative sentences (e.g., "Como está?", "Tudo bem?")
  if (/\?/.test(cleaned)) return null;

  // Reject common conversational phrases that aren't names
  const lowerCleaned = cleaned.toLowerCase().replace(/[!?.]/g, '').trim();
  if (/^(como\s+(est[aá]|vai)|tudo\s+(bem|certo|bom)|e\s+a[ií]|beleza|tranquilo)/.test(lowerCleaned)) return null;

  // Try to extract "me chamo X" / "meu nome é X" / "sou o X" first (most reliable)
  const nameMatch = cleaned.match(/(?:me\s+chamo?|meu\s+nome\s+[eé]|sou\s+(?:o|a)?\s*)\s*([a-záàâãéèêíïóôõöúç\s]+)/i);
  if (nameMatch) {
    const extracted = nameMatch[1].trim();
    if (extracted.length >= 2 && !NOT_A_NAME.has(extracted.toLowerCase())) {
      return extracted.split(/\s+/).map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
    }
  }

  // If it's a short phrase (≤4 words), treat as name — but filter out greetings/fillers
  const words = cleaned.split(/\s+/);
  if (words.length <= 4) {
    const lower = cleaned.toLowerCase().replace(/[!?.]/g, '').trim();
    if (NOT_A_NAME.has(lower)) return null;
    // Also reject if it starts with a greeting word
    const firstWord = words[0].toLowerCase().replace(/[!?.]/g, '');
    if (NOT_A_NAME.has(firstWord)) return null;
    // Reject pure numeric or very short single chars
    if (/^\d+$/.test(lower)) return null;
    return words.map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
  }

  return null;
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
