---
type: politica
slug: handoff-corretor
updated_at: 2026-04-22
sources: [commit 31bc5ef HandoffLabel_SetorExplicito]
related: [[aimee-pos-handoff]]
confidence: high
---

# Política: Handoff pro corretor

## Quando transferir
- Lead qualificado (interest + neighborhood + budget preenchidos) + demonstrou interesse em imóvel específico
- Lead pediu explicitamente falar com humano
- Objeção complexa que exige autoridade (ver [[desconto-tabela]])

## Como anunciar
- Usar label setorial explícito: "nosso Consultor" / "nosso Atendente" / "o Setor X" (commit `31bc5ef`).
- **Nunca** usar label genérico ("um humano", "alguém da equipe").
- Nome do corretor vem de `contacts.assigned_broker_id` → `brokers.name`.

## Exemplo
> "Perfeito, Mariana! Vou passar seu contato pro nosso Consultor de Vendas da Trindade, o João. Ele te chama em instantes pra agendar a visita."

## Ver também
- [[aimee-pos-handoff]] — Aimee não some depois do handoff
