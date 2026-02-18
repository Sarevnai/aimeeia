
-- ========== RLS POLICIES: FULL TENANT ISOLATION (all tables) ==========
-- Drop and recreate all tenant_isolation policies with proper WITH CHECK clause

-- 1. activity_logs
DROP POLICY IF EXISTS "tenant_isolation" ON public.activity_logs;
CREATE POLICY "tenant_isolation" ON public.activity_logs
  FOR ALL TO authenticated
  USING (tenant_id = public.get_user_tenant_id())
  WITH CHECK (tenant_id = public.get_user_tenant_id());

-- 2. ai_agent_config
DROP POLICY IF EXISTS "tenant_isolation" ON public.ai_agent_config;
CREATE POLICY "tenant_isolation" ON public.ai_agent_config
  FOR ALL TO authenticated
  USING (tenant_id = public.get_user_tenant_id())
  WITH CHECK (tenant_id = public.get_user_tenant_id());

-- 3. ai_department_configs
DROP POLICY IF EXISTS "tenant_isolation" ON public.ai_department_configs;
CREATE POLICY "tenant_isolation" ON public.ai_department_configs
  FOR ALL TO authenticated
  USING (tenant_id = public.get_user_tenant_id())
  WITH CHECK (tenant_id = public.get_user_tenant_id());

-- 4. ai_directives
DROP POLICY IF EXISTS "tenant_isolation" ON public.ai_directives;
CREATE POLICY "tenant_isolation" ON public.ai_directives
  FOR ALL TO authenticated
  USING (tenant_id = public.get_user_tenant_id())
  WITH CHECK (tenant_id = public.get_user_tenant_id());

-- 5. ai_error_log
DROP POLICY IF EXISTS "tenant_isolation" ON public.ai_error_log;
CREATE POLICY "tenant_isolation" ON public.ai_error_log
  FOR ALL TO authenticated
  USING (tenant_id = public.get_user_tenant_id())
  WITH CHECK (tenant_id = public.get_user_tenant_id());

-- 6. campaign_results
DROP POLICY IF EXISTS "tenant_isolation" ON public.campaign_results;
CREATE POLICY "tenant_isolation" ON public.campaign_results
  FOR ALL TO authenticated
  USING (tenant_id = public.get_user_tenant_id())
  WITH CHECK (tenant_id = public.get_user_tenant_id());

-- 7. campaigns
DROP POLICY IF EXISTS "tenant_isolation" ON public.campaigns;
CREATE POLICY "tenant_isolation" ON public.campaigns
  FOR ALL TO authenticated
  USING (tenant_id = public.get_user_tenant_id())
  WITH CHECK (tenant_id = public.get_user_tenant_id());

-- 8. contacts
DROP POLICY IF EXISTS "tenant_isolation" ON public.contacts;
CREATE POLICY "tenant_isolation" ON public.contacts
  FOR ALL TO authenticated
  USING (tenant_id = public.get_user_tenant_id())
  WITH CHECK (tenant_id = public.get_user_tenant_id());

-- 9. conversation_stages
DROP POLICY IF EXISTS "tenant_isolation" ON public.conversation_stages;
CREATE POLICY "tenant_isolation" ON public.conversation_stages
  FOR ALL TO authenticated
  USING (tenant_id = public.get_user_tenant_id())
  WITH CHECK (tenant_id = public.get_user_tenant_id());

-- 10. conversation_states
DROP POLICY IF EXISTS "tenant_isolation" ON public.conversation_states;
CREATE POLICY "tenant_isolation" ON public.conversation_states
  FOR ALL TO authenticated
  USING (tenant_id = public.get_user_tenant_id())
  WITH CHECK (tenant_id = public.get_user_tenant_id());

-- 11. conversations
DROP POLICY IF EXISTS "tenant_isolation" ON public.conversations;
CREATE POLICY "tenant_isolation" ON public.conversations
  FOR ALL TO authenticated
  USING (tenant_id = public.get_user_tenant_id())
  WITH CHECK (tenant_id = public.get_user_tenant_id());

-- 12. developments
DROP POLICY IF EXISTS "tenant_isolation" ON public.developments;
CREATE POLICY "tenant_isolation" ON public.developments
  FOR ALL TO authenticated
  USING (tenant_id = public.get_user_tenant_id())
  WITH CHECK (tenant_id = public.get_user_tenant_id());

-- 13. lead_qualification
DROP POLICY IF EXISTS "tenant_isolation" ON public.lead_qualification;
CREATE POLICY "tenant_isolation" ON public.lead_qualification
  FOR ALL TO authenticated
  USING (tenant_id = public.get_user_tenant_id())
  WITH CHECK (tenant_id = public.get_user_tenant_id());

-- 14. messages
DROP POLICY IF EXISTS "tenant_isolation" ON public.messages;
CREATE POLICY "tenant_isolation" ON public.messages
  FOR ALL TO authenticated
  USING (tenant_id = public.get_user_tenant_id())
  WITH CHECK (tenant_id = public.get_user_tenant_id());

-- 15. portal_leads_log
DROP POLICY IF EXISTS "tenant_isolation" ON public.portal_leads_log;
CREATE POLICY "tenant_isolation" ON public.portal_leads_log
  FOR ALL TO authenticated
  USING (tenant_id = public.get_user_tenant_id())
  WITH CHECK (tenant_id = public.get_user_tenant_id());

-- 16. profiles
DROP POLICY IF EXISTS "tenant_isolation" ON public.profiles;
CREATE POLICY "tenant_isolation" ON public.profiles
  FOR ALL TO authenticated
  USING (tenant_id = public.get_user_tenant_id())
  WITH CHECK (tenant_id = public.get_user_tenant_id());

-- 17. regions
DROP POLICY IF EXISTS "tenant_isolation" ON public.regions;
CREATE POLICY "tenant_isolation" ON public.regions
  FOR ALL TO authenticated
  USING (tenant_id = public.get_user_tenant_id())
  WITH CHECK (tenant_id = public.get_user_tenant_id());

-- 18. system_settings
DROP POLICY IF EXISTS "tenant_isolation" ON public.system_settings;
CREATE POLICY "tenant_isolation" ON public.system_settings
  FOR ALL TO authenticated
  USING (tenant_id = public.get_user_tenant_id())
  WITH CHECK (tenant_id = public.get_user_tenant_id());

-- 19. tenants (uses id instead of tenant_id)
DROP POLICY IF EXISTS "tenant_isolation" ON public.tenants;
CREATE POLICY "tenant_isolation" ON public.tenants
  FOR ALL TO authenticated
  USING (id = public.get_user_tenant_id())
  WITH CHECK (id = public.get_user_tenant_id());

-- 20. whatsapp_templates
DROP POLICY IF EXISTS "tenant_isolation" ON public.whatsapp_templates;
CREATE POLICY "tenant_isolation" ON public.whatsapp_templates
  FOR ALL TO authenticated
  USING (tenant_id = public.get_user_tenant_id())
  WITH CHECK (tenant_id = public.get_user_tenant_id());
