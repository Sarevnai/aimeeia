-- Fix match_properties: use actual column names from properties table
-- The previous version referenced non-existent columns (status, type, images, url)
-- Actual columns: is_active (bool), raw_data (jsonb with Categoria, FotoDestaque, URLSite)

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
    p.external_id::text,
    p.title::text,
    p.description,
    p.price,
    COALESCE(p.raw_data->>'Categoria', p.title)::text as type,
    p.bedrooms,
    p.neighborhood::text,
    p.city::text,
    CASE
      WHEN p.raw_data->>'FotoDestaque' IS NOT NULL
      THEN jsonb_build_array(p.raw_data->>'FotoDestaque')
      ELSE '[]'::jsonb
    END as images,
    (p.raw_data->>'URLSite')::text as url,
    (1 - (p.embedding <=> query_embedding))::float as similarity,
    p.latitude,
    p.longitude
  FROM properties p
  WHERE p.tenant_id = match_tenant_id
    AND p.is_active = true
    AND p.embedding IS NOT NULL
    AND 1 - (p.embedding <=> query_embedding) > match_threshold
    AND (filter_max_price IS NULL OR p.price <= filter_max_price)
    AND (filter_tipo IS NULL OR COALESCE(p.raw_data->>'Categoria', p.title) ILIKE '%' || filter_tipo || '%')
  ORDER BY p.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;
