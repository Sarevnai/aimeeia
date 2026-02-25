-- ========== MIGRATION: Templates Integration ==========
-- 1. Add waba_id to tenants (required for Meta template API)
-- 2. Add wa_message_id to campaign_results (for delivery tracking)
-- 3. Add unique constraint on whatsapp_templates (for upsert sync)

-- 1. waba_id on tenants
ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS waba_id text;

COMMENT ON COLUMN public.tenants.waba_id IS 'WhatsApp Business Account ID from Meta Business Suite';

-- 2. wa_message_id on campaign_results (to track delivery status from webhooks)
ALTER TABLE public.campaign_results
  ADD COLUMN IF NOT EXISTS wa_message_id text;

CREATE INDEX IF NOT EXISTS idx_campaign_results_wa_message_id
  ON public.campaign_results (wa_message_id)
  WHERE wa_message_id IS NOT NULL;

-- 3. Unique constraint for template upsert by tenant + name
ALTER TABLE public.whatsapp_templates
  DROP CONSTRAINT IF EXISTS whatsapp_templates_tenant_name_unique;

ALTER TABLE public.whatsapp_templates
  ADD CONSTRAINT whatsapp_templates_tenant_name_unique UNIQUE (tenant_id, name);

-- 4. wa_message_id on owner_update_results (for delivery tracking)
ALTER TABLE public.owner_update_results
  ADD COLUMN IF NOT EXISTS wa_message_id text;

CREATE INDEX IF NOT EXISTS idx_owner_update_results_wa_message_id
  ON public.owner_update_results (wa_message_id)
  WHERE wa_message_id IS NOT NULL;
