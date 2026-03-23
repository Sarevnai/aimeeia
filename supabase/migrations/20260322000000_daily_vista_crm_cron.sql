-- ============================================================
-- Migration: Vista CRM Automatic Sync Cron Jobs
-- Date: 2026-03-22
-- Delta sync diário + Full sync semanal
-- ============================================================

-- ============================================================
-- 1. Function: Delta sync para todos os tenants Vista
-- ============================================================

CREATE OR REPLACE FUNCTION public.daily_vista_crm_sync()
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  rec RECORD;
  synced INT := 0;
  request_id bigint;
  base_url TEXT;
  auth_key TEXT;
BEGIN
  SELECT decrypted_secret INTO base_url FROM vault.decrypted_secrets WHERE name = 'project_url';
  SELECT decrypted_secret INTO auth_key FROM vault.decrypted_secrets WHERE name = 'anon_key';

  IF base_url IS NULL OR auth_key IS NULL THEN
    RAISE EXCEPTION 'Missing vault secrets: project_url or anon_key';
  END IF;

  FOR rec IN
    SELECT id FROM tenants
    WHERE crm_type = 'vista'
      AND crm_api_key IS NOT NULL
      AND crm_api_url IS NOT NULL
      AND is_active = true
  LOOP
    SELECT net.http_post(
      url     := base_url || '/functions/v1/crm-sync-properties',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || auth_key
      ),
      body    := jsonb_build_object(
        'tenant_id', rec.id,
        'full_sync', false
      )
    ) INTO request_id;

    synced := synced + 1;
  END LOOP;

  RETURN synced;
END;
$$;

-- ============================================================
-- 2. Function: Full sync semanal para todos os tenants Vista
-- ============================================================

CREATE OR REPLACE FUNCTION public.weekly_vista_crm_full_sync()
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  rec RECORD;
  synced INT := 0;
  request_id bigint;
  base_url TEXT;
  auth_key TEXT;
BEGIN
  SELECT decrypted_secret INTO base_url FROM vault.decrypted_secrets WHERE name = 'project_url';
  SELECT decrypted_secret INTO auth_key FROM vault.decrypted_secrets WHERE name = 'anon_key';

  IF base_url IS NULL OR auth_key IS NULL THEN
    RAISE EXCEPTION 'Missing vault secrets: project_url or anon_key';
  END IF;

  FOR rec IN
    SELECT id FROM tenants
    WHERE crm_type = 'vista'
      AND crm_api_key IS NOT NULL
      AND crm_api_url IS NOT NULL
      AND is_active = true
  LOOP
    SELECT net.http_post(
      url     := base_url || '/functions/v1/crm-sync-properties',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || auth_key
      ),
      body    := jsonb_build_object(
        'tenant_id', rec.id,
        'full_sync', true
      )
    ) INTO request_id;

    synced := synced + 1;
  END LOOP;

  RETURN synced;
END;
$$;

-- ============================================================
-- 3. pg_cron jobs
-- ============================================================

-- Delta sync diário às 4h UTC (1h BRT)
SELECT cron.schedule(
  'daily-vista-crm-sync',
  '0 4 * * *',
  $$SELECT daily_vista_crm_sync()$$
);

-- Full sync semanal aos domingos às 5h UTC (2h BRT)
SELECT cron.schedule(
  'weekly-vista-crm-full-sync',
  '0 5 * * 0',
  $$SELECT weekly_vista_crm_full_sync()$$
);
