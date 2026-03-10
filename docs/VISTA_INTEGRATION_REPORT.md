# Relatório de Análise — Integração Vista CRM + Banco Vetorial
**Data:** 2026-03-07
**Status da integração:** Incompleta — 0 imóveis indexados
**Prioridade:** Crítica (bloqueando busca semântica da IA)

---

## 1. Estado Atual do Sistema

### Banco de Dados (confirmado via SQL)

| Item | Status |
|---|---|
| Tabela `public.properties` | ✅ Existe, estrutura correta |
| Rows em `properties` | ❌ **0 registros** |
| Embeddings gerados | ❌ **0** |
| Extensão `pgvector` (0.8.0) | ✅ Instalada |
| Extensão `pg_net` (0.19.5) | ✅ Instalada |
| Extensão `pg_cron` (1.6.4) | ✅ Instalada |
| Trigger `property_embedding_trigger` | ✅ Habilitado (mas com bugs críticos) |
| Cron job `daily-crm-sync` | ✅ Ativo (a cada 15 min, mas com bugs críticos) |

### Tenant Configurado

| Campo | Valor |
|---|---|
| Empresa | Smolka Imóveis |
| `crm_type` | `vista` |
| `crm_api_url` | `lkaimobi-rest.vistahost.com.br` (sem `http://`) |
| `crm_api_key` | `SET` (configurado) |

### Execuções da Edge Function (Logs Supabase)

| Chamada | Horário (UTC) | HTTP Status | Tempo de execução |
|---|---|---|---|
| `crm-sync-properties` (manual) | 2026-03-06 ~12:00 | 200 | **71.655s** |
| `crm-sync-properties` (manual) | 2026-03-06 ~19:45 | 200 | **72.835s** |
| `generate-property-embedding` | — | — | **Nunca executada** |

> A função rodou por 71-72 segundos, o que indica que a API Vista **está respondendo com múltiplas páginas**. Porém, resultou em **0 propriedades** no banco.

---

## 2. Bugs Críticos Identificados (ordenados por prioridade)

---

### 🔴 BUG #1 — BLOQUEADOR PRIMÁRIO: Upsert Silenciosamente Falha

**Arquivo:** `supabase/functions/crm-sync-properties/index.ts:190-201`

**O que acontece:** A Edge Function busca imóveis da API Vista com sucesso (71 segundos de paginação), mas o `upsert` no Supabase falha silenciosamente. O código captura o erro e **continua sem lançar exception**, resultando em `totalProcessed = 0` e resposta `{ success: true, message: "Successfully synced 0 properties." }`.

```typescript
// Linha 195-200 — O erro é logado mas a execução CONTINUA
if (upsertErr) {
  console.error(`Error upserting batch page ${currentPage}:`, upsertErr);
  // Decide if we should throw or continue. We continue...
} else {
  totalProcessed += propertiesBatch.length;
}
```

**Causa provável do erro no upsert:** O parâmetro `onConflict: 'tenant_id, external_id'` (com espaço após vírgula) pode não ser reconhecido corretamente pelo PostgREST no `@supabase/supabase-js@2.39.0`, fazendo a operação falhar em vez de fazer merge. A forma correta seria `'tenant_id,external_id'` (sem espaço).

**Como confirmar:** O erro real só aparece nos **logs internos da função** (console.error), não no HTTP status. Para ver, acesse o Supabase Dashboard → Edge Functions → `crm-sync-properties` → Logs.

---

### 🔴 BUG #2 — BLOQUEADOR: 404 da API Vista (reportado pelo usuário)

**Hipótese principal:** Quando a UI exibe "404 error", isso vem da resposta JSON da Edge Function: `{ error: "Vista API Error: HTTP 404 - ..." }`, retornada dentro de um HTTP 200 (o código deliberadamente wrappa erros em 200 para evitar que o supabase-js suprima o payload).

**Causa mais provável:** A API Vista retorna HTTP 404 quando a **API Key é inválida ou expirada**. Ao contrário de outros sistemas que retornam 401 para autenticação falha, o Vista retorna 404 nesse caso. Isso seria consistente com o fato de que o teste local (Node.js) pode ter funcionado com uma chave válida em um momento, mas a chave expirou ou foi inválida no ambiente da Edge Function.

