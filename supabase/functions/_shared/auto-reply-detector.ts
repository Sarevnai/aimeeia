// Detecta mensagens automáticas de WhatsApp Business de pessoas/negócios que NÃO
// são o lead — bio empresarial, agendamento de salão, autoresposta de catering.
// Caso Carolina (turn 2 da conv bc17812a, 2026-04-27): respondeu com bio da
// "Ana Carolina Donadio Freddi" (clínica + cowork em Vinhedo) ao template de
// remarketing da Smolka. Helena seguiu como se fosse a lead Carolina (de
// Florianópolis) e queimou a credibilidade. Mesmo padrão apareceu com Pamela
// (macarons/eventos) e Jonath (cabeleireiro/Petrichor Hair).
//
// Estratégia: combinar 6 sinais ortogonais. Precisa ≥2 pra flagrar. Sinal único
// nunca é suficiente — mensagens legítimas tipo "obrigada pelo contato, minha
// realidade mudou" (Daniela) ou "sou caisara de berço" (Clelia) não disparam.

export interface AutoReplyDetection {
  isAutoReply: boolean;
  reasons: string[];
}

const OFF_TOPIC_KEYWORDS = /\b(macaron|bem[\s-]?casado|cabeleire?ir[oa]|maquiad[oa]r|cl[íi]nica|podcast|cowork|sal[ãa]o|barbearia|consult[óo]rio|restaurante|caf[eé]ter|advogad[oa]|psic[óo]log[oa]|nutricionista|personal\s+trainer|fot[óo]graf[oa]|design(?:er)?\s+gr[aá]fico|veterin[aá]rio|odont[oó]log[oa]|dentista|imobili[aá]ria\s+[A-Z])\b/i;

const BOOKING_LANG = /\b(data\s+e\s+(hor[aá]rio|local)|hor[aá]rio\s+de\s+(atend|consulta)|de\s+(segunda|ter[cç]a|quarta|quinta|sexta)\s+a\s+(sex|s[aá]b)|aviso\s+de\s+aus[eê]ncia|estarei\s+(fora|ausente|de\s+f[eé]rias)|propostas?\s+personalizadas?|cardápio|hor[aá]rio\s+comercial)\b/i;

const SELF_INTRO_FULL_NAME = /\b[Ss]ou\s+[A-ZÁÊÇÕÍ][a-zá-úçãõ]+\s+[A-ZÁÊÇÕÍ][a-zá-úçãõ]+/;

const PHONE_PATTERN = /\+\s*55\s*\(?\s*\d{2}\)?\s*9?\s*\d{4,5}/g;

const URL_PATTERN = /(?:https?:\/\/|www\.)[^\s)]+/gi;

const THANKS_OPENER = /^\s*(ol[áa]!?\s*)?obrigad[oa](?:!|\.|,)?\s+pelo\s+(seu\s+)?contato/i;

export function detectAutoReply(body: string | null | undefined): AutoReplyDetection {
  if (!body || typeof body !== 'string') {
    return { isAutoReply: false, reasons: [] };
  }
  const text = body.trim();
  if (text.length < 80) {
    return { isAutoReply: false, reasons: [] };
  }
  const reasons: string[] = [];

  if (SELF_INTRO_FULL_NAME.test(text)) reasons.push('self_intro_full_name');

  const phones = text.match(PHONE_PATTERN) || [];
  if (phones.length >= 2) reasons.push('multiple_phones');

  const urls = text.match(URL_PATTERN) || [];
  const domains = new Set(
    urls.map(u =>
      u.replace(/^https?:\/\//i, '')
        .replace(/^www\./i, '')
        .split(/[/?#]/)[0]
        .toLowerCase()
    )
  );
  if (domains.size >= 2) reasons.push('multiple_domains');

  if (OFF_TOPIC_KEYWORDS.test(text)) reasons.push('off_topic_service');
  if (BOOKING_LANG.test(text)) reasons.push('booking_or_schedule');
  if (THANKS_OPENER.test(text) && text.length > 200) reasons.push('thanks_opener_long');

  return { isAutoReply: reasons.length >= 2, reasons };
}
