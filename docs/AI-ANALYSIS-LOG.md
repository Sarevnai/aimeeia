# AI Analysis Log - Aimee.iA

> Documento de rastreabilidade: cada sessao de analise do Gemini gera uma entrada aqui.
> Objetivo: versionar analises, registrar erros, correcoes, e validar se os fixes funcionaram.

## Resumo Geral

| Metrica | Valor |
|---------|-------|
| Total de sessoes | 1 |
| Bugs encontrados | 19 |
| Bugs resolvidos | 0 |
| Bugs abertos | 19 |
| Score medio geral | 8.0/10 |

---

## Processo Padrao

1. **Analisar**: Selecionar conversa real no AI Lab > Atendimentos Reais > Analisar Conversa
2. **Identificar erros**: Gemini pontua 10 criterios, lista erros com severidade e arquivo afetado
3. **Corrigir**: Aplicar fix no codigo (prompt, qualification, triage, etc.)
4. **Registrar**: Registrar a correcao no Prompt Version Tracker (dentro do portal) E neste documento
5. **Re-analisar**: Rodar nova analise na mesma conversa → gera versao N+1 do report
6. **Comparar**: Usar "Comparar Versoes" para ver deltas por criterio
7. **Atualizar status**: Se melhorou, marcar como RESOLVIDO. Se nao, iterar.

---

## Sessoes de Analise

<!-- Template para cada sessao:

## Sessao #N - YYYY-MM-DD

### Contexto
- **Tenant**: [nome do tenant]
- **Conversas analisadas**: X
- **Score medio**: X.X
- **Report version**: vN

### Erros Encontrados
| # | Tipo | Severidade | Descricao | Arquivo Afetado | Status |
|---|------|-----------|-----------|-----------------|--------|
| 1 | ...  | high      | ...       | prompts.ts      | ABERTO |

### Correcoes Aplicadas
| Erro # | Arquivo | O que foi feito | Commit |
|--------|---------|-----------------|--------|
| 1      | ...     | ...             | abc123 |

### Re-analise
- **Score antes**: X.X
- **Score depois**: X.X
- **Delta**: +/-X.X
- **Erros que persistem**: [lista]
- **Erros novos**: [lista]
- **Erros resolvidos**: [lista]

-->

## Sessao #1 - 2026-03-27

### Contexto
- **Tenant**: Smolka Imoveis
- **Conversa**: Hallef Ian (554888182882) — remarketing
- **Score medio**: 8.0/10
- **Score minimo**: 5.0/10 (Turno 9)
- **Score maximo**: 10.0/10 (Turnos 3, 6)
- **Total de turnos**: 11
- **Production Ready**: Nao
- **Report version**: v1
- **Report ID**: `908b44b4-7196-49b2-a562-7aefc14616ae`
- **Relatorio completo**: `docs/analysis-reports/hallef-ian-v1.md`

### Erros Encontrados (19 criticos + 7 medios + 1 baixo = 27 total)

Priorizando apenas os **19 erros criticos (high)** que precisam ser corrigidos:

