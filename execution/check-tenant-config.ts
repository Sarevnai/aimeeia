/**
 * check-tenant-config.ts
 * Valida a configuração completa de um tenant (credenciais, AI, WhatsApp, CRM)
 *
 * USO:
 *   npx ts-node execution/check-tenant-config.ts --tenant-id <id>
 *   npx ts-node execution/check-tenant-config.ts --company "Nome da Imobiliária"
 *
 * REQUISITOS:
 *   - SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no .env
 */

import * as dotenv from 'dotenv';
dotenv.config();

const args = process.argv.slice(2);
const getArg = (name: string): string | null => {
  const idx = args.indexOf(`--${name}`);
  return idx !== -1 ? args[idx + 1] : null;
};

const tenantId = getArg('tenant-id');
const companyName = getArg('company');

if (!tenantId && !companyName) {
  console.error('❌ Uso: npx ts-node execution/check-tenant-config.ts --tenant-id <id>');
  console.error('       npx ts-node execution/check-tenant-config.ts --company "Nome da Empresa"');
  process.exit(1);
}

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://vnysbpnggnplvgkfokin.supabase.co';
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SERVICE_ROLE_KEY) {
  console.error('❌ SUPABASE_SERVICE_ROLE_KEY não definida no .env');
  process.exit(1);
}

const headers = {
  'apikey': SERVICE_ROLE_KEY,
  'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
};

function check(label: string, ok: boolean, value?: string) {
  const icon = ok ? '✅' : '❌';
  const detail = value ? ` (${value})` : '';
  console.log(`  ${icon} ${label}${detail}`);
}

async function sql(query: string): Promise<any[]> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  // Fallback: use REST API directly
  return [];
}

async function get(table: string, filter: string): Promise<any[]> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${filter}`, { headers });
  return res.json();
}

async function checkTenantConfig() {
  console.log('\n🔍 Verificando configuração do tenant...\n');

  // 1. Buscar tenant
  const filter = tenantId
    ? `id=eq.${tenantId}&select=*`
    : `company_name=eq.${encodeURIComponent(companyName!)}&select=*`;

  const tenants = await get('tenants', filter);
  if (!tenants.length) {
    console.error(`❌ Tenant não encontrado: ${tenantId || companyName}`);
    process.exit(1);
  }
  const tenant = tenants[0];
  const tid = tenant.id;

  console.log(`📋 Tenant: ${tenant.company_name} (${tid})`);
  console.log(`   Cidade: ${tenant.city || '—'}`);
  console.log(`   Plano: ${tenant.plan || '—'}`);
  console.log(`   Ativo: ${tenant.is_active ? 'Sim' : 'Não'}\n`);

  // 2. WhatsApp
  console.log('📱 WhatsApp:');
  check('Phone Number ID', !!tenant.wa_phone_number_id, tenant.wa_phone_number_id?.slice(0, 8) + '...');
  check('Access Token', !!tenant.wa_access_token);
  check('Webhook Verify Token', !!tenant.wa_webhook_verify_token);

  // 3. AI Config
  console.log('\n🤖 AI Config:');
  const [aiConfig] = await get('ai_agent_config', `tenant_id=eq.${tid}&select=*`);
  check('ai_agent_config existe', !!aiConfig);
  if (aiConfig) {
    check('Agent name', !!aiConfig.agent_name, aiConfig.agent_name);
    check('AI model', !!aiConfig.ai_model, aiConfig.ai_model);
    check('Tone', !!aiConfig.tone, aiConfig.tone);
  }

  // 4. Profiles (usuários)
  console.log('\n👥 Usuários:');
  const profiles = await get('profiles', `tenant_id=eq.${tid}&select=id,full_name,role`);
  check(`${profiles.length} usuário(s) encontrado(s)`, profiles.length > 0);
  const admins = profiles.filter((p: any) => p.role === 'admin');
  check(`${admins.length} admin(s)`, admins.length > 0);
  for (const p of profiles.slice(0, 5)) {
    console.log(`      → ${p.full_name || 'sem nome'} [${p.role}]`);
  }

  // 5. Conversation Stages
  console.log('\n📊 Pipeline de Departamentos:');
  const stages = await get('conversation_stages', `tenant_id=eq.${tid}&select=department_code,name&order=department_code.asc,order_index.asc`);
  const depts = [...new Set(stages.map((s: any) => s.department_code))];
  check('Stages de locacao', depts.includes('locacao'));
  check('Stages de vendas', depts.includes('vendas'));
  check('Stages de administrativo', depts.includes('administrativo'));
  console.log(`      Total: ${stages.length} stages em ${depts.length} departamentos`);

  // 6. Ticket Categories
  console.log('\n🎫 Categorias de Ticket:');
  const categories = await get('ticket_categories', `tenant_id=eq.${tid}&is_active=eq.true&select=name`);
  check(`${categories.length} categoria(s) ativa(s)`, categories.length > 0);

  // 7. Regiões
  console.log('\n🗺️  Regiões/Bairros:');
  const regions = await get('regions', `tenant_id=eq.${tid}&select=region_name`);
  check(`${regions.length} região(ões) cadastrada(s)`, regions.length > 0);

  // 8. Catálogo de Imóveis
  console.log('\n🏠 Catálogo de Imóveis:');
  const props = await get('properties', `tenant_id=eq.${tid}&select=id,embedding`);
  const total = props.length;
  const withEmbedding = props.filter((p: any) => p.embedding !== null).length;
  check(`${total} imóvel(is) cadastrado(s)`, total > 0);
  check(`${withEmbedding}/${total} com embedding (busca semântica)`, withEmbedding === total && total > 0);

  // 9. CRM
  console.log('\n🔗 CRM:');
  check('CRM type', !!tenant.crm_type, tenant.crm_type || 'não configurado');
  if (tenant.crm_type === 'c2s') {
    check('C2S Token', !!tenant.c2s_token);
    check('C2S Empresa ID', !!tenant.c2s_empresa_id, tenant.c2s_empresa_id);
  } else if (tenant.crm_type === 'vista') {
    check('Vista Token', !!tenant.vista_token);
  }

  // 10. Resumo
  console.log('\n' + '─'.repeat(50));
  const isReady = !!tenant.is_active &&
    !!tenant.wa_phone_number_id &&
    !!tenant.wa_access_token &&
    !!aiConfig &&
    profiles.length > 0 &&
    stages.length > 0;

  if (isReady) {
    console.log('✅ Tenant configurado e pronto para uso!');
  } else {
    console.log('⚠️  Tenant com configurações incompletas. Verificar itens marcados com ❌ acima.');
  }
  console.log('─'.repeat(50) + '\n');
}

checkTenantConfig().catch(console.error);