**Confirmação da URL:** A documentação Vista confirma:
- ✅ Endpoint correto: `/imoveis/listar`
- ✅ Parâmetro `pesquisa` deve ser JSON encodado (o código usa `encodeURIComponent` — correto)
- ✅ Header `Accept: application/json` presente no código
- ✅ Prefixo `http://` é corrigido automaticamente pelo código

**O que verificar:**
1. A API Key armazenada em `crm_api_key` está correta e válida?
2. Testar manualmente: `curl "http://lkaimobi-rest.vistahost.com.br/imoveis/listar?key=SUA_CHAVE&pesquisa=%7B%22fields%22%3A%5B%22Codigo%22%5D%2C%22paginacao%22%3A%7B%22pagina%22%3A1%2C%22quantidade%22%3A1%7D%7D&showtotal=1" -H "Accept: application/json"`

---

### 🔴 BUG #3 — CRÍTICO: Cron Job com URL Dinâmica Quebrada

**Arquivo:** `supabase/migrations/20260306192658_setup_crm_sync_cron.sql:38-42`

```sql
PERFORM net.http_post(
    url := 'https://' || current_setting('request.headers')::json->>'host'
           || '/functions/v1/crm-sync-properties',
    headers := jsonb_build_object(
        'Authorization', 'Bearer YOUR_SERVICE_ROLE_KEY'  -- ← PLACEHOLDER LITERAL!
    ),
    ...
);
```

**Dois problemas:**

**3a — `current_setting('request.headers')` lança exceção em pg_cron:**
O pg_cron executa SQL em uma conexão de banco sem contexto HTTP. A configuração `request.headers` não existe nesse contexto e a chamada **sem** o flag `true` (missing_ok) lança `ERROR: unrecognized configuration parameter`. A função `trigger_crm_sync_for_all_tenants()` falha silenciosamente a cada 15 minutos.

**3b — Chave de autorização é um placeholder literal:**
`'Bearer YOUR_SERVICE_ROLE_KEY'` nunca foi substituído pela chave real. Mesmo que a URL fosse corrigida, o Edge Function rejeitaria o request com 401.

**Evidência:** Os registros em `net._http_response` mostram requests com `Timeout of 5000 ms reached` — indicando que pg_net está tentando chamar alguma URL, mas ou a URL está errada (lenta para DNS) ou a Edge Function leva 71 segundos e o pg_net tem timeout de 5000ms.

---

### 🔴 BUG #4 — CRÍTICO: Webhook Trigger com URL e Auth Quebradas

**Arquivo:** `supabase/migrations/20260306193949_setup_property_webhook.sql:27-40`

```sql
PERFORM net.http_post(
    url := 'https://' || current_setting('request.headers', true)::json->>'host'
           || '/functions/v1/generate-property-embedding',
    headers := jsonb_build_object(
        'Authorization', 'Bearer YOUR_SERVICE_ROLE_KEY'  -- ← PLACEHOLDER LITERAL!
    ),
    ...
);
```

**Dois problemas:**

**4a — URL pode ser malformada:**
Usa `(true)` (missing_ok), então não lança exceção. Mas quando disparado de uma conexão sem contexto HTTP, retorna `NULL`, gerando URL `https://null/functions/v1/generate-property-embedding`. Quando disparado via PostgREST (chamada do Edge Function via supabase-js), o host pode vir corretamente (`vnysbpnggnplvgkfokin.supabase.co`).

**4b — Mesmo problema do placeholder `YOUR_SERVICE_ROLE_KEY`:**
A Edge Function `generate-property-embedding` tem JWT verificado (verify_jwt = true por padrão). Sem a chave real, toda chamada resultaria em 401.

**Evidência direta:** `generate-property-embedding` nunca apareceu nos logs do Supabase. Como a tabela `properties` tem 0 rows, o trigger nunca disparou — mas mesmo que disparasse, falharia pelos bugs acima.

---

### 🟡 BUG #5 — MÉDIO: pg_net Timeout vs Tempo de Execução da Função

