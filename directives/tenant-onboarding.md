# Directive: Tenant Onboarding

## Goal
Provisionar um novo tenant (imobiliária) na plataforma Aimee com todas as configurações necessárias para funcionamento.

## Inputs
| Campo | Obrigatório | Descrição |
|-------|-------------|-----------|
| Company name | Sim | Nome da imobiliária |
| City | Sim | Cidade principal de atuação |
| Admin email | Sim | Email do administrador principal |
| WhatsApp phone ID | Não | Phone Number ID da Meta (para WhatsApp) |
| WhatsApp access token | Não | Token de acesso Meta Cloud API |
| CRM type | Não | `c2s`, `vista`, `jetimob` ou null |

## Tools/Scripts to use
- `mcp__execute_sql` para inserções no DB
- `execution/check-tenant-config.ts` para validar ao final

## Step-by-step

### 1. Criar o tenant
```sql
INSERT INTO tenants (company_name, city, plan, is_active)
VALUES ('Nome da Imobiliária', 'Cidade', 'basic', true)
RETURNING id;
-- Salvar o tenant_id retornado
```

### 2. Criar usuário admin no Supabase Auth
> **ATENÇÃO**: Criar via Supabase Dashboard → Authentication → Users → "Invite user"
> Não é possível criar via SQL diretamente por segurança.

### 3. Criar profile vinculado ao tenant
```sql
INSERT INTO profiles (id, tenant_id, full_name, role, department_code)
VALUES (
  '<user_id do auth>',
  '<tenant_id>',
  'Nome Admin',
  'admin',
  null
);
```

### 4. Configurar agente IA (mínimo para funcionar)
```sql
INSERT INTO ai_agent_config (tenant_id, agent_name, tone, ai_model)
VALUES ('<tenant_id>', 'Aimee', 'friendly', 'google/gemini-3-flash-preview');
```

### 5. Configurar WhatsApp (se disponível)
```sql
UPDATE tenants
SET wa_phone_number_id = '<phone_id>',
    wa_access_token = '<token>',
    wa_webhook_verify_token = '<token_verify>'
WHERE id = '<tenant_id>';
```

### 6. Criar departamentos padrão (conversation_stages)
```sql
INSERT INTO conversation_stages (tenant_id, department_code, name, order_index, color)
VALUES
  ('<tenant_id>', 'locacao', 'Novo Lead', 0, '#3B82F6'),
  ('<tenant_id>', 'locacao', 'Em Qualificação', 1, '#8B5CF6'),
  ('<tenant_id>', 'locacao', 'Proposta', 2, '#F59E0B'),
  ('<tenant_id>', 'locacao', 'Fechado', 3, '#10B981'),
  ('<tenant_id>', 'vendas', 'Novo Lead', 0, '#3B82F6'),
  ('<tenant_id>', 'vendas', 'Em Qualificação', 1, '#8B5CF6'),
  ('<tenant_id>', 'vendas', 'Proposta', 2, '#F59E0B'),
  ('<tenant_id>', 'vendas', 'Fechado', 3, '#10B981'),
  ('<tenant_id>', 'administrativo', 'Novo', 0, '#6B7280'),
  ('<tenant_id>', 'administrativo', 'Em Andamento', 1, '#F59E0B'),
  ('<tenant_id>', 'administrativo', 'Resolvido', 2, '#10B981');
```

### 7. Criar categorias de ticket padrão
```sql
INSERT INTO ticket_categories (tenant_id, name, sla_hours, is_active)
VALUES
  ('<tenant_id>', 'Manutenção', 48, true),
  ('<tenant_id>', 'Boleto/Financeiro', 24, true),
  ('<tenant_id>', 'Contrato', 72, true),
  ('<tenant_id>', 'Vistoria', 48, true),
  ('<tenant_id>', 'Emergência', 4, true),
  ('<tenant_id>', 'Outros', 72, true);
```

### 8. Seed de regiões (se catálogo de imóveis estiver disponível)
```sql
INSERT INTO regions (tenant_id, region_name, neighborhoods)
VALUES
  ('<tenant_id>', 'Centro', ARRAY['Centro', 'Centro Histórico']),
  ('<tenant_id>', 'Zona Sul', ARRAY['Moema', 'Brooklin', 'Vila Nova Conceição']);
-- Adaptar para a cidade do tenant
```

### 9. Validar configuração completa
```bash
npx ts-node execution/check-tenant-config.ts --tenant-id <tenant_id>
```

## Edge Cases
- **Sem WhatsApp ainda**: tenant funciona parcialmente — sem integração WhatsApp, só admin UI
- **CRM não configurado**: `c2s-create-lead` falha silenciosamente — handoff de IA ocorre mas lead não vai ao CRM
- **Sem regiões**: busca de imóveis funciona, mas `detected_neighborhood` nunca é preenchido
- **Sem categorias de ticket**: tickets são criados com `category_id: null` e SLA de 48h padrão

## Self-annealing notes
- `get_user_tenant_id()` é função RLS que usa o JWT do usuário → profiles.tenant_id precisa estar correto
- Se usuário não consegue logar ou vê tela em branco → verificar se profile existe e tem `tenant_id` e `role` válidos
- Tenant ativo no plan `basic` — ajustar para `pro`/`enterprise` conforme contrato
