-- 2026-04-28 — Sinalização de financiamento end-to-end
--
-- Caso Daniela 28/04: cliente disse "tenho R$40 mil de entrada e financio o
-- resto". Hoje a Aimee:
-- 1) Não captura entrada/parcela em campo dedicado (gravava em budget_max e
--    inflava ordem de magnitude — coberto pelo fix qualification 28/04).
-- 2) Não filtra catálogo por aceitar financiamento — risco real de mostrar
--    imóvel marcado "NÃO ACEITA FINANCIAMENTO" pra cliente que precisa financiar.
--
-- Esta migration adiciona:
-- - lead_qualification.detected_down_payment (R$ entrada que o cliente tem)
-- - lead_qualification.detected_monthly_payment (R$/mês de parcela que cabe)
-- - lead_qualification.detected_needs_financing (sinal explícito do cliente)
-- - properties.accepts_financing (booleano backfilled da description Vista)
-- - filter_needs_financing param em match_properties / match_properties_no_embedding

-- ========== LEAD QUALIFICATION ==========

ALTER TABLE public.lead_qualification
  ADD COLUMN IF NOT EXISTS detected_down_payment NUMERIC,
  ADD COLUMN IF NOT EXISTS detected_monthly_payment NUMERIC,
  ADD COLUMN IF NOT EXISTS detected_needs_financing BOOLEAN;

COMMENT ON COLUMN public.lead_qualification.detected_down_payment IS
  'Valor de entrada (down payment) que o cliente declarou. Combinado com parcela ou renda permite estimar budget total via SAC simplificado.';
COMMENT ON COLUMN public.lead_qualification.detected_monthly_payment IS
  'Parcela mensal máxima que o cliente disse caber no orçamento. Se ausente, usa renda × 30%.';
COMMENT ON COLUMN public.lead_qualification.detected_needs_financing IS
  'TRUE quando cliente sinalizou explicitamente que precisa financiar (entrada, FGTS, MCMV, "preciso financiar"). Usado pra filtrar accepts_financing=false na busca.';

-- ========== PROPERTIES.ACCEPTS_FINANCING ==========

ALTER TABLE public.properties
  ADD COLUMN IF NOT EXISTS accepts_financing BOOLEAN;

COMMENT ON COLUMN public.properties.accepts_financing IS
  'TRUE = cliente pode financiar (descrição Vista menciona positivamente); FALSE = "NÃO ACEITA FINANCIAMENTO"; NULL = não declarado. Backfill regex em 2026-04-28.';

-- Backfill: NEGATIVO vence (mais conservador). Se descrição diz "não aceita",
-- mesmo se também diz "aceita financiamento" em outro lugar, fica false.
UPDATE public.properties
SET accepts_financing = FALSE
WHERE finalidade IN ('venda', 'ambos')
  AND is_active = true
  AND description ~* '(n[ãa]o\s+aceita\s+financ|n[ãa]o\s+[ée]\s+poss[íi]vel\s+financ|sem\s+possibilidade\s+de\s+financ|somente\s+[àa]\s+vista|apenas\s+[àa]\s+vista|venda\s+[àa]\s+vista)';

UPDATE public.properties
SET accepts_financing = TRUE
WHERE finalidade IN ('venda', 'ambos')
  AND is_active = true
  AND accepts_financing IS NULL  -- não sobrescreve negativo já marcado
  AND description ~* '(aceita\s+financ|pass[íi]vel\s+de\s+financ|financi[áa]vel|possibilidade\s+de\s+financ|com\s+financ|financ\w*\s+banc[áa]rio|usa\s+fgts|aceita\s+fgts|com\s+fgts|mcmv|minha\s+casa\s+minha\s+vida|entrada\s+\d+%?\s*[,e\s]+restante\s+financ)';

CREATE INDEX IF NOT EXISTS idx_properties_accepts_financing
  ON public.properties(tenant_id, accepts_financing)
  WHERE is_active = true AND finalidade IN ('venda', 'ambos');

-- ========== RPC: match_properties (vector) ==========

DROP FUNCTION IF EXISTS public.match_properties(extensions.vector, uuid, double precision, integer, numeric, text, text, integer, text);
DROP FUNCTION IF EXISTS public.match_properties(extensions.vector, uuid, double precision, integer, numeric, text, text, integer, text, boolean);

