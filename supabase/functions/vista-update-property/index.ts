// ========== AIMEE.iA v2 - VISTA UPDATE PROPERTY ==========
// Altera um imóvel no Vista CRM. Usado pelo setor Atualização pra:
//   - Mudar Status (Ativo/Inativo/Suspenso)
//   - Mudar Situacao (Vendido/Alugado/Vendido Terceiros)
//   - Atualizar ValorVenda ou ValorLocacao
// Segue o mesmo padrão (JSON+Bearer) de vista-search-properties e vista-get-property.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getSupabaseClient, corsResponse, jsonResponse, errorResponse } from '../_shared/supabase.ts';
import { Tenant } from '../_shared/types.ts';

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return corsResponse();

  const supabase = getSupabaseClient();

  try {
    const { tenant_id, property_code, fields } = await req.json();

    if (!tenant_id || !property_code || !fields || typeof fields !== 'object') {
      return errorResponse('Missing tenant_id, property_code or fields', 400);
    }

    const { data: tenant } = await supabase
      .from('tenants')
      .select('*')
      .eq('id', tenant_id)
      .single();

    if (!tenant) return errorResponse('Tenant not found', 404);
    const t = tenant as Tenant;

    if (t.crm_type !== 'vista' || !t.crm_api_key || !t.crm_api_url) {
      return errorResponse('Vista CRM not configured for this tenant', 400);
    }

    const url = `${t.crm_api_url}/imoveis/editar`;
    const payload = {
      imovel: String(property_code),
      fields: { ...fields, Codigo: String(property_code) },
    };

    console.log(`🔧 Vista update: ${url}`, JSON.stringify(payload).slice(0, 300));

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Authorization': `Bearer ${t.crm_api_key}`,
      },
      body: JSON.stringify(payload),
    });

    const responseText = await response.text();
    let responseData: any;
    try { responseData = JSON.parse(responseText); } catch { responseData = { raw: responseText }; }

    if (!response.ok) {
      console.error(`❌ Vista update error (${response.status}):`, responseText.slice(0, 500));
      return jsonResponse({
        ok: false,
        status: response.status,
        error: responseText.slice(0, 500),
        vista_response: responseData,
        property_code,
      }, 502);
    }

    console.log(`✅ Vista update success: ${property_code}`);
    return jsonResponse({
      ok: true,
      property_code,
      vista_response: responseData,
    });

  } catch (error) {
    console.error('❌ Vista update property exception:', error);
    return errorResponse((error as Error).message);
  }
});
