-- Sprint Locação v1: campos de qualificação pré-visita específicos de locação
-- Não inclui campos de garantia (seguro fiança/credpago/fiador/título) — esses entram na v2 pós-visita.

ALTER TABLE public.lead_qualification
  ADD COLUMN IF NOT EXISTS detected_income_monthly NUMERIC,
  ADD COLUMN IF NOT EXISTS detected_has_pets BOOLEAN,
  ADD COLUMN IF NOT EXISTS detected_pet_type TEXT,
  ADD COLUMN IF NOT EXISTS detected_move_in_date DATE;

COMMENT ON COLUMN public.lead_qualification.detected_income_monthly IS 'Renda mensal aproximada informada pelo cliente (R$/mês). Coletada na finalização pré-handoff em locação.';
COMMENT ON COLUMN public.lead_qualification.detected_has_pets IS 'Cliente possui pets? Importante porque alguns imóveis não aceitam.';
COMMENT ON COLUMN public.lead_qualification.detected_pet_type IS 'Tipo de pet (cachorro pequeno/médio/grande, gato, outros). Texto livre.';
COMMENT ON COLUMN public.lead_qualification.detected_move_in_date IS 'Data alvo de mudança real (não bucket). Ex: 2026-05-30.';
