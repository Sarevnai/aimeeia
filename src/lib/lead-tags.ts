// ========== LEAD TAGS ==========
// Derives the three tags shown next to every lead/conversation:
//   - Origem: where the conversation came from (cron rewarm, campaign, portal, organic…)
//   - Situação: current state (Aimee atendendo, operador assumiu, qualificado, DNC…)
//   - DNC: highlighted red flag when the contact explicitly opted out
// Pure function — no side effects, no DB access. Feed it plain fields.

export type OrigemTag =
  | 'remarketing_auto'   // cron rewarm-archived-leads
  | 'campanha_remarketing' // campanhas manuais tipo "#1 Remarketing"
  | 'portal_zap'
  | 'portal_vivareal'
  | 'portal_olx'
  | 'c2s_import'          // contato importado da base C2S, conversa organic
  | 'organico'            // cliente iniciou no WhatsApp, sem import/campanha
  | 'simulacao'           // AI Lab
  | 'desconhecido';

export type SituacaoTag =
  | 'dnc'                 // opt-out/auto-reply/wrong-audience — bloqueado
  | 'operador_assumiu'    // handoff humano
  | 'aimee_atendendo'     // AI ativa, conversa aberta
  | 'qualificado'         // triage completa + score alto
  | 'aguardando_resposta' // último turno foi nosso, cliente em silêncio
  | 'cliente_aguarda'     // último turno foi do cliente, ninguém respondeu
  | 'fechada'             // conversation status=closed
  | 'nova';               // conversa recém-criada, sem turno ainda

export interface LeadTagsInput {
  conversationSource?: string | null;
  conversationStatus?: string | null;
  contactChannelSource?: string | null;
  contactC2SLeadId?: string | null;
  campaignType?: string | null; // campaigns.campaign_type quando conversation.campaign_id existe
  dnc?: boolean | null;
  dncReason?: string | null;
  isAiActive?: boolean | null;
  operatorTakeoverAt?: string | null;
  triageStage?: string | null;
  qualificationScore?: number | null;
  lastDirection?: 'inbound' | 'outbound' | null;
}

export interface LeadTags {
  origem: { key: OrigemTag; label: string };
  situacao: { key: SituacaoTag; label: string };
  dnc: { flagged: boolean; reason: string | null; label: string | null };
}

const ORIGEM_LABELS: Record<OrigemTag, string> = {
  remarketing_auto: 'Remarketing automático',
  campanha_remarketing: 'Campanha remarketing',
  portal_zap: 'Portal ZAP',
  portal_vivareal: 'Portal VivaReal',
  portal_olx: 'Portal OLX',
  c2s_import: 'Base C2S',
  organico: 'Orgânico',
  simulacao: 'Simulação',
  desconhecido: 'Origem desconhecida',
};

const SITUACAO_LABELS: Record<SituacaoTag, string> = {
  dnc: 'DNC',
  operador_assumiu: 'Operador assumiu',
  aimee_atendendo: 'Aimee atendendo',
  qualificado: 'Qualificado',
  aguardando_resposta: 'Aguardando cliente',
  cliente_aguarda: 'Cliente aguardando',
  fechada: 'Fechada',
  nova: 'Nova',
};

const DNC_REASON_LABELS: Record<string, string> = {
  opt_out: 'Cliente pediu para não contatar',
  auto_reply: 'Auto-reply detectado',
  wrong_audience: 'Público errado (corretor/avaliador)',
  manual: 'Marcado manualmente',
};

function resolveOrigem(i: LeadTagsInput): OrigemTag {
  const src = (i.conversationSource || '').toLowerCase();
  if (src === 'rewarm_archived') return 'remarketing_auto';
  if (src === 'remarketing' || i.campaignType === 'remarketing') return 'campanha_remarketing';
  if (src === 'portal_zap' || src === 'zap') return 'portal_zap';
  if (src === 'portal_vivareal' || src === 'vivareal') return 'portal_vivareal';
  if (src === 'portal_olx' || src === 'olx') return 'portal_olx';
  if (src === 'simulation') return 'simulacao';

  // organic: distinguish between "cliente entrou direto" and "respondendo a algo externo
  // com contato já importado do C2S"
  if (src === 'organic' && i.contactC2SLeadId) return 'c2s_import';
  if (src === 'organic') return 'organico';
  if (!src && i.contactChannelSource === 'c2s_import') return 'c2s_import';
  if (!src && i.contactChannelSource === 'remarketing_c2s') return 'c2s_import';

  return 'desconhecido';
}

function resolveSituacao(i: LeadTagsInput): SituacaoTag {
  if (i.dnc) return 'dnc';
  if (i.conversationStatus === 'closed') return 'fechada';
  if (i.operatorTakeoverAt) return 'operador_assumiu';
  if (i.triageStage === 'dnc') return 'dnc';
  if ((i.qualificationScore ?? 0) >= 70) return 'qualificado';
  if (i.lastDirection === 'inbound') return 'cliente_aguarda';
  if (i.lastDirection === 'outbound') return 'aguardando_resposta';
  if (i.isAiActive) return 'aimee_atendendo';
  return 'nova';
}

export function computeLeadTags(input: LeadTagsInput): LeadTags {
  const origem = resolveOrigem(input);
  const situacao = resolveSituacao(input);
  const dncFlag = !!input.dnc;
  const reasonKey = input.dncReason || '';

  return {
    origem: { key: origem, label: ORIGEM_LABELS[origem] },
    situacao: { key: situacao, label: SITUACAO_LABELS[situacao] },
    dnc: {
      flagged: dncFlag,
      reason: dncFlag ? reasonKey : null,
      label: dncFlag ? (DNC_REASON_LABELS[reasonKey] || 'Não contatar') : null,
    },
  };
}
