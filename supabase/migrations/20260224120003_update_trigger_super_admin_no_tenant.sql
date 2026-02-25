-- Update handle_new_user() to allow super_admin profiles without tenant_id.
-- Regular users still require tenant_id (fallback to first active tenant).
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_tenant_id UUID;
  v_role public.user_role;
BEGIN
  -- Extract role from metadata (default: viewer)
  v_role := cast(coalesce(new.raw_user_meta_data->>'role', 'viewer') as public.user_role);

  -- Extract tenant_id from metadata
  v_tenant_id := nullif(new.raw_user_meta_data->>'tenant_id', '')::uuid;

  IF v_role = 'super_admin' THEN
    -- Super admins can exist without a tenant
    INSERT INTO public.profiles (id, full_name, avatar_url, role, tenant_id)
    VALUES (
      new.id,
      new.raw_user_meta_data->>'full_name',
      new.raw_user_meta_data->>'avatar_url',
      v_role,
      v_tenant_id  -- NULL is OK for super_admin
    );
  ELSE
    -- Regular users need a tenant_id
    IF v_tenant_id IS NULL THEN
      SELECT id INTO v_tenant_id FROM public.tenants WHERE is_active = true LIMIT 1;
    END IF;

    IF v_tenant_id IS NOT NULL THEN
      INSERT INTO public.profiles (id, full_name, avatar_url, role, tenant_id)
      VALUES (
        new.id,
        new.raw_user_meta_data->>'full_name',
        new.raw_user_meta_data->>'avatar_url',
        v_role,
        v_tenant_id
      );
    END IF;
  END IF;

  RETURN new;
END;
$$;
