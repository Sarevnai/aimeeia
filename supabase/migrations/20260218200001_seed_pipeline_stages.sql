-- ============================================================
-- AIMEE.iA v2 - Seed Pipeline Stages
-- Default conversation stages for each department
-- ============================================================

-- Locação pipeline
INSERT INTO public.conversation_stages (tenant_id, department_code, name, order_index, color) VALUES
  ('a0000000-0000-0000-0000-000000000001', 'locacao', 'Novo Lead', 0, '#3B82F6'),
  ('a0000000-0000-0000-0000-000000000001', 'locacao', 'Qualificando', 1, '#F59E0B'),
  ('a0000000-0000-0000-0000-000000000001', 'locacao', 'Buscando Imóvel', 2, '#8B5CF6'),
  ('a0000000-0000-0000-0000-000000000001', 'locacao', 'Visita Agendada', 3, '#10B981'),
  ('a0000000-0000-0000-0000-000000000001', 'locacao', 'Proposta', 4, '#EF4444'),
  ('a0000000-0000-0000-0000-000000000001', 'locacao', 'Fechado', 5, '#059669');

-- Vendas pipeline
INSERT INTO public.conversation_stages (tenant_id, department_code, name, order_index, color) VALUES
  ('a0000000-0000-0000-0000-000000000001', 'vendas', 'Novo Lead', 0, '#3B82F6'),
  ('a0000000-0000-0000-0000-000000000001', 'vendas', 'Qualificando', 1, '#F59E0B'),
  ('a0000000-0000-0000-0000-000000000001', 'vendas', 'Apresentação', 2, '#8B5CF6'),
  ('a0000000-0000-0000-0000-000000000001', 'vendas', 'Negociação', 3, '#10B981'),
  ('a0000000-0000-0000-0000-000000000001', 'vendas', 'Fechado', 4, '#059669');

-- Administrativo pipeline
INSERT INTO public.conversation_stages (tenant_id, department_code, name, order_index, color) VALUES
  ('a0000000-0000-0000-0000-000000000001', 'administrativo', 'Novo', 0, '#3B82F6'),
  ('a0000000-0000-0000-0000-000000000001', 'administrativo', 'Em Andamento', 1, '#F59E0B'),
  ('a0000000-0000-0000-0000-000000000001', 'administrativo', 'Resolvido', 2, '#059669');
