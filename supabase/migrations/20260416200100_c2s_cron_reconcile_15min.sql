-- Rebaixa o c2s-delta-sync-1min pra rodar a cada 15min.
-- Webhooks do C2S (c2s-webhook) fazem o trabalho near-realtime.
-- Delta-sync vira job de reconciliação, pra pegar qualquer evento que tenha
-- escapado (downtime, HTTP 5xx, race conditions no C2S).

DO $$
DECLARE
  old_jobid int;
BEGIN
  SELECT jobid INTO old_jobid FROM cron.job WHERE jobname = 'c2s-delta-sync-1min';
  IF old_jobid IS NOT NULL THEN
    PERFORM cron.unschedule(old_jobid);
  END IF;
END $$;

SELECT cron.schedule(
  'c2s-delta-sync-reconcile-15min',
  '*/15 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://vnysbpnggnplvgkfokin.supabase.co/functions/v1/c2s-delta-sync',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb,
    timeout_milliseconds := 55000
  );
  $$
);