CREATE OR REPLACE FUNCTION public.match_properties(
  query_embedding extensions.vector(1536),
  match_tenant_id uuid,
  match_threshold double precision,
  match_count integer,
  filter_max_price numeric DEFAULT NULL,
  filter_tipo text DEFAULT NULL,
  filter_neighborhood text DEFAULT NULL,
  filter_bedrooms integer DEFAULT NULL,
  filter_finalidade text DEFAULT NULL,
  filter_needs_financing boolean DEFAULT NULL
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
  finalidade text,
  accepts_financing boolean
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
    p.finalidade::text,
    p.accepts_financing
  FROM public.properties p
  WHERE p.tenant_id = match_tenant_id
    AND p.is_active = true
    AND p.embedding IS NOT NULL
    AND 1 - (p.embedding <=> query_embedding) > match_threshold
    AND (filter_tipo IS NULL OR COALESCE(p.raw_data->>'Categoria', p.title) ILIKE '%' || filter_tipo || '%')
    AND (filter_neighborhood IS NULL OR p.neighborhood ILIKE '%' || filter_neighborhood || '%')
    AND (filter_bedrooms IS NULL OR p.bedrooms >= filter_bedrooms)
    AND (
      filter_finalidade IS NULL
      OR (filter_finalidade = 'venda' AND p.finalidade IN ('venda','ambos'))
      OR (filter_finalidade = 'locacao' AND p.finalidade IN ('locacao','ambos'))
      OR (filter_finalidade NOT IN ('venda','locacao'))
    )
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
    -- Filtro de financiamento: quando true, exclui só os explícitos NÃO ACEITA;
    -- mantém TRUE e NULL (NULL = "não declarado" — conservador, melhor mostrar
    -- e qualificar do que esconder demais).
    AND (
      filter_needs_financing IS NOT TRUE
      OR p.accepts_financing IS NOT FALSE
    )
  ORDER BY p.embedding <=> query_embedding
  LIMIT match_count;
END;
$function$;

-- ========== RPC: match_properties_no_embedding (SQL fallback) ==========

DROP FUNCTION IF EXISTS public.match_properties_no_embedding(uuid, integer, numeric, text, text, integer, text);
DROP FUNCTION IF EXISTS public.match_properties_no_embedding(uuid, integer, numeric, text, text, integer, text, boolean);

CREATE OR REPLACE FUNCTION public.match_properties_no_embedding(
  match_tenant_id uuid,
  match_count integer,
  filter_max_price numeric DEFAULT NULL,
  filter_tipo text DEFAULT NULL,
  filter_neighborhood text DEFAULT NULL,
  filter_bedrooms integer DEFAULT NULL,
  filter_finalidade text DEFAULT NULL,
  filter_needs_financing boolean DEFAULT NULL
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
  finalidade text,
  accepts_financing boolean
)
LANGUAGE plpgsql
AS $function$
DECLARE
  neighborhood_list text[];
BEGIN
  IF filter_neighborhood IS NOT NULL AND filter_neighborhood != '' THEN
    neighborhood_list := string_to_array(filter_neighborhood, ',');
    neighborhood_list := ARRAY(SELECT trim(unnest(neighborhood_list)));
  ELSE
    neighborhood_list := NULL;
  END IF;

  RETURN QUERY
  SELECT
    p.id,
    p.external_id::text,
    p.title::text,
    p.description,
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
    1.0::float as similarity,
    p.latitude,
    p.longitude,
    p.finalidade::text,
    p.accepts_financing
  FROM public.properties p
  WHERE p.tenant_id = match_tenant_id
    AND p.is_active = true
    AND (filter_tipo IS NULL OR COALESCE(p.raw_data->>'Categoria', p.title) ILIKE '%' || filter_tipo || '%')
    AND (
      neighborhood_list IS NULL
      OR EXISTS (
        SELECT 1 FROM unnest(neighborhood_list) nb
        WHERE p.neighborhood ILIKE '%' || nb || '%'
      )
    )
    AND (filter_bedrooms IS NULL OR p.bedrooms >= filter_bedrooms)
    AND (
      filter_finalidade IS NULL
      OR (filter_finalidade = 'venda' AND p.finalidade IN ('venda','ambos'))
      OR (filter_finalidade = 'locacao' AND p.finalidade IN ('locacao','ambos'))
      OR (filter_finalidade NOT IN ('venda','locacao'))
    )
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
    AND (
      filter_needs_financing IS NOT TRUE
      OR p.accepts_financing IS NOT FALSE
    )
  ORDER BY
    (p.raw_data->>'FotoDestaque' IS NOT NULL) DESC,
    CASE
      WHEN filter_finalidade = 'locacao' THEN COALESCE(p.price_rental, p.price)
      ELSE p.price
    END ASC NULLS LAST
  LIMIT match_count;
END;
$function$;
