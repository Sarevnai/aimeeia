-- Creates the semantic search function used by the AI agent to find properties
-- using vector similarity (cosine distance via pgvector).
CREATE OR REPLACE FUNCTION public.search_properties_semantic(
    query_embedding extensions.vector(1536),
    tenant_id_param UUID,
    match_count INT DEFAULT 5,
    price_min NUMERIC DEFAULT NULL,
    price_max NUMERIC DEFAULT NULL,
    bedrooms_min INT DEFAULT NULL
)
RETURNS TABLE (
    id UUID,
    external_id VARCHAR,
    city VARCHAR,
    neighborhood VARCHAR,
    price NUMERIC,
    bedrooms INT,
    parking_spaces INT,
    area NUMERIC,
    description TEXT,
    raw_data JSONB,
    similarity FLOAT
)
LANGUAGE sql STABLE AS $$
    SELECT
        p.id,
        p.external_id,
        p.city,
        p.neighborhood,
        p.price,
        p.bedrooms,
        p.parking_spaces,
        p.area,
        p.description,
        p.raw_data,
        1 - (p.embedding <=> query_embedding) AS similarity
    FROM public.properties p
    WHERE p.tenant_id = tenant_id_param
      AND p.is_active = true
      AND p.embedding IS NOT NULL
      AND (price_min IS NULL OR p.price >= price_min)
      AND (price_max IS NULL OR p.price <= price_max)
      AND (bedrooms_min IS NULL OR p.bedrooms >= bedrooms_min)
    ORDER BY p.embedding <=> query_embedding
    LIMIT match_count;
$$;
