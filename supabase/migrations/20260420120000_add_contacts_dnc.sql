-- Do Not Contact flag for contacts that explicitly opted out,
-- are auto-reply bots, or are the wrong audience (e.g. other brokers).
-- Used by whatsapp-webhook to skip ai-agent invocation and by campaigns
-- to exclude from future sends.

ALTER TABLE contacts
  ADD COLUMN IF NOT EXISTS dnc boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS dnc_at timestamptz,
  ADD COLUMN IF NOT EXISTS dnc_reason text;

COMMENT ON COLUMN contacts.dnc IS 'Do Not Contact: true = exclude from campaigns and ignore at webhook';
COMMENT ON COLUMN contacts.dnc_reason IS 'opt_out | auto_reply | wrong_audience | manual';

CREATE INDEX IF NOT EXISTS idx_contacts_dnc ON contacts (tenant_id) WHERE dnc = true;
