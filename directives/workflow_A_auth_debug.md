# Directive: Auth & Profile Debug (Workflow A)

## Goal
Diagnosticar por que um usuário com autenticação Supabase válida não consegue carregar seu `profile`, resultando em roles ausentes e loops de redirect na aplicação.

## Inputs
| Campo | Obrigatório | Descrição |
|-------|-------------|-----------|
| User UUID | Sim | ID do usuário em `auth.users` |
| Tenant ID | Não | Para verificar isolamento RLS |
| Descrição do erro | Sim | Ex: "tela em branco", "redirect loop", "perfil nulo" |

## Tools/Scripts to use
- `mcp__execute_sql` para queries no DB
- `execution/check_users.js` para validar existência de profile
- `execution/fix_missing_profiles.sql` se profile estiver ausente
- Ler `src/contexts/AuthContext.tsx` para rastrear o fluxo de autenticação

## Step-by-step

### Fase 1: Validar Profile no DB

**1. Verificar se profile existe**
```sql
SELECT id, tenant_id, full_name, role FROM profiles WHERE id = '<user_uuid>';
```
- Se nulo → profile não foi criado. Ir para "Correção".
- Se existe → problema é RLS ou front-end.

**2. Verificar se RLS está bloqueando**
A query usada pelo frontend em `src/contexts/AuthContext.tsx`:
```javascript
supabase.from('profiles')
  .select('id, tenant_id, full_name, avatar_url, role')
  .eq('id', userId)
  .single()
```
Se retornar vazio mesmo com profile existente → RLS bloqueando SELECT.

**3. Verificar políticas RLS ativas**
```sql
SELECT policyname, cmd, qual FROM pg_policies WHERE tablename = 'profiles';
```
Política correta deve ter `USING (id = auth.uid())`.

### Fase 2: Identificar Redirect Loop

Loop ocorre quando:
1. Rota protegida: `profile = null` → redireciona para `/auth`
2. `/auth`: `session` existe → redireciona para rota protegida
3. **Fix**: estado `session válido + profile null` deve ir para `/onboarding` ou página de erro — não de volta para rota protegida

Verificar em `src/App.tsx` como `RequireAuth` trata `profile = null` vs `loading = true`.

### Fase 3: Verificar Tenant ID

```sql
SELECT p.id, p.tenant_id, t.company_name, p.role
FROM profiles p
LEFT JOIN tenants t ON t.id = p.tenant_id
WHERE p.id = '<user_uuid>';
```
Se `tenant_id = null` → `get_user_tenant_id()` retorna null → todas as queries RLS falham.

### Correção: Criar ou reparar profile ausente

**Opção A: Via script**
```bash
node execution/fix_missing_profiles.js <user_uuid> <tenant_id> <role>
```

**Opção B: Via SQL direto**
```sql
INSERT INTO profiles (id, tenant_id, full_name, role)
VALUES ('<user_uuid>', '<tenant_id>', 'Nome do Usuário', 'operator')
ON CONFLICT (id) DO UPDATE
SET tenant_id = EXCLUDED.tenant_id, role = EXCLUDED.role;
```

## Edge Cases
- **Trigger de criação não executou**: `on_auth_user_created` pode ter falhado → criar profile manualmente
- **Email não confirmado**: Supabase bloqueia login até confirmação de email
- **Tenant inativo**: `tenants.is_active = false` pode afetar queries dependendo das políticas
- **Super admin**: `role = 'super_admin'` não precisa de `tenant_id` válido para acessar `/admin`

## Outputs esperados após correção
- `profiles` tem row com `tenant_id` e `role` corretos
- Login redireciona para dashboard sem loop
- Queries retornam dados do tenant correto

## Self-annealing notes
- Se loop persistir após criar profile → verificar se `AuthContext.tsx` aguarda `profile` antes de setar `loading = false`
- Após correção de RLS → usuário precisa fazer logout + login para recarregar JWT com novo estado
- Ver `directives/tenant-onboarding.md` para o fluxo completo de criação de usuário do zero
