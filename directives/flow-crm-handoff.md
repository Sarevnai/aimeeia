# Flow: CRM Handoff (Transferência de Lead para Corretor)

## Trigger
LLM chama a ferramenta `enviar_lead_c2s`.
Disponível apenas para departamentos `locacao` e `vendas`.
O LLM decide chamar quando: lead qualificado quer falar com corretor, solicitou visita, ou está pronto para negociar.

## Inputs (args da ferramenta)
| Arg | Tipo | Descrição |
|-----|------|-----------|
| `motivo` | string | Razão do handoff (ex: "Cliente quer agendar visita") |

Além dos args, o executor usa:
- `tenant_id`, `phone_number`, `conversation_id`, `contact_id` (da conversa)
- `qualData` (dados de qualificação já coletados — enviados ao CRM)

## Decision Logic

### 1. Invocar c2s-create-lead
```
supabase.functions.invoke('c2s-create-lead', {
  body: { tenant_id, phone_number, conversation_id, contact_id, reason, qualification_data }
})
```
- `c2s-create-lead` usa as credenciais C2S do tenant para criar o lead no CRM externo
- Falha silenciosa: erro no c2s-create-lead não impede o handoff (try/catch)

### 2. Desativar IA
```sql
UPDATE conversation_states
SET is_ai_active = false, operator_takeover_at = now()
WHERE tenant_id = ? AND phone_number = ?
```
Após isso, `whatsapp-webhook` não invocará mais o `ai-agent` para esta conversa.

### 3. Registrar evento no histórico
- Insere mensagem system em `messages` (visível no chat do operador):
  `"Lead transferido para atendimento humano via CRM."`
- Insere em `conversation_events` (audit log): `event_type: 'ai_paused'`

## Execution
- Código: `supabase/functions/ai-agent/index.ts:405-463`
- Função: `executeLeadHandoff()`
- CRM Edge Function: `supabase/functions/c2s-create-lead/index.ts`

## Outputs
| Ação | Tabela/API |
|------|-----------|
| Cria lead no CRM | C2S API (externo) |
| Desativa IA | `conversation_states.is_ai_active = false` |
| Marca takeover | `conversation_states.operator_takeover_at = now()` |
| Mensagem sistema | `messages` com `sender_type: 'system'`, `event_type: 'ai_paused'` |
| Audit log | `conversation_events` com `event_type: 'ai_paused'` |
| Resposta ao cliente | "Vou conectar você com um de nossos corretores..." (gerado pelo LLM) |

## Reativar IA
A IA só será reativada manualmente pelo operador via UI (toggle `is_ai_active = true`).
Verificado em `whatsapp-webhook/index.ts` antes de invocar `ai-agent`.

## Edge Cases
- **Tenant sem config C2S**: `c2s-create-lead` falha internamente, mas o handoff de IA ocorre normalmente
- **CRM offline**: idem — handoff ocorre, lead pode ser registrado manualmente depois
- **Handoff duplo**: sem proteção explícita — se IA chamar a ferramenta 2x, `conversation_states` fará upsert sem duplicar (idempotente)
- **Vendas vs Locação**: ferramenta é a mesma; o `detected_interest` no `qualData` indica ao CRM o tipo de operação

## Configuration
| Tabela | Campo | Efeito |
|--------|-------|--------|
| `tenants` | `crm_type`, `c2s_token`, `c2s_empresa_id` | Credenciais e tipo de CRM ativo |
| `ai_agent_config` | — | (não afeta o handoff diretamente) |
| `ai_behavior_config` | `crm_enabled`, `functions_enabled` | Se false, ferramenta não aparece no prompt |

## Self-annealing notes
- CRMs suportados atualmente: C2S (parcial), Vista (leitura apenas). Jetimob não implementado.
- Para adicionar novo CRM: ver `directives/add-crm-integration.md`
- Se `is_ai_active` não estiver sendo setado para false → verificar se o upsert usa `onConflict: 'tenant_id,phone_number'` corretamente
