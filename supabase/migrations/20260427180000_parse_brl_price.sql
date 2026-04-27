CREATE OR REPLACE FUNCTION public.parse_brl_price(s text) RETURNS numeric AS $$
DECLARE
  cleaned text;
  has_comma boolean;
  has_dot boolean;
  result numeric;
BEGIN
  IF s IS NULL OR TRIM(s) = '' OR TRIM(s) = '0' THEN RETURN NULL; END IF;
  IF s ~ '\d+\s*-\s*\d+' THEN RETURN NULL; END IF;
  cleaned := regexp_replace(s, '[Rr]\$\s*', '', 'g');
  cleaned := regexp_replace(cleaned, '/m[eê]s', '', 'gi');
  cleaned := regexp_replace(cleaned, '\s', '', 'g');
  IF cleaned !~ '^[0-9.,]+$' THEN RETURN NULL; END IF;
  has_comma := cleaned ~ ',';
  has_dot := cleaned ~ '\.';
  IF has_comma AND has_dot THEN
    cleaned := replace(cleaned, '.', '');
    cleaned := replace(cleaned, ',', '.');
  ELSIF has_comma THEN
    cleaned := replace(cleaned, ',', '.');
  ELSIF has_dot THEN
    IF cleaned ~ '^\d{1,3}(\.\d{3})+$' THEN
      cleaned := replace(cleaned, '.', '');
    END IF;
  END IF;
  BEGIN
    result := cleaned::numeric;
  EXCEPTION WHEN OTHERS THEN
    RETURN NULL;
  END;
  IF result < 100 OR result > 100000000 THEN RETURN NULL; END IF;
  RETURN result;
END;
$$ LANGUAGE plpgsql IMMUTABLE;
