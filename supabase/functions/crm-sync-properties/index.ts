import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

async function generateEmbedding(text: string): Promise<number[]> {
  const apiKey = Deno.env.get('OPENAI_API_KEY') || Deno.env.get('LOVABLE_API_KEY');
  if (!apiKey) throw new Error('OPENAI_API_KEY not configured for embeddings');

  const response = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'text-embedding-3-small',
      input: text,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Embedding API error (${response.status}): ${error}`);
  }

  const data = await response.json();
  return data.data[0].embedding;
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { tenant_id, full_sync, cleanup_only } = await req.json();

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

    // ============================================================
    // cleanup_only mode: fetch valid Codigos from Vista, delete orphans
    // Does NOT process/upsert properties or generate embeddings
    // ============================================================
    if (cleanup_only) {
      console.log(`Cleanup-only mode for tenant ${tenant_id}`);
      const validCodigos = new Set<string>();
      let cPage = 1;
      let cTotalPages = 1;

      while (cPage <= cTotalPages) {
        const cPesquisa = {
          fields: ["Codigo"],
          paginacao: { pagina: cPage, quantidade: 50 },
          filter: { "Status": ["Venda", "Aluguel"], "ExibirNoSite": "Sim" }
        };
        const cEncoded = encodeURIComponent(JSON.stringify(cPesquisa));
        const cUrl = `${vistaUrl}?key=${vistaKey}&pesquisa=${cEncoded}&showtotal=1`;
        const cResp = await fetch(cUrl, { headers: { 'Accept': 'application/json' } });

        if (!cResp.ok) {
          const errText = await cResp.text();
          console.error(`Cleanup fetch error page ${cPage}: HTTP ${cResp.status}`, errText);
          break;
        }
        const cData = await cResp.json();

        // Check for Vista soft error (HTTP 200 but error in body)
        if (cData && typeof cData === 'object' && 'status' in cData && cData.status >= 400) {
          console.error(`Cleanup Vista soft error page ${cPage}:`, JSON.stringify(cData));
          break;
        }

        if (cPage === 1) {
          console.log(`Cleanup page 1 keys: ${Object.keys(cData).slice(0, 5).join(', ')}...`);
          console.log(`Cleanup paginas: ${cData.paginas}, total: ${cData.total}`);
        }
        if (cData.paginas && cPage === 1) {
          cTotalPages = cData.paginas;
          console.log(`Cleanup: ${cTotalPages} pages, fetching valid Codigos...`);
        }
        for (const key of Object.keys(cData)) {
          const item = cData[key];
          if (typeof item === 'object' && item !== null && 'Codigo' in item) {
            validCodigos.add(String(item.Codigo));
          }
        }
        cPage++;
        await new Promise(r => setTimeout(r, 300));
      }

      let deletedCount = 0;
      if (validCodigos.size > 0) {
        const { data: allProps } = await supabase
          .from('properties')
          .select('external_id')
          .eq('tenant_id', tenant_id);

        if (allProps) {
          const toDelete = allProps
            .filter(p => !validCodigos.has(p.external_id))
            .map(p => p.external_id);

          if (toDelete.length > 0) {
            for (let i = 0; i < toDelete.length; i += 100) {
              const batch = toDelete.slice(i, i + 100);
              const { error: delErr } = await supabase
                .from('properties')
                .delete()
                .eq('tenant_id', tenant_id)
                .in('external_id', batch);
              if (delErr) {
                console.error(`Cleanup delete error batch ${i}:`, delErr);
              } else {
                deletedCount += batch.length;
              }
            }
          }
        }
        console.log(`Cleanup done: ${deletedCount} orphans deleted. ${validCodigos.size} valid Codigos in Vista.`);
      } else {
        console.warn('Cleanup: Could not fetch valid Codigos from Vista.');
      }

      return new Response(JSON.stringify({
        success: true,
        message: `Cleanup complete. Deleted ${deletedCount} orphan properties. ${validCodigos.size} valid in Vista.`
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      });
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

          // Gerar embedding para busca semântica
          const statusUpper = String(imovel.Status || '').toUpperCase();
          const transactionLabel = statusUpper.includes('ALUGUEL') ? 'para locação' : 'à venda';
          const bathrooms = imovel.TotalBanheiros ? parseInt(imovel.TotalBanheiros, 10) : 0;
          const descTrunc = description.length > 1000 ? description.substring(0, 1000) : description;
          const titleText = imovel.Categoria
            ? `${imovel.Categoria} em ${neighborhood}`.trim()
            : `Imóvel em ${neighborhood}`.trim();

          const semanticText = `Imóvel ${transactionLabel}: ${titleText}. ${imovel.TipoImovel || ''} em ${neighborhood}, ${city}. Preço: R$ ${price || 'sob consulta'}. ${bedrooms} quartos, ${isNaN(bathrooms) ? 0 : bathrooms} banheiros, ${parkingSpaces} vagas. Área: ${area}m². ${descTrunc}`;

          let embedding: number[] | null = null;
          try {
            embedding = await generateEmbedding(semanticText);
            await new Promise(r => setTimeout(r, 100)); // throttle OpenAI calls
          } catch (e) {
            console.warn(`Embedding failed for ${codigo}: ${e.message}`);
          }

          allSyncedExternalIds.add(codigo);
          propertiesBatch.push({
            tenant_id,
            external_id: codigo,
            city,
            neighborhood,
            title: titleText,
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
            ...(embedding ? { embedding } : {}),
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

    // ============================================================
    // Cleanup: deletar imóveis que não estão mais no Vista
    // com STATUS=Venda/Aluguel e ExibirNoSite=Sim
    // Roda tanto no full sync quanto no delta sync
    // ============================================================
    let deletedCount = 0;

    if (full_sync && totalProcessed > 0) {
      // Full sync: já temos todos os IDs válidos em allSyncedExternalIds
      const syncedIds = allSyncedExternalIds;
      if (syncedIds.size > 0) {
        const { data: allProps } = await supabase
          .from('properties')
          .select('external_id')
          .eq('tenant_id', tenant_id);

        if (allProps) {
          const toDelete = allProps
            .filter(p => !syncedIds.has(p.external_id))
            .map(p => p.external_id);

          if (toDelete.length > 0) {
            // Deletar em batches de 100 para evitar limites
            for (let i = 0; i < toDelete.length; i += 100) {
              const batch = toDelete.slice(i, i + 100);
              const { error: delErr } = await supabase
                .from('properties')
                .delete()
                .eq('tenant_id', tenant_id)
                .in('external_id', batch);

              if (delErr) {
                console.error(`Error deleting orphan batch ${i}:`, delErr);
              } else {
                deletedCount += batch.length;
              }
            }
            console.log(`Deleted ${deletedCount} orphan properties no longer in Vista.`);
          }
        }
      }
    } else if (!full_sync && totalProcessed >= 0) {
      // Delta sync: fazer query leve ao Vista para obter lista completa de Codigos válidos
      console.log('Delta sync cleanup: fetching valid Codigos from Vista...');

      const validCodigos = new Set<string>();
      let cleanupPage = 1;
      let cleanupTotalPages = 1;

      while (cleanupPage <= cleanupTotalPages) {
        const cleanupPesquisa = {
          fields: ["Codigo"],
          paginacao: { pagina: cleanupPage, quantidade: 50 },
          filter: {
            "Status": ["Venda", "Aluguel"],
            "ExibirNoSite": "Sim"
          }
        };

        const encodedCleanup = encodeURIComponent(JSON.stringify(cleanupPesquisa));
        const cleanupUrl = `${vistaUrl}?key=${vistaKey}&pesquisa=${encodedCleanup}&showtotal=1`;

        const cleanupResp = await fetch(cleanupUrl, { headers: { 'Accept': 'application/json' } });

        if (!cleanupResp.ok) {
          console.error(`Cleanup fetch error page ${cleanupPage}: HTTP ${cleanupResp.status}`);
          break;
        }

        const cleanupData = await cleanupResp.json();

        if (cleanupPage === 1 && cleanupData.paginas) {
          cleanupTotalPages = cleanupData.paginas;
          console.log(`Cleanup: ${cleanupTotalPages} pages of valid Codigos to fetch`);
        }

        for (const key of Object.keys(cleanupData)) {
          const item = cleanupData[key];
          if (typeof item === 'object' && item !== null && 'Codigo' in item) {
            validCodigos.add(String(item.Codigo));
          }
        }

        cleanupPage++;
        await new Promise(r => setTimeout(r, 500));
      }

      if (validCodigos.size > 0) {
        const { data: allProps } = await supabase
          .from('properties')
          .select('external_id')
          .eq('tenant_id', tenant_id);

        if (allProps) {
          const toDelete = allProps
            .filter(p => !validCodigos.has(p.external_id))
            .map(p => p.external_id);

          if (toDelete.length > 0) {
            for (let i = 0; i < toDelete.length; i += 100) {
              const batch = toDelete.slice(i, i + 100);
              const { error: delErr } = await supabase
                .from('properties')
                .delete()
                .eq('tenant_id', tenant_id)
                .in('external_id', batch);

              if (delErr) {
                console.error(`Error deleting orphan batch ${i}:`, delErr);
              } else {
                deletedCount += batch.length;
              }
            }
            console.log(`Delta cleanup: Deleted ${deletedCount} orphan properties.`);
          } else {
            console.log('Delta cleanup: No orphan properties found.');
          }
        }
      } else {
        console.warn('Delta cleanup: Could not fetch valid Codigos from Vista, skipping cleanup.');
      }
    }

    return new Response(JSON.stringify({
      success: true,
      message: `Successfully synced ${totalProcessed} properties.${deletedCount > 0 ? ` Deleted ${deletedCount} orphan properties.` : ''}`
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
