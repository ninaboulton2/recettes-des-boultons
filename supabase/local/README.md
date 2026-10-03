# Base de développement locale (Supabase CLI + Docker)

Une stack Supabase complète sur ta machine — Postgres 17, Auth (GoTrue), PostgREST, Storage,
Studio — avec le **schéma identique à la prod**, les **migrations 0003 → 0010 appliquées**, les
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
→ `local/snapshot/*.sql` (données prod) → `0003` … `0010` → `local/test_accounts.sql` →
`local/verify.sql` (comptes attendus de `MIGRATION_NOTES.md` § 4 : 359 sections, 1 546
ingrédients, 0 orphelin, 1 545 instructions, 42 politiques, bucket `recipe-photos`…). Il est
idempotent : relancé sur une base déjà amorcée, il saute le schéma et l'import et rejoue
seulement 0003 → 0010 (elles le sont par conception).

| Commande | Effet |
|---|---|
| `npm run db:local:up` | démarre tout et amorce la base (rejouable) |
| `npm run db:local:reset` | base vide (`supabase db reset`) puis amorçage complet |
| `npm run db:local:down` | arrête les conteneurs (`supabase stop`, données conservées) |
| `npm run db:local:status` | URL et clés locales |
| `npm run db:local:test` | reset + `seed_test.sql` + 0003 → 0010 (+ rejeu idempotence) + `tests/test_00xx.sql` (vide les données prod : refaire `db:local:reset` ensuite) |
| `npm run db:local:snapshot` | régénère `snapshot/*.sql` depuis `snapshot/raw/*.json` (voir `export_snapshot.md`) |
| `npm run dev:local` | `nuxt dev --dotenv .env.local` (port 3001) |

Options de `supabase/local/setup.sh` : `--seed-test` (données jetables des tests au lieu du
snapshot, sans les comptes applicatifs : les tests comptent les utilisateurs du seed),
`--no-verify`. Variable `SUPABASE_DB_URL` (refusée si l'hôte n'est pas local).

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
(uuid fixes `a0000000-0000-4000-8000-00000000000{1,2}`).

Le hook JWT est **activé** (`[auth.hook.custom_access_token]` → `public.custom_access_token_hook`) :
les tokens émis en local portent le claim `user_role` (`admin` / `user`), exactement ce que
0009 attend en prod après activation manuelle du hook dans le dashboard.

## Basculer l'app entre prod et local

Le module `@nuxtjs/supabase` lit `SUPABASE_URL` / `SUPABASE_KEY` ; `nuxt.config.ts` mappe
`SUPABASE_ANON_KEY`. Deux fichiers d'environnement coexistent :

* `.env` → prod (comme avant) : `npm run dev` ;
* `.env.local` → base locale : `npm run dev:local` (option `--dotenv` de `nuxt dev`, qui
  remplace `.env` ; rien d'autre à changer).

Pour le navigateur intégré Claude Code : configuration `preview-local` de `.claude/launch.json`
(port 3007).

## Snapshot des données

`supabase/local/snapshot/` est gitignoré (données familiales) ; seul `.gitkeep` est versionné.
Régénération : `export_snapshot.md` (requêtes `SELECT` uniquement, aucun e-mail exporté).

## Limites

* **Pas d'OpenAI** : `OPENAI_API_KEY` vide, la page `/traducteur` échoue proprement.
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
  hébergé — à garder pour reproduire le comportement prod (voir « Points d'attention »).

## Points d'attention (régressions observées de l'app actuelle face à 0003 → 0010)

Voir la section « Base de dev locale » de `DEVELOPER.md` : après 0005, `recipe_ingredients`
compte 1 546 lignes et `instructions` 1 545 ; `server/api/recipes.get.ts` les charge d'un
seul `select` chacune, que PostgREST tronque à 1 000 lignes → ingrédients / étapes manquants
sur une partie des recettes. À corriger côté app avant d'appliquer 0005 en prod
(pagination `.range()`, ou requête par recette).
