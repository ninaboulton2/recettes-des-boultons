#!/usr/bin/env bash
# ============================================================================
#  Amorçage d'une base Supabase LOCALE jetable pour les tests e2e (CI)
# ============================================================================
#  1. supabase/local/setup.sh --seed-test --no-verify
#       schéma prod + seed_test.sql (données jetables, pas de snapshot) +
#       migrations 0003 → 00xx ;
#  2. supabase/local/test_accounts.sql
#       admin@local.test / user@local.test (mot de passe password123) : en
#       mode --seed-test, setup.sh ne crée PAS ces comptes (les tests SQL
#       comptent les utilisateurs du seed) ;
#  3. vérification des comptes et rechargement du cache de schéma PostgREST.
#
#  Usage : scripts/ci-seed.sh        (après `supabase start`)
#    SUPABASE_DB_URL  URL de la base (défaut : celle de `supabase start`),
#                     refusée si l'hôte n'est pas local.
#  Ne pas lancer sur une base locale contenant le snapshot : seed_test.sql
#  n'est chargé que si les migrations 0003+ sont absentes (setup.sh l'ignore
#  sinon), mais les comptes seraient alignés quand même.
# ============================================================================
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DB_URL="${SUPABASE_DB_URL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"

case "$DB_URL" in
  *@127.0.0.1:*|*@localhost:*|*@127.0.0.1/*|*@localhost/*) ;;
  *) echo "Refus : $DB_URL n'est pas une base locale." >&2; exit 2 ;;
esac

SUPABASE_DB_URL="$DB_URL" bash "$ROOT/supabase/local/setup.sh" --seed-test --no-verify

PSQL=(psql "$DB_URL" -X -v ON_ERROR_STOP=1 -q)
echo "▶ supabase/local/test_accounts.sql"
"${PSQL[@]}" -f "$ROOT/supabase/local/test_accounts.sql"

accounts="$("${PSQL[@]}" -At -c "select string_agg(u.email || ':' || p.role, ',' order by u.email)
  from auth.users u join public.profiles p on p.id = u.id
  where u.email in ('admin@local.test', 'user@local.test')")"
if [[ "$accounts" != "admin@local.test:admin,user@local.test:user" ]]; then
  echo "Comptes de test inattendus : '$accounts'" >&2
  exit 1
fi

"${PSQL[@]}" -c "notify pgrst, 'reload schema'"
echo "✅ Base e2e prête (seed_test.sql + $accounts)."
