-- Add last_property_shown_at to track when a property was last shown to a lead.
-- Used by the property-followup cron job to send a follow-up message after 3 minutes of no response.
ALTER TABLE conversation_states
ADD COLUMN IF NOT EXISTS last_property_shown_at TIMESTAMPTZ;
