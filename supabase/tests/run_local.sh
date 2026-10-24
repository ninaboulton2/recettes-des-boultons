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
#  14. Migration 0023 (fonctions métier côté social : amis, groupes, invitations, notifications, profil, compte) : appliquée
#      avec 0019 et 0021 (+ rejeu), test_0023_v1_compat.sql (v1 non cassée), test_0023_social_rpcs.sql sous la chaîne
#      complète (deux fois, comme 0021), « up, down, up » de 0023 (empreinte de toutes les fonctions, déclencheurs,
#      politiques et tables private identique à l'avant), et 0023 SEULE sans 0021 (indépendance). Les tests de 0019 sont
#      adaptés à 0023 (relance après refus : délai de 7 jours ; notifications créées par les déclencheurs).
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
  if (( n >= 3 && n <= 12 )); then EXPAND+=("$f"); elif (( n >= 13 && n <= 17 )); then CONTRACT+=("$f"); elif (( n >= 18 && n != 24 )); then LATE+=("$f"); fi
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
# Empreinte de TOUT ce que 0023 ne doit pas changer : fonctions publiques (corps), fonctions private (signatures),
# déclencheurs (définitions), politiques, tables du schéma private. Prise avant 0023, rejouée après son retour arrière.
ALL_FP_SQL="select md5(
  coalesce((select string_agg(pg_get_functiondef(p.oid), E'\\n' order by p.oid::regprocedure::text) from pg_proc p where p.pronamespace = 'public'::regnamespace), '') || '#' ||
  coalesce((select string_agg(p.oid::regprocedure::text, E'\\n' order by p.oid::regprocedure::text) from pg_proc p where p.pronamespace = 'private'::regnamespace), '') || '#' ||
  coalesce((select string_agg(pg_get_triggerdef(t.oid), E'\\n' order by t.tgrelid::regclass::text, t.tgname) from pg_trigger t where not t.tgisinternal), '') || '#' ||
  coalesce((select string_agg(concat_ws('|', schemaname, tablename, policyname, cmd, roles::text, qual, with_check), E'\\n' order by schemaname, tablename, policyname) from pg_policies where schemaname in ('public', 'storage')), '') || '#' ||
  coalesce((select string_agg(c.relname, ',' order by c.relname) from pg_class c where c.relnamespace = 'private'::regnamespace and c.relkind = 'r'), ''))"
# 0024 (correctif handle_new_user, indépendant) : appliquée avant la boucle pour que l'empreinte « avant 0023 » l'inclue.
echo "▶ 0024 : rôle 'user' en dur à l'inscription (+ rejeu + test)"
run "$SUPA/migrations/0024_handle_new_user_role.sql"
"${PSQL[@]}" -f "$SUPA/migrations/0024_handle_new_user_role.sql"
run "$HERE/test_0024_handle_new_user.sql"
FP23_BEFORE=""
for f in "${LATE[@]}"; do
  if (( $(num "$f") == 23 )); then FP23_BEFORE="$("${PSQL[@]}" -At -c "$ALL_FP_SQL")"; fi
  run "$f"
done
echo "▶ Rejeu idempotence 0019"
for f in "${LATE[@]}"; do "${PSQL[@]}" -f "$f"; done
for f in "$HERE"/test_*.sql; do n=$(num "${f#*test_}"); if (( n == 19 )); then run "$f"; fi; done
run "$HERE/test_0021_v1_compat.sql"
run "$HERE/test_0023_v1_compat.sql"
run "$HERE/test_0025_sec2_v1.sql"

