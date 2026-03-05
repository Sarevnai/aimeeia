# Directive: Add CRM Integration

## Goal
Integrar um novo CRM (ex: Jetimob) ao fluxo da Aimee para receber leads qualificados.

## CRMs atualmente suportados
| CRM | Status | Edge Function |
|-----|--------|---------------|
| C2S (Construtor de Vendas) | ✅ Funcional | `c2s-create-lead` |
| Vista | ✅ Leitura de catálogo | `vista-search-properties`, `vista-get-property` |
| Jetimob | ❌ Não implementado | — |

## Inputs
- Nome do novo CRM
- Documentação da API (endpoint de criação de lead, formato JSON, autenticação)
- Campos necessários (nome, telefone, interesse, etc.)

## Tools/Scripts to use
- Ler `supabase/functions/c2s-create-lead/index.ts` como referência de implementação
- MCP Supabase para migration de colunas de credenciais

## Step-by-step

### 1. Adicionar colunas de credenciais no tenant
```sql
ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS jetimob_token TEXT,
  ADD COLUMN IF NOT EXISTS jetimob_empresa_id TEXT;
```
Criar migration: `supabase/migrations/TIMESTAMP_add_jetimob_columns.sql`

### 2. Criar a Edge Function
```
supabase/functions/jetimob-create-lead/index.ts
```
Estrutura base (copiar de `c2s-create-lead/index.ts`):
```typescript
serve(async (req) => {
  // 1. Verificar JWT (esta função deve ter JWT ON)
  // 2. Ler body: { tenant_id, phone_number, conversation_id, contact_id, reason, qualification_data }
  // 3. Buscar credenciais do tenant (jetimob_token, jetimob_empresa_id)
  // 4. Montar payload no formato da API Jetimob
  // 5. POST para a API externa
  // 6. Retornar { success, lead_id }
});
```

### 3. Adicionar tipo `crm_type` no enum (se aplicável)
```sql
ALTER TYPE crm_type_enum ADD VALUE IF NOT EXISTS 'jetimob';
```
Ou verificar se `crm_type` é TEXT — neste caso não precisa de migration.

### 4. Adicionar ferramenta alternativa no prompt do agente
Em `supabase/functions/_shared/prompts.ts`, verificar `getToolsForDepartment()`.
O tool de handoff atual chama sempre `enviar_lead_c2s` — se o CRM for diferente, pode ser necessário tornar o nome da ferramenta genérico ou condicional por `tenant.crm_type`.

### 5. Atualizar execução do handoff em `ai-agent/index.ts`
Em `executeLeadHandoff()` (linha 405), condicionar qual Edge Function invocar:
```typescript
const crmFunction = tenant.crm_type === 'jetimob'
  ? 'jetimob-create-lead'
  : 'c2s-create-lead';
await supabase.functions.invoke(crmFunction, { body: { ... } });
```

### 6. Deploy da nova Edge Function
```bash
supabase functions deploy jetimob-create-lead --project-ref vnysbpnggnplvgkfokin
```
Verificar JWT ON em `supabase/config.toml`.

### 7. Adicionar UI de configuração no painel admin
Em `src/pages/admin/AdminTenantDetailPage.tsx`, adicionar seção de credenciais Jetimob.
Seguir padrão da seção C2S existente.

### 8. Atualizar tipos TypeScript
```
MCP: generate_typescript_types(project_id: "vnysbpnggnplvgkfokin")
```
Copiar para `src/integrations/supabase/types.ts`.

### 9. Testar
```bash
npx ts-node execution/test-ai-agent.ts \
  --tenant-id <tenant_jetimob> \
  --message "quero ver imóveis para comprar"
```
Verificar se lead chegou no Jetimob.

## Edge Cases
- **API externa com rate limit**: adicionar retry com backoff exponencial na Edge Function
- **Autenticação OAuth vs API Key**: adaptar o header de autenticação conforme a API do CRM
- **Campos obrigatórios variados**: cada CRM tem campos diferentes — mapear cuidadosamente
- **CRM fora do ar**: handoff de IA deve ocorrer mesmo se CRM falhar (try/catch sem re-throw)

## Self-annealing notes
- Sempre usar `try/catch` no bloco de chamada à API externa — falha no CRM não deve quebrar o handoff
- Credenciais são armazenadas em plain text na tabela `tenants` (não criptografado atualmente)
- Ao testar: usar tenant de dev/staging para não poluir dados de produção do CRM
- Ver skill `c2s-integration` para instruções detalhadas do C2S especificamente
