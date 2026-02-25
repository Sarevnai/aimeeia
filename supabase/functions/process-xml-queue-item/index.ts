import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";

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
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

    let supabaseClient;
    let recordId;

    try {
        supabaseClient = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
        );

        const body = await req.json();
        // Support both direct calls { record_id: '...' } and Database Webhook payloads { record: { id: '...' } }
        recordId = body.record_id || body.record?.id;

        if (!recordId) {
            throw new Error('Missing record_id in request body');
        }

        console.log(`Processing queue item: ${recordId}`);

        // 1. Fetch the queue item
        const { data: queueItem, error: fetchError } = await supabaseClient
            .from('xml_sync_queue')
            .select('*')
            .eq('id', recordId)
            .single();

        if (fetchError || !queueItem) {
            throw new Error(`Queue item not found or DB error: ${fetchError?.message}`);
        }

        // Mark as processing
        await supabaseClient
            .from('xml_sync_queue')
            .update({ status: 'processing', updated_at: new Date().toISOString() })
            .eq('id', recordId);

        // 2. Extract Data from Raw JSON
        const listing = queueItem.raw_data;
        const details = listing.Details || listing;

        // We already have string-safe extraction from the ingestion pass but let's be safe
        const title = listing.Title || listing.TituloImovel || `${details.PropertyType || ''} em ${listing.Location?.Neighborhood || ''}`;
        const description = listing.Description || listing.Observacao || '';
        const price = parseFloat(String(details.ListPrice || listing.PrecoVenda || listing.PrecoLocacao || 0));
        const type = details.PropertyType || listing.TipoImovel || '';
        const bedrooms = parseInt(String(details.Bedrooms || listing.Dormitorios || 0));
        const bathrooms = parseInt(String(details.Bathrooms || listing.Banheiros || 0));
        const parking = parseInt(String(details.Garage || listing.Vagas || 0));
        const area = parseFloat(String(details.LivingArea || listing.AreaUtil || 0));

        const location = listing.Location || listing;
        const neighborhood = location.Neighborhood || location.Bairro || '';
        const city = location.City || location.Cidade || '';

        // Extract Images
        let images = [];
        const media = listing.Media || listing.Fotos?.Foto;
        if (media) {
            if (Array.isArray(media)) {
                images = media.map((m: any) => m.Item?.[0]?.url || m.Item?.url || m.Item || m.URLArquivo || m.URL || m);
            } else if (media.Item) {
                images = Array.isArray(media.Item) ? media.Item.map((m: any) => m.url || m) : [media.Item?.url || media.Item];
            } else if (media.URLArquivo) {
                images = [media.URLArquivo];
            }
        }
        // Filter purely string urls
        images = images.filter((i: any) => typeof i === 'string');

        const semanticText = `Imóvel: ${title}. ${type} em ${neighborhood}, ${city}. \nPreço: R$ ${price || 0}. \n${bedrooms || 0} quartos, ${bathrooms || 0} banheiros, ${parking || 0} vagas de garagem. \nÁrea útil: ${area || 0}m². \nDescrição detalhada: ${description}`;

        // 3. Generate Embedding
        console.log(`Generating embedding for ${queueItem.external_id}...`);
        const embedding = await generateEmbedding(semanticText);

        // 4. Upsert into Properties
        const { error: upsertError } = await supabaseClient
            .from('properties')
            .upsert({
                tenant_id: queueItem.tenant_id,
                external_id: queueItem.external_id,
                title: title || 'Imóvel sem título',
                description,
                price,
                type: type || 'Indefinido',
                bedrooms,
                bathrooms,
                parking,
                area,
                neighborhood,
                city,
                images,
                url: '',
                status: 'ativo',
                embedding,
                updated_at: new Date().toISOString()
            }, { onConflict: 'tenant_id, external_id' });

        if (upsertError) {
            throw new Error(`Failed to upsert property: ${upsertError.message}`);
        }

        // 5. Mark as Completed
        await supabaseClient
            .from('xml_sync_queue')
            .update({ status: 'completed', updated_at: new Date().toISOString(), error_message: null })
            .eq('id', recordId);

        console.log(`Successfully processed ${recordId}`);
        return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    } catch (error: any) {
        console.error(`Error processing queue item ${recordId}:`, error);

        // If we have a record ID, try to mark it as failed
        if (supabaseClient && recordId) {
            await supabaseClient
                .from('xml_sync_queue')
                .update({ status: 'failed', updated_at: new Date().toISOString(), error_message: error.message || JSON.stringify(error) })
                .eq('id', recordId);
        }

        return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }
});
