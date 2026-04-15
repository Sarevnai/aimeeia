-- ========================================================================
-- Sincronização conversation_stages ↔ contacts.crm_status
--
-- (b) Cria 4 stages canônicas (Novo/Em negociação/Negócio fechado/Arquivado)
--     por departamento (vendas/locacao) para todos os tenants que ainda
--     não tenham stages configuradas.
-- (b) UPDATE em massa conversations.stage_id baseado no crm_status atual.
-- (c) Trigger que mantém conversations.stage_id sincronizado sempre que
--     contacts.crm_status muda (bidirecional: import, drag no pipeline C2S,
--     c2s-create-lead, etc).
-- ========================================================================

-- Idempotent stages upsert (por tenant + department + name)
DO $$
DECLARE
  t_id uuid;
  stage_defs record;
  dept text;
BEGIN
  FOR t_id IN SELECT id FROM public.tenants LOOP
    FOR dept IN SELECT unnest(ARRAY['vendas','locacao']) LOOP
      FOR stage_defs IN
        SELECT * FROM (VALUES
          ('Novo', 1, '#3b82f6'),
          ('Em negociação', 2, '#eab308'),
          ('Negócio fechado', 3, '#22c55e'),
          ('Arquivado', 4, '#94a3b8')
        ) AS s(name, order_index, color)
      LOOP
        INSERT INTO public.conversation_stages (tenant_id, department_code, name, order_index, color)
        SELECT t_id, dept::public.department_type, stage_defs.name, stage_defs.order_index, stage_defs.color
        WHERE NOT EXISTS (
          SELECT 1 FROM public.conversation_stages
          WHERE tenant_id = t_id
            AND department_code = dept::public.department_type
            AND name = stage_defs.name
        );
      END LOOP;
    END LOOP;
  END LOOP;
END $$;

-- ========================================================================
-- Trigger de sincronização
-- ========================================================================

CREATE OR REPLACE FUNCTION public.sync_conversation_stage_from_crm_status()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.crm_status IS NOT NULL AND NEW.crm_status IS DISTINCT FROM OLD.crm_status THEN
    UPDATE public.conversations c
    SET stage_id = (
      SELECT s.id
      FROM public.conversation_stages s
      WHERE s.tenant_id = NEW.tenant_id
        AND s.name = NEW.crm_status
        AND (s.department_code = c.department_code OR s.department_code IS NULL)
      ORDER BY (s.department_code = c.department_code) DESC NULLS LAST, s.order_index
      LIMIT 1
    )
    WHERE c.contact_id = NEW.id
      AND c.tenant_id = NEW.tenant_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_sync_conv_stage_from_crm ON public.contacts;
CREATE TRIGGER trg_sync_conv_stage_from_crm
  AFTER UPDATE OF crm_status ON public.contacts
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_conversation_stage_from_crm_status();

-- ========================================================================
-- Backfill: aplicar em todas as conversations existentes
-- ========================================================================

UPDATE public.conversations c
SET stage_id = s.id
FROM public.contacts ct,
     public.conversation_stages s
WHERE c.contact_id = ct.id
  AND c.tenant_id = ct.tenant_id
  AND s.tenant_id = ct.tenant_id
  AND s.name = ct.crm_status
  AND (s.department_code = c.department_code OR s.department_code IS NULL)
  AND ct.crm_status IS NOT NULL;

COMMENT ON FUNCTION public.sync_conversation_stage_from_crm_status() IS
  'Mantém conversations.stage_id alinhado com contacts.crm_status (Novo/Em negociação/Arquivado/Negócio fechado)';
