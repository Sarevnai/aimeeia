-- ========================================================================
-- Broker linking: Vista ↔ C2S ↔ Aimee
-- Canonical brokers table, populated by sync-brokers edge function.
-- Backfilled to contacts.assigned_broker_id for RLS + panel filtering.
-- ========================================================================

CREATE TABLE IF NOT EXISTS public.brokers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,

  full_name text NOT NULL,
  email text,
  phone text,
  team text,

  -- C2S (primary source — richer data)
  c2s_seller_id text,
  c2s_external_id text,
  c2s_is_master boolean DEFAULT false,
  c2s_payload jsonb,

  -- Vista (validates external_id == Codigo)
  vista_codigo text,
  vista_nome text,

  -- Aimee (optional local login)
  profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,

  active boolean NOT NULL DEFAULT true,
  last_synced_c2s timestamptz,
  last_synced_vista timestamptz,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT brokers_tenant_c2s_unique UNIQUE (tenant_id, c2s_seller_id)
);

CREATE INDEX IF NOT EXISTS idx_brokers_tenant ON public.brokers(tenant_id);
CREATE INDEX IF NOT EXISTS idx_brokers_email ON public.brokers(tenant_id, lower(email));
CREATE INDEX IF NOT EXISTS idx_brokers_vista_codigo ON public.brokers(tenant_id, vista_codigo);
CREATE INDEX IF NOT EXISTS idx_brokers_profile ON public.brokers(profile_id);

ALTER TABLE public.brokers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "brokers_tenant_read" ON public.brokers
  FOR SELECT TO authenticated
  USING (tenant_id = public.get_user_tenant_id() OR public.is_super_admin());

CREATE POLICY "brokers_tenant_admin_write" ON public.brokers
  FOR ALL TO authenticated
  USING (
    tenant_id = public.get_user_tenant_id()
    AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin','super_admin'))
  )
  WITH CHECK (
    tenant_id = public.get_user_tenant_id()
    AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin','super_admin'))
  );

CREATE TRIGGER brokers_updated_at
  BEFORE UPDATE ON public.brokers
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ========================================================================
-- Link contacts to broker + store C2S lead IDs
-- ========================================================================

ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS assigned_broker_id uuid REFERENCES public.brokers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS c2s_lead_id text,
  ADD COLUMN IF NOT EXISTS c2s_lead_internal_id bigint,
  ADD COLUMN IF NOT EXISTS c2s_lead_synced_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_contacts_broker ON public.contacts(assigned_broker_id);
CREATE INDEX IF NOT EXISTS idx_contacts_c2s_lead ON public.contacts(tenant_id, c2s_lead_id);

-- ========================================================================
-- Mirror on conversations (for RLS per broker on the panel)
-- ========================================================================

ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS assigned_broker_id uuid REFERENCES public.brokers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS c2s_lead_id text;

CREATE INDEX IF NOT EXISTS idx_conversations_broker ON public.conversations(assigned_broker_id);

COMMENT ON TABLE public.brokers IS 'Canonical broker table per tenant, merged from C2S sellers + Vista corretores';
COMMENT ON COLUMN public.brokers.c2s_external_id IS 'C2S external_id, expected to equal Vista Codigo when aligned';
COMMENT ON COLUMN public.contacts.assigned_broker_id IS 'Broker currently owning this contact in C2S';
