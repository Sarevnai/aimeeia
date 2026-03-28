import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";
import { generateEmbedding } from '../_shared/agents/tool-executors.ts';

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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

        // Helper: fast-xml-parser stores text content of elements with attributes in #text
        // e.g. <ListPrice currency="BRL">505000</ListPrice> becomes { "#text": 505000, "@_currency": "BRL" }
        const getTextValue = (val: any): any => {
            if (val == null) return val;
            if (typeof val === 'object' && val['#text'] !== undefined) return val['#text'];
            return val;
        };

        const title = getTextValue(listing.Title) || listing.TituloImovel || `${getTextValue(details.PropertyType) || ''} em ${listing.Location?.Neighborhood || ''}`;
        const description = getTextValue(details.Description) || getTextValue(listing.Description) || listing.Observacao || '';
        const rawPrice = getTextValue(details.ListPrice) || getTextValue(details.RentalPrice) || listing.PrecoVenda || listing.PrecoLocacao || 0;
        const price = parseFloat(String(rawPrice)) || 0;
        const type = getTextValue(details.PropertyType) || listing.TipoImovel || '';
        const bedrooms = parseInt(String(getTextValue(details.Bedrooms) || listing.Dormitorios || 0)) || 0;
        const bathrooms = parseInt(String(getTextValue(details.Bathrooms) || listing.Banheiros || 0)) || 0;
        const parking = parseInt(String(getTextValue(details.Garage) || listing.Vagas || 0)) || 0;
        const area = parseFloat(String(getTextValue(details.LivingArea) || getTextValue(details.LotArea) || listing.AreaUtil || 0)) || 0;

        const location = listing.Location || listing;
        const neighborhood = getTextValue(location.Neighborhood) || location.Bairro || '';
        const city = getTextValue(location.City) || location.Cidade || '';
        const latitude = parseFloat(String(getTextValue(location.Latitude) || location.Latitude || 0)) || null;
        const longitude = parseFloat(String(getTextValue(location.Longitude) || location.Longitude || 0)) || null;

        // Build property URL from listing data
        const propertyUrl = listing.VirtualTourLink || listing.DetailViewUrl || listing.PropertyLink || '';

        // Transaction type for context (venda vs locacao)
        const transactionType = getTextValue(listing.TransactionType) || '';

        // Extract Images - handle fast-xml-parser #text pattern
        let images: string[] = [];
        const media = listing.Media || listing.Fotos?.Foto;
        if (media) {
            const extractImageUrl = (item: any): string | null => {
                if (typeof item === 'string') return item;
                if (item && typeof item === 'object') {
                    // fast-xml-parser #text pattern (most common for Vista XML)
                    const url = item['#text'] || item.url || item.URL || item.URLArquivo;
                    if (typeof url === 'string') return url;
                }
                return null;
            };

            if (Array.isArray(media)) {
                // Media is an array of media groups
                for (const m of media) {
                    const url = extractImageUrl(m);
                    if (url) { images.push(url); continue; }
                    // Nested Item inside each media group
                    if (m.Item) {
                        const items = Array.isArray(m.Item) ? m.Item : [m.Item];
                        for (const item of items) {
                            const u = extractImageUrl(item);
                            if (u) images.push(u);
                        }
                    }
                }
            } else if (media.Item) {
                // Media is an object with Item array (standard Vista XML format)
                const items = Array.isArray(media.Item) ? media.Item : [media.Item];
                for (const item of items) {
                    const url = extractImageUrl(item);
                    if (url) images.push(url);
                }
            } else {
                const url = extractImageUrl(media);
                if (url) images.push(url);
            }
        }
        // Filter only valid image URLs (exclude videos etc.)
        images = images.filter((url) =>
            typeof url === 'string' &&
            url.startsWith('http') &&
            !url.includes('youtube.com') &&
            !url.includes('youtu.be')
        );

        // Truncate description for embedding (avoid token limits, keep meaningful content)
        const descForEmbedding = description.length > 1000 ? description.substring(0, 1000) : description;
        const transactionLabel = transactionType.toLowerCase().includes('rent') ? 'para locação' : transactionType.toLowerCase().includes('sale') ? 'à venda' : '';
        const semanticText = `Imóvel ${transactionLabel}: ${title}. ${type} em ${neighborhood}, ${city}. Preço: R$ ${price || 'sob consulta'}. ${bedrooms || 0} quartos, ${bathrooms || 0} banheiros, ${parking || 0} vagas de garagem. Área útil: ${area || 0}m². Descrição: ${descForEmbedding}`;

        // 3. Generate Embedding
        console.log(`Generating embedding for ${queueItem.external_id}...`);
        const embedding = await generateEmbedding(semanticText, { supabase: supabaseClient });

        // 4. Upsert into Properties
        // Schema real: parking_spaces (não parking), raw_data (jsonb), is_active (não status)
        // Colunas que NÃO existem: type, url, images, status, parking
        const { error: upsertError } = await supabaseClient
            .from('properties')
            .upsert({
                tenant_id: queueItem.tenant_id,
                external_id: queueItem.external_id,
                title: title || 'Imóvel sem título',
                description,
                price: price || null,
                bedrooms,
                bathrooms,
                parking_spaces: parking,
                area,
                neighborhood,
                city,
                raw_data: { type, url: propertyUrl, images, ...queueItem.raw_data },
                is_active: true,
                embedding,
                latitude,
                longitude,
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
