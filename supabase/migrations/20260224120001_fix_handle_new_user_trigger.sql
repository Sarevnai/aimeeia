-- Fix: handle_new_user() trigger now handles missing tenant_id gracefully
-- Previous version would fail with NOT NULL constraint violation (SQLSTATE 23502)
-- when tenant_id was missing from user metadata during signup or admin user creation.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_tenant_id UUID;
BEGIN
  -- Try to get tenant_id from user metadata
  v_tenant_id := nullif(new.raw_user_meta_data->>'tenant_id', '')::uuid;

  -- If no tenant_id provided, find the first active tenant as fallback
  IF v_tenant_id IS NULL THEN
    SELECT id INTO v_tenant_id FROM public.tenants WHERE is_active = true LIMIT 1;
  END IF;

  -- Only create profile if we have a valid tenant_id
  IF v_tenant_id IS NOT NULL THEN
    INSERT INTO public.profiles (id, full_name, avatar_url, role, tenant_id)
    VALUES (
      new.id,
      new.raw_user_meta_data->>'full_name',
      new.raw_user_meta_data->>'avatar_url',
      cast(coalesce(new.raw_user_meta_data->>'role', 'viewer') as public.user_role),
      v_tenant_id
    );
  END IF;

  RETURN new;
END;
$$;
