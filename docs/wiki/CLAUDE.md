# Wiki Aimee — Arquitetura de Conhecimento

Este diretório contém **dois níveis de wiki LLM**:

```
docs/wiki/
├── aimee/              ← Wiki GLOBAL da Aimee (produto, cross-tenant)
│   ├── CLAUDE.md       (schema deste nível)
│   ├── index.md
│   ├── log.md
│   ├── raw/
│   └── pages/
│       ├── arquitetura/
│       ├── produto/
│       ├── competicao/
│       ├── estrategia/
│       ├── operacao/       (da empresa Greattings, não do tenant)
│       └── integracoes/
│
└── tenants/            ← Wikis OPERACIONAIS, um por imobiliária
    └── smolka/
        ├── CLAUDE.md   (schema de tenant)
        ├── index.md
        ├── log.md
        ├── raw/
        └── pages/
            ├── bairros/
            ├── empreendimentos/
            ├── corretores/
            ├── objecoes/
            ├── politicas/
            └── leads/
```

## Divisão de escopo

### `aimee/` — wiki global do produto
Tudo que é **transversal a tenants** e sobre a Aimee como plataforma:
- Arquitetura técnica (multi-agente, RLS, Edge Functions, integrações)
- Decisões de produto e roadmap
- Análise competitiva (Lais, Maya, etc.)
- Postura estratégica, riscos, backlog
- Operação interna da Greattings (processos, times, sprints)
- Contratos de integração (Vista, C2S, ZAP, WhatsApp)

**Audiência**: time Greattings, decisões de produto.
**Não consultada pela Aimee em runtime.**

### `tenants/<slug>/` — wiki operacional por imobiliária
Tudo que é **específico daquela imobiliária** atuando:
- Bairros onde operam, preços médios, perfil de comprador
- Empreendimentos recorrentes na carteira
- Corretores, especialidade, estilo
- Objeções e respostas padrão dessa imobiliária
- Políticas internas (handoff, comissão, horário)
- Memória viva de leads

**Audiência**: a própria Aimee (runtime via tool `wiki_search`) + humanos do tenant.
**Escopo fechado**: nada de análise de produto/competição aqui.

## Regra de ouro

Se o conhecimento muda quando você troca de tenant → mora em `tenants/<slug>/`.
Se o conhecimento é o mesmo pra qualquer tenant → mora em `aimee/`.

Exemplos:
- "Trindade é bairro familiar perto da UFSC" → operacional Smolka (outro tenant em SP não liga).
- "Aimee usa Gemini 2.5 Flash via OpenRouter" → global Aimee.
- "Lastro tem módulo de Visitas que a Aimee não tem" → global Aimee (`competicao/`).
- "A Smolka não desativa is_ai_active após handoff" → tenants/smolka/ (é decisão *deles*; outros tenants podem escolher diferente).
- "A arquitetura suporta essa flag" → global Aimee (capability de produto).

## Padrões comuns aos dois níveis

- Markdown com frontmatter YAML.
- `raw/` imutável + `pages/` editado pelo agente + `index.md` + `log.md` (append-only).
- Links internos `[[slug]]`.
- Cada página tem `type`, `slug`, `updated_at`, `sources`, `related`, `confidence`.
- Ingest: humano dropa em `raw/`, pede ao agente pra ingerir, agente atualiza `pages/` + mapas.

## Onboarding de novo tenant

Ao contratar nova imobiliária:

```bash
mkdir -p docs/wiki/tenants/<slug>/{raw,pages/{bairros,empreendimentos,corretores,objecoes,politicas,leads}}
cp docs/wiki/tenants/smolka/CLAUDE.md docs/wiki/tenants/<slug>/CLAUDE.md  # ajustar nome
# criar index.md e log.md a partir do template de smolka/
```

O template de tenant está em [tenants/smolka/CLAUDE.md](tenants/smolka/CLAUDE.md) e vai virar `tenants/_template/` quando tiver o 2º tenant.
