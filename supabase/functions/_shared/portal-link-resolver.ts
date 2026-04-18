// ========== PORTAL LINK RESOLVER ==========
// Extracts property data from ZAP/VivaReal/OLX links and matches with Vista base.
// When a client sends a portal link, we extract bairro/quartos/area from the URL
// and search our properties table for a match.

interface PortalLinkData {
  url: string;
  portal: 'zapimoveis' | 'vivareal' | 'olx' | 'imovelweb' | 'unknown';
  transacao: string | null;   // 'venda' | 'aluguel'
  tipo: string | null;         // 'casa' | 'apartamento' | 'cobertura' etc
  quartos: number | null;
  bairro: string | null;
  cidade: string | null;
  area: number | null;
  portalId: string | null;
}

interface PropertyMatch {
  id: string;
  external_id: string;
  title: string;
  neighborhood: string;
  city: string;
  price: number;
  bedrooms: number;
  area: string;
  description: string;
}

const ZAP_PATTERN = /zapimoveis\.com\.br\/imovel\/(?:(?<transacao>venda|aluguel)-)?(?<tipo>[a-z]+)-(?<quartos>\d+)-quartos?-(?<bairro>[a-z0-9-]+)-(?<cidade>[a-z-]+)-(?<estado>[a-z]{2})-(?<area>\d+)m2(?:-id-(?<zap_id>\d+))?/i;
const VIVA_PATTERN = /vivareal\.com\.br\/imovel\/(?<tipo>[a-z]+)-(?<quartos>\d+)-quartos?-(?<bairro>[a-z0-9-]+)-(?:bairros-)?(?<cidade>[a-z-]+)-(?<area>\d+)m2-(?<transacao>venda|aluguel)/i;
const OLX_PATTERN = /olx\.com\.br\/.*imoveis.*\/(?<tipo>casa|apartamento|terreno|cobertura)/i;
const GENERIC_URL_PATTERN = /https?:\/\/(?:www\.)?(?:zapimoveis|vivareal|olx|imovelweb)\.[a-z.]+\/[^\s]+/gi;

function normalizeBairro(bairro: string): string {
  return bairro
    .replace(/-/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase())
    .replace(/\bSc\b/g, '')
    .trim();
}

export function extractPortalLinks(messageText: string): PortalLinkData[] {
  const urls = messageText.match(GENERIC_URL_PATTERN);
  if (!urls) return [];

  const results: PortalLinkData[] = [];

  for (const url of urls) {
    const lower = url.toLowerCase();

    // Try ZAP pattern
    let m = ZAP_PATTERN.exec(lower);
    if (m?.groups) {
      results.push({
        url,
        portal: 'zapimoveis',
        transacao: m.groups.transacao || null,
        tipo: m.groups.tipo || null,
        quartos: m.groups.quartos ? parseInt(m.groups.quartos) : null,
        bairro: m.groups.bairro ? normalizeBairro(m.groups.bairro) : null,
        cidade: m.groups.cidade ? normalizeBairro(m.groups.cidade) : null,
        area: m.groups.area ? parseInt(m.groups.area) : null,
        portalId: m.groups.zap_id || null,
      });
      continue;
    }

    // Try VivaReal pattern
    m = VIVA_PATTERN.exec(lower);
    if (m?.groups) {
      results.push({
        url,
        portal: 'vivareal',
        transacao: m.groups.transacao || null,
        tipo: m.groups.tipo || null,
        quartos: m.groups.quartos ? parseInt(m.groups.quartos) : null,
        bairro: m.groups.bairro ? normalizeBairro(m.groups.bairro) : null,
        cidade: m.groups.cidade ? normalizeBairro(m.groups.cidade) : null,
        area: m.groups.area ? parseInt(m.groups.area) : null,
        portalId: null,
      });
      continue;
    }

    // Generic portal link (couldn't parse details)
    results.push({
      url,
      portal: lower.includes('zapimoveis') ? 'zapimoveis'
        : lower.includes('vivareal') ? 'vivareal'
        : lower.includes('olx') ? 'olx'
        : lower.includes('imovelweb') ? 'imovelweb'
        : 'unknown',
      transacao: null, tipo: null, quartos: null, bairro: null,
      cidade: null, area: null, portalId: null,
    });
  }

  return results;
}

export async function resolvePortalLink(
  supabase: any,
  tenantId: string,
  linkData: PortalLinkData,
): Promise<PropertyMatch | null> {
  if (!linkData.bairro && !linkData.area && !linkData.quartos) return null;

  // Normalize bairro for DB search (remove accents for ILIKE)
  const bairroSearch = linkData.bairro
    ?.replace(/Cacupe/i, 'Cacupé')
    .replace(/Jurere/i, 'Jurerê')
    .replace(/Ingleses Norte/i, 'Ingleses Norte')
    .replace(/Canasvieiras/i, 'Canasvieiras')
    .replace(/Corrego Grande/i, 'Córrego Grande')
    .replace(/Trindade/i, 'Trindade')
    .replace(/Itacorubi/i, 'Itacorubi')
    || null;

  // Build query: match by bairro + quartos + area (closest match)
  let query = supabase
    .from('properties')
    .select('id, external_id, title, neighborhood, city, price, bedrooms, area, description')
    .eq('tenant_id', tenantId)
    .eq('is_active', true);

  if (bairroSearch) {
    query = query.ilike('neighborhood', `%${bairroSearch}%`);
  }
  if (linkData.quartos) {
    query = query.eq('bedrooms', linkData.quartos);
  }

  const { data: candidates } = await query.limit(20);

  if (!candidates || candidates.length === 0) return null;

  // Score candidates by area match
  if (linkData.area) {
    const sorted = candidates
      .map((p: any) => ({
        ...p,
        areaDiff: Math.abs((parseFloat(p.area) || 0) - linkData.area!),
      }))
      .sort((a: any, b: any) => a.areaDiff - b.areaDiff);

    // Best match: area within 10% tolerance
    const best = sorted[0];
    if (best.areaDiff <= linkData.area * 0.1) {
      return best as PropertyMatch;
    }
  }

  // If no area match, return first candidate
  return candidates[0] as PropertyMatch;
}

export function buildPortalLinkContext(linkData: PortalLinkData, property: PropertyMatch | null): string {
  if (!property) {
    const details = [
      linkData.tipo,
      linkData.quartos ? `${linkData.quartos} quartos` : null,
      linkData.bairro,
      linkData.area ? `${linkData.area}m²` : null,
    ].filter(Boolean).join(', ');

    return details
      ? `\n[SISTEMA] O cliente enviou um link de portal (${linkData.portal}). Extraí os dados: ${details}. Não encontrei esse imóvel exato na nossa base. Busque imóveis similares com esses critérios.\n`
      : `\n[SISTEMA] O cliente enviou um link de portal, mas não consegui extrair os dados do URL.\n`;
  }

  const price = Number(property.price).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });

  return `\n[SISTEMA] O cliente enviou um link de portal (${linkData.portal}). Encontrei o imóvel na nossa base:
- Código: ${property.external_id}
- ${property.title}
- Bairro: ${property.neighborhood}, ${property.city}
- Preço: ${price}
- Quartos: ${property.bedrooms}
- Área: ${property.area}m²

INSTRUÇÃO: Apresente esse imóvel ao cliente com os detalhes acima. Use o código ${property.external_id} se precisar buscar mais informações. NÃO diga que não consegue acessar links — você já tem os dados.\n`;
}
