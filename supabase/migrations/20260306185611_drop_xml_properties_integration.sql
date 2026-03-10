-- Drop tables
DROP TABLE IF EXISTS properties;
DROP TABLE IF EXISTS xml_sync_queue;

-- Remove columns from tenants
ALTER TABLE tenants 
  DROP COLUMN IF EXISTS xml_catalog_url,
  DROP COLUMN IF EXISTS xml_parser_type;

-- Remove column from ai_agent_config
ALTER TABLE ai_agent_config
  DROP COLUMN IF EXISTS vista_integration_enabled;
