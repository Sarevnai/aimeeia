import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";
import { XMLParser } from "https://esm.sh/fast-xml-parser@4.3.2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const corsResponse = () => new Response('ok', { headers: corsHeaders });
const jsonResponse = (data: any, status = 200) => new Response(JSON.stringify(data), {
  headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  status
});
const errorResponse = (error: string, status = 500) => new Response(JSON.stringify({ error }), {
  headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  status
});

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return corsResponse();

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { xml_url, tenant_id } = await req.json();

    if (!xml_url || !tenant_id) {
      return errorResponse('Missing xml_url or tenant_id', 400);
    }

    console.log(`Starting XML ingestion for tenant ${tenant_id} from ${xml_url}`);

    const xmlResponse = await fetch(xml_url);
    if (!xmlResponse.ok) {
      throw new Error(`Failed to fetch XML: ${xmlResponse.statusText}`);
    }
    const xmlData = await xmlResponse.text();

    console.log(`Fetched XML, parsing...`);

    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: "@_"
    });
    const result = parser.parse(xmlData);

    let listings = [];
    if (result.Carga?.Imoveis?.Imovel) {
      listings = Array.isArray(result.Carga.Imoveis.Imovel) ? result.Carga.Imoveis.Imovel : [result.Carga.Imoveis.Imovel];
    } else if (result.AdType?.Listing) {
      listings = Array.isArray(result.AdType.Listing) ? result.AdType.Listing : [result.AdType.Listing];
    } else if (result.Listings?.Listing) {
      listings = Array.isArray(result.Listings.Listing) ? result.Listings.Listing : [result.Listings.Listing];
    } else if (result.ListingDataFeed?.Listings?.Listing) {
      listings = Array.isArray(result.ListingDataFeed.Listings.Listing) ? result.ListingDataFeed.Listings.Listing : [result.ListingDataFeed.Listings.Listing];
    } else {
      console.log('Available root keys:', Object.keys(result));
      return errorResponse('Não foi possível identificar o formato deste XML.', 400);
    }

    // Prepare queue items
    console.log(`Found ${listings.length} listings. Preparing for queue insertion...`);
    const queueItems = listings.map((listing: any) => {
      const getValue = (val: any) => val && typeof val === 'object' && val['#text'] !== undefined ? val['#text'] : val;
      const external_id = getValue(listing.PropertyID || listing.ListingID || listing.CodigoImovel || listing.id) || Math.random().toString();

      return {
        tenant_id,
        external_id: String(external_id),
        raw_data: listing,
        status: 'pending'
      };
    });

    // Chunk insertion to avoid massive payload errors to postgres (e.g. 500 records at a time)
    const chunkSize = 500;
    let insertedCount = 0;

    for (let i = 0; i < queueItems.length; i += chunkSize) {
      const chunk = queueItems.slice(i, i + chunkSize);
      const { error } = await supabaseClient
        .from('xml_sync_queue')
        .insert(chunk);

      if (error) {
        console.error(`Error inserting chunk ${i}:`, error);
        throw error;
      }
      insertedCount += chunk.length;
    }

    return jsonResponse({
      success: true,
      message: `XML importado com sucesso! ${insertedCount} imóveis foram colocados na fila de processamento via Inteligência Artificial. Isso pode levar alguns minutos.`,
      queued: insertedCount
    });

  } catch (error) {
    console.error('XML Ingestion error:', error);
    return errorResponse((error as Error).message);
  }
});
