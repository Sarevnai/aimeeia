# Directive: Add Feature Frontend

## Goal
Adicionar nova página, componente ou funcionalidade ao frontend React da Aimee seguindo os padrões existentes do projeto.

## Stack
- React 18 + TypeScript
- Vite (bundler)
- Tailwind CSS + Shadcn/UI (componentes)
- Supabase JS Client (dados)
- React Router (rotas)
- Lovable (plataforma de deploy do frontend)

## Tools/Scripts to use
- Ler arquivos existentes similares antes de criar novos
- `preview_start` / `preview_screenshot` para verificar resultado visual

## Arquivos-chave a conhecer
| Arquivo | Propósito |
|---------|-----------|
| `src/App.tsx` | Rotas principais + layout |
| `src/components/AppSidebar.tsx` | Menu lateral (usuário comum) |
| `src/components/admin/AdminSidebar.tsx` | Menu lateral (admin) |
| `src/contexts/AuthContext.tsx` | Autenticação + perfil do usuário |
| `src/contexts/DepartmentFilterContext.tsx` | Filtro global de departamento |
| `src/integrations/supabase/types.ts` | Tipos TypeScript gerados do DB |

## Estrutura de diretórios
```
src/
  pages/              ← Páginas completas (uma por rota)
    admin/            ← Páginas do painel administrativo
  components/         ← Componentes reutilizáveis
    admin/            ← Componentes do painel admin
    ui/               ← Componentes Shadcn/UI (não editar)
```

## Step-by-step: Adicionar nova página

### 1. Criar o arquivo da página
```typescript
// src/pages/MinhaNovaPage.tsx
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { useEffect, useState } from 'react';

export default function MinhaNovaPage() {
  const { profile } = useAuth();
  const [data, setData] = useState([]);

  useEffect(() => {
    // Buscar dados com tenant_id automático via RLS
    supabase.from('tabela').select('*').then(({ data }) => setData(data || []));
  }, []);

  return <div>...</div>;
}
```

### 2. Adicionar rota em `src/App.tsx`
Encontrar o bloco de rotas dentro de `<Routes>` e adicionar:
```tsx
<Route path="/minha-rota" element={<MinhaNovaPage />} />
```
Se for página admin: adicionar dentro do bloco `<AdminLayout>`.

### 3. Adicionar link no sidebar
**Usuário comum** (`src/components/AppSidebar.tsx`):
Encontrar o array de items de menu e adicionar:
```tsx
{ label: 'Minha Feature', icon: IconName, path: '/minha-rota' }
```

**Admin** (`src/components/admin/AdminSidebar.tsx`): idem no array de admin.

### 4. Verificar permissões
Rotas protegidas por `useAuth().profile.role`:
- `admin`, `operator`, `viewer` — usuários do tenant
- `super_admin` — acesso cross-tenant

### 5. Verificar visualmente
```
preview_start → preview_screenshot → confirmar layout
```

## Padrões de componentes

### Busca de dados (Supabase)
```typescript
// Sempre filtrar por tenant_id via RLS (automático com anon key)
const { data, error } = await supabase
  .from('tabela')
  .select('*')
  .order('created_at', { ascending: false });
```

### Componentes Shadcn/UI disponíveis
`Button`, `Card`, `Dialog`, `Table`, `Badge`, `Input`, `Select`, `Tabs`, `Sheet`, `Skeleton`
Importar de: `@/components/ui/<nome>`

### Departamento ativo (filtro global)
```typescript
const { selectedDepartment } = useDepartmentFilter();
// null = todos os departamentos
```

## Edge Cases
- **Tipos desatualizados**: se tabela foi alterada no DB, regenerar tipos (`mcp__generate_typescript_types`)
- **RLS bloqueando**: se query retorna vazio, verificar políticas RLS da tabela
- **Rota admin vs user**: rotas admin ficam em `/admin/*` e usam `AdminLayout`
- **Realtime**: para dados em tempo real, usar `supabase.channel()` com `.on('postgres_changes', ...)`

## Self-annealing notes
- Shadcn/UI components em `src/components/ui/` são gerados automaticamente — não editar diretamente
- `AuthContext` expõe: `user` (Supabase Auth), `profile` (profiles table), `loading` (boolean)
- Deploy automático no Lovable após push para branch principal
