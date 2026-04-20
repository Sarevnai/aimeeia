// ========== PHONE NORMALIZATION ==========
// Meta Cloud API às vezes entrega números BR sem o 9º dígito (celular antigo),
// mesmo quando o contato foi cadastrado com ele. Isso causava duplicatas:
// rewarm envia pra 5547988459353, cliente responde de 554788459353, webhook
// não achava contact/conversation existente e criava duas entidades novas
// pro mesmo cliente.
//
// Canônico para BR: 12 dígitos — 55 + DDD(2) + número(8), SEM o 9 prefixo.
// Números não-BR ou fora do padrão retornam como estão (só dígitos).

/**
 * Normaliza telefone para forma canônica. Se for número BR celular (13 dígitos
 * começando com 55 e tendo 9 logo após o DDD), remove o 9 para ficar em 12
 * dígitos. Qualquer outra coisa retorna só os dígitos.
 */
export function normalizePhone(raw: string | null | undefined): string {
  if (!raw) return '';
  const digits = raw.replace(/\D/g, '');

  // BR celular com 9 prefixo: 55 + DDD + 9 + 8 dígitos = 13 total
  if (digits.length === 13 && digits.startsWith('55') && digits[4] === '9') {
    return digits.slice(0, 4) + digits.slice(5); // remove o 9 da posição 4
  }

  return digits;
}

/**
 * Retorna ambas as formas possíveis (com e sem 9) para queries de migração
 * ou lookup tolerante. A primeira é a canônica.
 */
export function phoneVariants(raw: string | null | undefined): string[] {
  const canonical = normalizePhone(raw);
  if (!canonical) return [];

  // Só gera a variante com 9 se for BR móvel (12 dígitos, 55+DDD+8)
  if (canonical.length === 12 && canonical.startsWith('55')) {
    const withNine = canonical.slice(0, 4) + '9' + canonical.slice(4);
    return [canonical, withNine];
  }

  return [canonical];
}
