import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { tenant_id, full_sync } = await req.json();

    if (!tenant_id) {
      return new Response(JSON.stringify({ error: 'tenant_id is required' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const supabase = createClient(supabaseUrl, supabaseKey);

    // 1. Get Tenant CRM Configuration
    const { data: tenant, error: tenantErr } = await supabase
      .from('tenants')
      .select('crm_type, crm_api_key, crm_api_url')
      .eq('id', tenant_id)
      .single();

    if (tenantErr || !tenant) {
      throw new Error(`Tenant not found or error: ${tenantErr?.message}`);
    }

    if (tenant.crm_type !== 'vista' || !tenant.crm_api_key || !tenant.crm_api_url) {
      return new Response(JSON.stringify({ error: 'Tenant does not have a properly configured Vista CRM integration' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      });
    }

    const vistaKey = tenant.crm_api_key;
    let vistaUrl = tenant.crm_api_url; // Expected to be the base URL e.g. "http://xxxxx.vistahost.com.br/imoveis/listar"

    // Fix invalid URL formatting if the user forgot the http:// prefix
    if (!vistaUrl.startsWith('http://') && !vistaUrl.startsWith('https://')) {
      vistaUrl = `http://${vistaUrl}`;
    }

    // Strip any trailing slashes to neutralize the path
    vistaUrl = vistaUrl.replace(/\/+$/, "");

    // Ensure it hits the correct list endpoint
    if (!vistaUrl.endsWith('/imoveis/listar')) {
      vistaUrl = `${vistaUrl}/imoveis/listar`;
    }

    // 2. Fetch properties from Vista using pagination (Limit 50)
    let currentPage = 1;
    let totalPages = 1;
    let totalProcessed = 0;

    // 2. Discover if we need Delta Sync or Full Sync
    let syncStartDate = '';
    let isDeltaSync = false;

    if (!full_sync) {
      const { data: latestProp } = await supabase
        .from('properties')
        .select('updated_at')
        .eq('tenant_id', tenant_id)
        .order('updated_at', { ascending: false })
        .limit(1)
        .single();

      if (latestProp && latestProp.updated_at) {
        // Convert ISO string to YYYY-MM-DD
        const dateObj = new Date(latestProp.updated_at);
        syncStartDate = dateObj.toISOString().split('T')[0];
        isDeltaSync = true;
      }
    }

    console.log(`Starting Vista Sync for tenant ${tenant_id}. Delta: ${isDeltaSync ? syncStartDate : 'Full Sync'}`);

    while (currentPage <= totalPages) {
      console.log(`Fetching page ${currentPage} of ${totalPages}...`);

      const pesquisaData: any = {
        fields: [
          "Codigo", "Categoria", "Cidade", "Bairro", "Endereco", "Numero",
          "Complemento", "CEP", "Status", "Situacao", "Finalidade",
          "ExibirNoSite", "Ocupacao", "ValorVenda", "ValorLocacao",
          "ValorCondominio", "ValorIptu", "Dormitorios", "Suites",
          "TotalBanheiros", "BanheiroSocial", "Vagas", "AreaTotal",
          "AreaPrivativa", "Caracteristicas", "InfraEstrutura",
          "FotoDestaque", "FotoDestaquePequena", "TourVirtual",
          "Latitude", "Longitude", "DataAtualizacao", "DataCadastro",
          "Mobiliado", "DescricaoWeb"
        ],
        paginacao: {
          pagina: currentPage,
          quantidade: 50
        }
      };

      if (isDeltaSync && syncStartDate) {
        // To today's date
        const today = new Date().toISOString().split('T')[0];
        pesquisaData.filter = {
          "DataAtualizacao": [syncStartDate, today]
        };
      }

      const encodedPesquisa = encodeURIComponent(JSON.stringify(pesquisaData));
      const fetchUrl = `${vistaUrl}?key=${vistaKey}&pesquisa=${encodedPesquisa}&showtotal=1`;

      const vistaResponse = await fetch(fetchUrl, {
        headers: { 'Accept': 'application/json' }
      });

      if (!vistaResponse.ok) {
        const errText = await vistaResponse.text();
        console.error(`Error fetching page ${currentPage}: HTTP ${vistaResponse.status}`, errText);
        // If it fails on the very first page, it's a fatal configuration error (e.g. wrong key, wrong URL, bad payload)
        if (currentPage === 1) {
          throw new Error(`Vista API Error: HTTP ${vistaResponse.status} - ${errText}`);
        }
        break; // Stop loop on subsequent failures, process what we have so far
      }

      const data = await vistaResponse.json();

      // Vista API sometimes returns HTTP 200 ok but with an internal error payload like { "status": 401, "message": "..." }
      if (data && typeof data === 'object' && 'status' in data && data.status >= 400 && 'message' in data) {
        console.error(`Vista API Soft Error on page ${currentPage}:`, data);
        if (currentPage === 1) {
          throw new Error(`Vista API Error: ${data.status} - ${JSON.stringify(data.message)}`);
        }
        break; // Stop loop on subsequent failures
      }

      // Set total pages on first request
      if (currentPage === 1 && data.paginas) {
        totalPages = data.paginas;
        console.log(`Discovered total pages: ${totalPages}`);
      }

      // 3. Process the batch
      const propertiesBatch = [];

      for (const key of Object.keys(data)) {
        const imovel = data[key];

        // Vista returns pagination info alongside properties, filter those out
        if (typeof imovel === 'object' && imovel !== null && 'Codigo' in imovel) {
          const codigo = String(imovel.Codigo);
          const city = imovel.Cidade || '';
          const neighborhood = imovel.Bairro || '';
          const description = imovel.DescricaoWeb || imovel.DescricaoEmpreendimento || '';
          const priceStr = imovel.ValorVenda;
          const price = priceStr ? parseFloat(priceStr) : 0;
          const bedroomsStr = imovel.Dormitorios || imovel.Dormitorio;
          const bedrooms = bedroomsStr ? parseInt(bedroomsStr, 10) : 0;
          const parkingStr = imovel.Vagas;
          const parkingSpaces = parkingStr ? parseInt(parkingStr, 10) : 0;
          const areaStr = imovel.AreaPrivativa || imovel.AreaTotal;
          const area = areaStr ? parseFloat(areaStr) : 0;

          propertiesBatch.push({
            tenant_id,
            external_id: codigo,
            city,
            neighborhood,
            price: isNaN(price) ? 0 : price,
            bedrooms: isNaN(bedrooms) ? 0 : bedrooms,
            parking_spaces: isNaN(parkingSpaces) ? 0 : parkingSpaces,
            area: isNaN(area) ? 0 : area,
            description,
            raw_data: imovel,
            // O Embedding será processado assincronamente pela Database Webhook + generate-property-embedding
            is_active: true
          });
        }
      }

      // 5. Upsert batch to Supabase
      if (propertiesBatch.length > 0) {
        const { error: upsertErr } = await supabase
          .from('properties')
          .upsert(propertiesBatch, { onConflict: 'tenant_id,external_id' });

        if (upsertErr) {
          console.error(`Error upserting batch page ${currentPage}:`, upsertErr);
          if (currentPage === 1) {
            throw new Error(`Upsert Error on page 1: ${upsertErr.message}`);
          }
          break;
        } else {
          totalProcessed += propertiesBatch.length;
          console.log(`Upserted ${propertiesBatch.length} properties for tenant ${tenant_id}`);
        }
      }

      currentPage += 1;
      // Delay 1 second to respect rate limits
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    return new Response(JSON.stringify({
      success: true,
      message: `Successfully synced ${totalProcessed} properties.`
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });

  } catch (error: any) {
    console.error('Error migrating properties:', error);
    // Returning 200 instead of 500 so supabase-js doesn't swallow the error payload
    return new Response(JSON.stringify({ error: error.message, stack: error.stack }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });
  }
});
