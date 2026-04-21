-- Realtime Authorization: sem policy em realtime.messages, TODA subscription
-- do Supabase Realtime vira CHANNEL_ERROR silencioso (err: null).
-- Projetos que migraram pros JWTs ES256 ganham RLS automática nessa tabela
-- sem policy criada — bug/pegadinha do Supabase.
--
-- A filtragem real por tenant continua sendo feita pelo RLS das tabelas de
-- aplicação (public.messages, public.conversations, etc), então aqui só
-- precisamos autorizar o role `authenticated` a ler/escrever. O que um
-- usuário vê via subscription é limitado pelas policies de public.*.

CREATE POLICY "authenticated_can_read_realtime_messages"
  ON realtime.messages
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "authenticated_can_insert_realtime_messages"
  ON realtime.messages
  FOR INSERT
  TO authenticated
  WITH CHECK (true);
