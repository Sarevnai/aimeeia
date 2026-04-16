-- Add Canal Pro specific columns to portal_leads_log
ALTER TABLE public.portal_leads_log
  ADD COLUMN IF NOT EXISTS origin_lead_id text,
  ADD COLUMN IF NOT EXISTS origin_listing_id text,
  ADD COLUMN IF NOT EXISTS lead_type text,
  ADD COLUMN IF NOT EXISTS temperature text,
  ADD COLUMN IF NOT EXISTS transaction_type text;

CREATE INDEX IF NOT EXISTS idx_portal_leads_origin_lead_id
  ON public.portal_leads_log(tenant_id, origin_lead_id)
  WHERE origin_lead_id IS NOT NULL;
