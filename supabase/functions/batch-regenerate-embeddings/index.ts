import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';
import { generateEmbedding } from '../_shared/agents/tool-executors.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function buildSemanticText(record: any): string {
  const city = record.city || '';
  const neighborhood = record.neighborhood || '';
  const price = record.price || 0;
  const bedrooms = record.bedrooms || 0;
  const parkingSpaces = record.parking_spaces || 0;
  const title = record.title || '';
  const rawData = record.raw_data || {};
  let description = record.description || '';

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

  // Google POIs pré-computados
  let poisText = '';
  const googlePois = rawData.google_pois as any[] | undefined;
  if (googlePois && googlePois.length > 0) {
    const uniqueTypes = new Set<string>();
    const selected: string[] = [];
    for (const poi of googlePois) {
      if (!uniqueTypes.has(poi.type) && selected.length < 5) {
        uniqueTypes.add(poi.type);
        const dist = poi.distance_m > 1000 ? `${(poi.distance_m / 1000).toFixed(1)}km` : `${poi.distance_m}m`;
        selected.push(`${poi.name} (${dist})`);
      }
    }
    poisText = `Próximo a: ${selected.join(', ')}.`;
  }

  if (description.length > 500) {
    description = description.substring(0, 500);
  }
  if (description.length > 5) {
    description = `Descrição: ${description}`;
  }

  return `Imóvel em ${city}, bairro ${neighborhood}. Preço: R$ ${price}. Tem ${bedrooms} quartos e ${parkingSpaces} vagas. ${extrasText} ${poisText} ${imediacoes} ${bairroContext} ${featuresText} ${description} ${title}`.trim();
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // API key is now resolved inside shared generateEmbedding()

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const body = await req.json().catch(() => ({}));
    const batchSize = body.batch_size || 50;
    const offset = body.offset || 0;

    // Fetch properties without embeddings
    const { data: properties, error: fetchErr } = await supabase
      .from('properties')
      .select('id, title, city, neighborhood, price, bedrooms, parking_spaces, description, raw_data')
      .is('embedding', null)
      .eq('is_active', true)
      .order('created_at', { ascending: true })
      .range(offset, offset + batchSize - 1);

    if (fetchErr) throw new Error(`Fetch error: ${fetchErr.message}`);
    if (!properties || properties.length === 0) {
      return new Response(JSON.stringify({
        success: true,
        message: 'All properties have embeddings!',
        processed: 0
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let processed = 0;
    let errors = 0;

    for (const prop of properties) {
      try {
        const semanticText = buildSemanticText(prop);
        const embedding = await generateEmbedding(semanticText, { supabase }, 'RETRIEVAL_DOCUMENT');

        const { error: updateErr } = await supabase
          .from('properties')
          .update({ embedding })
          .eq('id', prop.id);

        if (updateErr) {
          console.error(`Failed to save embedding for ${prop.id}: ${updateErr.message}`);
          errors++;
        } else {
          processed++;
        }

        // Small delay to respect rate limits (1500 RPM = 25/sec)
        if (processed % 20 === 0) {
          await new Promise(r => setTimeout(r, 1000));
        }
      } catch (e: any) {
        console.error(`Error processing ${prop.id}: ${e.message}`);
        errors++;
      }
    }

    // Check remaining
    const { count } = await supabase
      .from('properties')
      .select('id', { count: 'exact', head: true })
      .is('embedding', null)
      .eq('is_active', true);

    return new Response(JSON.stringify({
      success: true,
      processed,
      errors,
      remaining: count || 0,
      message: `Batch done: ${processed} processed, ${errors} errors, ${count || 0} remaining`,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: any) {
    console.error('Batch error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
});
