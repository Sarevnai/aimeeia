-- ============================================================
-- Migration: XML Reprocess Functions + Daily Cron
-- Date: 2026-03-05
-- ============================================================

-- Vault secrets (run manually, not in migration):
-- SELECT vault.create_secret('https://vnysbpnggnplvgkfokin.supabase.co', 'project_url');
-- SELECT vault.create_secret('<ANON_KEY>', 'anon_key');

-- ============================================================
-- 1. Batch reprocess pending XML queue items
-- ============================================================

CREATE OR REPLACE FUNCTION public.reprocess_pending_xml_queue(batch_size INT DEFAULT 100)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  rec RECORD;
  processed INT := 0;
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
    SELECT id FROM xml_sync_queue
    WHERE status = 'pending'
    ORDER BY created_at ASC
    LIMIT batch_size
  LOOP
    UPDATE xml_sync_queue SET status = 'processing', updated_at = NOW() WHERE id = rec.id;

    SELECT net.http_post(
      url     := base_url || '/functions/v1/process-xml-queue-item',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || auth_key
      ),
      body    := jsonb_build_object('record_id', rec.id)
    ) INTO request_id;

    processed := processed + 1;
  END LOOP;

  RETURN processed;
END;
$$;


-- ============================================================
-- 2. Daily automatic XML catalog sync for all active tenants
-- ============================================================

CREATE OR REPLACE FUNCTION public.daily_xml_catalog_sync()
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

  -- Clean old completed items (older than 7 days)
  DELETE FROM xml_sync_queue
  WHERE status = 'completed'
    AND updated_at < NOW() - INTERVAL '7 days';

  -- Reset stuck processing items (older than 1 hour)
  UPDATE xml_sync_queue
  SET status = 'pending', error_message = NULL, updated_at = NOW()
  WHERE status = 'processing'
    AND updated_at < NOW() - INTERVAL '1 hour';

  -- For each tenant with XML catalog URL, trigger sync
  FOR rec IN
    SELECT id, xml_catalog_url, xml_parser_type
    FROM tenants
    WHERE xml_catalog_url IS NOT NULL
      AND xml_catalog_url != ''
      AND is_active = true
  LOOP
    SELECT net.http_post(
      url     := base_url || '/functions/v1/sync-catalog-xml',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || auth_key
      ),
      body    := jsonb_build_object(
        'tenant_id', rec.id,
        'xml_url', rec.xml_catalog_url,
        'parser_type', COALESCE(rec.xml_parser_type, 'auto')
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

CREATE EXTENSION IF NOT EXISTS pg_cron SCHEMA pg_catalog;

-- Daily sync at midnight BRT (03:00 UTC)
SELECT cron.schedule(
  'daily-xml-catalog-sync',
  '0 3 * * *',
  $$SELECT daily_xml_catalog_sync()$$
);

-- Reprocess pending items every 15 minutes (batch of 50)
SELECT cron.schedule(
  'reprocess-xml-pending',
  '*/15 * * * *',
  $$SELECT reprocess_pending_xml_queue(50)$$
);
