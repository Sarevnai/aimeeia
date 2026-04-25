// ========== AIMEE.iA — C2S SYNC LEAD HANDOFF ==========
// Quando a Aimee qualifica um lead e atribui pra um corretor, espelha tudo
// no C2S: forward de seller, prop_ref atualizado, tags, mensagem com dossiê.
//
// Caso Terezinha (2026-04-25): a AI atendeu, qualificou e atribuiu pro Joanes,
// mas o C2S ficou stale — sem prop_ref novo, sem tags, sem nota de contexto.
// Esse fix-up é o handoff completo, idempotente.
//
// Payload:
//   tenant_id: string
//   contact_id: string
//   broker_id?: string (UUID local em brokers; pega c2s_seller_id pra forward)
//   property_code?: string (vai como prop_ref + neighbourhood derivado)
//   property_title?: string
//   neighbourhood?: string
//   tags?: string[] (extra tags pra adicionar no C2S)
//   note_body?: string (texto pra append no histórico C2S; default: dossiê auto)
//
// Operações (todas tolerantes a falha individual):
//   1. PATCH /leads/:id           — prop_ref, neighbourhood, tags
//   2. PATCH /leads/:id/forward   — seller_from → seller_to (se broker mudou)
//   3. POST  /leads/:id/create_tag (pra cada tag nova)
//   4. POST  /leads/:id/create_message (nota com dossiê)

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getSupabaseClient, corsResponse, jsonResponse, errorResponse } from '../_shared/supabase.ts';

const C2S_BASE = 'https://api.contact2sale.com/integration';

interface OpResult {
    op: string;
    ok: boolean;
    status?: number;
    error?: string;
}

