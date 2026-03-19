-- Add website_url to ai_agent_config
-- Used to construct property URLs: {website_url}/imovel/{external_id}
ALTER TABLE ai_agent_config
ADD COLUMN IF NOT EXISTS website_url TEXT;
