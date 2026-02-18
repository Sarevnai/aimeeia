// ========== AIMEE.iA v2 - REGIONS ==========
// Loads regions from DB (not hardcoded). Multi-tenant.

import { Region } from './types.ts';

export async function loadRegions(supabase: any, tenantId: string): Promise<Region[]> {
  const { data, error } = await supabase
    .from('regions')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('region_name');

  if (error) {
    console.error('❌ Error loading regions:', error);
    return [];
  }

  return (data || []) as Region[];
}

export function getAllNeighborhoods(regions: Region[]): string[] {
  return regions.flatMap(r => r.neighborhoods);
}

export function normalizeNeighborhood(
  input: string,
  regions: Region[]
): string | null {
  const lower = input.toLowerCase().trim();

  for (const region of regions) {
    for (const neighborhood of region.neighborhoods) {
      if (neighborhood.toLowerCase() === lower) return neighborhood;
      // Fuzzy: check if input contains neighborhood
      if (lower.includes(neighborhood.toLowerCase())) return neighborhood;
    }
    // Check region name itself
    if (region.region_name.toLowerCase() === lower) return region.region_name;
  }

  return null;
}

export function expandRegionToNeighborhoods(
  regionOrNeighborhood: string,
  regions: Region[]
): string[] {
  const lower = regionOrNeighborhood.toLowerCase();

  // Check if it's a region name → expand to all its neighborhoods
  for (const region of regions) {
    if (region.region_name.toLowerCase() === lower) {
      return region.neighborhoods;
    }
  }

  // Otherwise return as-is
  return [regionOrNeighborhood];
}

export function generateRegionKnowledge(regions: Region[]): string {
  if (regions.length === 0) return '';

  const lines = regions.map(r =>
    `- ${r.region_name}: ${r.neighborhoods.join(', ')}`
  );

  return `\n📍 REGIÕES E BAIRROS DISPONÍVEIS:\n${lines.join('\n')}\n`;
}