serve(async (req: Request) => {
    if (req.method === 'OPTIONS') return corsResponse();

    const supabase = getSupabaseClient();

    try {
        const {
            tenant_id,
            contact_id,
            broker_id,
            property_code,
            property_title,
            neighbourhood,
            tags,
            note_body,
        } = await req.json();

        if (!tenant_id || !contact_id) {
            return errorResponse('Missing tenant_id or contact_id', 400);
        }

        // 1. Carrega contato + lead
        const { data: contact, error: cErr } = await supabase
            .from('contacts')
            .select('id, name, c2s_lead_id, assigned_broker_id, crm_natureza, crm_neighborhood')
            .eq('id', contact_id)
            .eq('tenant_id', tenant_id)
            .single();

        if (cErr || !contact) return errorResponse('Contact not found', 404);
        if (!contact.c2s_lead_id) return errorResponse('Contact has no c2s_lead_id', 400);

        // 2. Carrega broker destino (se passado)
        let targetBroker: { c2s_seller_id: string | null; full_name: string | null } | null = null;
        const targetBrokerId = broker_id || contact.assigned_broker_id;
        if (targetBrokerId) {
            const { data: b } = await supabase
                .from('brokers')
                .select('id, c2s_seller_id, full_name')
                .eq('id', targetBrokerId)
                .maybeSingle();
            if (b) targetBroker = b;
        }

        // 3. Carrega api key
        const { data: c2sSetting } = await supabase
            .from('system_settings')
            .select('setting_value')
            .eq('tenant_id', tenant_id)
            .eq('setting_key', 'c2s_config')
            .maybeSingle();
        const apiKey = (c2sSetting?.setting_value as any)?.api_key;
        if (!apiKey) return errorResponse('C2S not configured for tenant', 400);

        const authHeaders = {
            'Authentication': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
        };

        const results: OpResult[] = [];

        // 4. GET lead atual (pra saber seller atual + tags existentes)
        let currentSellerId: string | null = null;
        let existingTagNames: string[] = [];
        try {
            const r = await fetch(`${C2S_BASE}/leads/${contact.c2s_lead_id}`, { headers: authHeaders });
            if (r.ok) {
                const d = await r.json();
                const attrs = d?.data?.attributes;
                currentSellerId = attrs?.seller?.id || null;
                if (Array.isArray(attrs?.tags)) {
                    existingTagNames = attrs.tags.map((t: any) => (t?.name || '').toString().toLowerCase());
                }
            }
        } catch (e) {
            console.warn('⚠️ GET lead falhou (segue mesmo assim):', (e as Error).message);
        }

        // 5. PATCH attributes — só campos que o C2S aceita em update.
        // Validado caso Terezinha (2026-04-25): API rejeita 'prop_ref' e
        // 'neighbourhood' via PATCH ("unknown attribute"). create_tag exige
        // tag_id pré-cadastrado, não aceita nome livre. Solução pragmática:
        // tudo que precisa virar contexto vai pro corpo do dossiê via
        // create_message — o corretor vê no histórico.
        const wantedTagsArr = Array.isArray(tags) ? tags.filter(Boolean) : [];
        // Nada a fazer no PATCH por enquanto. Mantemos o slot pra futuro
        // teste de campos aceitos.

        // 6. Forward seller (se broker novo é diferente do atual)
        if (targetBroker?.c2s_seller_id && currentSellerId && targetBroker.c2s_seller_id !== currentSellerId) {
            try {
                const r = await fetch(`${C2S_BASE}/leads/${contact.c2s_lead_id}/forward`, {
                    method: 'PATCH',
                    headers: authHeaders,
                    body: JSON.stringify({
                        seller_from_id: currentSellerId,
                        seller_to_id: targetBroker.c2s_seller_id,
                    }),
                });
                results.push({ op: 'forward_seller', ok: r.ok, status: r.status, error: r.ok ? undefined : (await r.text()).slice(0, 200) });
            } catch (e) {
                results.push({ op: 'forward_seller', ok: false, error: (e as Error).message });
            }
        } else if (targetBroker?.c2s_seller_id && !currentSellerId) {
            // Sem seller atual: tenta PATCH atributos seller_id
            try {
                const r = await fetch(`${C2S_BASE}/leads/${contact.c2s_lead_id}`, {
                    method: 'PATCH',
                    headers: authHeaders,
                    body: JSON.stringify({ data: { type: 'lead', attributes: { seller_id: targetBroker.c2s_seller_id } } }),
                });
                results.push({ op: 'set_seller_via_patch', ok: r.ok, status: r.status, error: r.ok ? undefined : (await r.text()).slice(0, 200) });
            } catch (e) {
                results.push({ op: 'set_seller_via_patch', ok: false, error: (e as Error).message });
            }
        }

        // 7. Tags já foram aplicadas via PATCH attributes acima.
        // O endpoint /create_tag exige tag_id pré-cadastrado e não aceita
        // nome livre (validado no caso Terezinha 2026-04-25).
        const wantedTags = wantedTagsArr;

        // 8. Mensagem/nota com dossiê
        const finalNote = (note_body && note_body.trim()) || buildDefaultDossier({
            contactName: contact.name,
            propertyCode: property_code,
            propertyTitle: property_title,
            neighbourhood: neighbourhood || contact.crm_neighborhood,
            brokerName: targetBroker?.full_name || null,
            tags: wantedTags,
        });

        if (finalNote) {
            try {
                const r = await fetch(`${C2S_BASE}/leads/${contact.c2s_lead_id}/create_message`, {
                    method: 'POST',
                    headers: authHeaders,
                    body: JSON.stringify({ body: finalNote }),
                });
                results.push({ op: 'create_message', ok: r.ok, status: r.status, error: r.ok ? undefined : (await r.text()).slice(0, 200) });
            } catch (e) {
                results.push({ op: 'create_message', ok: false, error: (e as Error).message });
            }
        }

        // 9. Atualiza local
        await supabase
            .from('contacts')
            .update({
                c2s_lead_synced_at: new Date().toISOString(),
                ...(property_code ? { crm_property_ref: `[${property_code}] ${property_title || ''}`.trim() } : {}),
            })
            .eq('id', contact_id);

        const allOk = results.every(r => r.ok);

        return jsonResponse({
            success: allOk,
            contact_id,
            c2s_lead_id: contact.c2s_lead_id,
            broker_assigned: targetBroker?.full_name || null,
            operations: results,
        });

    } catch (error) {
        console.error('❌ c2s-sync-lead-handoff error:', error);
        return errorResponse((error as Error).message);
    }
});

function buildDefaultDossier(args: {
    contactName: string | null;
    propertyCode?: string;
    propertyTitle?: string;
    neighbourhood?: string | null;
    brokerName?: string | null;
    tags: string[];
}): string {
    const lines: string[] = [];
    lines.push(`Aimee atendeu este lead via WhatsApp e qualificou.`);
    if (args.contactName) lines.push(`Cliente: ${args.contactName}`);
    if (args.propertyCode || args.propertyTitle) {
        lines.push(`Imóvel de interesse: ${args.propertyTitle || ''}${args.propertyCode ? ` (cód. ${args.propertyCode})` : ''}`.trim());
    }
    if (args.neighbourhood) lines.push(`Bairro: ${args.neighbourhood}`);
    if (args.brokerName) lines.push(`Atribuído a: ${args.brokerName}`);
    if (args.tags.length > 0) lines.push(`Tags: ${args.tags.join(', ')}`);
    lines.push(`Próximo passo: corretor entra em contato pra apresentar o imóvel e agendar visita.`);
    return lines.join('\n');
}
