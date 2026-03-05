-- ============================================================
-- 1. Função reutilizável para disparar processamento de itens pendentes
--    Chama a Edge Function process-xml-queue-item via pg_net
--    Limita a batch_size para não sobrecarregar (padrão: 100 por vez)
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
  svc_key TEXT;
BEGIN
  base_url := current_setting('app.settings.edge_function_base_url', true);
  svc_key  := current_setting('app.settings.service_role_key', true);

  IF base_url IS NULL OR svc_key IS NULL THEN
    RAISE EXCEPTION 'Missing app.settings.edge_function_base_url or service_role_key';
  END IF;

  FOR rec IN
    SELECT id FROM xml_sync_queue
    WHERE status = 'pending'
    ORDER BY created_at ASC
    LIMIT batch_size
  LOOP
    -- Mark as processing to avoid double-processing
    UPDATE xml_sync_queue SET status = 'processing', updated_at = NOW() WHERE id = rec.id;

    SELECT net.http_post(
      url     := base_url || '/process-xml-queue-item',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || svc_key
      ),
      body    := jsonb_build_object('record_id', rec.id)
    ) INTO request_id;

    processed := processed + 1;
  END LOOP;

  RETURN processed;
END;
$$;

COMMENT ON FUNCTION public.reprocess_pending_xml_queue IS 
  'Dispara processamento de itens pendentes na fila XML via pg_net. Uso: SELECT reprocess_pending_xml_queue(100);';


-- ============================================================
-- 2. Função para sincronização automática diária
--    Para cada tenant com xml_catalog_url configurada,
--    chama a Edge Function sync-catalog-xml
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
  svc_key TEXT;
BEGIN
  base_url := current_setting('app.settings.edge_function_base_url', true);
  svc_key  := current_setting('app.settings.service_role_key', true);

  IF base_url IS NULL OR svc_key IS NULL THEN
    RAISE EXCEPTION 'Missing app.settings.edge_function_base_url or service_role_key';
  END IF;

  -- Limpar itens antigos completed (mais de 7 dias) para não crescer infinitamente
  DELETE FROM xml_sync_queue
  WHERE status = 'completed'
    AND updated_at < NOW() - INTERVAL '7 days';

  -- Resetar itens stuck em processing (mais de 1 hora = travados)
  UPDATE xml_sync_queue
  SET status = 'pending', error_message = NULL, updated_at = NOW()
  WHERE status = 'processing'
    AND updated_at < NOW() - INTERVAL '1 hour';

  -- Para cada tenant com URL de catálogo XML, disparar sincronização
  FOR rec IN
    SELECT id, xml_catalog_url, xml_parser_type
    FROM tenants
    WHERE xml_catalog_url IS NOT NULL
      AND xml_catalog_url != ''
      AND is_active = true
  LOOP
    SELECT net.http_post(
      url     := base_url || '/sync-catalog-xml',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || svc_key
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

COMMENT ON FUNCTION public.daily_xml_catalog_sync IS
  'Dispara sincronização XML para todos os tenants ativos com URL configurada. Usado pelo cron job diário.';


-- ============================================================
-- 3. Habilitar pg_cron e agendar job diário à meia-noite (BRT = UTC-3 → 03:00 UTC)
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pg_cron SCHEMA pg_catalog;

-- Remover job anterior se existir
SELECT cron.unschedule('daily-xml-catalog-sync') 
WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'daily-xml-catalog-sync'
);

-- Agendar: todo dia às 03:00 UTC (= 00:00 BRT)
SELECT cron.schedule(
  'daily-xml-catalog-sync',
  '0 3 * * *',
  $$SELECT daily_xml_catalog_sync()$$
);

-- Agendar reprocessamento de pendentes a cada 15 minutos (lotes de 50)
-- Isso pega itens que ficaram stuck ou falharam
SELECT cron.unschedule('reprocess-xml-pending')
WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'reprocess-xml-pending'
);

SELECT cron.schedule(
  'reprocess-xml-pending',
  '*/15 * * * *',
  $$SELECT reprocess_pending_xml_queue(50)$$
);
