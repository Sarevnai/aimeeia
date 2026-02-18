
-- ========== RLS POLICIES: MULTI-TENANT ISOLATION ==========
-- Tables missing tenant isolation: ai_error_log, portal_leads_log, tenants, whatsapp_templates

-- 1. whatsapp_templates
ALTER TABLE public.whatsapp_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tenant_isolation" ON public.whatsapp_templates;
CREATE POLICY "tenant_isolation"
  ON public.whatsapp_templates
  AS RESTRICTIVE
  FOR ALL
  TO authenticated
  USING (tenant_id = get_user_tenant_id());

-- 2. portal_leads_log
DROP POLICY IF EXISTS "tenant_isolation" ON public.portal_leads_log;
CREATE POLICY "tenant_isolation"
  ON public.portal_leads_log
  AS RESTRICTIVE
  FOR ALL
  TO authenticated
  USING (tenant_id = get_user_tenant_id());

-- 3. ai_error_log
DROP POLICY IF EXISTS "tenant_isolation" ON public.ai_error_log;
CREATE POLICY "tenant_isolation"
  ON public.ai_error_log
  AS RESTRICTIVE
  FOR ALL
  TO authenticated
  USING (tenant_id = get_user_tenant_id());

-- 4. tenants - users can only read their own tenant
ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tenant_isolation" ON public.tenants;
CREATE POLICY "tenant_isolation"
  ON public.tenants
  AS RESTRICTIVE
  FOR ALL
  TO authenticated
  USING (id = get_user_tenant_id());
