# Flow: Property Search (Busca Semântica de Imóveis)

## Trigger
LLM chama a ferramenta `buscar_imoveis`.
Disponível apenas para departamentos `locacao` e `vendas`.
Definida em `_shared/prompts.ts` via `getToolsForDepartment()`.

## Inputs (args da ferramenta)
| Arg | Tipo | Descrição |
|-----|------|-----------|
| `query_semantica` | string | Query em linguagem natural para busca vetorial |
| `preco_max` | number | Orçamento máximo (opcional) |
| `finalidade` | string | "locacao" ou "venda" |

## Decision Logic

### 1. Geração de Embedding
- Modelo: `text-embedding-3-small` (OpenAI)
- API: `api.openai.com/v1/embeddings`
- Chave: `OPENAI_API_KEY` ou `LOVABLE_API_KEY` (fallback)
- Input: `args.query_semantica` ou `"Imóvel para {finalidade}"`

### 2. Busca Vetorial (pgvector)
- RPC: `match_properties` no Supabase
- Parâmetros:
  - `query_embedding`: vetor gerado acima
  - `match_tenant_id`: tenant_id da conversa
  - `match_threshold`: 0.2 (baixo para maximizar resultados)
  - `match_count`: 5 resultados
  - `filter_max_price`: `preco_max` ou null
  - `filter_tipo`: null (filtro por tipo é feito semanticamente)

### 3. Formatação e Envio
- Primeiro resultado → send com imagem (`sendWhatsAppImage`) se `foto_destaque` existir
- Caption: `formatConsultativeProperty(property, index=0, total)` — apresentação consultiva
- Texto de resposta ao LLM: `formatPropertySummary(properties)` — resumo de todos

### 4. Persistência do Estado
Salva em `conversation_states`:
```json
{
  "pending_properties": [...],  // lista completa para navegação futura
  "current_property_index": 0,
  "awaiting_property_feedback": true,
  "last_search_params": { "semantic_query": "...", ... }
}
```

## Execution
- Código: `supabase/functions/ai-agent/index.ts:317-403`
- Função: `executePropertySearch()`
- Helpers: `formatConsultativeProperty()` e `formatPropertySummary()` em `_shared/property.ts`
- Envio com imagem: `sendWhatsAppImage()` em `_shared/whatsapp.ts`

## Outputs
| Ação | Destino |
|------|---------|
| Envia foto + descrição do 1º imóvel | WhatsApp (Meta Cloud API) |
| Lista resumo para o LLM | Retorno da ferramenta (texto) |
| Salva resultados | `conversation_states.pending_properties` |

## Edge Cases
- **Sem resultados**: retorna mensagem sugerindo expandir busca (sem imóvel enviado)
- **Sem foto**: envia apenas texto de apresentação, pula `sendWhatsAppImage`
- **Erro de embedding**: propaga exceção → ai-agent retorna erro genérico ao cliente
- **Erro pgvector**: retorna mensagem "tente novamente" sem quebrar o fluxo
- **Sem `OPENAI_API_KEY`**: lança erro imediatamente — verifique env vars da Edge Function

## Configuration
| Tabela | Campo | Efeito |
|--------|-------|--------|
| `properties` | `embedding`, `price`, `type`, `neighborhood`, `images`, `url` | Fonte dos dados de imóveis |
| `ai_agent_config` | `vista_integration_enabled` | Se true, pode usar vista-search-properties em vez de pgvector |
| `regions` | — | Influencia a query semântica construída pelo LLM |

## Self-annealing notes
- `match_threshold: 0.2` é propositalmente baixo — preferível retornar algo impreciso a nada
- Imagens precisam ser URLs públicas acessíveis pela Meta API (não funciona com URLs de Supabase Storage com token)
- Se `vista_integration_enabled: true`, o LLM pode optar por `buscar_imoveis_vista` em vez deste flow — verificar `_shared/prompts.ts` para qual tool set está sendo retornado
- Catálogo populado via `sync-catalog-xml` Edge Function (processo separado)
