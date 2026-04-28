// ========== CONTEXTUAL FAREWELL ==========
// Quando o filtro de inbound detecta opt_out / wrong_audience, em vez de mandar
// um texto fixo robótico, geramos uma despedida que reconhece o que o cliente
// disse e o histórico recente da conversa. Mantém o fallback estático pra
// quando o LLM falha (sem deixar a despedida muda).

import { callLLM } from './ai-call.ts';
import { replyForReason } from './inbound-filters.ts';

export interface RecentMessage {
  direction: 'inbound' | 'outbound';
  body: string | null;
  created_at?: string | null;
  sender_type?: string | null;
}

export interface FarewellOptions {
  reason: 'opt_out' | 'wrong_audience';
  inboundBody: string;
  contactName: string | null;
  agentName: string;
  recentMessages: RecentMessage[];
  model?: string;
  provider?: string;
  apiKey?: string;
}

const REASON_BRIEF: Record<'opt_out' | 'wrong_audience', string> = {
  opt_out:
    'O cliente acabou de pedir pra parar de receber mensagens / disse que não tem interesse / disse que já resolveu (comprou, alugou, desistiu). NÃO insista, NÃO ofereça nada, NÃO pergunte motivo. A pessoa quer encerrar.',
  wrong_audience:
    'A pessoa que respondeu é outro corretor / consultor imobiliário / parceiro tentando oferecer serviços, não é um lead. Despeça-se cordialmente sem abrir parceria, sem explicar processo interno.',
};

function buildSystem(reason: 'opt_out' | 'wrong_audience', agentName: string): string {
  return [
    `Você é ${agentName}, atendente virtual de uma imobiliária. Sua única tarefa AGORA é gerar UMA mensagem curta de despedida pelo WhatsApp.`,
    '',
    'CONTEXTO:',
    REASON_BRIEF[reason],
    '',
    'REGRAS OBRIGATÓRIAS:',
    '1. LEIA a última mensagem do cliente antes de escrever — sua despedida precisa fazer sentido em relação ao que ele disse.',
    '2. Reconheça o motivo dele de forma empática e específica (ex: se já comprou, parabenize; se está cansado de mensagens, peça desculpas; se não tem mais interesse, simplesmente acolha).',
    '3. Confirme que você vai tirá-lo da lista / não enviará mais mensagens.',
    '4. NÃO ofereça alternativas, NÃO pergunte se mudou de ideia, NÃO peça feedback, NÃO cite outros imóveis.',
    '5. NÃO use frases genéricas tipo "qualquer coisa estamos à disposição" — ele acabou de dizer que NÃO quer.',
    '6. Tom humano, gentil, sem soar robótica. Espelhe o tom do cliente (formal/informal).',
    '7. Use no máximo 2 frases curtas. Sem listas, sem emojis em excesso (no máximo 1, opcional).',
    '8. Se souber o primeiro nome do cliente, use no início. Caso contrário, comece direto.',
    '9. NÃO use a expressão "está em nossa lista" / "lista de transmissão" — soa marketing. Diga "tiro seu contato" ou "não vou mais te incomodar".',
    '10. Saída: APENAS o texto da mensagem, sem aspas, sem marcadores, sem assinatura.',
  ].join('\n');
}

function buildUserPayload(opts: FarewellOptions): string {
  const firstName = opts.contactName ? opts.contactName.split(/\s+/)[0] : null;
  const history = (opts.recentMessages || [])
    .slice(-8)
    .map((m) => {
      const who = m.direction === 'inbound' ? 'Cliente' : opts.agentName;
      const body = (m.body || '').trim().slice(0, 400);
      if (!body) return null;
      return `${who}: ${body}`;
    })
    .filter(Boolean)
    .join('\n');

  return [
    firstName ? `Primeiro nome do cliente: ${firstName}` : 'Cliente sem nome cadastrado.',
    '',
    history ? `Histórico recente:\n${history}` : 'Sem histórico anterior relevante.',
    '',
    `Última mensagem do cliente (a que você precisa responder agora):\n"${opts.inboundBody.slice(0, 600)}"`,
    '',
    'Escreva agora a despedida.',
  ].join('\n');
}

function sanitize(raw: string): string {
  let s = (raw || '').trim();
  s = s.replace(/^["'`]+|["'`]+$/g, '');
  s = s.replace(/^(Despedida|Resposta|Mensagem)\s*:\s*/i, '');
  s = s.replace(/<\/?[^>]{1,30}>/g, '');
  return s.trim();
}

export async function generateContextualFarewell(opts: FarewellOptions): Promise<string> {
  const fallback = replyForReason(opts.reason, opts.contactName);
  try {
    const system = buildSystem(opts.reason, opts.agentName);
    const userPayload = buildUserPayload(opts);

    const result = await callLLM(system, [], userPayload, [], {
      model: opts.model,
      provider: opts.provider,
      apiKey: opts.apiKey,
      temperature: 0.6,
      maxTokens: 180,
    });

    const text = sanitize(result.content);
    if (!text || text.length < 8) {
      console.warn('⚠️ Farewell LLM returned empty/short text, using fallback.');
      return fallback;
    }
    return text;
  } catch (err) {
    console.error('❌ Farewell LLM failed, using fallback:', (err as Error).message);
    return fallback;
  }
}
