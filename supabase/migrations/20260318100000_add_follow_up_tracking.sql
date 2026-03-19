-- Add follow-up tracking to conversation_states
ALTER TABLE conversation_states
ADD COLUMN IF NOT EXISTS follow_up_sent_at timestamptz DEFAULT NULL;

COMMENT ON COLUMN conversation_states.follow_up_sent_at IS 'Timestamp of last inactivity follow-up sent. Reset when lead replies.';
