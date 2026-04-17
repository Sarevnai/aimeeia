-- ========== AIMEE.iA - REWARM ARCHIVED LEADS ==========
-- Quando o corretor arquiva um lead no C2S, a Aimee assume (com cooldown) e
-- tenta reaquecer. Blocklist filtra motivos onde reaquecer é contraindicado
-- (imóvel já alugado, cliente pediu pra não contatar, falecido, duplicado,
-- etc). Máximo 1 tentativa — se falhar, fica arquivado pra sempre.
--
-- Decisões:
--   - Cooldown: 2 dias (configurável via system_settings)
--   - Max tentativas: 1 (hardcoded)
--   - Feature flag: tenants.auto_rewarm_enabled (opt-in)
--   - Rate limit: tenants.rewarm_daily_limit (default 50)
--   - Modo sombra no C2S: não reabrir lead lá; só criar lead novo se converter

/* ─── Colunas em contacts ─── */
ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS reactivation_attempts int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS reactivation_scheduled_at timestamptz,
  ADD COLUMN IF NOT EXISTS reactivation_blocked_reason text,
  ADD COLUMN IF NOT EXISTS reactivation_last_attempt_at timestamptz;

CREATE INDEX IF NOT EXISTS contacts_reactivation_schedule_idx
  ON public.contacts (tenant_id, reactivation_scheduled_at)
  WHERE reactivation_scheduled_at IS NOT NULL AND reactivation_attempts = 0;

COMMENT ON COLUMN public.contacts.reactivation_attempts IS
  'Quantas vezes a Aimee tentou reaquecer esse lead. Max=1; >=1 bloqueia futuras tentativas.';
COMMENT ON COLUMN public.contacts.reactivation_scheduled_at IS
  'Quando a Aimee vai iniciar o reaquecimento. NULL = não agendado ou bloqueado.';
COMMENT ON COLUMN public.contacts.reactivation_blocked_reason IS
  'Se bloqueado, o motivo: "motivo em blocklist", "attempts exceeded", "feature disabled".';

/* ─── Flag + limite em tenants ─── */
ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS auto_rewarm_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS rewarm_daily_limit int NOT NULL DEFAULT 50;

COMMENT ON COLUMN public.tenants.auto_rewarm_enabled IS
  'Opt-in do reaquecimento automático de arquivados. Default FALSE. Tenant precisa habilitar via painel.';
COMMENT ON COLUMN public.tenants.rewarm_daily_limit IS
  'Máximo de leads que a Aimee tenta reaquecer por dia. Começa em 50 no piloto.';

/* ─── Tabela de log de reativações (pra debug + métrica de UI) ─── */
CREATE TABLE IF NOT EXISTS public.rewarm_log (
  id bigserial PRIMARY KEY,
  tenant_id uuid NOT NULL,
  contact_id uuid NOT NULL,
  triggered_at timestamptz NOT NULL DEFAULT now(),
  outcome text NOT NULL,  -- 'template_sent', 'template_failed', 'skipped_no_template', 'skipped_feature_off', etc
  template_name text,
  error_message text,
  conversation_id uuid
);

CREATE INDEX IF NOT EXISTS rewarm_log_tenant_idx ON public.rewarm_log (tenant_id, triggered_at DESC);

/* ─── Blocklist default em system_settings ─── */
-- Lê em runtime da key rewarm_blocklist_patterns (JSON array de regex strings)
-- ou cai no default hardcoded da função trigger
INSERT INTO public.system_settings (tenant_id, setting_key, setting_value)
SELECT
  id,
  'rewarm_blocklist_patterns',
  jsonb_build_object('patterns', jsonb_build_array(
    'im.vel.+(alugad|vendid|fechad)',
    'ja.+(encontr(ou|ei)|comprou|alugou)',
    'pedi.+nao.+contatar',
    'nao.+quer.+contato',
    'solicitou.+descadastr',
    'opt.?out',
    'falecid',
    'duplicad',
    'spam',
    'inv.lid',
    'nao.+tem.+interesse',
    'sem.+interesse',
    'desist(iu|i).+defin',
    'arquivado pela aimee'
  ))
FROM public.tenants
WHERE NOT EXISTS (
  SELECT 1 FROM public.system_settings ss
  WHERE ss.tenant_id = tenants.id AND ss.setting_key = 'rewarm_blocklist_patterns'
);

