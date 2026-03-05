/**
 * test-ai-agent.ts
 * Simula uma mensagem WhatsApp → invoca ai-agent via HTTP → exibe resposta
 *
 * USO:
 *   npx ts-node execution/test-ai-agent.ts --tenant-id <id> --phone <numero> --message <texto>
 *
 * REQUISITOS:
 *   - SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no .env ou como env vars
 *
 * EXEMPLO:
 *   npx ts-node execution/test-ai-agent.ts \
 *     --tenant-id abc123 \
 *     --phone +5511999999999 \
 *     --message "olá, quero alugar um apartamento"
 */

import * as dotenv from 'dotenv';
dotenv.config();

const args = process.argv.slice(2);
const getArg = (name: string): string | null => {
  const idx = args.indexOf(`--${name}`);
  return idx !== -1 ? args[idx + 1] : null;
};

const tenantId = getArg('tenant-id');
const phone = getArg('phone') || getArg('p');
const message = getArg('message') || getArg('m');

if (!tenantId || !phone || !message) {
  console.error('❌ Uso: npx ts-node execution/test-ai-agent.ts --tenant-id <id> --phone <numero> --message <texto>');
  process.exit(1);
}

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://vnysbpnggnplvgkfokin.supabase.co';
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SERVICE_ROLE_KEY) {
  console.error('❌ SUPABASE_SERVICE_ROLE_KEY não definida no .env');
  process.exit(1);
}

async function testAiAgent() {
  console.log('\n🤖 Testando ai-agent...');
  console.log(`   Tenant: ${tenantId}`);
  console.log(`   Telefone: ${phone}`);
  console.log(`   Mensagem: "${message}"\n`);

  // 1. Buscar ou criar contato de teste
  const contactRes = await fetch(`${SUPABASE_URL}/rest/v1/contacts?tenant_id=eq.${tenantId}&phone=eq.${encodeURIComponent(phone!)}&select=id`, {
    headers: {
      'apikey': SERVICE_ROLE_KEY!,
      'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
    }
  });
  const contacts = await contactRes.json();
  let contactId = contacts[0]?.id;

  if (!contactId) {
    const createContact = await fetch(`${SUPABASE_URL}/rest/v1/contacts`, {
      method: 'POST',
      headers: {
        'apikey': SERVICE_ROLE_KEY!,
        'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation',
      },
      body: JSON.stringify({ tenant_id: tenantId, phone, name: 'Teste' }),
    });
    const newContact = await createContact.json();
    contactId = newContact[0]?.id;
    console.log(`✅ Contato criado: ${contactId}`);
  } else {
    console.log(`✅ Contato encontrado: ${contactId}`);
  }

  // 2. Buscar ou criar conversa ativa
  const convRes = await fetch(`${SUPABASE_URL}/rest/v1/conversations?tenant_id=eq.${tenantId}&contact_id=eq.${contactId}&status=eq.open&select=id&order=created_at.desc&limit=1`, {
    headers: {
      'apikey': SERVICE_ROLE_KEY!,
      'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
    }
  });
  const convs = await convRes.json();
  let conversationId = convs[0]?.id;

  if (!conversationId) {
    const createConv = await fetch(`${SUPABASE_URL}/rest/v1/conversations`, {
      method: 'POST',
      headers: {
        'apikey': SERVICE_ROLE_KEY!,
        'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation',
      },
      body: JSON.stringify({
        tenant_id: tenantId,
        contact_id: contactId,
        channel: 'whatsapp',
        status: 'open',
        last_message_at: new Date().toISOString(),
      }),
    });
    const newConv = await createConv.json();
    conversationId = newConv[0]?.id;
    console.log(`✅ Conversa criada: ${conversationId}`);
  } else {
    console.log(`✅ Conversa encontrada: ${conversationId}`);
  }

  // 3. Salvar mensagem inbound de teste
  await fetch(`${SUPABASE_URL}/rest/v1/messages`, {
    method: 'POST',
    headers: {
      'apikey': SERVICE_ROLE_KEY!,
      'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      tenant_id: tenantId,
      conversation_id: conversationId,
      direction: 'inbound',
      body: message,
      sender_type: 'contact',
      message_type: 'text',
    }),
  });

  // 4. Invocar ai-agent
  console.log('\n📡 Invocando ai-agent...');
  const start = Date.now();

  const agentRes = await fetch(`${SUPABASE_URL}/functions/v1/ai-agent`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      tenant_id: tenantId,
      phone_number: phone,
      message_body: message,
      message_type: 'text',
      contact_name: 'Teste',
      conversation_id: conversationId,
      contact_id: contactId,
      raw_message: { text: { body: message } },
    }),
  });

  const elapsed = Date.now() - start;
  const result = await agentRes.json();

  console.log(`\n⏱  Tempo de resposta: ${elapsed}ms`);
  console.log(`📊 Status HTTP: ${agentRes.status}`);
  console.log('\n📤 Resposta do agente:');
  console.log(JSON.stringify(result, null, 2));

  if (result.ai_response) {
    console.log('\n💬 Mensagem ao cliente:');
    console.log('─'.repeat(50));
    console.log(result.ai_response);
    console.log('─'.repeat(50));
  }

  if (!agentRes.ok) {
    console.error('\n❌ Erro no agente. Verificar logs em:');
    console.error('   https://app.supabase.com/project/vnysbpnggnplvgkfokin/functions');
  }
}

testAiAgent().catch(console.error);
