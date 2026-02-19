

# Corrigir Integração Vista CRM

## Problema
As edge functions `vista-search-properties` e `vista-get-property` falham porque o tipo `Tenant` espera o campo `crm_base_url`, mas a coluna no banco de dados se chama `crm_api_url`. O `SELECT *` retorna `crm_api_url`, e o codigo checa `crm_base_url` que e `undefined`.

## Solucao

Alinhar o tipo `Tenant` com o banco de dados, trocando `crm_base_url` por `crm_api_url` em todos os arquivos que o referenciam.

## Arquivos a alterar

### 1. `supabase/functions/_shared/types.ts`
- Renomear `crm_base_url` para `crm_api_url` na interface `Tenant` (linha 19)

### 2. `supabase/functions/vista-search-properties/index.ts`
- Linha 35: trocar `t.crm_base_url` por `t.crm_api_url`
- Linha 121: trocar `tenant.crm_base_url` por `tenant.crm_api_url`
- Linha 165: trocar `tenant.crm_base_url` por `tenant.crm_api_url`

### 3. `supabase/functions/vista-get-property/index.ts`
- Linha 30: trocar `t.crm_base_url` por `t.crm_api_url`
- Linha 35: trocar `t.crm_base_url` por `t.crm_api_url`

### 4. Verificar outros arquivos shared
- Checar `_shared/property.ts` por referencias a `crm_base_url`

## Validacao
Apos o deploy, chamar novamente:
```
POST /vista-search-properties
{ "tenant_id": "a0000000-...-000000000001", "search_params": { "finalidade": "locacao", "cidade": "Florianopolis" } }
```
Deve retornar uma lista de imoveis ao inves do erro 400.

