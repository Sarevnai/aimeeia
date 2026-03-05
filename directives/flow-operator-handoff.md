# Flow: Operator Handoff (Escalação para Operador Humano)

## Trigger
LLM chama a ferramenta `encaminhar_humano`.
Disponível apenas para departamento `administrativo`.
O LLM decide chamar quando: problema exige presença física, situação de emergência, cliente insistente, ou situação fora do escopo da IA.

## Inputs (args da ferramenta)
| Arg | Tipo | Descrição |
|-----|------|-----------|
| `motivo` | string | Razão do encaminhamento (ex: "Cliente precisa de vistoria presencial urgente") |

## Decision Logic

### 1. Desativar IA
```sql
UPSERT INTO conversation_states
SET is_ai_active = false, operator_takeover_at = now()
WHERE tenant_id = ? AND phone_number = ?
```
Após isso, `whatsapp-webhook/index.ts:272-282` detecta `is_ai_active = false` e não invoca mais o `ai-agent`.

### 2. Registrar mensagem de sistema
Insere em `messages`:
```json
{
  "direction": "outbound",
  "body": "Atendimento transferido para operador humano. Motivo: {motivo}",
  "sender_type": "system",
  "event_type": "ai_paused"
}
```
Visível no chat do operador como linha de sistema.

### 3. Audit log
Insere em `conversation_events`:
```json
{
  "event_type": "ai_paused",
  "metadata": { "reason": "{motivo}" }
}
```

### 4. Log de atividade
Chama `logActivity()` com `event_type: 'admin_handoff'`.

## Execution
- Código: `supabase/functions/ai-agent/index.ts:546-598`
- Função: `executeAdminHandoff()`

## Outputs
| Ação | Tabela |
|------|--------|
| Desativa IA | `conversation_states.is_ai_active = false` |
| Marca takeover | `conversation_states.operator_takeover_at = now()` |
| Mensagem sistema | `messages` com `event_type: 'ai_paused'` |
| Audit log | `conversation_events` com `event_type: 'ai_paused'` |
| Log atividade | `activity_logs` via `logActivity()` |
| Resposta ao cliente | "Um atendente em breve entrará em contato..." (gerado pelo LLM) |

## Diferença de `criar_ticket`
| | `criar_ticket` | `encaminhar_humano` |
|--|--------------|---------------------|
| IA continua? | ✅ Sim | ❌ Não |
| Cria registro | `tickets` | `conversation_events` |
| Uso ideal | Problema relatável, pode esperar | Precisa de humano agora |

## Como Reativar IA
Manualmente pelo operador na UI de chat (toggle de IA na conversa).
Não existe reativação automática por tempo.

## Edge Cases
- **Handoff duplo**: idempotente — upsert em `conversation_states` não duplica dados
- **Sem operadores online**: o cliente fica aguardando, não há notificação push configurada por padrão
- **Retorno da conversa**: se operador reativar IA depois, conversa continua do ponto em que parou (histórico preservado)
- **Ferramenta só disponível para admin**: locacao/vendas usam `enviar_lead_c2s` para handoff

## Configuration
| Tabela | Campo | Efeito |
|--------|-------|--------|
| `ai_behavior_config` | `functions_enabled` | Se false, ferramenta não aparece no prompt |
| `conversation_states` | `is_ai_active` | Flag verificada pelo webhook antes de invocar IA |

## Self-annealing notes
- Se IA continuar respondendo após handoff → verificar se `whatsapp-webhook` está checando `is_ai_active` antes de invocar `ai-agent` (linha 272-282 do webhook)
- Se operador quiser pausar a IA manualmente sem motivo → pode fazer UPDATE direto em `conversation_states.is_ai_active = false`
