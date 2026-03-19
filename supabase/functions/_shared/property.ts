// ========== AIMEE.iA v2 - PROPERTY ==========
// Property formatting and consultative presentation.

import { PropertyResult } from './types.ts';
import { formatCurrency } from './utils.ts';

// ========== FORMAT PROPERTY MESSAGE ==========

export function formatPropertyMessage(property: PropertyResult, index?: number): string {
  const prefix = index !== undefined ? `*Opção ${index + 1}*\n` : '';

  const lines = [
    prefix,
    `*${property.tipo}* em *${property.bairro}*`,
    `${property.cidade}`,
  ];

  // C2: Imóveis sem preço válido já são filtrados antes de chegar aqui.
  // Se ainda chegar algum, mostra o preço normalmente (nunca "sob consulta").
  if (property.preco && property.preco > 1) {
    lines.push(`${property.preco_formatado || formatCurrency(property.preco)}`);
  }

  if (property.quartos) lines.push(`${property.quartos} quarto${property.quartos > 1 ? 's' : ''}`);
  if (property.suites) lines.push(`${property.suites} suíte${property.suites > 1 ? 's' : ''}`);
  if (property.vagas) lines.push(`${property.vagas} vaga${property.vagas > 1 ? 's' : ''}`);
  if (property.area_util) lines.push(`${property.area_util}m²`);
  // MC-5: Filter invalid condo values — hide if <= R$ 1
  if (property.valor_condominio && property.valor_condominio > 1) {
    lines.push(`Cond: ${formatCurrency(property.valor_condominio)}`);
  }

  if (property.descricao) {
    const desc = property.descricao.length > 150
      ? property.descricao.slice(0, 150) + '...'
      : property.descricao;
    lines.push(`\n${desc}`);
  }

  if (property.link) {
    lines.push(`\n${property.link}`);
  }

  return lines.join('\n');
}

// ========== CONSULTATIVE PRESENTATION (one at a time) ==========

export function formatConsultativeProperty(
  property: PropertyResult,
  currentIndex: number,
  totalProperties: number
): string {
  const header = `*Imóvel ${currentIndex + 1} de ${totalProperties}*\n`;
  return header + formatPropertyMessage(property);
}

// ========== FORMAT PROPERTY SUMMARY ==========

export function formatPropertySummary(properties: PropertyResult[]): string {
  if (properties.length === 0) return 'Nenhum imóvel encontrado.';

  const summary = properties.map((p, i) => {
    // C2: Preço sempre disponível (imóveis sem preço já foram filtrados)
    const priceStr = (p.preco && p.preco > 1) ? (p.preco_formatado || formatCurrency(p.preco)) : '';
    const priceInfo = priceStr ? ` - ${priceStr}` : '';
    return `${i + 1}. ${p.tipo} em ${p.bairro}${priceInfo} (${p.quartos || '?'}q, ${p.area_util || '?'}m²)`;
  }).join('\n');

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
