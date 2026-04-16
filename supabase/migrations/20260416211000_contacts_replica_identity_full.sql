-- Com REPLICA IDENTITY default (PK), o Supabase Realtime não consegue avaliar
-- filter="tenant_id=eq.X" em UPDATEs porque o tenant_id não vem no payload do
-- WAL. Resultado: clientes recebem CHANNEL_ERROR ("Offline") e nenhum evento
-- é entregue. Setar FULL faz o WAL carregar a linha inteira no UPDATE, o que
-- permite filtrar por qualquer coluna.
ALTER TABLE public.contacts REPLICA IDENTITY FULL;
ALTER TABLE public.conversations REPLICA IDENTITY FULL;

-- Garante que conversations está na publication também (modo Local do pipeline).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'conversations'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.conversations';
  END IF;
END $$;
