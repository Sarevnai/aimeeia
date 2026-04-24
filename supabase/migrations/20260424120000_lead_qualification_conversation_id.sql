-- lead_qualification.conversation_id
-- Motivo: ai-agent/index.ts usa qualRow.conversation_id pra detectar "lead retornante"
-- (C4: nova conversa herdou qual de sessão anterior → revalida contexto). Coluna nunca
-- existiu, então qualRow.conversation_id era sempre undefined e a heurística ficou morta.
-- Adiciona coluna + backfill com a última conversa por (tenant_id, phone_number).

ALTER TABLE public.lead_qualification
  ADD COLUMN IF NOT EXISTS conversation_id uuid REFERENCES public.conversations(id) ON DELETE SET NULL;

-- Backfill: última conversa por phone_number+tenant
WITH last_conv AS (
  SELECT DISTINCT ON (c.tenant_id, c.phone_number)
    c.tenant_id, c.phone_number, c.id AS conversation_id
  FROM public.conversations c
  ORDER BY c.tenant_id, c.phone_number, c.created_at DESC
)
UPDATE public.lead_qualification lq
SET conversation_id = lc.conversation_id
FROM last_conv lc
WHERE lq.tenant_id = lc.tenant_id
  AND lq.phone_number = lc.phone_number
  AND lq.conversation_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_lead_qualification_conversation
  ON public.lead_qualification(conversation_id);
