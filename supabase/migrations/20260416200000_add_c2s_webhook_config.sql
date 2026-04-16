-- Adiciona colunas para configurar webhooks do C2S por tenant.
-- O C2S só aceita 1 endpoint por token; usamos tenant_id + secret na query string
-- pra rotear no nosso edge function c2s-webhook.

ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS c2s_webhook_secret text,
  ADD COLUMN IF NOT EXISTS c2s_webhook_subscribed_at timestamptz,
  ADD COLUMN IF NOT EXISTS c2s_webhook_last_event_at timestamptz;

COMMENT ON COLUMN public.tenants.c2s_webhook_secret IS
  'Segredo opaco gerado no subscribe; validado no edge function c2s-webhook via ?secret= na URL.';
COMMENT ON COLUMN public.tenants.c2s_webhook_subscribed_at IS
  'Timestamp da última chamada bem-sucedida ao POST /api/subscribe do C2S.';
COMMENT ON COLUMN public.tenants.c2s_webhook_last_event_at IS
  'Timestamp do último evento recebido. Null indica que webhook ainda não disparou.';
