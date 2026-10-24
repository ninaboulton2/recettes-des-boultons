#!/usr/bin/env bash
# ============================================================================
#  Base de développement LOCALE en état v2 (npm run db:local:v2) — jamais la prod
# ============================================================================
#  Sur la stack locale (voir up.sh), applique la chaîne de la bascule (BASCULE_V2.md), avec des paramètres FACTICES :
#    0017 → 0019 → 0021 → 0023 → 0024   (dossier migrations/, déjà rejouées par setup.sh)
#    → v2/0018_params.sql + supabase/local/v2_params.sql (propriétaire, pseudonymes factices)
#    → v2/0018_v2_data_fill.sql          (groupe « Les Boultons » au thème {"preset":"boultons",…}, propriétaire, catégories)
#    → v2/0020_rls_switchover.sql        (lecture privée : politiques v2)
#    → supabase/local/v2_accounts.sql    (nouveau@local.test : accueil en 3 écrans ; ami@local.test)
#
#  Pré-requis : la stack tourne (`npm run db:local:up`) ; sinon ce script la démarre via up.sh.
#  Idempotent : 0018 et 0020 sont rejouables. Pour repartir de zéro : `npm run db:local:reset` puis `npm run db:local:v2`.
#
#  ⚠ Cette base N'EST PLUS compatible avec la v1 (les visiteurs ne lisent plus les recettes, les inscriptions neuves
#  ne voient rien tant qu'elles n'ont pas de groupe). Les e2e v1 se jouent sur `db:local:up` / `db:local:reset`
#  seulement ; les e2e v2 (`npm run test:e2e:v2`) sur cette base. Lancer l'app avec NUXT_PUBLIC_V2=true :
#      echo 'NUXT_PUBLIC_V2=true' >> .env.local && npm run dev:local
#  Comptes (mot de passe password123) : admin@local.test (propriétaire / support), user@local.test, nouveau@local.test (accueil), ami@local.test.
# ============================================================================
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SUPA="$(dirname "$HERE")"
DB_URL="${SUPABASE_DB_URL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"

case "$DB_URL" in
  *@127.0.0.1:*|*@localhost:*|*@\[::1\]:*|*@127.0.0.1/*|*@localhost/*) ;;
  *) echo "Refus : $DB_URL n'est pas une base locale." >&2; exit 2 ;;
esac

if command -v psql >/dev/null 2>&1; then PSQL_BIN=psql
elif [[ -x /opt/homebrew/opt/postgresql@17/bin/psql ]]; then PSQL_BIN=/opt/homebrew/opt/postgresql@17/bin/psql
elif [[ -x /opt/homebrew/opt/libpq/bin/psql ]]; then PSQL_BIN=/opt/homebrew/opt/libpq/bin/psql
else echo "psql introuvable : brew install libpq (ou postgresql@17)." >&2; exit 2; fi

PSQL=("$PSQL_BIN" "$DB_URL" -X -v ON_ERROR_STOP=1 -q)
run() { echo "▶ ${1#"$SUPA/"}"; "${PSQL[@]}" -f "$1"; }
sql() { "${PSQL[@]}" -At -c "$1"; }

if ! sql "select 1" >/dev/null 2>&1; then
  echo "Base locale injoignable : lancer d'abord \`npm run db:local:up\` (Docker + Supabase)." >&2
  exit 1
fi

# 1. Schéma et migrations 0003 → 0024 (rejouables) — sans les 25 contrôles de la v1, qui supposent l'état d'avant 0017.
"$HERE/setup.sh" --no-verify

# 2. Garde-fou : 0017, 0019, 0021, 0023 doivent être là.
for probe in "public.groups" "public.recipe_grants"; do
  [[ "$(sql "select to_regclass('$probe') is not null")" == "t" ]] || { echo "$probe absente : migrations 0017+ non appliquées." >&2; exit 1; }
done
for fn in "private.can_read_recipe(uuid)" "public.copy_recipe(uuid)" "public.send_friend_request(uuid)" "public.unread_notifications_count()"; do
  [[ "$(sql "select to_regprocedure('$fn') is not null")" == "t" ]] || { echo "$fn absente : migrations 0019 / 0021 / 0023 non appliquées." >&2; exit 1; }
done

# 3. Paramètres factices, remplissage, bascule des politiques
run "$SUPA/v2/0018_params.sql"
run "$HERE/v2_params.sql"
run "$SUPA/v2/0018_v2_data_fill.sql"
run "$SUPA/v2/0020_rls_switchover.sql"

# 4. Comptes neufs (après la bascule : ils ne sont pas dans le groupe)
run "$HERE/v2_accounts.sql"

sql "notify pgrst, 'reload schema'" >/dev/null

echo
"${PSQL[@]}" -c "select u.email, p.role, p.display_name, p.onboarded_at is not null as onboarded,
  (select count(*) from public.categories c where c.owner_id = u.id) as categories,
  (select g.name from public.groups g where g.id = p.active_theme_group_id) as theme_groupe
  from auth.users u join public.profiles p on p.id = u.id order by u.email"
echo "✅ Base locale v2 prête. Lancer l'app : NUXT_PUBLIC_V2=true dans .env.local puis npm run dev:local"
