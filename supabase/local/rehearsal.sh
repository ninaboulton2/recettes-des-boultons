#!/usr/bin/env bash
# ============================================================================
#  Répétition de la bascule v2 sur la copie LOCALE des vraies données (phase 10) — jamais la prod
# ============================================================================
#  Rejoue de bout en bout supabase/BASCULE_V2.md sur la base Docker locale + le snapshot réel (gitignoré) :
#    1. base v1 « comme la prod » : reset, snapshot, 0001 → 0017, 0019, 0021, 0023, 0024 ;
#       traductions anglaises fabriquées (le snapshot n'en a pas), puis ce que Nina applique : 0025 → 0030
#    2. jour J : paramètres FACTICES (propriétaire = le compte admin le plus ancien, pseudonymes inventés pour CHAQUE compte),
#       0018 params, 0018, contrôles de l'étape 5, 0020, contrôles, 0029 (photos), contrôles
#    3. contrôles fonctionnels (rehearsal_checks.sql) et mesures de performance (rehearsal_perf.sql)
#    4. retour arrière : photos, 0020, 0018 ; empreinte des données identique à l'avant (rehearsal_fingerprint.sql)
#  Chaque étape affiche sa durée et ses NOTICE. Journal complet dans $LOG (défaut : /tmp/rehearsal_v2.log).
#
#    bash supabase/local/rehearsal.sh [--no-reset] [--keep-v2] [--skip-perf]
#      --no-reset   ne remet pas la base à zéro (suppose l'état v1 + 0025 → 0030 déjà posé)
#      --keep-v2    s'arrête avant le retour arrière (base en état v2 : pour les e2e v2 ou la navigation à la main)
#      --skip-perf  saute les mesures
#  Pré-requis : la stack tourne (`npm run db:local:up`), snapshot présent dans supabase/local/snapshot/.
#  À la fin, remettre la base en v1 : `npm run db:local:reset` (le script le fait lui-même sauf avec --keep-v2).
# ============================================================================
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SUPA="$(dirname "$HERE")"
ROOT="$(dirname "$SUPA")"
DB_URL="${SUPABASE_DB_URL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"
LOG="${LOG:-/tmp/rehearsal_v2.log}"
RESET=1; KEEP=0; PERF=1
for a in "$@"; do case "$a" in --no-reset) RESET=0;; --keep-v2) KEEP=1;; --skip-perf) PERF=0;; *) echo "Option inconnue : $a" >&2; exit 2;; esac; done

