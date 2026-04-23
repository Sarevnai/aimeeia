# Log

Append-only. Formato: `## [YYYY-MM-DD] ingest|query|lint|seed|cleanup | título`.

## [2026-04-22] seed | Scaffolding inicial do wiki
Criado schema (CLAUDE.md), index, log, 5 páginas seed (trindade, centro, desconto-tabela, handoff-corretor, aimee-pos-handoff). Fonte: memória do projeto (`MEMORY.md` + transcrição 2026-04-14).

## [2026-04-22] cleanup | Reescopamento: só operação do tenant
Removidas categorias fora de escopo: `competicao/`, `gaps/`, `estrategia/` (5 páginas). Removidos os 3 raw sources meta/competitivos (sintese-estrategica, aimee-mapa-estrutural, casa-lais-mapa-estrutural). CLAUDE.md atualizado com regra editorial explícita: "sem comparação com competidores — este wiki é sobre a Smolka operando, não sobre a Aimee como produto".

## [2026-04-22] cleanup | Lixo de criação de diretório removido
Removido `raw/docs/wiki/smolka/pages/...` (estrutura aninhada vazia criada por engano em uma chamada anterior de `mkdir -p`).
