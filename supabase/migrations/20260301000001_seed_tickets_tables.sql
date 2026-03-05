-- ============================================================
-- AIMEE.iA v2 - Seed Tickets Tables
-- Creates default ticket categories and stages for existing and future tenants
-- ============================================================

-- 1. Insert default stages for existing tenants
INSERT INTO public.ticket_stages (tenant_id, name, color, order_index, is_terminal)
SELECT t.id, 'Novo', '#3B82F6', 0, false 
FROM public.tenants t
WHERE NOT EXISTS (
  SELECT 1 FROM public.ticket_stages ts 
  WHERE ts.tenant_id = t.id AND ts.name = 'Novo'
);

INSERT INTO public.ticket_stages (tenant_id, name, color, order_index, is_terminal)
SELECT t.id, 'Em Atendimento', '#F59E0B', 1, false 
FROM public.tenants t
WHERE NOT EXISTS (
  SELECT 1 FROM public.ticket_stages ts 
  WHERE ts.tenant_id = t.id AND ts.name = 'Em Atendimento'
);

INSERT INTO public.ticket_stages (tenant_id, name, color, order_index, is_terminal)
SELECT t.id, 'Resolvido', '#10B981', 2, true 
FROM public.tenants t
WHERE NOT EXISTS (
  SELECT 1 FROM public.ticket_stages ts 
  WHERE ts.tenant_id = t.id AND ts.name = 'Resolvido'
);

-- 2. Insert default categories for existing tenants
INSERT INTO public.ticket_categories (tenant_id, name, description, sla_hours, is_active)
SELECT t.id, 'Manutenção', 'Problemas estruturais, elétricos, hidráulicos, etc.', 48, true
FROM public.tenants t
WHERE NOT EXISTS (
  SELECT 1 FROM public.ticket_categories tc
  WHERE tc.tenant_id = t.id AND tc.name = 'Manutenção'
);

INSERT INTO public.ticket_categories (tenant_id, name, description, sla_hours, is_active)
SELECT t.id, 'Financeiro', 'Boletos, repasses, reajustes, cobranças.', 24, true
FROM public.tenants t
WHERE NOT EXISTS (
  SELECT 1 FROM public.ticket_categories tc
  WHERE tc.tenant_id = t.id AND tc.name = 'Financeiro'
);

INSERT INTO public.ticket_categories (tenant_id, name, description, sla_hours, is_active)
SELECT t.id, 'Dúvidas e Solicitações', 'Dúvidas em geral, segunda via de documentos, etc.', 72, true
FROM public.tenants t
WHERE NOT EXISTS (
  SELECT 1 FROM public.ticket_categories tc
  WHERE tc.tenant_id = t.id AND tc.name = 'Dúvidas e Solicitações'
);

-- 3. Create function and trigger for new tenant setup
CREATE OR REPLACE FUNCTION public.handle_new_tenant_tickets_setup()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Insert default ticket stages
  INSERT INTO public.ticket_stages (tenant_id, name, color, order_index, is_terminal)
  VALUES 
    (NEW.id, 'Novo', '#3B82F6', 0, false),
    (NEW.id, 'Em Atendimento', '#F59E0B', 1, false),
    (NEW.id, 'Resolvido', '#10B981', 2, true);

  -- Insert default ticket categories
  INSERT INTO public.ticket_categories (tenant_id, name, description, sla_hours, is_active)
  VALUES 
    (NEW.id, 'Manutenção', 'Problemas estruturais, elétricos, hidráulicos, etc.', 48, true),
    (NEW.id, 'Financeiro', 'Boletos, repasses, reajustes, cobranças.', 24, true),
    (NEW.id, 'Dúvidas e Solicitações', 'Dúvidas em geral, segunda via de documentos, etc.', 72, true);

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_tenant_created_tickets_setup ON public.tenants;
CREATE TRIGGER on_tenant_created_tickets_setup
  AFTER INSERT ON public.tenants
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_tenant_tickets_setup();
