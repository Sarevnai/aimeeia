#!/usr/bin/env bash
# ===========================================================================
# Smoke test: portal-leads-webhook (Canal Pro ZAP / VivaReal / OLX)
# ===========================================================================
# Roda 6 cenários sintéticos contra o endpoint de produção ANTES do cutover
# 07/05. Cada um cobre um caminho crítico:
#   1. Form submit com imóvel existente no Vista → match + greeting + C2S
#   2. Phone click → greeting mais direto ("Vi que você se interessou…")
#   3. WhatsApp click → greeting "seu contato veio pelo WhatsApp"
#   4. Lead sem nome → usa vocativo neutro (B3 fix)
#   5. originLeadId duplicado → responde {duplicate:true}, não dispara de novo
#   6. Contato já DNC (phone_number 5548999990000) → responde {dnc_blocked:true}
#
# Pré-requisitos:
#   - WEBHOOK_URL exportado (ex: https://<project>.supabase.co/functions/v1/portal-leads-webhook)
#   - TENANT_ID exportado (Smolka: a0000000-0000-0000-0000-000000000001)
#   - (opcional) CANAL_PRO_SECRET — se não exportado, usa fallback single-tenant
#
# Uso:
#   WEBHOOK_URL=https://vnysbpnggnplvgkfokin.supabase.co/functions/v1/portal-leads-webhook \
#   TENANT_ID=a0000000-0000-0000-0000-000000000001 \
#   ./scripts/smoke-canal-pro.sh
# ===========================================================================

set -euo pipefail

: "${WEBHOOK_URL:?WEBHOOK_URL is required}"
: "${TENANT_ID:?TENANT_ID is required}"
SECRET="${CANAL_PRO_SECRET:-}"

# Target: URL com tenant no path
URL="${WEBHOOK_URL}/${TENANT_ID}"

# Phones e external_ids. Ajustar property_code pra um imóvel real do tenant
# antes de rodar em produção — ou deixar propositalmente inexistente pra
# testar fallback de match.
PHONE_1="5548988880001"   # form + imóvel existente
PHONE_2="5548988880002"   # phone click
PHONE_3="5548988880003"   # WA click
PHONE_4="5548988880004"   # sem nome
PHONE_5="5548988880005"   # duplicate (roda 2x)
PHONE_6="5548999990000"   # DNC prévio (precisa estar flagged em contacts.dnc)

PROP_EXISTS="${PROP_EXISTS:-56088}"   # imóvel sabidamente no Vista
PROP_UNKNOWN="${PROP_UNKNOWN:-99999}" # não deve existir

AUTH_ARGS=()
if [[ -n "$SECRET" ]]; then
  # Canal Pro manda Basic Auth: user:secret em base64
  AUTH_ARGS=(-u "canal_pro:${SECRET}")
fi

print_header() {
  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "  [$1] $2"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
}

post() {
  local body="$1"
  curl -sS -X POST "$URL" \
    "${AUTH_ARGS[@]}" \
    -H 'Content-Type: application/json' \
    -d "$body"
  echo ""
}

# ---- 1. Form submit com imóvel existente ----
print_header "1/6" "Form submit — imóvel existente no Vista ($PROP_EXISTS)"
post "$(cat <<EOF
{
  "leadOrigin": "GRUPO_ZAP",
  "originLeadId": "smoke-$(date +%s)-1",
  "originListingId": "zap-listing-${PROP_EXISTS}",
  "name": "Ana Silva (smoke)",
  "email": "ana.smoke@example.com",
  "ddd": "48",
  "phone": "988880001",
  "clientListingId": "${PROP_EXISTS}",
  "transactionType": "SELL",
  "temperature": "Alta",
  "message": "Tenho interesse neste apartamento, pode me passar mais detalhes?",
  "extraData": {"leadType": "CONTACT_FORM"}
}
EOF
)"

# ---- 2. Phone click ----
print_header "2/6" "Phone click — greeting direto"
post "$(cat <<EOF
{
  "leadOrigin": "GRUPO_ZAP",
  "originLeadId": "smoke-$(date +%s)-2",
  "name": "Bruno Costa (smoke)",
  "ddd": "48",
  "phone": "988880002",
  "clientListingId": "${PROP_EXISTS}",
  "transactionType": "SELL",
  "temperature": "Média",
  "extraData": {"leadType": "PHONE_VIEW"}
}
EOF
)"

# ---- 3. WhatsApp click ----
print_header "3/6" "WhatsApp click — greeting WA"
post "$(cat <<EOF
{
  "leadOrigin": "GRUPO_ZAP",
  "originLeadId": "smoke-$(date +%s)-3",
  "name": "Carla Dias (smoke)",
  "ddd": "48",
  "phone": "988880003",
  "clientListingId": "${PROP_UNKNOWN}",
  "transactionType": "RENT",
  "temperature": "Alta",
  "extraData": {"leadType": "CLICK_WHATSAPP"}
}
EOF
)"

# ---- 4. Sem nome (testa B3 fix) ----
print_header "4/6" "Lead sem nome — deve usar saudação neutra (B3)"
post "$(cat <<EOF
{
  "leadOrigin": "GRUPO_ZAP",
  "originLeadId": "smoke-$(date +%s)-4",
  "ddd": "48",
  "phone": "988880004",
  "clientListingId": "${PROP_EXISTS}",
  "transactionType": "SELL",
  "extraData": {"leadType": "CONTACT_FORM"}
}
EOF
)"

# ---- 5. Duplicate originLeadId (roda 2x com mesmo ID) ----
DUP_ID="smoke-dup-$(date +%s)"
print_header "5/6a" "First dispatch (originLeadId=$DUP_ID)"
post "$(cat <<EOF
{
  "leadOrigin": "GRUPO_ZAP",
  "originLeadId": "${DUP_ID}",
  "name": "Diego Lima (smoke)",
  "ddd": "48",
  "phone": "988880005",
  "clientListingId": "${PROP_EXISTS}",
  "transactionType": "SELL",
  "extraData": {"leadType": "CONTACT_FORM"}
}
EOF
)"
print_header "5/6b" "RE-dispatch mesmo ID — esperado {duplicate:true}"
post "$(cat <<EOF
{
  "leadOrigin": "GRUPO_ZAP",
  "originLeadId": "${DUP_ID}",
  "name": "Diego Lima (smoke)",
  "ddd": "48",
  "phone": "988880005",
  "clientListingId": "${PROP_EXISTS}",
  "transactionType": "SELL",
  "extraData": {"leadType": "CONTACT_FORM"}
}
EOF
)"

# ---- 6. DNC prévio ----
print_header "6/6" "Contato já DNC — esperado {dnc_blocked:true}"
echo "  ⚠️ Pré-requisito: UPDATE contacts SET dnc=true WHERE phone='${PHONE_6}' AND tenant_id='${TENANT_ID}';"
post "$(cat <<EOF
{
  "leadOrigin": "GRUPO_ZAP",
  "originLeadId": "smoke-$(date +%s)-6",
  "name": "Erika Mota (smoke)",
  "ddd": "48",
  "phone": "999990000",
  "clientListingId": "${PROP_EXISTS}",
  "transactionType": "SELL",
  "extraData": {"leadType": "CONTACT_FORM"}
}
EOF
)"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Smoke test concluído. Validar no inbox da Smolka:"
echo "  - 4 conversas novas com greeting adaptado por leadType"
echo "  - 1 conversa que recebeu DUP e não disparou greeting de novo"
echo "  - 1 conversa DNC silenciada (sem greeting)"
echo "  - portal_leads_log com 6-7 linhas novas"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
