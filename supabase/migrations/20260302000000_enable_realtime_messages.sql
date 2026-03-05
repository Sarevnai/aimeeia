-- =========================================================
-- Habilitar Realtime na tabela messages para chat em tempo real
-- Issue 3: ChatPage já possui subscription postgres_changes,
-- mas a tabela precisa estar na publicação supabase_realtime.
-- =========================================================

-- Adicionar tabela messages à publicação Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE messages;

-- FULL replica identity garante que o filtro por conversation_id
-- funcione corretamente nas subscriptions com filter
ALTER TABLE messages REPLICA IDENTITY FULL;
