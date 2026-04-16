// ========== AIMEE.iA - C2S LEAD MAPPER ==========
// Normaliza payload do C2S (delta-sync ou webhook) para o schema de contacts.
// Reutilizado por c2s-delta-sync (pg_cron reconciliação) e c2s-webhook (realtime push).

export const DEPARTMENT_BY_NEGOTIATION: Record<string, string> = {
  'Compra': 'vendas',
  'Venda': 'vendas',
  'Aluguel': 'locacao',
  'Locação': 'locacao',
  'Locacao': 'locacao',
  'Temporada': 'locacao',
};

export function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let p = String(raw).replace(/\D/g, '');
  if (!p) return null;
  if (!p.startsWith('55') && p.length <= 11) p = '55' + p;
  return p;
}

/** Recebe o objeto lead do C2S (com attributes aninhado OU já flat) e retorna o payload normalizado para contacts. */
export function mapC2sLeadToContactPayload(
  lead: any,
  tenant_id: string,
  brokerByC2sId: Map<string, string>,
): { payload: any; phone: string | null; sellerId: string | null } {
  const attrs = lead.attributes || lead || {};
  const customer = attrs.customer || {};
  const seller = attrs.seller || {};
  const product = attrs.product || {};
  const leadStatus = attrs.lead_status || {};
  const funnelStatus = attrs.funnel_status || {};
  const leadSource = attrs.lead_source || {};
  const archiveDetails = attrs.archive_details || {};
  const realEstate = product.real_estate_detail || {};

  const phone = normalizePhone(customer.phone) || normalizePhone(customer.phone_global);
  if (!phone) return { payload: null, phone: null, sellerId: null };

  const sellerId = seller.id || null;
  const assignedBrokerId = sellerId ? (brokerByC2sId.get(sellerId) || null) : null;

  const negotiation = realEstate.negotiation_name || null;
  const department = negotiation ? (DEPARTMENT_BY_NEGOTIATION[negotiation] || null) : null;

  const desc = (product.description || '').trim();
  const propRef = product.prop_ref
    ? (desc.startsWith('[') ? desc : `[${product.prop_ref}] ${desc}`.trim())
    : (desc || null);

  const payload: any = {
    tenant_id,
    phone,
    name: customer.name || null,
    email: customer.email || null,
    department_code: department,
    channel_source: 'c2s_import',
    contact_type: 'lead',
    status: archiveDetails.archived ? 'arquivado' : 'ativo',
    c2s_lead_id: lead.id,
    c2s_lead_internal_id: lead.internal_id || null,
    c2s_lead_synced_at: new Date().toISOString(),
    assigned_broker_id: assignedBrokerId,
    crm_status: leadStatus.name || null,
    crm_funnel_status: funnelStatus.status || null,
    crm_source: leadSource.name || null,
    crm_property_ref: propRef,
    crm_neighborhood: product.neighbourhood || null,
    crm_price_hint: product.price || null,
    crm_natureza: negotiation,
    crm_archive_reason: archiveDetails.archived ? (archiveDetails.archive_notes || 'arquivado') : null,
  };

  return { payload, phone, sellerId };
}

/** Upsert respeitando: c2s_lead_id tem prioridade; preserva name/email/channel_source já presentes. */
export async function upsertContactFromC2sPayload(
  supabase: any,
  tenant_id: string,
  payload: any,
  lead_id: string,
  phone: string,
): Promise<'inserted' | 'updated'> {
  const { data: existing } = await supabase
    .from('contacts')
    .select('id, name, email, channel_source')
    .eq('tenant_id', tenant_id)
    .or(`c2s_lead_id.eq.${lead_id},phone.eq.${phone}`)
    .maybeSingle();

  if (existing) {
    const update: any = { ...payload };
    if (existing.name) delete update.name;
    if (existing.email) delete update.email;
    if (existing.channel_source && existing.channel_source !== 'c2s_import') {
      delete update.channel_source;
    }
    const { error } = await supabase.from('contacts').update(update).eq('id', existing.id);
    if (error) throw new Error(error.message);
    return 'updated';
  } else {
    const { error } = await supabase.from('contacts').insert(payload);
    if (error) throw new Error(error.message);
    return 'inserted';
  }
}

/** Carrega map de c2s_seller_id → broker.id para o tenant. */
export async function loadBrokerMap(supabase: any, tenant_id: string): Promise<Map<string, string>> {
  const { data } = await supabase
    .from('brokers')
    .select('id, c2s_seller_id')
    .eq('tenant_id', tenant_id);
  return new Map<string, string>((data || []).map((b: any) => [b.c2s_seller_id, b.id]));
}
