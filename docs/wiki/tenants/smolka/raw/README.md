# raw/

Fontes imutáveis. Dropar aqui:
- Transcrições de calls (`call-YYYY-MM-DD-titulo.md`)
- Dumps Vista/C2S (`vista-dump-YYYY-MM-DD.csv`)
- Artigos, prints, anotações externas
- Exports de `conversations` fechadas (`conv-<id>.json`)

**Regra**: o LLM lê daqui mas **nunca edita**. Source of truth.

Após dropar uma fonte, peça ao LLM: *"ingerir raw/<arquivo>"*. Ele lê, atualiza páginas em `pages/`, atualiza `index.md` e `log.md`.
