-- Adiciona suporte para catálogo XML customizado por tenant
ALTER TABLE public.tenants 
ADD COLUMN IF NOT EXISTS xml_catalog_url text,
ADD COLUMN IF NOT EXISTS xml_parser_type text;

-- Atualizar metadados dos tipos caso tenham algum default de parser
COMMENT ON COLUMN public.tenants.xml_parser_type IS 'O tipo de processador XML a usar: vivareal, zap, vista, auto, etc.';
