// ========== AIMEE.iA v2 - GET NEARBY PLACES ==========
// Uses Google Maps Places API (New) to fetch POIs around a coordinate.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders, corsResponse, jsonResponse, errorResponse } from '../_shared/supabase.ts';

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return corsResponse();

  try {
    const { latitude, longitude, radius = 2000, type = 'supermarket' } = await req.json();

    if (!latitude || !longitude) {
      return errorResponse('Missing latitude or longitude', 400);
    }

    const apiKey = Deno.env.get('GOOGLE_MAPS_API_KEY');
    if (!apiKey) {
      return errorResponse('Missing GOOGLE_MAPS_API_KEY environment variable', 500);
    }

    const url = 'https://places.googleapis.com/v1/places:searchNearby';

    const requestBody = {
      includedTypes: [type],
      maxResultCount: 3,
      locationRestriction: {
        circle: {
          center: {
            latitude: latitude,
            longitude: longitude
          },
          radius: radius
        }
      }
    };

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
      const errorText = await response.text();
      console.error('❌ Google Maps API error:', response.status, errorText);
      return errorResponse(`Google Maps API error: ${response.status}`, 502);
    }

    const data = await response.json();
    const places = data.places || [];

    // Calculate straight-line distance locally (Haversine)
    const results = places.map((p: any) => {
      const pLat = p.location?.latitude;
      const pLng = p.location?.longitude;
      let distanceMeters = 0;

      if (pLat && pLng) {
        distanceMeters = getDistanceFromLatLonInMeters(latitude, longitude, pLat, pLng);
      }

      return {
        name: p.displayName?.text,
        address: p.formattedAddress,
        rating: p.rating,
        distance_meters: Math.round(distanceMeters)
      };
    });

    // Sort by distance
    results.sort((a: any, b: any) => a.distance_meters - b.distance_meters);

    return jsonResponse({ places: results });

  } catch (error) {
    console.error('❌ Get nearby places error:', error);
    return errorResponse((error as Error).message);
  }
});

function getDistanceFromLatLonInMeters(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371; // Radius of the earth in km
  const dLat = deg2rad(lat2 - lat1);
  const dLon = deg2rad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const d = R * c; // Distance in km
  return d * 1000;
}

function deg2rad(deg: number) {
  return deg * (Math.PI / 180);
}
