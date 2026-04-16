-- Log temporário de eventos do C2S. Cada POST em c2s-webhook grava aqui
-- (payload + resultado do processamento) pra diagnóstico. Pode ser dropada
-- depois que o espelho estabilizar.
CREATE TABLE IF NOT EXISTS public.c2s_webhook_events (
  id bigserial PRIMARY KEY,
  tenant_id uuid,
  received_at timestamptz DEFAULT now(),
  event_type text,
  lead_id text,
  action text,
  error_message text,
  raw_payload jsonb
);

CREATE INDEX IF NOT EXISTS c2s_webhook_events_tenant_idx ON public.c2s_webhook_events(tenant_id, received_at DESC);
