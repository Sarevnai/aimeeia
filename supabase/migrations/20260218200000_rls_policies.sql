-- ============================================================
-- AIMEE.iA v2 - RLS Policies
-- Multi-tenant isolation: every query filters by tenant_id
-- ============================================================

-- Enable RLS on all tables
ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversation_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversation_stages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_qualification ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.developments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaign_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_agent_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_department_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_directives ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.regions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_error_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.portal_leads_log ENABLE ROW LEVEL SECURITY;

-- Helper function: get tenant_id for current user
CREATE OR REPLACE FUNCTION public.get_user_tenant_id()
RETURNS UUID AS $$
  SELECT tenant_id FROM public.profiles WHERE id = auth.uid()
$$ LANGUAGE SQL SECURITY DEFINER STABLE;

-- ==================== TENANT-SCOPED POLICIES ====================
-- Pattern: authenticated users can CRUD rows matching their tenant_id

-- profiles
CREATE POLICY "Users can view own tenant profiles" ON public.profiles
  FOR SELECT TO authenticated
  USING (tenant_id = public.get_user_tenant_id());

CREATE POLICY "Users can update own profile" ON public.profiles
  FOR UPDATE TO authenticated
  USING (id = auth.uid());

-- contacts
CREATE POLICY "Tenant isolation for contacts" ON public.contacts
  FOR ALL TO authenticated
  USING (tenant_id = public.get_user_tenant_id())
  WITH CHECK (tenant_id = public.get_user_tenant_id());

-- conversations
CREATE POLICY "Tenant isolation for conversations" ON public.conversations
  FOR ALL TO authenticated
  USING (tenant_id = public.get_user_tenant_id())
  WITH CHECK (tenant_id = public.get_user_tenant_id());

-- messages
CREATE POLICY "Tenant isolation for messages" ON public.messages
  FOR ALL TO authenticated
  USING (tenant_id = public.get_user_tenant_id())
  WITH CHECK (tenant_id = public.get_user_tenant_id());

-- conversation_states
CREATE POLICY "Tenant isolation for conversation_states" ON public.conversation_states
  FOR ALL TO authenticated
  USING (tenant_id = public.get_user_tenant_id())
  WITH CHECK (tenant_id = public.get_user_tenant_id());

-- conversation_stages
CREATE POLICY "Tenant isolation for conversation_stages" ON public.conversation_stages
  FOR ALL TO authenticated
  USING (tenant_id = public.get_user_tenant_id())
  WITH CHECK (tenant_id = public.get_user_tenant_id());

-- lead_qualification
CREATE POLICY "Tenant isolation for lead_qualification" ON public.lead_qualification
  FOR ALL TO authenticated
  USING (tenant_id = public.get_user_tenant_id())
  WITH CHECK (tenant_id = public.get_user_tenant_id());

-- developments
CREATE POLICY "Tenant isolation for developments" ON public.developments
  FOR ALL TO authenticated
  USING (tenant_id = public.get_user_tenant_id())
  WITH CHECK (tenant_id = public.get_user_tenant_id());

-- campaigns
CREATE POLICY "Tenant isolation for campaigns" ON public.campaigns
  FOR ALL TO authenticated
  USING (tenant_id = public.get_user_tenant_id())
  WITH CHECK (tenant_id = public.get_user_tenant_id());

-- campaign_results
CREATE POLICY "Tenant isolation for campaign_results" ON public.campaign_results
  FOR ALL TO authenticated
  USING (tenant_id = public.get_user_tenant_id())
  WITH CHECK (tenant_id = public.get_user_tenant_id());

-- whatsapp_templates
CREATE POLICY "Tenant isolation for whatsapp_templates" ON public.whatsapp_templates
  FOR ALL TO authenticated
  USING (tenant_id = public.get_user_tenant_id())
  WITH CHECK (tenant_id = public.get_user_tenant_id());

-- ai_agent_config
CREATE POLICY "Tenant isolation for ai_agent_config" ON public.ai_agent_config
  FOR ALL TO authenticated
  USING (tenant_id = public.get_user_tenant_id())
  WITH CHECK (tenant_id = public.get_user_tenant_id());

-- ai_department_configs
CREATE POLICY "Tenant isolation for ai_department_configs" ON public.ai_department_configs
  FOR ALL TO authenticated
  USING (tenant_id = public.get_user_tenant_id())
  WITH CHECK (tenant_id = public.get_user_tenant_id());

-- ai_directives
CREATE POLICY "Tenant isolation for ai_directives" ON public.ai_directives
  FOR ALL TO authenticated
  USING (tenant_id = public.get_user_tenant_id())
  WITH CHECK (tenant_id = public.get_user_tenant_id());

-- system_settings
CREATE POLICY "Tenant isolation for system_settings" ON public.system_settings
  FOR ALL TO authenticated
  USING (tenant_id = public.get_user_tenant_id())
  WITH CHECK (tenant_id = public.get_user_tenant_id());

-- regions
CREATE POLICY "Tenant isolation for regions" ON public.regions
  FOR ALL TO authenticated
  USING (tenant_id = public.get_user_tenant_id())
  WITH CHECK (tenant_id = public.get_user_tenant_id());

-- activity_logs (read-only for users)
CREATE POLICY "Tenant can view own activity logs" ON public.activity_logs
  FOR SELECT TO authenticated
  USING (tenant_id = public.get_user_tenant_id());

-- ai_error_log (read-only for users)
CREATE POLICY "Tenant can view own error logs" ON public.ai_error_log
  FOR SELECT TO authenticated
  USING (tenant_id = public.get_user_tenant_id());

-- portal_leads_log
CREATE POLICY "Tenant isolation for portal_leads_log" ON public.portal_leads_log
  FOR ALL TO authenticated
  USING (tenant_id = public.get_user_tenant_id())
  WITH CHECK (tenant_id = public.get_user_tenant_id());

-- tenants (users can only see their own tenant)
CREATE POLICY "Users can view own tenant" ON public.tenants
  FOR SELECT TO authenticated
  USING (id = public.get_user_tenant_id());

CREATE POLICY "Admins can update own tenant" ON public.tenants
  FOR UPDATE TO authenticated
  USING (id = public.get_user_tenant_id());
