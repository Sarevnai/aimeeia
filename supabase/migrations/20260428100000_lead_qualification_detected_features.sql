ALTER TABLE lead_qualification
  ADD COLUMN IF NOT EXISTS detected_features text[] DEFAULT '{}'::text[];
