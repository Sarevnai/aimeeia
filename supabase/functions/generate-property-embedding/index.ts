import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// This function acts as a Database Webhook target
serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Parse the Database Webhook payload
    // The payload usually contains: type (INSERT/UPDATE/DELETE), table, schema, record (new values), old_record
    const payload = await req.json();

    console.log(`Received Webhook payload for type: ${payload.type}`);

    if (payload.type !== 'INSERT' && payload.type !== 'UPDATE') {
      return new Response('Ignored: Not an insert or update', { status: 200 });
    }

    const propertyId = payload.record.id;

    if (!propertyId) {
      console.error('No property ID found in record');
      return new Response('Missing property ID', { status: 400 });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const openaiApiKey = Deno.env.get('OPENAI_API_KEY')!;

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch the freshest data from the database to build the embedding text
    // (Even though we have payload.record, fetching ensures we have everything if dealing with complex joins later,
    // but for now relying on payload.record is actually faster and safer)
    const record = payload.record;

    const city = record.city || '';
    const neighborhood = record.neighborhood || '';
    let description = record.description || '';
    const price = record.price || 0;
    const bedrooms = record.bedrooms || 0;
    const parkingSpaces = record.parking_spaces || 0;
    const title = record.title || '';
    const rawData = record.raw_data || {};

    // Build Semantic Features String
    let featuresText = '';
    const extractFeatures = (featuresObj: any) => {
      if (!featuresObj || typeof featuresObj !== 'object') return [];
      const positiveFeatures: string[] = [];
      for (const [key, value] of Object.entries(featuresObj)) {
        if (value === 'Sim') {
          // Break camel case / space out for better reading: "ArmarioCozinha" -> "Armario Cozinha"
          const formattedKey = key.replace(/([A-Z])/g, ' $1').trim();
          positiveFeatures.push(formattedKey);
        }
      }
      return positiveFeatures;
    };

    const caracteristicas = extractFeatures(rawData.Caracteristicas);
    const infraestrutura = extractFeatures(rawData.InfraEstrutura);

    const allFeatures = [...caracteristicas, ...infraestrutura];

    if (allFeatures.length > 0) {
      featuresText = `O condomínio e o imóvel oferecem as seguintes comodidades: ${allFeatures.join(', ')}.`;
    }

    // Only append description if it exists
    if (description.length > 5) {
      description = `Descrição adicional: ${description}`;
    }

    // Generate OpenAI Embedding for the text
    const propertyTextToEmbed = `Imóvel para venda em ${city}, bairro ${neighborhood}. Preço: R$ ${price}. Tem ${bedrooms} quartos e ${parkingSpaces} vagas de garagem. ${featuresText} ${description} ${title}`.trim();

    console.log(`Generating embedding for property ${propertyId}...`);

    const embeddingRes = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openaiApiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        input: propertyTextToEmbed,
        model: 'text-embedding-3-small' // 1536 dimensions
      })
    });

    if (!embeddingRes.ok) {
      const errorBody = await embeddingRes.text();
      throw new Error(`Failed to generate embedding: HTTP ${embeddingRes.status} - ${errorBody}`);
    }

    const embeddingData = await embeddingRes.json();
    const embedding = embeddingData.data[0].embedding;

    // Update the property record with the new vector
    const { error: updateErr } = await supabase
      .from('properties')
      .update({ embedding })
      .eq('id', propertyId);

    if (updateErr) {
      throw new Error(`Failed to save embedding to DB: ${updateErr.message}`);
    }

    console.log(`Successfully generated and saved embedding for property ${propertyId}`);

    return new Response(JSON.stringify({
      success: true,
      message: `Embedding generated for property ${propertyId}`
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });

  } catch (error: any) {
    console.error('Error generating property embedding:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
});
