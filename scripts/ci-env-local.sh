#!/usr/bin/env bash
# ============================================================================
#  Écrit .env.local depuis `supabase status -o env` (stack locale démarrée)
# ============================================================================
#  SUPABASE_URL / SUPABASE_ANON_KEY : API locale et clé anon de la CLI ;
#  AI_PROVIDER=mock : aucun appel à un fournisseur d'IA.
#  Usage : scripts/ci-env-local.sh [fichier]   (défaut : .env.local)
#  SUPABASE_CLI : commande de la CLI (défaut : supabase, sinon npx supabase).
# ============================================================================
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT="${1:-$ROOT/.env.local}"
if [[ -n "${SUPABASE_CLI:-}" ]]; then
  read -r -a CLI <<< "$SUPABASE_CLI"
elif command -v supabase >/dev/null 2>&1; then
  CLI=(supabase)
else
  CLI=(npx supabase)
fi

status="$(cd "$ROOT" && "${CLI[@]}" status -o env)"
API_URL="$(sed -n 's/^API_URL="\{0,1\}\([^"]*\)"\{0,1\}$/\1/p' <<< "$status")"
ANON_KEY="$(sed -n 's/^ANON_KEY="\{0,1\}\([^"]*\)"\{0,1\}$/\1/p' <<< "$status")"
if [[ -z "$API_URL" || -z "$ANON_KEY" ]]; then
  echo "API_URL / ANON_KEY introuvables dans \`supabase status -o env\`." >&2
  exit 1
fi
case "$API_URL" in
  http://127.0.0.1:*|http://localhost:*) ;;
  *) echo "Refus : $API_URL n'est pas une API locale." >&2; exit 2 ;;
esac

cat > "$OUT" <<ENV
# Généré par scripts/ci-env-local.sh (stack Supabase locale) : ne pas commiter.
SUPABASE_URL=$API_URL
SUPABASE_ANON_KEY=$ANON_KEY
AI_PROVIDER=mock
ENV
echo "✓ ${OUT#"$ROOT/"} écrit ($API_URL)"
