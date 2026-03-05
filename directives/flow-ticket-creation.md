# Flow: Ticket Creation (Criação de Chamado Administrativo)

## Trigger
LLM chama a ferramenta `criar_ticket`.
Disponível apenas para departamento `administrativo`.
O LLM decide chamar quando cliente reporta: manutenção, problema estrutural, dúvida sobre boleto/contrato, etc.

## Inputs (args da ferramenta)
| Arg | Tipo | Obrigatório | Descrição |
|-----|------|-------------|-----------|
| `titulo` | string | Sim | Título curto do chamado |
| `categoria` | string | Sim | Nome da categoria (deve existir em `ticket_categories`) |
| `descricao` | string | Sim | Descrição detalhada do problema |
| `prioridade` | string | Não | `urgente`, `alta`, `media`, `baixa` (default: `media`) |

### Guia de prioridade (injetado no prompt do LLM)
- **URGENTE**: Vazamento de água/gás, falta de luz/água, emergências
- **ALTA**: Boletos vencidos, problemas estruturais sérios
- **MÉDIA**: Manutenção geral, dúvidas contratuais
- **BAIXA**: Informações gerais, solicitações sem urgência

## Decision Logic

### 1. Lookup de Categoria
```sql
SELECT id, sla_hours FROM ticket_categories
WHERE tenant_id = ? AND name = ? AND is_active = true
LIMIT 1
```
- Se não encontrar: `sla_hours = 48` (fallback padrão)

### 2. Lookup de Stage Padrão
```sql
SELECT id FROM ticket_stages
WHERE tenant_id = ? AND order_index = 0
LIMIT 1
```
- Primeiro stage da fila (geralmente "Novo")

### 3. Calcular SLA Deadline
```
sla_deadline = now() + sla_hours * 60 * 60 * 1000
```

### 4. Inserir Ticket
```sql
INSERT INTO tickets (
  tenant_id, title, category, category_id, description,
  priority, stage, stage_id, phone, source, contact_id,
  conversation_id, department_code, sla_deadline
)
```
- `source: 'whatsapp_ai'` identifica tickets criados pela IA
- `department_code: 'administrativo'` sempre fixo

### 5. Log de Atividade
Chama `logActivity()` com `event_type: 'ticket_created'`

## Execution
- Código: `supabase/functions/ai-agent/index.ts:467-542`
- Função: `executeCreateTicket()`

## Outputs
| Ação | Tabela |
|------|--------|
| Cria ticket | `tickets` |
| Log de atividade | `activity_logs` (via `logActivity()`) |
| Resposta ao cliente | "Chamado #XXXXXXXX criado. Categoria: X. Prioridade: Y." |

## Diferença de `encaminhar_humano`
- `criar_ticket`: cria registro + IA continua ativa (pode continuar conversando)
- `encaminhar_humano`: desativa IA + transfere para operador humano
- O LLM deve usar `criar_ticket` para problemas reportáveis + `encaminhar_humano` quando precisa de atendimento imediato

## Edge Cases
- **Categoria inexistente**: ticket é criado sem `category_id` (null), usa SLA padrão de 48h
- **Stage inexistente**: `stage_id` fica null, campo `stage` recebe string "Novo"
- **Erro de inserção**: retorna mensagem pedindo desculpas + encaminha para humano
- **Múltiplos tickets**: sem restrição — o mesmo lead pode criar N tickets em sequência
- **IA continua ativa**: ao contrário do handoff, a IA não é desativada após criar ticket

## Configuration
| Tabela | Campo | Efeito |
|--------|-------|--------|
| `ticket_categories` | `name`, `sla_hours`, `is_active` | Categorias disponíveis + prazo SLA |
| `ticket_stages` | `order_index = 0` | Stage inicial do ticket ("Novo") |
| `ai_behavior_config` | `tickets_enabled` | Se false, ferramenta não aparece no prompt |

## Self-annealing notes
- O ID do ticket retornado ao cliente usa apenas os primeiros 8 caracteres do UUID (`ticket.id.slice(0, 8)`)
- Se `ticket_categories` estiver vazia para o tenant → criar via UI admin ou migration seed antes de ativar o departamento administrativo
- Ticket criado via IA tem `source: 'whatsapp_ai'` — permite filtrar na UI
