#!/usr/bin/env bash
# ============================================================================
#  npm run db:local:up — Docker → `supabase start` → setup.sh
# ============================================================================
#  Démarre Docker Desktop si nécessaire (macOS), la stack Supabase locale
#  (Postgres, Auth, PostgREST, Storage, Studio) puis amorce la base
#  (schéma prod + snapshot + migrations 0003 → 0015 + comptes de test).
#  Les options sont transmises à setup.sh (--seed-test, --no-verify).
# ============================================================================
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
cd "$ROOT"

if ! docker info >/dev/null 2>&1; then
  echo "Docker n'est pas démarré : lancement de Docker Desktop…"
  if [[ "$(uname)" == "Darwin" ]]; then
    open -a Docker || { echo "Docker Desktop introuvable (/Applications/Docker.app)." >&2; exit 1; }
  else
    echo "Démarre le démon Docker puis relance npm run db:local:up." >&2; exit 1
  fi
  for i in $(seq 1 60); do
    docker info >/dev/null 2>&1 && break
    if [[ $i -eq 60 ]]; then echo "Docker ne répond pas après 2 min." >&2; exit 1; fi
    sleep 2
  done
  echo "Docker prêt."
fi

if npx supabase status >/dev/null 2>&1; then
  echo "Stack Supabase locale déjà démarrée."
else
  npx supabase start
fi

exec "$HERE/setup.sh" "$@"
