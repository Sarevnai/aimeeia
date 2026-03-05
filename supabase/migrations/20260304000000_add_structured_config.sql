-- Add structured_config JSONB to ai_directives for the "Consultora VIP" pattern
-- When present, takes priority over directive_content (flat text)
ALTER TABLE public.ai_directives
  ADD COLUMN IF NOT EXISTS structured_config JSONB DEFAULT NULL;

-- Add triage_config JSONB to ai_agent_config for configurable Fase 1 messages
ALTER TABLE public.ai_agent_config
  ADD COLUMN IF NOT EXISTS triage_config JSONB DEFAULT NULL;

COMMENT ON COLUMN public.ai_directives.structured_config IS
  'Structured prompt config (role, directives, phases, skills, handoff, guardrails). Takes priority over directive_content when present.';

COMMENT ON COLUMN public.ai_agent_config.triage_config IS
  'Configurable triage/Fase 1 messages (greeting VIP, department buttons). Applied across all departments.';
