-- ============================================================
-- AIMEE.iA — Setor Administrativo de Locação (Evolução)
-- Sprint 6.1 — Migration delta sobre o scaffold de tickets
-- ============================================================
-- Adiciona:
--   1. ticket_context_fields (chave-valor que operador alimenta do Vista)
--   2. reply_to em messages (chat WhatsApp-like)
--   3. risk_level / aimee_can_resolve / context_template em ticket_categories
--   4. ai_active_admin em tenants (kill switch por setor)
--   5. first_response_at / nps_score em tickets (métricas MVP)
--   6. Categorias faltantes (Rescisão, Contrato, Vistoria, Chaves) + risk_level
-- ============================================================

-- ============================================================
-- 1. ticket_context_fields — contexto genérico alimentado pelo operador
-- ============================================================
CREATE TABLE IF NOT EXISTS public.ticket_context_fields (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  ticket_id UUID NOT NULL REFERENCES public.tickets(id) ON DELETE CASCADE,
  field_key TEXT NOT NULL,
  field_value TEXT,
  filled_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  filled_at TIMESTAMPTZ DEFAULT now(),
  requested_by_aimee BOOLEAN DEFAULT false,
  UNIQUE(ticket_id, field_key)
);

CREATE INDEX IF NOT EXISTS idx_tcf_ticket ON public.ticket_context_fields(ticket_id);
CREATE INDEX IF NOT EXISTS idx_tcf_tenant ON public.ticket_context_fields(tenant_id);

ALTER TABLE public.ticket_context_fields ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation" ON public.ticket_context_fields
  FOR ALL USING (tenant_id = get_user_tenant_id());

-- ============================================================
-- 2. reply_to em messages — citação / reply WhatsApp-like
-- ============================================================
ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS reply_to BIGINT REFERENCES public.messages(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_messages_reply_to ON public.messages(reply_to)
  WHERE reply_to IS NOT NULL;

-- ============================================================
-- 3. ticket_categories: risk_level + aimee_can_resolve + context_template
-- ============================================================
ALTER TABLE public.ticket_categories
  ADD COLUMN IF NOT EXISTS risk_level TEXT DEFAULT 'baixo'
    CHECK (risk_level IN ('baixo','medio','alto')),
  ADD COLUMN IF NOT EXISTS aimee_can_resolve BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS context_template JSONB DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.ticket_categories.risk_level IS
  'baixo=Aimee resolve sozinha; medio=resolve mas loga alerta; alto=categoria-vermelha, escala humano direto';
COMMENT ON COLUMN public.ticket_categories.context_template IS
  'Array JSON de campos que Aimee pede ao operador. Ex: [{"key":"contrato_num","label":"Nº contrato","required":true}]';

-- ============================================================
-- 4. tenants: kill switch por setor administrativo
-- ============================================================
ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS ai_active_admin BOOLEAN DEFAULT true;

COMMENT ON COLUMN public.tenants.ai_active_admin IS
  'Kill switch da Aimee no setor administrativo. false = todo ticket novo abre sem resposta automática.';

-- ============================================================
-- 5. tickets: métricas MVP
-- ============================================================
ALTER TABLE public.tickets
  ADD COLUMN IF NOT EXISTS first_response_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS nps_score INTEGER CHECK (nps_score BETWEEN 1 AND 5),
  ADD COLUMN IF NOT EXISTS nps_collected_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_tickets_orphan ON public.tickets(tenant_id, created_at)
  WHERE assigned_to IS NULL AND resolved_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_tickets_nps ON public.tickets(tenant_id, nps_score)
  WHERE nps_score IS NOT NULL;

-- ============================================================
-- 6. Categorias faltantes + risk_level nas existentes
-- ============================================================

-- Rescisão (alto risco — Aimee só triagem + handoff)
INSERT INTO public.ticket_categories (tenant_id, name, description, sla_hours, is_active, risk_level, aimee_can_resolve, context_template)
SELECT
  t.id,
  'Rescisão',
  'Encerramento de contrato, devolução de imóvel, multa rescisória.',
  24,
  true,
  'alto',
  false,
  '[
    {"key":"contrato_num","label":"Nº do contrato","required":true},
    {"key":"motivo_rescisao","label":"Motivo da rescisão","required":true},
    {"key":"data_pretendida","label":"Data pretendida de saída","required":true}
  ]'::jsonb
