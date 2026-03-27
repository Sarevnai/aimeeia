# AI Analysis Log - Aimee.iA

> Documento de rastreabilidade: cada sessao de analise do Gemini gera uma entrada aqui.
> Objetivo: versionar analises, registrar erros, correcoes, e validar se os fixes funcionaram.

## Resumo Geral

| Metrica | Valor |
|---------|-------|
| Total de sessoes | 0 |
| Bugs encontrados | 0 |
| Bugs resolvidos | 0 |
| Bugs abertos | 0 |
| Score medio geral | - |

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

*Nenhuma sessao registrada ainda. A primeira sessao sera criada quando a primeira analise real for executada.*
