-- Allow super_admin profiles to exist without a tenant_id.
-- Regular profiles (admin, operator, viewer) still require tenant_id.

-- Step 1: Drop NOT NULL constraint on tenant_id
ALTER TABLE public.profiles ALTER COLUMN tenant_id DROP NOT NULL;

-- Step 2: Add CHECK constraint ensuring only super_admin can have NULL tenant_id
ALTER TABLE public.profiles ADD CONSTRAINT profiles_tenant_required_for_non_super_admin
  CHECK (role = 'super_admin' OR tenant_id IS NOT NULL);
