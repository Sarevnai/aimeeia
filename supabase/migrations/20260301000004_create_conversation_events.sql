-- Create conversation_events table for handoff audit trail
-- Tracks all operator join/leave/transfer events for a conversation

CREATE TABLE conversation_events (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  event_type text NOT NULL CHECK (event_type IN ('operator_joined','operator_left','transfer','ai_paused','ai_resumed')),
  actor_id uuid REFERENCES profiles(id),
  target_id uuid REFERENCES profiles(id),
  metadata jsonb,
  created_at timestamptz DEFAULT now()
);

-- RLS: tenant isolation
ALTER TABLE conversation_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant isolation" ON conversation_events
  FOR ALL USING (tenant_id = get_user_tenant_id());

CREATE POLICY "Super admin read all" ON conversation_events
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
  );

-- Indexes
CREATE INDEX idx_conversation_events_conversation ON conversation_events(conversation_id);
CREATE INDEX idx_conversation_events_tenant ON conversation_events(tenant_id);
CREATE INDEX idx_conversation_events_created ON conversation_events(created_at DESC);
