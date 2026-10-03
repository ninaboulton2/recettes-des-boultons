#!/usr/bin/env bash
# ============================================================================
#  npm run db:local:test — rejoue les migrations + tests SQL sur la stack locale
# ============================================================================
#  1. base vide :
#       - par défaut `supabase db reset` (⚠️ VIDE la base `postgres` de la
#         stack : refaire `npm run db:local:reset` ensuite pour retrouver le
#         snapshot prod) ;
#       - avec SUPABASE_TEST_DATABASE=<nom> (ex. ci_test) : base SÉPARÉE sur la
#         même stack, recréée à chaque fois à partir du schéma Supabase de
#         `postgres` (auth, storage, extensions, rôles, droits par défaut) sans
#         le schéma applicatif → la base `postgres` (et ses données) n'est PAS
#         touchée. Nécessite pg_dump 17 (brew install postgresql@17).
#  2. setup.sh --seed-test --until 0012 : baseline, 0001/0002, seed_test.sql,
#     0003 → 0012 (« expand »), rejeu (idempotence), tests test_0003 → 0012
#  3. 0013 → dernière (« contract » : 0013, 0014, 0015), rejeu, tests
#     test_0013 → …  (chaque script annule sa transaction ou nettoie)
#  Ne touche jamais à la prod.
# ============================================================================
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SUPA="$(dirname "$HERE")"
ROOT="$(cd "$SUPA/.." && pwd)"
HOSTPORT="127.0.0.1:54322"
TEST_DB="${SUPABASE_TEST_DATABASE:-postgres}"
if [[ ! "$TEST_DB" =~ ^[a-z_][a-z0-9_]*$ ]]; then echo "SUPABASE_TEST_DATABASE invalide : $TEST_DB" >&2; exit 2; fi
DB_URL="postgresql://postgres:postgres@$HOSTPORT/$TEST_DB"
ADMIN_URL="postgresql://supabase_admin:postgres@$HOSTPORT/postgres"
# Les tests simulent plusieurs rôles via tests.login() (set local role …), dont
# supabase_auth_admin, réservé aux superusers : ils tournent donc en tant que
# supabase_admin (superuser local de la CLI, mot de passe « postgres »).
TEST_DB_URL="${SUPABASE_TEST_DB_URL:-postgresql://supabase_admin:postgres@$HOSTPORT/$TEST_DB}"
cd "$ROOT"

if command -v psql >/dev/null 2>&1; then PSQL_BIN=psql
elif [[ -x /opt/homebrew/opt/postgresql@17/bin/psql ]]; then PSQL_BIN=/opt/homebrew/opt/postgresql@17/bin/psql
elif [[ -x /opt/homebrew/opt/libpq/bin/psql ]]; then PSQL_BIN=/opt/homebrew/opt/libpq/bin/psql
else echo "psql introuvable : brew install libpq." >&2; exit 2; fi
PSQL=("$PSQL_BIN" -X -v ON_ERROR_STOP=1 -q)

if [[ "$TEST_DB" == postgres ]]; then
  npx supabase db reset
else
  PG_DUMP=""
  for c in /opt/homebrew/opt/postgresql@17/bin/pg_dump "$(command -v pg_dump || true)"; do
    if [[ -n "$c" && -x "$c" ]] && "$c" --version | grep -q ' 1[7-9]\.'; then PG_DUMP="$c"; break; fi
  done
  [[ -n "$PG_DUMP" ]] || { echo "pg_dump 17 introuvable (brew install postgresql@17)." >&2; exit 2; }
  echo "▶ Base de test séparée « $TEST_DB » (la base postgres n'est pas touchée)"
  "${PSQL[@]}" "$ADMIN_URL" -c "drop database if exists \"$TEST_DB\" with (force)" -c "create database \"$TEST_DB\" owner postgres"
  # Schéma Supabase (auth, storage, extensions, droits) sans données, puis
  # suppression du schéma applicatif : setup.sh repart de la baseline.
  "$PG_DUMP" --schema-only --no-comments "$ADMIN_URL" \
    | "$PSQL_BIN" -X -q "postgresql://supabase_admin:postgres@$HOSTPORT/$TEST_DB" >/dev/null 2>&1 || true
  "${PSQL[@]}" "postgresql://supabase_admin:postgres@$HOSTPORT/$TEST_DB" <<'SQL'
do $$
declare r record;
begin
  for r in select c.oid::regclass as rel from pg_class c join pg_namespace n on n.oid = c.relnamespace
            where n.nspname = 'public' and c.relkind in ('r', 'p', 'v', 'm', 'f') loop
    execute format('drop %s if exists %s cascade',
      case (select relkind from pg_class where oid = r.rel) when 'v' then 'view' when 'm' then 'materialized view'
           when 'f' then 'foreign table' else 'table' end, r.rel);
  end loop;
  for r in select p.oid::regprocedure as fn from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public'
              and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e') loop
    execute format('drop routine if exists %s cascade', r.fn);
  end loop;
end $$;
drop schema if exists private cascade;
drop schema if exists tests cascade;
SQL
fi

SUPABASE_DB_URL="$DB_URL" "$HERE/setup.sh" --seed-test --until 0012

num() { local b; b="$(basename "$1")"; echo $((10#${b:0:4})); }
EXPAND=(); CONTRACT=()
for f in "$SUPA"/migrations/0*_*.sql; do
  n=$(num "$f")
  if (( n >= 3 && n <= 12 )); then EXPAND+=("$f"); elif (( n >= 13 )); then CONTRACT+=("$f"); fi
done

# Idempotence : rejouer 0003 → 0012 une seconde fois ne doit rien casser.
echo "▶ Rejeu idempotence 0003 → 0012"
for f in "${EXPAND[@]}"; do "${PSQL[@]}" "$DB_URL" -f "$f" 2>&1 | grep -v NOTICE || true; done
for f in "$SUPA"/tests/test_*.sql; do
  if (( $(num "${f#*test_}") <= 12 )); then echo "▶ tests/$(basename "$f")"; "${PSQL[@]}" "$TEST_DB_URL" -f "$f"; fi
done

# Phase « contract » : 0013 (colonnes JSONB), 0014 (sauvegardes), 0015 (nettoyage)
for f in "${CONTRACT[@]}"; do echo "▶ migrations/$(basename "$f")"; "${PSQL[@]}" "$DB_URL" -f "$f"; done
echo "▶ Rejeu idempotence 0013 → …"
for f in "${CONTRACT[@]}"; do "${PSQL[@]}" "$DB_URL" -f "$f" 2>&1 | grep -v NOTICE || true; done
for f in "$SUPA"/tests/test_*.sql; do
  if (( $(num "${f#*test_}") >= 13 )); then echo "▶ tests/$(basename "$f")"; "${PSQL[@]}" "$TEST_DB_URL" -f "$f"; fi
done

echo "✅ Migrations et tests SQL passés sur la stack locale (base « $TEST_DB »)."
if [[ "$TEST_DB" == postgres ]]; then
  echo "   Pour retrouver les données prod : npm run db:local:reset"
fi
