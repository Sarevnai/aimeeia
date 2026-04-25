-- Sprint Locação v1.5: estruturar finalidade (venda/locacao/ambos) e price_rental
-- Bug crítico: RPC match_properties usava raw_data->>'Finalidade' (que é COMERCIAL|RESIDENCIAL|MISTO),
-- não venda/locação. Buscas de locação retornavam 0. Coluna estruturada + RPC corrigida abaixo.

ALTER TABLE public.properties
  ADD COLUMN IF NOT EXISTS finalidade text,
  ADD COLUMN IF NOT EXISTS price_rental NUMERIC;

-- Backfill via raw_data: detecta finalidade pelos valores de venda/locação
UPDATE public.properties
SET
  finalidade = CASE
    WHEN COALESCE((NULLIF(raw_data->>'ValorLocacao',''))::numeric, 0) > 0
         AND COALESCE((NULLIF(raw_data->>'ValorVenda',''))::numeric, 0) > 0 THEN 'ambos'
    WHEN COALESCE((NULLIF(raw_data->>'ValorLocacao',''))::numeric, 0) > 0 THEN 'locacao'
    WHEN COALESCE((NULLIF(raw_data->>'ValorVenda',''))::numeric, 0) > 0 THEN 'venda'
    ELSE NULL
  END,
  price_rental = NULLIF(NULLIF(raw_data->>'ValorLocacao',''),'0')::numeric;

-- Constraint
ALTER TABLE public.properties DROP CONSTRAINT IF EXISTS properties_finalidade_check;
ALTER TABLE public.properties ADD CONSTRAINT properties_finalidade_check
  CHECK (finalidade IS NULL OR finalidade IN ('venda','locacao','ambos'));

-- Index
CREATE INDEX IF NOT EXISTS idx_properties_finalidade
  ON public.properties(tenant_id, finalidade) WHERE is_active = true;

-- RPC corrigida: usa coluna estruturada `finalidade` e retorna o preço correto pro contexto
DROP FUNCTION IF EXISTS public.match_properties(extensions.vector, uuid, double precision, integer, numeric, text, text, integer, text);
DROP FUNCTION IF EXISTS public.match_properties(vector, uuid, double precision, integer, numeric, text, text, integer, text);

CREATE OR REPLACE FUNCTION public.match_properties(
  query_embedding extensions.vector(1536),
  match_tenant_id uuid,
  match_threshold double precision,
  match_count integer,
  filter_max_price numeric DEFAULT NULL,
  filter_tipo text DEFAULT NULL,
  filter_neighborhood text DEFAULT NULL,
  filter_bedrooms integer DEFAULT NULL,
  filter_finalidade text DEFAULT NULL
)
RETURNS TABLE(
  id uuid,
  external_id text,
  title text,
  description text,
  price numeric,
  type text,
  bedrooms integer,
  neighborhood text,
  city text,
  images jsonb,
  url text,
  similarity double precision,
  latitude double precision,
  longitude double precision,
  finalidade text
)
LANGUAGE plpgsql
AS $function$
BEGIN
  RETURN QUERY
  SELECT
    p.id,
    p.external_id::text,
    p.title::text,
    p.description,
    -- Pra locação retorna price_rental como "price"; pra venda/null retorna p.price
    CASE
      WHEN filter_finalidade = 'locacao' THEN COALESCE(p.price_rental, p.price)
      ELSE p.price
    END as price,
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
    p.longitude,
    p.finalidade::text
  FROM public.properties p
  WHERE p.tenant_id = match_tenant_id
    AND p.is_active = true
    AND p.embedding IS NOT NULL
    AND 1 - (p.embedding <=> query_embedding) > match_threshold
    -- Tipo (categoria como Apartamento/Casa)
    AND (filter_tipo IS NULL OR COALESCE(p.raw_data->>'Categoria', p.title) ILIKE '%' || filter_tipo || '%')
    -- Bairro
    AND (filter_neighborhood IS NULL OR p.neighborhood ILIKE '%' || filter_neighborhood || '%')
    -- Quartos
    AND (filter_bedrooms IS NULL OR p.bedrooms >= filter_bedrooms)
    -- Finalidade — usa coluna estruturada agora
    AND (
      filter_finalidade IS NULL
      OR (filter_finalidade = 'venda' AND p.finalidade IN ('venda','ambos'))
      OR (filter_finalidade = 'locacao' AND p.finalidade IN ('locacao','ambos'))
      OR (filter_finalidade NOT IN ('venda','locacao')) -- fallback: aceita qualquer outro valor sem filtrar
    )
    -- Preço — usa o campo certo conforme finalidade
    AND (
      filter_max_price IS NULL
      OR (
        filter_finalidade = 'locacao'
        AND COALESCE(p.price_rental, p.price) <= filter_max_price
      )
      OR (
        (filter_finalidade IS NULL OR filter_finalidade = 'venda')
        AND p.price <= filter_max_price
      )
    )
  ORDER BY p.embedding <=> query_embedding
  LIMIT match_count;
END;
$function$;

COMMENT ON COLUMN public.properties.finalidade IS 'venda | locacao | ambos. Backfill em 2026-04-24 baseado em ValorVenda/ValorLocacao. Sync futuro deve manter atualizado.';
COMMENT ON COLUMN public.properties.price_rental IS 'Valor de aluguel mensal (R$/mês) quando o imóvel também é alugável. NULL = não disponível pra locação.';