/* ─── Função que checa se o motivo match a blocklist ─── */
CREATE OR REPLACE FUNCTION public.reason_matches_rewarm_blocklist(
  p_tenant_id uuid,
  p_reason text
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  patterns jsonb;
  pattern text;
  reason_norm text;
BEGIN
  IF p_reason IS NULL OR length(trim(p_reason)) = 0 THEN
    RETURN false;
  END IF;

  reason_norm := lower(unaccent(p_reason));

  SELECT setting_value->'patterns' INTO patterns
  FROM public.system_settings
  WHERE tenant_id = p_tenant_id AND setting_key = 'rewarm_blocklist_patterns';

  IF patterns IS NULL THEN
    RETURN false;
  END IF;

  FOR pattern IN SELECT jsonb_array_elements_text(patterns)
  LOOP
    IF reason_norm ~ pattern THEN
      RETURN true;
    END IF;
  END LOOP;

  RETURN false;
END;
$$;

/* ─── Garantir extension unaccent disponível ─── */
CREATE EXTENSION IF NOT EXISTS unaccent;

/* ─── Trigger: ao transitar pra 'Arquivado', agenda reaquecimento se elegível ─── */
CREATE OR REPLACE FUNCTION public.schedule_rewarm_on_archive()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  t_enabled boolean;
  cooldown_days int;
  is_blocked boolean;
BEGIN
  -- Só processa UPDATE (não INSERT — evita disparar ao importar leads já arquivados)
  IF TG_OP <> 'UPDATE' THEN RETURN NEW; END IF;

  -- Só reage se transitou PARA 'Arquivado'
  IF NEW.crm_status IS DISTINCT FROM 'Arquivado' THEN RETURN NEW; END IF;
  IF OLD.crm_status = 'Arquivado' THEN RETURN NEW; END IF;

  -- Checa feature flag do tenant
  SELECT auto_rewarm_enabled INTO t_enabled FROM public.tenants WHERE id = NEW.tenant_id;
  IF NOT COALESCE(t_enabled, false) THEN
    NEW.reactivation_blocked_reason := 'feature_disabled';
    NEW.reactivation_scheduled_at := NULL;
    NEW.assigned_broker_id := NULL; -- desvincula mesmo com feature off? Sim: evita confusão. Pode override no app.
    RETURN NEW;
  END IF;

  -- Checa se já foi tentado antes
  IF NEW.reactivation_attempts >= 1 THEN
    NEW.reactivation_blocked_reason := 'attempts_exceeded';
    NEW.reactivation_scheduled_at := NULL;
    RETURN NEW;
  END IF;

  -- Checa blocklist
  is_blocked := public.reason_matches_rewarm_blocklist(NEW.tenant_id, NEW.crm_archive_reason);
  IF is_blocked THEN
    NEW.reactivation_blocked_reason := 'blocklist';
    NEW.reactivation_scheduled_at := NULL;
    NEW.assigned_broker_id := NULL;
    RETURN NEW;
  END IF;

  -- Elegível: agenda reaquecimento e desvincula corretor
  cooldown_days := COALESCE(
    (SELECT (setting_value->>'days')::int FROM public.system_settings
     WHERE tenant_id = NEW.tenant_id AND setting_key = 'rewarm_cooldown_days'),
    2
  );
  NEW.reactivation_scheduled_at := now() + (cooldown_days || ' days')::interval;
  NEW.reactivation_blocked_reason := NULL;
  NEW.assigned_broker_id := NULL;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS schedule_rewarm_trigger ON public.contacts;
CREATE TRIGGER schedule_rewarm_trigger
  BEFORE UPDATE ON public.contacts
  FOR EACH ROW
  EXECUTE FUNCTION public.schedule_rewarm_on_archive();

/* ─── pg_cron diário às 09h (BRT = 12h UTC) ─── */
DO $$
DECLARE old_jobid int;
BEGIN
  SELECT jobid INTO old_jobid FROM cron.job WHERE jobname = 'rewarm-archived-leads-daily';
  IF old_jobid IS NOT NULL THEN PERFORM cron.unschedule(old_jobid); END IF;
END $$;

SELECT cron.schedule(
  'rewarm-archived-leads-daily',
  '0 12 * * *',
  $CRON$
  SELECT net.http_post(
    url := 'https://vnysbpnggnplvgkfokin.supabase.co/functions/v1/rewarm-archived-leads',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb,
    timeout_milliseconds := 300000
  );
  $CRON$
);
