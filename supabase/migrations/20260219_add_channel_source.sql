-- Add channel_source to contacts to track where leads come from
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS channel_source TEXT DEFAULT 'whatsapp';

-- Add some common channel source values as a comment for reference:
-- 'whatsapp', 'grupozap', 'imovelweb', 'facebook', 'site', 'chavesnamao', 'olx', 'vivareal'

COMMENT ON COLUMN contacts.channel_source IS 'Source channel where the lead originated from';
