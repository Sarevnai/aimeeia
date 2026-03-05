# Flow: Triage (Roteamento de Departamento)

## Trigger
Toda mensagem recebida quando `conversation_states.triage_stage != 'completed'`.
Verificado em `ai-agent/index.ts:129` via `handleTriage()`.

## Inputs
| Campo | Origem | Descrição |
|-------|--------|-----------|
| `state.triage_stage` | `conversation_states` | Stage atual: `greeting`, `awaiting_name`, `awaiting_triage`, `completed` |
| `raw_message` | WhatsApp payload | Objeto completo (detecta button_reply vs texto livre) |
| `message_body` | WhatsApp payload | Texto da mensagem |
| `config.greeting_message` | `ai_agent_config` | Mensagem de boas-vindas customizável (fallback: padrão do código) |

## Decision Logic (por stage)

### `greeting` (padrão quando não existe estado)
→ Envia saudação com nome do agente + empresa
→ Pergunta como chamar o cliente
→ Avança para `awaiting_name`

### `awaiting_name`
→ Tenta extrair nome: texto simples (≤4 palavras) ou padrão "me chamo X" / "meu nome é X"
→ Salva nome em `contacts.name`
→ Envia "Prazer, [Nome]! Como posso te ajudar?"
→ Avança para `awaiting_triage`

### `awaiting_triage`
→ **Prioridade 1**: Clique em botão interativo (`interactive.button_reply.id`)
  IDs: `dept_locacao`, `dept_vendas`, `dept_admin`
→ **Prioridade 2**: Quick reply de template (`button.text` ou `button.payload`)
→ **Prioridade 3**: Texto livre com keywords:
  - locacao: `alug`, `locar`, `locação`
  - vendas: `comprar`, `investir`
  - administrativo: `boleto`, `contrato`, `manutenção`, `suporte`
→ **Fallback**: Envia botões interativos (Alugar / Comprar / Administrativo)
→ Se departamento detectado → avança para `completed`

### `completed`
→ `shouldContinue: false` → passa para a fase de IA

## Execution
- Código: `supabase/functions/_shared/triage.ts`
- Função principal: `handleTriage()` (linha 75)
- Mapeamento de botões: `TRIAGE_BUTTON_IDS` (linha 9)
- Envio de botões interativos: `sendWhatsAppButtons()` em `_shared/whatsapp.ts`

## Outputs
| Ação | Tabela/API |
|------|-----------|
| Atualiza stage | `conversation_states.triage_stage` (upsert por `tenant_id,phone_number`) |
| Salva nome | `contacts.name` |
| Atribui departamento | `conversations.department_code`, `conversations.stage_id` |
| Sincroniza contato | `contacts.department_code` |
| Backfill mensagens | `messages.department_code = null → department` (ai-agent/index.ts:157) |

## Edge Cases
- **Nome não detectado**: segue o fluxo sem nome (não bloqueia o triage)
- **Departamento não detectado no texto**: reenvia botões a cada mensagem até seleção
- **Ticket admin aberto**: `ai-agent/index.ts:178` sobrepõe departamento para `administrativo` mesmo após triage completar
- **Stage inexistente no conversation_stages**: `completeTriage()` não atribui `stage_id` (aceita null)

## Configuration
| Tabela | Campo | Efeito |
|--------|-------|--------|
| `ai_agent_config` | `greeting_message` | Mensagem de boas-vindas (estágio greeting) |
| `ai_agent_config` | `agent_name` | Nome do agente na saudação |
| `tenants` | `company_name` | Nome da empresa na saudação |
| `conversation_stages` | `department_code`, `order_index` | Primeiro stage do departamento após triage |

## Self-annealing notes
- Botões WhatsApp têm limite de 3 opções e 20 chars por botão — não adicionar mais departamentos
- `inferDepartmentFromText()` usa regex, não IA — palavras-chave em português apenas
- Triage é estateless do ponto de vista da IA; todo estado vive no DB
