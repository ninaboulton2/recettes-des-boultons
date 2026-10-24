#!/usr/bin/env bash
# ============================================================================
#  Rejoue toutes les migrations + les tests sur un PostgreSQL local jetable.
# ============================================================================
#  Pré-requis : PostgreSQL 17 (Homebrew : brew install postgresql@17).
#  Aucune connexion à Supabase : tout tourne dans un cluster temporaire.
#
#  Usage :
#    supabase/tests/run_local.sh            # init + migrations + seed + tests
#    supabase/tests/run_local.sh --keep     # laisse le cluster démarré
#    PGBIN=/chemin/vers/bin supabase/tests/run_local.sh
#
#  Étapes :
#    1. initdb dans $WORKDIR/pg17 (port 54329), démarrage
#    2. tests/00_supabase_shim.sql     (émulation auth/storage/rôles)
#    3. tests/01_baseline_schema.sql   (schéma prod avant 0001)
#    4. migrations/0001, 0002          (déjà appliquées en prod)
#    5. seed_test.sql                  (données jetables façon prod)
#    6. migrations/0003 → 0012 (« expand ») + rejeu, tests test_0003 → test_0012
#    7. migrations/0013 → 0017 (« contract » + schéma social) + rejeu,
#       tests test_0013 → test_0017   (assertions ; échec = exit 1)
#    8. rollback/0017 (+ rejeu), vérification, ré-application de 0017 (+ rejeu),
#       test_0017 relancé : « up, down, up » (voir le dossier v2, §4.4)
#    9. migrations/0019 (fonctions d'aide RLS + politiques sociales) + rejeu, test_0019_rls.sql
#       (0018, le remplissage, est dans supabase/v2/ : il passe APRÈS 0019).
#   10. Remplissage v2/0018 (+ v2/0018_params.sql) sur un jeu réaliste (fixtures_0018.sql : 3 comptes
#       dont 2 admins, recettes avec catégorie, favoris) : refus vérifiés (admins ex æquo, pseudonyme
#       absent, égal à l'e-mail ou en double, e-mail ou clé de paramètre inconnus), application,
#       test_0018, rejeu sans doublon.
#   11. Bascule v2/0020 (NON appliquée en prod avec les migrations) sur les données de 0018 : refus si
#       une recette n'a pas de propriétaire ou si un propriétaire n'a pas de profil, application + rejeu,
#       switchover_0020_rls.sql, switchover_0018_filled.sql (membres, étranger, visiteur), retour
#       arrière (empreinte des politiques identique à l'avant), ré-application + tests, retour final.
#   12. « Up, down, up » de 0018 (retour arrière refusé tant que 0020 est là, puis rejeu ; données
#       identiques à l'avant, tests.data_fp()), puis de 0019 (rollback + rejeu, ré-application + rejeu).
#  13. Migration 0021 (fonctions métier côté recettes) : appliquée avec 0019 (+ rejeu), v1 non cassée
#      (test_0021_v1_compat.sql : 0021 seule, avant 0018 / 0020), puis test_0021_recipe_rpcs.sql sous la chaîne
#      complète 0017 → 0019 → 0021 → 0018 → 0020 (deux fois : avant et après le retour arrière de la bascule), et
#      « up, down, up » de 0021 (save_recipe / save_recipe_translation restaurées à l'identique).
#  Les tests de 0003 → 0012 vérifient l'état intermédiaire (colonnes JSONB et
#  sauvegardes encore présentes) : ils tournent AVANT 0013/0014.
# ============================================================================
set -euo pipefail
export LC_ALL=C LANG=C   # évite « postmaster became multithreaded » sur macOS

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SUPA="$(dirname "$HERE")"
PGBIN="${PGBIN:-/opt/homebrew/opt/postgresql@17/bin}"
WORKDIR="${WORKDIR:-${TMPDIR:-/tmp}/recettes-pgtest}"
PORT="${PGPORT_TEST:-54329}"
KEEP=0
[[ "${1:-}" == "--keep" ]] && KEEP=1

PSQL=("$PGBIN/psql" -h 127.0.0.1 -p "$PORT" -U postgres -v ON_ERROR_STOP=1 -q)

cleanup() {
  if [[ $KEEP -eq 0 ]]; then
    "$PGBIN/pg_ctl" -D "$WORKDIR/pg17" stop -m fast >/dev/null 2>&1 || true
    rm -rf "$WORKDIR"
  else
    echo "Cluster conservé : psql -h 127.0.0.1 -p $PORT -U postgres"
  fi
}
trap cleanup EXIT

