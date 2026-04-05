import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';
import { generateEmbedding } from '../_shared/agents/tool-executors.ts';

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

    const supabase = createClient(supabaseUrl, supabaseKey);

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

    if (description.length > 5) {
      description = `Descrição adicional: ${description}`;
    }

    const propertyTextToEmbed = `Imóvel para venda em ${city}, bairro ${neighborhood}. Preço: R$ ${price}. Tem ${bedrooms} quartos e ${parkingSpaces} vagas de garagem. ${featuresText} ${description} ${title}`.trim();

    console.log(`Generating Gemini embedding for property ${propertyId}...`);

    const embedding = await generateEmbedding(propertyTextToEmbed, { supabase }, 'RETRIEVAL_DOCUMENT');

    const { error: updateErr } = await supabase
      .from('properties')
      .update({ embedding })
      .eq('id', propertyId);

    if (updateErr) {
      throw new Error(`Failed to save embedding to DB: ${updateErr.message}`);
    }

    console.log(`Successfully generated and saved Gemini embedding for property ${propertyId}`);

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
