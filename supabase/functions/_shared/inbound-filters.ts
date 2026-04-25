// ========== INBOUND FILTERS ==========
// Detects messages that should bypass the AI agent entirely:
// - opt_out:         explicit unsubscribe / disinterest
// - auto_reply:      automated replies from the customer's own chatbot
// - wrong_audience:  sender is another broker / real-estate professional,
//                    not a lead

export type InboundFilterReason = 'opt_out' | 'auto_reply' | 'wrong_audience' | null;

export interface InboundFilterResult {
  reason: InboundFilterReason;
  matched: string | null;
}

// Normalizes accents and lowercases so the regexes work both ways
function normalize(text: string): string {
  return (text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

// Phrases that signal explicit opt-out or strong disinterest.
// Ordered from most specific to most generic.
//
// IMPORTANT — categorial rejection ("não quero apartamento", "não quero no Centro",
// "não quero acima de 3 milhões") MUST NOT trigger opt_out. Those mean the lead
// wants to PIVOT the search, not leave. Patterns below only fire when the negation
// targets the relationship itself (contato, lista, mensagem, atendimento, interesse).
const OPT_OUT_PATTERNS: RegExp[] = [
  /\b(retire|retira|retirar|remove|remova|remover|exclu[ai]|exclua[rs]?|apagu?a[rs]?|descadastr|tira[rs]?)\b.{0,40}\b(contato|cadastro|lista|numero|numero|dados)\b/,
  /\bn(a|ã)o.{0,15}(me.{0,10})?(mande|envi|contat|procure|ligue|escrev|manda|envia|procura|liga|escreve)\b/,
  /\b(parem?|pare)\b.{0,30}\b(mandar|enviar|escrever|contat|liga|manda|envia|me\s+mand)/,
  /\bnunca mais\b.{0,30}\b(mande|envi|contat|procur|lig|escrev)/,
  /\bsa(i|í)r\b.{0,25}\blista/,
  /\bn(a|ã)o (tenho|quero|estou|to|tô)\s+(mais\s+)?interesse(?!\s+(em|por|no|na|nesse|nessa|neste|nesta|naquele|naquela|nele|nela|nisso)\b)/,
  /\bsem\s+interesse(?!\s+(em|por|no|na|nesse|nessa|neste|nesta|naquele|naquela|nele|nela|nisso)\b)/,
  /\bn(a|ã)o me interessa(r|)(?!\s+(esse|esta|este|isso|aquele|aquela|esses|essas)\b)/,
  /\bn(a|ã)o\s+quero\s+(mais\s+)?(saber|receber|ser\s+contat|ouvir|atender|conversar|falar\s+com\s+voc|nada\s+disso|isso|nada)/,
  /\bn(a|ã)o\s+est(a|á|ou|ô|o)\s+mais\s+(procurando|buscando|interess|atr(a|á)s|querendo\s+nada)/,
  /\bj(a|á)\s+(consegui|resolvi|comprei|aluguei|fechei|achei|encontrei)\b/,
  /\bpor favor.{0,20}n(a|ã)o.{0,15}(mande|envi|contat|lig)/,
  /\bmudan(c|ç)a de planos\b/,
  /\bdesisti(?!\s+(de|do|da|desse|dessa|deste|desta|daquele|daquela|disso)\b)/,
];

// Phrases that signal the sender is a real-estate professional pitching
// *their* services, not a lead.
const WRONG_AUDIENCE_PATTERNS: RegExp[] = [
  /\bsou\s+(corretor|corretora|consultor[a]?\s+imobiliari|avaliador|credenciado|despachante)/,
  /\batuo\s+com\s+(avalia|consultoria|corretagem|imov)/,
  /\bcreci\b/,
  /\bbanco do brasil\b.{0,20}\bavalia/,
];

// Phrases that look like the customer's own WhatsApp / chatbot auto-reply
// (greetings with no actual content from the person).
const AUTO_REPLY_PATTERNS: RegExp[] = [
  /\bassim que poss[ií]vel.{0,30}retorn/,
  /\bprimeiro atendimento.{0,30}(somente|apenas|s[óo]).{0,10}(por\s+)?liga[çc][aã]o/,
  /\bfora do hor[áa]rio de atendimento\b/,
  /\bn(a|ã)o estou (online|dispon(i|í)vel) no momento\b/,
  /\bseja bem[- ]vindo.{0,80}(retorno|responderei|em breve)/,
  /\bobrigad[ao] pelo contato.{0,40}em breve/,
];

function firstMatch(text: string, patterns: RegExp[]): string | null {
  for (const re of patterns) {
    const m = text.match(re);
    if (m) return m[0];
  }
  return null;
}

/**
 * Classifies an inbound message body. Only meant for text messages — audio
 * transcriptions arrive already prefixed with "[Transcrição de áudio]: " so we
 * strip that prefix before matching.
 */
export function classifyInbound(body: string): InboundFilterResult {
  if (!body) return { reason: null, matched: null };

  const stripped = body.replace(/^\[Transcrição de áudio\]:\s*/i, '');
  const norm = normalize(stripped);

  const optOut = firstMatch(norm, OPT_OUT_PATTERNS);
  if (optOut) return { reason: 'opt_out', matched: optOut };

  const wrong = firstMatch(norm, WRONG_AUDIENCE_PATTERNS);
  if (wrong) return { reason: 'wrong_audience', matched: wrong };

  const auto = firstMatch(norm, AUTO_REPLY_PATTERNS);
  if (auto) return { reason: 'auto_reply', matched: auto };

  return { reason: null, matched: null };
}

/**
 * Polite, neutral response for each filter reason. Sent once — after that the
 * contact is marked DNC and future inbounds are silently ignored.
 */
export function replyForReason(reason: Exclude<InboundFilterReason, null>, contactName: string | null): string {
  const who = contactName ? contactName.split(/\s+/)[0] : null;
  const hi = who ? `${who}, ` : '';
  switch (reason) {
    case 'opt_out':
      return `${hi}entendido! Vou tirar seu contato da nossa lista e você não receberá mais mensagens. Obrigada e um ótimo dia!`;
    case 'wrong_audience':
      return `${hi}obrigada pelo retorno! No momento não atuamos com parcerias por este canal. Um bom trabalho pra você!`;
    case 'auto_reply':
      // Auto-reply: we don't respond (would just bounce back). Caller can
      // decide to send nothing when matched==='auto_reply'.
      return '';
  }
}