rm -rf "$WORKDIR"; mkdir -p "$WORKDIR"
# Même locale que la prod (en_US.UTF-8) ; repli C.UTF-8 puis C si absente.
LOCALE=en_US.UTF-8
locale -a 2>/dev/null | grep -qi "^en_US.UTF-8$" || LOCALE=C.UTF-8
locale -a 2>/dev/null | grep -qi "^C.UTF-8$\|^en_US.UTF-8$" || LOCALE=C
"$PGBIN/initdb" -D "$WORKDIR/pg17" -U postgres --auth=trust -E UTF8 --locale="$LOCALE" >/dev/null
"$PGBIN/pg_ctl" -D "$WORKDIR/pg17" -o "-p $PORT -k /tmp -c listen_addresses=127.0.0.1" -l "$WORKDIR/pg.log" start >/dev/null
for _ in $(seq 1 20); do "$PGBIN/pg_isready" -h 127.0.0.1 -p "$PORT" >/dev/null 2>&1 && break; sleep 0.5; done

run() { echo "▶ $1"; "${PSQL[@]}" -f "$1"; }

run "$HERE/00_supabase_shim.sql"
run "$HERE/01_baseline_schema.sql"
run "$SUPA/migrations/0001_harden_rls.sql"
run "$SUPA/migrations/0002_drop_unused_secdef_functions.sql"
run "$SUPA/seed_test.sql"
# Migrations numérotées ≥ 0003, en deux phases (voir en-tête).
num() { local b; b="$(basename "$1")"; echo $((10#${b:0:4})); }
EXPAND=(); CONTRACT=(); LATE=()
for f in "$SUPA"/migrations/0*_*.sql; do
  n=$(num "$f")
  if (( n >= 3 && n <= 12 )); then EXPAND+=("$f"); elif (( n >= 13 && n <= 17 )); then CONTRACT+=("$f"); elif (( n >= 18 )); then LATE+=("$f"); fi
done

for f in "${EXPAND[@]}"; do run "$f"; done
# Idempotence : rejouer 0003 → 0012 une seconde fois ne doit rien casser.
echo "▶ Rejeu idempotence 0003 → 0012"
for f in "${EXPAND[@]}"; do "${PSQL[@]}" -f "$f"; done
for f in "$HERE"/test_*.sql; do if (( $(num "${f#*test_}") <= 12 )); then run "$f"; fi; done

for f in "${CONTRACT[@]}"; do run "$f"; done
echo "▶ Rejeu idempotence 0013 → …"
for f in "${CONTRACT[@]}"; do "${PSQL[@]}" -f "$f"; done
for f in "$HERE"/test_*.sql; do n=$(num "${f#*test_}"); if (( n >= 13 && n <= 17 )); then run "$f"; fi; done

# « Up, down, up » pour 0017 (expand-only) : retour arrière, rejeu du retour arrière,
# état d'avant vérifié, ré-application, rejeu, mêmes tests.
echo "▶ Rollback 0017, rejeu, ré-application"
run "$SUPA/rollback/0017_social_schema_down.sql"
"${PSQL[@]}" -f "$SUPA/rollback/0017_social_schema_down.sql"
"${PSQL[@]}" -c "do \$\$ begin
  assert to_regclass('public.groups') is null and to_regclass('public.recipe_grants') is null, 'tables 0017 encore présentes';
  assert not exists (select 1 from information_schema.columns where table_schema='public' and table_name='recipes' and column_name='owner_id'), 'recipes.owner_id encore présente';
  assert (select count(*) from public.recipes) > 0 and to_regclass('public.recipe_translations') is not null, 'données ou 0016 abîmées';
  assert has_function_privilege('authenticated', 'public.save_recipe(jsonb)', 'execute'), 'save_recipe abîmée';
end \$\$;"
run "$SUPA/migrations/0017_social_schema.sql"
"${PSQL[@]}" -f "$SUPA/migrations/0017_social_schema.sql"
run "$HERE/test_0017_social_schema.sql"

# ---------------------------------------------------------------- 0019 : fonctions d'aide + politiques sociales
# (0018, le remplissage, est dans supabase/v2/ : il passe APRÈS 0019, voir plus bas)
# 0021 (fonctions métier côté recettes) suit 0019 dans la même boucle (LATE = 0019, 0021).
FN_SQL="select md5(string_agg(pg_get_functiondef(p.oid), E'\\n' order by p.oid::regprocedure::text)) from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname in ('save_recipe', 'save_recipe_translation')"
FN_BEFORE="$("${PSQL[@]}" -At -c "$FN_SQL")"
for f in "${LATE[@]}"; do run "$f"; done
echo "▶ Rejeu idempotence 0019"
for f in "${LATE[@]}"; do "${PSQL[@]}" -f "$f"; done
for f in "$HERE"/test_*.sql; do n=$(num "${f#*test_}"); if (( n == 19 )); then run "$f"; fi; done
run "$HERE/test_0021_v1_compat.sql"

# Réussit si la commande ÉCHOUE avec un message contenant le motif : expect_fail <fichier> <motif> <description>
expect_fail() {
  local out
  if out=$("${PSQL[@]}" -f "$1" 2>&1); then echo "❌ $3 : aurait dû être refusé"; exit 1; fi
  grep -q -- "$2" <<<"$out" || { echo "❌ $3 : message inattendu :"; echo "$out"; exit 1; }
  echo "   ✓ refusé ($3)"
}
sql() { "${PSQL[@]}" -c "$1"; }
same_data() { [[ "$("${PSQL[@]}" -At -c "select tests.data_fp()")" == "$1" ]] || { echo "❌ $2"; exit 1; }; }

SWITCH="$SUPA/v2/0020_rls_switchover.sql"
SWITCH_DOWN="$SUPA/rollback/0020_rls_switchover_down.sql"
FILL="$SUPA/v2/0018_v2_data_fill.sql"
FILL_PARAMS="$SUPA/v2/0018_params.sql"
FILL_DOWN="$SUPA/rollback/0018_v2_data_fill_down.sql"

echo "▶ Bascule 0020 : refusée tant que owner_id est NULL (garde-fou)"
expect_fail "$SWITCH" "sans owner_id" "recettes sans propriétaire"
FP_BEFORE="$("${PSQL[@]}" -At -c "select tests.policy_fp()")"

# ---------------------------------------------------------------- 0018 : remplissage (supabase/v2/, avec paramètres)
echo "▶ 0018 : jeu de données (3 comptes dont 2 admins, recettes avec catégorie, favoris)"
run "$HERE/fixtures_0018.sql"
FP_DATA0="$("${PSQL[@]}" -At -c "select tests.data_fp()")"
expect_fail "$FILL" "0018_params.sql" "table des paramètres absente"
run "$FILL_PARAMS"
"${PSQL[@]}" -f "$FILL_PARAMS"
echo "▶ 0018 : refus (rien n'est modifié)"
expect_fail "$FILL" "AMBIGU" "deux admins de même date de création, sans owner_email"
same_data "$FP_DATA0" "le refus de 0018 (admins ex æquo) a modifié des données"
sql "update public.profiles set created_at = created_at + interval '1 day' where id = '00000000-0000-0000-0000-00000000000b'"
FP_DATA0="$("${PSQL[@]}" -At -c "select tests.data_fp()")"
sql "insert into private.v2_fill_params values ('display_name:admin@test.local', 'Nina Test'), ('display_name:user-b@test.local', 'Bob Test')"
expect_fail "$FILL" "pseudonyme manquant" "pseudonyme absent (pas de repli sur l'e-mail)"
sql "insert into private.v2_fill_params values ('display_name:user-c@test.local', 'cleo@test.local')"
expect_fail "$FILL" "contient « @ »" "pseudonyme = e-mail"
sql "update private.v2_fill_params set value = 'BOB test' where key = 'display_name:user-c@test.local'"
expect_fail "$FILL" "même pseudonyme" "pseudonymes en double"
sql "update private.v2_fill_params set value = 'Cleo Test' where key = 'display_name:user-c@test.local'"
sql "insert into private.v2_fill_params values ('display_name:fautedefrappe@test.local', 'X')"
expect_fail "$FILL" "n'est pas un compte concerné" "paramètre pour un e-mail inconnu"
sql "delete from private.v2_fill_params where key = 'display_name:fautedefrappe@test.local'"
sql "insert into private.v2_fill_params values ('couleur', 'rouge')"
expect_fail "$FILL" "inconnu(s)" "clé de paramètre inconnue"
sql "delete from private.v2_fill_params where key = 'couleur'"
sql "insert into private.v2_fill_params values ('owner_email', 'personne@test.local')"
expect_fail "$FILL" "aucun compte concerné" "owner_email inconnu"
sql "delete from private.v2_fill_params where key = 'owner_email'"
same_data "$FP_DATA0" "un refus de 0018 a modifié des données"
sql "insert into private.v2_fill_params values ('cookbook_title:user-c@test.local', 'Le carnet de Cleo')"
expect_fail "$SWITCH" "sans owner_id" "0020 toujours refusée avant le remplissage"
echo "▶ 0018 : application (propriétaire = admin le plus ancien, par défaut)"
run "$FILL"
run "$HERE/test_0018_v2_data_fill.sql"
FP_DATA1="$("${PSQL[@]}" -At -c "select tests.data_fp()")"
echo "▶ 0018 : rejeu (avec owner_email explicite) : rien ne change, aucun doublon"
sql "insert into private.v2_fill_params values ('owner_email', 'admin@test.local')"
"${PSQL[@]}" -f "$FILL"
[[ "$("${PSQL[@]}" -At -c "select tests.data_fp()")" == "$FP_DATA1" ]] || { echo "❌ le rejeu de 0018 a modifié les données"; exit 1; }
run "$HERE/test_0018_v2_data_fill.sql"
sql "update private.v2_fill_params set value = 'user-b@test.local' where key = 'owner_email'"
expect_fail "$FILL" "doit être le compte admin" "owner_email = un compte qui n'est plus admin"
sql "update private.v2_fill_params set value = 'admin@test.local' where key = 'owner_email'"

# ---------------------------------------------------------------- bascule v2/0020 (hors migrations/), sur les données de 0018
echo "▶ Bascule 0020 : refusée si un propriétaire n'a pas de profil"
sql "alter table public.recipes disable trigger update_recipes_updated_at;
  insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000ff', 'sans-profil@test.local');
  delete from public.profiles where id = '00000000-0000-0000-0000-0000000000ff';
  update public.recipes set owner_id = '00000000-0000-0000-0000-0000000000ff' where id = (select id from public.recipes order by id limit 1);
  alter table public.recipes enable trigger update_recipes_updated_at;"
expect_fail "$SWITCH" "n'a pas de profil" "propriétaire sans profil"
sql "alter table public.recipes disable trigger update_recipes_updated_at;
  update public.recipes set owner_id = '00000000-0000-0000-0000-00000000000a' where owner_id = '00000000-0000-0000-0000-0000000000ff';
  alter table public.recipes enable trigger update_recipes_updated_at;
  delete from auth.users where id = '00000000-0000-0000-0000-0000000000ff';"
[[ "$("${PSQL[@]}" -At -c "select tests.data_fp()")" == "$FP_DATA1" ]] || { echo "❌ les données ne sont pas revenues à l'état de 0018"; exit 1; }
run "$SWITCH"
"${PSQL[@]}" -f "$SWITCH"
run "$HERE/switchover_0020_rls.sql"
run "$HERE/switchover_0018_filled.sql"
run "$HERE/test_0021_recipe_rpcs.sql"
echo "▶ Retour arrière de 0018 refusé tant que 0020 est appliquée"
expect_fail "$FILL_DOWN" "retirer d'abord la bascule" "0018 down avant 0020 down"
echo "▶ Retour arrière de la bascule : politiques d'avant rétablies à l'identique"
run "$SWITCH_DOWN"
"${PSQL[@]}" -f "$SWITCH_DOWN"
FP_AFTER="$("${PSQL[@]}" -At -c "select tests.policy_fp()")"
[[ "$FP_BEFORE" == "$FP_AFTER" ]] || { echo "❌ empreinte des politiques différente après le retour arrière ($FP_BEFORE ≠ $FP_AFTER)"; exit 1; }
"${PSQL[@]}" -c "do \$\$ begin
  assert (select is_nullable = 'YES' and column_default is null from information_schema.columns where table_schema='public' and table_name='recipes' and column_name='owner_id'), 'owner_id : défaut / NOT NULL non retirés';
  assert not exists (select 1 from pg_trigger where tgname = 'recipes_guard_owner_fields'), 'déclencheur de garde non retiré';
end \$\$;"
echo "▶ Ré-application de la bascule, tests, retour arrière final"
run "$SWITCH"
run "$HERE/switchover_0020_rls.sql"
run "$HERE/switchover_0018_filled.sql"
run "$HERE/test_0021_recipe_rpcs.sql"
run "$SWITCH_DOWN"
[[ "$("${PSQL[@]}" -At -c "select tests.policy_fp()")" == "$FP_BEFORE" ]] || { echo "❌ empreinte des politiques différente (2e retour arrière)"; exit 1; }

# ---------------------------------------------------------------- « up, down, up » pour 0018
echo "▶ Rollback 0018, rejeu, état d'avant vérifié, ré-application"
run "$FILL_DOWN"
"${PSQL[@]}" -f "$FILL_DOWN"
[[ "$("${PSQL[@]}" -At -c "select tests.data_fp()")" == "$FP_DATA0" ]] || { echo "❌ données différentes après le retour arrière de 0018"; exit 1; }
"${PSQL[@]}" -c "do \$\$ begin
  assert to_regclass('private.backup_0018_profiles') is null and to_regclass('private.backup_0018_created') is null, 'sauvegardes 0018 restantes';
  assert (select count(*) from public.profiles where role = 'admin') = 2, 'les 2 admins d''origine ne sont pas revenus';
  assert (select count(*) from public.groups) = 0 and (select count(*) from public.recipe_grants) = 0 and (select count(*) from public.categories) = 0
     and (select count(*) from public.cookbook_entries) = 0, 'objets 0018 restants';
  assert (select count(*) from public.recipes where owner_id is not null or category_id is not null) = 0, 'owner_id / category_id non remis à NULL';
  assert (select count(*) from public.profiles where display_name is not null or active_theme_group_id is not null or onboarded_at is not null) = 0, 'profils non restaurés';
  assert to_regclass('private.v2_fill_params') is not null, 'la table des paramètres devait être conservée';
end \$\$;"
run "$FILL"
run "$HERE/test_0018_v2_data_fill.sql"
[[ "$("${PSQL[@]}" -At -c "select tests.data_fp()")" == "$FP_DATA1" ]] || { echo "❌ ré-application de 0018 différente de la première"; exit 1; }
run "$SWITCH"
run "$HERE/switchover_0018_filled.sql"
run "$SWITCH_DOWN"
run "$FILL_DOWN"
[[ "$("${PSQL[@]}" -At -c "select tests.data_fp()")" == "$FP_DATA0" ]] || { echo "❌ données différentes après le 2e retour arrière de 0018"; exit 1; }
run "$HERE/fixtures_0018_down.sql"
sql "drop table private.v2_fill_params"

# ---------------------------------------------------------------- « up, down, up » pour 0021 (avant 0019 : elle en dépend)
echo "▶ Rollback 0021, rejeu, état d'avant vérifié, ré-application"
RB21="$SUPA/rollback/0021_recipe_rpcs_down.sql"
run "$RB21"
"${PSQL[@]}" -f "$RB21"
[[ "$("${PSQL[@]}" -At -c "$FN_SQL")" == "$FN_BEFORE" ]] || { echo "❌ save_recipe / save_recipe_translation ne sont pas revenues à leur définition d'avant 0021"; exit 1; }
"${PSQL[@]}" -c "do \$\$ begin
  assert to_regprocedure('public.list_cookbook(uuid, text, int, int)') is null and to_regprocedure('public.get_shared_recipe(uuid, text)') is null
     and to_regprocedure('private.translation_card(uuid)') is null, 'fonctions 0021 encore présentes';
  assert to_regclass('public.recipe_grants') is not null and to_regprocedure('private.can_read_recipe(uuid)') is not null, '0017 / 0019 abîmées';
end \$\$;"
run "$HERE/test_0016_translations.sql"
run "$SUPA/migrations/0021_recipe_rpcs.sql"
"${PSQL[@]}" -f "$SUPA/migrations/0021_recipe_rpcs.sql"
run "$HERE/test_0021_v1_compat.sql"

# ---------------------------------------------------------------- « up, down, up » pour 0019
echo "▶ Rollback 0019, rejeu, ré-application"
run "$RB21"   # 0021 dépend de 0019 : retirée d'abord (ré-appliquée avec 0019 par la boucle LATE plus bas)
run "$SUPA/rollback/0019_rls_helpers_social_down.sql"
"${PSQL[@]}" -f "$SUPA/rollback/0019_rls_helpers_social_down.sql"
"${PSQL[@]}" -c "do \$\$ begin
  assert to_regclass('public.dismissed_prompts') is null and to_regprocedure('private.can_read_recipe(uuid)') is null, 'objets 0019 encore présents';
  assert to_regclass('public.groups') is not null and to_regprocedure('private.is_admin()') is not null, '0017 / 0009 abîmées';
  assert not has_table_privilege('authenticated', 'public.groups', 'select'), 'tables sociales de nouveau ouvertes';
  assert has_function_privilege('authenticated', 'public.save_recipe(jsonb)', 'execute'), 'save_recipe abîmée';
end \$\$;"
run "$HERE/test_0017_social_schema.sql"
for f in "${LATE[@]}"; do run "$f"; done
for f in "${LATE[@]}"; do "${PSQL[@]}" -f "$f"; done
run "$HERE/test_0019_rls.sql"
run "$HERE/test_0021_v1_compat.sql"
echo "✅ Toutes les migrations et tous les tests sont passés."
