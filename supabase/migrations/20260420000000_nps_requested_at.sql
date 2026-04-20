-- Sprint 6.4 NPS collection — rastreia quando Aimee pediu avaliação
ALTER TABLE public.tickets
  ADD COLUMN IF NOT EXISTS nps_requested_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_tickets_nps_pending
  ON public.tickets(tenant_id, phone, nps_requested_at)
  WHERE nps_requested_at IS NOT NULL AND nps_score IS NULL;

COMMENT ON COLUMN public.tickets.nps_requested_at IS
  'Timestamp de quando a Aimee enviou a mensagem de avaliação pós-resolução. Janela: 24h pra captar resposta 1-5 do cliente.';