case "$DB_URL" in
  *@127.0.0.1:*|*@localhost:*|*@\[::1\]:*|*@127.0.0.1/*|*@localhost/*) ;;
  *) echo "Refus : $DB_URL n'est pas une base locale." >&2; exit 2 ;;
esac
if command -v psql >/dev/null 2>&1; then PSQL_BIN=psql
elif [[ -x /opt/homebrew/opt/postgresql@17/bin/psql ]]; then PSQL_BIN=/opt/homebrew/opt/postgresql@17/bin/psql
elif [[ -x /opt/homebrew/opt/libpq/bin/psql ]]; then PSQL_BIN=/opt/homebrew/opt/libpq/bin/psql
else echo "psql introuvable : brew install libpq (ou postgresql@17)." >&2; exit 2; fi
ls "$HERE"/snapshot/*.sql >/dev/null 2>&1 || { echo "Snapshot absent (supabase/local/snapshot/) : voir export_snapshot.md." >&2; exit 2; }

: > "$LOG"
q()   { "$PSQL_BIN" "$DB_URL" -X -At -v ON_ERROR_STOP=1 "$@"; }
now() { perl -MTime::HiRes=time -e 'printf "%.3f", time'; }
say() { echo "$*" | tee -a "$LOG"; }
# step <libellé> <fichier.sql> : exécute, affiche NOTICE et durée
step() {
  local label="$1" file="$2" t0 t1
  say ""; say "▶ $label  ($(basename "$file"))"
  t0=$(now)
  "$PSQL_BIN" "$DB_URL" -X -q -v ON_ERROR_STOP=1 -f "$file" 2>&1 | { grep -v "does not exist, skipping" || true; } | sed 's/^psql:[^ ]* NOTICE:  /   NOTICE : /' | tee -a "$LOG"
  t1=$(now); say "   durée : $(perl -e "printf '%.2f', $t1 - $t0") s"
}
sqlshow() { say ""; say "▶ $1"; shift; "$PSQL_BIN" "$DB_URL" -X -v ON_ERROR_STOP=1 -P pager=off "$@" 2>&1 | tee -a "$LOG"; }

# ------------------------------------------------------------------ 1. état v1 comme la prod, puis 0025 → 0030
if [[ $RESET -eq 1 ]]; then
  say "▶ Reset de la base locale + snapshot + 0001 → 0017, 0019, 0021, 0023, 0024"
  ( cd "$ROOT" && npx supabase db reset >/dev/null 2>&1 && bash "$HERE/setup.sh" --until 24 --no-verify ) >>"$LOG" 2>&1
  q -f "$HERE/rehearsal_seed_translations.sql" >>"$LOG"
  for f in "$SUPA"/migrations/00{25,26,27,28,29,30,31}_*.sql; do step "Migration $(basename "$f" | cut -c1-4)" "$f"; done
fi
q -f "$HERE/rehearsal_fingerprint.sql" > "${LOG%.log}_avant.txt"
say ""; say "▶ Empreinte « avant » : ${LOG%.log}_avant.txt"
sqlshow "Étape 1 — photographie de départ" -c "select (select count(*) from public.recipes) as recettes, (select count(*) from public.recipe_sections) as sections, (select count(*) from public.recipe_ingredients) as ingredients, (select count(*) from public.instructions) as etapes, (select count(*) from public.recipe_translations) as traductions, (select count(*) from public.profiles) as profils, (select count(*) from public.profiles where role = 'admin') as admins, (select count(*) from public.favorites) as favoris, (select count(*) from public.planning) as repas, (select count(*) from public.shopping_items) as articles, (select max(updated_at) from public.recipes) as derniere_modif"
sqlshow "Prérequis § 1.2" -c "select to_regclass('public.groups') is not null as t0017, to_regprocedure('private.can_read_recipe(uuid)') is not null as f0019, to_regprocedure('public.copy_recipe(uuid)') is not null as f0021, to_regprocedure('public.send_friend_request(uuid)') is not null as f0023, to_regprocedure('public.recipe_access(uuid)') is not null as f0026, to_regprocedure('public.shared_recipe_photo_path(uuid)') is not null as f0029, (select count(*) from public.recipes where owner_id is not null) as recettes_avec_proprietaire"

# ------------------------------------------------------------------ 2. jour J
step "Étape 2 — table des paramètres" "$SUPA/v2/0018_params.sql"
say ""; say "▶ Étape 3 — paramètres FACTICES (propriétaire = admin le plus ancien ; un pseudonyme inventé par compte, sans e-mail)"
q -c "insert into private.v2_fill_params (key, value)
      select 'owner_email', lower(email) from (select u.email from auth.users u join public.profiles p on p.id = u.id where p.role = 'admin' order by u.created_at, u.id limit 1) o
      on conflict (key) do update set value = excluded.value;
      insert into private.v2_fill_params (key, value)
      select 'display_name:' || lower(u.email), (array['Capucine','Ambroise','Basile','Hortense','Léonard','Colombe','Gaspard','Mélusine'])[row_number() over (order by u.created_at, u.id)]
        from auth.users u join public.profiles p on p.id = u.id where u.email is not null
      on conflict (key) do update set value = excluded.value;" >>"$LOG"
say "   $(q -c "select count(*) from private.v2_fill_params") paramètres posés"
step "Étape 4 — remplissage 0018" "$SUPA/v2/0018_v2_data_fill.sql"
cat > "${LOG%.log}_ctl5.sql" <<'EOF'
select p.display_name, p.role, p.active_theme_group_id is not null as theme_groupe, p.onboarded_at is not null as accueil_fait, (select count(*) from public.categories c where c.owner_id = p.id) as categories from public.profiles p order by p.created_at;
select g.name, g.theme->>'preset' as theme, (select count(*) from public.group_members m where m.group_id = g.id) as membres, (select count(*) from public.group_members m where m.group_id = g.id and m.role = 'creator') as createurs from public.groups g;
select count(*) as recettes, count(owner_id) as avec_proprietaire, count(category_id) as avec_categorie, count(*) filter (where visibility = 'groups') as en_groupe from public.recipes;
select count(*) as droits_edition from public.recipe_grants where permission = 'edit_original' and grantee_group_id is not null;
select (select count(*) from public.recipe_sections) as sections, (select count(*) from public.recipe_ingredients) as ingredients, (select count(*) from public.instructions) as etapes, (select count(*) from public.recipe_translations) as traductions, (select count(*) from public.favorites) as favoris, (select count(*) from public.planning) as repas, (select max(updated_at) from public.recipes) as derniere_modif;
select (select count(*) from public.cookbook_entries) as entrees_carnet, (select count(*) from public.dismissed_prompts) as bannieres_fermees;
select (select count(*) from public.recipes where owner_id is null) as sans_proprietaire, (select count(*) from public.recipes r where not exists (select 1 from public.profiles p where p.id = r.owner_id)) as proprietaire_sans_profil;
EOF
sqlshow "Étape 5 — contrôles de 0018 (A à F)" -f "${LOG%.log}_ctl5.sql"
step "Étape 6 — bascule 0020" "$SUPA/v2/0020_rls_switchover.sql"
sqlshow "Étape 6 — contrôles" -c "select (select count(*) from pg_policies where schemaname = 'public' and tablename = 'recipes') as politiques_recipes, (select is_nullable from information_schema.columns where table_schema = 'public' and table_name = 'recipes' and column_name = 'owner_id') as owner_id_nullable, (select count(*) from pg_policies where schemaname = 'public' and tablename in ('recipes','recipe_sections','recipe_ingredients','instructions','recipe_translations') and (roles <> '{authenticated}' or qual ~ 'is_admin' or with_check ~ 'is_admin')) as residus_v1"
step "Étape 6 bis — photos privées" "$SUPA/v2/0029_private_photos_switchover.sql"
sqlshow "Étape 6 bis — contrôles" -c "select (select public from storage.buckets where id = 'recipe-photos') as bucket_public, (select count(*) from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname like 'recipe_photos_%' and roles = '{authenticated}') as politiques_storage, has_function_privilege('anon', 'public.shared_recipe_photo_path(uuid)', 'execute') as anon_peut_signer"

# ------------------------------------------------------------------ 3. contrôles fonctionnels et performance
sqlshow "Contrôles fonctionnels (rehearsal_checks.sql)" -f "$HERE/rehearsal_checks.sql"
if [[ $PERF -eq 1 ]]; then sqlshow "Performance (rehearsal_perf.sql)" -f "$HERE/rehearsal_perf.sql"; fi

if [[ $KEEP -eq 1 ]]; then say ""; say "Base laissée en état v2 (--keep-v2). Retour v1 : npm run db:local:reset"; exit 0; fi

# ------------------------------------------------------------------ 4. retour arrière
step "Retour 0 — photos" "$SUPA/rollback/0029_private_photos_switchover_down.sql"
step "Retour 1 — 0020 down" "$SUPA/rollback/0020_rls_switchover_down.sql"
step "Retour 2 — 0018 down" "$SUPA/rollback/0018_v2_data_fill_down.sql"
q -c "drop table if exists private.v2_fill_params" >>"$LOG"
q -f "$HERE/rehearsal_fingerprint.sql" > "${LOG%.log}_apres.txt"
say ""
if diff "${LOG%.log}_avant.txt" "${LOG%.log}_apres.txt" >/dev/null; then
  say "✅ Retour arrière : empreinte des données IDENTIQUE à l'avant ($(wc -l < "${LOG%.log}_avant.txt" | tr -d ' ') tables comparées)."
else
  say "❌ Retour arrière : les données diffèrent de l'avant :"; diff "${LOG%.log}_avant.txt" "${LOG%.log}_apres.txt" | tee -a "$LOG"; exit 1
fi
say "   Politiques recipes : $(q -c "select string_agg(policyname, ', ' order by policyname) from pg_policies where schemaname='public' and tablename='recipes'")"
say "   Bucket recipe-photos public : $(q -c "select public from storage.buckets where id='recipe-photos'")"
say "✅ Répétition terminée. Journal : $LOG"
