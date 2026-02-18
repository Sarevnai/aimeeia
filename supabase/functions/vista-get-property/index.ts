// ========== AIMEE.iA v2 - VISTA GET PROPERTY ==========
// Fetches a single property by code from Vista CRM.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getSupabaseClient, corsHeaders, corsResponse, jsonResponse, errorResponse } from '../_shared/supabase.ts';
import { Tenant } from '../_shared/types.ts';
import { formatCurrency } from '../_shared/utils.ts';

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return corsResponse();

  const supabase = getSupabaseClient();

  try {
    const { tenant_id, property_code } = await req.json();

    if (!tenant_id || !property_code) {
      return errorResponse('Missing tenant_id or property_code', 400);
    }

    const { data: tenant } = await supabase
      .from('tenants')
      .select('*')
      .eq('id', tenant_id)
      .single();

    if (!tenant) return errorResponse('Tenant not found', 404);

    const t = tenant as Tenant;

    if (t.crm_type !== 'vista' || !t.crm_api_key || !t.crm_base_url) {
      return errorResponse('Vista CRM not configured', 400);
    }

    const url = `${t.crm_base_url}/imoveis/detalhes`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${t.crm_api_key}`,
      },
      body: JSON.stringify({
        imovel: property_code,
        fields: [
          'Codigo', 'TipoImovel', 'Bairro', 'Cidade', 'Endereco',
          'ValorVenda', 'ValorLocacao', 'Dormitorios', 'Suites', 'Vagas',
          'AreaUtil', 'AreaTotal', 'DescricaoWeb', 'FotoDestaque', 'Fotos',
          'ValorCondominio', 'ValorIPTU', 'Caracteristicas', 'Status',
        ],
      }),
    });

    if (!response.ok) {
      return errorResponse('Vista API error', 502);
    }

    const data = await response.json();

    return jsonResponse({ property: data });

  } catch (error) {
    console.error('❌ Vista get property error:', error);
    return errorResponse((error as Error).message);
  }
});
