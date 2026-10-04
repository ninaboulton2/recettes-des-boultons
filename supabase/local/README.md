# Base de développement locale (Supabase CLI + Docker)

Une stack Supabase complète sur ta machine — Postgres 17, Auth (GoTrue), PostgREST, Storage,
Studio — avec le **schéma identique à la prod**, les **migrations 0003 → 0015 appliquées**, les
**vraies recettes** (snapshot anonymisé) et des **comptes de test**. Sert à valider les
migrations et l'application Nuxt avant toute application en production.

La prod (`tzlkabxcmmbwhpyvmato`) n'est **jamais** touchée : la CLI ne connaît aucun projet
distant (`supabase link` n'est pas fait) et `[db.migrations] enabled = false` dans
`config.toml` empêche la CLI de considérer `supabase/migrations/00xx_*.sql` comme son
historique (donc pas de `db push` possible par accident). Tout l'amorçage passe par
`local/setup.sh`.

## Prérequis

* Docker Desktop (démarré automatiquement par `db:local:up` sur macOS) ;
* Node ≥ 22 (`npx supabase` télécharge la CLI, version testée : 2.119) ;
* `psql` : `brew install libpq` ou `brew install postgresql@17` (détecté automatiquement).

## Démarrage

```sh
npm run db:local:up        # Docker → supabase start → setup.sh (≈ 2 min la 1re fois, images Docker)
cp .env.local.example .env.local
npm run dev:local          # Nuxt sur http://localhost:3001 branché sur la base locale
```

`setup.sh` enchaîne : `tests/01_baseline_schema.sql` (schéma prod avant 0001) → `0001`, `0002`
→ `local/snapshot/*.sql` (données prod) → `0003` … `0015` (dont 0013 : colonnes JSONB
supprimées, 0014 : sauvegardes supprimées, 0015 : nettoyage des données) →
`local/test_accounts.sql` → `local/verify.sql` (25 contrôles : 358 sections, 1 546
ingrédients, 1 538 étapes, 0 orphelin, colonnes JSONB absentes, 44 politiques, bucket
`recipe-photos`…, comptés sur les recettes du snapshot). Il est idempotent : relancé sur une
base déjà amorcée, il saute le schéma et l'import et rejoue les migrations (une fois 0013
passée, seulement 0013 et suivantes : 0005 lit les colonnes JSONB).

| Commande | Effet |
|---|---|
| `npm run db:local:up` | démarre tout et amorce la base (rejouable) |
| `npm run db:local:reset` | base vide (`supabase db reset`) puis amorçage complet |
| `npm run db:local:down` | arrête les conteneurs (`supabase stop`, données conservées) |
| `npm run db:local:status` | URL et clés locales |
| `npm run db:local:test` | reset + `seed_test.sql` + 0003 → 0012 (+ rejeu) + tests 0003-0010, puis 0013 → 0015 (+ rejeu) + tests 0013-0015 (vide les données prod : refaire `db:local:reset` ensuite) |
| `SUPABASE_TEST_DATABASE=ci_test npm run db:local:test` | la même chose sur une base **séparée** `ci_test` de la stack : la base `postgres` (données prod, comptes) n'est pas touchée — à préférer quand d'autres utilisent la base locale (pg_dump 17 requis) |
| `npm run db:local:snapshot` | régénère `snapshot/*.sql` depuis `snapshot/raw/*.json` (voir `export_snapshot.md`) |
| `npm run dev:local` | `nuxt dev --dotenv .env.local` (port 3001) |