FROM public.tenants t
WHERE NOT EXISTS (
  SELECT 1 FROM public.ticket_categories tc
  WHERE tc.tenant_id = t.id AND tc.name = 'Rescisão'
);

-- Contrato (médio — renovação, reajuste, cláusulas)
INSERT INTO public.ticket_categories (tenant_id, name, description, sla_hours, is_active, risk_level, aimee_can_resolve, context_template)
SELECT
  t.id,
  'Contrato',
  'Renovação, reajuste, aditivos, dúvidas sobre cláusulas.',
  48,
  true,
  'medio',
  true,
  '[
    {"key":"contrato_num","label":"Nº do contrato","required":true},
    {"key":"indice_reajuste","label":"Índice e % do reajuste do mês","required":false},
    {"key":"data_renovacao","label":"Data de renovação","required":false}
  ]'::jsonb
FROM public.tenants t
WHERE NOT EXISTS (
  SELECT 1 FROM public.ticket_categories tc
  WHERE tc.tenant_id = t.id AND tc.name = 'Contrato'
);

-- Vistoria
INSERT INTO public.ticket_categories (tenant_id, name, description, sla_hours, is_active, risk_level, aimee_can_resolve, context_template)
SELECT
  t.id,
  'Vistoria',
  'Agendamento e laudos de vistoria de entrada/saída.',
  72,
  true,
  'baixo',
  true,
  '[
    {"key":"unidade","label":"Unidade / endereço","required":true},
    {"key":"tipo_vistoria","label":"Tipo (entrada/saída/periódica)","required":true}
  ]'::jsonb
FROM public.tenants t
WHERE NOT EXISTS (
  SELECT 1 FROM public.ticket_categories tc
  WHERE tc.tenant_id = t.id AND tc.name = 'Vistoria'
);

-- Chaves
INSERT INTO public.ticket_categories (tenant_id, name, description, sla_hours, is_active, risk_level, aimee_can_resolve, context_template)
SELECT
  t.id,
  'Chaves',
  'Cópia, retirada, devolução e troca de chaves.',
  48,
  true,
  'baixo',
  true,
  '[
    {"key":"unidade","label":"Unidade / endereço","required":true},
    {"key":"motivo_chaves","label":"Motivo (cópia/perda/troca)","required":true}
  ]'::jsonb
FROM public.tenants t
WHERE NOT EXISTS (
  SELECT 1 FROM public.ticket_categories tc
  WHERE tc.tenant_id = t.id AND tc.name = 'Chaves'
);

-- Atualiza templates + risk_level das categorias existentes
UPDATE public.ticket_categories
SET
  risk_level = 'medio',
  context_template = '[
    {"key":"contrato_num","label":"Nº do contrato","required":true},
    {"key":"valor_aluguel","label":"Valor do aluguel","required":false},
    {"key":"dia_vencimento","label":"Dia do vencimento","required":false},
    {"key":"status_inadimplencia","label":"Status (em dia/atrasado/valor em aberto)","required":true}
  ]'::jsonb
WHERE name = 'Financeiro' AND (context_template IS NULL OR context_template = '[]'::jsonb);

UPDATE public.ticket_categories
SET
  risk_level = 'baixo',
  context_template = '[
    {"key":"unidade","label":"Unidade / endereço","required":true},
    {"key":"tipo_problema","label":"Tipo do problema (elétrico/hidráulico/estrutural)","required":false},
    {"key":"urgencia","label":"É urgente? (vazamento, falta de água/luz)","required":false}
  ]'::jsonb
WHERE name = 'Manutenção' AND (context_template IS NULL OR context_template = '[]'::jsonb);

UPDATE public.ticket_categories
SET
  risk_level = 'baixo'
WHERE name = 'Dúvidas e Solicitações' AND risk_level IS NULL;

