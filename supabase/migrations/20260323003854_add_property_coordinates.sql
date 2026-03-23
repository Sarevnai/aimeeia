-- Migration: Add latitude and longitude to properties table

-- Add coordinate columns
ALTER TABLE public.properties ADD COLUMN IF NOT EXISTS latitude double precision;
ALTER TABLE public.properties ADD COLUMN IF NOT EXISTS longitude double precision;

-- Update the match_properties function to return latitude and longitude
DROP FUNCTION IF EXISTS public.match_properties(extensions.vector, uuid, double precision, integer, numeric, text);

CREATE OR REPLACE FUNCTION public.match_properties(
  query_embedding extensions.vector(1536),
  match_tenant_id uuid,
  match_threshold float,
  match_count int,
  filter_max_price numeric default null,
  filter_tipo text default null
)
RETURNS TABLE (
  id uuid,
  external_id text,
  title text,
  description text,
  price numeric,
  type text,
  bedrooms int,
  neighborhood text,
  city text,
  images jsonb,
  url text,
  similarity float,
  latitude double precision,
  longitude double precision
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    p.id,
    p.external_id,
    p.title,
    p.description,
    p.price,
    p.type,
    p.bedrooms,
    p.neighborhood,
    p.city,
    p.images,
    p.url,
    1 - (p.embedding <=> query_embedding) as similarity,
    p.latitude,
    p.longitude
  FROM properties p
  WHERE p.tenant_id = match_tenant_id
    AND p.status = 'ativo'
    AND 1 - (p.embedding <=> query_embedding) > match_threshold
    AND (filter_max_price IS NULL OR p.price <= filter_max_price)
    AND (filter_tipo IS NULL OR p.type ILIKE '%' || filter_tipo || '%')
  ORDER BY p.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;
