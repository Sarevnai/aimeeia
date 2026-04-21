-- Sprint 6.2 — REPLICA IDENTITY FULL pra conversation_states.
-- Motivo: o Realtime do Supabase precisa de FULL pra entregar `old_record`
-- em UPDATE/DELETE com payload completo. Sem isso, policies de RLS que
-- cruzam campos do registro antigo com auth.uid() falham silenciosamente
-- e a subscription não recebe eventos (às vezes derivando em CHANNEL_ERROR).
-- As outras tabelas críticas (messages, conversations, tickets, etc) já
-- estavam com FULL; conversation_states era a única com default (PK).

ALTER TABLE public.conversation_states REPLICA IDENTITY FULL;