-- ============================================================
-- 7. Trigger atualizado: novos tenants recebem categorias + risk_level
-- ============================================================
CREATE OR REPLACE FUNCTION public.handle_new_tenant_tickets_setup()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Stages default
  INSERT INTO public.ticket_stages (tenant_id, name, color, order_index, is_terminal)
  VALUES
    (NEW.id, 'Novo', '#3B82F6', 0, false),
    (NEW.id, 'Aguardando Contexto', '#A855F7', 1, false),
    (NEW.id, 'Em Atendimento', '#F59E0B', 2, false),
    (NEW.id, 'Resolvido', '#10B981', 3, true);

  -- Categorias default (7 — cobre todo o prompt do adminAgent)
  INSERT INTO public.ticket_categories (tenant_id, name, description, sla_hours, is_active, risk_level, aimee_can_resolve, context_template)
  VALUES
    (NEW.id, 'Manutenção', 'Problemas estruturais, elétricos, hidráulicos, etc.', 48, true, 'baixo', true,
      '[{"key":"unidade","label":"Unidade / endereço","required":true},{"key":"tipo_problema","label":"Tipo (elétrico/hidráulico/estrutural)","required":false},{"key":"urgencia","label":"É urgente?","required":false}]'::jsonb),
    (NEW.id, 'Financeiro', 'Boletos, repasses, reajustes, cobranças.', 24, true, 'medio', true,
      '[{"key":"contrato_num","label":"Nº do contrato","required":true},{"key":"valor_aluguel","label":"Valor do aluguel","required":false},{"key":"dia_vencimento","label":"Dia do vencimento","required":false},{"key":"status_inadimplencia","label":"Status","required":true}]'::jsonb),
    (NEW.id, 'Contrato', 'Renovação, reajuste, aditivos, dúvidas sobre cláusulas.', 48, true, 'medio', true,
      '[{"key":"contrato_num","label":"Nº do contrato","required":true},{"key":"indice_reajuste","label":"Índice e % do mês","required":false},{"key":"data_renovacao","label":"Data de renovação","required":false}]'::jsonb),
    (NEW.id, 'Rescisão', 'Encerramento de contrato, devolução de imóvel, multa rescisória.', 24, true, 'alto', false,
      '[{"key":"contrato_num","label":"Nº do contrato","required":true},{"key":"motivo_rescisao","label":"Motivo","required":true},{"key":"data_pretendida","label":"Data pretendida de saída","required":true}]'::jsonb),
    (NEW.id, 'Vistoria', 'Agendamento e laudos de vistoria.', 72, true, 'baixo', true,
      '[{"key":"unidade","label":"Unidade / endereço","required":true},{"key":"tipo_vistoria","label":"Tipo (entrada/saída/periódica)","required":true}]'::jsonb),
    (NEW.id, 'Chaves', 'Cópia, retirada, devolução e troca.', 48, true, 'baixo', true,
      '[{"key":"unidade","label":"Unidade / endereço","required":true},{"key":"motivo_chaves","label":"Motivo","required":true}]'::jsonb),
    (NEW.id, 'Dúvidas e Solicitações', 'Dúvidas em geral, segunda via de documentos, etc.', 72, true, 'baixo', true, '[]'::jsonb);

  RETURN NEW;
END;
$$;

-- ============================================================
-- 8. Garante stage "Aguardando Contexto" em tenants existentes
-- ============================================================
INSERT INTO public.ticket_stages (tenant_id, name, color, order_index, is_terminal)
SELECT t.id, 'Aguardando Contexto', '#A855F7', 1, false
FROM public.tenants t
WHERE NOT EXISTS (
  SELECT 1 FROM public.ticket_stages ts
  WHERE ts.tenant_id = t.id AND ts.name = 'Aguardando Contexto'
);

-- Reordena stages existentes pra acomodar o novo
UPDATE public.ticket_stages SET order_index = 2 WHERE name = 'Em Atendimento' AND order_index = 1;
UPDATE public.ticket_stages SET order_index = 3 WHERE name = 'Resolvido' AND order_index = 2;
