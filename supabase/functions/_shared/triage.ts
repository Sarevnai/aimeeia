// ========== AIMEE.iA v2 - TRIAGE ==========
// Manages the initial conversation flow: greeting → name → department selection.
// All config from DB (ai_agent_config), no hardcoded tenant references.

import { DepartmentType, Tenant, AIAgentConfig, ConversationState, TriageConfig } from './types.ts';

// ========== TRIAGE BUTTON MAPPING ==========

const TRIAGE_BUTTON_IDS: Record<string, DepartmentType> = {
  'dept_locacao': 'locacao',
  'dept_vendas': 'vendas',
  'dept_admin': 'administrativo',
};

const TRIAGE_BUTTON_TEXTS: Record<string, DepartmentType> = {
  'alugar': 'locacao',
  'locação': 'locacao',
  'locacao': 'locacao',
  'comprar': 'vendas',
  'vendas': 'vendas',
  'administrativo': 'administrativo',
  'admin': 'administrativo',
  'suporte': 'administrativo',
  'boleto': 'administrativo',
  'contrato': 'administrativo',
};

const DEPARTMENT_WELCOME: Record<string, string> = {
  locacao: 'Ótimo! Vou te ajudar a encontrar o imóvel ideal para alugar 🏠\n\nQual tipo de imóvel você procura? Apartamento, casa...?',
  vendas: 'Ótimo! Vou te ajudar a encontrar o imóvel perfeito para comprar 🏡\n\nQue tipo de imóvel você tem interesse?',
  administrativo: 'Certo! Estou aqui para te ajudar 📋\n\nPosso auxiliar com boletos, contratos, manutenção ou outras questões. O que você precisa?',
};

// ========== EXTRACT TRIAGE BUTTON ==========

