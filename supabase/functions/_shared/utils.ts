// ========== AIMEE.iA v2 - UTILITIES ==========

export function formatCurrency(value: number): string {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export function formatPhone(phone: string): string {
  const clean = phone.replace(/\D/g, '');
  if (clean.length === 13 && clean.startsWith('55')) {
    const ddd = clean.slice(2, 4);
    const num = clean.slice(4);
    return `(${ddd}) ${num.slice(0, 5)}-${num.slice(5)}`;
  }
  return phone;
}

export function normalizePhone(phone: string): string {
  let clean = phone.replace(/\D/g, '');
  if (!clean.startsWith('55') && clean.length <= 11) {
    clean = '55' + clean;
  }
  return clean;
}

export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 3) + '...';
}

/**
 * Deduplicate WhatsApp message by wa_message_id.
 * Returns true if message already exists (duplicate).
 */
export async function isDuplicateMessage(
  supabase: any,
  tenantId: string,
  waMessageId: string
): Promise<boolean> {
  if (!waMessageId) return false;

  const { data } = await supabase
    .from('messages')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('wa_message_id', waMessageId)
    .limit(1)
    .maybeSingle();

  return !!data;
}

/**
 * Fragment a long message into multiple chunks at sentence boundaries.
 */
export function fragmentMessage(message: string, maxChars = 800): string[] {
  if (message.length <= maxChars) return [message];

  const sentences = message.split(/(?<=[.!?])\s+/);
  const fragments: string[] = [];
  let current = '';

  for (const sentence of sentences) {
    if ((current + ' ' + sentence).trim().length > maxChars && current) {
      fragments.push(current.trim());
      current = sentence;
    } else {
      current = current ? current + ' ' + sentence : sentence;
    }
  }
  if (current.trim()) fragments.push(current.trim());

  return fragments.length > 0 ? fragments : [message];
}

/**
 * Log error to ai_error_log table
 */
export async function logError(
  supabase: any,
  tenantId: string,
  functionName: string,
  error: any,
  context?: Record<string, any>
) {
  try {
    await supabase.from('ai_error_log').insert({
      tenant_id: tenantId,
      function_name: functionName,
      error_message: error?.message || String(error),
      error_stack: error?.stack || null,
      context: context || null,
    });
  } catch (e) {
    console.error('Failed to log error:', e);
  }
}

/**
 * Log activity to activity_logs table
 */
export async function logActivity(
  supabase: any,
  tenantId: string,
  actionType: string,
  targetTable?: string,
  targetId?: string,
  metadata?: Record<string, any>
) {
  try {
    await supabase.from('activity_logs').insert({
      tenant_id: tenantId,
      action_type: actionType,
      target_table: targetTable || null,
      target_id: targetId || null,
      metadata: metadata || null,
    });
  } catch (e) {
    console.error('Failed to log activity:', e);
  }
}
