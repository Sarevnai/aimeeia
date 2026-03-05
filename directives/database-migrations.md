# Directive: Database Migrations

## Goal
Criar e aplicar alterações de schema no banco de dados Supabase da Aimee de forma controlada e rastreável.

## Inputs
- Descrição da mudança de schema desejada
- Projeto Supabase: `vnysbpnggnplvgkfokin`

## Tools/Scripts to use
- **DDL (CREATE, ALTER, DROP)**: usar `mcp__apply_migration` (rastreável, aparece em `supabase_migrations`)
- **DML/Queries (SELECT, INSERT, UPDATE)**: usar `mcp__execute_sql`
- **Verificação**: `mcp__list_tables`, `mcp__list_migrations`, `mcp__execute_sql`

## Convenção de nomenclatura
```
supabase/migrations/YYYYMMDDHHMMSS_descricao_snake_case.sql
Exemplos:
  20260301000000_create_tickets_tables.sql
  20260302000000_enable_realtime_messages.sql
  20260303120000_add_column_to_profiles.sql
```

## Step-by-step

### 1. Entender o schema atual
```
MCP: list_tables(project_id: "vnysbpnggnplvgkfokin", schemas: ["public"])
MCP: execute_sql("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'nome_tabela'")
```

### 2. Escrever o SQL da migration
Seguir padrões do projeto:
- Sempre incluir `tenant_id UUID REFERENCES tenants(id)` em tabelas de dados
- RLS obrigatório para tabelas acessadas pelo frontend
- `created_at TIMESTAMPTZ DEFAULT now()` e `updated_at TIMESTAMPTZ DEFAULT now()`

### 3. Aplicar via MCP (preferido)
```
MCP: apply_migration(
  project_id: "vnysbpnggnplvgkfokin",
  name: "descricao_snake_case",
  query: "<SQL aqui>"
)
```

### 4. Salvar o arquivo localmente também
Criar arquivo em `supabase/migrations/TIMESTAMP_nome.sql` com o mesmo SQL.

### 5. Verificar aplicação
```
MCP: list_migrations(project_id: "vnysbpnggnplvgkfokin")
MCP: execute_sql("SELECT * FROM nome_tabela LIMIT 5")
```

### 6. Atualizar tipos TypeScript (se necessário)
```
MCP: generate_typescript_types(project_id: "vnysbpnggnplvgkfokin")
```
Copiar output para `src/integrations/supabase/types.ts`.

### 7. Verificar advisories de segurança após DDL
```
MCP: get_advisors(project_id: "vnysbpnggnplvgkfokin", type: "security")
```
Principalmente verificar: tabelas sem RLS, políticas faltando.

## Padrão de RLS (multi-tenant)
```sql
-- Habilitar RLS
ALTER TABLE nome_tabela ENABLE ROW LEVEL SECURITY;

-- Política padrão (tenant isolado)
CREATE POLICY "Tenant isolation" ON nome_tabela
  USING (tenant_id = get_user_tenant_id());

-- Super admin (cross-tenant)
CREATE POLICY "Super admin read all" ON nome_tabela
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
  );
```

## Edge Cases
- **Nunca usar IDs hardcoded em data migrations** — usar subqueries para buscar IDs por nome
- **ALTER COLUMN em produção**: cuidado com colunas existentes que têm dados — pode quebrar
- **Índices em tabelas grandes**: criar com `CREATE INDEX CONCURRENTLY` para não travar
- **Rollback**: Supabase não suporta rollback automático de migrations — sempre testar em branch primeiro se possível

## Self-annealing notes
- Migrations já aplicadas estão em `supabase/migrations/` (prefixo `2026030X`)
- A tabela `supabase_migrations.schema_migrations` registra o histórico
- Se migration falhar com erro de constraint → verificar se tabela dependente existe primeiro
- Tipos TypeScript desatualizados podem causar erros silenciosos no frontend — sempre atualizar após ALTER TABLE
