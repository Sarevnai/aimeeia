-- CAUSA RAIZ DEFINITIVA do CHANNEL_ERROR que a Smolka estava tendo:
-- o Supabase Realtime particiona realtime.messages por dia (inserted_at).
-- O job interno que deveria criar novas partições automaticamente parou,
-- e a última partição existente era de 2026_04_13. A partir de 2026_04_14,
-- qualquer tentativa de gravar log de subscription/presence caía em erro de
-- "no partition of relation found for row", o Realtime fechava o canal e
-- o client recebia CHANNEL_ERROR err: null em loop.
--
-- Fix em 2 partes:
-- 1) Criar partições faltando até começo de maio.
-- 2) Função + pg_cron que garante partições pros próximos 7 dias, rodando
--    todo dia às 03:00 UTC.

CREATE TABLE IF NOT EXISTS realtime.messages_2026_04_14 PARTITION OF realtime.messages FOR VALUES FROM ('2026-04-14') TO ('2026-04-15');
CREATE TABLE IF NOT EXISTS realtime.messages_2026_04_15 PARTITION OF realtime.messages FOR VALUES FROM ('2026-04-15') TO ('2026-04-16');
CREATE TABLE IF NOT EXISTS realtime.messages_2026_04_16 PARTITION OF realtime.messages FOR VALUES FROM ('2026-04-16') TO ('2026-04-17');
CREATE TABLE IF NOT EXISTS realtime.messages_2026_04_17 PARTITION OF realtime.messages FOR VALUES FROM ('2026-04-17') TO ('2026-04-18');
CREATE TABLE IF NOT EXISTS realtime.messages_2026_04_18 PARTITION OF realtime.messages FOR VALUES FROM ('2026-04-18') TO ('2026-04-19');
CREATE TABLE IF NOT EXISTS realtime.messages_2026_04_19 PARTITION OF realtime.messages FOR VALUES FROM ('2026-04-19') TO ('2026-04-20');
CREATE TABLE IF NOT EXISTS realtime.messages_2026_04_20 PARTITION OF realtime.messages FOR VALUES FROM ('2026-04-20') TO ('2026-04-21');
CREATE TABLE IF NOT EXISTS realtime.messages_2026_04_21 PARTITION OF realtime.messages FOR VALUES FROM ('2026-04-21') TO ('2026-04-22');
CREATE TABLE IF NOT EXISTS realtime.messages_2026_04_22 PARTITION OF realtime.messages FOR VALUES FROM ('2026-04-22') TO ('2026-04-23');
CREATE TABLE IF NOT EXISTS realtime.messages_2026_04_23 PARTITION OF realtime.messages FOR VALUES FROM ('2026-04-23') TO ('2026-04-24');
CREATE TABLE IF NOT EXISTS realtime.messages_2026_04_24 PARTITION OF realtime.messages FOR VALUES FROM ('2026-04-24') TO ('2026-04-25');
CREATE TABLE IF NOT EXISTS realtime.messages_2026_04_25 PARTITION OF realtime.messages FOR VALUES FROM ('2026-04-25') TO ('2026-04-26');
CREATE TABLE IF NOT EXISTS realtime.messages_2026_04_26 PARTITION OF realtime.messages FOR VALUES FROM ('2026-04-26') TO ('2026-04-27');
CREATE TABLE IF NOT EXISTS realtime.messages_2026_04_27 PARTITION OF realtime.messages FOR VALUES FROM ('2026-04-27') TO ('2026-04-28');
CREATE TABLE IF NOT EXISTS realtime.messages_2026_04_28 PARTITION OF realtime.messages FOR VALUES FROM ('2026-04-28') TO ('2026-04-29');
CREATE TABLE IF NOT EXISTS realtime.messages_2026_04_29 PARTITION OF realtime.messages FOR VALUES FROM ('2026-04-29') TO ('2026-04-30');
CREATE TABLE IF NOT EXISTS realtime.messages_2026_04_30 PARTITION OF realtime.messages FOR VALUES FROM ('2026-04-30') TO ('2026-05-01');
CREATE TABLE IF NOT EXISTS realtime.messages_2026_05_01 PARTITION OF realtime.messages FOR VALUES FROM ('2026-05-01') TO ('2026-05-02');
CREATE TABLE IF NOT EXISTS realtime.messages_2026_05_02 PARTITION OF realtime.messages FOR VALUES FROM ('2026-05-02') TO ('2026-05-03');
CREATE TABLE IF NOT EXISTS realtime.messages_2026_05_03 PARTITION OF realtime.messages FOR VALUES FROM ('2026-05-03') TO ('2026-05-04');
CREATE TABLE IF NOT EXISTS realtime.messages_2026_05_04 PARTITION OF realtime.messages FOR VALUES FROM ('2026-05-04') TO ('2026-05-05');
CREATE TABLE IF NOT EXISTS realtime.messages_2026_05_05 PARTITION OF realtime.messages FOR VALUES FROM ('2026-05-05') TO ('2026-05-06');
CREATE TABLE IF NOT EXISTS realtime.messages_2026_05_06 PARTITION OF realtime.messages FOR VALUES FROM ('2026-05-06') TO ('2026-05-07');
CREATE TABLE IF NOT EXISTS realtime.messages_2026_05_07 PARTITION OF realtime.messages FOR VALUES FROM ('2026-05-07') TO ('2026-05-08');

-- Função idempotente que garante partições pros próximos 7 dias.
CREATE OR REPLACE FUNCTION public.ensure_realtime_message_partitions()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, realtime
AS $$
DECLARE
  i int;
  d date;
  part_name text;
BEGIN
  FOR i IN 0..7 LOOP
    d := (CURRENT_DATE + i)::date;
    part_name := 'messages_' || to_char(d, 'YYYY_MM_DD');
    EXECUTE format(
      'CREATE TABLE IF NOT EXISTS realtime.%I PARTITION OF realtime.messages FOR VALUES FROM (%L) TO (%L)',
      part_name, d, (d + 1)::date
    );
  END LOOP;
END
$$;

-- Cron diário às 03:00 UTC. Idempotente via "IF NOT EXISTS" na função.
-- Nota: unschedule antes pra caso de re-apply.
DO $$
BEGIN
  PERFORM cron.unschedule('realtime-messages-auto-partition');
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

SELECT cron.schedule(
  'realtime-messages-auto-partition',
  '0 3 * * *',
  $$SELECT public.ensure_realtime_message_partitions();$$
);
