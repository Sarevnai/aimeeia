-- C3: Adicionar campo detected_timeline à tabela lead_qualification
-- Armazena o prazo de decisão do cliente: "0-3m", "3-6m", "6m+"
ALTER TABLE lead_qualification
ADD COLUMN IF NOT EXISTS detected_timeline text DEFAULT NULL;

COMMENT ON COLUMN lead_qualification.detected_timeline IS 'Prazo de decisão do cliente: 0-3m, 3-6m, 6m+';
