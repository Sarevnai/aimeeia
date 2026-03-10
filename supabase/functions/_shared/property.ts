// ========== AIMEE.iA v2 - PROPERTY ==========
// Property formatting and consultative presentation.

import { PropertyResult } from './types.ts';
import { formatCurrency } from './utils.ts';

// ========== HELPERS ==========

function getOrdinal(index: number): string {
  const ordinais = ['primeira', 'segunda', 'terceira', 'quarta', 'quinta'];
  return ordinais[index] ?? `${index + 1}ª`;
}

function getArticle(tipo: string): string {
  const femininos = ['casa', 'cobertura', 'sala', 'kitnet', 'loja', 'sobrado'];
  return femininos.some(f => tipo.toLowerCase().includes(f)) ? 'essa' : 'esse';
}

function getArticleDef(tipo: string): string {
  const femininos = ['casa', 'cobertura', 'sala', 'kitnet', 'loja', 'sobrado'];
  return femininos.some(f => tipo.toLowerCase().includes(f)) ? 'uma' : 'um';
}

function extractAmenidades(descricao: string, tipo: string, area: number | null, vagas: number | null, cond: number | null): string {
  // Build a natural characteristics sentence from available data
  const parts: string[] = [];

  if (area) parts.push(`${area}m² de área privativa`);
  if (vagas) parts.push(`${vagas} vaga${vagas > 1 ? 's' : ''} de garagem`);
  if (cond) parts.push(`condomínio de ${formatCurrency(cond)}`);

  // Extract up to 1 interesting phrase from description (avoid repeating type/rooms/area)
  if (descricao && descricao.trim()) {
    const cleaned = descricao.replace(/\d+\s*m²/gi, '').replace(/\d+\s*quartos?/gi, '').trim();
    // Look for key amenity words
    const amenityMatch = cleaned.match(
      /(varanda\s*\w*|piscina|churrasqueira|academia|lazer|vista\s*\w*|reformad\w+|modulad\w+|armário\w*|ar[- ]condicionado)/i
    );
    if (amenityMatch) {
      parts.push(amenityMatch[0].toLowerCase());
    }
  }

  if (parts.length === 0) return '';
  return `É ${getArticleDef(tipo)} ${tipo.toLowerCase()} com ${parts.join(', ')}.`;
}

// ========== CONSULTATIVE PRESENTATION (one at a time) ==========

/**
 * Returns the consultative body message for a property (no CTA).
 * The CTA ("O que achou?" / "Posso te mostrar o próximo?") is sent as separate messages.
 */
export function formatConsultativeProperty(
  property: PropertyResult,
  currentIndex: number,
  totalProperties: number,
  leadName?: string,
  noEmojis = false
): string {
  const parts: string[] = [];

  // § 1 — Greeting + position + property intro
  const ordinal = getOrdinal(currentIndex);
  const article = getArticle(property.tipo);
  const bedroomStr = property.quartos
    ? `${property.quartos} quarto${property.quartos > 1 ? 's' : ''}`
    : null;
  const suiteStr = property.suites
    ? `${property.suites} suíte${property.suites > 1 ? 's' : ''}`
    : null;

  let intro = leadName
    ? `${leadName}, a ${ordinal} opção que tenho pra te mostrar ali na ${property.bairro} é ${article} ${property.tipo.toLowerCase()}`
    : `A ${ordinal} opção que tenho pra te mostrar ali na ${property.bairro} é ${article} ${property.tipo.toLowerCase()}`;

  if (bedroomStr) intro += ` de ${bedroomStr}`;
  if (suiteStr) intro += `, com ${suiteStr}`;
  intro += '.';
  parts.push(intro);

  // § 2 — Price as "valor de investimento"
  const priceStr = property.preco_formatado || formatCurrency(property.preco);
  parts.push(`O valor de investimento é ${priceStr}.`);

  // § 3 — Characteristics: area + vagas + cond + amenidade da descrição
  const amenidades = extractAmenidades(
    property.descricao || '',
    property.tipo,
    property.area_util || null,
    property.vagas || null,
    property.valor_condominio || null
  );
  if (amenidades) parts.push(amenidades);

  // § 4 — Link
  if (property.link) {
    parts.push(`Você pode ver mais fotos e detalhes aqui:\n${property.link}`);
  }

  return parts.join('\n\n');
}

// ========== FORMAT PROPERTY SUMMARY ==========

export function formatPropertySummary(properties: PropertyResult[]): string {
  if (properties.length === 0) return 'Nenhum imóvel encontrado.';

  const summary = properties.map((p, i) =>
    `${i + 1}. ${p.tipo} em ${p.bairro} - ${p.preco_formatado || formatCurrency(p.preco)} (${p.quartos || '?'}q, ${p.area_util || '?'}m²)`
  ).join('\n');

  return `Encontrei ${properties.length} imóveis:\n${summary}`;
}

// ========== SEARCH PARAMS BUILDER ==========

export function buildSearchParams(
  toolArgs: any,
  tenant: any,
  department: string
): Record<string, any> {
  const params: Record<string, any> = {};

  if (toolArgs.tipo) params.tipo = toolArgs.tipo;
  if (toolArgs.bairro) params.bairro = toolArgs.bairro;
  if (toolArgs.cidade) params.cidade = toolArgs.cidade || tenant.city;
  if (toolArgs.preco_min) params.preco_min = toolArgs.preco_min;
  if (toolArgs.preco_max) params.preco_max = toolArgs.preco_max;
  if (toolArgs.quartos) params.quartos = toolArgs.quartos;

  params.finalidade = toolArgs.finalidade || (department === 'locacao' ? 'locacao' : 'venda');

  return params;
}
