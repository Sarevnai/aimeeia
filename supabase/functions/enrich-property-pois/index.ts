// ========== AIMEE.iA - ENRICH PROPERTY POIs ==========
// Batch-enriches properties with Google Places Nearby Search data.
// Fetches schools, supermarkets, hospitals, transit, parks, etc. near each property.
// Stores results in raw_data.google_pois for embedding enrichment.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';
import { corsHeaders, corsResponse, jsonResponse, errorResponse } from '../_shared/supabase.ts';

const POI_TYPES = [
  'school',
  'supermarket',
  'hospital',
  'pharmacy',
  'transit_station',
  'shopping_mall',
  'park',
  'gym',
  'restaurant',
  'university',
];

const SEARCH_RADIUS = 1500; // 1.5km

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return corsResponse();

  try {
    const body = await req.json().catch(() => ({}));
    const batchSize = body.batch_size || 20;
    const tenantId = body.tenant_id || null;

    const googleApiKey = Deno.env.get('GOOGLE_MAPS_API_KEY');
    if (!googleApiKey) return errorResponse('Missing GOOGLE_MAPS_API_KEY', 500);

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // Fetch properties that have coordinates but no google_pois yet
    let query = supabase
      .from('properties')
      .select('id, latitude, longitude, raw_data')
      .eq('is_active', true)
      .not('latitude', 'is', null)
      .not('longitude', 'is', null)
      .neq('latitude', 0)
      .neq('longitude', 0)
      .order('created_at', { ascending: true })
      .limit(batchSize);

    if (tenantId) {
      query = query.eq('tenant_id', tenantId);
    }

    // Filter: only properties without google_pois in raw_data
    // We check if google_pois key doesn't exist
    query = query.or('raw_data->google_pois.is.null,raw_data->>google_pois.eq.null');

    const { data: properties, error: fetchErr } = await query;

    if (fetchErr) throw new Error(`Fetch error: ${fetchErr.message}`);
    if (!properties || properties.length === 0) {
      return jsonResponse({
        success: true,
        message: 'All properties with coordinates already have POI data!',
        processed: 0,
        remaining: 0,
      });
    }

    let processed = 0;
    let errors = 0;

    for (const prop of properties) {
      try {
        const pois = await fetchNearbyPOIs(
          googleApiKey,
          prop.latitude,
          prop.longitude,
        );

        // Merge google_pois into existing raw_data
        const updatedRawData = {
          ...(prop.raw_data || {}),
          google_pois: pois,
        };

        const { error: updateErr } = await supabase
          .from('properties')
          .update({ raw_data: updatedRawData, embedding: null })
          .eq('id', prop.id);

        if (updateErr) {
          console.error(`Failed to save POIs for ${prop.id}: ${updateErr.message}`);
          errors++;
        } else {
          processed++;
        }

        // Throttle: Google Places API has 600 QPM limit
        // With batch of types, each property = 1 request, so ~10/sec is safe
        await new Promise(r => setTimeout(r, 200));
      } catch (e: any) {
        console.error(`Error enriching ${prop.id}: ${e.message}`);
        errors++;
      }
    }

    // Count remaining
    const { count } = await supabase
      .from('properties')
      .select('id', { count: 'exact', head: true })
      .eq('is_active', true)
      .not('latitude', 'is', null)
      .not('longitude', 'is', null)
      .neq('latitude', 0)
      .neq('longitude', 0)
      .or('raw_data->google_pois.is.null,raw_data->>google_pois.eq.null');

    return jsonResponse({
      success: true,
      processed,
      errors,
      remaining: count || 0,
      message: `Batch done: ${processed} enriched, ${errors} errors, ${count || 0} remaining`,
    });
  } catch (error: any) {
    console.error('Enrich POIs error:', error);
    return errorResponse(error.message);
  }
});

async function fetchNearbyPOIs(
  apiKey: string,
  lat: number,
  lng: number,
): Promise<any[]> {
  const url = 'https://places.googleapis.com/v1/places:searchNearby';

  // Single request with multiple types — Google allows up to 50 types
  const requestBody = {
    includedTypes: POI_TYPES,
    maxResultCount: 20,
    locationRestriction: {
      circle: {
        center: { latitude: lat, longitude: lng },
        radius: SEARCH_RADIUS,
      },
    },
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask': 'places.displayName,places.types,places.location',
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Google Places API error (${response.status}): ${errText}`);
  }

  const data = await response.json();
  const places = data.places || [];

  return places.map((p: any) => {
    const pLat = p.location?.latitude;
    const pLng = p.location?.longitude;
    const dist = (pLat && pLng) ? haversineMeters(lat, lng, pLat, pLng) : 0;

    // Pick the most relevant type from the list
    const mainType = (p.types || []).find((t: string) => POI_TYPES.includes(t)) || p.types?.[0] || 'unknown';

    return {
      name: p.displayName?.text || '',
      type: mainType,
      distance_m: Math.round(dist),
    };
  }).sort((a: any, b: any) => a.distance_m - b.distance_m);
}

function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)) * 1000;
}
