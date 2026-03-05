# Flow: Anti-Loop (Detecção e Prevenção de Loops do Agente)

## Trigger
Executado após cada resposta do LLM, antes de enviar ao cliente.
Código em `ai-agent/index.ts:232-247`.

## Problema que resolve
LLMs podem repetir perguntas sobre dados já coletados (ex: "Qual região você prefere?" quando a região já foi extraída). Também podem gerar respostas idênticas em loop.

## Checks executados

### Check 1: Looping Question (`isLoopingQuestion`)
Analisa o texto da resposta vs dados de qualificação já coletados.

| Dado coletado | Padrão detectado na resposta |
|--------------|------------------------------|
| `detected_neighborhood` | `qual região?`, `onde você`, `que região`, `preferência.*regi` |
| `detected_bedrooms` | `quantos quartos?`, `número de dormitórios` |
| `detected_budget_max` | `faixa de valor`, `orçamento`, `quanto quer pagar`, `qual.*valor` |
| `detected_property_type` | `que tipo`, `qual tipo`, `tipo de imóvel`, `apartamento.*casa.*ou` |

Se detectado → **looping = true**

### Check 2: Repetitive Message (`isRepetitiveMessage`)
Compara a nova resposta com as últimas 5 respostas da IA (armazenadas em `conversation_states.last_ai_messages`).

- **Comparação exata**: `normalize(resposta) === normalize(prev)`
- **Similaridade Jaccard**: `|intersecção| / |união|` por palavras → threshold 0.85
- Se ≥ 85% similar → **repetitive = true**

## Decision Logic

### Se `isLoopingQuestion = true`
→ Substitui resposta por:
- Se qualificação completa: `"Tenho todas as informações. Vou buscar imóveis para você! 🔍"`
- Se incompleta: `buildContextSummary(mergedQual)` + "Posso te ajudar com mais alguma coisa?"

### Se `isRepetitiveMessage = true`
→ Substitui resposta por: `config.fallback_message || "Posso te ajudar com mais alguma coisa?"`

### Atualização do estado
Após definir `finalResponse`:
```
updateAntiLoopState() → conversation_states.last_ai_messages (array, max 5 elementos, cada um truncado em 300 chars)
```

## Execution
- Código de checks: `supabase/functions/_shared/anti-loop.ts`
- Funções: `isLoopingQuestion()` (linha 11), `isRepetitiveMessage()` (linha 52), `updateAntiLoopState()` (linha 82)
- Chamada em: `ai-agent/index.ts:232-247`

## Outputs
| Ação | Destino |
|------|---------|
| Substitui resposta (se loop) | Variável `finalResponse` em memória |
| Persiste histórico de respostas | `conversation_states.last_ai_messages` (JSON array) |
| Persiste timestamp | `conversation_states.last_ai_message_at` |

## Edge Cases
- **Primeiro cold start (Edge Function)**: estado vive no DB, não em memória — sem problema de reset
- **Falso positivo**: anti-loop pode suprimir resposta legítima se similaridade > 85%. Neste caso, verificar se o prompt do sistema está gerando variações suficientes
- **State null**: `isRepetitiveMessage` retorna false se `last_ai_messages` estiver vazio (começo de conversa)
- **Resposta muito curta**: normalização trunca em 200 chars para comparação

## Configuration
| Tabela | Campo | Efeito |
|--------|-------|--------|
| `ai_agent_config` | `fallback_message` | Mensagem usada quando resposta é repetitiva |
| `conversation_states` | `last_ai_messages` | Array JSON das últimas respostas (persistido) |

## Self-annealing notes
- `MAX_STORED_MESSAGES = 5` está hardcoded em `anti-loop.ts:7` — ajustar se necessário
- Versão v1 usava `Map` em memória → reset no cold start → v2 usa DB como fix
- Threshold 0.85 foi calibrado empiricamente — se muitos falsos positivos, aumentar para 0.90
