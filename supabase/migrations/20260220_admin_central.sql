-- ═══════════════════════════════════════════════════════════
-- Admin Central — Platform Management tables
-- ═══════════════════════════════════════════════════════════

-- 1. Extend user_role enum with super_admin
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'super_admin';

-- 2. Billing plans
CREATE TABLE IF NOT EXISTS billing_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  monthly_price NUMERIC(10,2) NOT NULL DEFAULT 0,
  annual_price NUMERIC(10,2),
  max_conversations INTEGER,
  max_users INTEGER DEFAULT 5,
  features JSONB DEFAULT '{}',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 3. Tenant subscriptions
CREATE TABLE IF NOT EXISTS tenant_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE NOT NULL,
  plan_id UUID REFERENCES billing_plans(id),
  status TEXT NOT NULL DEFAULT 'trial',
  billing_cycle TEXT DEFAULT 'monthly',
  trial_ends_at TIMESTAMPTZ,
  current_period_start TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  mrr NUMERIC(10,2) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(tenant_id)
);

-- 4. Usage tracking per period
CREATE TABLE IF NOT EXISTS tenant_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE NOT NULL,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  conversations_count INTEGER DEFAULT 0,
  messages_count INTEGER DEFAULT 0,
  leads_generated INTEGER DEFAULT 0,
  leads_qualified INTEGER DEFAULT 0,
  ai_tokens_used BIGINT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(tenant_id, period_start)
);

-- 5. Extend tenants with admin fields
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS plan_tier TEXT DEFAULT 'trial';
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS onboarded_at TIMESTAMPTZ;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS admin_notes TEXT;

-- 6. is_super_admin helper function
CREATE OR REPLACE FUNCTION is_super_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND role = 'super_admin'
  );
$$;

-- 7. Seed default billing plans
INSERT INTO billing_plans (name, slug, monthly_price, annual_price, max_conversations, max_users, features) VALUES
  ('Starter', 'starter', 297.00, 2970.00, 500, 3, '{"whatsapp": true, "portal_leads": false, "campaigns": false}'),
  ('Pro', 'pro', 597.00, 5970.00, 2000, 10, '{"whatsapp": true, "portal_leads": true, "campaigns": true, "reports": true}'),
  ('Enterprise', 'enterprise', 997.00, 9970.00, NULL, NULL, '{"whatsapp": true, "portal_leads": true, "campaigns": true, "reports": true, "api_access": true, "custom_agent": true}')
ON CONFLICT (slug) DO NOTHING;
