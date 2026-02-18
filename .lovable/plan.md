
# Corrigir Mensagens Inbound Nao Salvas

## Problema Raiz

A funcao `processInboundMessage` no `whatsapp-webhook` (linha 196-209) insere mensagens com duas colunas inexistentes na tabela `messages`:
- `wa_phone_number_id` -- nao existe
- `wa_timestamp` -- nao existe

Isso causa falha no INSERT, e nenhuma mensagem inbound e salva no banco. O frontend so exibe mensagens outbound porque sao as unicas que existem.

## Solucao

### 1. Corrigir o INSERT no whatsapp-webhook

Remover as colunas `wa_phone_number_id` e `wa_timestamp` do insert em `supabase/functions/whatsapp-webhook/index.ts` (linhas 196-209). O campo `wa_to` tambem deve ser preenchido corretamente (com o numero do WhatsApp Business).

Codigo corrigido:
```typescript
await supabase.from('messages').insert({
  tenant_id: tenant.id,
  conversation_id: conversation.id,
  wa_message_id: waMessageId,
  wa_from: phoneNumber,
  wa_to: params.waPhoneNumberId,  // era wa_phone_number_id
  direction: 'inbound',
  body: messageBody,
  media_type: params.messageType !== 'text' ? params.messageType : null,
  department_code: conversation.department_code,
  raw: params.rawMessage,
  created_at: new Date().toISOString(),
});
```

### 2. Redeploy da edge function

Redeployar `whatsapp-webhook` apos a correcao.

### 3. Verificacao

Verificar nos logs que as mensagens inbound estao sendo salvas corretamente e aparecem no chat.

## Detalhes Tecnicos

- Arquivo: `supabase/functions/whatsapp-webhook/index.ts`, linhas 196-209
- Colunas validas da tabela `messages`: id, tenant_id, conversation_id, wa_message_id, wa_from, wa_to, direction, body, media_type, media_url, media_caption, media_filename, media_mime_type, department_code, raw, created_at
- Impacto: Todas as mensagens inbound futuras serao salvas. Mensagens passadas que foram perdidas nao podem ser recuperadas automaticamente.
