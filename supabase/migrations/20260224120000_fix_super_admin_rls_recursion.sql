-- Fix: Create is_super_admin() SECURITY DEFINER function
-- This prevents RLS infinite recursion caused by super_admin policies
-- that had inline subqueries on the profiles table.
-- The subquery triggered RLS evaluation on profiles, which in turn
-- evaluated the same policy, causing PostgreSQL error 42P17.

CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER STABLE
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'super_admin'
  );
END;
$$;

-- Update all 6 super_admin policies to use the new function

-- profiles (SELECT) - was self-referential
DROP POLICY IF EXISTS "super_admin_full_access_profiles" ON public.profiles;
CREATE POLICY "super_admin_full_access_profiles" ON public.profiles
  FOR SELECT TO authenticated
  USING (public.is_super_admin());

-- tenants (ALL)
DROP POLICY IF EXISTS "super_admin_full_access_tenants" ON public.tenants;
CREATE POLICY "super_admin_full_access_tenants" ON public.tenants
  FOR ALL TO authenticated
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

-- conversations (SELECT)
DROP POLICY IF EXISTS "super_admin_full_access_conversations" ON public.conversations;
CREATE POLICY "super_admin_full_access_conversations" ON public.conversations
  FOR SELECT TO authenticated
  USING (public.is_super_admin());

-- contacts (SELECT)
DROP POLICY IF EXISTS "super_admin_full_access_contacts" ON public.contacts;
CREATE POLICY "super_admin_full_access_contacts" ON public.contacts
  FOR SELECT TO authenticated
  USING (public.is_super_admin());

-- lead_qualification (SELECT)
DROP POLICY IF EXISTS "super_admin_full_access_lead_qualification" ON public.lead_qualification;
CREATE POLICY "super_admin_full_access_lead_qualification" ON public.lead_qualification
  FOR SELECT TO authenticated
  USING (public.is_super_admin());

-- ai_agent_config (SELECT)
DROP POLICY IF EXISTS "super_admin_full_access_ai_agent_config" ON public.ai_agent_config;
CREATE POLICY "super_admin_full_access_ai_agent_config" ON public.ai_agent_config
  FOR SELECT TO authenticated
  USING (public.is_super_admin());