# ---------------------------------------------------------------- vraie concurrence (deux sessions psql, données validées puis nettoyées)
# 1. limites de débit : deux demandes d'ami / deux signalements en parallèle à 19 / 9 actions : UNE SEULE passe (verrou consultatif) ;
# 2. départ d'un membre pendant un transfert du créateur : le départ attend le verrou du groupe, relit son rôle (créateur) et est refusé.
# Sans les verrous de la relecture de sécurité n° 2 : les deux demandes passent (21 en 24 h) et le groupe reste sans créateur.
echo "▶ Concurrence : limites de débit et transfert / départ (deux sessions)"
CZ=00000000-0000-0000-0000-0000000c0001; CT1=00000000-0000-0000-0000-0000000c0002; CT2=00000000-0000-0000-0000-0000000c0003
CR=00000000-0000-0000-0000-0000000c0004; CC=00000000-0000-0000-0000-0000000c0005; CM=00000000-0000-0000-0000-0000000c0006
conc_cleanup() {
  "${PSQL[@]}" -c "delete from public.reports where reporter_id in ('$CR', '$CZ'); delete from public.groups where created_by in ('$CC', '$CM'); delete from auth.users where id in ('$CZ', '$CT1', '$CT2', '$CR', '$CC', '$CM');" >/dev/null 2>&1 || true
}
conc_session() {   # conc_session <uid> <sql> <fichier de sortie>
  "$PGBIN/psql" -h 127.0.0.1 -p "$PORT" -U postgres -v ON_ERROR_STOP=1 -q -f - >"$3" 2>&1 <<SQL
begin;
select tests.login('$1', 'authenticated');
$2
commit;
SQL
}
conc_pair() {      # conc_pair <uid1> <sql1> <uid2> <sql2> : session 1 tient ses verrous ~2 s, session 2 démarre 0,7 s après ; renvoie rc1 rc2
  local o1 o2
  o1="$WORKDIR/conc1.out"; o2="$WORKDIR/conc2.out"
  conc_session "$1" "$2" "$o1" & local p1=$!
  sleep 0.7
  conc_session "$3" "$4" "$o2" & local p2=$!
  CONC_RC1=0; CONC_RC2=0
  wait $p1 || CONC_RC1=$?
  wait $p2 || CONC_RC2=$?
  CONC_OUT1="$(cat "$o1")"; CONC_OUT2="$(cat "$o2")"
}
conc_cleanup
"${PSQL[@]}" -c "insert into auth.users (id, email, raw_user_meta_data) values
  ('$CZ', 'conc-z@test.local', '{}'), ('$CT1', 'conc-t1@test.local', '{}'), ('$CT2', 'conc-t2@test.local', '{}'),
  ('$CR', 'conc-r@test.local', '{}'), ('$CC', 'conc-c@test.local', '{}'), ('$CM', 'conc-m@test.local', '{}');
  insert into private.rate_events (user_id, kind) select '$CZ', 'friend_request' from generate_series(1, 19);
  insert into public.reports (recipe_id, reporter_id, reason) select '10000000-0000-0000-0000-000000000001', '$CR', 'spam' from generate_series(1, 9);"
# (a) demandes d'ami : 19 déjà comptées, deux nouvelles en parallèle
conc_pair "$CZ" "select public.send_friend_request('$CT1'); select pg_sleep(2);" "$CZ" "select public.send_friend_request('$CT2');"
[[ ( $CONC_RC1 -eq 0 && $CONC_RC2 -ne 0 ) || ( $CONC_RC1 -ne 0 && $CONC_RC2 -eq 0 ) ]] \
  || { echo "❌ concurrence (demandes d'ami) : les deux sessions ont le même sort ($CONC_RC1 / $CONC_RC2)"; exit 1; }
grep -q "Limite atteinte" <<<"$CONC_OUT1$CONC_OUT2" || { echo "❌ concurrence (demandes d'ami) : message de limite absent"; exit 1; }
[[ "$("${PSQL[@]}" -At -c "select count(*) from private.rate_events where user_id = '$CZ' and kind = 'friend_request'")" == "20" ]] \
  || { echo "❌ concurrence (demandes d'ami) : le journal ne compte pas exactement 20 actions"; exit 1; }
echo "   ✓ deux demandes d'ami parallèles à 19/20 : une seule passe"
# (b) signalements : 9 déjà faits, deux nouveaux en parallèle
conc_pair "$CR" "insert into public.reports (recipe_id, reporter_id, reason) values ('10000000-0000-0000-0000-000000000001', '$CR', 'spam'); select pg_sleep(2);" \
          "$CR" "insert into public.reports (recipe_id, reporter_id, reason) values ('10000000-0000-0000-0000-000000000001', '$CR', 'spam');"
[[ ( $CONC_RC1 -eq 0 && $CONC_RC2 -ne 0 ) || ( $CONC_RC1 -ne 0 && $CONC_RC2 -eq 0 ) ]] \
  || { echo "❌ concurrence (signalements) : les deux sessions ont le même sort ($CONC_RC1 / $CONC_RC2)"; exit 1; }
[[ "$("${PSQL[@]}" -At -c "select count(*) from public.reports where reporter_id = '$CR'")" == "10" ]] \
  || { echo "❌ concurrence (signalements) : il devrait y avoir exactement 10 signalements"; exit 1; }
echo "   ✓ deux signalements parallèles à 9/10 : un seul passe"
# (c) transfert du créateur pendant le départ du futur créateur
CG="$("${PSQL[@]}" -At -c "select set_config('request.jwt.claims', '{\"sub\":\"$CC\",\"role\":\"authenticated\"}', false); select public.create_group('Concurrence');" | tail -1)"
"${PSQL[@]}" -c "insert into public.group_members (group_id, user_id, role) values ('$CG', '$CM', 'member')"
conc_pair "$CC" "select public.transfer_group_ownership('$CG', '$CM'); select pg_sleep(2);" "$CM" "select public.leave_group('$CG');"
[[ $CONC_RC1 -eq 0 && $CONC_RC2 -ne 0 ]] && grep -q "créateur ne peut pas quitter" <<<"$CONC_OUT2" \
  || { echo "❌ concurrence (transfert / départ) : le départ du nouveau créateur aurait dû être refusé ($CONC_RC1 / $CONC_RC2) : $CONC_OUT2"; exit 1; }
