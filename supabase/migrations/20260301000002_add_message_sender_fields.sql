-- Add sender identification and system event fields to messages table
-- This enables: operator identification, AI vs operator distinction, and system event messages

ALTER TABLE messages ADD COLUMN sender_type text CHECK (sender_type IN ('ai','operator','system','customer'));
ALTER TABLE messages ADD COLUMN sender_id uuid REFERENCES profiles(id);
ALTER TABLE messages ADD COLUMN event_type text CHECK (event_type IN ('message','operator_joined','operator_left','transfer','ai_paused','ai_resumed'));

-- Backfill existing messages based on direction
UPDATE messages SET sender_type = CASE WHEN direction = 'inbound' THEN 'customer' ELSE 'ai' END WHERE sender_type IS NULL;

-- Index for efficient queries on sender_type (system events filtering)
CREATE INDEX idx_messages_sender_type ON messages(sender_type) WHERE sender_type = 'system';
CREATE INDEX idx_messages_sender_id ON messages(sender_id) WHERE sender_id IS NOT NULL;
