# Wiki Smolka — Schema & Operação

Este diretório é um **LLM Wiki do tenant Smolka Imóveis**. Serve de memória institucional pra Aimee (injeção de contexto em tempo real) e pra humanos da própria Smolka (consulta direta).

**Escopo:** exclusivamente **mapeamento e registro da operação deste tenant**. Nada de benchmark competitivo, análise de produto ou estratégia de roadmap da plataforma Aimee — isso mora em [../../aimee/](../../aimee/) (wiki global). Ver [../../CLAUDE.md](../../CLAUDE.md) pra arquitetura completa.

**Este diretório também serve como template** pros próximos tenants (copiar estrutura, ajustar nome).

## Camadas

- `raw/` — fontes imutáveis (transcrições de calls com a Smolka, dumps Vista/C2S, exports de conversations, anotações dos corretores). O LLM **lê**, nunca edita.
- `pages/` — conhecimento sintetizado, mantido pelo LLM. Uma página por entidade. É o que a Aimee consulta em runtime.
- `index.md` — catálogo de tudo em `pages/` (uma linha por página).
- `log.md` — append-only de ingests/queries/lints. Formato: `## [YYYY-MM-DD] ingest|query|lint | título`.

## Taxonomia de páginas

- `pages/bairros/<slug>.md` — perfil de bairro: preço médio 2q/3q venda/locação, perfil de comprador típico, escolas, comércio, especificidades.
- `pages/empreendimentos/<slug>.md` — prédios/condomínios recorrentes na carteira. Código Vista, características, objeções comuns.
- `pages/corretores/<slug>.md` — corretor Smolka. Especialidade (bairro/tipo), estilo, carteira ADM. Linka `brokers.id`.
- `pages/objecoes/<slug>.md` — objeção recorrente ("desconto", "prazo de visita", "garantia locação") + resposta padrão.
- `pages/politicas/<slug>.md` — regras internas da Smolka (comissão, visita, documentação, handoff, horário).
- `pages/leads/<contact_id>.md` — memória viva por contato. Histórico de interesses, objeções, timeline, família, restrições. **Alimentada pós-conversa por job assíncrono**, lida em tempo real pela Aimee via tool `wiki_read_lead`.

## Frontmatter (obrigatório)

```yaml
---
type: bairro|empreendimento|corretor|objecao|politica|lead
slug: trindade
updated_at: 2026-04-22
sources: [raw/call-2026-04-14.md, raw/vista-dump-2026-04-20.csv]
related: [[itacorubi]], [[escola-autonomia]]
confidence: high|medium|low
---
```

## Operações

### Ingest
1. Humano dropa fonte em `raw/`.
2. LLM lê, identifica páginas afetadas (cria/atualiza), registra contradições em comentário HTML `<!-- contradição: ... -->`, atualiza `index.md` e `log.md`.
3. Nunca deletar fato antigo — marcar superseded com data.

### Query em tempo real (Aimee)
- Edge Function `wiki-search` (a implementar) faz BM25 sobre `pages/**/*.md` filtrado por `tenant_id=smolka`.
- Aimee chama como tool: `wiki_search({query, type?})` → retorna top-3 páginas (title + trecho + path).
- Por lead: `wiki_read_lead({contact_id})` → retorna página inteira se existir.

### Lint (semanal)
- Órfãs (sem inbound link), claims conflitantes, páginas >60d sem update, conceito citado sem página própria.

## Regras editoriais

- **Sempre PT-BR**.
- **Cite a fonte** no final de cada fato: `(ver raw/call-2026-04-14.md)`.
- **Uma página = uma entidade**. Não misturar bairros numa página só.
- **Links wiki-style** `[[slug]]` pra cross-reference.
- **Sem opinião sem fonte**. Se inferido, marcar `<!-- inferência -->`.
- **Lead pages são sensíveis**: não colocar CPF, endereço completo, dados de pagamento. Só o que ajuda a Aimee a conversar melhor.
- **Sem comparação com competidores**. Se aparecer numa fonte, descartar o trecho. Esse wiki é sobre a Smolka operando, não sobre a Aimee como produto.

## Integração com a Aimee (roadmap)

1. **Fase 1 (agora)**: scaffolding + seed manual de páginas operacionais.
2. **Fase 2**: job pós-conversa (`conversations` closed → LLM atualiza `pages/leads/<id>.md`).
3. **Fase 3**: Edge Function `wiki-search` + tool registration em `ai-agent`.
4. **Fase 4**: lint automático (cron semanal) + dashboard admin de saúde do wiki.

**Não roda no caminho crítico de resposta.** Ingest e lint são async. Só *leitura* é síncrona.
