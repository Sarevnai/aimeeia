-- Add quality validation columns to contacts
ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS phone_valid boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS quality_issues jsonb DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.contacts.phone_valid IS 'false se telefone inválido para WhatsApp (fixo, curto, mal formatado)';
COMMENT ON COLUMN public.contacts.quality_issues IS 'Array de issues: [{type, severity, detail}]';

CREATE INDEX IF NOT EXISTS idx_contacts_phone_valid ON public.contacts(phone_valid) WHERE phone_valid = false;
