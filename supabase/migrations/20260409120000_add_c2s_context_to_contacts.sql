-- Restaura colunas de contexto de remarketing C2S que o loadRemarketingContext ja esperava.
-- Motivacao: a planilha de importacao do C2S traz a coluna `observacoes` em formato
-- pipe-delimited com Motivo, Status, Imovel, Bairro, Preco, Fonte, Obs. Esses campos
-- sao parseados no frontend pelo LeadImportSheet e guardados aqui em colunas estruturadas
-- pra que a Aimee possa injeta-los no prompt durante conversas de remarketing.

ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS crm_archive_reason text,
  ADD COLUMN IF NOT EXISTS crm_natureza text,
  ADD COLUMN IF NOT EXISTS crm_neighborhood text,
  ADD COLUMN IF NOT EXISTS crm_property_ref text,
  ADD COLUMN IF NOT EXISTS crm_price_hint text,
  ADD COLUMN IF NOT EXISTS crm_source text,
  ADD COLUMN IF NOT EXISTS crm_broker_notes text,
  ADD COLUMN IF NOT EXISTS crm_status text;

COMMENT ON COLUMN public.contacts.crm_archive_reason IS 'C2S: motivo pelo qual o lead foi arquivado (ex: Falta de interacao do usuario, Apenas pesquisando)';
COMMENT ON COLUMN public.contacts.crm_natureza IS 'C2S: natureza do interesse anterior (venda, locacao, temporada)';
COMMENT ON COLUMN public.contacts.crm_neighborhood IS 'C2S: bairro de interesse do lead (ex: Jurere, Centro)';
COMMENT ON COLUMN public.contacts.crm_property_ref IS 'C2S: referencia do imovel visto (ex: [55766] Apartamento 1q Jurere)';
COMMENT ON COLUMN public.contacts.crm_price_hint IS 'C2S: faixa de preco do imovel visto (ex: R$ 3.500,00)';
COMMENT ON COLUMN public.contacts.crm_source IS 'C2S: portal de origem do lead (ex: Chaves na Mao, Grupo Zap)';
COMMENT ON COLUMN public.contacts.crm_broker_notes IS 'C2S: anotacao livre do corretor sobre o lead';
COMMENT ON COLUMN public.contacts.crm_status IS 'C2S: status do lead no CRM (Arquivado, Em negociacao, etc.)';
