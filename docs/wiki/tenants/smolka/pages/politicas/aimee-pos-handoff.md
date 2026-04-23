---
type: politica
slug: aimee-pos-handoff
updated_at: 2026-04-22
sources: [transcrição call Smolka 2026-04-14, commit 1c47422]
related: [[handoff-corretor]]
confidence: high
---

# Política: Aimee permanece ativa após handoff

Decisão tomada na call Smolka de **2026-04-14**: após handoff pro corretor, **não desativar `is_ai_active`**. A Aimee continua no atendimento.

## Por quê
- Corretor pode demorar a responder (fora do horário, ocupado em visita).
- Lead não pode ficar no vácuo.
- Aimee assume papel de "secretária" — confirma horário, tira dúvidas simples, mantém engajamento até corretor entrar.

## Implementação
- Edge Function `c2s-create-lead` atualizada: captura `seller_id` + `lead_id`, **não flipa `is_ai_active` pra false**.
- Commit: `1c47422` (Sprint 5).

## Comportamento esperado da Aimee pós-handoff
- Tom muda: de qualificadora → suporte administrativo.
- Não insistir em vender / qualificar de novo.
- Se lead fizer pergunta técnica nova (preço, condição), responder "vou confirmar com o João e te retorno" em vez de chutar.
