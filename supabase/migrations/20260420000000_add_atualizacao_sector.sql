-- ============================================================
-- Sprint 6.2 — Setor Atualização (gestão ativa da carteira ADM)
-- ============================================================
-- Adiciona:
--  1. Valor 'atualizacao' no enum department_type
--  2. Kill-switch + rate limit por tenant
--  3. Classificação ADM em properties
--  4. Fila de atualização priorizada
--  5. Audit log de mutations Vista
-- ============================================================

-- 1. Novo setor
ALTER TYPE public.department_type ADD VALUE IF NOT EXISTS 'atualizacao';

-- 2. Kill-switch + rate limit por tenant (defaults conforme decisão: OFF, 50/dia)
ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS atualizacao_auto_execute boolean NOT NULL DEFAULT false;

ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS atualizacao_max_daily_sends integer NOT NULL DEFAULT 50;

-- 3. Classificação do imóvel (ADM vs broker vs owner_direct)
ALTER TABLE public.properties
  ADD COLUMN IF NOT EXISTS management_type text
  CHECK (management_type IS NULL OR management_type IN ('broker', 'adm', 'owner_direct'));

ALTER TABLE public.properties
  ADD COLUMN IF NOT EXISTS last_availability_check_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_properties_management_type
  ON public.properties(tenant_id, management_type)
  WHERE is_active = true;

-- 4. Fila priorizada
CREATE TABLE IF NOT EXISTS public.property_update_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  property_id uuid NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  property_code text NOT NULL,
  priority_score integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'in_progress', 'done', 'skipped', 'error')),
  next_contact_at timestamptz,
  last_attempted_at timestamptz,
  cycle_count integer NOT NULL DEFAULT 0,
  last_outcome text,
  conversation_id uuid REFERENCES public.conversations(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Um imóvel só pode ter uma entry ativa na fila por tenant
CREATE UNIQUE INDEX IF NOT EXISTS idx_property_update_queue_active_unique
  ON public.property_update_queue(tenant_id, property_id)
  WHERE status IN ('pending', 'in_progress');

CREATE INDEX IF NOT EXISTS idx_property_update_queue_ready
  ON public.property_update_queue(tenant_id, status, priority_score DESC, next_contact_at)
  WHERE status = 'pending';

-- Trigger updated_at
CREATE OR REPLACE FUNCTION public.tg_property_update_queue_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_updated_at_property_update_queue ON public.property_update_queue;
CREATE TRIGGER set_updated_at_property_update_queue
  BEFORE UPDATE ON public.property_update_queue
  FOR EACH ROW EXECUTE FUNCTION public.tg_property_update_queue_updated_at();

-- RLS
ALTER TABLE public.property_update_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation_property_update_queue"
  ON public.property_update_queue
  FOR ALL
  USING (tenant_id = public.get_user_tenant_id() OR public.is_super_admin());

-- 5. Audit log de mutations Vista
CREATE TABLE IF NOT EXISTS public.vista_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  property_code text NOT NULL,
  property_id uuid REFERENCES public.properties(id) ON DELETE SET NULL,
  action text NOT NULL,
  old_value jsonb,
  new_value jsonb,
  reason text,
  conversation_id uuid REFERENCES public.conversations(id) ON DELETE SET NULL,
  executed boolean NOT NULL DEFAULT false,
  vista_response jsonb,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_vista_audit_log_tenant_property
  ON public.vista_audit_log(tenant_id, property_code, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_vista_audit_log_conversation
  ON public.vista_audit_log(conversation_id)
  WHERE conversation_id IS NOT NULL;

ALTER TABLE public.vista_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation_vista_audit_log"
  ON public.vista_audit_log
  FOR ALL
  USING (tenant_id = public.get_user_tenant_id() OR public.is_super_admin());

-- ============================================================
-- Fim da migration
-- ============================================================
