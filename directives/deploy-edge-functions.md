# Directive: Deploy Edge Functions

## Goal
Fazer deploy de uma ou mais Edge Functions do Supabase após modificações no código.

## Inputs
- Nome(s) da(s) função(ões) a fazer deploy
- Projeto Supabase: `vnysbpnggnplvgkfokin`

## Tools/Scripts to use
- Supabase CLI: `supabase functions deploy <nome>`
- MCP Supabase: `get_logs` para verificar após deploy
- MCP Supabase: `deploy_edge_function` como alternativa ao CLI

## Step-by-step

### 1. Identificar a função modificada
```
supabase/functions/
  _shared/          ← Mudanças aqui afetam TODAS as funções
  ai-agent/         ← Núcleo do agente IA
  whatsapp-webhook/ ← Recepção de mensagens WhatsApp
  send-wa-message/  ← Envio manual de mensagens
  c2s-create-lead/  ← Integração CRM C2S
  manage-team/      ← Gestão de usuários
  manage-templates/ ← Templates WhatsApp
  manage-tickets/   ← Sistema de tickets
  (outros...)
```

### 2. Deploy de função única
```bash
supabase functions deploy <nome-da-funcao> --project-ref vnysbpnggnplvgkfokin
```

### 3. Deploy de múltiplas funções (quando `_shared/` foi modificado)
```bash
supabase functions deploy ai-agent --project-ref vnysbpnggnplvgkfokin
supabase functions deploy whatsapp-webhook --project-ref vnysbpnggnplvgkfokin
# ... repetir para cada função que importa o _shared modificado
```

### 4. Usar script de deploy (se `execution/deploy-functions.sh` existir)
```bash
./execution/deploy-functions.sh [nome-funcao | all]
```

### 5. Verificar após deploy
Aguardar ~30s e verificar logs:
```
MCP: get_logs(project_id: "vnysbpnggnplvgkfokin", service: "edge-function")
```

### 6. Teste rápido de smoke test
Enviar mensagem de teste pelo WhatsApp conectado ao tenant de dev.

## JWT Status por função (não alterar sem intenção)
| Função | JWT | Motivo |
|--------|-----|--------|
| `whatsapp-webhook` | OFF | Webhook público da Meta |
| `portal-leads-webhook` | OFF | Webhook externo |
| `ai-agent` | OFF | Chamada interna via service role |
| `vista-search-properties` | OFF | Chamada interna |
| `vista-get-property` | OFF | Chamada interna |
| `manage-team` | ON | Acesso autenticado |
| `manage-templates` | ON | Acesso autenticado |
| `send-wa-message` | ON | Acesso autenticado |
| `send-wa-media` | ON | Acesso autenticado |
| `send-wa-template` | ON | Acesso autenticado |
| `c2s-create-lead` | ON | Acesso autenticado |

## Edge Cases
- **`_shared/` modificado**: fazer deploy de TODAS as funções que o importam (na prática: `ai-agent`, `whatsapp-webhook`, `send-wa-message`, `c2s-create-lead`)
- **Variáveis de ambiente**: Edge Functions usam secrets do Supabase, não `.env` local. Verificar com `supabase secrets list --project-ref vnysbpnggnplvgkfokin`
- **Deploy falhou**: verificar sintaxe TypeScript com `deno check supabase/functions/<nome>/index.ts` antes de fazer deploy
- **Função não existe ainda**: primeiro deploy cria a função; deploys subsequentes criam nova versão

## Variáveis de ambiente necessárias (Supabase Secrets)
```
LOVABLE_API_KEY     → API do LLM (Gemini via Lovable Gateway)
OPENAI_API_KEY      → Embeddings (text-embedding-3-small)
SUPABASE_URL        → URL do projeto (automático)
SUPABASE_SERVICE_ROLE_KEY → Chave service role (automático)
```

## Self-annealing notes
- Supabase Edge Functions usam Deno, não Node.js — imports devem ser de `npm:` ou `https://`
- Erros de importação de `_shared/` aparecem como erro 500 sem stack trace claro → checar sintaxe antes do deploy
- Deploy leva ~10-20s para propagar globalmente