[[ "$("${PSQL[@]}" -At -c "select count(*) from public.group_members where group_id = '$CG' and role = 'creator' and user_id = '$CM'")" == "1" \
   && "$("${PSQL[@]}" -At -c "select created_by from public.groups where id = '$CG'")" == "$CM" ]] \
  || { echo "❌ concurrence (transfert / départ) : le groupe n'a pas exactement un créateur (le nouveau)"; exit 1; }
echo "   ✓ départ pendant un transfert : refusé, le groupe garde son créateur"
conc_cleanup

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
run "$HERE/test_0023_social_rpcs.sql"
run "$HERE/test_0025_sec2_security.sql"
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
run "$HERE/test_0023_social_rpcs.sql"
run "$HERE/test_0025_sec2_security.sql"
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

# ---------------------------------------------------------------- « up, down, up » pour 0023 (indépendante de 0021)
echo "▶ Rollback 0023, rejeu, état d'avant vérifié (empreinte), ré-application"
RB21="$SUPA/rollback/0021_recipe_rpcs_down.sql"
RB23="$SUPA/rollback/0023_social_rpcs_down.sql"
M21="$SUPA/migrations/0021_recipe_rpcs.sql"
M23="$SUPA/migrations/0023_social_rpcs.sql"
run "$RB23"
"${PSQL[@]}" -f "$RB23"
[[ "$("${PSQL[@]}" -At -c "$ALL_FP_SQL")" == "$FP23_BEFORE" ]] || { echo "❌ l'état après le retour arrière de 0023 diffère de l'état d'avant (fonctions, déclencheurs, politiques ou tables private)"; exit 1; }
"${PSQL[@]}" -c "do \$\$ begin
  assert to_regprocedure('public.send_friend_request(uuid)') is null and to_regprocedure('public.export_my_data()') is null
     and to_regclass('private.rate_events') is null and to_regprocedure('private.notify(uuid, text, jsonb)') is null, 'objets 0023 encore présents';
  assert not exists (select 1 from pg_trigger where tgname like 'trg_0023_%'), 'déclencheurs 0023 encore présents';
  assert to_regprocedure('public.copy_recipe(uuid)') is not null and to_regclass('public.groups') is not null, '0017 / 0019 / 0021 abîmées';
end \$\$;"
run "$HERE/test_0021_v1_compat.sql"
# 0023 SEULE (sans 0021) : la v1 n'est pas cassée et rien n'appelle les fonctions de 0021
run "$RB21"
run "$M23"
"${PSQL[@]}" -f "$M23"
run "$HERE/test_0023_v1_compat.sql"
run "$RB23"
run "$M21"
run "$M23"
"${PSQL[@]}" -f "$M23"
run "$HERE/test_0021_v1_compat.sql"
run "$HERE/test_0023_v1_compat.sql"

# ---------------------------------------------------------------- « up, down, up » pour 0021 (avant 0019 : elle en dépend)
echo "▶ Rollback 0021, rejeu, état d'avant vérifié, ré-application"
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
run "$RB23"   # 0021 et 0023 dépendent de 0019 : retirées d'abord (ré-appliquées avec 0019 par la boucle LATE plus bas)
run "$RB21"
run "$SUPA/rollback/0019_rls_helpers_social_down.sql"
"${PSQL[@]}" -f "$SUPA/rollback/0019_rls_helpers_social_down.sql"
"${PSQL[@]}" -c "do \$\$ begin
  assert to_regclass('public.dismissed_prompts') is null and to_regprocedure('private.can_read_recipe(uuid)') is null, 'objets 0019 encore présents';
  assert to_regclass('public.groups') is not null and to_regprocedure('private.is_admin()') is not null, '0017 / 0009 abîmées';
  assert not has_table_privilege('authenticated', 'public.groups', 'select'), 'tables sociales de nouveau ouvertes';
  assert not exists (select 1 from pg_trigger where tgname in ('trg_recipes_quota', 'trg_groups_quota', 'trg_dismissed_prompts_quota')), 'plafonds de volume encore présents';
  assert not exists (select 1 from pg_constraint where conname in ('profiles_theme_settings_size', 'groups_theme_size')), 'contraintes de taille des thèmes encore présentes';
  assert has_table_privilege('authenticated', 'public.profiles', 'update'), 'droit de table update sur profiles non rétabli';
  assert has_function_privilege('authenticated', 'public.save_recipe(jsonb)', 'execute'), 'save_recipe abîmée';
end \$\$;"
run "$HERE/test_0017_social_schema.sql"
for f in "${LATE[@]}"; do run "$f"; done
for f in "${LATE[@]}"; do "${PSQL[@]}" -f "$f"; done
run "$HERE/test_0019_rls.sql"
run "$HERE/test_0021_v1_compat.sql"
run "$HERE/test_0023_v1_compat.sql"
echo "✅ Toutes les migrations et tous les tests sont passés."
