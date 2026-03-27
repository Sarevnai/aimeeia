-- ============================================================
-- Add 'remarketing' as a first-class department
-- ============================================================

-- 1. Add 'remarketing' to department_type enum
ALTER TYPE public.department_type ADD VALUE IF NOT EXISTS 'remarketing';

-- 2. Seed remarketing pipeline stages
INSERT INTO public.conversation_stages (tenant_id, department_code, name, order_index, color) VALUES
  ('a0000000-0000-0000-0000-000000000001', 'remarketing', 'Novo Lead', 0, '#3B82F6'),
  ('a0000000-0000-0000-0000-000000000001', 'remarketing', 'VIP Pitch', 1, '#8B5CF6'),
  ('a0000000-0000-0000-0000-000000000001', 'remarketing', 'Requalificação', 2, '#F59E0B'),
  ('a0000000-0000-0000-0000-000000000001', 'remarketing', 'Handoff', 3, '#10B981'),
  ('a0000000-0000-0000-0000-000000000001', 'remarketing', 'Fechado', 4, '#059669'),
  ('a0000000-0000-0000-0000-000000000001', 'remarketing', 'Perdido', 5, '#EF4444');

-- 3. Backfill existing remarketing conversations
UPDATE public.conversations
SET department_code = 'remarketing'
WHERE source = 'remarketing' AND (department_code = 'vendas' OR department_code IS NULL);

UPDATE public.contacts c
SET department_code = 'remarketing'
FROM public.conversations conv
WHERE conv.contact_id = c.id
  AND conv.source = 'remarketing'
  AND conv.department_code = 'remarketing';

UPDATE public.messages m
SET department_code = 'remarketing'
FROM public.conversations conv
WHERE m.conversation_id = conv.id
  AND conv.source = 'remarketing'
  AND conv.department_code = 'remarketing';