| # | Turno | Tipo | Descricao | Arquivo Afetado | Status |
|---|-------|------|-----------|-----------------|--------|
| 1 | T4 | Extracao de Dados | Sistema detectou `detected_neighborhood: "Centro"`, `detected_property_type: "comercial"`, `detected_budget_max: 1000000` sem o cliente fornecer | qualification.ts | ABERTO |
| 2 | T4 | Consistencia | Objeto de qualificacao contem dados fabricados (bairro, tipo, orcamento) | qualification.ts | ABERTO |
| 3 | T4 | Guardrails | Sistema fabricou dados de qualificacao cruciais | qualification.ts | ABERTO |
| 4 | T5 | Irrelevancia Contextual | Resposta "Da uma olhada no que te enviei" sem ter enviado nada | prompts.ts | ABERTO |
| 5 | T5 | Desvio de Modulo | Cliente respondeu "sala comercial" mas agente ignorou e mudou de assunto | qualification.ts | ABERTO |
| 6 | T5 | Estagnacao do Fluxo | Fluxo de qualificacao interrompido apos cliente fornecer tipo de imovel | qualification.ts | ABERTO |
| 7 | T5 | Inconsistencia Factual | "Da uma olhada no que te enviei" - nada foi enviado | prompts.ts | ABERTO |
| 8 | T5 | Input Ignorado | Agente ignorou "Estou buscando uma sala comercial" | prompts.ts | ABERTO |
| 9 | T7 | Extracao/Inferencia | `detected_neighborhood: "Centro"` persiste sem cliente fornecer | qualification.ts | ABERTO |
| 10 | T7 | Inconsistencia Estado | Agente pergunta bairro mas estado ja tem "Centro" registrado | prompts.ts, tool-executors.ts | ABERTO |
| 11 | T9 | Extracao de Dados | Nao atualizou interesse de "venda" para "locacao" apos correcao do cliente | qualification.ts | ABERTO |
| 12 | T9 | Inconsistencia | Estado interno `detected_interest: "venda"` contradiz cliente que disse "locacao" | qualification.ts, prompts.ts | ABERTO |
| 13 | T9 | Resposta Incompleta | Agente ignorou correcao crucial do cliente sobre tipo de interesse | prompts.ts | ABERTO |
| 14 | T9 | Estagnacao do Fluxo | Fluxo travado por nao processar correcao de interesse | qualification.ts | ABERTO |
| 15 | T9 | Desalinhamento de Modulo | Modulo de qualificacao nao atualizou parametro corrigido pelo cliente | qualification.ts | ABERTO |
| 16 | T10 | Progressao do Fluxo | Agente nao reconheceu correcao critica (compra vs locacao) | qualification.ts, prompts.ts | ABERTO |
| 17 | T10 | Completude da Resposta | Resposta generica ignorou correcao direta e explicita do cliente | prompts.ts, qualification.ts | ABERTO |
| 18 | T11 | Adequacao ao Modulo | Agente nao lidou com contradicoes do cliente (locacao vs comprar) | qualification.ts, prompts.ts | ABERTO |
| 19 | T11 | Progressao do Fluxo | Fluxo completamente travado - agente repetiu mesma pergunta generica 3x | qualification.ts, triage.ts, prompts.ts | ABERTO |

### Analise dos Padroes de Erro

**Cluster 1 — Fabricacao de Dados (Erros 1-3, 9)**
- `qualification.ts` esta inventando dados: bairro, tipo de imovel, orcamento
- Acontece nos turnos 4 e 7
- **Root cause provavel**: logica de extracao usando inferencia excessiva ou defaults incorretos

**Cluster 2 — Resposta Descontextualizada (Erros 4, 7, 8)**
- "Da uma olhada no que te enviei" sem ter enviado nada
- Turno 5 ignora completamente o input do cliente
- **Root cause provavel**: prompts.ts gerando resposta de fallback/template errada

**Cluster 3 — Nao Atualiza Correcoes do Cliente (Erros 11-17)**
- Cliente corrige "venda" para "locacao", depois volta pra "compra"
- qualification.ts nunca atualiza `detected_interest`
- **Root cause provavel**: logica de extracao nao tem mecanismo para UPDATE de campos ja preenchidos

**Cluster 4 — Fluxo Travado / Loop (Erros 6, 14, 19)**
- Agente repete "Pra eu fazer uma busca certeira..." 3 vezes
- Fluxo nao avanca mesmo com dados novos
- **Root cause provavel**: triage.ts nao detecta estagnacao; qualification.ts nao marca progresso

### Correcoes Aplicadas
| Erro # | Arquivo | O que foi feito | Commit |
|--------|---------|-----------------|--------|
| — | — | *Nenhuma correcao aplicada ainda* | — |

### Re-analise
*Pendente — sera preenchida apos aplicar correcoes e re-analisar*