**Observação:** O `net.http_post` no trigger e no cron usa o timeout padrão do `pg_net`: **5000ms (5 segundos)**. A Edge Function `crm-sync-properties` leva **71+ segundos** para executar. Mesmo com a URL e auth corretas, o pg_net vai sempre fazer timeout — embora o request seja assíncrono (fire-and-forget), o pg_net registra isso como erro.

Para o embedding trigger, a `generate-property-embedding` deve responder em ~3-5 segundos (uma chamada OpenAI + um update). Isso está dentro do timeout, então não é problema para essa função.

---

### 🟡 BUG #6 — MÉDIO: OpenAI API Key Não Confirmada

**Arquivo:** `supabase/functions/generate-property-embedding/index.ts:36`

```typescript
const openaiApiKey = Deno.env.get('OPENAI_API_KEY')!;
```

O projeto usa **Google Gemini via OpenRouter** para o AI agent, mas embeddings usam **OpenAI** (`text-embedding-3-small`, 1536 dimensões). Verificar se `OPENAI_API_KEY` está configurada nas secrets da Edge Function no Supabase Dashboard.

---

### 🟡 BUG #7 — MÉDIO: Campo `description` Mapeado Errado

**Arquivo:** `supabase/functions/crm-sync-properties/index.ts:165`

```typescript
const description = imovel.Descricao || '';  // ← campo inexistente no payload!
```

A lista de `fields` na linha 96-105 inclui `"DescricaoWeb"` e `"DescricaoEmpreendimento"`, mas **não inclui `"Descricao"`**. A propriedade `imovel.Descricao` será sempre `undefined`, e a descrição ficará vazia. Isso afeta diretamente a qualidade dos embeddings gerados.

---

## 3. Análise dos Logs do Supabase (net._http_response)

```
id: 39023, Timeout após 9748ms (DNS: 2ms, TCP/SSL: 369ms, HTTP: 9375ms)
id: 39022, Timeout após 9684ms (DNS: 3ms,  TCP/SSL: 365ms, HTTP: 9314ms)
id: 38974, Timeout após 5001ms (DNS: 1555ms!, TCP/SSL: 77ms, HTTP: 3366ms)
id: 38975, Timeout após 5630ms (DNS: 71ms,  TCP/SSL: 204ms, HTTP: 5352ms)
```

**Interpretação:**
- `id 38974`: DNS lento (1555ms) → possível resolução de domínio inválido (e.g., `null.supabase.co`) buscando um servidor de fallback
- `id 39022-39023`: TCP/SSL handshake completa (~369ms), HTTP demora 9+ segundos → provavelmente alcança o servidor Supabase, mas a resposta da Edge Function leva muito tempo (timeout de pg_net de 5000ms vs 71 segundos de execução da função)
- Todos os requests resultam em **timeout, sem status_code** — pg_cron dispara o request mas a Edge Function não responde dentro do limite do pg_net

**Conclusão:** O cron job está disparando requests para alguma URL, mas a combinação de URL possivelmente malformada + placeholder de auth + timeout muito baixo (5s vs 71s) impede que qualquer sync automático funcione.

---

## 4. Plano de Correções para Implementação do Banco Vetorial

### Fase 1 — Diagnóstico (hoje)

**1.1 Verificar o erro real do upsert:**
```
Supabase Dashboard → Edge Functions → crm-sync-properties → Logs
```
Procurar por `console.error` com mensagem `"Error upserting batch"` para ver o erro exato do PostgREST.

**1.2 Validar a API Key Vista:**
```bash
node test_vista_api.js
```
Se retornar 404, a API Key está inválida. Se retornar dados, o problema é apenas no Edge Function.

**1.3 Verificar OPENAI_API_KEY:**
```
Supabase Dashboard → Edge Functions → Secrets → Verificar OPENAI_API_KEY
```

---

### Fase 2 — Correções Cirúrgicas (Sprint imediato)

#### Fix 2.1 — `crm-sync-properties`: Corrigir onConflict e mapeamento de descrição

```typescript
// Linha 193 — remover espaço após vírgula
.upsert(propertiesBatch, { onConflict: 'tenant_id,external_id' });

// Linha 165 — mapear o campo correto de descrição
const description = imovel.DescricaoWeb || imovel.Descricao || '';
```

