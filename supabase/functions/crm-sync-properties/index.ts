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
    let vistaUrl = tenant.crm_api_url;

    if (!vistaUrl.startsWith('http://') && !vistaUrl.startsWith('https://')) {
      vistaUrl = `http://${vistaUrl}`;
    }

    vistaUrl = vistaUrl.replace(/\/+$/, "");

    if (!vistaUrl.endsWith('/imoveis/listar')) {
      vistaUrl = `${vistaUrl}/imoveis/listar`;
    }

    // 2. Discover if we need Delta Sync or Full Sync
    let currentPage = 1;
    let totalPages = 1;
    let totalProcessed = 0;
    let syncStartDate = '';
    let isDeltaSync = false;

    if (!full_sync) {
      // Usar vista_updated_at (data do Vista) em vez de updated_at (data local)
      // Isso evita que o delta sync perca imoveis quando updated_at local e resetado
      const { data: latestProp } = await supabase
        .from('properties')
        .select('vista_updated_at')
        .eq('tenant_id', tenant_id)
        .not('vista_updated_at', 'is', null)
        .order('vista_updated_at', { ascending: false })
        .limit(1)
        .single();

      if (latestProp && latestProp.vista_updated_at) {
        const dateObj = new Date(latestProp.vista_updated_at);
        syncStartDate = dateObj.toISOString().split('T')[0];
        isDeltaSync = true;
      }
    }

    console.log(`Starting Vista Sync for tenant ${tenant_id}. Delta: ${isDeltaSync ? syncStartDate : 'Full Sync'}`);

    // Track synced external_ids for deactivation logic on full sync
    const allSyncedExternalIds = new Set<string>();

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
          "Mobiliado", "DescricaoWeb", "TipoImovel"
        ],
        paginacao: {
          pagina: currentPage,
          quantidade: 50
        }
      };

      // Filtrar apenas imóveis à Venda ou Aluguel que estão exibidos no site
      pesquisaData.filter = {
        "Status": ["Venda", "Aluguel"],
        "ExibirNoSite": "Sim",
        ...(isDeltaSync && syncStartDate ? { "DataAtualizacao": [">=", syncStartDate] } : {})
      };

      const encodedPesquisa = encodeURIComponent(JSON.stringify(pesquisaData));
      const fetchUrl = `${vistaUrl}?key=${vistaKey}&pesquisa=${encodedPesquisa}&showtotal=1`;

      const vistaResponse = await fetch(fetchUrl, {
        headers: { 'Accept': 'application/json' }
      });

      if (!vistaResponse.ok) {
        const errText = await vistaResponse.text();
        console.error(`Error fetching page ${currentPage}: HTTP ${vistaResponse.status}`, errText);
        if (currentPage === 1) {
          throw new Error(`Vista API Error: HTTP ${vistaResponse.status} - ${errText}`);
        }
        break;
      }

      const data = await vistaResponse.json();

      if (data && typeof data === 'object' && 'status' in data && data.status >= 400 && 'message' in data) {
        console.error(`Vista API Soft Error on page ${currentPage}:`, data);
        if (currentPage === 1) {
          throw new Error(`Vista API Error: ${data.status} - ${JSON.stringify(data.message)}`);
        }
        break;
      }

      if (currentPage === 1 && data.paginas) {
        totalPages = data.paginas;
        console.log(`Discovered total pages: ${totalPages}`);
      }

      // 3. Process the batch
      const propertiesBatch = [];

      for (const key of Object.keys(data)) {
        const imovel = data[key];

        if (typeof imovel === 'object' && imovel !== null && 'Codigo' in imovel) {
          const codigo = String(imovel.Codigo);
          const city = imovel.Cidade || '';
          const neighborhood = imovel.Bairro || '';
          const description = imovel.DescricaoWeb || imovel.DescricaoEmpreendimento || '';
          const priceVenda = imovel.ValorVenda ? parseFloat(String(imovel.ValorVenda)) : 0;
          const priceLocacao = imovel.ValorLocacao ? parseFloat(String(imovel.ValorLocacao)) : 0;
          const price = priceVenda || priceLocacao || 0;
          const bedroomsStr = imovel.Dormitorios || imovel.Dormitorio;
          const bedrooms = bedroomsStr ? parseInt(bedroomsStr, 10) : 0;
          const parkingStr = imovel.Vagas;
          const parkingSpaces = parkingStr ? parseInt(parkingStr, 10) : 0;
          const areaStr = imovel.AreaPrivativa || imovel.AreaTotal;
          const area = areaStr ? parseFloat(areaStr) : 0;

          // Extrair coordenadas — tratar vírgula como separador decimal
          const latStr = imovel.Latitude ? String(imovel.Latitude).replace(',', '.') : null;
          const lngStr = imovel.Longitude ? String(imovel.Longitude).replace(',', '.') : null;
          const lat = latStr ? parseFloat(latStr) : null;
          const lng = lngStr ? parseFloat(lngStr) : null;

          allSyncedExternalIds.add(codigo);
          propertiesBatch.push({
            tenant_id,
            external_id: codigo,
            city,
            neighborhood,
            title: imovel.Categoria
              ? `${imovel.Categoria} em ${neighborhood}`.trim()
              : `Imóvel em ${neighborhood}`.trim(),
            price: isNaN(price) ? 0 : price,
            bedrooms: isNaN(bedrooms) ? 0 : bedrooms,
            parking_spaces: isNaN(parkingSpaces) ? 0 : parkingSpaces,
            area: isNaN(area) ? 0 : area,
            description,
            raw_data: imovel,
            is_active: true,
            latitude: (lat && !isNaN(lat) && lat !== 0) ? lat : null,
            longitude: (lng && !isNaN(lng) && lng !== 0) ? lng : null,
            vista_updated_at: imovel.DataAtualizacao || null,
            updated_at: new Date().toISOString(),
          });
        }
      }

      // 4. Upsert batch to Supabase
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
          console.log(`Upserted ${propertiesBatch.length} properties for tenant ${tenant_id} (page ${currentPage})`);
        }
      }

      currentPage += 1;
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    // Para full sync, desativar imóveis que não vieram no resultado
    // (não estão mais à Venda/Aluguel ou não estão ExibirNoSite)
    let deactivatedCount = 0;
    if (full_sync && totalProcessed > 0) {
      const syncedIds = allSyncedExternalIds;
      if (syncedIds.size > 0) {
        // Buscar todos os external_ids ativos do tenant
        const { data: activeProps } = await supabase
          .from('properties')
          .select('external_id')
          .eq('tenant_id', tenant_id)
          .eq('is_active', true);

        if (activeProps) {
          const toDeactivate = activeProps
            .filter(p => !syncedIds.has(p.external_id))
            .map(p => p.external_id);

          if (toDeactivate.length > 0) {
            const { error: deactErr } = await supabase
              .from('properties')
              .update({ is_active: false, updated_at: new Date().toISOString() })
              .eq('tenant_id', tenant_id)
              .in('external_id', toDeactivate);

            if (deactErr) {
              console.error('Error deactivating old properties:', deactErr);
            } else {
              deactivatedCount = toDeactivate.length;
              console.log(`Deactivated ${deactivatedCount} properties no longer matching filters.`);
            }
          }
        }
      }
    }

    return new Response(JSON.stringify({
      success: true,
      message: `Successfully synced ${totalProcessed} properties.${deactivatedCount > 0 ? ` Deactivated ${deactivatedCount} properties.` : ''}`
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });

  } catch (error: any) {
    console.error('Error migrating properties:', error);
    return new Response(JSON.stringify({ error: error.message, stack: error.stack }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });
  }
});
