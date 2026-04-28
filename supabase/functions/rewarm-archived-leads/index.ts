// ========== AIMEE.iA - REWARM ARCHIVED LEADS ==========
// Executada diariamente via pg_cron (0 12 * * * UTC = 09h BRT).
// Para cada tenant com auto_rewarm_enabled=true:
//   - Busca contatos com reactivation_scheduled_at <= now() AND attempts = 0 (limit = rewarm_daily_limit)
//   - Envia template smolka_remarketing_01 (ou o primeiro aprovado que tenha {{lead}}/{{agente}})
//   - Abre conversation nova (source='rewarm_archived')
//   - Marca reactivation_attempts=1 e reactivation_last_attempt_at=now()
//   - Loga em rewarm_log pra painel/métrica
//
// Observação: não reabre o lead no C2S (modo sombra). Se o lead converter
// durante a conversa, o handoff cria lead novo via c2s-create-lead.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getSupabaseClient, corsResponse, jsonResponse, errorResponse } from '../_shared/supabase.ts';

interface ContactRow {
  id: string;
  tenant_id: string;
  phone: string;
  name: string | null;
  crm_archive_reason: string | null;
  crm_property_ref: string | null;
  department_code: string | null;
  crm_natureza: string | null;
}

// Resolve departamento da conversa com base no contexto C2S do contato.
// Evita criar conversas de rewarm como 'vendas' quando o lead original é de locação.
function resolveDepartmentFromContact(contact: ContactRow): string | null {
  if (contact.department_code) return contact.department_code;
  const nat = (contact.crm_natureza || '').toLowerCase();
  if (nat.includes('aluguel') || nat.includes('loca') || nat.includes('temporada')) return 'locacao';
  if (nat.includes('compra') || nat.includes('venda')) return 'vendas';
  return null;
}

async function pickTemplate(supabase: any, tenant_id: string): Promise<string | null> {
  // Prioriza smolka_remarketing_01 se existir e aprovado
  const { data: preferred } = await supabase
    .from('whatsapp_templates')
    .select('name, status')
    .eq('tenant_id', tenant_id)
    .eq('name', 'smolka_remarketing_01')
    .eq('status', 'APPROVED')
    .maybeSingle();
  if (preferred?.name) return preferred.name;

  // Senão pega qualquer template APPROVED de MARKETING com named param "lead"
  const { data: others } = await supabase
    .from('whatsapp_templates')
    .select('name, components')
    .eq('tenant_id', tenant_id)
    .eq('status', 'APPROVED')
    .eq('category', 'MARKETING');

  for (const t of others || []) {
    const body = Array.isArray(t.components)
      ? (t.components as any[]).find((c) => c.type === 'BODY')
      : null;
    const named = body?.example?.body_text_named_params as Array<{ param_name: string }> | undefined;
    if (named?.some((p) => p.param_name === 'lead' || p.param_name === 'nome')) {
      return t.name as string;
    }
  }

  return null;
}

