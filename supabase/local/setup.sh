#!/usr/bin/env bash
# ============================================================================
#  Amorçage de la base Supabase LOCALE (Docker, CLI Supabase) — jamais la prod
# ============================================================================
#  Enchaîne, sur la base locale démarrée par `npx supabase start` :
#    1. tests/01_baseline_schema.sql  (schéma prod « avant 0001 »)   ┐ une seule
#       migrations/0001, 0002           (déjà appliquées en prod)      ┘ fois
#    2. local/snapshot/*.sql  (données prod anonymisées, gitignorées)
#       ou seed_test.sql avec --seed-test (données jetables des tests)
#    3. migrations/0003 → 0010 (idempotentes, rejouées à chaque appel)
#    4. local/test_accounts.sql (admin@local.test / user@local.test)
#       local/tests_shim.sql    (tests.login / tests.logout)
#    5. local/verify.sql (comptes attendus de MIGRATION_NOTES.md § 4)
#
#  Idempotent : rejouable sur une base déjà amorcée (les étapes 1 et 2 sont
#  sautées si le schéma / les migrations sont déjà là). Pour repartir de zéro :
#  `npx supabase db reset` puis ce script (= npm run db:local:reset).
#
#  Usage : supabase/local/setup.sh [--seed-test] [--no-verify]
#    SUPABASE_DB_URL  URL de la base (défaut : celle de `supabase start`).
#                     Refusée si l'hôte n'est pas local.
# ============================================================================
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SUPA="$(dirname "$HERE")"
DB_URL="${SUPABASE_DB_URL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"
MODE=snapshot
VERIFY=1

for arg in "$@"; do
  case "$arg" in
    --seed-test) MODE=seed-test ;;
    --no-verify) VERIFY=0 ;;
    -h|--help) sed -n '2,22p' "$0"; exit 0 ;;
    *) echo "Option inconnue : $arg" >&2; exit 2 ;;
  esac
done

# Garde-fou : ce script ne doit JAMAIS viser la prod.
case "$DB_URL" in
  *@127.0.0.1:*|*@localhost:*|*@\[::1\]:*|*@127.0.0.1/*|*@localhost/*) ;;
  *) echo "Refus : $DB_URL n'est pas une base locale." >&2; exit 2 ;;
esac

if command -v psql >/dev/null 2>&1; then
  PSQL_BIN=psql
elif [[ -x /opt/homebrew/opt/postgresql@17/bin/psql ]]; then
  PSQL_BIN=/opt/homebrew/opt/postgresql@17/bin/psql
elif [[ -x /opt/homebrew/opt/libpq/bin/psql ]]; then
  PSQL_BIN=/opt/homebrew/opt/libpq/bin/psql
else
  echo "psql introuvable : brew install libpq (ou postgresql@17)." >&2; exit 2
fi

PSQL=("$PSQL_BIN" "$DB_URL" -X -v ON_ERROR_STOP=1 -q)
run()       { echo "▶ ${1#"$SUPA/"}"; "${PSQL[@]}" -f "$1"; }
sql()       { "${PSQL[@]}" -At -c "$1"; }
has_table() { [[ "$(sql "select to_regclass('$1') is not null")" == "t" ]]; }

for i in $(seq 1 30); do
  sql "select 1" >/dev/null 2>&1 && break
  if [[ $i -eq 30 ]]; then echo "Base injoignable : $DB_URL (lancer \`npx supabase start\`)." >&2; exit 1; fi
  sleep 1
done

echo "Base locale : $DB_URL (mode : $MODE)"

# 1. Schéma prod ---------------------------------------------------------------
if has_table public.recipes; then
  echo "• Schéma déjà présent : baseline / 0001 / 0002 ignorés"
else
  run "$SUPA/tests/01_baseline_schema.sql"
  run "$SUPA/migrations/0001_harden_rls.sql"
  run "$SUPA/migrations/0002_drop_unused_secdef_functions.sql"
fi

# 2. Données (avant 0003 : 0005 transforme les données, on n'importe qu'une fois)
HAS_DATA=1
if has_table public.units; then
  echo "• Migrations 0003+ déjà appliquées : import des données ignoré"
elif [[ $MODE == seed-test ]]; then
  run "$SUPA/seed_test.sql"
else
  shopt -s nullglob
  snapshot_files=("$HERE"/snapshot/*.sql)
  shopt -u nullglob
  if (( ${#snapshot_files[@]} == 0 )); then
    echo "⚠ Aucun snapshot dans supabase/local/snapshot/ : base sans recettes (voir export_snapshot.md)."
    HAS_DATA=0
  else
    for f in "${snapshot_files[@]}"; do run "$f"; done
  fi
fi

# 3. Migrations 0003 → 0010 ------------------------------------------------------
for f in "$SUPA"/migrations/00{03,04,05,06,07,08,09,10,11,12}_*.sql; do run "$f"; done

# 4. Comptes de test + aide aux tests ----------------------------------------
# En mode seed-test, les tests SQL comptent exactement les utilisateurs de
# seed_test.sql : pas de comptes applicatifs supplémentaires.
if [[ $MODE == snapshot ]]; then
  run "$HERE/test_accounts.sql"
fi
run "$HERE/tests_shim.sql"

# 5. Vérifications ------------------------------------------------------------
if [[ $MODE == snapshot && $HAS_DATA -eq 1 && $VERIFY -eq 1 ]]; then
  run "$HERE/verify.sql"
fi

sql "notify pgrst, 'reload schema'" >/dev/null

echo
echo "Comptes locaux (mot de passe : password123) :"
"${PSQL[@]}" -c "select u.email, coalesce(p.role, '-') as role, coalesce(p.name, '-') as name,
  (select count(*) from public.favorites f where f.user_id = u.id) as favoris,
  (select count(*) from public.planning pl where pl.user_id = u.id) as planning,
  (select count(*) from public.shopping_lists sl where sl.user_id = u.id) as listes
  from auth.users u left join public.profiles p on p.id = u.id order by role, u.email"
echo "Studio : http://127.0.0.1:54323 — API : http://127.0.0.1:54321 — Mails : http://127.0.0.1:54324"
echo "✅ Base locale prête."