export function extractTriageButtonId(message: any): { buttonId: string; department: DepartmentType } | null {
  // 1. Interactive button_reply
  const buttonReply = message.interactive?.button_reply;
  if (buttonReply?.id && TRIAGE_BUTTON_IDS[buttonReply.id]) {
    return { buttonId: buttonReply.id, department: TRIAGE_BUTTON_IDS[buttonReply.id] };
  }

  // 2. Template quick_reply text
  const buttonText = message.button?.text?.toLowerCase()?.trim();
  if (buttonText && TRIAGE_BUTTON_TEXTS[buttonText]) {
    return { buttonId: buttonText, department: TRIAGE_BUTTON_TEXTS[buttonText] };
  }

  // 3. Template quick_reply payload
  const buttonPayload = message.button?.payload?.toLowerCase()?.trim();
  if (buttonPayload && TRIAGE_BUTTON_TEXTS[buttonPayload]) {
    return { buttonId: buttonPayload, department: TRIAGE_BUTTON_TEXTS[buttonPayload] };
  }

  // 4. Free text match
  const body = (message.text?.body || '').toLowerCase().trim();
  for (const [text, dept] of Object.entries(TRIAGE_BUTTON_TEXTS)) {
    if (body === text || body.includes(text)) {
      return { buttonId: text, department: dept };
    }
  }

  return null;
}

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
  message: any,
  messageBody: string,
  phoneNumber: string,
  conversationId: string,
  triageConfig?: TriageConfig | null
): Promise<TriageResult> {
  const stage = state?.triage_stage || 'greeting';
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
        `Olá! 👋 Eu sou a ${agentName}, assistente virtual da ${tenant.company_name}.\n\nComo posso te chamar?`;

    await updateTriageStage(supabase, tenant.id, phoneNumber, 'awaiting_name');

    return {
      shouldContinue: true,
      responseMessages: [greetingMsg],
    };
  }

  // ========== STAGE: AWAITING NAME (+ VIP Intro) ==========
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

    await updateTriageStage(supabase, tenant.id, phoneNumber, 'awaiting_triage');

    // Build response messages
    const messages: string[] = [];

    // Name confirmation
    const nameConfirmation = triageConfig?.name_confirmation_template
      ? replaceTvars(triageConfig.name_confirmation_template, name || undefined)
      : name ? `Prazer, ${name}! 😊` : `Prazer! 😊`;
    messages.push(nameConfirmation);

    // VIP intro (if configured — adds ancoragem VIP after name)
    if (triageConfig?.vip_intro) {
      messages.push(replaceTvars(triageConfig.vip_intro, name || undefined));
    }

    // Department prompt (if no VIP intro, append default)
    if (!triageConfig?.vip_intro) {
      messages[0] += `\n\nComo posso te ajudar?`;
    }

    return {
      shouldContinue: true,
      responseMessages: messages,
      contactName: name || undefined,
    };
  }

  // ========== STAGE: AWAITING TRIAGE (Departamento) ==========
  if (stage === 'awaiting_triage') {
    // Check if user selected a department via button
    const buttonResult = extractTriageButtonId(message);
    if (buttonResult?.department) {
      await completeTriage(supabase, tenant.id, phoneNumber, conversationId, buttonResult.department);

      const welcomeMsg = triageConfig?.department_welcome?.[buttonResult.department]
        ? replaceTvars(triageConfig.department_welcome[buttonResult.department], state?.contact_name)
        : DEPARTMENT_WELCOME[buttonResult.department] || 'Como posso te ajudar?';

      return {
        shouldContinue: true,
        responseMessages: [welcomeMsg],
        department: buttonResult.department,
      };
    }

    // Try to infer department from free text
    const inferredDept = inferDepartmentFromText(messageBody);
    if (inferredDept) {
      await completeTriage(supabase, tenant.id, phoneNumber, conversationId, inferredDept);

      const welcomeMsg = triageConfig?.department_welcome?.[inferredDept]
        ? replaceTvars(triageConfig.department_welcome[inferredDept], state?.contact_name)
        : DEPARTMENT_WELCOME[inferredDept] || 'Como posso te ajudar?';

      return {
        shouldContinue: true,
        responseMessages: [welcomeMsg],
        department: inferredDept,
      };
    }

    // Can't determine department — send buttons
    return {
      shouldContinue: true,
      responseMessages: [],  // Will be sent as interactive buttons by caller
    };
  }

  // ========== COMPLETED — pass through to AI ==========
  return { shouldContinue: false, responseMessages: [] };
}

// ========== HELPER FUNCTIONS ==========

function extractName(text: string): string | null {
  const cleaned = text.trim();
  if (cleaned.length < 2 || cleaned.length > 60) return null;
  // If it's a single word or two words, likely a name
  const words = cleaned.split(/\s+/);
  if (words.length <= 4) {
    return words.map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
  }
  // Try to extract "me chamo X" / "meu nome é X"
  const nameMatch = cleaned.match(/(?:me\s+chamo?|meu\s+nome\s+[eé]|sou\s+(?:o|a)?\s*)\s*([a-záàâãéèêíïóôõöúç\s]+)/i);
  if (nameMatch) {
    return nameMatch[1].trim().split(/\s+/).map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
  }
  return null;
}

function inferDepartmentFromText(text: string): DepartmentType {
  const lower = text.toLowerCase();

  // Locação keywords
  if (/alug|locar|locação|alugo|para alugar|quero alugar/i.test(lower)) return 'locacao';

  // Vendas keywords
  if (/comprar|compra|venda|adquirir|investir|investimento/i.test(lower)) return 'vendas';

  // Administrativo keywords
  if (/boleto|contrato|manuten[cç][aã]o|reparo|chave|vistoria|rescis|2[aª]\s*via|segunda\s*via|suporte|admin/i.test(lower)) return 'administrativo';

  return null;
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

  // Sync department to contact
  await supabase
    .from('contacts')
    .update({ department_code: department })
    .eq('tenant_id', tenantId)
    .eq('phone', phoneNumber);
}
