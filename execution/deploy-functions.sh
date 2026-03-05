#!/bin/bash
# deploy-functions.sh
# Deploy seletivo de Edge Functions da Aimee
#
# USO:
#   ./execution/deploy-functions.sh                    # lista funções disponíveis
#   ./execution/deploy-functions.sh ai-agent           # deploy de função específica
#   ./execution/deploy-functions.sh all                # deploy de todas as funções
#   ./execution/deploy-functions.sh shared             # deploy de funções que usam _shared/
#
# REQUISITOS:
#   - supabase CLI instalado (npm install -g supabase)
#   - Autenticado: supabase login

PROJECT_REF="vnysbpnggnplvgkfokin"

# Funções que importam _shared/ (devem ser redesployadas quando _shared/ muda)
SHARED_DEPS=(
  "ai-agent"
  "whatsapp-webhook"
  "send-wa-message"
  "send-wa-media"
  "send-wa-template"
  "c2s-create-lead"
  "manage-team"
  "manage-templates"
  "manage-tickets"
)

# Todas as funções
ALL_FUNCTIONS=(
  "ai-agent"
  "whatsapp-webhook"
  "send-wa-message"
  "send-wa-media"
  "send-wa-template"
  "c2s-create-lead"
  "manage-team"
  "manage-templates"
  "manage-tickets"
  "portal-leads-webhook"
  "vista-search-properties"
  "vista-get-property"
  "sync-catalog-xml"
  "process-xml-queue-item"
)

deploy_function() {
  local func=$1
  echo "🚀 Deployando $func..."
  supabase functions deploy "$func" --project-ref "$PROJECT_REF"
  if [ $? -eq 0 ]; then
    echo "   ✅ $func deployado com sucesso"
  else
    echo "   ❌ Erro ao deployar $func"
    return 1
  fi
}

case "${1:-}" in
  "")
    echo "📋 Funções disponíveis:"
    echo ""
    echo "  Dependem de _shared/ (usar 'shared' se _shared/ foi modificado):"
    for f in "${SHARED_DEPS[@]}"; do
      echo "    - $f"
    done
    echo ""
    echo "  Todas as funções:"
    for f in "${ALL_FUNCTIONS[@]}"; do
      echo "    - $f"
    done
    echo ""
    echo "USO:"
    echo "  $0 <nome-funcao>    # deploy específico"
    echo "  $0 shared           # deploy das que usam _shared/"
    echo "  $0 all              # deploy de todas"
    ;;

  "all")
    echo "🚀 Deployando TODAS as funções para projeto $PROJECT_REF..."
    echo ""
    ERRORS=0
    for func in "${ALL_FUNCTIONS[@]}"; do
      deploy_function "$func" || ((ERRORS++))
      sleep 2
    done
    echo ""
    if [ $ERRORS -eq 0 ]; then
      echo "✅ Todas as funções deployadas com sucesso!"
    else
      echo "⚠️  $ERRORS função(ões) com erro. Verificar acima."
    fi
    ;;

  "shared")
    echo "🚀 Deployando funções que dependem de _shared/ para projeto $PROJECT_REF..."
    echo ""
    ERRORS=0
    for func in "${SHARED_DEPS[@]}"; do
      deploy_function "$func" || ((ERRORS++))
      sleep 2
    done
    echo ""
    if [ $ERRORS -eq 0 ]; then
      echo "✅ Funções shared deployadas com sucesso!"
    else
      echo "⚠️  $ERRORS função(ões) com erro. Verificar acima."
    fi
    ;;

  *)
    # Deploy de função específica
    deploy_function "$1"
    ;;
esac

echo ""
echo "📊 Verificar logs em: https://app.supabase.com/project/$PROJECT_REF/functions"
