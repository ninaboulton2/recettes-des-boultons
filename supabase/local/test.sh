#!/usr/bin/env bash
# ============================================================================
#  npm run db:local:test — rejoue les migrations + tests SQL sur la stack locale
# ============================================================================
#  1. `supabase db reset`          base vide (schémas auth/storage Supabase)
#  2. setup.sh --seed-test         baseline, 0001/0002, seed_test.sql, 0003 → 0010
#  3. tests/test_00xx.sql          assertions (chaque script annule sa transaction)
#  Les tests supposent les données JETABLES de seed_test.sql, pas le snapshot
#  prod : la base est donc réinitialisée AVANT et il faut relancer
#  `npm run db:local:reset` ensuite pour retrouver les données prod.
#  ⚠️  Vide la base locale. Ne touche jamais à la prod.
# ============================================================================
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SUPA="$(dirname "$HERE")"
ROOT="$(cd "$SUPA/.." && pwd)"
DB_URL="${SUPABASE_DB_URL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"
# Les tests simulent plusieurs rôles via tests.login() (set local role …), dont
# supabase_auth_admin, réservé aux superusers : ils tournent donc en tant que
# supabase_admin (superuser local de la CLI, mot de passe « postgres »).
TEST_DB_URL="${SUPABASE_TEST_DB_URL:-postgresql://supabase_admin:postgres@127.0.0.1:54322/postgres}"
cd "$ROOT"

if command -v psql >/dev/null 2>&1; then PSQL_BIN=psql
elif [[ -x /opt/homebrew/opt/postgresql@17/bin/psql ]]; then PSQL_BIN=/opt/homebrew/opt/postgresql@17/bin/psql
elif [[ -x /opt/homebrew/opt/libpq/bin/psql ]]; then PSQL_BIN=/opt/homebrew/opt/libpq/bin/psql
else echo "psql introuvable : brew install libpq." >&2; exit 2; fi

npx supabase db reset
"$HERE/setup.sh" --seed-test

# Idempotence : rejouer 0003 → 0010 une seconde fois ne doit rien casser.
echo "▶ Rejeu idempotence 0003 → 0010"
for f in "$SUPA"/migrations/00{03,04,05,06,07,08,09,10}_*.sql; do
  "$PSQL_BIN" "$DB_URL" -X -v ON_ERROR_STOP=1 -q -f "$f" 2>&1 | grep -v NOTICE || true
done

for f in "$SUPA"/tests/test_*.sql; do
  echo "▶ tests/$(basename "$f")"
  "$PSQL_BIN" "$TEST_DB_URL" -X -v ON_ERROR_STOP=1 -q -f "$f"
done
echo "✅ Migrations et tests SQL passés sur la stack locale."
echo "   Pour retrouver les données prod : npm run db:local:reset"
