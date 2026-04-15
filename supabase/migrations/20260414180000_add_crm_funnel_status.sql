-- Add C2S funnel_status (sub-fase dentro do crm_status)
-- Valores observados: 'New lead', 'In attendance', 'Scheduled visit', etc.

ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS crm_funnel_status text;

CREATE INDEX IF NOT EXISTS idx_contacts_crm_funnel ON public.contacts(tenant_id, crm_funnel_status);
CREATE INDEX IF NOT EXISTS idx_contacts_crm_status ON public.contacts(tenant_id, crm_status);

COMMENT ON COLUMN public.contacts.crm_funnel_status IS 'C2S funnel sub-status (New lead, In attendance, Scheduled visit)';
