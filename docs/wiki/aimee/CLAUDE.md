# Wiki Global Aimee — Schema

Wiki LLM da Aimee como **produto/plataforma**. Cross-tenant, transversal. Audiência: time Greattings (Ian + sócios + devs + futuros colaboradores).

**Não é consultada pela Aimee em runtime.** É base de conhecimento pra humanos + para LLM agents que trabalham *no* produto (dev, análise, pitch).

## Camadas

- `raw/` — fontes imutáveis: síntese estratégica, mapas estruturais, transcrições de calls de produto, auditorias, análise de competidor, ADRs, relatórios.
- `pages/` — conhecimento organizado pelo LLM.
- `index.md` — catálogo.
- `log.md` — append-only.

## Taxonomia

- `pages/arquitetura/<slug>.md` — decisões técnicas, stack, módulos, camadas (Identity/Memory/Soul/Governance se existir), contratos de tool, schema Supabase, padrões de código.
- `pages/produto/<slug>.md` — features, roadmap, RICE do backlog, decisões de UX, módulos do app (Pipeline Kanban, AI Lab, Campanhas, etc.).
- `pages/competicao/<slug>.md` — Lais (Lastro), Maya, Octadesk, outros. Perfil, stack, diferenciais, gaps.
- `pages/estrategia/<slug>.md` — postura, tese, riscos, rejeições deliberadas, prioridades de trimestre.
- `pages/operacao/<slug>.md` — Greattings como empresa: time, sócios, sprints, cadências, rituais, ClickUp, BMad.
- `pages/integracoes/<slug>.md` — contratos técnicos das integrações: Vista API, C2S, ZAP Canal Pro, WhatsApp Cloud, OpenRouter.

## Frontmatter

```yaml
---
type: arquitetura|produto|competicao|estrategia|operacao|integracao
slug: multi-agente-federado
updated_at: 2026-04-22
sources: [raw/sintese-estrategica-v1.0.md]
related: [[ai-agent-orchestrator]], [[tool-executors]]
confidence: high|medium|low
---
```

## Regras editoriais

- PT-BR, citar fonte.
- Uma página = uma entidade.
- `<!-- inferência -->` pro que não está em fonte explícita.
- **Diferente do wiki de tenant**: aqui análise competitiva e estratégia são bem-vindas.
- Não duplicar coisa que já está no código. Linkar caminho (`src/...`) em vez de copiar.

## Fontes candidatas a ingerir (em `docs/` do repo)

- [docs/sintese-estrategica-aimee-lais-v1.0.md](../../sintese-estrategica-aimee-lais-v1.0.md) — síntese estratégica
- [docs/aimee-mapa-estrutural-v1.0.md](../../aimee-mapa-estrutural-v1.0.md) — white-box Aimee
- [docs/casa-lais-mapa-estrutural-v1.0.md](../../casa-lais-mapa-estrutural-v1.0.md) — black-box Lais
- [docs/AIMEE-AUDIT-REPORT.md](../../AIMEE-AUDIT-REPORT.md) — auditoria Sprint 1
- [docs/architecture.md](../../architecture.md)
- [docs/project-overview.md](../../project-overview.md)
- [docs/cutover-07-05-plano.md](../../cutover-07-05-plano.md)
- Memórias em `/Users/ianveras/.claude/projects/-Users-ianveras-Desktop-aimeeia/memory/` (MEMORY.md e referenced files)
