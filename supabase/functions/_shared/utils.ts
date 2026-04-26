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

// Incidente A-02 (20/04/2026): quando contactName era null, o fallback
// `contactName || 'cliente'` substituía {{CONTACT_NAME}} pelo literal "cliente"
// e o LLM tratava isso como nome próprio, produzindo "Prazer em te conhecer,
// cliente!" e "cliente, que bom ter você aqui!". Esta função normaliza o
// nome para uso em prompts: devolve string vazia quando o valor é nulo,
// vazio ou um placeholder genérico que jamais deve virar vocativo.
export function resolveContactNameForPrompt(contactName: string | null | undefined): string {
  const trimmed = (contactName || '').trim();
  if (!trimmed) return '';
  const lower = trimmed.toLowerCase();
  if (lower === 'cliente' || lower === 'customer' || lower === 'lead' || lower === 'usuário' || lower === 'usuario') return '';
  return trimmed;
}

export function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 3) + '...';
}

// Travessão (em-dash —, en-dash –) é marca registrada de texto IA. Brasileiro
// em WhatsApp não usa. Sanitizador shared, usado tanto pelo pre-completion-check
// (sai do LLM) quanto pelo send-wa-message direto (mensagem AI compostas por
// fora do ai-agent). Mantém hífen normal (-) em palavras compostas como
// "bem-vindo", "ex-marido". Commit a71b3cf locked the rule, e o caso Terezinha
// (2026-04-25) mostrou que ela vazava por send-wa-message direto.
export function stripDashes(text: string): { sanitized: string; count: number } {
  const count = (text.match(/[—–]/g) || []).length;
  if (count === 0) return { sanitized: text, count: 0 };
  const sanitized = text
    .replace(/\s+[—–]\s+([a-záàâãéêíóôõúç])/gi, ', $1')
    .replace(/\s+[—–]\s+([A-ZÁÀÂÃÉÊÍÓÔÕÚÇ])/g, '. $1')
    .replace(/[—–]/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
  return { sanitized, count };
}

// Tour virtual (YouTube/Vimeo) NUNCA pode ir pro cliente. O Vista CRM expõe
// `raw_data.TourVirtual` em propriedades, e o LLM pode resolver pulá-lo no texto
// se for instruído OU compor mensagem manual com o link. Caso Terezinha
// (2026-04-25): operador acrescentou link de tour virtual de YouTube em
// retomada manual. Decisão Ian: NUNCA, EM HIPÓTESE ALGUMA, mostrar tour virtual.
// Sanitizador roda como segunda camada após o prompt.
const TOUR_PATTERNS: RegExp[] = [
  /\bhttps?:\/\/(?:www\.)?(?:youtube\.com|youtu\.be|m\.youtube\.com)\/\S+/gi,
  /\bhttps?:\/\/(?:www\.)?vimeo\.com\/\S+/gi,
  /\bhttps?:\/\/\S*tourvirtual\S*/gi,
  /\bhttps?:\/\/\S*matterport\.com\/\S+/gi,
  /\bhttps?:\/\/\S*kuula\.co\/\S+/gi,
  /\bhttps?:\/\/\S*my\.matterport\.\S+/gi,
];

export function stripTourLinks(text: string): { sanitized: string; count: number } {
  let count = 0;
  let sanitized = text;
  for (const pat of TOUR_PATTERNS) {
    sanitized = sanitized.replace(pat, () => { count++; return ''; });
  }
  if (count === 0) return { sanitized: text, count: 0 };
  // Limpa label órfão tipo "Tour virtual: " que sobrou sem URL
  sanitized = sanitized
    .replace(/\b(tour\s+virtual|v[ií]deo\s+do\s+im[oó]vel|v[ií]deo\s+tour|tour\s+360)\s*[:.\-–—]?\s*$/gim, '')
    .replace(/^\s*(tour\s+virtual|v[ií]deo\s+do\s+im[oó]vel|v[ií]deo\s+tour|tour\s+360)\s*[:.\-–—]?\s*$/gim, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return { sanitized, count };
}

// Aimee/Helena escreve valores monetários e medidas em formato numeral, nunca
// por extenso (ver feedback_aimee_format_monetario.md). Caso Erick (2026-04-26):
// caption do card vinha "R$ 3.200.000,00" ✅ mas a descrição livre logo abaixo
// vinha "três milhões e duzentos mil reais" ❌. Inconsistência derruba
// credibilidade e dificulta cliente comparar preços. Esta camada é safety net
// determinística — a regra primária está no system prompt (buildHumanStyleDirective).
const PT_UNIT_WORDS: Record<string, number> = {
  zero: 0, um: 1, uma: 1, dois: 2, duas: 2, tres: 3, quatro: 4, cinco: 5,
  seis: 6, sete: 7, oito: 8, nove: 9,
  dez: 10, onze: 11, doze: 12, treze: 13, quatorze: 14, catorze: 14, quinze: 15,
  dezesseis: 16, dezessete: 17, dezoito: 18, dezenove: 19,
  vinte: 20, trinta: 30, quarenta: 40, cinquenta: 50,
  sessenta: 60, setenta: 70, oitenta: 80, noventa: 90,
  cem: 100, cento: 100,
  duzentos: 200, duzentas: 200, trezentos: 300, trezentas: 300,
  quatrocentos: 400, quatrocentas: 400, quinhentos: 500, quinhentas: 500,
  seiscentos: 600, seiscentas: 600, setecentos: 700, setecentas: 700,
  oitocentos: 800, oitocentas: 800, novecentos: 900, novecentas: 900,
};
const PT_SCALE_WORDS: Record<string, number> = {
  mil: 1_000,
  milhao: 1_000_000, milhoes: 1_000_000,
  bilhao: 1_000_000_000, bilhoes: 1_000_000_000,
};
const NW_PATTERN = '(?:zero|um|uma|dois|duas|tr[eê]s|tres|quatro|cinco|seis|sete|oito|nove|dez|onze|doze|treze|catorze|quatorze|quinze|dezesseis|dezessete|dezoito|dezenove|vinte|trinta|quarenta|cinquenta|cinq[uü]enta|sessenta|setenta|oitenta|noventa|cem|cento|duzent[oa]s|trezent[oa]s|quatrocent[oa]s|quinhent[oa]s|seiscent[oa]s|setecent[oa]s|oitocent[oa]s|novecent[oa]s|mil|milh[aã]o|milh[oõ]es|bilh[aã]o|bilh[oõ]es)';
const SEQ_PATTERN = `${NW_PATTERN}(?:\\s+(?:e\\s+)?${NW_PATTERN})*`;

function normalizePtToken(raw: string): string {
  return raw.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

// Parse a string like "três milhões e duzentos mil" → 3200000.
// Returns -1 if it can't fully parse (caller should leave text untouched).
function parsePtNumberSequence(seq: string): number {
  const tokens = seq.split(/\s+/).map(normalizePtToken).filter(t => t && t !== 'e');
  if (tokens.length === 0) return -1;
  let total = 0;
  let current = 0;
  let sawScale = false;
  for (const tok of tokens) {
    if (tok in PT_UNIT_WORDS) {
      current += PT_UNIT_WORDS[tok];
      continue;
    }
    if (tok in PT_SCALE_WORDS) {
      const scale = PT_SCALE_WORDS[tok];
      if (current === 0) current = 1;
      total += current * scale;
      current = 0;
      sawScale = true;
      continue;
    }
    return -1;
  }
  const result = total + current;
  // Reject single-word "mil"/"milhão" etc. with no quantifier — too ambiguous
  if (sawScale && tokens.length === 1) return -1;
  return result;
}

function formatBRL(n: number): string {
  return 'R$ ' + n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatInteger(n: number): string {
  return n.toLocaleString('pt-BR');
}

// Converte valores por extenso ("três milhões e duzentos mil reais") em
// formato numeral ("R$ 3.200.000,00"). Cobre 3 casos:
//  1. <seq> [de] reais          → R$ X,XX
//  2. <seq> metros quadrados    → X m²
//  3. <seq> metros e <seq>      → X,YY metros (medida linear com centesimais)
// Casos implícitos (ex: "a dois milhões e oitocentos mil" sem "reais") são
// deixados de fora intencionalmente para evitar falso positivo em frases
// como "mil pessoas" ou "três milhões de seguidores". A regra primária no
// prompt deve cobrir esses casos.
export function numeralizeMonetaryAndMetric(text: string): { sanitized: string; count: number } {
  let count = 0;
  let sanitized = text;

  // 1. Medida linear: "dezoito metros e setenta e cinco" → "18,75 metros"
  const linearRe = new RegExp(`\\b(${SEQ_PATTERN})\\s+metros?\\s+e\\s+(${SEQ_PATTERN})(?=\\b|$)(?!\\s+quadrados?)`, 'gi');
  sanitized = sanitized.replace(linearRe, (match, seqA: string, seqB: string) => {
    const a = parsePtNumberSequence(seqA);
    const b = parsePtNumberSequence(seqB);
    if (a <= 0 || b < 0 || b >= 100) return match;
    count++;
    return `${formatInteger(a)},${String(b).padStart(2, '0')} metros`;
  });

  // 2. Metros quadrados: "mil cento e quarenta metros quadrados" → "1.140 m²"
  const m2Re = new RegExp(`\\b(${SEQ_PATTERN})\\s+metros?\\s+quadrados?\\b`, 'gi');
  sanitized = sanitized.replace(m2Re, (match, seq: string) => {
    const num = parsePtNumberSequence(seq);
    if (num <= 0) return match;
    count++;
    return `${formatInteger(num)} m²`;
  });

  // 3. Monetário explícito: "três milhões e duzentos mil reais" → "R$ 3.200.000,00"
  const moneyRe = new RegExp(`\\b(${SEQ_PATTERN})\\s+(?:de\\s+)?reais\\b`, 'gi');
  sanitized = sanitized.replace(moneyRe, (match, seq: string) => {
    const num = parsePtNumberSequence(seq);
    if (num <= 0) return match;
    count++;
    return formatBRL(num);
  });

  return { sanitized, count };
}

/**
 * Format string to WhatsApp Markdown syntax.
 * Converts **bold** to *bold*, and headers to bold text.
 */
export function formatWhatsAppMarkdown(text: string): string {
  if (!text) return '';

  let formatted = text.replace(/\*\*(.*?)\*\*/g, '*$1*');

  formatted = formatted.replace(/^###\s+(.*)$/gm, '*$1*');
  formatted = formatted.replace(/^##\s+(.*)$/gm, '*$1*');
  formatted = formatted.replace(/^#\s+(.*)$/gm, '*$1*');

  // Sanitizar travessões (em-dash e en-dash) — substituir por vírgula
  formatted = formatted.replace(/[—–]/g, ',');

  return formatted;
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
 * Fragment a long message into multiple chunks.
 * First splits on explicit ___ separators, then splits long chunks at sentence boundaries.
 */
export function fragmentMessage(message: string, maxChars = 800): string[] {
  // Step 1: Split on explicit ___ separators (used by AI agent for multi-message responses)
  const explicitParts = message.split(/\n?_{3,}\n?/).map(p => p.trim()).filter(Boolean);

  // Step 2: For each part, split further at sentence boundaries if too long
  const fragments: string[] = [];
  for (const part of explicitParts) {
    if (part.length <= maxChars) {
      fragments.push(part);
      continue;
    }

    const sentences = part.split(/(?<=[.!?])\s+/);
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
  }

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
      agent_name: functionName,
      error_type: 'runtime',
      error_message: error?.message || String(error),
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
