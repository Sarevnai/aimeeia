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

    // Extract features (Caracteristicas + InfraEstrutura)
    const extractFeatures = (featuresObj: any) => {
      if (!featuresObj || typeof featuresObj !== 'object') return [];
      const positiveFeatures: string[] = [];
      for (const [key, value] of Object.entries(featuresObj)) {
        if (value === 'Sim') {
          positiveFeatures.push(key.replace(/([A-Z])/g, ' $1').trim());
        }
      }
      return positiveFeatures;
    };

    const allFeatures = [
      ...extractFeatures(rawData.Caracteristicas),
      ...extractFeatures(rawData.InfraEstrutura),
    ];
    const featuresText = allFeatures.length > 0
      ? `O condomínio e o imóvel oferecem: ${allFeatures.join(', ')}.`
      : '';

    // Extras semânticos dos campos enriquecidos
    const extras: string[] = [];
    if (rawData.Edificio) extras.push(`Edifício ${rawData.Edificio}`);
    if (rawData.AndarDoApto) extras.push(`${rawData.AndarDoApto}º andar`);
    if (rawData.Face) extras.push(`face ${rawData.Face}`);
    if (rawData.VistaPanoramica === 'Sim') extras.push('vista panorâmica');
    if (rawData.Sacada === 'Sim' || rawData.SacadaComChurrasqueira === 'Sim') {
      extras.push(rawData.SacadaComChurrasqueira === 'Sim' ? 'sacada com churrasqueira' : 'sacada');
    }
    if (rawData.ProntoMorar === 'Sim') extras.push('pronto para morar');
    if (rawData.Reformado === 'Sim') extras.push('reformado');
    if (rawData.Lancamento === 'Sim' || rawData.EmObras === 'Sim') extras.push('lançamento/em obras');
    if (rawData.Mobiliado === 'Sim') extras.push('mobiliado');
    if (rawData.PadraoConstrucao) extras.push(`padrão ${rawData.PadraoConstrucao}`);
    if (rawData.AnoConstrucao) extras.push(`construído em ${rawData.AnoConstrucao}`);
    const condVal = rawData.ValorCondominio ? parseFloat(String(rawData.ValorCondominio)) : 0;
    if (condVal > 0) extras.push(`condomínio R$ ${condVal}`);
    const extrasText = extras.length > 0 ? extras.join('. ') + '.' : '';

    // Fase 2: Contexto geográfico (imediações + descrição do bairro)
    const imediacoes = rawData.Imediacoes ? `Proximidades: ${rawData.Imediacoes}.` : '';
    let descBairro = rawData.DescricaoBairro || '';
    if (descBairro.length > 300) descBairro = descBairro.substring(0, 300);
    const bairroContext = descBairro ? `Sobre o bairro: ${descBairro}` : '';

    if (description.length > 500) {
      description = description.substring(0, 500);
    }
    if (description.length > 5) {
      description = `Descrição: ${description}`;
    }

    const propertyTextToEmbed = `Imóvel em ${city}, bairro ${neighborhood}. Preço: R$ ${price}. Tem ${bedrooms} quartos e ${parkingSpaces} vagas. ${extrasText} ${imediacoes} ${bairroContext} ${featuresText} ${description} ${title}`.trim();

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
