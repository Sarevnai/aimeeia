-- Política comercial: piso mínimo de locação por tenant.
-- Smolka começa em R$ 4.000/mês (locações abaixo são gentilmente recusadas pela Aimee).
-- NULL = sem piso (Aimee aceita todos os leads de locação).

ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS min_rental_budget NUMERIC;

COMMENT ON COLUMN public.tenants.min_rental_budget IS 'Piso mínimo de orçamento mensal (R$/mês) para a Aimee aceitar lead de locação. Leads abaixo são gentilmente recusados sem qualificação. NULL = sem piso (aceita todos).';

UPDATE public.tenants
  SET min_rental_budget = 4000
  WHERE id = 'a0000000-0000-0000-0000-000000000001';