Options de `supabase/local/setup.sh` : `--seed-test` (données jetables des tests au lieu du
snapshot, sans les comptes applicatifs : les tests comptent les utilisateurs du seed),
`--no-verify`, `--until NNNN` (s'arrête après la migration NNNN). Variable `SUPABASE_DB_URL` (refusée si l'hôte n'est pas local).

Les tests SQL (`tests/test_00xx.sql`, écrits pour le shim Postgres nu de `tests/run_local.sh`)
passent tels quels sur la vraie stack, à deux détails près, gérés par `test.sh` :
`tests.login()` est fourni par `local/tests_shim.sql` (sans recréer auth/storage), et les
scripts tournent en tant que `supabase_admin` (superuser local, mot de passe `postgres`) parce
que `set role supabase_auth_admin` est réservé aux superusers. `test_0010` pose
`storage.allow_delete_query = 'true'` : la vraie stack interdit sinon les `DELETE` SQL directs
sur `storage.objects` (trigger `storage.protect_delete`, absent du shim).

## URL et comptes

| Service | URL |
|---|---|
| API (PostgREST, Auth, Storage) | http://127.0.0.1:54321 |
| Studio | http://127.0.0.1:54323 |
| Mails (Mailpit : confirmations, reset de mot de passe) | http://127.0.0.1:54324 |
| Postgres | `postgresql://postgres:postgres@127.0.0.1:54322/postgres` |

Comptes (mot de passe **`password123`**, e-mails confirmés) :

| E-mail | Rôle | Origine |
|---|---|---|
| `admin@local.test` | admin | 1er admin prod (uuid conservé : ses favoris, planning, listes) |
| `user@local.test` | user | 1er utilisateur prod (uuid conservé) |
| `admin2@local.test`, `user2@…`, `user3@…` | admin / user | autres comptes prod |

Sans snapshot, `test_accounts.sql` crée quand même `admin@local.test` et `user@local.test`
(uuid fixes `a0000000-0000-4000-8000-00000000000{1,2}`), mais la base n'a aucune recette.
Pour des recettes jetables avec ces deux comptes : `npx supabase db reset` (si la base est
déjà amorcée) puis `bash scripts/ci-seed.sh` (`seed_test.sql` + `test_accounts.sql`).

Le hook JWT est **activé** (`[auth.hook.custom_access_token]` → `public.custom_access_token_hook`) :
les tokens émis en local portent le claim `user_role` (`admin` / `user`), exactement ce que
0009 attend en prod après activation manuelle du hook dans le dashboard.

## Basculer l'app entre prod et local

Le module `@nuxtjs/supabase` lit `SUPABASE_URL` / `SUPABASE_KEY` ; `nuxt.config.ts` mappe
`SUPABASE_ANON_KEY`.

* `.env.local` → base locale : `npm run dev:local` (option `--dotenv` de `nuxt dev`, qui
  remplace `.env`). C'est le mode de travail normal.
* `.env` → lu par `npm run dev`. **Ne jamais y mettre la prod** : toutes les écritures
  partiraient sur la base de la famille.

Ajouts utiles à `.env.local` : `AI_PROVIDER=mock` (traducteur sans appel payant) et
`NUXT_PUBLIC_AUTH_PROVIDERS=none` (Google n'est pas configuré dans `config.toml`).

Pour le navigateur intégré Claude Code : configuration `preview-local` de `.claude/launch.json`
(port 3007, base locale). La configuration `preview` lance `npm run dev` (`.env`).

## Snapshot des données

`supabase/local/snapshot/` est gitignoré (données familiales) ; seul `.gitkeep` est versionné.
Régénération : `export_snapshot.md` (requêtes `SELECT` uniquement, aucun e-mail exporté).

## Limites

* **Pas d'IA réelle** : avec `AI_PROVIDER=mock`, le traducteur renvoie une recette fixe ;
  sans cette ligne, `OPENAI_API_KEY` est vide et `/traducteur` renvoie une erreur de
  configuration.
* **Pas d'envoi d'e-mail** : tout arrive dans Mailpit (http://127.0.0.1:54324) ;
  `enable_confirmations = false` → inscription sans confirmation.
* Les photos uploadées dans le bucket `recipe-photos` restent dans le volume Docker local.
* Postgres local `17.11` (image `supabase/postgres:17.11.0.002`) vs prod `17.4`
  (`supabase-postgres-17.4.1.074`) ; mêmes extensions (`pgcrypto`, `uuid-ossp`,
  `pg_stat_statements`, `supabase_vault`) + `unaccent` ajoutée par 0008 dans les deux cas.
  Locale `en_US.UTF-8` identique. Aucun écart constaté sur les migrations (y compris les
  politiques `storage.objects` de 0010, créées sans erreur depuis le rôle `postgres`).
* Le moteur Storage réel protège ses tables (`storage.protect_delete` : pas de `DELETE` SQL
  direct) ; passer par l'API Storage ou, en SQL de test, `set_config('storage.allow_delete_query','true',true)`.
* PostgREST local : `max_rows = 1000` (`config.toml`), comme la valeur par défaut d'un projet
  hébergé — à garder pour reproduire le comportement prod (une requête de plus de 1 000
  lignes est tronquée sans erreur).
