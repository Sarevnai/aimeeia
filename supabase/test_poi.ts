import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";
import "https://deno.land/std@0.168.0/dotenv/load.ts";

const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  const apiKey = 'xaU9EJJ0kfc980liVLQpW9DA1wo';

  const { data: conv } = await supabase
    .from('conversation_states')
    .select('pending_properties')
    .ilike('phone_number', '%88182882%')
    .single();

  if (!conv || !conv.pending_properties || conv.pending_properties.length === 0) {
    console.log("No pending properties found for 88182882.");
    return;
  }

  const propId = conv.pending_properties[0].codigo;
  console.log(`Testing with property external_id: ${propId}`);

  const { data: property } = await supabase
    .from('properties')
    .select('latitude, longitude, external_id')
    .eq('external_id', propId)
    .single();

  if (!property || !property.latitude) {
    console.log("Property has no latitude/longitude.");
    return;
  }

  console.log(`Coordinates: ${property.latitude}, ${property.longitude}`);

  // Test Places API
  const type = 'supermarket';
  const requestBody = {
    includedTypes: [type],
    maxResultCount: 3,
    locationRestriction: {
      circle: {
        center: {
          latitude: property.latitude,
          longitude: property.longitude
        },
        radius: 2000
      }
    }
  };

  const url = 'https://places.googleapis.com/v1/places:searchNearby';
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask': 'places.displayName,places.formattedAddress,places.rating,places.location'
    },
    body: JSON.stringify(requestBody)
  });

  if (!response.ok) {
    console.error("Google API Error:", await response.text());
    return;
  }

  const data = await response.json();
  console.log(JSON.stringify(data, null, 2));
}

run();
