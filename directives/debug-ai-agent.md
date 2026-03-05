# Directive: Debug AI Agent

## Goal
Diagnosticar e resolver problemas no fluxo do agente IA da Aimee (WhatsApp → webhook → ai-agent → resposta).

## Inputs
- Descrição do problema (ex: "IA não está respondendo", "IA pergunta bairro repetidamente")
- Tenant ID (ou company_name para buscar)
- Número de telefone afetado (opcional)

## Tools/Scripts to use
- `mcp__get_logs` para logs de Edge Functions
- `mcp__execute_sql` para inspecionar estado no DB
- `execution/test-ai-agent.ts` para simular mensagem

## Diagnóstico por sintoma

### Sintoma: IA não responde nada

**1. Verificar logs do webhook**
```
MCP: get_logs(project_id: "vnysbpnggnplvgkfokin", service: "edge-function")
```
Buscar erros em `whatsapp-webhook` ou `ai-agent`.

**2. Verificar se IA está ativa para a conversa**
```sql
SELECT is_ai_active, triage_stage, operator_takeover_at
FROM conversation_states
WHERE tenant_id = '<tenant_id>'
  AND phone_number = '<numero>'
ORDER BY updated_at DESC LIMIT 1;
```
Se `is_ai_active = false` → operador assumiu. Reativar via UI ou:
```sql
UPDATE conversation_states
SET is_ai_active = true, operator_takeover_at = null
WHERE tenant_id = '<tenant_id>' AND phone_number = '<numero>';
```

**3. Verificar credenciais WhatsApp do tenant**
```sql
SELECT wa_phone_number_id, wa_access_token IS NOT NULL AS has_token
FROM tenants WHERE id = '<tenant_id>';
```

**4. Verificar se ai_agent_config existe**
```sql
SELECT * FROM ai_agent_config WHERE tenant_id = '<tenant_id>';
```
Se nulo → agent usa defaults, mas deve funcionar.

---

### Sintoma: IA responde mas com conteúdo errado / repete perguntas

**1. Verificar estado de qualificação**
```sql
SELECT qualification_data FROM conversations
WHERE tenant_id = '<tenant_id>'
ORDER BY created_at DESC LIMIT 5;
```

**2. Verificar anti-loop state**
```sql
SELECT last_ai_messages, triage_stage
FROM conversation_states
WHERE tenant_id = '<tenant_id>' AND phone_number = '<numero>';
```

**3. Verificar prompt customizado (ai_directives)**
```sql
SELECT department_code, content FROM ai_directives
WHERE tenant_id = '<tenant_id>';
```

---

### Sintoma: Triage travado (cliente preso em loop de seleção de departamento)

**1. Verificar triage_stage**
```sql
SELECT triage_stage, is_ai_active FROM conversation_states
WHERE tenant_id = '<tenant_id>' AND phone_number = '<numero>';
```

**2. Reset manual do triage**
```sql
UPDATE conversation_states
SET triage_stage = 'awaiting_triage'
WHERE tenant_id = '<tenant_id>' AND phone_number = '<numero>';
```

---

### Sintoma: Busca de imóveis não encontra resultados

**1. Verificar se há propriedades no catálogo**
```sql
SELECT COUNT(*) FROM properties WHERE tenant_id = '<tenant_id>';
```

**2. Verificar se embeddings estão populados**
```sql
SELECT COUNT(*) FROM properties
WHERE tenant_id = '<tenant_id>' AND embedding IS NOT NULL;
```
Se `embedding IS NULL` → rode `sync-catalog-xml` para popular.

**3. Verificar função `match_properties`**
```sql
SELECT id, similarity FROM match_properties(
  '[0.1, 0.2, ...]'::vector,  -- embedding de teste
  '<tenant_id>',
  0.2, 5, NULL, NULL
);
```

---

### Sintoma: Handoff para CRM falha silenciosamente

**1. Verificar credenciais CRM do tenant**
```sql
SELECT crm_type, c2s_token IS NOT NULL AS has_c2s, c2s_empresa_id
FROM tenants WHERE id = '<tenant_id>';
```

**2. Verificar logs do c2s-create-lead**
```
MCP: get_logs(project_id: "vnysbpnggnplvgkfokin", service: "edge-function")
```
Filtrar por `c2s-create-lead`.

---

## Simular mensagem para testar
```bash
npx ts-node execution/test-ai-agent.ts \
  --tenant-id <tenant_id> \
  --phone +5511999999999 \
  --message "Olá, quero alugar um apartamento"
```

## Consulta de logs estruturada
```
MCP: get_logs(project_id: "vnysbpnggnplvgkfokin", service: "edge-function")
```
Erros comuns nos logs:
- `Tenant not found` → tenant_id errado ou inativo
- `Embedding API error` → OPENAI_API_KEY não configurado
- `Property search vector error` → função `match_properties` não existe ou embedding dimension errado
- `Missing tenant_id or phone_number` → webhook não está enviando os campos corretos

## Self-annealing notes
- Logs de Edge Functions ficam disponíveis por 24h apenas
- `ai-agent` não tem JWT → não aparece erro de autenticação para chamadas internas
- Primeiro cold start da Edge Function pode levar 2-3s — não é erro, só latência de inicialização
- Ver também: `directives/workflow_A_auth_debug.md` para problemas de autenticação do frontend
