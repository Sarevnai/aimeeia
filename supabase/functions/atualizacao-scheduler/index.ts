// ========== AIMEE.iA v2 - ATUALIZACAO SCHEDULER ==========
// Sprint 6.2 — Cron diário (9h BRT) que dispara templates de atualização pros proprietários.
// Usa as tabelas owner_update_campaigns + owner_update_results (alinhado com a UI /atualizacao).
//
// Modos:
//   POST {}                         → auto-process: itera campanhas ativas de todos tenants elegíveis
//   POST { dry_run: true }          → não dispara, só loga o que faria
//   POST { tenant_id?: string }     → filtra por tenant
//   POST { campaign_id?: string }   → roda só uma campanha específica
//
// Pré-requisitos pra uma result entry ser "dispatchable":
//   - owner_update_results.status = 'pending'
//   - campaign.status in ('scheduled', 'in_progress')
//   - (campaign.scheduled_date IS NULL OR scheduled_date <= today)
//   - tenant.atualizacao_max_daily_sends > dispatched_today

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getSupabaseClient, corsResponse, jsonResponse, errorResponse } from '../_shared/supabase.ts';

const DEFAULT_TEMPLATE_NAME = Deno.env.get('ATUALIZACAO_TEMPLATE_NAME') || 'atualizacao_imovel_v1';
const DEFAULT_LANGUAGE = 'pt_BR';

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return corsResponse();

  const supabase = getSupabaseClient();
  const startedAt = Date.now();

  try {
    const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {};
    const dryRun: boolean = !!body.dry_run;
    const tenantFilter: string | undefined = body.tenant_id;
    const campaignFilter: string | undefined = body.campaign_id;

    // 1. Tenants elegíveis
    let tenantsQuery = supabase
      .from('tenants')
      .select('id, company_name, atualizacao_max_daily_sends, atualizacao_auto_execute')
      .gt('atualizacao_max_daily_sends', 0);
    if (tenantFilter) tenantsQuery = tenantsQuery.eq('id', tenantFilter);

    const { data: tenants, error: tenantsErr } = await tenantsQuery;
    if (tenantsErr) throw tenantsErr;
    if (!tenants || tenants.length === 0) {
      return jsonResponse({ ok: true, processed: 0, summary: 'Nenhum tenant elegível.' });
    }

    const results: any[] = [];

    for (const tenant of tenants) {
      const tenantResult: any = {
        tenant_id: tenant.id,
        company: tenant.company_name,
        dispatched_today: 0,
        slots_available: 0,
        dispatched_now: 0,
        skipped: 0,
        errors: [] as string[],
        campaigns_processed: 0,
      };

      // 2. Disparos de hoje (contar results com sent_at >= startOfDay)
      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);

      const { count: dispatchedToday } = await supabase
        .from('owner_update_results')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', tenant.id)
        .gte('sent_at', startOfDay.toISOString());

      tenantResult.dispatched_today = dispatchedToday || 0;
      const slotsAvailable = Math.max(0, tenant.atualizacao_max_daily_sends - (dispatchedToday || 0));
      tenantResult.slots_available = slotsAvailable;

      if (slotsAvailable <= 0) {
        tenantResult.summary = 'Cota diária atingida, pulando.';
        results.push(tenantResult);
        continue;
      }

      // 3. Campanhas elegíveis
      const todayDate = new Date().toISOString().slice(0, 10);
      let campaignsQuery = supabase
        .from('owner_update_campaigns')
        .select('id, name, status, scheduled_date, campaign_type, total_contacts, contacted_count')
        .eq('tenant_id', tenant.id)
        .in('status', ['scheduled', 'in_progress'])
        .or(`scheduled_date.is.null,scheduled_date.lte.${todayDate}`);
      if (campaignFilter) campaignsQuery = campaignsQuery.eq('id', campaignFilter);

      const { data: campaigns, error: campErr } = await campaignsQuery;
      if (campErr) {
        tenantResult.errors.push(`campaigns query: ${campErr.message}`);
        results.push(tenantResult);
        continue;
      }
      if (!campaigns || campaigns.length === 0) {
        tenantResult.summary = 'Sem campanhas elegíveis.';
        results.push(tenantResult);
        continue;
      }

      let remainingSlots = slotsAvailable;

      for (const campaign of campaigns) {
        if (remainingSlots <= 0) break;
        tenantResult.campaigns_processed++;

        // 4. Top N results pending dessa campanha
        const { data: pendingResults, error: resErr } = await supabase
          .from('owner_update_results')
          .select(`
            id,
            owner_contact_id,
            priority_score,
            phone,
            owner_contacts!inner ( id, name, phone, property_code, property_address, property_type, neighborhood )
          `)
          .eq('tenant_id', tenant.id)
          .eq('campaign_id', campaign.id)
          .eq('status', 'pending')
          .order('priority_score', { ascending: false })
          .limit(remainingSlots);

        if (resErr) {
          tenantResult.errors.push(`results query (camp ${campaign.id.slice(0, 8)}): ${resErr.message}`);
          continue;
        }
        if (!pendingResults || pendingResults.length === 0) continue;

        for (const r of pendingResults as any[]) {
          const owner = r.owner_contacts;
          const phone = owner?.phone || r.phone;
          if (!phone) {
            tenantResult.errors.push(`result ${r.id.slice(0, 8)} sem phone`);
            await markResultFailed(supabase, r.id, 'Owner sem phone');
            continue;
          }

          const firstName = owner?.name?.split(' ')[0] || '';
          const ref = owner?.property_address
            ? owner.property_address.slice(0, 60)
            : `código ${owner?.property_code || '?'}`;

          if (dryRun) {
            console.log(`[DRY-RUN] Would dispatch to ${phone} (${owner?.property_code})`);
            tenantResult.dispatched_now++;
            remainingSlots--;
            continue;
          }

          try {
            // Find/create contact for conversation linking
            const { data: existingContact } = await supabase
              .from('contacts')
              .select('id')
              .eq('tenant_id', tenant.id)
              .eq('phone', phone)
              .maybeSingle();

            let contactId: string | null = existingContact?.id || null;
            if (!contactId) {
              const { data: newContact } = await supabase
                .from('contacts')
                .insert({
                  tenant_id: tenant.id,
                  phone,
                  name: owner?.name || null,
                  contact_type: 'proprietario',
                  department_code: 'atualizacao',
                  source: 'atualizacao_scheduled',
                })
                .select('id')
                .single();
              contactId = newContact?.id || null;
            }

            // Find/create conversation
            let conversationId: string | null = null;
            if (contactId) {
              const { data: existingConv } = await supabase
                .from('conversations')
                .select('id')
                .eq('tenant_id', tenant.id)
                .eq('contact_id', contactId)
                .eq('department_code', 'atualizacao')
                .eq('status', 'open')
                .order('created_at', { ascending: false })
                .limit(1)
                .maybeSingle();

              if (existingConv) {
                conversationId = existingConv.id;
              } else {
                const { data: newConv } = await supabase
                  .from('conversations')
                  .insert({
                    tenant_id: tenant.id,
                    contact_id: contactId,
                    department_code: 'atualizacao',
                    source: 'atualizacao_scheduled',
                    status: 'open',
                  })
                  .select('id')
                  .single();
                conversationId = newConv?.id || null;
              }
            }

            // Dispatch template
            const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
            const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

            const sendResp = await fetch(`${supabaseUrl}/functions/v1/send-wa-template`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${serviceKey}`,
              },
              body: JSON.stringify({
                tenant_id: tenant.id,
                phone_number: phone,
                template_name: DEFAULT_TEMPLATE_NAME,
                language_code: DEFAULT_LANGUAGE,
                named_body_params: [
                  { name: 'nome', value: firstName || 'proprietário(a)' },
                  { name: 'codigo', value: owner?.property_code || '' },
                  { name: 'referencia', value: ref },
                ],
                conversation_id: conversationId,
                contact_id: contactId,
              }),
            });

            const sendData = await sendResp.json();
            if (!sendResp.ok) {
              tenantResult.errors.push(`send ${owner?.property_code}: ${sendData?.error || sendResp.status}`);
              await markResultFailed(supabase, r.id, `send_failed: ${sendData?.error || sendResp.status}`);
              continue;
            }

            // Marca result enviado + linka conversation
            await supabase
              .from('owner_update_results')
              .update({
                status: 'sent',
                sent_at: new Date().toISOString(),
                conversation_id: conversationId,
              })
              .eq('id', r.id);

            // Incrementa contacted_count da campanha
            await supabase
              .from('owner_update_campaigns')
              .update({ contacted_count: (campaign.contacted_count || 0) + 1 })
              .eq('id', campaign.id);

            tenantResult.dispatched_now++;
            remainingSlots--;
            console.log(`📤 Dispatched: ${owner?.property_code} → ${phone} (conv ${conversationId?.slice(0, 8)})`);
          } catch (e) {
            tenantResult.errors.push(`exception ${owner?.property_code}: ${(e as Error).message}`);
            await markResultFailed(supabase, r.id, (e as Error).message);
          }

          if (remainingSlots <= 0) break;
        }

        // Marca campaign in_progress se ainda estava scheduled
        if (campaign.status === 'scheduled' && tenantResult.dispatched_now > 0 && !dryRun) {
          await supabase
            .from('owner_update_campaigns')
            .update({ status: 'in_progress' })
            .eq('id', campaign.id);
        }
      }

      results.push(tenantResult);
    }

    const totalDispatched = results.reduce((acc, r) => acc + r.dispatched_now, 0);
    const totalErrors = results.reduce((acc, r) => acc + r.errors.length, 0);

    return jsonResponse({
      ok: true,
      dry_run: dryRun,
      total_dispatched: totalDispatched,
      total_errors: totalErrors,
      elapsed_ms: Date.now() - startedAt,
      tenants: results,
    });
  } catch (error) {
    console.error('❌ Atualizacao scheduler error:', error);
    return errorResponse((error as Error).message);
  }
});

async function markResultFailed(supabase: any, resultId: string, reason: string): Promise<void> {
  await supabase
    .from('owner_update_results')
    .update({
      status: 'failed',
      ai_summary: reason.slice(0, 500),
      completed_at: new Date().toISOString(),
    })
    .eq('id', resultId);
}
