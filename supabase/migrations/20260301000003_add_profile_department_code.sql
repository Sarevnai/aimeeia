-- Add department_code to profiles table
-- This enables UI isolation per department (administrativo vs vendas vs locacao)

ALTER TABLE profiles ADD COLUMN department_code department_type;

-- Index for efficient queries filtering by department
CREATE INDEX idx_profiles_department_code ON profiles(department_code) WHERE department_code IS NOT NULL;
