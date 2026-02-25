-- Fix infinite recursion in RLS policies by preventing function inlining.
-- When a SECURITY DEFINER function is written in LANGUAGE SQL, Postgres may inline it.
-- Inlined functions execute in the caller's context, meaning it loses the SECURITY DEFINER
-- privilege and triggers RLS again, causing an infinite loop (42P17).
-- By rewriting it in plpgsql, we guarantee it executes securely without triggering RLS recursively.

CREATE OR REPLACE FUNCTION public.get_user_tenant_id()
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER STABLE
SET search_path = public
AS $$
DECLARE
  v_tenant_id UUID;
BEGIN
  SELECT tenant_id INTO v_tenant_id FROM public.profiles WHERE id = auth.uid();
  RETURN v_tenant_id;
END;
$$;
