-- supabase/migrations/20260220_tenant_invoices.sql

-- 1. Create tenant_invoices table
CREATE TABLE tenant_invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE NOT NULL,
  subscription_id UUID REFERENCES tenant_subscriptions(id),
  amount NUMERIC(10,2) NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending', -- pending, paid, overdue, cancelled
  billing_month DATE NOT NULL,
  due_date DATE NOT NULL,
  paid_at TIMESTAMPTZ,
  barcode TEXT,
  pdf_url TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Enable RLS
ALTER TABLE tenant_invoices ENABLE ROW LEVEL SECURITY;

-- 3. RLS Policies
-- Tenants can view their own invoices
CREATE POLICY "Tenants can view their own invoices" ON tenant_invoices
  FOR SELECT
  USING (tenant_id = get_current_tenant_id());

-- Super admins can view all invoices
CREATE POLICY "Super admins can view all invoices" ON tenant_invoices
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role = 'super_admin'
    )
  );

-- Function to handle updated_at
CREATE TRIGGER handle_updated_at BEFORE UPDATE ON tenant_invoices
  FOR EACH ROW EXECUTE PROCEDURE moddatetime (updated_at);