#### Fix 2.2 — Substituir triggers SQL por Supabase Database Webhooks

Ao invés de manter o trigger `property_embedding_trigger` via pg_net com auth hardcoded, usar o **Supabase Database Webhook nativo** (configurado via dashboard):

```
Supabase Dashboard → Database → Webhooks → Create Webhook
  → Table: public.properties
  → Events: INSERT, UPDATE
  → URL: https://vnysbpnggnplvgkfokin.supabase.co/functions/v1/generate-property-embedding
  → Headers: { Authorization: Bearer <SERVICE_ROLE_KEY> }
```

Isso elimina os bugs #3b e #4b (placeholder de auth) e #4a (URL dinâmica).

#### Fix 2.3 — `trigger_crm_sync_for_all_tenants()`: Hardcodar URL do projeto

```sql
CREATE OR REPLACE FUNCTION public.trigger_crm_sync_for_all_tenants()
RETURNS void AS $$
DECLARE
    tenant_record RECORD;
BEGIN
    FOR tenant_record IN
        SELECT id FROM public.tenants
        WHERE is_active = true AND crm_type = 'vista'
        AND crm_api_key IS NOT NULL AND crm_api_url IS NOT NULL
    LOOP
        PERFORM net.http_post(
            url := 'https://vnysbpnggnplvgkfokin.supabase.co/functions/v1/crm-sync-properties',
            headers := jsonb_build_object(
                'Content-Type', 'application/json',
                'Authorization', 'Bearer ' || current_setting('app.supabase_service_role_key')
            ),
            body := jsonb_build_object('tenant_id', tenant_record.id),
            timeout_milliseconds := 10000
        );
    END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

Junto com migration para configurar a secret via Supabase Vault:
```sql
-- Configurar no Supabase Vault e referenciar
ALTER DATABASE postgres SET app.supabase_service_role_key = '<SERVICE_ROLE_KEY>';
```

---

### Fase 3 — Implementação Completa do Banco Vetorial

#### 3.1 — Função de Busca Semântica (Missing — precisa ser criada)

Não existe ainda uma função SQL para realizar busca vetorial. Precisa ser criada:

```sql
CREATE OR REPLACE FUNCTION search_properties_semantic(
  query_embedding extensions.vector(1536),
  tenant_id_param UUID,
  match_count INT DEFAULT 10,
  price_min NUMERIC DEFAULT NULL,
  price_max NUMERIC DEFAULT NULL,
  bedrooms_min INT DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  external_id VARCHAR,
  city VARCHAR,
  neighborhood VARCHAR,
  price NUMERIC,
  bedrooms INT,
  parking_spaces INT,
  description TEXT,
  raw_data JSONB,
  similarity FLOAT
)
LANGUAGE plpgsql AS $$
BEGIN
  RETURN QUERY
  SELECT
    p.id, p.external_id, p.city, p.neighborhood,
    p.price, p.bedrooms, p.parking_spaces, p.description, p.raw_data,
    1 - (p.embedding <=> query_embedding) AS similarity
  FROM public.properties p
  WHERE p.tenant_id = tenant_id_param
    AND p.is_active = true
    AND p.embedding IS NOT NULL
    AND (price_min IS NULL OR p.price >= price_min)
    AND (price_max IS NULL OR p.price <= price_max)
    AND (bedrooms_min IS NULL OR p.bedrooms >= bedrooms_min)
  ORDER BY p.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;
