-- Broker WhatsApp message templates
CREATE TABLE IF NOT EXISTS public.broker_wa_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  profile_id uuid REFERENCES profiles(id),  -- NULL = template padrão do tenant
  label text NOT NULL,
  icon text DEFAULT '💬',
  text_template text NOT NULL,
  sort_order int DEFAULT 0,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.broker_wa_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "broker_wa_templates_select" ON public.broker_wa_templates
  FOR SELECT USING (
    tenant_id = get_user_tenant_id()
    AND (profile_id IS NULL OR profile_id = auth.uid())
  );

CREATE POLICY "broker_wa_templates_insert" ON public.broker_wa_templates
  FOR INSERT WITH CHECK (
    tenant_id = get_user_tenant_id()
    AND profile_id = auth.uid()
  );

CREATE POLICY "broker_wa_templates_update" ON public.broker_wa_templates
  FOR UPDATE USING (
    tenant_id = get_user_tenant_id()
    AND profile_id = auth.uid()
  );

CREATE POLICY "broker_wa_templates_delete" ON public.broker_wa_templates
  FOR DELETE USING (
    tenant_id = get_user_tenant_id()
    AND profile_id = auth.uid()
  );

CREATE POLICY "broker_wa_templates_admin" ON public.broker_wa_templates
  FOR ALL USING (
    tenant_id = get_user_tenant_id()
    AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'super_admin'))
  );

CREATE INDEX idx_broker_wa_templates_tenant ON public.broker_wa_templates(tenant_id, profile_id);
