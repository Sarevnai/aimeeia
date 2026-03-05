# Flow: Qualification (Extração de Requisitos do Lead)

## Trigger
Toda mensagem recebida após `triage_stage === 'completed'`.
Executado em `ai-agent/index.ts:194` antes de chamar o LLM.

## Inputs
| Campo | Origem |
|-------|--------|
| `message_body` | Mensagem do cliente |
| `conversation.qualification_data` | Dados já extraídos anteriormente (JSON na `conversations`) |
| `regions` | Tabela `regions` do tenant (bairros/regiões disponíveis) |

## Decision Logic

### Extração por mensagem (`extractQualificationFromText`)
Cada campo é extraído apenas se ainda não preenchido (não sobrescreve):

| Campo | Técnica | Exemplos |
|-------|---------|---------|
| `detected_neighborhood` | Match contra `regions` do DB | "Moema", "Jardins", "Vila Mariana" |
| `detected_property_type` | Regex | apartamento, casa, cobertura, terreno, kitnet, sobrado, comercial |
| `detected_bedrooms` | Regex numérico + por extenso | "2 quartos", "três dormitórios", "dois quartos" |
| `detected_budget_max` | Regex financeiro com multiplicadores | "R$2.500", "3 mil", "2k reais" |
| `detected_interest` | Regex | alug/locar → locacao; comprar/investir → venda |

### Correções (`detectCorrections`)
Se cliente diz "na verdade", "mudei de ideia", "prefiro", "ao invés" → reextrai e sobrescreve.

### Scoring
```
detected_neighborhood  → +25 pts
detected_property_type → +20 pts
detected_bedrooms      → +20 pts
detected_budget_max    → +25 pts
detected_interest      → +10 pts
Máximo: 100 pts
Threshold "completo": ≥ 20 pts (relaxado para busca semântica)
```

### Fluxo após extração
1. Merge com dados existentes → `mergeQualificationData()`
2. Se novos dados extraídos → salva no DB (`saveQualificationData()`)
3. Dados são injetados no system prompt para evitar perguntas repetidas
4. Anti-loop verifica se IA está perguntando sobre dados já coletados

## Execution
- Código: `supabase/functions/_shared/qualification.ts`
- Funções: `extractQualificationFromText()` (linha 41), `mergeQualificationData()` (linha 84), `saveQualificationData()` (linha 148)
- Chamada em: `ai-agent/index.ts:194-200`

## Outputs
| Ação | Tabela | Coluna |
|------|--------|--------|
| Upsert qualificação | `lead_qualification` | Todos os campos, `onConflict: 'conversation_id'` |
| Atualiza conversa | `conversations` | `qualification_data` (JSON) |

## Edge Cases
- **Budget com "mil/k"**: multiplica por 1000 apenas se valor < 1000 (evita R$2.000.000 virar 2 bilhões)
- **Budget range válido**: só aceita entre R$100 e R$50.000.000
- **Múltiplos bairros na mesma mensagem**: detecta apenas o primeiro
- **Sem regiões cadastradas**: `loadRegions()` retorna array vazio, `detected_neighborhood` fica null
- **Score = 0 até triage completo**: qualification só roda após `triage_stage === 'completed'`

## Configuration
| Tabela | Campo | Efeito |
|--------|-------|--------|
| `regions` | `region_name`, `neighborhoods[]` | Vocabulário de bairros/regiões para detecção |
| `ai_agent_config` | — | (não afeta extração diretamente) |
| `ai_behavior_config` | `essential_questions` | (documentado no prompt builder, não na extração) |

## Self-annealing notes
- `qualification_score ≥ 20` é threshold deliberadamente baixo — busca semântica (pgvector) funciona bem mesmo sem todos os campos
- Se tabela `lead_qualification` estiver com 0 linhas → verificar se `Object.keys(extracted).length > 0` está passando corretamente em `ai-agent/index.ts:198`
- `regions` precisam ter ao menos 1 entry no DB para detecção de bairro funcionar