```

#### 3.2 — Edge Function de Busca (precisa ser criada ou atualizada no ai-agent)

O `ai-agent` atualmente usa `_shared/property.ts` com `buildSearchParams` direcionado ao Vista diretamente. Precisa ser substituído por uma chamada à função SQL acima:

```typescript
// Substitui a chamada direta ao Vista por busca vetorial local
async function searchPropertiesVector(
  supabase: SupabaseClient,
  tenantId: string,
  queryEmbedding: number[],
  filters: { priceMin?: number; priceMax?: number; bedrooms?: number }
): Promise<PropertyResult[]> {
  const { data, error } = await supabase.rpc('search_properties_semantic', {
    query_embedding: queryEmbedding,
    tenant_id_param: tenantId,
    match_count: 5,
    price_min: filters.priceMin ?? null,
    price_max: filters.priceMax ?? null,
    bedrooms_min: filters.bedrooms ?? null,
  });
  // ...
}
```

#### 3.3 — Embedding no momento da busca (ai-agent)

```typescript
// 1. Gerar embedding da query do usuário via OpenAI
const queryText = `${tipo} em ${bairro}, ${quartos} quartos, preço até R$ ${precoMax}`;
const embeddingRes = await fetch('https://api.openai.com/v1/embeddings', {
  method: 'POST',
  headers: { Authorization: `Bearer ${openaiKey}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ input: queryText, model: 'text-embedding-3-small' })
});
const { data } = await embeddingRes.json();
const queryEmbedding = data[0].embedding;

// 2. Buscar imóveis similares
const results = await searchPropertiesVector(supabase, tenantId, queryEmbedding, filters);
```

---

## 5. Arquitetura Final — Fluxo Completo

```
[Admin UI]
    │ Clica "Sincronizar Vista"
    ▼
[crm-sync-properties] (Edge Function)
    │ GET /imoveis/listar?key=...&pesquisa=...
    ├─► [Vista API] ──► retorna lista de imóveis (JSON)
    │ Upsert em lotes de 50 → public.properties
    ▼
[Supabase DB Webhook] (Dashboard Webhook, não SQL trigger)
    │ Dispara em INSERT/UPDATE em properties
    ▼
[generate-property-embedding] (Edge Function)
    │ Extrai texto semântico do imóvel
    │ POST https://api.openai.com/v1/embeddings (text-embedding-3-small)
    │ UPDATE properties SET embedding = [1536 floats]
    ▼
[public.properties] — com embedding preenchido e índice HNSW

[WhatsApp Lead chega]
    ▼
[ai-agent] (Edge Function)
    │ Qualifica interesse do usuário
    │ Gera embedding da busca: "apt 3q Bairro X até 500k"
    │ SELECT search_properties_semantic(embedding, tenant_id, ...)
    │ Retorna top 3-5 imóveis mais similares
    ▼
[Lead recebe sugestões personalizadas via WhatsApp]
```

---

## 6. Resumo das Ações por Prioridade

| # | Ação | Prioridade | Bloqueante |
|---|---|---|---|
| 1 | Ver logs internos do `crm-sync-properties` para confirmar erro do upsert | 🔴 Hoje | Sim |
| 2 | Validar API Key Vista com `node test_vista_api.js` | 🔴 Hoje | Sim |
| 3 | Confirmar `OPENAI_API_KEY` nas secrets do Supabase | 🔴 Hoje | Sim |
| 4 | Corrigir `onConflict: 'tenant_id,external_id'` (remover espaço) | 🔴 Sprint | Sim |
| 5 | Corrigir mapeamento `DescricaoWeb` vs `Descricao` | 🟡 Sprint | Não |
| 6 | Substituir SQL trigger por Supabase Database Webhook | 🔴 Sprint | Sim |
| 7 | Corrigir cron job com URL hardcoded | 🔴 Sprint | Sim |
| 8 | Criar função SQL `search_properties_semantic` | 🔴 Sprint | Sim |
| 9 | Integrar busca vetorial no `ai-agent` | 🟡 Sprint | Dependente de #8 |
| 10 | Re-deploy completo das Edge Functions | 🟡 Sprint | Dependente de todos |

---

## 7. Verificação Pós-Fix

Após as correções, validar em sequência:

```bash
# 1. Confirmar que a tabela recebe dados
node test_crm_sync.js
# Aguardar ~2 minutos
# SELECT COUNT(*) FROM public.properties; → deve ser > 0

# 2. Confirmar que embeddings são gerados
# SELECT COUNT(*) FROM public.properties WHERE embedding IS NOT NULL; → deve ser > 0
# (pode levar alguns minutos dependendo do volume)

# 3. Testar busca semântica
# SELECT * FROM search_properties_semantic(
#   '[...1536 floats...]'::extensions.vector,
#   'uuid-do-tenant'::UUID
# );
```

---

*Relatório gerado em 2026-03-07 com base em análise completa do código-fonte, migrações SQL, logs do Supabase e estado atual do banco de dados.*
