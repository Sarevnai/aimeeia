// ========== AIMEE.iA v2 - VISTA SEARCH PROPERTIES ==========
// Searches properties in Vista Software CRM API.
// Adapter pattern: can be swapped for Jetimob or custom CRM.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getSupabaseClient, corsHeaders, corsResponse, jsonResponse, errorResponse } from '../_shared/supabase.ts';
import { PropertyResult, Tenant } from '../_shared/types.ts';
import { formatCurrency } from '../_shared/utils.ts';

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return corsResponse();

  const supabase = getSupabaseClient();

  try {
    const { tenant_id, search_params } = await req.json();

    if (!tenant_id) return errorResponse('Missing tenant_id', 400);

    // Load tenant for CRM credentials
    const { data: tenant } = await supabase
      .from('tenants')
      .select('*')
      .eq('id', tenant_id)
      .single();

    if (!tenant) return errorResponse('Tenant not found', 404);

    const t = tenant as Tenant;

    if (t.crm_type !== 'vista') {
      return jsonResponse({ properties: [], message: 'CRM não é Vista' });
    }

    if (!t.crm_api_key || !t.crm_base_url) {
      return errorResponse('Tenant missing Vista CRM credentials', 400);
    }

    // Build Vista API request
    const properties = await searchVistaProperties(t, search_params);

    return jsonResponse({ properties, total: properties.length });

  } catch (error) {
    console.error('❌ Vista search error:', error);
    return errorResponse(error.message);
  }
});

// ========== VISTA API ==========

async function searchVistaProperties(
  tenant: Tenant,
  params: any
): Promise<PropertyResult[]> {
  const fields = [
    'Codigo', 'TipoImovel', 'Categoria', 'Bairro', 'Cidade', 'Endereco',
    'ValorVenda', 'ValorLocacao', 'Dormitorios', 'Suites', 'Vagas',
    'AreaUtil', 'DescricaoWeb', 'FotoDestaque', 'ValorCondominio', 'ValorIPTU',
  ];

  const filter: string[] = [];

  // Finalidade
  const isLocacao = params.finalidade === 'locacao';
  if (isLocacao) {
    filter.push("Categoria = 'Residencial'");
  }

  // Bairro
  if (params.bairro) {
    filter.push(`Bairro like '%${params.bairro}%'`);
  }

  // Cidade
  if (params.cidade) {
    filter.push(`Cidade like '%${params.cidade}%'`);
  }

  // Tipo
  if (params.tipo) {
    const vistaTypeMap: Record<string, string> = {
      'apartamento': 'Apartamento',
      'casa': 'Casa',
      'terreno': 'Terreno',
      'comercial': 'Sala Comercial',
      'cobertura': 'Cobertura',
      'kitnet': 'Kitnet',
      'sobrado': 'Sobrado',
    };
    const vistaType = vistaTypeMap[params.tipo.toLowerCase()] || params.tipo;
    filter.push(`TipoImovel = '${vistaType}'`);
  }

  // Quartos
  if (params.quartos) {
    filter.push(`Dormitorios >= ${params.quartos}`);
  }

  // Preço
  const priceField = isLocacao ? 'ValorLocacao' : 'ValorVenda';
  if (params.preco_min) {
    filter.push(`${priceField} >= ${params.preco_min}`);
  }
  if (params.preco_max) {
    filter.push(`${priceField} <= ${params.preco_max}`);
  }

  // Status ativo
  filter.push("Status = 'Ativo'");

  const body = {
    fields,
    filter: filter.length > 0 ? filter : undefined,
    ppimovel: isLocacao ? 'L' : 'V',
    pesquisa: 'imovel',
    limit: 10,
    offset: 0,
  };

  const url = `${tenant.crm_base_url}/imoveis/listar`;

  console.log(`🔍 Vista search: ${url}`, JSON.stringify(body).slice(0, 300));

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'Authorization': `Bearer ${tenant.crm_api_key}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errText = await response.text();
    console.error(`❌ Vista API error (${response.status}):`, errText.slice(0, 500));
    return [];
  }

  const data = await response.json();

  // Vista returns an object with numeric keys
  const items: any[] = [];
  if (Array.isArray(data)) {
    items.push(...data);
  } else if (typeof data === 'object') {
    for (const key of Object.keys(data)) {
      if (!isNaN(Number(key)) && data[key]?.Codigo) {
        items.push(data[key]);
      }
    }
  }

  console.log(`📊 Vista returned ${items.length} properties`);

  return items.map(item => mapVistaToProperty(item, tenant, isLocacao));
}

function mapVistaToProperty(item: any, tenant: Tenant, isLocacao: boolean): PropertyResult {
  const preco = isLocacao
    ? parseFloat(item.ValorLocacao || '0')
    : parseFloat(item.ValorVenda || '0');

  const baseUrl = tenant.crm_base_url?.replace('/api/v2', '') || '';
  const link = `${baseUrl}/imovel/${item.Codigo}`;

  return {
    codigo: String(item.Codigo),
    tipo: item.TipoImovel || 'Imóvel',
    bairro: item.Bairro || '',
    cidade: item.Cidade || tenant.city,
    endereco: item.Endereco || undefined,
    preco,
    preco_formatado: formatCurrency(preco),
    quartos: parseInt(item.Dormitorios || '0'),
    suites: parseInt(item.Suites || '0') || undefined,
    vagas: parseInt(item.Vagas || '0') || undefined,
    area_util: parseFloat(item.AreaUtil || '0') || undefined,
    descricao: item.DescricaoWeb || undefined,
    foto_destaque: item.FotoDestaque || undefined,
    link,
    valor_condominio: parseFloat(item.ValorCondominio || '0') || undefined,
    valor_iptu: parseFloat(item.ValorIPTU || '0') || undefined,
    finalidade: isLocacao ? 'locacao' : 'venda',
  };
}