async function processTenant(supabase: any, tenant: any) {
  const stats = {
    tenant_id: tenant.id,
    company_name: tenant.company_name,
    limit: tenant.rewarm_daily_limit,
    eligible_fetched: 0,
    sent: 0,
    failed: 0,
    skipped_no_template: 0,
  };

  const templateName = await pickTemplate(supabase, tenant.id);
  if (!templateName) {
    // Loga um skip genérico, mas sem contacts — só pra rastrear
    await supabase.from('rewarm_log').insert({
      tenant_id: tenant.id,
      contact_id: '00000000-0000-0000-0000-000000000000',
      outcome: 'skipped_no_template',
      error_message: 'Tenant sem template MARKETING aprovado com {{lead}}',
    });
    return { ...stats, note: 'no_template' };
  }

  // Caso Daniela 28/04: lead arquivada no C2S com motivo "Sem opções para mostrar"
  // foi rewarm-ada e Helena bateu na mesma parede do corretor humano (catálogo
  // ainda não tinha imóvel novo no perfil). Filtrar esses motivos no batch evita
  // gastar template + queimar percepção de marca em conversas previsivelmente
  // sem produto. Inclui NULL pra não excluir leads sem motivo cadastrado.
  const { data: eligible } = await supabase
    .from('contacts')
    .select('id, tenant_id, phone, name, crm_archive_reason, crm_property_ref, department_code, crm_natureza')
    .eq('tenant_id', tenant.id)
    .eq('reactivation_attempts', 0)
    .not('reactivation_scheduled_at', 'is', null)
    .lte('reactivation_scheduled_at', new Date().toISOString())
    .is('reactivation_blocked_reason', null)
    .or('crm_archive_reason.is.null,and(crm_archive_reason.not.ilike.%sem op%,crm_archive_reason.not.ilike.%não tinha op%,crm_archive_reason.not.ilike.%nao tinha op%)')
    .order('reactivation_scheduled_at', { ascending: true })
    .limit(tenant.rewarm_daily_limit || 50);

  const list = (eligible || []) as ContactRow[];
  stats.eligible_fetched = list.length;

  for (const contact of list) {
    // Abre/cria conversation antes de disparar o template
    let conversationId: string | null = null;
    const { data: existingConv } = await supabase
      .from('conversations')
      .select('id')
      .eq('tenant_id', contact.tenant_id)
      .eq('phone_number', contact.phone)
      .eq('status', 'active')
      .maybeSingle();

    const dept = resolveDepartmentFromContact(contact);

    if (existingConv?.id) {
      conversationId = existingConv.id;
    } else {
      const insertPayload: any = {
        tenant_id: contact.tenant_id,
        phone_number: contact.phone,
        contact_id: contact.id,
        status: 'active',
        source: 'rewarm_archived',
        last_message_at: new Date().toISOString(),
      };
      if (dept) insertPayload.department_code = dept;

      const { data: newConv } = await supabase
        .from('conversations')
        .insert(insertPayload)
        .select('id')
        .single();
      conversationId = newConv?.id || null;
    }

    // Dispara o template
    let outcome = 'template_sent';
    let errorMsg: string | null = null;
    try {
      const { data: sendResult, error: sendErr } = await supabase.functions.invoke('send-wa-template', {
        body: {
          tenant_id: contact.tenant_id,
          phone_number: contact.phone,
          template_name: templateName,
          language_code: 'pt_BR',
          conversation_id: conversationId,
          contact_id: contact.id,
        },
      });

      if (sendErr || (sendResult as any)?.error) {
        outcome = 'template_failed';
        errorMsg = sendErr?.message || (sendResult as any)?.error || 'unknown';
        stats.failed++;
      } else {
        stats.sent++;
      }
    } catch (err) {
      outcome = 'template_failed';
      errorMsg = (err as Error).message;
      stats.failed++;
    }

    // Marca tentativa (independente de sucesso — evita retry automático em próximo cron)
    await supabase
      .from('contacts')
      .update({
        reactivation_attempts: 1,
        reactivation_last_attempt_at: new Date().toISOString(),
        reactivation_scheduled_at: null,
      })
      .eq('id', contact.id);

    await supabase.from('rewarm_log').insert({
      tenant_id: contact.tenant_id,
      contact_id: contact.id,
      outcome,
      template_name: templateName,
      error_message: errorMsg,
      conversation_id: conversationId,
    });
  }

  return stats;
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return corsResponse();

  const supabase = getSupabaseClient();

  try {
    const body = await req.json().catch(() => ({}));
    const { tenant_id } = body || {};

    let tenantQ = supabase
      .from('tenants')
      .select('id, company_name, auto_rewarm_enabled, rewarm_daily_limit')
      .eq('auto_rewarm_enabled', true)
      .eq('is_active', true);
    if (tenant_id) tenantQ = tenantQ.eq('id', tenant_id);

    const { data: tenants } = await tenantQ;
    const results: any[] = [];
    for (const t of tenants || []) {
      try {
        results.push(await processTenant(supabase, t));
      } catch (err) {
        results.push({ tenant_id: t.id, error: (err as Error).message });
      }
    }

    return jsonResponse({ success: true, tenants_processed: results.length, results });
  } catch (error) {
    console.error('❌ rewarm-archived-leads error:', error);
    return errorResponse((error as Error).message);
  }
});
