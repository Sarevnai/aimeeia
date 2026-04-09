/**
 * Parser do formato pipe-delimited da coluna `observacoes` nas listas
 * de remarketing exportadas do CRM C2S (Construtor de Vendas).
 *
 * Formato de entrada (exemplo real):
 *   "Motivo: Falta de interação do usuário | Status: Arquivado | Imóvel: [55766] Apto 1q Jurerê | Bairro: Jurerê | Preço: R$ 3.500,00 | Fonte: Chaves na Mão | Obs: Cliente busca kit net"
 *
 * Tolerante a:
 *  - Ordem variável dos campos
 *  - Campos faltando (nem toda linha tem todos)
 *  - Acentos e caixa mista nas chaves ("Imóvel" ou "imovel")
 *  - Valores contendo `:` (usa indexOf + slice em vez de split)
 */

export interface C2SContext {
  motivo?: string;    // → crm_archive_reason
  status?: string;    // → crm_status
  imovel?: string;    // → crm_property_ref
  bairro?: string;    // → crm_neighborhood
  preco?: string;     // → crm_price_hint
  fonte?: string;     // → crm_source
  obs?: string;       // → crm_broker_notes
}

const KEY_MAP: Record<string, keyof C2SContext> = {
  'motivo': 'motivo',
  'status': 'status',
  'imovel': 'imovel',
  'imóvel': 'imovel',
  'bairro': 'bairro',
  'preco': 'preco',
  'preço': 'preco',
  'fonte': 'fonte',
  'obs': 'obs',
  'observacao': 'obs',
  'observação': 'obs',
};

export function parseC2SObservacoes(raw: string | null | undefined): C2SContext {
  if (!raw || typeof raw !== 'string') return {};

  const chunks = raw.split('|').map(c => c.trim()).filter(Boolean);
  const result: C2SContext = {};

  for (const chunk of chunks) {
    const colonIdx = chunk.indexOf(':');
    if (colonIdx === -1) continue;

    const rawKey = chunk.slice(0, colonIdx).trim().toLowerCase();
    const value = chunk.slice(colonIdx + 1).trim();
    if (!value) continue;

    const mappedKey = KEY_MAP[rawKey];
    if (mappedKey && !result[mappedKey]) {
      result[mappedKey] = value;
    }
  }

  return result;
}

/**
 * Monta o payload de colunas `crm_*` a partir de um C2SContext parseado.
 * Retorna `null` para campos ausentes (não sobrescreve valores antigos no upsert com string vazia).
 */
export function toContactCrmColumns(ctx: C2SContext): {
  crm_archive_reason: string | null;
  crm_status: string | null;
  crm_property_ref: string | null;
  crm_neighborhood: string | null;
  crm_price_hint: string | null;
  crm_source: string | null;
  crm_broker_notes: string | null;
} {
  return {
    crm_archive_reason: ctx.motivo ?? null,
    crm_status: ctx.status ?? null,
    crm_property_ref: ctx.imovel ?? null,
    crm_neighborhood: ctx.bairro ?? null,
    crm_price_hint: ctx.preco ?? null,
    crm_source: ctx.fonte ?? null,
    crm_broker_notes: ctx.obs ?? null,
  };
}
