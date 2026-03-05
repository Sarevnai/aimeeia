-- ============================================================
-- AIMEE.iA v2 - Create Tickets Tables
-- Creates the schema for Administrative Module (Tickets)
-- ============================================================

-- 1. Create ticket_categories
CREATE TABLE IF NOT EXISTS public.ticket_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  sla_hours INTEGER DEFAULT 48,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Create ticket_stages
CREATE TABLE IF NOT EXISTS public.ticket_stages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT DEFAULT '#3B82F6',
  order_index INTEGER DEFAULT 0,
  is_terminal BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 2.5 Create department_type enum
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'department_type') THEN
        CREATE TYPE public.department_type AS ENUM ('vendas', 'locacao', 'administrativo', 'marketing');
    END IF;
END$$;

-- 3. Create tickets
CREATE TABLE IF NOT EXISTS public.tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL,
  category_id UUID REFERENCES public.ticket_categories(id) ON DELETE SET NULL,
  subcategory TEXT,
  priority TEXT NOT NULL DEFAULT 'media',
  stage TEXT NOT NULL DEFAULT 'Novo',
  stage_id UUID REFERENCES public.ticket_stages(id) ON DELETE SET NULL,
  source TEXT NOT NULL DEFAULT 'manual',
  phone TEXT NOT NULL,
  email TEXT,
  contact_id UUID REFERENCES public.contacts(id) ON DELETE SET NULL,
  conversation_id UUID REFERENCES public.conversations(id) ON DELETE SET NULL,
  department_code department_type,
  property_address TEXT,
  property_code TEXT,
  property_type TEXT,
  value NUMERIC,
  assigned_to UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  sla_deadline TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ,
  resolution_notes TEXT,
  last_contact TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 4. Create ticket_comments
CREATE TABLE IF NOT EXISTS public.ticket_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  ticket_id UUID NOT NULL REFERENCES public.tickets(id) ON DELETE CASCADE,
  user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  body TEXT NOT NULL,
  is_internal BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 5. Enable RLS
ALTER TABLE public.ticket_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ticket_stages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ticket_comments ENABLE ROW LEVEL SECURITY;

-- 6. Add RLS Policies
CREATE POLICY "tenant_isolation" ON public.ticket_categories FOR ALL USING (tenant_id = get_user_tenant_id());
CREATE POLICY "tenant_isolation" ON public.ticket_stages FOR ALL USING (tenant_id = get_user_tenant_id());
CREATE POLICY "tenant_isolation" ON public.tickets FOR ALL USING (tenant_id = get_user_tenant_id());
CREATE POLICY "tenant_isolation" ON public.ticket_comments FOR ALL USING (tenant_id = get_user_tenant_id());
