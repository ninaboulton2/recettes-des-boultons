# Guide technique — Recettes des Boultons

Référence technique de l'application : recettes en sections, recherche, planning des repas,
listes de courses, favoris, traducteur IA. Pour une présentation rapide, voir
[README.md](README.md).

> ⚠️ **Ne jamais lancer `npm run dev` avec un `.env` qui pointe sur la base de production.**
> Toutes les écritures (recettes, listes, planning) partiraient en prod. Développer avec
> `npm run dev:local`, branché sur la base Supabase locale (`.env.local`).

## Table des matières

1. [Stack et versions](#1-stack-et-versions)
2. [Structure des dossiers](#2-structure-des-dossiers)
3. [Développement local](#3-développement-local)
4. [Modèle de données](#4-modèle-de-données)
5. [Authentification](#5-authentification)
6. [Lecture des données](#6-lecture-des-données)
7. [Écriture : endpoints API](#7-écriture--endpoints-api)
8. [Design](#8-design)
9. [Fiche recette, éditeur et photos](#9-fiche-recette-éditeur-et-photos)
10. [Planning et listes de courses](#10-planning-et-listes-de-courses)
11. [Traducteur IA](#11-traducteur-ia)
12. [Observabilité (Sentry)](#12-observabilité-sentry)
13. [PWA et hors ligne](#13-pwa-et-hors-ligne)
14. [Tests et CI](#14-tests-et-ci)
15. [Variables d'environnement](#15-variables-denvironnement)
16. [Déploiement](#16-déploiement)
17. [À savoir](#17-à-savoir)

---

## 1. Stack et versions

Versions installées (`package-lock.json`).

| Couche | Technologie |
|---|---|
| Runtime | Node 22 (`.nvmrc`, `engines.node >= 22`) |
| Framework | Nuxt 4.5.2 (SSR, structure `app/` + `shared/`), Vue 3.5.43 |
| UI | Nuxt UI 4.11.3 (Tailwind CSS 4.3, `@nuxt/fonts`, `@nuxt/icon`), `@nuxt/image` 2.1, icônes Lucide (`@iconify-json/lucide`) |
| État | Pinia 3.0.4 (`@pinia/nuxt`) |
| i18n | `@nuxtjs/i18n` 10.6 (FR par défaut, EN sous `/en`) |
| Serveur | Nitro (Nuxt), endpoints dans `server/api/`, preset `vercel` |
| Données / Auth / fichiers | Supabase : PostgreSQL 17, Auth, Storage, via `@nuxtjs/supabase` 2.0.10 et `@supabase/supabase-js` 2.117 |
| Validation | Zod 3.25 (`shared/schemas/`) |
| IA | Vercel AI SDK `ai` 7.0 + `@ai-sdk/openai`, `anthropic`, `google`, `mistral` |
| Observabilité | `@sentry/nuxt` 11.4 |
| PWA | `@vite-pwa/nuxt` 1.1 (Workbox) |
| Qualité | TypeScript 5.9 strict, ESLint 9 (`@nuxt/eslint`), Vitest 5 (`@nuxt/test-utils`, couverture v8), Playwright 1.63, GitHub Actions |
| Hébergement | Vercel |

## 2. Structure des dossiers

```
recettes-des-boultons/
├── app/                      # srcDir Nuxt 4 (alias ~/ et @/)
│   ├── app.vue, app.config.ts, error.vue
│   ├── assets/css/main.css   # Tailwind 4 + Nuxt UI, @theme (palette, polices), impression
│   ├── components/           # composants partagés (RecipeCard, AuthModal, OfflineBanner…)
│   │   ├── recipe/           # fiche recette (préfixe Recipe* : RecipeHero, RecipeCookingMode…)
│   │   ├── editor/           # éditeur de recette (RecipeEditorForm, SectionEditor…)
│   │   ├── planning/         # planning (WeekNavigator, DayColumn, MealSlot, MealCard…)
│   │   ├── shopping/         # courses (ListTabs, AddItemForm, ItemList, ItemRow, UnitSelect)
│   │   └── translator/       # aperçu du traducteur (RecipePreview)
│   ├── composables/          # useRecipeSearch, useRecipe, usePlanningWeek, useShoppingLists…
│   ├── layouts/default.vue   # header, barre d'onglets mobile, bandeau hors ligne
│   ├── middleware/auth.ts    # garde d'affichage des pages admin
│   ├── pages/                # recettes, planning, courses, favoris, traducteur, confirm, reset-password
│   ├── plugins/              # toast.client.ts, pwa-offline.client.ts
│   ├── stores/               # Pinia : auth, recipes, favorites, planning, shopping
│   └── utils/week.ts         # semaines du planning
├── shared/                   # code commun client/serveur (alias #shared)
│   ├── schemas/              # schémas Zod : recipe, shopping, planning, favorites, ai, units, common
│   ├── types/index.ts        # modèle de lecture (RecipeSummary, Recipe, ShoppingList…)
│   ├── types/database.ts     # types Supabase GÉNÉRÉS (ne pas éditer)
│   └── utils/                # recipes.ts (mapping, quantités), shopping.ts (rayons), text.ts
├── server/
│   ├── api/                  # endpoints d'écriture (voir § 7)
│   └── utils/                # auth.ts, errors.ts, validate.ts, recipes.ts, shopping.ts, ai/
├── i18n/locales/             # fr.json, en.json
├── supabase/
│   ├── migrations/           # 0001 → 0015 (SQL, appliquées à la main, voir § 4)
│   ├── rollback/             # retours arrière (0005, 0013)
│   ├── fixes/                # correctifs de données ponctuels
│   ├── local/                # base de dev locale : up.sh, setup.sh, test.sh, comptes, snapshot
│   ├── tests/                # tests SQL par migration + schéma de base
│   ├── config.toml           # stack Supabase locale (CLI)
│   ├── seed_test.sql         # données jetables des tests
│   ├── MIGRATION_NOTES.md    # détail de chaque migration
│   └── BASCULE_PROD.md       # mise en production pas à pas
├── e2e/                      # tests Playwright (+ support/)
├── test/                     # tests Vitest : unit/, integration/ (base locale)
├── scripts/                  # ci-seed.sh, ci-env-local.sh, generate-pwa-icons.mjs
├── docs/                     # IA_MODELES.md, QUALITE_DONNEES.md
├── public/                   # favicons, icônes PWA, images/logo.png, images/google.svg
├── nuxt.config.ts, vitest.config.ts, playwright.config.ts, eslint.config.mjs
├── sentry.client.config.ts, sentry.server.config.ts
└── .github/workflows/ci.yml
```

Conventions :

- `~/` pointe sur `app/`, `~~/` sur la racine. Le code partagé s'importe via `#shared/...`
  (auto-import de `shared/utils` et `shared/types`).
- Les composants des sous-dossiers prennent le nom du dossier en préfixe :
  `components/recipe/CookingMode.vue` s'utilise comme `<RecipeCookingMode>`.
- `tsconfig.json` ne contient que des références aux tsconfig générés dans `.nuxt/`
  (`typescript.strict: true` dans `nuxt.config.ts`).
- Tailwind 4 se configure dans `app/assets/css/main.css` (`@theme`, `@layer`). Un bloc
  `<style scoped>` qui utilise `@apply` doit commencer par
  `@reference "~/assets/css/main.css";` (aucun cas aujourd'hui).
- `pages/recettes/[id].vue` restreint son `path` aux UUID (`definePageMeta`) : sinon
  `[category].vue` capturerait les identifiants de recettes.

## 3. Développement local

### 3.1 Démarrage

Prérequis : Node 22, Docker Desktop, `psql` (`brew install libpq` ou `postgresql@17`).

```bash
npm install
npm run db:local:up          # Docker → supabase start → supabase/local/setup.sh
cp .env.local.example .env.local
npm run dev:local            # http://localhost:3001, branché sur la base locale
```

| Service local | Adresse |
|---|---|
| Application | http://localhost:3001 |
| API Supabase (PostgREST, Auth, Storage) | http://127.0.0.1:54321 |
| Studio | http://127.0.0.1:54323 |
| Mails (Mailpit) | http://127.0.0.1:54324 |
| Postgres | `postgresql://postgres:postgres@127.0.0.1:54322/postgres` |

Comptes (mot de passe `password123`) : `admin@local.test` (admin) et `user@local.test`
(user). Avec le snapshot, d'autres comptes existent (`admin2@…`, `user2@…`, `user3@…`).
Détails : [supabase/local/README.md](supabase/local/README.md).

### 3.2 Fichiers d'environnement

- `.env.local` (gitignoré) : base locale. Modèle : `.env.local.example`. C'est le fichier
  lu par `npm run dev:local` (`nuxt dev --dotenv .env.local`), par les tests e2e et par les
  tests d'intégration.
- `.env` (gitignoré) : lu par `npm run dev` et `npm run build`. **Ne pas le faire pointer sur
  la prod.** La configuration de production vit uniquement dans Vercel.
- Liste complète des variables : § 15 et [env.example](env.example).

Ajouts conseillés dans `.env.local` : `AI_PROVIDER=mock` (traducteur sans appel payant) et
`NUXT_PUBLIC_AUTH_PROVIDERS=none` (Google n'est pas configuré dans la stack locale, voir
§ 5.3).

### 3.3 Scripts npm

| Script | Effet |
|---|---|
| `npm run dev:local` | Nuxt sur la base locale (`.env.local`), port 3001 |
| `npm run dev` | Nuxt avec `.env`, port 3001 — à éviter (voir l'avertissement en tête) |
| `npm run build` / `start` | build de production (preset Vercel) / serveur Nuxt |
| `npm run lint` / `lint:fix` | ESLint |
| `npm run typecheck` | `nuxt typecheck` puis `tsc -p e2e/tsconfig.json` |
| `npm test` / `test:watch` / `test:coverage` | Vitest |
| `npm run test:e2e` / `test:e2e:ui` | Playwright (base locale) |
| `npm run pwa:icons` | régénère les icônes PWA depuis `public/favicon.svg` |
| `npm run db:local:up` | démarre Docker et la stack Supabase, puis amorce la base (rejouable) |
| `npm run db:local:reset` | `supabase db reset` puis amorçage complet |
| `npm run db:local:down` | arrête les conteneurs (données conservées) |
| `npm run db:local:status` | URL et clés locales |
| `npm run db:local:test` | rejoue les migrations et les tests SQL (voir § 14.4) |
| `npm run db:local:snapshot` | régénère `supabase/local/snapshot/*.sql` depuis `snapshot/raw/*.json` |

### 3.4 Données locales : snapshot ou données de test

`supabase/local/setup.sh` enchaîne : schéma de base (`supabase/tests/01_baseline_schema.sql`,
la prod avant 0001) → 0001, 0002 → données → 0003 … 0015 → comptes de test →
`local/verify.sql` (25 contrôles). Il est idempotent : relancé sur une base amorcée, il saute
le schéma et l'import et ne rejoue que 0013 et suivantes.

- **Avec snapshot** : `supabase/local/snapshot/*.sql` contient les vraies recettes
  (export anonymisé, gitignoré : données familiales). Régénération :
  `supabase/local/export_snapshot.md`.
- **Sans snapshot** (nouvelle machine) : la base démarre sans recettes, avec les deux comptes
  de test. Pour avoir des recettes jetables, partir d'une base vide et lancer
  `scripts/ci-seed.sh` (`seed_test.sql` + comptes) :
  ```bash
  npx supabase db reset        # seulement si la base a déjà été amorcée
  bash scripts/ci-seed.sh
  ```

Options de `setup.sh` (transmises par `npm run db:local:up -- …`) :

| Option | Effet |
|---|---|
| `--seed-test` | `seed_test.sql` au lieu du snapshot, **sans** les comptes applicatifs (les tests SQL comptent les utilisateurs du seed) |
| `--no-verify` | saute `local/verify.sql` |
| `--until NNNN` | s'arrête après la migration NNNN (ex. `--until 0012` : état d'avant la contraction) |
| `SUPABASE_DB_URL=…` | autre base ; refusée si l'hôte n'est pas local |

Autres dossiers :

- `supabase/rollback/` : `0005_restore_from_backup.sql` (remet les données d'avant 0005 tant
  que 0014 n'est pas passée) et `0013_contract_jsonb_down.sql` (recrée les colonnes JSONB).
  Utilisés seulement pour revenir à l'ancien code ; voir `BASCULE_PROD.md`, « Retour arrière ».
- `supabase/fixes/` : correctifs de données datés, à exécuter une fois en prod
  (`2026-10-03_carrot_cake_ingredients.sql`). Ils refusent de tourner si la donnée a changé.

La CLI ne gère pas l'historique des migrations : `[db.migrations] enabled = false` dans
`supabase/config.toml`, pas de `supabase link`. Aucun `db push` vers la prod n'est possible.

Écarts avec la prod : Postgres 17.11 en local, 17.4 en prod (mêmes extensions) ; pas d'envoi
d'e-mail (Mailpit), inscription sans confirmation ; `max_rows = 1000` comme en prod.

## 4. Modèle de données

### 4.1 Tables (état après la migration 0015)

```
profiles            id (= auth.users.id), email, name, role 'user'|'admin', language, theme,
                    notifications, created_at, updated_at
recipes             id, title, description, category, prep_time, cook_time, servings,
                    image, photo_path, tags text[], notes, search (tsvector généré),
                    created_at, updated_at
recipe_sections     id, recipe_id, name, type 'ingredients'|'instructions'|'mixed',
                    order_index, created_at, updated_at
recipe_ingredients  id, recipe_id, section_id, name, amount (texte saisi), amount_num,
                    unit (texte saisi), unit_code → units, optional, order_index, …
instructions        id, recipe_id, section_id, content, order_index, created_at, updated_at
favorites           id, user_id, recipe_id, created_at, updated_at
planning            id, user_id, date_string 'AAAA-MM-JJ', meal_type 'lunch'|'dinner',
                    recipe_id?, custom_title?, created_at, updated_at
planning_notes      id, user_id, date_string, note_type 'day'|'lunch'|'dinner', content, …
shopping_lists      id, user_id, name, created_at, updated_at
shopping_items      id, list_id, name, amount, amount_num, unit, unit_code, recipe_id?,
                    is_checked, created_at, updated_at
units               code, label_fr, label_en, abbr, kind, to_base, sort_order   (37 unités)
unit_aliases        alias (replié), code                                         (190 alias)
ai_usage            id, user_id, created_at, provider, model, feature, input_tokens,
                    output_tokens, estimated_cost_usd, status 'ok'|'error', duration_ms
```

- Toutes les recettes sont décrites par leurs sections. Les colonnes JSONB
  `recipes.ingredients` / `instructions` ont été supprimées par 0013.
- `amount_num` et `unit_code` sont dérivés par trigger de `amount` et `unit` (0003, 0004).
- `recipes.image` n'est plus utilisée (voir § 17).
- Le trigger `handle_new_user` crée le profil à l'inscription ; `prevent_role_change`
  empêche un non-admin de changer son `role`.
- Tables temporaires : `*_backup_20261003` et `*_orphans_20261003` (créées par 0005,
  supprimées par 0014), `*_backup_cleanup` (0015, à supprimer après validation). RLS activé
  sans politique : invisibles par l'API.

### 4.2 Fonctions SQL

Toutes en `SECURITY INVOKER` (le RLS s'applique), `search_path` figé.

| Fonction | Migration | Rôle | Appelée par |
|---|---|---|---|
| `fold_text(text)` | 0003 | clé de comparaison (sans accents, minuscules, ponctuation) | fusion des articles |
| `normalize_unit(text)` | 0003 | graphie libre → code d'unité | trigger, `POST /api/shopping-items` |
| `parse_amount(text)` | 0004 | « 1/2 », « 1,5 », « 2 à 3 » → nombre (borne basse) | trigger, `POST /api/shopping-items` |
| `format_amount(numeric)` | 0004 | nombre → texte | `save_recipe`, fusion |
| `save_recipe(payload jsonb)` | 0006, 0011, 0013 | crée ou remplace une recette entière (sections, ingrédients, étapes, `photo_path`) en une transaction | `add-recipe`, `update-recipe` |
| `delete_recipe(p_id)` | 0006 | supprime une recette | `delete-recipe` |
| `merge_shopping_item(…)` | 0007 | ajoute un article ou l'additionne à un article de même nom replié et même `unit_code` | `POST /api/shopping-items` |
| `add_recipe_to_list(…)` | 0007 | ajoute les ingrédients d'une recette (sections choisies, facteur de portions) avec fusion | `POST /api/shopping-lists/:id/recipes` |
| `search_recipes(p_query, p_category, p_tags, p_limit, p_offset)` | 0008, 0010, 0013 | recherche plein texte sans accents, filtres, pagination, `total_count` | `useRecipeSearch` |
| `check_ai_quota(p_max_per_day)` | 0012 | vrai si l'appelant est sous son quota du jour (Europe/Paris) | traducteur |
| `custom_access_token_hook(event)` | 0009 | hook Auth : ajoute le claim `user_role` au JWT | Supabase Auth |
| `private.is_admin()` | 0009 | vrai si le claim `user_role` vaut `admin`, sinon repli sur `profiles.role` | politiques RLS |

Erreurs volontaires des RPC : SQLSTATE `22023` (donnée invalide), `P0002` (introuvable),
`42501` (non autorisé), avec un message en français (voir § 7.3). Signatures et exemples :
[supabase/MIGRATION_NOTES.md](supabase/MIGRATION_NOTES.md).

### 4.3 Sécurité en base (RLS)

| Tables | Lecture | Écriture |
|---|---|---|
| `recipes`, `recipe_sections`, `recipe_ingredients`, `instructions` | publique | admin (`private.is_admin()`) |
| `favorites`, `planning`, `planning_notes`, `shopping_lists` | propriétaire (`auth.uid() = user_id`) | propriétaire |
| `shopping_items` | propriétaire de la liste parente | propriétaire de la liste parente |
| `profiles` | sa ligne, ou admin ; `supabase_auth_admin` pour le hook | sa ligne, ou admin (sans changer son rôle) |
| `units`, `unit_aliases` | publique | migrations uniquement |
| `ai_usage` | ses lignes, ou admin | insertion de ses propres lignes ; ni modification ni suppression |
| Storage `recipe-photos` | publique | admin |

`private.is_admin()` remplace `public.is_admin()` (supprimée par 0009) : le schéma `private`
n'est pas exposé par l'API. Les anciennes RPC favoris en `SECURITY DEFINER` ont été
supprimées par 0002. Voir [SECURITY_HARDENING.md](SECURITY_HARDENING.md).

### 4.4 Migrations

| Fichiers | Contenu |
|---|---|
| 0001, 0002 | durcissement RLS, suppression des fonctions `SECURITY DEFINER` inutiles (appliquées en prod) |
| 0003, 0004 | unités (`units`, `unit_code`), quantités numériques (`amount_num`) |
| 0005 | recettes sans section → section « Recette » ; orphelins archivés |
| 0006, 0007, 0008 | `save_recipe`, RPC des courses, recherche |
| 0009 | `private.is_admin()`, hook JWT |
| 0010, 0011 | photos (bucket `recipe-photos`, `photo_path`) |
| 0012 | `ai_usage`, `check_ai_quota` |
| 0013 | suppression des colonnes JSONB |
| 0014 | suppression des sauvegardes de 0005 (une semaine après la bascule) |
| 0015 | nettoyage mécanique des ingrédients (optionnel, voir [docs/QUALITE_DONNEES.md](docs/QUALITE_DONNEES.md)) |

Chaque fichier est idempotent, encadré par `begin; … commit;` et contient des assertions.
Ordre et contrôles de la mise en production : [supabase/BASCULE_PROD.md](supabase/BASCULE_PROD.md).
Les migrations sont appliquées par Claude avec l'outil MCP Supabase `apply_migration` ; le
SQL Editor du dashboard reste le plan B.

Régénérer les types après une migration :
`npx supabase gen types typescript --local > shared/types/database.ts`, puis remettre
l'en-tête « fichier généré ».

## 5. Authentification

### 5.1 Session et rôle

- Supabase Auth via `@nuxtjs/supabase` (`redirect: false`) : un seul client, session dans un
  **cookie** (`@supabase/ssr`), donc lue au rendu serveur et par les endpoints `/api/*`.
- Le rôle vient du claim **`user_role`** du JWT, ajouté par le hook
  `custom_access_token_hook` (0009). Tant que le hook n'est pas activé dans le dashboard, ou
  pour un ancien token, le claim manque : le client, le serveur et `private.is_admin()`
  retombent sur `profiles.role`.
- `app/stores/auth.ts` suit `useSupabaseUser()` : `isAuthenticated`, `isAdmin`, `role`,
  `currentUser`, `login`, `logout`, `checkAuth`, `init`. Le profil (`profiles`) est chargé en
  arrière-plan.
- `app/middleware/auth.ts` protège les pages `definePageMeta({ requiresAdmin: true })`
  (aujourd'hui `/traducteur`), sans requête réseau. C'est une garde d'affichage : la sécurité
  est côté serveur et en base.

### 5.2 Côté serveur

`server/utils/auth.ts` :

- `requireUser(event)` accepte le cookie de session ou un en-tête
  `Authorization: Bearer <jwt>` (client externe). Il renvoie un client Supabase agissant au
  nom de l'utilisateur (RLS) et son identité. `user.id` vient toujours du token validé,
  jamais du corps de la requête.
- `requireAdmin(event)` ajoute le contrôle du rôle (claim, sinon `profiles.role`) :
  401 si non connecté, 403 si non admin.
- `AuthContext.supabase` n'est pas typé `Database` (dette connue).

### 5.3 Connexion e-mail et OAuth

- `AuthModal` réunit connexion, inscription et « mot de passe oublié » (lien vers
  `/reset-password`).
- `AuthProviderButtons` affiche « Continuer avec Google » (et Apple) selon
  `NUXT_PUBLIC_AUTH_PROVIDERS` : liste séparée par des virgules, défaut `google`. Les valeurs
  inconnues sont ignorées : **`none`** masque tous les boutons OAuth.
- Le bouton appelle `signInWithOAuth` avec `redirectTo = <origine>/confirm` (ou `/en/confirm`) ;
  `app/pages/confirm.vue` attend la session puis revient à la page d'origine (mémorisée dans
  `sessionStorage`).
- Prod : Authentication → URL Configuration → *Redirect URLs* doit contenir `/confirm`,
  `/en/confirm`, `/reset-password` et `/en/reset-password` du domaine ; Google se configure
  dans Authentication → Sign In / Providers (client OAuth « Web application », URI de
  redirection `https://<ref>.supabase.co/auth/v1/callback`).
- Local : Google n'est pas configuré dans `supabase/config.toml`. Pour le tester, ajouter
  un bloc `[auth.external.google]` avec `client_id = "env(GOOGLE_CLIENT_ID)"` et
  `secret = "env(GOOGLE_CLIENT_SECRET)"` (secrets dans l'environnement de la CLI, jamais
  commités), autoriser `http://127.0.0.1:54321/auth/v1/callback` dans Google Cloud, puis
  `npx supabase stop && npx supabase start`. Sinon : `NUXT_PUBLIC_AUTH_PROVIDERS=none`.
- Apple : même principe (`[auth.external.apple]`) ; n'ajouter `apple` à la variable qu'une
  fois le fournisseur activé.

## 6. Lecture des données

Les lectures ne passent pas par `/api/*`. Le client Supabase typé
(`useSupabaseClient<Database>()`) interroge PostgREST directement, au rendu serveur comme
dans le navigateur, sous RLS. Les pages appellent ces lectures dans `useAsyncData` (SSR) et
branchent `status` / `error` sur `LoadingState`, `ErrorState`, `EmptyState`. Les lignes
snake_case sont converties en camelCase par `shared/utils/recipes.ts`.

| Besoin | Composable / store | Requête |
|---|---|---|
| Liste paginée (24 par page), recherche, filtres | `useRecipeSearch(scope, { query, category, tags, page })` | RPC `search_recipes` |
| Compteurs par catégorie, tags | `useRecipeFacets()` | `recipes` (`category, tags`) |
| Fiche complète | `useRecipe(id)` / `fetchRecipeById` | `recipes` + `recipe_sections(*, recipe_ingredients(*), instructions(*))` |
| Favoris | `useFavoritesStore().refresh()` | `favorites`, puis `recipes` par identifiants |
| Planning d'une semaine et notes | `usePlanningStore().loadWeek(date)` | `planning` (+ recette) et `planning_notes` par dates |
| Listes de courses | `useShoppingStore().refresh()` | `shopping_lists` avec `shopping_items(*)` |

- Le store `recipes` garde l'état d'interface (catégorie, recherche, tags) et un compteur
  `revision` : `useRecipesStore().refresh()` après une écriture recharge liste, fiche et
  facettes.
- Les stores `favorites`, `planning`, `shopping` exposent `refresh()` et
  `ensureLoaded()` / `ensureWeekLoaded()` (chargement unique à la demande).

## 7. Écriture : endpoints API

### 7.1 Principe

- Les écritures passent par `server/api/` via `apiFetch` (`app/composables/useApi.ts`) : un
  `fetch` same-origin, le cookie de session part seul.
- Chaque endpoint : `requireUser` / `requireAdmin` → validation Zod
  (`validateBody`, `validateQuery`, `validateRouterParams` de `server/utils/validate.ts`,
  schémas de `shared/schemas/`) → requête ou RPC Supabase sous RLS → `handleApiError` dans
  le `catch`.
- Aucun endpoint `GET` : les lectures sont décrites au § 6.

### 7.2 Liste des endpoints

👤 utilisateur connecté (`requireUser`) · 🔑 admin (`requireAdmin`)

| Endpoint | Auth | Entrée (schéma) | SQL | Réponse |
|---|---|---|---|---|
| `POST /api/add-recipe` | 🔑 | `{ recipe: RecipeInput }` (`addRecipeBodySchema`) | `save_recipe` | `{ success, recipe: RecipeDetail, message }` |
| `PUT /api/update-recipe?id=` | 🔑 | `{ updates: RecipeInput }` (`updateRecipeBodySchema`), remplacement complet | vérification d'existence (404), `save_recipe` | `{ success, recipe, message }` |
| `DELETE /api/delete-recipe?id=` | 🔑 | `?id=uuid` | `delete_recipe` | `{ success, deletedRecipeId, message }` |
| `POST /api/translate-recipe` | 🔑 | `{ recipeText (20–20 000), targetLanguage?: fr\|en }` | `check_ai_quota` (429), appel IA, insert `ai_usage` | `{ success, recipe: RecipeInput, aiRecipe, usage }` ; rien n'est enregistré |
| `POST /api/favorites` | 👤 | `{ recipeId }` | insert (404 recette, 409 doublon) | `{ success, favorite, message }` |
| `DELETE /api/favorites?recipeId=` (ou `?id=`) | 👤 | query | delete (404) | `{ success, message }` |
| `POST /api/planning` | 👤 | `{ dateString, mealType: lunch\|dinner, recipeId? \| customTitle? }` | insert (404 recette) | `{ success, meal, message }` |
| `PUT /api/planning/:id` | 👤 | `{ dateString, mealType }` (`planningEntryMoveSchema`) | update (404), identifiant conservé | `{ success, meal, message }` |
| `DELETE /api/planning/:id` | 👤 | — | delete (404) | `{ success, message }` |
| `POST /api/planning-notes` | 👤 | `{ dateString, noteType: day\|lunch\|dinner, content? }` | update ou insert | `{ success, note, message }` |
| `DELETE /api/planning-notes?dateString=&noteType=` | 👤 | query | delete (idempotent) | `{ success, deleted, message }` |
| `POST /api/shopping-lists` | 👤 | `{ name }` | insert | `{ success, list, message }` |
| `PUT /api/shopping-lists/:id` | 👤 | `{ name }` | update (404) | `{ success, list, message }` |
| `DELETE /api/shopping-lists/:id` | 👤 | — | delete, articles en cascade (404) | `{ success, message }` |
| `POST /api/shopping-lists/:id/recipes` | 👤 | `{ recipeId, sectionIds?, servingsFactor? }` | `add_recipe_to_list` | `{ success, items, message }` |
| `POST /api/shopping-items` | 👤 | `{ listId, name, amount?, unit?, recipeId? }` | `parse_amount`, `normalize_unit`, `merge_shopping_item` | `{ success, item, message }` |
| `PUT /api/shopping-items/:id` | 👤 | `{ name?, amount?, unit?, isChecked? }` | update (triggers `amount_num` / `unit_code`, 404) | `{ success, item, message }` |
| `DELETE /api/shopping-items/:id` | 👤 | — | delete (404) | `{ success, message }` |

`RecipeInput` = `z.infer<typeof recipeInputSchema>` (`shared/schemas/recipe.ts`), la forme
de l'éditeur : `title`, `category`, `description?`, `notes?`, `prepTime` / `cookTime` /
`servings` (entiers ≥ 0 ou `null`), `image?`, `photoPath?`, `tags`, `sections[]` (`name`,
`type`, `orderIndex`, `ingredients[]` { `name`, `amount`, `unit`, `unitCode?`, `optional`,
`orderIndex` }, `instructions[]` { `content`, `orderIndex` } ou texte). Les clés inconnues
sont ignorées. `toSaveRecipePayload` le convertit en payload snake_case pour `save_recipe`.

`RecipeDetail` (`server/utils/recipes.ts`) : la recette et ses sections, ingrédients et
étapes, triés par `orderIndex`.

### 7.3 Erreurs

- `400` « Données invalides : champ : raison ; … » (Zod, en français, 5 champs au plus).
- `401` / `403` (auth), `404` / `409` (métier), `429` (quota IA).
- `throwSupabaseError` n'expose que les erreurs volontaires des RPC : `22023` → 400 avec le
  message SQL, `P0002` → 404, `42501` → 403, `23505` → 409.
- Tout le reste → `500` « Une erreur est survenue, réessayez plus tard. ». Le détail est
  écrit dans les journaux serveur (`[api] <contexte>`), jamais renvoyé au client.
- Côté client, les stores lèvent une `ApiError` (`apiErrorFromResponse`) ; `toUserMessage`
  (`app/composables/useApiError.ts`) affiche le message du serveur pour une 4xx et
  `errors.generic` (i18n) sinon.

## 8. Design

Tokens dans `app/assets/css/main.css` (`@theme static`) et `app/app.config.ts`.

- **Couleurs** : uniquement les utilitaires sémantiques de Nuxt UI (`bg-default`,
  `bg-muted`, `bg-elevated`, `text-highlighted`, `text-muted`, `border-default`,
  `text-primary`, `text-error`…). Aucun hex ni `gray-*` dans les composants : le mode sombre
  suit seul. Exceptions : le logo Google (`public/images/google.svg`) et la feuille
  d'impression dans `main.css`.
- **Palette** : neutre `stone` + accent terracotta `primary` (500 = `#c2603e`).
  `--ui-primary` vaut la nuance 600 en clair, 400 en sombre (contraste AA).
- **Typographie** : Inter (`font-sans`, interface), Fraunces (`font-serif`, titres de pages
  et de recettes), Lobster (`font-lobster`, logo uniquement), servies par `@nuxt/fonts`.
- **Surfaces** : bordures fines plutôt qu'ombres ; `rounded-lg`, `rounded-xl` pour cartes
  et modales.
- **Composants** : Nuxt UI (`UButton`, `UModal`, `UForm` + Zod, `USelectMenu`…), icônes
  `i-lucide-*`. Un bouton icône a toujours un `aria-label`. Confirmations en `UModal`.
- **Toasts** : `useToast()` ; la façade `$toast` (`plugins/toast.client.ts`) garde l'ancienne
  API `$toast.success(title, message?)`.
- **Layout** : header compact (navigation, mode sombre, langue, menu utilisateur) ; sur
  mobile, barre d'onglets en bas (Recettes, Planning, Courses, Favoris, Moi) ; `<main>` en
  `w-full min-w-0` (aucun défilement horizontal à 375 px).
- **Accessibilité** : focus visible, navigation au clavier, `aria-current="page"`,
  `prefers-reduced-motion` respecté.
- **i18n** : stratégie `prefix_except_default` (FR sans préfixe, EN sous `/en`). Aucun texte
  visible en dur ; liens via `localePath()`. `test/unit/i18n.test.ts` vérifie la parité des
  clés fr/en, l'absence de valeur vide, les paramètres `{…}` et l'existence des clés
  utilisées dans `app/`.
- **Catégories** : `useCategories()` fournit libellés et icônes ; l'icône sert de repli
  quand une recette n'a pas de photo.
- **Création de recette** (admin, `/recettes`) : menu « Nouvelle recette » → « Saisir une
  recette » (éditeur) ou « Importer avec l'IA » (`/traducteur`).

## 9. Fiche recette, éditeur et photos

### 9.1 Fiche (`app/pages/recettes/[id].vue`)

| Composant | Rôle |
|---|---|
| `RecipeHero` | photo (ou icône de catégorie), catégorie, tags, titre, temps, compteur de portions (`RecipeServingsControl`) |
| `RecipeIngredients` | ingrédients par section, cases à cocher (état local), quantités mises à l'échelle |
| `RecipeSteps` | étapes numérotées par section |
| `RecipeActions` | favori, courses, planning (`PlanningModal`), mode cuisine, impression, modifier / supprimer (admin) |
| `RecipeAddToShoppingModal` | choix de la liste et des sections → `useShoppingStore().addRecipeToList(…)` |
| `RecipeCookingMode` | plein écran, une étape à la fois, ←/→/Échap, Wake Lock |

- `useServingsScaler(recipe)` : portions cibles, `factor`, `scaledAmount()`. Calculs dans
  `shared/utils/recipes.ts` (`servingsFactor`, `roundReadable` : fractions ½ ¼ ¾ ⅓ ⅔ sous 10,
  une décimale jusqu'à 100, entier au-delà). Le facteur est transmis à `add_recipe_to_list`.
- `useCookingMode(recipe)` : étapes à plat, section d'ingrédients associée,
  `navigator.wakeLock` (silencieux si refusé ou non supporté).
- Impression : `@media print` de `main.css`, limitée à la fiche (`body:has(#recipe-sheet)`).

### 9.2 Éditeur (`RecipeEditor.vue` → `components/editor/`)

- `RecipeEditor` : façade (`show`, `recipe`, émet `close` / `save`) qui ouvre une `UModal`
  avec `RecipeEditorForm`.
- `RecipeEditorForm` : `UForm` + `recipeInputSchema`, erreurs sous chaque champ, au moins un
  ingrédient et une étape. Une section `mixed` est éditée comme une section d'ingrédients et
  une section d'étapes du même nom. Enregistrement via `useRecipesStore().addRecipe` /
  `updateRecipe`.
- `SectionEditor` : réordonner sections, ingrédients et étapes ; glisser-déposer des étapes.
- `IngredientRow` : quantité libre, unité choisie dans `USelectMenu` (`useUnits()`) ou saisie
  libre ; la base dérive `unit_code`.
- `PhotoField` : aperçu, remplacer, retirer.

### 9.3 Photos (`useRecipePhoto`, bucket `recipe-photos`)

- Redimensionnement dans le navigateur (canvas, plus grand côté 1600 px, WebP qualité 0,82,
  repli JPEG) : le plan Supabase gratuit n'a pas de transformation d'images.
- Chemin : `recipe-photos/<recipeId>/<timestamp>.webp`. Envoi par le client Supabase de
  l'admin (politiques de 0010). En modification, la photo part d'abord puis `photoPath` est
  enregistré ; en création, la recette d'abord, puis la photo, puis `updateRecipe`.
  `photoPath` vide → `photo_path` remis à `NULL`.
- Suppression d'une recette : `removeRecipePhotos(recipeId)` puis `delete_recipe` (pas de
  trigger Storage).
- Affichage : `NuxtImg` sur l'URL publique. `image.domains` = hôte de `SUPABASE_URL` (lu au
  build) + `127.0.0.1:54321` hors Vercel ; ipx en dev, optimisation Vercel en prod. Le
  provider `supabase` de `@nuxt/image` n'est pas utilisé. `RecipeHero` charge l'image en
  priorité (LCP) ; cartes et planning en différé.

## 10. Planning et listes de courses

| Couche | Planning | Courses |
|---|---|---|
| Page | `pages/planning.vue` + `components/planning/` | `pages/courses.vue` + `components/shopping/` |
| Store (données) | `usePlanningStore` : `loadWeek`, `addMeal`, `addCustomMeal`, `removeMeal`, `moveMeal` (`PUT /api/planning/:id`), `saveNote` (vide → `DELETE`) | `useShoppingStore` : listes, `addItem`, `updateItem`, `toggleItem` (optimiste), `clearChecked`, `moveItem`, `addRecipeToList`… |
| Composable (interface) | `usePlanningWeek(date)` : jours, dates localisées, toasts | `useShoppingLists()` : liste courante, à acheter / cochés, rayons, préférences `storeMode` / `byAisle` (localStorage) |
| Utilitaires | `app/utils/week.ts` (lundi → dimanche, clés locales `AAAA-MM-JJ`) | `shared/utils/shopping.ts` (`formatQuantity`, `splitChecked`, `aisleOf`, `groupByAisle`) |

- Aucune consolidation côté client : `merge_shopping_item` et `add_recipe_to_list`
  additionnent en base (même nom replié, même `unit_code`). Deux unités différentes donnent
  deux articles (pas de conversion `kg` / `g`).
- Planning : liste par jour sur mobile, grille 7 colonnes sur grand écran, glisser-déposer
  natif avec repli « Déplacer… » ; `?week=AAAA-MM-JJ` ouvre une semaine ; impression en
  paysage.
- Courses : rayons par mots-clés (table statique), mode « magasin » (zones tactiles
  agrandies).

## 11. Traducteur IA

Page `/traducteur` (admins) : texte collé → recette structurée → aperçu → ajout par
`POST /api/add-recipe`. Comparatif des modèles et coûts :
[docs/IA_MODELES.md](docs/IA_MODELES.md).

| Fichier | Rôle |
|---|---|
| `shared/schemas/ai.ts` | `translateRecipeBodySchema`, `aiRecipeSchema` (unité parmi les 37 codes, catégorie parmi 9), `aiRecipeToRecipeInput` |
| `server/utils/ai/provider.ts` | `getAiConfig()` (variables `AI_*`, clés), `getModel()` |
| `server/utils/ai/translate.ts` | `generateObject` + `aiRecipeSchema`, délai 25 s, 1 nouvel essai |
| `server/utils/ai/prompt.ts` | prompt système en français |
| `server/utils/ai/errors.ts` | erreurs du fournisseur → 401, 402, 422, 502, 504, messages sans détail technique |
| `server/utils/ai/usage.ts` | quota (`check_ai_quota`, 429) et journal `ai_usage` |
| `server/utils/ai/pricing.ts` | grille de prix datée, coût estimé |
| `server/utils/ai/mock.ts` | fournisseur `mock` : recette fixe, aucun appel réseau |
| `server/utils/ai/media.ts` | préparation de la transcription audio et des images (non branchée) |
| `app/composables/useTranslator.ts`, `RecipeTranslator.vue`, `translator/RecipePreview.vue` | interface |

- Fournisseur : `AI_PROVIDER` = `openai` (défaut, `gpt-4.1-mini`), `anthropic`, `google`,
  `mistral` ou `mock`. Changer de fournisseur = changer la variable et la clé, sans code.
- Quota : `AI_DAILY_QUOTA` appels par personne et par jour (défaut 50, admins compris) ;
  `0` désactive le traducteur. Si `check_ai_quota` est indisponible, l'appel passe (le quota
  est un garde-fou, la barrière reste `requireAdmin`).
- Sorties structurées strictes : pas de champ optionnel ni de longueur dans `aiRecipeSchema` ;
  le résultat converti est revalidé par `recipeInputSchema`.
- Ouvrir à tous : remplacer `requireAdmin` par `requireUser` dans
  `translate-recipe.post.ts` et retirer `requiresAdmin` de la page.

## 12. Observabilité (Sentry)

- `@sentry/nuxt`, dernier module de `nuxt.config.ts`. Initialisation dans
  `sentry.client.config.ts` et `sentry.server.config.ts`, **seulement si un DSN est
  défini** (`NUXT_PUBLIC_SENTRY_DSN`, repli `SENTRY_DSN`). Sans DSN : aucune requête.
- Projet Sentry : organisation `nina-fy`, projet `recettes-des-boultons`, région UE.
  `NUXT_PUBLIC_SENTRY_DSN` est défini dans Vercel (Production + Preview).
- `environment` = `VERCEL_ENV` (sinon `development`) ; traces à 10 % en production, 0
  ailleurs ; pas de Session Replay.
- Aucune donnée personnelle : ni utilisateur, ni cookies, ni en-têtes, ni corps, ni
  paramètres d'URL (le `?code=` OAuth), ni variables locales.
- Serveur : le hook Nitro `error` du module capture les erreurs ≥ 500 ; les 4xx sont
  ignorées.
- Sourcemaps : envoyées puis retirées du build **uniquement si `SENTRY_AUTH_TOKEN`** est
  défini (avec `SENTRY_ORG=nina-fy`, `SENTRY_PROJECT=recettes-des-boultons`). Sinon
  `sourcemaps.disable` et build inchangé.
- Limite : `handleApiError` et `throwSupabaseError` (`server/utils/errors.ts`) journalisent
  l'erreur d'origine puis lèvent un 500 générique sans `cause`. Sentry reçoit donc « Une
  erreur est survenue… » avec une pile dans `errors.ts`. Pour remonter l'erreur réelle,
  appeler `Sentry.captureException(error, { tags: { api: context } })` avant le `throw` et
  passer `cause: error` à `createError`.

## 13. PWA et hors ligne

- Manifeste « Recettes des Boultons » (`short_name` Boultons), icônes `public/pwa-192x192.png`,
  `pwa-512x512.png`, `maskable-icon-512x512.png` (générées par `npm run pwa:icons`).
- Service worker Workbox (`registerType: 'autoUpdate'`, désactivé en `nuxt dev`) : précache
  du JS/CSS et des icônes ; pages HTML en `NetworkFirst` (cache `pages`, sauf `/confirm`,
  `/reset-password`, `/api/**`) ; images, icônes et polices à la demande. Aucune requête
  Supabase ni `/api/**` n'est mise en cache. Le cache `pages` est vidé à la déconnexion
  (`plugins/pwa-offline.client.ts`).
- Courses hors ligne : `useOfflineShopping()` copie les listes dans `localStorage`
  (`offline:shopping:v1`, effacé à la déconnexion). `<OfflineBanner />` signale la perte de
  réseau et affiche, sur `/courses`, la dernière copie en lecture seule.
- Tester en local (le service worker n'existe pas en dev) :
  `NITRO_PRESET=node-server npm run build -- --dotenv .env.local`, puis
  `node --env-file=.env.local .output/server/index.mjs`.

## 14. Tests et CI

### 14.1 Vitest

- `npm test` : `test/**/*.{test,spec}.ts`, environnement `happy-dom` (ajouter
  `// @vitest-environment nuxt` pour un test qui a besoin de l'app).
- `test/unit/` : schémas Zod, mise à l'échelle, utilitaires courses et semaines, i18n,
  erreurs, IA (mock, erreurs, prix), courses hors ligne.
- `test/integration/*.local.test.ts` : contre la base locale (`.env.local`) ; sautés si
  elle n'est pas joignable. `translate-recipe.local.test.ts` demande aussi un serveur Nuxt
  avec `AI_PROVIDER=mock` (`APP_URL`, défaut `http://localhost:3001`).
- `npm run test:coverage` : rapport dans `coverage/`, sans seuil bloquant.

### 14.2 Playwright

```bash
npm run test:e2e                       # chromium desktop + Pixel 7, base LOCALE
npm run test:e2e:ui                    # mode interactif
E2E_SERVER=preview npm run test:e2e    # sur le build Node (+ tests du service worker)
```

- Serveur : `nuxt dev --dotenv .env.local --port 3042` (réutilisé s'il tourne) ou, en CI et
  avec `E2E_SERVER=preview`, `node .output/server/index.mjs`. `E2E_BASE_URL` vise un serveur
  existant, `E2E_PORT` change le port. Exécution en série.
- Refus si `SUPABASE_URL` n'est pas locale. Les données créées sont préfixées `E2E_` et
  supprimées. Sessions dans `test-results/.auth/`, rapport dans `test-results/report`.
- Parcours : recherche sans accent, catégorie et pagination, favori, ajout aux courses,
  repas libre au planning, bouton « Modifier » selon le rôle, `/en` sans clé manquante,
  courses hors ligne.

### 14.3 CI (`.github/workflows/ci.yml`)

- Job `ci` : `npm ci`, lint, typecheck, test, build (variables Supabase factices).
- Job `e2e` (après `ci`) : `supabase start` sans les services inutiles,
  `scripts/ci-seed.sh`, `scripts/ci-env-local.sh` (écrit `.env.local` avec `AI_PROVIDER=mock`),
  build Node, `npm run test:e2e`, rapport Playwright en artefact en cas d'échec.

### 14.4 Tests SQL

- `npm run db:local:test` : base vide, `seed_test.sql`, 0003 → 0012, rejeu, tests
  `test_0003` → `test_0010`, puis 0013 → 0015, rejeu, tests `test_0013` → `test_0015`.
  Il vide la base `postgres` : relancer `npm run db:local:reset` ensuite.
- `SUPABASE_TEST_DATABASE=ci_test npm run db:local:test` : même suite sur une base séparée
  `ci_test` de la stack ; la base `postgres` et ses données restent intactes (pg_dump 17
  requis).
- `supabase/tests/run_local.sh` : variante sans Docker, sur un Postgres 17 temporaire.
- Ces tests SQL ne tournent pas en CI.

## 15. Variables d'environnement

Modèle commenté : [env.example](env.example). Production : Vercel → Settings → Environment
Variables (aucun fichier `.env` n'est déployé).

| Variable | Lue par | Rôle |
|---|---|---|
| `SUPABASE_URL` | `nuxt.config.ts` (module Supabase, `image.domains`), e2e | URL du projet |
| `SUPABASE_ANON_KEY` | `nuxt.config.ts`, e2e | clé publique (anon ou publishable `sb_publishable_…`) |
| `NUXT_PUBLIC_AUTH_PROVIDERS` | `runtimeConfig.public.authProviders` | boutons OAuth : `google` (défaut), `google,apple`, `none` |
| `AI_PROVIDER` | `runtimeConfig.aiProvider`, `getAiConfig()` | `openai` (défaut), `anthropic`, `google`, `mistral`, `mock` |
| `AI_MODEL` | idem | modèle ; vide = défaut du fournisseur |
| `AI_DAILY_QUOTA` | idem | appels par personne et par jour (défaut 50, `0` = coupé) |
| `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GOOGLE_GENERATIVE_AI_API_KEY`, `MISTRAL_API_KEY` | idem | clé du fournisseur choisi |
| `NUXT_PUBLIC_SENTRY_DSN` (repli `SENTRY_DSN`) | `nuxt.config.ts`, `sentry.*.config.ts` | DSN Sentry ; vide = Sentry inactif |
| `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT` | `nuxt.config.ts` (build) | envoi des sourcemaps (optionnel) |
| `VERCEL`, `VERCEL_ENV` | `nuxt.config.ts`, Sentry | fournies par Vercel, ne pas définir |
| `NITRO_PRESET` | Nitro | `node-server` pour un build servi par Node (e2e, PWA) |
| `E2E_SERVER`, `E2E_BASE_URL`, `E2E_PORT`, `CI` | `playwright.config.ts` | tests e2e |
| `APP_URL`, `LOCAL_DB_URL` | tests d'intégration | serveur Nuxt et base locale |
| `SUPABASE_DB_URL`, `SUPABASE_TEST_DATABASE`, `SUPABASE_CLI` | scripts `supabase/local/`, `scripts/` | outillage de la base locale |

- Le module `@nuxtjs/supabase` attend `SUPABASE_URL` / `SUPABASE_KEY` : `nuxt.config.ts`
  mappe `SUPABASE_ANON_KEY` pour garder le nom déjà utilisé sur Vercel.
  `NUXT_PUBLIC_SUPABASE_URL` / `NUXT_PUBLIC_SUPABASE_KEY` fonctionnent aussi à l'exécution.
- Les variables IA peuvent aussi s'écrire `NUXT_AI_PROVIDER`, `NUXT_OPENAI_API_KEY`… (surcharge
  de `runtimeConfig`).
- La clé `service_role` (ou `sb_secret_…`) n'est pas utilisée et ne doit jamais être exposée.
- `API_BASE` et `NODE_ENV` ne sont plus lues par le code.

## 16. Déploiement

- Vercel construit chaque push (`nuxt build`, preset `vercel`, Node 22.x) ; `main` part en
  production. Fonctions `server/api/**` : `maxDuration` 30 s.
- Les migrations SQL ne sont pas appliquées par le déploiement. Mise en production de
  0003 → 0015 : [supabase/BASCULE_PROD.md](supabase/BASCULE_PROD.md) ; détail par migration :
  [supabase/MIGRATION_NOTES.md](supabase/MIGRATION_NOTES.md).
- Nouveau projet Supabase : [SUPABASE_SETUP.md](SUPABASE_SETUP.md).
- Notes de version pour la famille : `RELEASE_NOTES.md`.

## 17. À savoir

- **Messages d'erreur serveur en français** : les 4xx de `server/api` (Zod, métier, SQL)
  sont rédigés en français et affichés tels quels, y compris en anglais.
- **Nombres formatés en `fr-FR`** : `shared/utils/recipes.ts` (`toLocaleString('fr-FR')`)
  affiche « 1,5 » aussi dans l'interface anglaise.
- **`recipes.image` inutilisée** : la colonne existe, `RecipeInput` l'accepte et
  `RecipeDetail` la renvoie, mais l'interface ne la lit ni ne l'écrit plus (les photos
  passent par `photo_path`).
- **Couverture de tests faible sur les stores et les endpoints** : ils ne sont couverts que
  par les tests e2e et les deux tests d'intégration.
- **`AuthContext.supabase` non typé** (`server/utils/auth.ts`).
- **Promouvoir un admin** depuis le SQL Editor déclenche `prevent_role_change` (pas de JWT).
  Dans une transaction :
  `select set_config('request.jwt.claims', '{"user_role":"admin"}', true); update public.profiles set role = 'admin' where email = '…';`
  L'utilisateur doit se reconnecter pour que le claim suive.
- **RPC introuvable (404) juste après une migration** : `notify pgrst, 'reload schema';`.
- **`max_rows = 1000`** (PostgREST) : une requête qui renverrait plus de 1 000 lignes est
  tronquée sans erreur. Paginer ou filtrer.
- **Prévisualisation dans Claude Code** : `.claude/launch.json`, configuration
  `preview-local` (port 3007, base locale). La configuration `preview` utilise `npm run dev`.
