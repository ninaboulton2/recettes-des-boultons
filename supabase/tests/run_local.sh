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
#    7. migrations/0013 → …   (« contract » : 0013, 0014, 0015) + rejeu,
#       tests test_0013 → …   (assertions ; échec = exit 1)
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
EXPAND=(); CONTRACT=()
for f in "$SUPA"/migrations/0*_*.sql; do
  n=$(num "$f")
  if (( n >= 3 && n <= 12 )); then EXPAND+=("$f"); elif (( n >= 13 )); then CONTRACT+=("$f"); fi
done

for f in "${EXPAND[@]}"; do run "$f"; done
# Idempotence : rejouer 0003 → 0012 une seconde fois ne doit rien casser.
echo "▶ Rejeu idempotence 0003 → 0012"
for f in "${EXPAND[@]}"; do "${PSQL[@]}" -f "$f"; done
for f in "$HERE"/test_*.sql; do if (( $(num "${f#*test_}") <= 12 )); then run "$f"; fi; done

for f in "${CONTRACT[@]}"; do run "$f"; done
echo "▶ Rejeu idempotence 0013 → …"
for f in "${CONTRACT[@]}"; do "${PSQL[@]}" -f "$f"; done
for f in "$HERE"/test_*.sql; do if (( $(num "${f#*test_}") >= 13 )); then run "$f"; fi; done
echo "✅ Toutes les migrations et tous les tests sont passés."
