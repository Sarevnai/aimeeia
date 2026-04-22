# Cutover 07/05 — Canal Pro ZAP → Aimee

**Deadline:** 07/05/2026
**Rollback definido:** se quebrar, fica OFFLINE (sem fallback pra Lastro).
**Escopo:** cutover TOTAL — todos os setores (Compra, Locação, Captação, Admin).

## Endpoint de produção

```
URL:        https://vnysbpnggnplvgkfokin.supabase.co/functions/v1/portal-leads-webhook/a0000000-0000-0000-0000-000000000001
Method:     POST
Auth:       Basic Auth (user:canal_pro, pass:{CANAL_PRO_SECRET})
            — OU URL com tenant no path (fallback sem auth pra single-tenant)
Payload:    Canal Pro ZAP formato nativo (campos leadOrigin, originLeadId,
            name, ddd, phone, clientListingId, transactionType, temperature,
            extraData.leadType)
```

## Pré-configuração na Smolka

Na área do Canal Pro ZAP, configurar webhook de envio de leads apontando
para a URL acima. Copiar o `CANAL_PRO_SECRET` de `system_settings` (key
`canal_pro_secret`, tenant Smolka) e colar no campo de autenticação do
portal. Validar que o portal envia Basic Auth no header.

## Checklist pré-cutover (D-2, dia 05/05)

- [ ] `scripts/smoke-canal-pro.sh` roda com 100% dos 6 cenários retornando 2xx
- [ ] Inbox da Smolka recebe os 4 greetings proativos dos cenários 1-4
- [ ] Cenário 5 (duplicate) responde `{duplicate:true}` e NÃO dispara greeting de novo
- [ ] Cenário 6 (DNC) responde `{dnc_blocked:true}` e NÃO dispara greeting
- [ ] `portal_leads_log` tem as 6-7 linhas registradas com `raw_payload`
- [ ] Match Vista funciona em imóvel existente e falha graciosamente em `99999`
- [ ] C2S cria lead no plantão e retorna `seller_id` em 100% dos casos 1-4
- [ ] `brokers.c2s_seller_id` linkagem correta em `contacts.assigned_broker_id`
- [ ] Teste com 3 pessoas da Smolka enviando lead real do ZAP (não sintético)
- [ ] Vitest: `npm test` → 109/109 passando

## Decisões de rollout

| Questão | Decisão |
|---|---|
| Escopo | **Total** — todos os setores de uma vez |
| Rollback | **Offline** — se quebrar, Canal Pro para de receber destinatário |
| Smoke test | 3 pessoas da Smolka rodando scripts em 05/05-06/05 |
| Comunicação | Ian avisa Smolka 48h antes do cutover com checklist pronto |

## Plano de contingência se algo quebrar no dia D

### Sintoma 1: webhook retorna 5xx em > 5% das chamadas
**Causa possível:** Edge Function derrubada, Vista API lenta, C2S fora.
**Ação imediata (Ian):**
1. Desconfigurar webhook no Canal Pro ZAP → Smolka fica offline
2. Verificar `ai_error_log` e `activity_logs` pra identificar root cause
3. Se fix < 30min, corrigir e reconfigurar
4. Se fix > 30min, avisar sócio Smolka, seguir offline até próximo dia útil

### Sintoma 2: greeting disparado em lead DNC (violação LGPD)
**Causa possível:** regressão no guardrail DNC (B2).
**Ação imediata:**
1. Desconfigurar webhook
2. Rodar `npx vitest run src/lib/inbound-filters.regression.test.ts` — se falha, revert commit
3. Só reconfigurar após teste passar 100%

### Sintoma 3: greeting robótico ("Prazer em te conhecer, cliente!")
**Causa possível:** regressão no B3.
**Ação imediata:**
1. Rodar `npx vitest run src/lib/resolve-contact-name.regression.test.ts`
2. Se falhar, revert commit `18c6974`
3. Reconfigurar

### Sintoma 4: Aimee re-pergunta dado já extraído (Mone-like)
**Causa possível:** regressão no B4.
**Ação:** nao-crítico, monitorar 24h; se frequência > 10% das conversas, hot-fix no prompt com `forbidden.push` extra.

### Sintoma 5: mensagem truncada enviada ("Olá, Roberto")
**Causa possível:** regressão no B5.
**Ação:** rodar `npx vitest run src/lib/truncation-detector.regression.test.ts`; se falhar, revert.

## Logs de monitoramento nas primeiras 48h

Queries úteis (rodar a cada 1h pelos primeiros 2 dias):

```sql
-- Volume de leads recebidos
SELECT count(*), source, lead_type
FROM portal_leads_log
WHERE tenant_id='a0000000-0000-0000-0000-000000000001'
  AND created_at > now() - interval '1 hour'
GROUP BY source, lead_type;

-- DNC blocks (deve existir, mas em volume baixo)
SELECT count(*) FROM activity_logs
WHERE action_type='portal_lead_dnc_blocked'
  AND created_at > now() - interval '1 hour';

-- Erros do ai-agent
SELECT count(*), error_type
FROM ai_error_log
WHERE tenant_id='a0000000-0000-0000-0000-000000000001'
  AND created_at > now() - interval '1 hour'
GROUP BY error_type;

-- Respostas bloqueadas pelo pre-completion check (TRUNCATED_RESPONSE)
SELECT count(*) FROM ai_traces
WHERE tenant_id='a0000000-0000-0000-0000-000000000001'
  AND created_at > now() - interval '1 hour'
  AND metadata->>'pre_check_issues' LIKE '%TRUNCATED_RESPONSE%';

-- Conversas novas vs respondidas pelo lead
SELECT
  count(*) FILTER (WHERE source='canal_pro') as novas,
  count(*) FILTER (WHERE source='canal_pro' AND last_message_at > created_at + interval '10 minutes') as lead_respondeu
FROM conversations
WHERE tenant_id='a0000000-0000-0000-0000-000000000001'
  AND created_at > now() - interval '24 hours';
```

## Handoff do produto pra operação

Após 48h de operação estável:
- Treinar 3 pessoas da Smolka a usar o inbox Aimee (botão Pausar, transferência manual, leitura de `contacts.dnc`)
- Desativar conta Lastro na Smolka (requer comunicação direta do sócio com a Lastro)
- Arquivar este documento em `docs/historico/` e criar novo `aimee-operacao-runbook.md`
