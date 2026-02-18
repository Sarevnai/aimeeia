
-- ========== SEED: DEFAULT PIPELINE STAGES ==========
-- Inserts default conversation_stages for each department per tenant.
-- Uses a DO block to avoid duplicates.

DO $$
DECLARE
  t RECORD;
BEGIN
  FOR t IN SELECT id FROM public.tenants LOOP
    -- Vendas stages
    INSERT INTO public.conversation_stages (tenant_id, department_code, name, order_index, color)
    VALUES
      (t.id, 'vendas', 'Novo Lead', 0, '#3498db'),
      (t.id, 'vendas', 'Em Qualificação', 1, '#f39c12'),
      (t.id, 'vendas', 'Qualificado', 2, '#2ecc71'),
      (t.id, 'vendas', 'Visita Agendada', 3, '#9b59b6'),
      (t.id, 'vendas', 'Proposta Enviada', 4, '#e67e22'),
      (t.id, 'vendas', 'Encaminhado C2S', 5, '#1abc9c'),
      (t.id, 'vendas', 'Fechado', 6, '#27ae60'),
      (t.id, 'vendas', 'Perdido', 7, '#e74c3c'),
      -- Locação stages
      (t.id, 'locacao', 'Novo Lead', 0, '#3498db'),
      (t.id, 'locacao', 'Em Qualificação', 1, '#f39c12'),
      (t.id, 'locacao', 'Qualificado', 2, '#2ecc71'),
      (t.id, 'locacao', 'Visita Agendada', 3, '#9b59b6'),
      (t.id, 'locacao', 'Documentação', 4, '#e67e22'),
      (t.id, 'locacao', 'Contrato', 5, '#1abc9c'),
      (t.id, 'locacao', 'Fechado', 6, '#27ae60'),
      (t.id, 'locacao', 'Perdido', 7, '#e74c3c'),
      -- Administrativo stages
      (t.id, 'administrativo', 'Novo', 0, '#3498db'),
      (t.id, 'administrativo', 'Em Andamento', 1, '#f39c12'),
      (t.id, 'administrativo', 'Resolvido', 2, '#2ecc71'),
      (t.id, 'administrativo', 'Arquivado', 3, '#95a5a6')
    ON CONFLICT DO NOTHING;
  END LOOP;
END $$;

-- Fix get_user_tenant_id search_path for security
CREATE OR REPLACE FUNCTION public.get_user_tenant_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT tenant_id FROM profiles WHERE id = auth.uid()
$$;
