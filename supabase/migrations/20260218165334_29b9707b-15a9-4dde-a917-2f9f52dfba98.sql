
-- ========== SEED: DEFAULT PIPELINE STAGES ==========
-- Delete existing stages for this tenant to avoid duplicates
DELETE FROM public.conversation_stages WHERE tenant_id = 'a0000000-0000-0000-0000-000000000001';

-- Locação (6 stages)
INSERT INTO public.conversation_stages (tenant_id, department_code, name, order_index, color) VALUES
  ('a0000000-0000-0000-0000-000000000001', 'locacao', 'Novo Lead', 0, '#3498db'),
  ('a0000000-0000-0000-0000-000000000001', 'locacao', 'Qualificação', 1, '#f39c12'),
  ('a0000000-0000-0000-0000-000000000001', 'locacao', 'Visita Agendada', 2, '#9b59b6'),
  ('a0000000-0000-0000-0000-000000000001', 'locacao', 'Proposta', 3, '#e67e22'),
  ('a0000000-0000-0000-0000-000000000001', 'locacao', 'Contrato', 4, '#1abc9c'),
  ('a0000000-0000-0000-0000-000000000001', 'locacao', 'Fechado', 5, '#27ae60');

-- Vendas (5 stages)
INSERT INTO public.conversation_stages (tenant_id, department_code, name, order_index, color) VALUES
  ('a0000000-0000-0000-0000-000000000001', 'vendas', 'Novo Lead', 0, '#3498db'),
  ('a0000000-0000-0000-0000-000000000001', 'vendas', 'Qualificação', 1, '#f39c12'),
  ('a0000000-0000-0000-0000-000000000001', 'vendas', 'Visita Agendada', 2, '#9b59b6'),
  ('a0000000-0000-0000-0000-000000000001', 'vendas', 'Encaminhado C2S', 3, '#1abc9c'),
  ('a0000000-0000-0000-0000-000000000001', 'vendas', 'Fechado', 4, '#27ae60');

-- Administrativo (3 stages)
INSERT INTO public.conversation_stages (tenant_id, department_code, name, order_index, color) VALUES
  ('a0000000-0000-0000-0000-000000000001', 'administrativo', 'Novo', 0, '#3498db'),
  ('a0000000-0000-0000-0000-000000000001', 'administrativo', 'Em Andamento', 1, '#f39c12'),
  ('a0000000-0000-0000-0000-000000000001', 'administrativo', 'Resolvido', 2, '#2ecc71');
