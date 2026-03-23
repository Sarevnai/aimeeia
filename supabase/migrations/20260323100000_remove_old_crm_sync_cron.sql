-- ============================================================
-- Migration: Remove old CRM sync cron + Add daily cleanup
-- Date: 2026-03-23
-- ============================================================

-- Remove old duplicate function (cron already removed)
DROP FUNCTION IF EXISTS public.trigger_crm_sync_for_all_tenants();

-- Create cleanup function: fetches valid Codigos from Vista
-- and DELETEs any properties not in the valid set
CREATE OR REPLACE FUNCTION public.daily_vista_crm_cleanup()
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  rec RECORD;
  cleaned INT := 0;
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
        'cleanup_only', true
      )
    ) INTO request_id;

    cleaned := cleaned + 1;
  END LOOP;

  RETURN cleaned;
END;
$$;

-- Schedule cleanup diário às 4:30 UTC (1:30 BRT) - 30min após delta sync
SELECT cron.schedule(
  'daily-vista-crm-cleanup',
  '30 4 * * *',
  $$SELECT daily_vista_crm_cleanup()$$
);
