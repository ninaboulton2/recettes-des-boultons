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
9. [Éditions (Boultons / générique)](#9-éditions-boultons--générique)
10. [Fiche recette, éditeur et photos](#10-fiche-recette-éditeur-et-photos)
11. [Planning et listes de courses](#11-planning-et-listes-de-courses)
12. [Traducteur IA](#12-traducteur-ia)
13. [Observabilité (Sentry)](#13-observabilité-sentry)
14. [PWA et hors ligne](#14-pwa-et-hors-ligne)
15. [Tests et CI](#15-tests-et-ci)
16. [Variables d'environnement](#16-variables-denvironnement)
17. [Déploiement](#17-déploiement)
18. [À savoir](#18-à-savoir)
19. [Recettes bilingues (fr / en)](#19-recettes-bilingues-fr--en)
20. [v2 : partage, groupes et RLS](#20-v2--partage-groupes-et-rls)

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
│   ├── assets/css/main.css   # Tailwind 4 + Nuxt UI, @theme (polices), diagonal-bg, impression
│   ├── components/           # composants partagés (RecipeCard, RecipeGrid, AuthModal, OfflineBanner…)
│   │   ├── home/             # accueils par édition : HomeBoultons, HomeGeneric (voir § 9)
│   │   ├── recipe/           # fiche recette (préfixe Recipe* : RecipeHero, RecipeCookingMode…)
│   │   ├── editor/           # éditeur de recette (RecipeEditorForm, SectionEditor…)
│   │   ├── planning/         # planning (WeekNavigator, DayColumn, MealSlot, MealCard…)
│   │   ├── shopping/         # courses (ListTabs, AddItemForm, ItemList, ItemRow, UnitSelect)
│   │   └── translator/       # traducteur : RecipePreview, FileDrop (dépôt de fichiers), AudioRecorder (dictée), DriveButton (Google Drive)
│   ├── composables/          # useEdition, useRecipeSearch, useRecipe, usePlanningWeek, useShoppingLists…
│   ├── layouts/default.vue   # header, barre d'onglets mobile, bandeau hors ligne
│   ├── middleware/auth.ts    # garde d'affichage des pages admin
│   ├── pages/                # recettes, planning, courses, favoris, traducteur, confirm, reset-password
│   ├── plugins/              # edition.ts (thème de l'édition), toast.client.ts, pwa-offline.client.ts
│   ├── stores/               # Pinia : auth, recipes, favorites, planning, shopping
│   └── utils/                # week.ts (semaines du planning), homeFeatures.ts, image.ts (photos allégées avant envoi)
├── shared/                   # code commun client/serveur (alias #shared)
│   ├── editions/             # configuration des éditions : types, boultons, generic, theme (voir § 9)
│   ├── schemas/              # schémas Zod : recipe, shopping, planning, favorites, ai, translation, media, units, common
│   ├── types/index.ts        # modèle de lecture (RecipeSummary, Recipe, ShoppingList…)
│   ├── types/database.ts     # types Supabase GÉNÉRÉS (ne pas éditer)
│   └── utils/                # recipes.ts (mapping, quantités), translation.ts (recettes bilingues), shopping.ts (rayons), text.ts, color.ts (contraste)
├── server/
│   ├── api/                  # endpoints d'écriture (voir § 7)
│   └── utils/                # auth.ts, errors.ts, validate.ts, recipes.ts, shopping.ts, ai/
├── i18n/locales/             # fr.json, en.json
├── supabase/
│   ├── migrations/           # 0001 → 0017, 0019, 0021 (SQL, appliquées à la main, voir § 4)
│   ├── v2/                   # bascule RLS 0020 (PRÉPARÉE, jamais appliquée avec les migrations, voir § 20)
│   ├── rollback/             # retours arrière (0005, 0013, 0016, 0017, 0018, 0019, 0020, 0021)
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
├── docs/                     # IA_MODELES.md, QUALITE_DONNEES.md, GOOGLE_DRIVE_SETUP.md
├── public/                   # favicons, icônes PWA, images/ (logo.png, boultons.png, categories/*.png, google.svg)
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
- Liste complète des variables : § 16 et [env.example](env.example).

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
| `npm run db:local:test` | rejoue les migrations et les tests SQL (voir § 15.4) |
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

### 4.1 Tables (état après la migration 0016 ; 0017 ajoute les tables sociales v2, voir § 4.4)

```
profiles            id (= auth.users.id), email, name, role 'user'|'admin', language, theme,
                    notifications, created_at, updated_at
recipes             id, title, description, category, prep_time, cook_time, servings,
                    image, photo_path, tags text[], notes, lang 'fr'|'en', search (tsvector
                    généré, selon lang), created_at, updated_at
recipe_translations recipe_id → recipes (cascade), locale 'fr'|'en' (= l'AUTRE langue que
                    recipes.lang), title, description, notes, tags, content jsonb (textes des
                    sections PAR POSITION), source_hash, model, stale, translated_at,
                    search (tsvector généré)   — PK (recipe_id, locale), voir § 19
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
units               code, label_fr, label_en, abbr, abbr_en, kind, to_base, sort_order   (37 unités)
unit_aliases        alias (replié), code                                         (190 alias)
ai_usage            id, user_id, created_at, provider, model, feature, input_tokens,
                    output_tokens, estimated_cost_usd, status 'ok'|'error', duration_ms
```

- Toutes les recettes sont décrites par leurs sections. Les colonnes JSONB
  `recipes.ingredients` / `instructions` ont été supprimées par 0013.
- `amount_num` et `unit_code` sont dérivés par trigger de `amount` et `unit` (0003, 0004).
- `recipes.image` n'est plus utilisée (voir § 18).
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
| `save_recipe(payload jsonb)` | 0006, 0011, 0013, 0016 | crée ou remplace une recette entière (sections, ingrédients, étapes, `photo_path`, `lang`, traduction jointe) en une transaction ; marque les traductions périmées sinon | `add-recipe`, `update-recipe` |
| `delete_recipe(p_id)` | 0006 | supprime une recette | `delete-recipe` |
| `merge_shopping_item(…)` | 0007 | ajoute un article ou l'additionne à un article de même nom replié et même `unit_code` | `POST /api/shopping-items` |
| `add_recipe_to_list(…, p_locale)` | 0007, 0016 | ajoute les ingrédients d'une recette (sections choisies, facteur de portions) avec fusion ; `p_locale` : noms traduits | `POST /api/shopping-lists/:id/recipes` |
| `search_recipes(p_query, p_category, p_tags, p_limit, p_offset)` | 0008, 0010, 0013, 0016 | recherche plein texte sans accents dans le texte d'origine ET la traduction, filtres, pagination, `total_count`, renvoie `lang` et `translation` | `useRecipeSearch` |
| `save_recipe_translation(p_recipe_id, p_lang, p_translation)` | 0016 | pose `recipes.lang` et écrit la traduction vers l'autre langue (admin) | `update-recipe`, `add-recipe`, `translations/run` |
| `check_ai_quota(p_max_per_day)` | 0012 | vrai si l'appelant est sous son quota du jour (Europe/Paris) | traducteur |
| `custom_access_token_hook(event)` | 0009 | hook Auth : ajoute le claim `user_role` au JWT | Supabase Auth |
| `private.is_admin()` | 0009 | vrai si le claim `user_role` vaut `admin`, sinon repli sur `profiles.role` | politiques RLS |

Erreurs volontaires des RPC : SQLSTATE `22023` (donnée invalide), `P0002` (introuvable),
`42501` (non autorisé), avec un message en français (voir § 7.3). Signatures et exemples :
[supabase/MIGRATION_NOTES.md](supabase/MIGRATION_NOTES.md).

### 4.3 Sécurité en base (RLS)

| Tables | Lecture | Écriture |
|---|---|---|
| `recipes`, `recipe_sections`, `recipe_ingredients`, `instructions`, `recipe_translations` | publique | admin (`private.is_admin()`) |
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
| 0016 | recettes bilingues : `recipes.lang`, `recipe_translations`, `units.abbr_en`, `save_recipe_translation`, `save_recipe` / `search_recipes` / `add_recipe_to_list` étendues (§ 19) |
| 0017 | v2, phase 2, « expand » seulement : 11 tables sociales fermées à l'API (RLS sans politique) — `categories`, `groups`, `group_members`, `friendships`, `invitations`, `recipe_grants`, `recipe_share_links`, `cookbook_entries`, `notifications`, `reports`, `system_alerts` — + colonnes nullables `recipes.owner_id / visibility / copied_from / category_id` et `profiles.display_name / cookbook_title / theme_settings / active_theme_group_id / discoverable / onboarded_at`. Aucun effet sur le code actuel ; choix de conception en tête du fichier. Retour arrière : `supabase/rollback/0017_social_schema_down.sql` |
| 0019 | v2, phase 3 : fonctions d'aide RLS `private.*` (`can_read_recipe`, `can_copy_recipe`, `can_edit_recipe`, `is_group_member`, `shares_group_with`, `are_friends`, `is_support`, …), politiques + `grant` ciblés (colonnes comprises) sur les 11 tables de 0017 et sur la nouvelle table `dismissed_prompts` (bannières fermées), RPC `search_users`, `get_public_profiles`, `add_author_recipes_to_cookbook`, 4 déclencheurs d'intégrité. **Aucun effet sur le code actuel** : les politiques de `recipes` & co ne sont pas touchées (empreinte md5 vérifiée). Voir § 20. Retour arrière : `supabase/rollback/0019_rls_helpers_social_down.sql` |
| 0018 (`supabase/v2/`) | **Remplissage v2, phase 4, NON appliqué** (jour de la bascule, avec des paramètres saisis par Nina : `v2/0018_params.sql`) : groupe « Les Boultons » (thème `boultons`), tous les comptes membres, `recipes.owner_id` = Nina, un droit `edit_original` du groupe par recette, catégories personnelles (9 par compte) et `recipes.category_id`, favoris des autres comptes → leur carnet, `display_name` / thème actif / rôles (le 2ᵉ admin repasse `user`). Idempotent, assertions, sauvegarde `private.backup_0018_*` pour le retour arrière `supabase/rollback/0018_v2_data_fill_down.sql`. Procédure : [supabase/BASCULE_V2.md](supabase/BASCULE_V2.md). Voir § 20.6 |
| 0020 (`supabase/v2/`) | **Bascule PRÉPARÉE, non appliquée** : remplace les politiques de `recipes`, `recipe_sections`, `recipe_ingredients`, `instructions`, `recipe_translations`, `favorites` (insertion) et du bucket `recipe-photos`. Refuse de tourner tant qu'une recette n'a pas de `owner_id`. Retour arrière : `supabase/rollback/0020_rls_switchover_down.sql`. Numérotation : 0018 = remplissage (phase 4, appliqué AVANT 0020 mais APRÈS 0019), 0021 = fonctions métier côté recettes (ci-dessous), 0022 = « contract » (ancien 0020 du dossier) |
| 0021 | v2, phase 5A : fonctions métier côté recettes, **sans effet sur le code actuel** (aucune table, colonne, politique ni donnée ; empreintes md5 vérifiées). 17 fonctions nouvelles (`security definer`, `search_path` vide, `authenticated` seulement ; `get_shared_recipe` aussi `anon`) : `copy_recipe`, `add_to_cookbook`, `remove_from_cookbook`, `list_cookbook`, `list_author_recipes`, `list_shared_with_me`, `grant_recipe`, `revoke_recipe_grant`, `reshare_recipe`, `list_recipe_grants`, `create_share_link`, `revoke_share_link`, `claim_shared_recipe`, `get_shared_recipe`, `recipe_usage`, `pending_prompts`, `dismiss_prompt`. Deux fonctions remplacées à signature identique : `save_recipe` (écrit `owner_id`, `category_id`, `visibility` ; inchangée sans ces clés) et `save_recipe_translation` (garde « admin OU peut modifier la recette »). S'applique **tout de suite après 0019**. Voir § 20.7. Retour arrière : `supabase/rollback/0021_recipe_rpcs_down.sql` |
| 0022 | **RÉSERVÉE** au « contract » (suppression des colonnes v1 : `recipes.category`, `recipes.image`…, clés étrangères composites sur les sections). Ne pas l'utiliser pour autre chose. |
| 0023 | v2, phase 5B : fonctions métier côté social, **sans effet sur le code actuel** (aucune table, colonne ni politique modifiée ; empreintes md5 des politiques, des autres fonctions publiques et des déclencheurs existants vérifiées). 29 fonctions publiques nouvelles (`security definer`, `search_path` vide, `authenticated` seulement ; `prepare_account_deletion` : `service_role` seulement) : amis (`send_friend_request`, `respond_friend_request`, `cancel_friend_request`, `remove_friend`, `list_friends`, `list_friend_requests`), groupes (`create_group`, `rename_group`, `update_group_theme`, `invite_to_group`, `cancel_group_invitation`, `respond_group_invitation`, `leave_group`, `remove_group_member`, `transfer_group_ownership`, `delete_group`, `list_my_groups`, `list_group_members`, `list_group_invitations`), invitation par lien (`create_invite_link`, `redeem_invite_link`), notifications (`list_notifications`, `mark_notifications_read`, `unread_notifications_count`), profil (`update_my_profile`, `get_user_profile`), compte (`export_my_data`, `account_deletion_blockers`, `prepare_account_deletion`). 9 déclencheurs `trg_0023_*` (limites de débit, notifications, règles du pseudonyme, notification à la suppression d'une recette) et un journal `private.rate_events`. S'applique **tout de suite après 0021** (indépendante d'elle : seulement 0019 est requise). Voir § 20.8. Retour arrière : `supabase/rollback/0023_social_rpcs_down.sql` |
| 0027 | v2, phase 6E : `report_shared_recipe(token, motif, détails)`, signalement d'une recette par jeton de lien public (connecté seulement ; limite de 10 par jour de 0023). Aucune table ni politique touchée, sans effet en v1 (§ 20.13) |
| 0028 | v2, phase 7 : `profiles.ai_daily_quota`, `notifications.emailed_at`, RPC `ai_quota_status`, `ai_service_status`, alertes de crédit (`report_ai_billing_error`, `claim_ai_alert_email`, `reset_ai_credit_alert`, `ai_credit_alert_active`, `support_reset_ai_credit`) et e-mails (`claim_notification_emails`, `release_notification_emails`). Colonnes nullables et fonctions seulement : sans effet en v1 (§ 20.15) |

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
- `app/middleware/auth.ts` est prévu pour protéger les pages `definePageMeta({ requiresAdmin: true })`
  (`/traducteur`), sans requête réseau. **Constat (0016) : il n'est pas exécuté**
  (middleware nommé, déclaré par aucune page ; tout est refusé en 403 par
  le serveur pour un utilisateur simple). Ce n'est de toute façon qu'une garde d'affichage : la sécurité est côté serveur et en base. Le
  rendre global exigerait de s'assurer que `isAdmin` est fiable sans requête (claim `user_role`
  absent tant que le hook n'est pas activé en prod).

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
| Fiche complète | `useRecipe(id)` / `fetchRecipeById` | `recipes` + `recipe_translations(*)` + `recipe_sections(*, recipe_ingredients(*), instructions(*))` |
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
- Aucun endpoint `GET` pour les lectures publiques (§ 6).

### 7.2 Liste des endpoints

👤 utilisateur connecté (`requireUser`) · 🔑 admin (`requireAdmin`)

| Endpoint | Auth | Entrée (schéma) | SQL | Réponse |
|---|---|---|---|---|
| `POST /api/add-recipe` | 🔑 | `{ recipe: RecipeInput, lang?, translation? }` (`addRecipeBodySchema`) | `save_recipe` (recette + traduction jointe) ; sans `translation` : appel IA `translate_recipe` après l'enregistrement | `{ success, recipe: RecipeDetail, translation: { status }, message }` |
| `PUT /api/update-recipe?id=` | 🔑 | `{ updates: RecipeInput }` (`updateRecipeBodySchema`), remplacement complet | vérification d'existence (404), `save_recipe`, puis revalidation (même empreinte) ou régénération IA de la traduction | `{ success, recipe, translation: { status, reason?, message? }, message }` |
| `DELETE /api/delete-recipe?id=` | 🔑 | `?id=uuid` | `delete_recipe` | `{ success, deletedRecipeId, message }` |
| `POST /api/translate-recipe` | 🔑 | `{ recipeText (20–20 000) }` (plus de langue cible : l'IA détecte la langue) | `check_ai_quota` (429), appel IA, insert `ai_usage` | `{ success, recipe: RecipeInput (langue d'origine), lang, translation (l'autre langue), aiRecipe, usage }` ; rien n'est enregistré |
| `POST /api/extract-recipe` | 🔑 | `multipart/form-data` : `files` (1–4 JPEG/PNG/WebP/PDF, 4 Mo au total) (`extractRecipeFilesSchema`) | idem, `feature = 'extract'` | même réponse que `translate-recipe` ; 422 si aucune recette lisible |
| `POST /api/transcribe-recipe` | 🔑 | `multipart/form-data` : `audio` (WebM/MP4/Ogg/WAV/MP3, 4 Mo, 5 min), `durationSeconds?` (`transcribeAudioSchema`) | idem, `feature = 'transcribe'` | `{ success, text, usage: { provider, model, audioSeconds, estimatedCostUsd, durationMs } }` |
| `POST /api/recipes/similar` | 🔑 | `{ title, ingredientNames?, excludeId? }` (`similarRecipesBodySchema`) | lecture seule de `recipes` et `recipe_ingredients` (pas d'IA, pas de quota) | `{ similar: [{ id, title, score, titleScore, ingredientScore, reason }] }`, 3 au plus (voir § 12, doublons) |
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
| `POST /api/shopping-lists/:id/recipes` | 👤 | `{ recipeId, sectionIds?, servingsFactor?, locale? }` | `add_recipe_to_list` | `{ success, items, message }` |
| `POST /api/shopping-items` | 👤 | `{ listId, name, amount?, unit?, recipeId? }` | `parse_amount`, `normalize_unit`, `merge_shopping_item` | `{ success, item, message }` |
| `PUT /api/shopping-items/:id` | 👤 | `{ name?, amount?, unit?, isChecked? }` | update (triggers `amount_num` / `unit_code`, 404) | `{ success, item, message }` |
| `DELETE /api/shopping-items/:id` | 👤 | — | delete (404) | `{ success, message }` |
| `POST /api/account/delete` | 👤 | `{ confirmEmail }` = l'e-mail du compte (`deleteAccountInputSchema`) | `account_deletion_blockers` (409 + `data.blockers` si un groupe créé a d'autres membres), clé `service_role` : `prepare_account_deletion`, `auth.admin.deleteUser`, nettoyage des photos (voir § 20.8) | `{ success, message, deletedGroups, removedPhotos }` |

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
  message SQL, `P0002` → 404, `42501` → 403, `23505` → 409. Les RPC sociales appelées directement par le
  navigateur (§ 20.8) lèvent aussi `54000` (limite de débit) et `55000` (groupe à transférer).
- Tout le reste → `500` « Une erreur est survenue, réessayez plus tard. ». Le détail est
  écrit dans les journaux serveur (`[api] <contexte>`), jamais renvoyé au client.
- Côté client, les stores lèvent une `ApiError` (`apiErrorFromResponse`) ; `toUserMessage`
  (`app/composables/useApiError.ts`) affiche le message du serveur pour une 4xx et
  `errors.generic` (i18n) sinon.

## 8. Design

Tokens dans `app/assets/css/main.css` (`@theme static` : polices), `app/app.config.ts` et,
pour tout ce qui change d'une édition à l'autre (couleurs, nom, images), dans la
configuration d'édition `shared/editions/*.ts` (voir § 9).

- **Couleurs** : uniquement les utilitaires sémantiques de Nuxt UI (`bg-default`,
  `bg-muted`, `bg-elevated`, `text-highlighted`, `text-muted`, `border-default`,
  `text-primary`, `text-error`…). Aucun hex ni `gray-*` dans les composants : le mode sombre
  suit seul. Exceptions : le logo Google (`public/images/google.svg`), la feuille
  d'impression dans `main.css`, et le fond `bg-white` des cadres d'illustrations
  (PNG transparents dessinés pour un fond blanc, clairs dans les deux modes).
- **Palette** : définie par l'édition et injectée par `plugins/edition.ts` (pas dans
  `main.css`). Boultons : bleu-vert d'origine (500 = `#64b9c3`) + neutre `slate`,
  `--ui-primary` = 800 en clair, 400 en sombre. Générique : terracotta (500 = `#c2603e`)
  + neutre `stone`, `--ui-primary` = 600 en clair, 400 en sombre. Contrastes AA vérifiés
  par `test/unit/editions.test.ts`. Nuances brutes : `var(--ui-color-primary-700)` ou
  `bg-(--ui-color-primary-700)` (les utilitaires `bg-primary-700` n'existent pas : la
  palette n'est plus dans `@theme`).
- **Typographie** : Inter (`font-sans`, interface), Fraunces (`font-serif`, titres de pages
  et de recettes), Lobster (`font-lobster`, logo et titre du héros Boultons), servies par
  `@nuxt/fonts`.
- **Surfaces** : bordures fines plutôt qu'ombres ; `rounded-lg`, `rounded-xl` pour cartes
  et modales.
- **Composants** : Nuxt UI (`UButton`, `UModal`, `UForm` + Zod, `USelectMenu`…), icônes
  `i-lucide-*`. Un bouton icône a toujours un `aria-label`. Confirmations en `UModal`.
- **Toasts** : `useToast()` ; la façade `$toast` (`plugins/toast.client.ts`) garde l'ancienne
  API `$toast.success(title, message?)`.
- **Layout** : header compact (navigation, mode sombre, langue, menu utilisateur) ; sur
  mobile, barre d'onglets en bas (Recettes, Planning, Courses, Favoris, Moi) ; `<main>` en
  `w-full min-w-0 overflow-x-clip` (aucun défilement horizontal à 375 px, même avec le
  héros pleine largeur `mx-[calc(50%-50vw)]`).
- **Accessibilité** : focus visible, navigation au clavier, `aria-current="page"`,
  `prefers-reduced-motion` respecté.
- **i18n** : stratégie `prefix_except_default` (FR sans préfixe, EN sous `/en`). Aucun texte
  visible en dur ; liens via `localePath()`. `test/unit/i18n.test.ts` vérifie la parité des
  clés fr/en, l'absence de valeur vide, les paramètres `{…}` et l'existence des clés
  utilisées dans `app/`.
- **Catégories** : `useCategories()` fournit libellés, icône Lucide et `visual` (illustration
  PNG si l'édition en fournit, sinon icône) ; `categoryVisual(id)` sert de repli quand une
  recette n'a pas de photo (carte, fiche, modale du planning). La photo reste prioritaire.
- **Cartes recette** (`RecipeCard` dans `RecipeGrid`) : `h-full flex flex-col`, titre et
  description sur 2 lignes (`line-clamp-2`), tags puis pied de carte poussé en bas
  (`mt-auto`) : dans une rangée, toutes les cartes ont la hauteur de la plus haute et leurs
  pieds sont alignés ; d'une rangée à l'autre, la hauteur suit le contenu réel. Zone
  visuelle décidée pour toute la grille par `RecipeGrid` selon
  `edition.recipeCards.visual` : `fixed` (Boultons) = toujours `aspect-[4/3]` ;
  `adaptive` (générique) = `aspect-[4/3]` si au moins une recette de la grille (la page) a
  une photo, sinon zone basse `h-20 md:h-24` avec icône `size-8` pour toutes les cartes.
  Même logique pour les vignettes de `CategoryGrid` : illustration = cadre `aspect-[4/3]`,
  icône seule = zone basse.
- **Création de recette** (admin, `/recettes`) : menu « Nouvelle recette » → « Saisir une
  recette » (éditeur) ou « Importer avec l'IA » (`/traducteur`).

## 9. Éditions (Boultons / générique)

Le même code sert deux « éditions » du site :

| | `boultons` (défaut) | `generic` |
|---|---|---|
| Rôle | identité d'origine de « Recettes des Boultons » | design modernisé, base de la v2 multi-comptes |
| Nom | Recettes des Boultons (Lobster `#7b88bd`) | Family Cookbook, `shared/brand.ts` (Lobster `primary`) |
| Couleurs | bleu-vert d'origine + `slate` | terracotta + `stone` |
| Accueil | `HomeBoultons` : héros diagonal pleine largeur sur toute la hauteur visible sous l'en-tête (`100svh`), `boultons.png`, bouton et pastille animée (`animate-bounce`, collante sur petits écrans, coupée si mouvements réduits) qui défilent vers les catégories, grille d'illustrations 3 × 3, fonctionnalités | `HomeGeneric` : héros typographique, catégories en icônes |
| Sans photo | illustration de la catégorie (cadre blanc) | icône Lucide |
| Cartes | zone visuelle toujours `aspect-[4/3]` | zone basse si aucune photo dans la grille (§ 8) |

**Choisir l'édition** : `NUXT_PUBLIC_EDITION=boultons|generic` → `runtimeConfig.public.edition`
(défaut `boultons` ; valeur inconnue = `boultons`). La variable est lue à l'exécution pour
tout le rendu (pas besoin de rebuild), sauf le `<title>` par défaut de
`nuxt.config.ts`, figé avec l'édition présente **au build** (même variable). Le manifeste PWA est une
route serveur lue à l'exécution (§ 20.18). En local :

```bash
npm run dev:local                                                        # Boultons
NUXT_PUBLIC_EDITION=generic npx nuxt dev --dotenv .env.local --port 3002 # générique
```

(Deux `nuxt dev` dans le même dossier partagent `.nuxt/` : les lancer l'un après l'autre.)

**Où vit la configuration** : `shared/editions/` — `types.ts` (`EditionConfig`), une
configuration par fichier (`boultons.ts`, `generic.ts`), `index.ts` (registre `EDITIONS`,
`DEFAULT_EDITION`, `getEdition()`, `resolveEditionId()`, `localize()`), `theme.ts`
(`editionThemeCss()`). Une configuration contient : marque (nom, nom court, accroche,
description de l'accueil en fr/en, logo, couleur du nom), thème (palette `primary`
50 → 950 en hex, neutre Tailwind, nuances de `--ui-primary` en clair/sombre,
`theme-color`, fond du manifeste), accueil (variante, illustration du héros),
illustrations par catégorie (ou `null`), règle des cartes. Les composants ne testent pas
l'identifiant : ils lisent `useEdition().config`.

**`useEdition()`** (`app/composables/useEdition.ts`) : `edition`, `isBoultons`,
`isGeneric`, `config`, `siteName` et `tagline` (calculés dans la langue courante),
`text(localizedText)`. Utilisable dans un composant comme dans un plugin.

**Thème sans flash** : `plugins/edition.ts` ajoute au `<head>`, dès le rendu serveur,
`<html data-edition="…">`, une feuille `<style id="edition-theme">` et les deux
`<meta name="theme-color">`. La feuille (générée par `editionThemeCss()`) déclare sous
`:root[data-edition="…"]` (spécificité 0-2-0, hors `@layer`) : `--color-primary-50…950`
(lues par Nuxt UI via `--ui-color-primary-*`), `--ui-color-neutral-*` (remplace le neutre
`stone` d'`app.config.ts`, déclaré par Nuxt UI dans `@layer theme`) et `--ui-primary`
(+ variante `.dark`). Le mode sombre (classe `dark` posée par color-mode avant le premier
rendu) et l'édition sont donc tous deux dans le HTML initial.

**Textes de marque** : le nom du site, l'accroche et les descriptions viennent de la
configuration (pas d'i18n) : en v2 ils seront fournis par le groupe. Les libellés d'interface
restent dans `i18n/locales/*.json` (ex. `footer.copyright` reçoit `{site}`).

**Images** : `public/images/categories/*.png` (illustrations d'origine, renommées),
`public/images/boultons.png` (héros), toutes servies par `NuxtImg` (WebP, tailles
`width`/`densities` adaptées).

**Icônes de l'onglet** : `brand.icons` (SVG facultatif, PNG 32 et 48, raccourci iOS 180)
posées par `plugins/edition.ts`. Boultons : cocotte d'origine générée depuis
`public/images/logo.png` dans `public/editions/boultons/` ; générique : toque terracotta.
Les icônes du manifeste PWA (écran d'accueil Android : `brand.icons.pwa`, dont une version
« maskable ») sont servies par la route `/manifest.webmanifest` (§ 20.18) : édition en v1, thème actif en v2. Régénérer les icônes Boultons après un changement
de logo : `npm run icons:boultons` (`scripts/generate-edition-icons.mjs`).

**Ajouter une édition** : 1) ajouter l'identifiant à `EDITION_IDS` (`types.ts`) ; 2) créer
`shared/editions/<id>.ts` (`EditionConfig` complète : TypeScript signale tout oubli) ;
3) l'enregistrer dans `EDITIONS` (`index.ts`) ; 4) déposer ses images dans `public/` ;
5) si elle a un accueil propre, ajouter la variante à `EditionHome['variant']`, le
composant `components/home/Home<Variante>.vue` et le choix dans `pages/index.vue` ;
6) `npm test` vérifie textes fr/en, palette, présence des images et contrastes AA.

**Vers la v2** : la forme d'`EditionConfig` est celle d'une configuration de groupe/foyer.
Restera à la charger par requête (groupe de l'utilisateur ou domaine) au lieu de
`runtimeConfig`, à stocker palette/nom/images en base et Storage, à valider une palette
fournie avec `contrastRatio()` (`shared/utils/color.ts`) avant de l'accepter, et à générer
manifeste et icônes PWA par groupe.

## 10. Fiche recette, éditeur et photos

### 10.1 Fiche (`app/pages/recettes/[id].vue`)

| Composant | Rôle |
|---|---|
| `RecipeHero` | catégorie, tags, titre, description, temps, compteur de portions (`RecipeServingsControl`) ; pas d'image sur la fiche (photos et illustrations restent sur les cartes, l'éditeur et l'accueil) |
| `RecipeIngredients` | ingrédients par section, cases à cocher (état local), quantités mises à l'échelle |
| `RecipeSteps` | étapes numérotées par section |
| `RecipeActions` | favori, courses, planning (`PlanningModal`), mode cuisine, impression, modifier / supprimer (admin) |
| `RecipeAddToShoppingModal` | choix de la liste et des sections → `useShoppingStore().addRecipeToList(…)` |
| `RecipeCookingMode` | plein écran, une étape à la fois, ←/→/Échap, Wake Lock, minuteurs d'étapes |
| `RecipeCookingTimers` | pile flottante des minuteurs (pause, +1 min, annuler, arrêter l'alarme) |

- `useServingsScaler(recipe)` : portions cibles, `factor`, `scaledAmount()`. Calculs dans
  `shared/utils/recipes.ts` (`servingsFactor`, `roundReadable` : fractions ½ ¼ ¾ ⅓ ⅔ sous 10,
  une décimale jusqu'à 100, entier au-delà). Le facteur est transmis à `add_recipe_to_list`.
- `useCookingMode(recipe)` : étapes à plat, section d'ingrédients associée,
  `navigator.wakeLock` (silencieux si refusé ou non supporté).
- Minuteurs du mode cuisine : `parseDurations` (`shared/utils/duration.ts`, FR/EN, fourchettes
  → borne basse, températures et quantités ignorées) lit les durées d'une étape. Passer à
  l'étape suivante lance le minuteur de la **première** durée de l'étape quittée (une fois par
  étape) ; un bouton « Lancer le minuteur » propose chaque durée (elles s'enchaînent, on ne les
  lance pas en parallèle). `useCookingTimers` : dates de fin absolues (robuste à l'arrière-plan),
  une clé par étape+durée (pas de doublon), alarme `createCookingAlarm` (bips Web Audio en
  boucle + vibration, audio débloqué par un geste : sur iOS Safari sans geste préalable
  l'alarme reste silencieuse), notification système seulement si la permission est déjà
  accordée et l'app en arrière-plan. Quitter le mode avec des minuteurs demande confirmation
  (Échap annule la confirmation). Tests : `test/unit/duration.test.ts`,
  `useCookingTimers.test.ts`, `e2e/cooking-timers.spec.ts`.
- Impression : `@media print` de `main.css`, limitée à la fiche (`body:has(#recipe-sheet)`).

### 10.2 Éditeur (`RecipeEditor.vue` → `components/editor/`)

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

### 10.3 Photos (`useRecipePhoto`, bucket `recipe-photos`)

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
  provider `supabase` de `@nuxt/image` n'est pas utilisé. Cartes et planning chargent
  l'image en différé ; la fiche recette n'affiche plus de photo.

## 11. Planning et listes de courses

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

## 12. Traducteur IA

Page `/traducteur` (admins) : texte collé, fichier (PDF, photo, texte) ou dictée → recette
structurée **dans les deux langues** (l'IA détecte la langue d'origine et fournit la traduction
vers l'autre, en un seul appel ; plus de langue cible à choisir) → aperçu (langue de
l'interface d'abord, bouton pour voir l'autre version) → ajout par `POST /api/add-recipe`, qui
enregistre les deux. Voir § 19. Comparatif des modèles et coûts :
[docs/IA_MODELES.md](docs/IA_MODELES.md).

| Fichier | Rôle |
|---|---|
| `shared/schemas/ai.ts` | `translateRecipeBodySchema`, `aiRecipeSchema` (unité parmi les 37 codes, catégorie parmi 9, `sourceLanguage`, `translation`), `aiRecipeToRecipeInput`, `aiRecipeToBilingual` (recette + traduction alignées) |
| `shared/schemas/translation.ts`, `shared/utils/translation.ts` | schémas Zod des traductions, textes traduisibles, empreinte, affichage par langue (§ 19) |
| `server/utils/translations.ts` | traduction d'une recette enregistrée (création, édition) (§ 19) |
| `server/utils/ai/provider.ts` | `getAiConfig()` (variables `AI_*`, clés), `getModel()` |
| `server/utils/ai/translate.ts` | `generateObject` : `translateRecipeText` (`aiRecipeSchema`, recette bilingue) et `translateRecipeTexts` (`aiTranslateExistingSchema`, recette existante), délai 25 s, 1 nouvel essai |
| `server/utils/ai/prompt.ts` | prompt système en français |
| `server/utils/ai/errors.ts` | erreurs du fournisseur → 401, 402, 422, 502, 504, messages sans détail technique |
| `server/utils/ai/usage.ts` | quota (`check_ai_quota`, 429) et journal `ai_usage` |
| `server/utils/ai/pricing.ts` | grille de prix datée, coût estimé |
| `server/utils/ai/mock.ts` | fournisseur `mock` : recette fixe, dictée fixe, traduction préfixée « [EN] » / « [FR] », aucun appel réseau |
| `server/utils/ai/media.ts` | `transcribeAudio` (dictée) et `extractRecipeFromFiles` (photo / PDF) |
| `server/utils/ai/upload.ts` | lecture des envois multipart (413 sur `Content-Length`) |
| `server/utils/ai/recipe-response.ts` | `AiRecipe` → `RecipeInput` et réponse commune aux endpoints |
| `shared/schemas/media.ts` | limites, classement des fichiers, lecture de l'en-tête des octets, schémas Zod des envois |
| `app/composables/useTranslator.ts`, `RecipeTranslator.vue`, `translator/RecipePreview.vue` | interface |
| `app/composables/useAudioRecorder.ts`, `translator/AudioRecorder.vue`, `translator/FileDrop.vue`, `app/utils/image.ts` | dictaphone, dépôt de fichiers, réduction des photos |
| `app/composables/useGoogleDrivePicker.ts`, `translator/DriveButton.vue` | import depuis Google Drive (voir plus bas) |
| `shared/utils/similarRecipes.ts`, `shared/schemas/similar.ts`, `server/utils/similarRecipes.ts`, `server/api/recipes/similar.post.ts` | détection des recettes déjà existantes (voir « Détection des doublons ») |

- Fournisseur : `AI_PROVIDER` = `openai` (défaut, `gpt-4.1-mini`), `anthropic`, `google`,
  `mistral` ou `mock`. Changer de fournisseur = changer la variable et la clé, sans code.
- Quota : `AI_DAILY_QUOTA` appels par personne et par jour (défaut 50, admins compris ; la traduction des
  ~181 recettes existantes en demande autant : voir § 19) ;
  `0` désactive le traducteur. Si `check_ai_quota` est indisponible, l'appel passe (le quota
  est un garde-fou, la barrière reste `requireAdmin`).
- Sorties structurées strictes : pas de champ optionnel ni de longueur dans `aiRecipeSchema` ;
  le résultat converti est revalidé par `recipeInputSchema`.
- Ouvrir à tous : remplacer `requireAdmin` par `requireUser` dans les trois endpoints
  (`translate-recipe`, `extract-recipe`, `transcribe-recipe`) et retirer `requiresAdmin` de la page.

### Fichiers et dictée (phase 5)

- **Fichier** (`FileDrop.vue`, glisser-déposer ou sélecteur ; `accept="image/*"` fait proposer
  l'appareil photo sur mobile). `useTranslator().addFiles` trie : un `.txt` / `.md` est lu dans
  le navigateur et ajouté à la zone de texte (aucun appel serveur) ; un **Word `.docx`** aussi
  (voir « Word » ci-dessous) ; une photo ou un PDF est
  retenu (4 au plus) et `translate()` appelle alors `POST /api/extract-recipe` à la place du
  texte. Les types non pris en charge sont refusés avec un message.
- **Word `.docx`** (`app/utils/docx.ts`) : texte extrait **dans le navigateur**, sans serveur ni
  coût IA, puis ajouté à la zone de saisie pour relecture (comme un `.txt`). Un `.docx` est un
  ZIP : `fflate` (chunk à part de ≈ 3 Ko gzip, `dependencies`, chargé par `import()` au premier `.docx`) lit
  `word/document.xml`, que le `DOMParser` du navigateur parcourt (`w:p` = une ligne ; puces et
  numéros = `- ` ; `w:tab`, `w:br`, cellules de tableau). Ignorés : images, en-têtes/pieds,
  notes, texte supprimé en suivi de modifications, doublons des zones de texte. `mammoth` a été
  écarté (bien plus lourd avec jszip et bluebird, conçu pour produire du HTML alors qu'on veut du texte brut). Reconnu par type MIME
  **ou** extension (`classifyRecipeFile`) ; mêmes 10 Mo. Erreurs traduites : document abîmé
  (`docxCorrupt`), sans texte (`docxEmpty`) ; l'ancien `.doc` (`isLegacyWordFile`) est refusé
  avec le conseil « enregistrer en .docx ou PDF » (`legacyDoc`). Le XML décompressé est limité
  à 50 Mo (archive piégée). Tests : `test/unit/docx.test.ts` (fixture
  `test/fixtures/gateau-yaourt.docx`, générée avec python-docx).
- **Limites** (`shared/schemas/media.ts`, contrôlées côté client et côté serveur) : 10 Mo par
  fichier source ; **4 Mo par requête** (Vercel refuse tout corps de plus de 4,5 Mo avant la
  fonction) ; 4 fichiers ; dictée 5 min et 4 Mo. Les photos sont donc redessinées dans le
  navigateur (JPEG, 2 000 px, ≈ 900 Ko) avant l'envoi ; un PDF de plus de 4 Mo est refusé
  (« choisissez un PDF plus léger »). Le serveur reconnaît le format à l'en-tête des octets
  (jamais au type annoncé) : JPEG, PNG, WebP, PDF ; WebM, MP4/M4A, Ogg, WAV, MP3.
- **Dictée** (`AudioRecorder.vue`, `useAudioRecorder.ts`) : MediaRecorder, `audio/webm` (Chrome,
  Android) ou `audio/mp4` (Safari, iOS), 32 kbit/s, arrêt automatique à 5 min, micro relâché
  à l'arrêt. L'audio part à `POST /api/transcribe-recipe` ; le texte s'ajoute à la zone de
  saisie pour relecture, puis « Structurer la recette » suit le parcours habituel. Erreurs
  traduites : micro refusé, absent, navigateur non compatible (ou page hors HTTPS).
- **Modèles** : photo / PDF → `AI_MODEL` (défaut `gpt-4.1-mini`, images et PDF natifs ; PDF aussi
  chez Anthropic et Google). Dictée → `AI_TRANSCRIBE_MODEL` (défaut `gpt-4o-mini-transcribe`,
  OpenAI uniquement : `AI_PROVIDER=openai` et `OPENAI_API_KEY` requis, sinon 401 « service IA non
  configuré »). Aucun nouveau paramètre à définir sur Vercel pour les valeurs par défaut.
- **Quota et coûts** : les trois endpoints partagent `check_ai_quota` (un appel = une unité) et
  écrivent dans `ai_usage` (`feature` = `translate`, `extract`, `transcribe`). Photo / PDF : coût
  aux tokens (≈ 1 000–1 500 tokens par image, soit ≈ 0,001 $ avec gpt-4.1-mini). Dictée : coût
  à la minute d'audio (`TRANSCRIPTION_PRICING_PER_MINUTE`, 0,003 $/min ; durée donnée par le
  fournisseur, sinon par le navigateur). Aucune migration : `ai_usage.feature` est un texte libre.
- **Mock** (`AI_PROVIDER=mock`) : une photo ou un PDF renvoie toujours la recette « Cookies aux
  pépites de chocolat » ; la dictée renvoie toujours `MOCK_TRANSCRIPT` (une recette dictée en
  français), le modèle de transcription journalisé est `mock-transcribe`. Aucun appel réseau.
  **Traductions simulées** : la langue d'origine est devinée par `detectLanguage` (mots courants,
  français par défaut) et chaque texte de la traduction est préfixé de « [EN] » (source française) ou
  « [FR] » (source anglaise) : déterministe, reconnaissable dans les tests. Un texte contenant
  `__MOCK_AI_FAILURE__` (`MOCK_FAILURE_MARKER`) fait échouer la traduction d'une recette existante
  (panne simulée : enregistrement réussi, traduction périmée).
- Tests : `test/unit/schemas/media.test.ts`, `test/unit/ai/media.test.ts`, `audioRecorder.test.ts`,
  `image.test.ts` ; `test/integration/media-recipe.local.test.ts` (serveur mock) ;
  `e2e/translator-media.spec.ts` (dépôt, photo, PDF, dictée avec micro simulé par WebAudio),
  `e2e/translator-drive.spec.ts` (import Google Drive, scripts Google simulés, dont un `.docx`).
  Les tests e2e et d'intégration consomment le quota du jour : `AI_DAILY_QUOTA=1000` en local.

### Détection des doublons

Quand l'aperçu est prêt (texte, fichier, photo, PDF, dictée, Google Drive : tout finit dans le
même aperçu), `useTranslator().findSimilar()` appelle `POST /api/recipes/similar` avec le titre
et les noms d'ingrédients de l'aperçu. S'il existe des recettes proches (3 au plus, la plus
proche d'abord), `translator/RecipePreview.vue` affiche « Cette recette semble déjà exister : »
suivi de leurs titres (liens vers la fiche, nouvel onglet) et le bouton d'ajout devient
« Créer quand même ». Rien de proche : aucun avertissement. Ce n'est qu'un avertissement : une
panne de la vérification n'empêche jamais l'ajout. Aucune migration, aucun appel IA, pas de quota.

- **Chargement** (`server/utils/similarRecipes.ts`) : `id` + `title` de toutes les recettes et
  `recipe_id` + `name` de tous les ingrédients, en lectures paginées (limite PostgREST de
  1 000 lignes). `search_recipes` n'est pas utilisée : sa recherche plein texte exige tous les
  mots et ne tolère ni faute de frappe ni mot en plus. Le coût (quelques dizaines de Ko) est
  négligeable pour un livre familial ; à revoir si la base dépasse quelques milliers de recettes.
- **Notation** (`shared/utils/similarRecipes.ts`, fonctions pures, `SIMILARITY` en tête de fichier) :
  - **Titre** : minuscules, sans accents ni ponctuation, `œ` → `oe`, mots vides retirés (de, du,
    la, le, aux, au, à, et, the, of… ; « à la » disparaît), pluriels ramenés au singulier, mots
    triés. Score = 1 si les titres normalisés sont identiques, sinon le meilleur du coefficient
    de Dice sur les mots (un mot en plus ou en moins) et de la proximité des lettres (faute de
    frappe : « Tiramissu »). Retenu si **≥ 0,8**.
  - **Ingrédients** (retrouve une recette renommée, ex. « Gâteau aux carottes » / « Carrot cake »,
    quand les ingrédients sont dans la même langue) : chaque nom est réduit à ses mots
    significatifs (« beurre doux, ramolli » → `beurre`), puis Jaccard **pondéré** : un ingrédient
    présent dans presque toutes les recettes (farine, sucre, sel) pèse peu, un ingrédient rare
    pèse beaucoup (poids = ln((N+1)/(df+1)) + 1, df calculé sur la base). Ignoré si l'une des
    deux recettes a moins de 4 ingrédients ou si moins de 3 sont communs. Retenu si **≥ 0,7**.
  - **Signal combiné** : titre ≥ 0,55 **et** ingrédients ≥ 0,4 (variantes d'une même recette).
  - Titres FR / EN non traduits : « Carrot cake » ne ressemble pas à « Gâteau aux carottes » par
    le titre, seulement par les ingrédients.
- **Réglage des seuils** : calibrés sur le snapshot local (181 recettes) en comparant chaque
  recette aux autres. Avec 0,55 pour les ingrédients, des recettes sans rapport (Lasagnes /
  Ratatouille, tomates et oignons communs) ressortaient ; à 0,7 il ne reste que de vraies
  variantes, plus un vrai doublon de la base (« Gâteau de patate douce et gingembre »,
  présent deux fois). Pour changer la sensibilité, modifier `SIMILARITY` et rejouer
  `test/unit/similarRecipes.test.ts`.
- **Tests** : `test/unit/similarRecipes.test.ts` (titre à accents / casse / ponctuation près,
  titre proche, autre titre mais mêmes ingrédients, recette sans rapport, plafond de 3),
  `test/integration/similar-recipes.local.test.ts` (endpoint contre la base locale : 401, 403, 400,
  titre, ingrédients, exclusion), `e2e/translator-similar.spec.ts` (avertissement avec lien,
  « Créer quand même », rien d'affiché sans similaire). `e2e/translator-media.spec.ts` attend le
  bouton « Ajouter aux recettes » : il suppose qu'aucune recette de la base ne ressemble à la
  recette simulée (« Cookies aux pépites de chocolat »).

### Import depuis Google Drive

Bouton « Importer depuis Google Drive » à côté de la zone de dépôt (`translator/DriveButton.vue`,
logique dans `app/composables/useGoogleDrivePicker.ts`). **Tout se passe dans le navigateur** : pas
d'endpoint, pas de stockage, aucun jeton côté serveur ni dans `localStorage` (le jeton d'accès vit
dans une variable du module, en mémoire). Indépendant de la connexion Google de Supabase, qui ne
fait qu'authentifier.

- **Parcours** : clic → chargement paresseux de `accounts.google.com/gsi/client` (Google Identity
  Services) et `apis.google.com/js/api.js` (gapi + Picker) → jeton OAuth de portée **`drive.file`**
  (`initTokenClient`, `requestAccessToken({ prompt: '' })`, fenêtre pop-up de Google) → Google
  Picker (liste, filtré sur PDF, JPG/PNG/WebP/HEIC, texte/Markdown, Word `.docx` et Google Docs) → téléchargement
  par l'API Drive en `fetch` (`files.get?alt=media`, ou `files.export?mimeType=text/plain` pour un
  Google Docs) → un `File` remis à `useTranslator().addFiles`, c'est-à-dire **le flux « fichier »
  existant** : texte et `.docx` (téléchargé tel quel, texte extrait dans le navigateur) → zone de saisie, photo (réduite) / PDF → `/api/extract-recipe`. Mêmes types
  et mêmes limites (10 Mo, `shared/schemas/media.ts`).
- **Portée `drive.file`** : seuls les fichiers choisis dans le Picker deviennent lisibles par
  l'appli (jamais le reste du Drive). Portée « non sensible » : pas de vérification renforcée de
  Google. Les Google Sheets, Slides et dossiers sont refusés (« format non pris en charge »).
- **Configuration** (3 variables publiques, aucun secret ; `runtimeConfig.public.google`) :
  `NUXT_PUBLIC_GOOGLE_CLIENT_ID`, `NUXT_PUBLIC_GOOGLE_API_KEY`, `NUXT_PUBLIC_GOOGLE_APP_ID`
  (numéro du projet Google Cloud). **Une seule manquante = bouton masqué** (c'est le cas en
  local par défaut). Nuxt convertit un `APP_ID` numérique en nombre : le code le remet en texte.
  Pas à pas côté Google : [docs/GOOGLE_DRIVE_SETUP.md](docs/GOOGLE_DRIVE_SETUP.md).
- **En-têtes de sécurité** : depuis la relecture n° 3, `routeRules` pose `frame-ancestors 'none'`, `nosniff`, etc.
  (§ 20.16), mais pas de CSP complète. Si elle est ajoutée un jour, autoriser : `script-src`
  `https://accounts.google.com https://apis.google.com` ; `frame-src` `https://accounts.google.com
  https://docs.google.com https://content.googleapis.com` ; `connect-src`
  `https://www.googleapis.com https://accounts.google.com` ; `img-src` `https://*.googleusercontent.com`
  `https://*.gstatic.com`. Ne pas ajouter `Cross-Origin-Opener-Policy: same-origin` (il casse la
  pop-up de connexion Google ; `same-origin-allow-popups` convient). Le service worker (PWA)
  n'intercepte pas ces requêtes inter-origines.
- **Erreurs** (toutes traduites, `translator.drive.errors.*`) : scripts injoignables (réseau,
  bloqueur de publicités), pop-up bloquée, accès refusé, format non pris en charge, fichier trop
  gros (annoncé par le Picker, ou export Docs > 10 Mo), fichier vide, réseau coupé. Fermer la
  pop-up ou le Picker n'est pas une erreur.
- **Tester sans Google** : `test/unit/useGoogleDrivePicker.test.ts` simule `google.accounts.oauth2`,
  `google.picker`, `gapi`, le DOM et `fetch` ; `useGoogleDrivePicker.nuxt.test.ts` vérifie le
  bouton masqué sans config. `e2e/translator-drive.spec.ts` remplace les deux scripts Google et
  l'API Drive par des doublures (`page.route`) ; `playwright.config.ts` démarre son serveur avec
  trois valeurs factices (un serveur déjà lancé sans elles : les parcours sont ignorés).
- **Tester pour de vrai** (une fois la config faite) : lancer
  `NUXT_PUBLIC_GOOGLE_CLIENT_ID=… NUXT_PUBLIC_GOOGLE_API_KEY=… NUXT_PUBLIC_GOOGLE_APP_ID=… npm run dev:local`
  (ou les mettre dans `.env.local`), ouvrir `/traducteur` avec `admin@local.test`. L'origine
  `http://localhost:3001` doit être autorisée dans le client OAuth, et le compte Google utilisé
  doit être « utilisateur test » tant que l'écran de consentement est en mode Test.

## 13. Observabilité (Sentry)

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
- Erreurs serveur : dans `server/utils/errors.ts`, les branches 500 de `handleApiError` et
  `throwSupabaseError` appellent `Sentry.captureException(error, { tags: { api: context } })`
  puis lèvent le 500 générique avec `cause: error` ; un 500 déjà produit n'est pas recapturé
  (pas de doublon). Sans DSN, `captureException` ne fait rien.
- En local, un `.env.local` contenant `NUXT_PUBLIC_SENTRY_DSN` envoie les erreurs avec
  `environment=development` ; laisser la variable vide pour ne rien envoyer.
- Tester l'envoi côté navigateur (`$sentry` n'est pas exposé) :
  `window.__SENTRY__[window.__SENTRY__.version].defaultCurrentScope.captureException(new Error('test'))`.
- Vie privée : Sentry déduit une localisation de l'adresse IP ; pour l'éviter, activer
  *Prevent Storing of IP Addresses* dans les réglages du projet Sentry.

## 14. PWA et hors ligne

- Manifeste au nom de l'édition de build (Boultons : « Recettes des Boultons », `short_name`
  Boultons ; voir § 9), icônes `public/pwa-192x192.png`,
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

## 15. Tests et CI

### 15.1 Vitest

- `npm test` : `test/**/*.{test,spec}.ts`, environnement `happy-dom` (ajouter
  `// @vitest-environment nuxt` pour un test qui a besoin de l'app).
- `test/unit/` : schémas Zod, mise à l'échelle, utilitaires courses et semaines, i18n,
  erreurs, IA (mock, erreurs, prix, médias : photo / dictée), courses hors ligne, éditions (`editions.test.ts` :
  configurations, images, contrastes AA ; `useEdition.test.ts`).
- `test/integration/*.local.test.ts` : contre la base locale (`.env.local`) ; sautés si
  elle n'est pas joignable. `translate-recipe.local.test.ts`, `media-recipe.local.test.ts`, `similar-recipes.local.test.ts` et `bilingual.local.test.ts` demandent aussi un serveur Nuxt
  avec `AI_PROVIDER=mock` (`APP_URL`, défaut `http://localhost:3001`). Les fichiers de test
  tournent **en série** (`fileParallelism: false` dans `vitest.config.ts`) : ils partagent la base,
  les comptes et comptent des lignes `ai_usage` par fonctionnalité.
- `npm run test:coverage` : rapport dans `coverage/`, sans seuil bloquant.

### 15.2 Playwright

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
  courses hors ligne, recettes bilingues (`bilingual.spec.ts`), traducteur (`translator-media.spec.ts` : fichier texte, photo, PDF, dictée ; `translator-similar.spec.ts` : doublons), Échap sur les modales (`escape-modals.spec.ts`), édition (`edition.spec.ts` : `data-edition`, thème, illustrations,
  cartes de même hauteur). Les tests suivent `NUXT_PUBLIC_EDITION` (défaut `boultons`,
  comme la CI) ; pour l'édition générique, lancer serveur ET tests avec
  `NUXT_PUBLIC_EDITION=generic`.

### 15.3 CI (`.github/workflows/ci.yml`)

- Job `ci` : `npm ci`, lint, typecheck, test, build (variables Supabase factices).
- Job `e2e` (après `ci`) : `supabase start` sans les services inutiles,
  `scripts/ci-seed.sh`, `scripts/ci-env-local.sh` (écrit `.env.local` avec `AI_PROVIDER=mock`),
  build Node, `npm run test:e2e`, rapport Playwright en artefact en cas d'échec.

### 15.4 Tests SQL

- `npm run db:local:test` : base vide, `seed_test.sql`, 0003 → 0012, rejeu, tests
  `test_0003` → `test_0010`, puis 0013 → 0016, rejeu, tests `test_0013` → `test_0016`.
  Il vide la base `postgres` : relancer `npm run db:local:reset` ensuite.
- `SUPABASE_TEST_DATABASE=ci_test npm run db:local:test` : même suite sur une base séparée
  `ci_test` de la stack ; la base `postgres` et ses données restent intactes (pg_dump 17
  requis).
- `supabase/tests/run_local.sh` : variante sans Docker, sur un Postgres 17 temporaire. Elle teste
  aussi 0017 et 0019 (rejeu, « up, down, up »), puis joue le remplissage RÉEL `supabase/v2/0018_…`
  (jeu de données `fixtures_0018.sql` : 3 comptes dont 2 admins, recettes avec catégorie, favoris ; refus
  vérifiés : paramètres manquants, ambigus, inconnus ; rejeu sans doublon ; `test_0018_v2_data_fill.sql`),
  applique la bascule `supabase/v2/0020_…` sur ces données, la teste (`switchover_0020_rls.sql`,
  `switchover_0018_filled.sql` : chaque membre voit et modifie les recettes Boultons, un compte neuf ne voit
  rien) et vérifie que ses retours arrière rétablissent les politiques (empreinte md5) et les données
  (`tests.data_fp()`) à l'identique : « up, down, up » de 0018 et de 0020. `npm run db:local:test` (Docker)
  ne joue ni le remplissage ni la bascule.
  0021 : `test_0021_v1_compat.sql` (0021 SEULE, avant le remplissage : la v1 n'est pas cassée), puis
  `test_0021_recipe_rpcs.sql` sous la chaîne complète 0019 → 0021 → 0018 → 0020 (pour chaque fonction : le « oui », et
  le « non » pour un étranger, un membre de groupe et une amie), et « up, down, up » de 0021 (`save_recipe` /
  `save_recipe_translation` restaurées à l'identique).
  0023 : `test_0023_v1_compat.sql` (0023 avec 0021, puis 0023 SEULE sans 0021 : la v1 n'est pas cassée),
  `test_0024_handle_new_user.sql` (0024, appliquée avant la boucle 0019 → 0023), `test_0025_sec2_v1.sql` / `test_0025_sec2_security.sql` et une
  vraie concurrence à deux sessions (relecture de sécurité n° 2, § 20.9),
  `test_0023_social_rpcs.sql` sous la chaîne complète 0019 → 0021 → 0023 → 0018 → 0020 (deux fois, comme 0021 : chaque
  fonction a son « oui » et son « non » pour un étranger, un membre et le créateur ; notifications sans e-mail ; limites de
  débit ; transfert du créateur ; départ qui fait perdre l'accès ; suppression de groupe ; export sans donnée d'autrui ;
  blocages de suppression de compte), et « up, down, up » de 0023 (empreinte md5 de toutes les fonctions, déclencheurs,
  politiques et tables `private` identique à l'avant). Les tests de 0019 ont été adaptés à 0023 (relance après refus : délai
  de 7 jours ; notifications créées par les déclencheurs).
- Ces tests SQL ne tournent pas en CI.

- Nuxt 4.5 refuse deux `nuxt dev` dans le même dossier : si un serveur de dev tourne déjà,
  lancer `E2E_PORT=<son port> npm run test:e2e`. `nuxt preview` n'accepte pas le build Vercel :
  pour tester le build de production, `NITRO_PRESET=node-server npm run build -- --dotenv .env.local`
  puis `PORT=3100 node --env-file=.env.local .output/server/index.mjs`.

## 16. Variables d'environnement

Modèle commenté : [env.example](env.example). Production : Vercel → Settings → Environment
Variables (aucun fichier `.env` n'est déployé).

| Variable | Lue par | Rôle |
|---|---|---|
| `SUPABASE_URL` | `nuxt.config.ts` (module Supabase, `image.domains`), e2e | URL du projet |
| `SUPABASE_ANON_KEY` | `nuxt.config.ts`, e2e | clé publique (anon ou publishable `sb_publishable_…`) |
| `NUXT_PUBLIC_AUTH_PROVIDERS` | `runtimeConfig.public.authProviders` | boutons OAuth : `google` (défaut), `google,apple`, `none` |
| `NUXT_PUBLIC_EDITION` | `runtimeConfig.public.edition` (+ manifeste PWA, § 20.18) | édition du site : `boultons` (défaut) ou `generic` (§ 9) |
| `NUXT_PUBLIC_GOOGLE_CLIENT_ID`, `NUXT_PUBLIC_GOOGLE_API_KEY`, `NUXT_PUBLIC_GOOGLE_APP_ID` | `runtimeConfig.public.google` | import Google Drive du traducteur (publiques) ; l'une vide = bouton masqué (§ 12) |
| `AI_PROVIDER` | `runtimeConfig.aiProvider`, `getAiConfig()` | `openai` (défaut), `anthropic`, `google`, `mistral`, `mock` |
| `AI_MODEL` | idem | modèle ; vide = défaut du fournisseur |
| `AI_TRANSCRIBE_MODEL` | idem | modèle de transcription de la dictée (défaut `gpt-4o-mini-transcribe`, OpenAI) |
| `AI_DAILY_QUOTA` | idem | appels par personne et par jour (défaut 50, `0` = coupé) |
| `AI_NEW_ACCOUNT_DAILY_QUOTA`, `AI_NEW_ACCOUNT_DAYS` | idem (v2) | plafond du jour d'un compte **neuf** (défaut 20) et durée pendant laquelle un compte est neuf (défaut 30 jours) ; § 20.15 |
| `AI_MONTHLY_BUDGET_CALLS`, `AI_MONTHLY_BUDGET_USD` | idem (v2) | budget du mois, tous comptes (0 = aucun) : au-delà, l'IA est coupée pour tous avec le même message que « crédit épuisé » ; § 20.15 |
| `RESEND_API_KEY`, `EMAIL_FROM`, `ALERT_EMAIL`, `SITE_URL`, `EMAIL_APP_NAME` | `server/utils/email.ts` (v2) | e-mails Resend (clé, expéditeur sur domaine vérifié, adresse de Nina pour l'alerte, adresse publique du site pour les liens, nom affiché). **Tout vide = aucun envoi**, journal serveur seulement ; § 20.15 |
| `CRON_SECRET` | `server/utils/cron.ts`, `/api/cron/*` | secret des tâches planifiées Vercel (16 caractères au moins) ; absent = routes fermées (503) ; § 20.15 |
| `SUPABASE_SECRET_KEY` | `@nuxtjs/supabase` (`serverSupabaseServiceRole`), `POST /api/account/delete` | clé secrète `service_role` / `sb_secret_…`, **serveur seulement** (suppression de compte, § 20.8) ; vide = la route répond 500, le reste fonctionne |
| `NUXT_PUBLIC_CONTACT_EMAIL` | `runtimeConfig.public.contactEmail`, `useContactEmail()` | adresse de contact des pages légales et du pied de page (v2) ; vide ou mal formée = texte de repli, aucun lien « Contact » (§ 20.13) |
| `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GOOGLE_GENERATIVE_AI_API_KEY`, `MISTRAL_API_KEY` | idem | clé du fournisseur choisi |
| `NUXT_PUBLIC_SENTRY_DSN` (repli `SENTRY_DSN`) | `nuxt.config.ts`, `sentry.*.config.ts` | DSN Sentry ; vide = Sentry inactif |
| `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT` | `nuxt.config.ts` (build) | envoi des sourcemaps (optionnel) |
| `VERCEL`, `VERCEL_ENV` | `nuxt.config.ts`, Sentry | fournies par Vercel, ne pas définir |
| `NITRO_PRESET` | Nitro | `node-server` pour un build servi par Node (e2e, PWA) |
| `E2E_SERVER`, `E2E_BASE_URL`, `E2E_PORT`, `CI` | `playwright.config.ts` | tests e2e |
| `APP_URL`, `LOCAL_DB_URL` | tests d'intégration | serveur Nuxt et base locale |
| `SUPABASE_DB_URL`, `SUPABASE_TEST_DATABASE`, `SUPABASE_TEST_DB_URL`, `SUPABASE_CLI`, `PGBIN`, `PGPORT_TEST` | scripts `supabase/local/`, `supabase/tests/`, `scripts/` | outillage de la base locale |

- Le module `@nuxtjs/supabase` attend `SUPABASE_URL` / `SUPABASE_KEY` : `nuxt.config.ts`
  mappe `SUPABASE_ANON_KEY` pour garder le nom déjà utilisé sur Vercel.
  `NUXT_PUBLIC_SUPABASE_URL` / `NUXT_PUBLIC_SUPABASE_KEY` fonctionnent aussi à l'exécution.
- Les variables IA peuvent aussi s'écrire `NUXT_AI_PROVIDER`, `NUXT_OPENAI_API_KEY`… (surcharge
  de `runtimeConfig`).
- La clé `service_role` (ou `sb_secret_…`) n'est lue QUE par `POST /api/account/delete` (`SUPABASE_SECRET_KEY`, côté serveur) et ne doit jamais être exposée ni préfixée `NUXT_PUBLIC_`.
- `API_BASE` et `NODE_ENV` ne sont plus lues par le code.

## 17. Déploiement

- Vercel construit chaque push (`nuxt build`, preset `vercel`, Node 22.x) ; `main` part en
  production. Fonctions `server/api/**` : `maxDuration` 30 s.
- Les migrations SQL ne sont pas appliquées par le déploiement. Mise en production de
  0003 → 0016 : [supabase/BASCULE_PROD.md](supabase/BASCULE_PROD.md) ; détail par migration :
  [supabase/MIGRATION_NOTES.md](supabase/MIGRATION_NOTES.md).
- Nouveau projet Supabase : [SUPABASE_SETUP.md](SUPABASE_SETUP.md).
- Notes de version pour la famille : `RELEASE_NOTES.md`.

## 18. À savoir

- **Échap ferme toutes les modales** (`UModal`, `UDrawer`) : ne jamais mettre `:dismissible="false"`,
  car Nuxt UI bloque alors aussi Échap. Pour interdire seulement le clic extérieur (éditeur de
  recette, `RecipeEditor.vue`), passer `:content="{ onInteractOutside: e => e.preventDefault() }"`.
  Dans une modale contenant un menu ouvert (`USelectMenu`…), un premier Échap ferme le menu, un
  second la modale (comportement natif de Reka UI). Test : `e2e/escape-modals.spec.ts`. Le
  traducteur est une page, pas une modale.
- **Messages d'erreur serveur en français** : les 4xx de `server/api` (Zod, métier, SQL)
  sont rédigés en français et affichés tels quels, y compris en anglais.
- **Nombres formatés en `fr-FR`** : `shared/utils/recipes.ts` (`toLocaleString('fr-FR')`)
  affiche « 1,5 » aussi dans l'interface anglaise.
- **Traductions = textes par position** : ne jamais y stocker d'identifiants (recréés à chaque
  `save_recipe`), et passer par `save_recipe_translation` (ou le payload de `save_recipe`) pour
  les écrire. Voir § 19.
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

## 19. Recettes bilingues (fr / en)

Chaque recette existe en **français et en anglais** : le texte d'origine (saisi, dans sa langue) et
sa traduction par l'IA. Migration `0016_recipe_translations.sql` (retour arrière :
`supabase/rollback/0016_recipe_translations_down.sql`).

### 19.1 Modèle de données

- `recipes.lang` (`'fr'` | `'en'`, défaut `'fr'`) : langue du texte saisi. `recipes.search` (colonne
  générée) utilise le stemming français ou anglais selon `lang`.
- `recipe_translations (recipe_id, locale, …)` : **une ligne par recette**, `locale` = l'autre langue
  que `recipes.lang`. Colonnes : `title`, `description`, `notes`, `tags`, `content` (jsonb),
  `source_hash`, `model`, `stale`, `translated_at`, `search` (tsvector généré : titre, description,
  noms d'ingrédients traduits). RLS : lecture publique, écriture admin (`private.is_admin()`) ;
  suppression en cascade.
- `content` = `{ "sections": [ { "name", "ingredients": [ { "name", "amount", "unit" } ], "instructions": [ "…" ] } ] }`,
  les textes **par position** (section n° i, ingrédient n° j, étape n° k, dans l'ordre `order_index`).
  `amount` n'est rempli que pour une quantité qui contient des mots (« au goût », « 2 à 3 »), `unit`
  que pour une unité en texte libre : les quantités chiffrées et les unités codées ne se traduisent
  pas (l'unité affichée suit la langue grâce à `units.abbr_en`).
- **Pourquoi par position et pas par identifiant** : `save_recipe` supprime et recrée toutes les
  sections, ingrédients et étapes à chaque enregistrement (nouveaux identifiants). Des identifiants
  dans `content` seraient orphelins dès la première modification. Par position, la traduction
  **survit** à `save_recipe`. Deux garde-fous évitent d'afficher un texte devenu faux :
  1. `save_recipe` marque `stale = true` toute traduction existante quand le texte est
     ré-enregistré sans traduction jointe (même si un autre chemin d'écriture oublie la suite) ;
  2. l'affichage n'applique une traduction que si elle n'est pas `stale` **et** si sa forme
     (nombre de sections, d'ingrédients et d'étapes) correspond à la recette (`localizeRecipe`).
- `source_hash` : empreinte (`sourceHash`, 2 × cyrb53) des textes sources traduisibles
  (`recipeTexts` : titre, description, notes, tags, noms de sections, ingrédients, quantités avec
  mots, unités libres, étapes ; ni quantités chiffrées, ni photo, temps, portions, catégorie). Elle
  sert à savoir si une modification change vraiment le texte : sinon la traduction est simplement
  revalidée, **sans appel IA**.
- `save_recipe_translation(recipe_id, lang, translation)` pose `recipes.lang` (la langue peut être
  corrigée par la détection de l'IA : l'éventuelle traduction vers cette même langue est
  supprimée) et écrit la traduction (`stale = false`). `save_recipe` accepte aussi `lang` et
  `translation` dans son payload : l'import IA enregistre la recette et ses deux langues dans
  **une seule transaction**.

### 19.2 Affichage

- Langue d'affichage = langue de l'interface (`/` français, `/en` anglais), choisie **à
  l'affichage** (`useRecipeLocale()` : `localizeCard`, `localizeFull`), donc le changement de langue
  ne recharge rien. Repli sur le texte d'origine quand la traduction manque, est périmée ou ne
  correspond plus à la recette ; la fiche indique alors discrètement « Texte d'origine (…) : pas
  encore traduit » (ou « Traduit automatiquement depuis le … »).
- Lectures : `search_recipes` renvoie `lang` et `translation` (jsonb, `null` si absente ou périmée) ;
  les lectures directes (favoris, planning) joignent `recipe_translations(...)` ; la fiche lit la
  traduction complète. `toRecipeSummary` / `toRecipe` (`shared/utils/recipes.ts`) convertissent.
- Où : cartes et listes (`RecipeCard`), résultats de recherche, favoris (tri par titre affiché),
  planning (titre des repas, toasts, sélecteur de recette), fiche (titre, description, notes,
  sections, ingrédients, étapes, tags), mode cuisine (utilise la fiche affichée), ajout aux courses
  (noms traduits : `locale` envoyé à `add_recipe_to_list`), aperçu du traducteur. Les unités suivent
  la langue de l'interface (`useUnits().unitLabel`, `abbr` / `abbr_en`).
- **Recherche** : `search_recipes` cherche dans le texte d'origine **et** dans la traduction (titre,
  description, noms d'ingrédients traduits), avec la configuration de langue de chaque texte ;
  une recette se trouve donc par un mot anglais comme par un mot français, sans accents.
- **Tags** : texte libre, ils servent de clé aux filtres. La traduction des tags est stockée et
  affichée sur les cartes et la fiche, mais les **filtres** (`RecipeFilters`) listent les tags
  d'origine. Suite possible : table de correspondance des tags usuels.

### 19.3 Import (traducteur IA)

- Plus de choix de langue. Un seul appel `generateObject` (`aiRecipeSchema` étendu : `sourceLanguage`
  + `translation`) renvoie la recette dans sa langue d'origine **et** dans l'autre langue, avec la
  même structure. `aiRecipeToBilingual` écarte les mêmes éléments vides des deux côtés et lève
  `TranslationShapeError` (422 « traduction incomplète ») si le modèle n'a pas respecté la structure.
- L'aperçu s'ouvre dans la langue de l'interface, deux boutons montrent l'autre version
  (`translatedInput`). « Ajouter » envoie `{ recipe, lang, translation }` à `POST /api/add-recipe`
  (validée contre la recette ; 400 sinon) : les deux langues sont enregistrées ensemble, sans appel
  IA supplémentaire.

### 19.4 Éditeur

- L'éditeur modifie la **version d'origine** (bandeau « Vous modifiez la version d'origine (…) »).
- À l'enregistrement (`POST /api/add-recipe` sans traduction, `PUT /api/update-recipe`), le serveur
  relit la recette, calcule `sourceHash` et : (a) hash identique → traduction revalidée (`unchanged`,
  aucun appel IA) ; (b) sinon → appel IA `translateRecipeTexts` (une requête, détecte la langue,
  traduit vers l'autre), `ai_usage.feature = 'translate_recipe'`, comptée dans `AI_DAILY_QUOTA`.
- **L'enregistrement ne dépend jamais de l'IA** : en cas d'échec (quota, clé, panne, réponse
  incohérente) la recette est enregistrée, la traduction reste `stale` (ignorée à l'affichage) et la
  réponse porte `translation: { status: 'failed', reason, message }` (l'éditeur affiche un
  avertissement). Réenregistrer la recette dans l'éditeur relance la traduction (§ 19.5).
- Pas d'édition manuelle de la traduction dans cette version (suite possible : champs de la
  traduction dans l'éditeur, enregistrés avec `save_recipe_translation`).

### 19.5 Rattrapage des recettes existantes (page retirée)

La page admin `/traductions` et ses endpoints (`GET /api/translations`, `POST /api/translations/run`)
ont servi une seule fois : le rattrapage a été fait en production le 2026-10-19 (181/181 recettes
traduites). Ils ont été supprimés. Une traduction périmée (échec de l'IA à l'enregistrement) se
corrige en **réenregistrant la recette dans l'éditeur**, ce qui relance la traduction. En cas de
besoin, la page peut être restaurée depuis l'historique git (`git log` du commit « Retire la page
Traductions »).

### 19.6 Mise en production

Ordre : **(1) appliquer 0016, (2) déployer le code, (3) lancer la traduction**
([supabase/BASCULE_PROD.md](supabase/BASCULE_PROD.md), « Recettes bilingues »). Le code tolère
l'absence de traductions (le site affiche le texte d'origine tant que rien n'est traduit) ; 0016 est
compatible avec l'ancien code (colonnes et paramètres ajoutés avec valeurs par défaut,
`search_recipes` ne gagne que deux colonnes de fin). Déployer le **nouveau code avant 0016** casserait
les lectures (colonnes `lang`, `recipe_translations` absentes).

### 19.7 Tests

- `test/unit/translation.test.ts` (textes, empreinte, forme, affichage, détection de langue,
  aperçu), `test/unit/schemas/ai.test.ts` (schéma bilingue, alignement), `test/unit/ai/translate.test.ts`
  (mock, `translateRecipeTexts`).
- `test/integration/bilingual.local.test.ts` (serveur Nuxt `AI_PROVIDER=mock` + base locale) :
  import des deux langues, création et modification éditeur (régénération, revalidation sans IA,
  échec IA → `stale`, corrigé en réenregistrant), recherche dans
  les deux langues, RLS (un utilisateur ne peut ni écrire ni modifier ni supprimer une traduction),
  courses en anglais.
- `supabase/tests/test_0016_translations.sql` (migration, droits, atomicité, `stale`, recherche,
  courses, cascade).
- `e2e/bilingual.spec.ts` : fiche `/en` en anglais (« [EN] … ») et `/` en français, recherche dans
  les deux langues, éditeur (version d'origine), traducteur sans sélecteur de langue avec bascule
  d'aperçu.

---

## 20. v2 : partage, groupes et RLS

État : phases 2 (0017), 3 (0019), 4 (remplissage `supabase/v2/0018_v2_data_fill.sql`), 5A (0021, § 20.7) et 5B (0023, § 20.8) écrites ; le
remplissage et la bascule des politiques des recettes (`supabase/v2/0020_rls_switchover.sql`) sont préparés mais **pas
appliqués** (le site actuel suppose que tout compte connecté lit toutes les recettes). Ordre : 0017 → 0019 → 0021 → **0023**
→ 0018 → 0020 → code v2 (procédure : `supabase/BASCULE_V2.md`). Détail et choix de conception : en-têtes de `0017`, `0019`, `v2/0018` et `v2/0020`.

### 20.1 Qui peut quoi sur une recette (`private.recipe_level(r)`)

| Niveau | Source | Donne |
|---|---|---|
| 4 | auteur (`recipes.owner_id`) | tout |
| 3 | `recipe_grants` `edit_original` (direct, à la personne ou à un groupe dont on est membre) | lire, copier, **modifier le contenu** (pas la propriété, pas la visibilité) |
| 2 | `recipe_grants` `copy`, **ou** `visibility = 'groups'` et un groupe en commun avec l'auteur (droit implicite) | lire, copier |
| 1 | `recipe_grants` `read` | lire |

Le support (`private.is_support()`, alias de `is_admin()` pour l'instant) **ne lit une recette que si elle est
signalée** (statut `open` ou `reviewed`) et peut alors la supprimer ; il ne modifie jamais le contenu des autres. Un repartage
(`origin = 'reshare'`) exige un droit explicite détenu, ne dépasse jamais `copy` ni son propre niveau, et ne vise qu'une **personne**
(ami ou co-membre d'un groupe), jamais un groupe.

### 20.2 Partage par groupe et bannières (clarification de Nina, 2026-10-24)

- **Rejoindre un groupe n'ajoute aucune recette au carnet de personne.** `cookbook_entries` ne se
  remplit que par un geste explicite (une recette, ou toutes celles d'un auteur).
- Une recette `visibility = 'groups'` est lisible et copiable par tous les membres des groupes de son
  auteur, recettes existantes comprises, sans ligne `recipe_grants`. `private` : auteur + droits
  explicites. `edit_original` : seulement par un droit direct de l'auteur.
- Après l'adhésion, l'interface (phase 5) affiche une bannière « Explorer les recettes de X » : page
  qui liste ses recettes partagées avec mes groupes, ajout une par une ou **toutes d'un coup**
  (`add_author_recipes_to_cookbook(author)`, idempotente), ou fermeture. Même principe quand un membre
  d'un de mes groupes publie une nouvelle recette (« X a publié… »).
- **Une bannière fermée ne revient plus** : table `dismissed_prompts (user_id, kind, target_id,
  created_at)`, PK composite ; `kind` = `author_recipes` (target = l'auteur) ou `new_recipe` (target =
  la recette). L'appel `add_author_recipes_to_cookbook` ferme aussi la bannière de l'auteur. La page
  reste accessible via le profil de X → « ses recettes ».

### 20.3 Données personnelles

`profiles` garde ses politiques (soi + support). Les autres personnes passent par `search_users(q)`
(≥ 3 lettres, `discoverable`, jamais soi-même) et `get_public_profiles(ids)` (personnes liées) : elles
ne renvoient que `id`, `display_name`, `cookbook_title`, **jamais l'e-mail** ni `profiles.name`
(`handle_new_user` y recopie l'e-mail). Une personne sans `display_name` est introuvable.

### 20.4 Ce que la bascule change (v2/0020), pour la phase 4 / 11

Lecture = `can_read_recipe`, écriture du contenu = `can_edit_recipe`, insertion = auteur, photos
suivent la recette ; `recipes.owner_id` passe NOT NULL avec `DEFAULT auth.uid()` (`save_recipe` v1 continue
de fonctionner, et n'est plus réservé aux admins : tout compte crée SES recettes). Reste à faire hors de ce
fichier : bucket de photos **public**, rendu privé (liens signés) par `v2/0029_private_photos_switchover.sql` (phase 8, § 20.14). `save_recipe_translation`
(garde `is_admin()` en v1) est remplacée par la migration 0021 : « admin OU peut modifier la recette ». Le 2ᵉ compte admin → `user` est fait par le remplissage 0018 (§ 20.6).

### 20.5 Points d'attention (relecture de sécurité)

- **`invitations`** : `select *` renvoie « permission denied » (la colonne `token_hash` n'est pas lisible par
  l'API). Lister les colonnes : `id, kind, inviter_id, target_user_id, target_email, group_id, status, created_at,
  expires_at, responded_at`. À l'insertion : `kind, inviter_id, target_user_id, target_email, group_id`.
- **`profiles` après la bascule 0020** : chacun ne lit et ne modifie que SA ligne, support compris (l'e-mail d'un
  autre n'est plus lisible par l'API). Le code actuel reste compatible : `app/stores/auth.ts` lit son propre
  profil (`select *` par `id`), `server/utils/auth.ts` (`requireAdmin`) lit son propre `role`, le hook JWT passe par
  sa politique dédiée. Ce qui casserait : tout écran ou requête qui listerait les profils des autres ou modifierait
  le profil / le rôle d'un autre compte via l'API (il n'y en a pas dans le dépôt) ; passer par le service role ou une RPC.
- **Section d'une autre recette** : 0020 refuse qu'un ingrédient / une étape référence une section d'une autre
  recette (fonction `private.section_belongs_to`). Pour le « contract » (0022) : ajouter `unique (id, recipe_id)` sur
  `recipe_sections` et une clé étrangère composite `(section_id, recipe_id)` depuis `recipe_ingredients` et `instructions`.
- **Jeton JWT périmé** : le claim `user_role` (et donc `private.is_support()`) peut rester périmé jusqu'à 1 h après un
  changement de rôle (durée de vie du jeton).
- **Compte du créateur d'un groupe** : `groups.created_by` est `on delete restrict`. Réglé par 0023 : `transfer_group_ownership`,
  `delete_group`, et `prepare_account_deletion` (supprime les groupes où la personne est seule, refuse s'il reste des membres) ;
  voir § 20.8.
- **Performance** : `can_read_recipe(id)` est évalué ligne par ligne ; suffisant à l'échelle visée (quelques centaines
  de comptes), à surveiller avec `EXPLAIN ANALYZE` avant la bascule ; sinon passer par une fonction de liste.
- **Abus** : réglé par 0023 pour les demandes d'ami (20 par jour), les invitations (20 par jour), les signalements (10 par
  jour) et les exports (3 par jour) ; pas de blocage de personne (hors périmètre) ; la recherche d'utilisateurs n'a pas encore
  de limite (§ 7.7 du dossier) : à faire avec la phase 7.

### 20.6 Remplissage des données (`supabase/v2/0018_v2_data_fill.sql`), phase 4

Procédure complète, compatibilité du code actuel (ce qui casse / ne casse pas avec 0018 + 0020) et retour arrière :
[supabase/BASCULE_V2.md](supabase/BASCULE_V2.md). En bref :

- **Paramètres saisis le jour J** dans `private.v2_fill_params` (table créée par `v2/0018_params.sql`) : `owner_email`
  (sinon le compte `admin` le plus ancien, arrêt en cas d'égalité), `display_name:<e-mail>` (obligatoire, jamais d'e-mail),
  facultatifs `cookbook_title:<e-mail>` et `group_name`. Aucun e-mail ni identifiant dans le dépôt.
- Groupe « Les Boultons » (thème `{"preset":"boultons",…}`), créateur = propriétaire, tous les comptes présents au premier
  passage membres. `recipes.owner_id` = propriétaire pour toute recette sans propriétaire ; **un droit `recipe_grants`
  `edit_original` accordé au groupe par recette** (accepté par `private.recipe_level` : vérifié dans le fichier et par les
  tests) ; les recettes créées plus tard n'ont pas ce droit.
- Catégories : slug = clé i18n (`desserts_et_gateaux`), noms fr / en, icône Lucide, ordre de `RECIPE_CATEGORIES` ; un texte de
  catégorie inconnu devient une catégorie de plus. `recipes.category_id` = catégorie de l'auteur.
- Carnets : seulement les favoris existants sur les recettes des autres (le reste est un geste explicite, clarification du
  2026-10-24) ; aucune bannière n'est fermée.
- Rôles : `prevent_role_change` reste actif ; le temps de l'UPDATE la transaction porte un claim local `user_role = admin`
  (celui que lit `private.is_admin()`), restauré aussitôt. `recipes.updated_at` n'est pas modifié (déclencheur suspendu).
- Idempotent ; sauvegarde dans `private.backup_0018_profiles` / `private.backup_0018_created` ; retour arrière
  `rollback/0018_v2_data_fill_down.sql` (après celui de 0020). Le fichier est dans `supabase/v2/` : il passe APRÈS 0019
  (son numéro est avant) et exige des paramètres, donc `setup.sh` / `db push` ne doivent jamais l'appliquer.

### 20.7 API v2 côté recettes (migration 0021), phase 5A

**Convention.** Comme `search_recipes` (lecture directe depuis le navigateur), les fonctions ci-dessous s'appellent
**directement avec supabase-js et la session de la personne** : pas de route `server/api/v2/…`, pas de service role. Chaque
fonction est `security definer` avec `search_path` vide et lit `(select auth.uid())` : elle ne prend jamais « qui je suis »
en paramètre. Les droits sont décidés en base (fonctions `private.*` de 0019). Côté application :
`app/composables/useCookbook.ts` et `useSharing.ts` (fonctions pures `fn(supabase, …)` + `useCookbook()` / `useSharing()`),
schémas Zod `shared/schemas/cookbook.ts` et `sharing.ts`, conversions `shared/utils/cookbook.ts` (snake_case → camelCase),
types de `shared/types/database.ts` (ajoutés à la main, à revérifier à la prochaine régénération). Aucune interface (phase 6).
Erreurs : refus de droit = SQLSTATE `42501` (message français), introuvable = `P0002`, entrée invalide = `22023`.

| Fonction | Qui peut l'appeler | Rôle / retour |
|---|---|---|
| `save_recipe(payload)` | `authenticated` (le RLS décide : admin en v1 ; auteur ou `edit_original` en v2) | Inchangée sans `visibility` / `category_id`. À la création : `owner_id = auth.uid()` (une fois la bascule 0020 appliquée), `visibility` (défaut `groups`), `category_id` (doit être à soi). Pour un éditeur qui n'est pas l'auteur, ces deux clés sont ignorées. **`SECURITY INVOKER`** (exception voulue). |
| `save_recipe_translation(recipe, lang, tr)` | `authenticated` | Garde : admin OU `can_edit_recipe`. Invoker. |
| `copy_recipe(p_source)` | `authenticated` ayant le droit `copy` ou plus | Copie modifiable à soi (`visibility = private`, `copied_from`), sections / ingrédients / étapes / traductions copiés, **photo non copiée (phase 8)**. Renvoie l'id. |
| `add_to_cookbook(p_recipe, p_category?)` | lecteur de la recette | Idempotente ; `true` la 1ʳᵉ fois ; sans effet sur ses propres recettes ; catégorie = une des siennes. |
| `remove_from_cookbook(p_recipe)` | connecté | Idempotente ; `true` si une entrée a été retirée. |
| `list_cookbook(p_category?, p_query?, p_limit, p_offset)` | connecté | Mes recettes (`owned`) + celles ajoutées et encore lisibles (`added`) ; `permission` (`author` / `edit_original` / `copy` / `read`), `category_id`, auteur, `lang` + `translation` (comme `search_recipes`), `total_count`. |
| `list_author_recipes(p_author, p_limit, p_offset)` | connecté | « Explorer les recettes de X » : ses recettes que je peux lire, `in_cookbook`. Vide pour soi-même. |
| `list_shared_with_me(p_limit, p_offset)` | connecté | Lisibles par moi (droit direct, de groupe, ou partage implicite « groupes »), pas encore dans mon carnet ; `via` = `user` / `group`. |
| `grant_recipe(p_recipe, p_grantee_user?, p_grantee_group?, p_permission)` | **auteur** | Ami ou personne d'un groupe commun, ou groupe dont l'auteur est membre (`private.can_create_grant`) ; le plus récent remplace. Renvoie l'id du droit. |
| `revoke_recipe_grant(p_grant_id)` | auteur ; auteur d'un repartage ; bénéficiaire qui renonce | `true` si retiré, `false` sinon (inconnu ou non permis, sans distinction). Les repartages issus de ce droit disparaissent. |
| `reshare_recipe(p_recipe, p_grantee_user, p_permission)` (`p_grantee_group` existe encore mais est **refusé**, 22023) | détenteur d'un droit **explicite** | À une **personne** seulement (ami ou co-membre), `read` ou `copy` (**jamais `edit_original`**), au plus son niveau ; ne remplace jamais un droit qui n'est pas le sien (renvoie `NULL`). |
| `list_recipe_grants(p_recipe)` | **auteur** | Droits donnés (personnes, groupes, repartages) avec noms d'affichage, jamais d'e-mail. |
| `create_share_link(p_recipe)` / `revoke_share_link(p_recipe)` | **auteur** | Jeton du lien public (le même s'il existe) / désactivation. |
| `get_shared_recipe(p_token, p_locale?)` | **`anon`** et `authenticated` | Recette complète en JSON pour un jeton actif, sinon `NULL`. Ni id de recette, ni `owner_id`, ni e-mail, ni `photo_path` (`has_photo`) ; seulement `author_name` (pseudonyme). |
| `claim_shared_recipe(p_token)` | connecté | Depuis la page publique : droit `copy` (`origin = link`) s'il n'y en a pas déjà un (un droit existant n'est JAMAIS modifié) + ajout au carnet. Renvoie l'id de la recette. |
| `recipe_usage(p_recipe)` | **auteur** | `cookbook_count` (carnets d'AUTRES personnes) et `copy_count` : à appeler avant `delete_recipe` pour avertir. |
| `pending_prompts(p_since?, p_limit)` | connecté | Bannières `author_recipes` / `new_recipe` (voir ci-dessous). |
| `dismiss_prompt(p_kind, p_target)` | connecté | Ferme une bannière pour de bon (idempotente). |
| `add_author_recipes_to_cookbook(p_author)` (0019) | connecté, `security invoker` | « Tout ajouter » ; ferme aussi la bannière de l'auteur. |

**Bannières (`pending_prompts`).** Calculées **à la volée** à partir des groupes communs et de `dismissed_prompts`, sans table
`notifications` ni déclencheur : rien à écrire ni à nettoyer. `author_recipes` = un co-membre de l'un de mes groupes a au moins
une recette lisible pas encore dans mon carnet (`target_id` = l'auteur ; disparaît après « tout ajouter » ou fermeture).
`new_recipe` = recette lisible créée **après** que l'auteur et moi soyons tous deux dans un groupe commun (`target_id` = la
recette ; disparaît quand elle est ajoutée au carnet ou fermée). Les recettes d'avant l'arrivée ne donnent donc que la bannière
« Explorer ».

**Exemples** (client supabase-js de la session ; `useCookbook()` / `useSharing()` font la même chose en validant les entrées) :

```ts
const { listCookbook, addToCookbook, copyRecipe, pendingPrompts, dismissPrompt } = useCookbook()
const { items, totalCount } = await listCookbook({ categoryId, query: 'tarte', page: 1 })   // list_cookbook
await addToCookbook({ recipeId, categoryId })              // true la 1re fois
const mine = await copyRecipe({ recipeId })                 // id de la copie (droit copy requis)
const banners = await pendingPrompts()                      // [{ kind: 'author_recipes', targetId, authorName, recipeCount }, …]
await dismissPrompt({ kind: 'new_recipe', targetId: banners[0].targetId })

const { grantRecipe, reshareRecipe, createShareLink, getSharedRecipe, recipeUsage } = useSharing()
await grantRecipe({ recipeId, granteeUserId, permission: 'edit_original' })   // auteur seulement
await reshareRecipe({ recipeId, granteeUserId, permission: 'copy' })          // une personne ; jamais edit_original, jamais un groupe
const { path } = await createShareLink({ recipeId })        // '/r/<jeton>'
const page = await getSharedRecipe({ token, locale: 'en' }) // sans compte ; null si le lien est inconnu ou révoqué
const { cookbookCount, copyCount } = await recipeUsage({ recipeId })   // avant de supprimer
```

```sql
-- appel brut (même résultat) : select * from public.list_cookbook(p_query => 'tarte', p_limit => 24, p_offset => 0);
select public.get_shared_recipe('<jeton>'::uuid, 'fr');   -- exécutable sans compte (rôle anon)
```

**À savoir.**

- `owner_id` n'est écrit par `save_recipe` qu'**après la bascule 0020** (colonne NOT NULL) : avant le remplissage 0018 une
  recette créée en v1 reste sans propriétaire, pour que 0018 l'attribue à Nina.
- Les routes `add-recipe`, `update-recipe`, `delete-recipe` et les endpoints IA restent réservés aux admins (`requireAdmin`) en v1 ;
  la phase 6B (§ 20.11) les ouvre à tout compte connecté **quand l'interrupteur v2 est allumé** (le RLS décide). Le schéma `recipeInputSchema` accepte déjà `visibility` et
  `categoryId` (transmis à `save_recipe` seulement s'ils sont fournis).
- Les notifications « recette supprimée » (réponse n° 4 du dossier, § 10) et celles d'amis / groupes sont faites par la migration 0023 (§ 20.8).
- La copie ne duplique pas la photo (phase 8) ; `get_shared_recipe` ne renvoie pas d'URL de photo (liens signés, phase 8).
- Correction apportée à `v2/0020` pendant cette phase : le déclencheur de garde `recipes_guard_owner_fields` bloquait la
  suppression, par son auteur, d'une recette copiée par quelqu'un d'autre (`copied_from` des copies passe à NULL par clé
  étrangère). Les mises à jour faites par clé étrangère (`pg_trigger_depth() > 1`) sont désormais exemptées.

### 20.8 API v2 côté social (migration 0023), phase 5B

**Convention.** Identique au § 20.7 : les fonctions s'appellent **directement avec supabase-js et la session de la personne**
(`security definer`, `search_path` vide, `(select auth.uid())`, jamais « qui je suis » en paramètre). Une seule exception : la
suppression de compte passe par une route serveur (clé `service_role`, jamais dans le navigateur). Application :
`app/composables/useFriends.ts`, `useGroups.ts`, `useNotifications.ts`, `useAccount.ts` (fonctions pures `fn(supabase, …)` +
`useX()`), schémas Zod `shared/schemas/social.ts`, conversions `shared/utils/social.ts`, types de `shared/types/database.ts`
(ajoutés à la main). Aucune interface (phase 6). Erreurs : `42501` refusé, `P0002` introuvable (un groupe ou une demande dont
on n'est pas partie est « introuvable » : on n'en révèle pas l'existence), `22023` entrée refusée (message français),
**`54000` limite de débit**, **`55000` groupe à transférer avant de supprimer le compte** (`isRateLimitError` côté client).
Choix de conception détaillés : en-tête de `0023_social_rpcs.sql`.

| Fonction | Qui peut l'appeler | Rôle / retour |
|---|---|---|
| `send_friend_request(p_user)` | connecté | Demande d'ami ; idempotente (renvoie la demande en cours ou l'amitié). Après un refus : **la personne qui a refusé peut demander à son tour** (la ligne change de sens, sans délai) ; **le demandeur d'origine peut relancer au plus une fois par 7 jours**. Notifie le destinataire. 20 par jour (`54000`). |
| `respond_friend_request(p_id, p_accept)` | **destinataire** d'une demande en attente | `accepted` (notifie le demandeur) ou `declined` (aucune notification). |
| `cancel_friend_request(p_id)` | **demandeur** | Retire la demande en attente et la notification non lue ; `false` sinon. Ne remet pas la limite à zéro. |
| `remove_friend(p_user)` | connecté | Supprime l'amitié ; le déclencheur de 0019 retire les droits directs entre les deux s'ils ne partagent aucun groupe. `true` si retirée. |
| `list_friends()` / `list_friend_requests()` | connecté | Pseudonymes, `since` ; demandes reçues en attente + envoyées en attente ou refusées (`retry_after`). Jamais d'e-mail. |
| `create_group(p_name)` | connecté | Groupe + ligne `creator` (atomique). Renvoie l'id. |
| `rename_group(p_group, p_name)` / `update_group_theme(p_group, p_theme)` | **créateur** | Nom 1–60 ; thème = objet JSON ≤ 4000 caractères. |
| `invite_to_group(p_group, p_user)` | **créateur seulement** (§ 10 du dossier : « le créateur gère les membres ») | Invitation à ACCEPTER (30 jours) ; idempotente ; refusée récemment : 7 jours d'attente. Notifie. 20 invitations par jour. |
| `create_invite_link(p_group)` / `redeem_invite_link(p_token)` | **créateur** / connecté | Lien à usage unique (7 jours). Le jeton en clair (64 hex) n'est renvoyé **qu'une fois** ; seule son empreinte SHA-256 est stockée. L'envoi par e-mail relève de la phase 7. |
| `cancel_group_invitation(p_id)` | **créateur** | Annule une invitation (personne ou lien) en attente. |
| `respond_group_invitation(p_id, p_accept)` | **personne invitée** | Accepter = rejoindre comme `member` (notifie le créateur) ; **aucune recette n'est ajoutée au carnet** ; refuser ne notifie personne. |
| `leave_group(p_group)` | **membre** (pas le créateur) | Part ; perd l'accès aux recettes partagées par le groupe (déclencheurs de 0019). |
| `remove_group_member(p_group, p_user)` | **créateur** | Retire un membre (prévenu) ; jamais lui-même. |
| `transfer_group_ownership(p_group, p_new_creator)` | **créateur** | Atomique : `created_by` + les deux rôles. Le nouveau doit déjà être membre ; les invitations en attente sont annulées ; il est prévenu. |
| `delete_group(p_group)` | **créateur** | Cascade : membres, invitations, droits donnés au groupe (et repartages). Recettes, copies et droits directs restent ; les membres sont prévenus. |
| `list_my_groups()` / `list_group_members(p_group)` / `list_group_invitations()` | connecté / membre / connecté | Pseudonymes seulement. Invitations : reçues par moi + envoyées en attente pour les groupes que je crée. |
| `list_notifications(p_limit, p_before)` / `mark_notifications_read(p_ids)` / `unread_notifications_count()` | connecté | Les miennes seulement ; `p_ids` NULL = toutes. |
| `update_my_profile(…)` | connecté | Pseudonyme (1–60, sans « @ », unique), titre ≤ 80, `discoverable`, thème (objet ≤ 4000), thème actif (un de mes groupes). NULL = inchangé ; titre `''` / thème `'{}'` = effacer ; `p_personal_theme => true` = thème personnel. |
| `get_user_profile(p_user)` | connecté | Pseudonyme, titre du carnet, statut d'amitié, groupes communs, nombre de recettes lisibles ; **aucune ligne** si la personne ne m'est pas déjà visible (`private.can_see_profile`). |
| `export_my_data()` | connecté | Toutes mes données en jsonb ; les autres n'y figurent que par pseudonyme (aucun id de personne, aucun e-mail). 3 par jour. |
| `account_deletion_blockers()` | connecté | Groupes que je crée et qui ont d'autres membres. |
| `prepare_account_deletion(p_user)` | **`service_role` seulement** | Refuse (`55000`) si un tel groupe existe ; sinon supprime les groupes où la personne est seule. |

**Notifications** (créées par la base, jamais par le client ; `created_at` = horloge réelle, tri stable). Payload : identifiants,
pseudonymes, titres ; jamais d'e-mail ni de `profiles.name`.

| `type` | Pour qui | Quand | Clés du `payload` |
|---|---|---|---|
| `friend_request` | destinataire | demande ou relance | `friendship_id`, `from_user_id`, `from_name` |
| `friend_accepted` | demandeur | demande acceptée | `friendship_id`, `user_id`, `name` |
| `group_invitation` | personne invitée | invitation nominative | `invitation_id`, `group_id`, `group_name`, `from_user_id`, `from_name` |
| `group_invitation_accepted` | créateur | invitation ou lien accepté | `invitation_id`, `group_id`, `group_name`, `user_id`, `name` |
| `recipe_shared` | bénéficiaire | droit direct ou repartage donné à une PERSONNE (hausse seulement ; un doublon non lu est ignoré ; ni lien public, ni droit à un groupe) | `recipe_id`, `title`, `permission`, `from_user_id`, `from_name` |
| `recipe_deleted` | détenteurs du carnet autres que l'auteur | suppression de la recette (déclencheur `before delete` sur `recipes`) | `recipe_id`, `title`, `author_id`, `author_name` |
| `group_member_removed` | membre retiré | `remove_group_member` | `group_id`, `group_name` |
| `group_deleted` | membres (pas le créateur) | `delete_group` | `group_id`, `group_name` |
| `group_ownership_transferred` | nouveau créateur | `transfer_group_ownership` | `group_id`, `group_name`, `from_user_id`, `from_name` |

Un refus (ami ou groupe) ne notifie personne ; annuler une demande ou une invitation retire la notification non lue.

**Déclencheur sur `recipes` (table v1).** `trg_0023_recipe_deleted` (avant suppression) est le seul moyen de couvrir tous les chemins
(`delete_recipe`, suppression par le support, suppression d'un compte en cascade) sans modifier `delete_recipe`. En v1
`cookbook_entries` est vide : il ne fait qu'un test d'existence indexé. Il ne notifie pas ceux qui ne peuvent plus lire la recette
(sauf quand c'est le compte de l'auteur qui disparaît). Les personnes qui ont une COPIE ne sont pas prévenues (la copie leur appartient).

**Limites de débit** (`private.rate_events`, fenêtre glissante de 24 h, par personne, valables aussi pour les écritures directes que les
politiques de 0019 autorisent, ignorées sans `auth.uid()`) : 20 demandes d'ami, 20 invitations (personne ou lien), 3 exports ; 10
signalements (comptés sur `reports.created_at`). Annuler, supprimer ou refuser ne remet pas les compteurs à zéro.

**Suppression de compte** (dossier § 7.4) :

1. L'interface appelle `account_deletion_blockers()` : s'il y a des groupes, proposer `transfer_group_ownership` (ou `delete_group`).
2. `POST /api/account/delete { confirmEmail }` (l'adresse e-mail du compte, saisie de confirmation) → `server/utils/accountDeletion.ts` :
   contrôle des blocages (409 + `data.blockers`), chemins des photos, `prepare_account_deletion` (service_role, sous verrou),
   `auth.admin.deleteUser` (la cascade supprime profil, recettes, carnet, favoris, planning, courses, relations ; les copies faites par
   d'autres leur restent ; les détenteurs de ses recettes reçoivent `recipe_deleted`), puis retrait des photos du bucket (meilleur effort).
3. Variable `SUPABASE_SECRET_KEY` à définir dans Vercel avant le déploiement du code v2 (sinon la route répond 500).
4. L'e-mail de confirmation du § 7.4 relève de la phase 7 (Resend) : la saisie de l'adresse en tient lieu en attendant.

**Exemples** :

```ts
const { searchUsers, sendFriendRequest, respondFriendRequest, listFriendRequests, getUserProfile } = useFriends()
const [eve] = await searchUsers({ query: 'eve' })                 // ≥ 3 lettres
await sendFriendRequest({ userId: eve.id })                       // 54000 si 20 demandes aujourd'hui
const requests = await listFriendRequests()                       // [{ direction: 'incoming', friendshipId, displayName, … }]
await respondFriendRequest({ friendshipId: requests[0].friendshipId, accept: true })
const profile = await getUserProfile({ userId: eve.id })          // null si elle ne m'est pas visible

const { createGroup, inviteToGroup, respondGroupInvitation, transferGroupOwnership, createInviteLink } = useGroups()
const groupId = await createGroup({ name: 'Les voisins' })
await inviteToGroup({ groupId, userId: eve.id })                  // créateur seulement
const { token } = await createInviteLink({ groupId })             // jeton en clair : à copier TOUT DE SUITE
await respondGroupInvitation({ invitationId, accept: true })      // côté invitée : aucune recette ajoutée
await transferGroupOwnership({ groupId, newCreatorId: eve.id })   // avant de supprimer son compte

const { listNotifications, markNotificationsRead, unreadNotificationsCount } = useNotifications()
const { items, nextBefore } = await listNotifications({ limit: 20 })
await markNotificationsRead({ ids: [items[0].id] })               // sans ids : toutes

const { updateMyProfile, exportMyData, accountDeletionBlockers, deleteAccount } = useAccount()
await updateMyProfile({ displayName: 'Mamie', cookbookTitle: 'Recettes de Mamie', activeThemeGroupId: null })
await deleteAccount({ confirmEmail: 'moi@exemple.fr' })           // 409 si un groupe est à transférer
```

```sql
-- appel brut : select * from public.list_notifications(p_limit => 20);
select public.send_friend_request('<uuid>'::uuid);   -- exécutable par authenticated seulement (pas anon)
```

**À savoir.**

- La recherche d'utilisateurs (`search_users`, 0019) n'a pas de limite de débit ; pas de blocage de personne ; l'invitation par
  **e-mail** (`target_email`) et l'envoi de messages (Resend) relèvent de la phase 7.
- `update_my_profile` ne touche pas `onboarded_at` en 0023 : ajouté par la migration **0025** (§ 20.10, `p_complete_onboarding`) ; le pseudonyme est validé aussi en
  écriture directe (déclencheur `trg_0023_profiles_display_name`).
- Les tests de 0019 (`test_0019_rls.sql`) ont dû être adaptés : la relance d'une demande refusée par le demandeur d'origine demande
  désormais 7 jours, et les déclencheurs créent des notifications.

### 20.9 Relecture de sécurité n° 2 (0019, 0021, 0023, v2/0020, serveur)

Corrections faites **directement dans les fichiers** (0019, 0021, 0023 et `v2/0020` ne sont pas encore en production ; seul `0024` est à part,
déjà appliqué ou à appliquer tout de suite, et son SQL n'a pas changé). Chaque point a un test qui échoue avant et passe après
(`supabase/tests/test_0025_sec2_security.sql`, `test_0025_sec2_v1.sql`, la concurrence dans `run_local.sh`, les tests vitest).

| Point | Correction | Test |
|---|---|---|
| Limites de débit contournables en parallèle | `pg_advisory_xact_lock(hashtextextended(personne || ':' || genre, 0))` dans `private.check_rate_limit`, le déclencheur des signalements et les plafonds de volume | présence du verrou (`pg_get_functiondef`) + **deux sessions psql réelles** (demandes d'ami 19/20, signalements 9/10 : une seule passe) |
| Transfert du créateur vs départ / retrait | `private.require_group_creator` verrouille le groupe (`for update`, volatile) ; `leave_group` verrouille puis relit son rôle ; `remove_group_member` verrouille ; `transfer_group_ownership` vérifie `row_count = 1` (sinon 55000) | deux sessions : départ du futur créateur pendant le transfert = refusé, un seul créateur |
| Invitation / lien d'un ex-créateur | `redeem_invite_link` et `respond_group_invitation` exigent `groups.created_by = invitations.inviter_id` (même message qu'un jeton / une invitation inconnus) ; `invite_to_group` et `create_invite_link` passent par le verrou du groupe (« introuvable » si le rôle a changé) | transfert, puis ancienne invitation et ancien lien : refusés, y compris un reliquat « pending » inséré à la main |
| E-mail du profil | `revoke update on profiles from anon, authenticated` puis `grant update (name, role, language, theme, notifications, display_name, cookbook_title, theme_settings, active_theme_group_id, discoverable, onboarded_at)` (0019). **Colonnes modifiables par l'API après correction : ces 11.** Le code v1 ne modifie aucune colonne de `profiles` (lecture seule) | `update profiles set email` / `id` = 42501 ; `name`, `language`, `theme`, `notifications` et les colonnes v2 : 1 ligne ; `anon` : refusé |
| Volumes | déclencheurs d'insertion (0019, 53400) : 2000 recettes par auteur (**seulement si `owner_id` n'est pas NULL** : sans effet en v1), 20 groupes créés, 5000 bannières fermées ; contraintes `profiles_theme_settings_size` et `groups_theme_size` (≤ 4000 caractères, `not valid` puis `validate`) | 2001ᵉ recette / 21ᵉ groupe / 5001ᵉ bannière refusés ; 2005 recettes sans propriétaire insérées en v1 ; thèmes démesurés refusés en écriture directe |
| Suppression de compte | `iat` du JWT < 10 minutes sinon 401 `data.code = 'REAUTH_REQUIRED'` (`server/utils/recentAuth.ts`, côté client `isReauthRequired(error)` : redemander le mot de passe puis réessayer) ; photos listées dans le bucket par préfixe `<recette>/` avec pagination (`collectPhotoPaths`) ; middleware `server/middleware/csrf.ts` | `test/unit/recentAuth.test.ts`, `accountDeletion.test.ts`, `csrf.test.ts` |
| `claim_shared_recipe` | un droit existant n'est **jamais modifié** (`on conflict do nothing`) ; seule l'entrée de carnet est ajoutée | droits `read` et `edit_original` conservés |
| Repartage | à une **personne** seulement ; refusé vers un groupe (RPC : 22023 ; écriture directe : `can_create_grant` renvoie faux) | RPC + insertion directe |
| `invitations` | l'insertion directe n'autorise que `kind = 'group'` et `is_group_creator(group_id)` ; `kind = 'friend'` : RPC ou phase 7 | insertion d'une invitation d'ami = refusée |
| Oracle d'existence | `save_recipe` avec un `id` existant mais illisible : `insert … on conflict do nothing`, puis le même refus (42501) qu'un `id` lisible non modifiable ; sans effet sur la v1 (tout compte y lit tout) | même sqlstate et même message |
| Pseudonymes | caractères de format / invisibles (Cf, Zl, Zp, U+00A0 et autres espaces, fillers) refusés ; pas de mélange latin + cyrillique / grec ; unicité sur `normalize(…, NFKC)` en minuscules sans accents | « Ni​na » (U+200B), « Nіna » (і cyrillique), « ﬁdele » contre « Fidèle »… |
| `recipes_guard_owner_fields` | à profondeur > 1 le contrôle n'est plus levé : seuls `copied_from` → NULL et `category_id` → NULL sont tolérés ; `owner_id` et `visibility` jamais | déclencheur de test qui met `recipes` à jour en profondeur 2 |
| `.gitignore` | `.env*` ignoré, sauf `.env.example` et `.env.local.example` (`env.example` n'est pas concerné) ; les doublons iCloud (`.env 2.local`…) disparaissent de `git status` | `git check-ignore` |

**Middleware CSRF** (`server/middleware/csrf.ts`, logique dans `server/utils/csrf.ts`) : refuse en 403 toute requête dont la méthode n'est pas
`GET` / `HEAD` / `OPTIONS`, **quel que soit le chemin** (relecture n° 3 : un test sur `/api/` du chemin brut se contournait par `POST /%61pi/x`, h3 décodant avant de router),
quand `Sec-Fetch-Site` vaut `cross-site` ou `same-site` sans `Origin` identique, ou quand `Origin` est présent et diffère de l'hôte (`Host`, ou `X-Forwarded-Host`).
Liste blanche explicite `CSRF_EXEMPT_PATHS` (chemins décodés), vide : aucune route d'écriture hors `/api`, crons en GET, pas de webhook entrant.
Acceptés : même origine, `Origin` absent (tests serveur, scripts, Playwright `request`, appels `Authorization: Bearer` sans navigateur), lectures.
Les routes IA (`extract-recipe`, `transcribe-recipe`, `translate-recipe`) et Drive sont appelées en même origine par l'application : non touchées.
Un client navigateur d'un **autre site** qui appellerait l'API avec un jeton `Bearer` est désormais refusé.

**Limites connues.** (1) `iat` est renouvelé par Supabase à chaque rafraîchissement du jeton : la garantie est « jeton émis il y a moins de
10 minutes », pas « mot de passe saisi il y a moins de 10 minutes » (pour cela, lire l'horodatage de `amr`). (2) Un pseudonyme **entièrement**
cyrillique qui ressemble à un pseudonyme latin n'est pas détecté. (3) `profiles_insert_self` (0001) autorise encore l'insertion de sa propre
ligne si elle n'existe pas : le profil est créé par `handle_new_user` (0024 : rôle `user` en dur).

**À vérifier par Nina dans le tableau de bord Supabase** (rien à coder) :

- **Settings → API → « Exposed schemas »** : le schéma `private` ne doit PAS y figurer (seul `public`, plus `graphql_public` si utilisé). Les fonctions
  `private.*` (aides RLS, journal `rate_events`) reposent sur le fait que l'API ne les expose pas ; elles sont de toute façon révoquées pour `anon` et
  `authenticated`.
- **Thème de groupe** (`groups.theme`) et thème personnel (`profiles.theme_settings`) : JSON libre (objet, ≤ 4000 caractères, rien d'autre n'est contrôlé par
  la base). Le rendu (phase 6A) doit les valider par une **liste blanche** (préréglage connu, couleurs `#rrggbb`, jamais de CSS, d'URL ni de HTML brut) avant de les
  appliquer.

**Tester l'ancien comportement.** Pour vérifier qu'un test échoue bien sur les anciennes migrations : copier `supabase/` du commit `8f0f729`
(ou antérieur) dans un dossier à part, y mettre les nouveaux `test_0025_*.sql` et `run_local.sh`, et rejouer les deux fichiers de test avec
`psql -v ON_ERROR_STOP=0 -v ON_ERROR_ROLLBACK=on` : chaque bloc `[n]` échoue séparément.

### 20.10 Interface v2, phase 6A : interrupteur, base locale, thèmes, catégories, accueil

**Interrupteur.** Une seule variable : `NUXT_PUBLIC_V2=true` (`runtimeConfig.public.v2`, lue à l'exécution, `useV2()` / `isV2Enabled()`).
Absente, l'application est la v1 à l'identique (nav, thème figé par `NUXT_PUBLIC_EDITION`, aucune requête v2 ; les pages v2 répondent 404 grâce
au middleware `v2-only`). Choix d'une variable plutôt que d'une détection des RPC : pas de requête par rendu, comportement prévisible.
À poser dans Vercel **au moment du déploiement v2** (après 0018/0020, `SUPABASE_SECRET_KEY` comprise).

**Migration 0025** (`0025_profile_onboarding.sql`, rollback, `test_0025_profile_onboarding.sql`, branchée dans `run_local.sh`) : `update_my_profile`
gagne `p_complete_onboarding boolean default false` et renvoie `onboarded_at` (renseigné une fois, jamais remis à NULL). L'ancienne signature à 6 paramètres
est supprimée (deux surcharges rendraient les appels par nom ambigus). 0023 n'est pas modifiée. Ordre : 0017 → 0019 → 0021 → 0023 → 0024 → **0025** → 0018 → 0020.
Catégories : **aucune RPC** (les politiques `categories_*_own` de 0019 suffisent) ; ce que la base ne contrôle pas (`icon`, `color` en texte libre, pas de plafond)
l'est côté client (liste blanche, `#rrggbb`, 60 catégories) et à la lecture (`toMyCategory`).

**Base locale v2.** `npm run db:local:v2` (`supabase/local/setup_v2.sh`) : démarre la stack (`up.sh`), rejoue 0024+ (`setup.sh` ne rejoue plus 0003 → 0023 quand le
schéma social est présent : 0016/0017 ne sont pas rejouables après 0019/0020), applique `v2/0018_params.sql` + paramètres factices (`local/v2_params.sql`),
`v2/0018_v2_data_fill.sql`, `v2/0020_rls_switchover.sql`, puis crée `nouveau@local.test` (accueil en 3 écrans) et `ami@local.test` (`local/v2_accounts.sql`).
Comptes : `admin@`, `user@`, `admin2@`, `user2@`, `user3@`, `nouveau@`, `ami@local.test`, mot de passe `password123`. Rejouable. Lancer l'app :
`echo NUXT_PUBLIC_V2=true >> .env.local && npm run dev:local`. ⚠ Cette base n'est plus compatible v1 : e2e v1 (`npm run test:e2e`) sur `db:local:reset`, e2e v2
(`npm run test:e2e:v2`, `playwright.v2.config.ts`, `e2e/v2/`) sur `db:local:v2`.

**Thèmes** (`shared/themes/`). JSON de thème = entrée NON FIABLE (un créateur de groupe le fait lire à tous). `themeInputSchema` (Zod, liste blanche) : `preset`
parmi `boultons, terracotta, olive, ocean, prune, framboise, moutarde, custom` ; `primary` `#rrggbb` exactement ; `neutral` parmi 5 ; `name` lettres/chiffres/espace
et `. , ' ’ & ! ( ) -` (affiché comme texte, jamais HTML) ; `home` accepté, ignoré ; toute autre clé supprimée. Entrée invalide : thème par défaut (terracotta).
`resolveTheme()` → une `EditionConfig` : `boultons` = `boultonsEdition` tel quel (look inchangé, test d'identité), `terracotta` = `genericEdition`, les autres = édition
générique + palette générée (OKLCH, la nuance 500 = la couleur choisie ; nuance de texte AA choisie automatiquement ; couleur trop claire / trop sombre / sans contraste AA refusée
avec explication). Le CSS (`editionThemeCss`) ne contient que des variables `--color-primary-*` (hex généré), `--ui-color-neutral-*` et `--ui-primary` ; `data-edition` vaut `boultons`
ou `generic`. Thème actif (`stores/theme.ts`) : aperçu > thème du groupe (`profiles.active_theme_group_id`, chargé par `list_my_groups`) > `profiles.theme_settings` > défaut.
`plugins/edition.ts` passe par `useHead(() => …)` : rendu serveur sans flash, réactif aux changements. `useEdition()` expose `config` en accesseur (relire dans un `computed`).
Ajouter un préréglage : une entrée dans `shared/themes/presets.ts` + `schema.ts` (liste) + clé i18n `theme.preset.<id>`.

**Catégories personnelles** (`useMyCategories.ts`, `stores/categories.ts`, `CategoryManager.vue`, page `/reglages`). En v2, `useCategories()` renvoie MES catégories (identifiant, nom
FR/EN selon la langue, icône Lucide de la liste blanche, couleur) ; les filtres, la grille d'accueil et les cartes les utilisent ; `useRecipeSearch` appelle `list_cookbook`
(les tags ne sont pas filtrables : 6B). Les 9 suggestions (`SUGGESTED_CATEGORIES`, mêmes clés que 0018) s'ajoutent à la demande ou à la fin de l'accueil. Icônes `food_icons/` : non
utilisées (aucune licence, voir le rapport) ; les icônes Lucide restent.

**Accueil en 3 écrans** (`/onboarding`, middleware global `v2-onboarding`) : pseudonyme (obligatoire, erreurs de la base traduites : `shared/utils/profileErrors.ts`), titre du carnet, thème + catégories
de départ ; chaque « Suivant » enregistre son écran ; « Terminer » passe `completeOnboarding`. **Fondations pour 6B à 6E** : `useNav()` (entrées, v1 inchangé), `PromptBanner.vue` /
`PromptBanners.vue` (`pending_prompts`, `dismiss_prompt`), `NotificationBell.vue` (compteur seul ; liste = 6C), `ComingSoon.vue` + pages `/partagees`, `/amis`, `/groupes`, `/notifications`,
`/explorer/[authorId]` (à remplacer), middleware `v2-only`.

### 20.11 Interface v2, phase 6B : carnet, partage, page publique, éditeur ouvert

Tout est derrière `NUXT_PUBLIC_V2=true` : sans l'interrupteur, `/recettes` est la liste d'origine (`components/RecipesListV1.vue`, le code de l'ancienne page
déplacé tel quel), la fiche, l'éditeur et le serveur se comportent comme en v1, et `/partagees`, `/explorer/…`, `/r/…` répondent 404.

**Migration 0026** (`0026_recipe_access.sql`, rollback, `test_0026_recipe_access.sql`, branchée dans `run_local.sh` sous la chaîne complète 0018 + 0020, avec rejeu
et retour arrière) : une seule fonction de lecture, `recipe_access(p_recipe)`. Une ligne, ou aucune si la recette est inconnue ou illisible (même réponse : pas
d'oracle d'existence) : `permission` (`author` / `edit_original` / `copy` / `read`), `explicit_permission` (le droit EXPLICITE le plus haut ; `NULL` quand l'accès ne
vient que du partage implicite « mes groupes » : seul un droit explicite se repartage), `in_cookbook`, `owner_id` + `owner_name` (pseudonyme), `visibility`, `category_id`
(auteur seulement), `copied_from` + `copied_from_title` (seulement si l'original m'est lisible), `has_share_link` (auteur seulement). Pourquoi : `private.recipe_level`
n'est pas exposé et les listes de 0021 ne renvoient le droit que pour les recettes qu'elles listent ; une fiche ouverte par une bannière ou un lien devait pouvoir
afficher les bons boutons. Elle ne DÉCIDE rien : la base continue de refuser (42501). Aucune table, politique ni donnée touchée : sans effet en v1. Ordre :
… → 0025 → **0026** → 0018 → 0020 (indifférent, elle ne dépend que de 0019 et 0021).

| Écran | Fichiers | Données |
|---|---|---|
| **Mon carnet** `/recettes` | `components/CookbookPage.vue`, `RecipeProvenance.vue`, `RecipeCard.vue` (badge), `RecipeFilters.vue` (`hide-tags`) | `list_cookbook` via `useRecipeSearch` (+ `attachCopyOrigins` : `copied_from` lu sur `recipes`, titre de l'original s'il est lisible). Recherche, catégorie personnelle, pagination 24 comme en v1 ; **pas de filtre par tag** (la base n'en a pas, la recherche couvre les tags). État vide à trois entrées (créer, importer, explorer) |
| **Partagées avec moi** `/partagees` | `pages/partagees.vue`, `SharedRecipeCard.vue` | `list_shared_with_me` ; « Ajouter à mon carnet » (`add_to_cookbook`), « Faire une copie » (`copy_recipe`, absent si lecture seule) |
| **Explorer** `/explorer/[authorId]` | `pages/explorer/[authorId].vue` | `get_user_profile` (pseudonyme, titre du carnet ; page neutre si la personne n'est pas visible), `list_author_recipes`, « Ajouter », « Tout ajouter » (`add_author_recipes_to_cookbook`, ferme la bannière) |
| **Fiche** `/recettes/[id]` | `pages/recettes/[id].vue`, `recipe/RecipeActions.vue` | `recipe_access` → `recipeRights()` (`shared/utils/recipeRights.ts`) : Ajouter / Retirer, Faire une copie modifiable (puis redirection vers la copie), Partager, Modifier (auteur ou `edit_original`), Supprimer (auteur seulement) ; « Recette de X », « Inspirée de … » (lien si l'original est lisible) ; avant de supprimer, `recipe_usage` → « Cette recette est dans le carnet de N personnes et a été copiée N fois » (si N > 0) |
| **Partager** | `RecipeShareModal.vue`, `useShareRecipients.ts`, `shared/utils/recipients.ts` | Auteur : visibilité (`recipes.visibility`), droits (`list_recipe_grants`, `grant_recipe`, `revoke_recipe_grant`), lien public (`create_share_link` renvoie le jeton existant : c'est aussi la façon de le relire ; `revoke_share_link`). Non-auteur avec un droit explicite : `reshare_recipe` vers **une personne**, au plus son niveau, jamais `edit_original`, jamais un groupe. Destinataires : `list_friends`, `list_my_groups` + `list_group_members`, ou `search_users` (3 lettres). Échap ferme |
| **Page publique** `/r/[token]` | `pages/r/[token].vue`, `shared/utils/sharedRecipe.ts` | `get_shared_recipe` (client sans compte), lecture seule, portions, mode cuisine, auteur par son pseudonyme, `noindex` (balise **et** en-tête `X-Robots-Tag`), vrai 404 pour un jeton inconnu / révoqué / mal formé (même page neutre). « Ajouter à mon carnet » : connexion (modale) puis `claim_shared_recipe` puis la fiche |
| **Éditeur et traducteur** | `RecipeEditorForm.vue`, `RecipeV2Options.vue`, `useTranslator.ts`, `middleware/auth.ts` | Ouverts à tout compte connecté. L'auteur choisit **sa** catégorie (`categoryId`, obligatoire pour une recette neuve s'il en a) et la visibilité ; un détenteur d'`edit_original` ne voit ni l'une ni l'autre (la base les ignore pour lui). Le texte `category` (champ historique) suit le nom de la catégorie choisie |

**Serveur.** `requireRecipeWriter(event)` (`server/utils/auth.ts`, règle pure `recipeWriterRequirement` dans `shared/utils/v2.ts`) : `requireAdmin` en v1, `requireUser` en v2. Utilisé par
`add-recipe`, `update-recipe`, `delete-recipe`, `extract-recipe`, `transcribe-recipe`, `translate-recipe` et `recipes/similar`. Le quota IA reste celui de la phase 5 (`check_ai_quota` sous RLS : par
compte) ; le crédit et les 20 appels par jour des nouveaux comptes (phase 7) ne sont pas touchés. `recipes/similar` lit avec le client de la session (RLS), jamais le service role : elle ne
propose que des recettes lisibles (test e2e : une recette privée d'un autre n'apparaît pas). `throwSupabaseError` traduit maintenant `53400` (plafond de volume) en 409 `QUOTA_REACHED` et
`54000` (limite de débit) en 429 `RATE_LIMITED` (jamais un 500) ; `toUserMessage` les affiche traduits (`errors.sharing.*`).

**Messages d'erreur** (`sharingErrorKey`, `shared/utils/recipeRights.ts`) : `53400` quota, `54000` débit, `42501` refus, `P0002` introuvable, `22023` entrée refusée, `23505` doublon ; tout le reste = message générique
(jamais le texte technique de la base).

**À savoir.**
- Les compteurs par catégorie de l'accueil (`useRecipeFacets`) comptent maintenant le carnet complet : mes recettes (`category_id`) + les entrées `cookbook_entries` dont la recette m'est encore lisible
  (`recipes!inner`). Pas de tags en v2.
- Un lien public n'est relisible que par `create_share_link` : la fenêtre « Partager » l'appelle à l'ouverture si le lien est actif (idempotent) ; ne jamais l'appeler pour « voir l'état » d'un lien inactif (il le créerait) : l'état vient de `has_share_link`.
- Rejoindre un groupe n'ajoute rien au carnet : seules la bannière, « Ajouter » et « Tout ajouter » le font.
- Rangement d'une recette ajoutée dans une catégorie, notifications, amis, groupes : phase 6C (§ 20.12).

**Tests.** Vitest : `recipeRights.test.ts` (droits affichés par niveau, repartage plafonné, provenance, messages d'erreur, destinataires, page publique), `recipeWriter.test.ts`, `errors.test.ts`,
`useApiError.test.ts`. SQL : `test_0026_recipe_access.sql`. Playwright v2 (`npm run db:local:v2` puis `npm run test:e2e:v2`) : `cookbook.spec.ts` (copie, ajout / retrait, Explorer, « Partagées »),
`sharing.spec.ts` (lecture à un ami + vérification avec l'autre compte, repartage, retrait en chaîne, lien public en navigation sans compte puis ajout après connexion, révocation, carnet vide),
`editor.spec.ts` (éditeur ouvert à un compte non admin, `edit_original`, suppression avec avertissement d'usage, doublons limités aux recettes lisibles, IA ouverte).

### 20.12 Interface v2, phase 6C : amis, groupes, notifications, rangement d'une recette ajoutée

Tout est derrière `NUXT_PUBLIC_V2=true` (middleware `v2-only`, 404 sinon ; v1 inchangée). **Aucune migration** : les 29 RPC de 0023 et les politiques de 0019 suffisent.

**Rangement d'une recette ajoutée (décision de base de données).** `add_to_cookbook(recette, catégorie)` est idempotente mais garde l'ancienne catégorie quand on lui passe `NULL` (`coalesce`), donc ne sait pas « sortir » une recette d'une catégorie. La politique `cookbook_entries_update_own` (0019) autorise déjà l'écriture directe de `category_id` sur MES lignes, avec `with check` : la catégorie doit m'appartenir (une autre : 42501) ; `grant update (category_id)` limite la colonne. L'interface écrit donc directement (`setEntryCategory` / `getEntryCategory` dans `useCookbook.ts`, `.update().select()` : 0 ligne = P0002). **Pas de 0027** (les migrations 0017 à 0026 ne sont pas touchées). Composant `EntryCategoryPicker.vue` (liste native, libellé « Catégorie », « Sans catégorie »), sur la fiche (`recipe-entry-category`, recette ajoutée seulement, jamais pour l'auteur) et sur la carte du carnet (`relation = 'added'`). Le filtre par catégorie du carnet suit déjà (`list_cookbook`).

| Écran | Fichiers | Données |
|---|---|---|
| **Amis** `/amis` | `pages/amis.vue`, `UserSearch.vue`, `ConfirmDialog.vue` | `list_friends`, `list_friend_requests`, `search_users` (3 lettres, 300 ms), `send_friend_request`, `respond_friend_request`, `cancel_friend_request`, `remove_friend` (confirmé). Demandes reçues (accepter / refuser) et envoyées (annuler ; refusée : date de relance `retry_after`, « Relancer » grisé avant). Une demande refusée ne rend pas la personne visible (`can_see_profile`) : pas de lien vers son profil |
| **Profil** `/personnes/[id]` | `pages/personnes/[id].vue` | `get_user_profile` : pseudonyme, titre du carnet, statut d'amitié et l'action correspondante (`profileFriendAction`), groupes en commun (liens), « Ses recettes » → `/explorer/[authorId]` (qui renvoie vers le profil : « Voir le profil de X »). Personne non visible, inconnue ou identifiant mal formé : page neutre. Après un retrait d'ami, retour à `/amis` (la personne n'est plus visible sans groupe commun) |
| **Groupes** `/groupes` | `pages/groupes/index.vue` (ancienne `groupes.vue` déplacée : `/groupes/[id]` en a besoin) | `list_my_groups`, `list_group_invitations` (reçues), `create_group`, `respond_group_invitation`. L'écran dit que **rien n'est ajouté au carnet**, puis affiche la bannière « Explorer les recettes de X » (`PromptBanners`, `refreshNuxtData('pending-prompts')`) |
| **Un groupe** `/groupes/[id]` | `pages/groupes/[id].vue` | Membres (`list_group_members`, liens vers les profils), « Quitter » (membre). Créateur, même page : `rename_group`, `update_group_theme` (`ThemePicker` de la 6A : liste blanche Zod `themeInputSchema`, aperçu en direct, jamais de CSS ni d'URL), `invite_to_group` (amis puis recherche), `create_invite_link` (jeton **montré une seule fois**, 7 jours, usage unique ; la page ne le garde qu'en mémoire), `cancel_group_invitation`, `remove_group_member` / `transfer_group_ownership` / `delete_group` (confirmations qui expliquent la conséquence ; suppression : « les recettes restent, seuls les accès donnés au groupe disparaissent »). **Thème actif** : « Utiliser le thème de ce groupe » / « Revenir à mon thème » (`update_my_profile(p_active_theme_group_id)` comme dans Réglages, qui le gérait déjà ; `loadGroupThemes(true)` avant) |
| **Lien d'invitation** `/rejoindre/[jeton]` | `pages/rejoindre/[token].vue` | Visiteur : bouton « Se connecter pour rejoindre » (modale). Connecté : bouton « Rejoindre » → `redeem_invite_link`. **Jamais automatique** (un aperçu de lien consommerait ce lien à usage unique). Jeton mal formé, inconnu, expiré ou utilisé : le même message neutre (`inviteLinkErrorMessage`) ; propre lien et limite de débit restent distincts. Un compte neuf passe par l'accueil en 3 écrans après avoir rejoint (le groupe est déjà rejoint) |
| **Notifications** `/notifications` | `pages/notifications.vue`, `useUnreadNotifications.ts`, `NotificationBell.vue` | `list_notifications` (30 par page, « Voir plus » par `before`), `mark_notifications_read` : une notification s'ouvre (marquée lue) vers sa ressource, ou « Tout marquer comme lu » (aussi celles hors page). Texte FR / EN par genre : `notificationView` + `notifications.types.*` (9 genres de 0023 ; un genre inconnu est masqué, un identifiant mal formé supprime le lien). Cloche : état partagé `useState('notifications-unread')`, relu à l'ouverture, à chaque navigation, au retour sur l'onglet (`visibilitychange`, `focus`) et toutes les 60 s ; pas de temps réel |

**Logique pure** (`shared/utils/socialUi.ts`, testée dans `test/unit/socialUi.test.ts`) : `socialErrorMessage` (54000 limite de débit, 22023 selon la phrase de 0023 : relance dans N jours, « répondez-y », invitation refusée récemment, déjà membre, créateur qui part…, P0002 introuvable, 42501 réservé au créateur, 55000 conflit ; jamais le texte brut de la base), `notificationView`, `profileFriendAction`, `canRetryRequest`, `groupRights` / `memberRights` (le créateur gère tout et ne part pas ; retirer et transférer jamais sur soi ni sur le créateur). Ce sont des règles d'AFFICHAGE : la base décide (42501 / P0002). Messages dans `errors.social.*` ; `useSocialError()`.

**À savoir.**
- Pièges rencontrés : (1) `useAsyncData` qui remplit une `ref` locale dans son callback ne rejoue pas ce callback côté navigateur après le rendu serveur : renvoyer les données et recopier (`notifications.vue`). (2) Pendant un `refresh()`, `pending` est vrai : ne pas remplacer toute la page par un chargement (`pending && !group`), sinon la recherche en cours se démonte. (3) `components/<dossier>/X.vue` s'appelle `DossierX` : les composants de la 6C sont à plat.
- Aucune personne n'est « amie » pour inviter : l'invitation passe par `invite_to_group` (créateur seulement), la liste d'amis n'est qu'un raccourci.
- Limites de débit (par jour et par personne, 54000) : 20 demandes d'ami, 20 invitations (personne ou lien). Elles ne se remettent pas à zéro en annulant ; les e2e les vident (`cleanup6C`, SQL local).
- Un lien d'invitation n'est plus lisible après création (seule l'empreinte SHA-256 est stockée) : il faut en recréer un.

**Tests.** Vitest : `socialUi.test.ts` (erreurs, notifications, droits, rangement). Playwright v2 (`npm run db:local:v2`, `npm run test:e2e:v2`) : `social.spec.ts` (`6c-friends1..3`, `6c-groups1..6`, `6c-notifs1..2`, `6c-category`) ; il utilise `sqlLocal` (conteneur Docker `supabase_db_recettes-des-boultons`, variable `E2E_DB_CONTAINER`) pour vider `private.rate_events`, les notifications et fabriquer des cas (35 notifications, un genre inconnu), et remet `admin@` / `user@` sur le thème « Les Boultons ». `navigation.spec.ts` suit les pages réelles. Fin de travail : `npm run db:local:reset` pour revenir à l'état v1.

### 20.13 Interface v2, phases 6D et 6E : réglages du compte, légal, accueil visiteur, signalements

**Interrupteur.** Tout est derrière `NUXT_PUBLIC_V2=true`. **Choix : les pages légales, le pied de page et l'écran support sont aussi v2 seulement** (404 sans l'interrupteur,
middleware `v2-enabled`, test `e2e/legal-v1.spec.ts`). Raisons : la v1 est un site privé de 4 comptes sans partage ni signalement ; la politique de confidentialité décrit
la v2 (amis, groupes, liens publics, signalements, IA ouverte à tous) et serait inexacte en v1 ; le pied de page v1 reste celui d'origine (aucun e2e v1 touché).
Le jour de la bascule, les pages arrivent avec le reste.

#### 6D : réglages, export, suppression

| Écran | Fichiers | Données |
|---|---|---|
| **Préférences** (`/reglages`) | `pages/reglages.vue`, `useProfileSettings().savePreferences`, `useAccount().updateMyPreferences` | **langue** (`profiles.language`, `fr` / `en`) et **notifications** (`profiles.notifications`, **booléen**, `true` par défaut) : écriture directe dans MA ligne (ces colonnes font partie des 11 que l'API autorise, § 20.9 ; `update_my_profile` ne les gère pas) ; **visible dans la recherche** : `update_my_profile(p_discoverable)`. Choisir l'autre langue bascule l'interface (`setLocale`). La préférence n'est PAS relue au chargement (ne pas imposer une langue à qui navigue en anglais) : elle servira aux e-mails (phase 7). « Notifications par e-mail » : le réglage est enregistré ; les e-mails (demande d'ami, invitation de groupe) partent depuis la phase 7 si Resend est configuré (§ 20.15), l'écran le dit. Pseudonyme, titre du carnet et thème : 6A, inchangés |
| **Export** | `AccountExport.vue`, `shared/utils/account.ts` (`buildExportFile`, `exportErrorKey`), `app/utils/download.ts` | RPC `export_my_data` ; fichier `mes-donnees-recettes-AAAA-MM-JJ.json`, JSON indenté `{ export: { generated_at, format_version, note }, data: <réponse de la RPC> }`, fabriqué dans le navigateur. 3 par jour : `54000` → « déjà fait 3 exports aujourd'hui ». **Les photos ne sont pas incluses** (zip des photos non fait en phase 8 : voir § 20.14) |
| **Suppression** | `AccountDeletion.vue`, `classifyDeletionError`, `emailMatches`, `hasPasswordLogin` | 1) `account_deletion_blockers()` : s'il y a des groupes, écran de blocage (nom, nombre d'autres membres, lien « Gérer ce groupe » → `/groupes/<id>`). 2) Sinon confirmation : ce qui disparaît, saisie de l'adresse e-mail du compte (bouton grisé tant qu'elle ne correspond pas, casse ignorée). 3) `POST /api/account/delete { confirmEmail }`. 401 `REAUTH_REQUIRED` → fenêtre de reconnexion (mot de passe : `signInWithPassword` donne un jeton neuf, puis la suppression est rejouée ; compte Google seul : message « déconnectez-vous et reconnectez-vous avec Google », `app_metadata.providers` sans `email`). 409 → relire les blocages. 400 → adresse différente. 4) Déconnexion puis `/compte-supprime` (page publique v2, `noindex`) |

#### 6E : légal, pied de page, accueil visiteur, signalement

| Écran | Fichiers | Remarques |
|---|---|---|
| **Pages légales** | `shared/legal/{types,fr,en,index}.ts`, `LegalPage.vue`, `pages/{mentions-legales,confidentialite,conditions,cookies}.vue` | Contenu structuré en TypeScript (pas en JSON i18n : textes longs), parité FR / EN vérifiée par `test/unit/legal.test.ts`. En-tête de `fr.ts` : « à relire, pas un avis juridique » + liste de ce que Nina doit vérifier. Mentions : **option (a)** (aucun nom ni adresse), hébergeurs Vercel et Supabase (adresses copiées de leurs pages officielles le 2026-10-24 ; base en région `eu-west-3`, Paris). Date de version : `LEGAL_UPDATED` |
| **Contact configurable** | `runtimeConfig.public.contactEmail` (`NUXT_PUBLIC_CONTACT_EMAIL`), `useContactEmail()`, `normalizeContactEmail` | Présent : lien `mailto:` dans les pages et « Contact » dans le pied de page. Absent ou mal formé : texte de repli (« une adresse sera publiée prochainement », les droits s'exercent depuis Réglages), aucun lien |
| **Pied de page** | `AppFooter.vue`, `layouts/default.vue` | v2 : liens légaux (+ contact) sur mobile **et** bureau ; le bas est dégagé de la barre d'onglets (`pb-[calc(4.5rem+env(safe-area-inset-bottom))]`, test de position). v1 : pied d'origine (bureau seulement), inchangé |
| **Accueil visiteur** | `home/HomeVisitor.vue`, `pages/index.vue` | v2 + non connecté : présentation neutre (carnet, partage, import IA, bilingue), « Créer un compte » (`AuthModal` `initial-mode="signup"`) et « Se connecter ». Aucune requête de recettes, aucune marque de groupe. L'inscription renvoie vers conditions et confidentialité |
| **Signaler** | `ReportModal.vue`, `useReports.ts`, `shared/schemas/reports.ts`, `shared/utils/reports.ts` | Lien sur la fiche d'une recette qui n'est pas la mienne (`recipe_access.permission !== 'author'`) : insertion dans `reports` (politique `reports_insert_own`). Page `/r/<jeton>` : **connexion requise** (le lien ouvre la modale de connexion, puis la fenêtre de signalement), RPC `report_shared_recipe` (migration 0027 : la page publique n'a pas l'identifiant de la recette). Motifs `illegal`, `copyright`, `spam`, `other` ; détails ≤ 2000. Limite de 10 par jour (`54000`, déclencheur de 0023, partagée par les deux chemins) : message clair. Échap ferme |
| **Support** | `pages/support/signalements.vue`, middleware `v2-support`, lien « Signalements » dans le menu des admins | Réservé à `isAdmin` (404 sinon ; la base décide : `reports_select_support` / `reports_update_support`, `private.is_support()`). Liste `open` + `reviewed` ; passer à `reviewed`, `actioned`, `dismissed` (colonnes `status`, `handled_at`) ; ouvrir la recette (lisible par le support tant qu'un signalement est ouvert ou examiné, `can_read_recipe`) ; supprimer la recette (`recipes_delete_author_or_support`, v2/0020 ; le signalement passe d'abord à `actioned`, puis `recipe_id` devient NULL ; la photo du bucket est retirée au mieux). **Les politiques de 0019 et 0020 suffisent** (testé dans `test_0027_report_shared_recipe.sql` et en e2e) |

**Migration 0027** (`0027_report_shared_recipe.sql`, rollback, `test_0027_report_shared_recipe.sql`, branchée dans `run_local.sh` sous la chaîne complète avec rejeu et retour arrière) :
`report_shared_recipe(p_token uuid, p_reason text, p_details text default null) returns uuid`, `security definer`, `search_path` vide, `authenticated` seulement (pas `anon` : sans identité, pas de limite de débit possible),
jeton inconnu ou révoqué `P0002`, motif inconnu ou détails > 2000 `22023`, limite par le déclencheur de 0023. Aucune table, politique ni donnée touchée : sans effet en v1. Ordre : … → 0026 → **0027**.
`SUPABASE_SECRET_KEY` : désormais aussi dans `.env.local.example` (clé service_role LOCALE, publique et fixe) pour les e2e de suppression.

**Ce que disent les textes (vérifié dans le code).** Cookies : `sb-…-auth-token` (session Supabase), `i18n_redirected` (langue) ; stockage local `nuxt-color-mode`, `shopping:prefs`, `offline:shopping:v1` ; session `auth:redirect` ; service worker et caches (pages vidées à la déconnexion, aucune requête Supabase ni `/api/**` en cache) ;
aucune mesure d'audience, aucune publicité, polices servies par le site (`@nuxt/fonts`) → **pas de bandeau** (stockages strictement nécessaires ou choisis par la personne). OpenAI reçoit le texte collé ou dicté (audio), les photos et PDF, et le texte d'une recette à traduire ; **jamais** l'e-mail ni l'identifiant (prompts, `translate.ts`, `media.ts`) ;
`ai_usage` ne garde ni le contenu ni les prompts. Sentry : `dataCollection` à `false` partout (utilisateur, cookies, en-têtes, corps, paramètres d'URL, variables locales), traces 10 % en production ; **le réglage « Prevent Storing of IP Addresses » du projet Sentry reste à confirmer par Nina** (la page affirme que les adresses IP ne sont pas conservées).
Photos : bucket `recipe-photos` public (lecture par adresse exacte) à l'époque de 6E ; la phase 8 l'a rendu privé après la bascule et le texte a été mis à jour (§ 20.14). Aucun e-mail de notification n'est envoyé (phase 7) ; seuls ceux de Supabase Auth (confirmation, réinitialisation) existent.

**Tests.** Vitest : `account.test.ts` (fichier d'export, erreurs, blocages, confirmation, reconnexion, préférences), `reports.test.ts` (schémas, erreurs, écran support, appels), `legal.test.ts` (parité FR / EN, contact), `i18n.test.ts` (parité des clés).
SQL : `test_0027_report_shared_recipe.sql`. Playwright v2 (`npm run db:local:v2` puis `npm run test:e2e:v2`) : `account.spec.ts` (réglages, export téléchargé + limite, suppression bloquée puis réussie, reconnexion exigée simulée sur la 1re réponse puis vraie suppression, jeton récent accepté, Échap), `reports.spec.ts` (fiche, limite, page publique avec connexion, support : examiner, traiter, supprimer, accès refusé aux membres), `legal.spec.ts` (accueil visiteur, pages FR / EN, pied de page bureau et mobile) ; v1 : `e2e/legal-v1.spec.ts` (404).
**Limite connue** : le 401 `REAUTH_REQUIRED` réel (jeton de plus de 10 minutes) ne peut pas être fabriqué en e2e (la pile locale signe en ES256) : la règle est testée en unitaire (`recentAuth.test.ts`) et le parcours d'interface avec une réponse simulée.
Fin de travail : `npm run db:local:reset` pour revenir à l'état v1.

### 20.14 Phase 8 : photos privées

**Interrupteur.** Sans `NUXT_PUBLIC_V2=true` rien ne change : bucket public, `getPublicUrl`, `NuxtImg`, suppression des photos par le navigateur (admin). Rendre le bucket
privé **casse la v1** (ses adresses publiques ne répondent plus) : ce changement est donc dans un fichier de **bascule**, appliqué le jour J **après 0020**, avec le déploiement du code v2.

#### Base de données

| Fichier | Rôle | Quand |
|---|---|---|
| `supabase/migrations/0029_shared_recipe_photo.sql` (+ `rollback/0029_shared_recipe_photo_down.sql`) | `public.shared_recipe_photo_path(p_token uuid) returns table (recipe_id uuid, photo_path text)` : id et chemin de la photo de la recette derrière un jeton de lien public actif, aucune ligne sinon ou si le chemin n'est pas `<id de la recette>/…` ; pose aussi la contrainte `recipes_photo_path_in_own_folder` (NOT VALID, validée si les données passent ; même contrainte que `v2/0020`, idempotente, retours arrière coordonnés). `security definer`, `search_path` vide, **`service_role` seulement** (le chemin contient l'id de la recette, que `get_shared_recipe` cache exprès). Sans effet en v1 | tout de suite (avec 0026, 0027) |
| `supabase/v2/0029_private_photos_switchover.sql` (+ `rollback/0029_private_photos_switchover_down.sql`) | `storage.buckets.public = false` pour `recipe-photos` ; politiques `storage.objects` : lecture `can_read_recipe(recipe_id_from_path(name))`, écriture et remplacement `can_edit_recipe(…)` (auteur ou `edit_original`, comme 0020), **suppression réservée à l'auteur** (`is_recipe_owner`, nouvelle politique `recipe_photos_delete_owner` ; 0020 permettait à tout éditeur). Aucune donnée touchée. Refuse de tourner si 0020 n'est pas appliquée | le jour J, après 0020 |

Les chemins ne changent pas (`<id de la recette>/<horodatage>.webp`) : aucun fichier à déplacer. Aucune politique pour `anon`. Le retour arrière du jour J : **jouer `0029_private_photos_switchover_down` AVANT `0020_rls_switchover_down`**.
Tests : `supabase/tests/test_0029_private_photos.sql` (branché dans `run_local.sh` sous la chaîne complète : rejeu, test, retour arrière avec empreinte des politiques vérifiée, ré-application). Ce que le harnais prouve : bucket privé, co-membre lit, étranger et `anon` ne voient rien,
un lecteur ne téléverse pas, un éditeur `edit_original` téléverse mais ne supprime pas, l'auteur supprime, `service_role` contourne, fonction réservée à `service_role`. Ce qu'il ne peut pas prouver (pas de vrai Storage) : la signature des URL et le refus HTTP d'une adresse publique : couverts par l'e2e `photos.spec.ts` (vraie pile locale).
`supabase/local/setup_v2.sh` applique désormais aussi `v2/0029` (la base locale v2 est celle d'après la bascule).

#### Affichage (v2)

* **`usePhotoSrc(path)`** (`useRecipePhoto.ts`) : v1 = `publicUrl` (synchrone, rendu serveur comme avant) ; v2 = URL signée **côté navigateur** avec le client de la personne (le RLS décide : `createSignedUrls`), l'illustration de repli reste visible le temps de la signature. Pas de signature pendant le rendu serveur.
* **Résolveur** (`app/utils/signedPhotoUrls.ts`, testé) : les demandes d'une même courte fenêtre (10 ms : les cartes d'une liste) partent en **un seul** `createSignedUrls` (lots de 100) ; durée 1 h ; l'URL est **réutilisée tant qu'il lui reste plus de 5 minutes** (même adresse = le cache HTTP du navigateur resert l'image) ; mémorisée dans `sessionStorage` (le temps de l'onglet), vidée quand l'identité change (`auth.ts`) ; un chemin refusé donne `null` (illustration de repli), jamais d'erreur.
* **`RecipePhoto.vue`** (cartes du carnet, « partagées avec moi », explorer, planning, choix d'une recette du planning) : v1 = `NuxtImg` (inchangé) ; v2 = `<img>` natif. **Choix : pas de `NuxtImg` pour les photos privées** : chaque signature change l'adresse, donc l'optimiseur d'images de Vercel (ou ipx) compterait une nouvelle image source à chaque fois, sans cache possible. La photo est déjà réduite au téléversement (1 600 px, WebP) ; coût : la carte charge la photo entière. Piste si l'egress inquiète : miniatures de 400 px produites au téléversement (un second fichier).
* **Fiche** (`RecipeHero` : prop `photoSrc`) : la v2 affiche maintenant la photo en tête de la fiche (la v1 n'en avait pas, inchangée). **Éditeur** (`PhotoField`) : aperçu signé.
* **Page publique `/r/<jeton>`** : `<img src="/api/v2/shared/<jeton>/photo">`. La route (`server/api/v2/shared/[token]/photo.get.ts`, 404 hors v2) valide le jeton (UUID), lit le chemin avec `shared_recipe_photo_path` (service_role), le revérifie (`photoPathParts` : `<uuid>/<fichier>` seulement), signe **2 minutes** avec la clé service_role et répond **302** (`Cache-Control: private, max-age=60`). **Elle ne lit ni la query, ni le corps, ni les en-têtes** (un test le garantit) : un chemin fourni par le client n'est jamais signé. Jeton mal formé, inconnu, révoqué ou recette sans photo : le même 404.

#### Écritures serveur (v2)

* **Copie** : `POST /api/v2/recipes/<id>/copy` (`server/api/v2/recipes/[id]/copy.post.ts`). `copy_recipe` avec la session de la personne (c'est lui qui vérifie le droit de copier : 42501 → 403), puis le chemin de la photo source est lu en base avec cette même session, l'objet est copié avec la clé service_role vers `<id de la copie>/<horodatage>.<ext>` et `recipes.photo_path` de la copie est renseigné (`where owner_id = la personne`). **Au mieux** : si la photo ne se copie pas, la recette est copiée quand même (`photoCopied: false`, échec journalisé). Logique dans `server/utils/photos.ts` (`copyRecipeWithPhoto`, testée avec de faux ports). Côté interface : `copyRecipeWithPhoto` dans `useCookbook.ts` (fiche et « partagées avec moi »), les erreurs portent le SQLSTATE attendu par `sharingErrorKey`. La RPC `copy_recipe` seule (sans photo) reste.
* **Remplacement / retrait** : `PUT /api/update-recipe` lit l'ancien `photo_path` avant l'enregistrement et, **après** l'enregistrement réussi, supprime l'ancien objet (service_role, seulement s'il est dans le dossier de la recette et différent du nouveau) : un éditeur `edit_original` n'a pas le droit de supprimer. L'éditeur ne supprime plus lui-même en v2.
* **Suppression d'une recette** : `DELETE /api/delete-recipe` vide le dossier `<id>/` (service_role) **après** la réussite de `delete_recipe` (une suppression refusée ne fait pas perdre la photo). En v1 le navigateur le fait avant, comme avant (`recipesStore.deleteRecipe`).
* **Suppression de compte** : vérifiée, rien à changer : `collectPhotoPaths` liste par préfixe tout le dossier de chaque recette dont la personne est l'auteur (donc aussi les photos posées par un éditeur et les restes orphelins), les copies de la personne ont leur propre dossier. Test ajouté.

#### PWA et hors ligne

Les photos privées ne sont **jamais mises en cache** par le service worker : les URL signées sont sur le domaine Supabase (aucune règle ne les concerne, voir le commentaire de `nuxt.config.ts`), `/api/**` n'est pas en cache non plus, et le cache d'images (`/images/`, `/_ipx/`) ne reçoit plus de photo en v2. Raison : une photo privée ne doit pas survivre dans un cache après la déconnexion. **Hors ligne** : les cartes et la fiche gardent leur illustration de catégorie (les pages visitées restent lisibles), les photos n'apparaissent pas ; le cache HTTP du navigateur peut servir une photo déjà vue tant que l'adresse signée n'a pas changé (même onglet).

#### Export des photos : non fait (décision)

Un zip côté serveur ne tient pas sur Vercel Hobby : réponse non diffusée plafonnée à 4,5 Mo (50 photos de 200 Ko = 10 Mo), mémoire et durée limitées, jusqu'à 2000 recettes. **Alternative documentée, à faire plus tard** : un bouton « Télécharger mes photos » dans Réglages qui, dans le navigateur, demande les URL signées de MES recettes par lots (`createSignedUrls`, déjà là), télécharge chaque photo et assemble un zip avec `fflate` (déjà une dépendance), sans passer par le serveur. Les textes légaux et l'export JSON disent toujours que les photos n'y sont pas.

#### Textes légaux

`shared/legal/{fr,en}.ts`, section `photos` de la politique de confidentialité : décrit l'état d'après la bascule (photos privées, liens temporaires d'environ une heure, lien public = photo visible par qui a le lien, copie = photo propre à la copie, ancienne photo effacée au remplacement, photos effacées avec la recette et le compte). Parité FR / EN vérifiée par `legal.test.ts`. **À ne mettre en ligne qu'avec la bascule.**

#### Limites connues

1. Une photo téléversée puis jamais rattachée (l'enregistrement échoue après le téléversement) reste dans le dossier de la recette : elle est supprimée avec la recette ou le compte, pas avant. Pas de ménage planifié (cron limité à une fois par jour sur Hobby).
2. Les objets d'une recette supprimée dont le nettoyage a échoué (journalisé, Sentry) restent orphelins : à vérifier à la main (`storage.objects` sans `recipes.id` correspondant).
3. Une URL signée est un « porteur » : quiconque la reçoit la lit jusqu'à son expiration (1 h pour l'affichage connecté, 2 minutes pour la page publique).
4. Le lien public d'une recette montre sa photo à toute personne qui a le lien, comme le reste de la recette.
5. `copy_recipe` (SQL) ne copie toujours pas la photo : seule la route serveur le fait. Un appel direct à la RPC (hors interface) produit une copie sans photo.
6. Les e2e de la phase 8 (`e2e/v2/photos.spec.ts`) ne tournent que sur la base v2 après `v2/0029`.

### 20.15 IA ouverte à tous, crédit épuisé et e-mails (phase 7, migration 0028)

Tout est derrière `NUXT_PUBLIC_V2=true` : **sans l'interrupteur, les routes IA gardent `assertAiQuota` / `check_ai_quota` (0012), `throwAiProviderError` et leurs statuts d'avant (402 pour 402/429)**, les gabarits d'e-mails ne partent jamais et `GET /api/ai/status` répond « disponible ».

#### Quota par compte
| Règle | Où |
|---|---|
| Plafond du jour (minuit Europe/Paris, comme `check_ai_quota`) = **`profiles.ai_daily_quota` si renseigné** (posé par le support, jamais modifiable par l'API : pas de droit de colonne), sinon **`AI_NEW_ACCOUNT_DAILY_QUOTA` (20)** pour un compte créé il y a moins de `AI_NEW_ACCOUNT_DAYS` (30) jours, sinon **`AI_DAILY_QUOTA`** (50, quota actuel des comptes existants) | RPC `ai_quota_status(p_default_quota, p_new_quota, p_new_days)` → `{ used, quota, resets_at, is_new, has_override }` |
| **Choix de la règle « nouveau »** : l'âge du compte (`profiles.created_at`), pas l'appartenance au groupe historique : une seule colonne déjà là, rien à maintenir, les comptes Boultons (créés avant) gardent leurs 50 sans traitement, un compte de confiance passe à 50 après 30 jours. Pour faire autrement pour une personne : `update profiles set ai_daily_quota = N where email = '…'` (0 coupe l'IA pour ce compte) | |
| Le décompte inclut les appels réussis **et** en erreur (`ai_usage`), toutes fonctions (import texte / photo / PDF, dictée, traduction à l'enregistrement) | `ai_usage` |

#### Garde et erreurs côté serveur
`server/utils/ai/guard.ts` (branchement Nuxt) → `availability.ts` (pur, testé) : `assertAiAllowed(event, supabase, config)` remplace `assertAiQuota` dans `translate-recipe`, `extract-recipe`, `transcribe-recipe` et la traduction à l'enregistrement (`translations.ts`). En v2 :

| Situation | Réponse | `data.code` | Interface |
|---|---|---|---|
| Crédit du fournisseur épuisé (`system_alerts.ai_credit` = alert) **ou** budget du mois atteint | **503** « momentanément indisponibles… saisir la recette à la main » (même texte pour les deux) | `AI_UNAVAILABLE` (`data.reason` = `credit` / `budget`) | bandeau jaune « L'IA est momentanément indisponible » pour tout le monde, boutons IA désactivés |
| Plafond du jour de CE compte atteint | **429** « Quota du jour atteint (N appels…) » | `AI_QUOTA_REACHED` (`quota`, `resetsAt`) | bandeau bleu « Quota du jour atteint… remis à zéro le 25 octobre à 00:00 (heure de Paris) », boutons désactivés ; en dessous du plafond : « Il vous reste N appels aujourd'hui » |
| Le fournisseur ralentit (429 `rate_limit_exceeded`) | **503** « très sollicité, réessayez dans une minute » | `AI_BUSY` | message d'erreur, **aucune alerte**, rien de désactivé |

`GET /api/ai/status` → `{ available, reason: 'credit' | 'budget' | 'quota' | null, quota, since }` alimente `useAiStatus()`, `AiStatusNotice.vue` et `RecipeTranslator.vue` (champ de fichier, Drive, dictée et bouton « Structurer » désactivés ; le texte reste modifiable). Le crédit/budget prime sur le plafond personnel. Une RPC absente (0028 non appliquée) ne bloque personne (journalisé).

**Classification des erreurs** (`server/utils/ai/billing.ts`, `classifyAiError`) : `billing` = 402, code ou type `insufficient_quota` / `billing_hard_limit_reached` / `billing_not_active`, ou message « exceeded your current quota » / « credit balance is too low » ; `rate_limit` = 429 sans signe de facturation (code `rate_limit_exceeded` prioritaire, même si le message cite la facturation) ; `auth` (401/403) ; `timeout` (408/504). En v1 l'ancien mapping est conservé (402 et 429 → 402).

#### Crédit épuisé : enregistrer, prévenir, rouvrir
1. **Enregistrer** : à la première erreur `billing`, `throwAiFailure` appelle la RPC **`report_ai_billing_error()`** (service_role seulement, via `SUPABASE_SECRET_KEY`) : passe `system_alerts.ai_credit` à `alert` (`first_seen`, `last_seen`, `count`) et répond **TRUE si un e-mail doit partir** : mise à jour atomique de `notified_at` (au plus **un e-mail par 24 h**, même avec des requêtes simultanées ; une alerte qui revient dans la journée ne renvoie rien). Sans clé service_role, l'échec est journalisé et la requête garde son erreur normale.
2. **Prévenir Nina** : `sendAiCreditAlert` → `ALERT_EMAIL` (jamais en dur), par Resend ; sans Resend ou sans `ALERT_EMAIL` : journal seulement.
3. **Prévenir tout le monde** : `ai_service_status()` (RPC SANS argument pour tout compte connecté) renvoie `credit_exhausted` et `budget_exceeded` (booléens, seuils lus dans `private.app_settings`, jamais passés par l'appelant : relecture n° 3) ; les totaux du mois, `last_seen`, `count` ne sont rendus qu'au support.
4. **Rouvrir** (deux voies, la plus économique d'abord) : **(a) bouton « Réactiver l'IA »** de l'écran support (`SupportAiStatus.vue` en tête de `/support/signalements`, RPC `support_reset_ai_credit()`, refusée à tout autre compte, `42501`) : gratuit, immédiat, à utiliser après avoir rechargé le crédit ; **(b) route `GET /api/cron/ai-credit-probe`** (cron Vercel, **une fois par jour** sur Hobby, `0 5 * * *`) : **si et seulement si l'alerte est active**, un appel d'essai (`generateText`, prompt « ping », 16 jetons de sortie au plus, sans nouvel essai) ; réponse OK → `reset_ai_credit_alert()` ; toujours sans crédit → l'alerte reste ; autre erreur → rien. **Coût : ~0,000003 $ par jour d'alerte, 0 $ sinon.** Choix volontairement simple : pas de « sonde toutes les 10 minutes » du dossier §6.5 (Hobby = 1 passage par jour ; le bouton couvre l'urgence). Piste si besoin : laisser passer un appel réel toutes les 15 minutes quand l'alerte est active.
5. **Rien n'est perdu** : l'enregistrement d'une recette ne dépend jamais de l'IA ; la traduction échoue en `failed` (raison `provider`) et reste en attente jusqu'au prochain enregistrement (le rattrapage automatique des traductions du dossier §6.5 n'est pas fait, voir « Reste à faire »).
6. **Tester sans IA** : le fournisseur `mock` simule les pannes par un marqueur dans le texte collé : `__MOCK_AI_NO_CREDIT__` (429 `insufficient_quota`) et `__MOCK_AI_RATE_LIMIT__` (429 `rate_limit_exceeded`).

#### Budget mensuel
`AI_MONTHLY_BUDGET_CALLS` (appels du mois civil Europe/Paris, tous comptes, réussis et en erreur) et/ou `AI_MONTHLY_BUDGET_USD` (somme de `ai_usage.estimated_cost_usd`), `0` = aucun. Appliqué atomiquement par `reserve_ai_call` (§ 20.16) et exposé en booléen par `ai_service_status` ; au-delà : 503 `AI_UNAVAILABLE` / `reason: budget`, même bandeau que « crédit épuisé », e-mail d'alerte à Nina via `claim_ai_alert_email('ai_budget')` (même limite d'un par 24 h, sans changer l'état du crédit). Se réinitialise tout seul au changement de mois. Valeur suggérée au lancement : `AI_MONTHLY_BUDGET_USD=5` (le dossier §6.4 : ≈ 3 $ pour 1 000 recettes importées).

#### Traduction automatique des recettes
`add-recipe` et `update-recipe` appellent `translateRecipe` après l'enregistrement, avec `requireRecipeWriter` : **en v2, toute personne qui crée ou modifie sa recette déclenche la traduction** (en v1 seulement les admins, seuls autorisés à écrire). **Choix : le coût est compté sur le quota de l'auteur** (une ligne `ai_usage`, `feature = translate_recipe`, dans son plafond du jour), pas sur un budget à part : simple, équitable, et le budget mensuel global reste le filet. Conséquence : quelqu'un qui a épuisé ses appels enregistre quand même sa recette, la traduction reste « à refaire » (`failed`/`quota`) jusqu'au prochain enregistrement. Crédit coupé ou budget atteint : aucun appel, `failed`/`provider`. Un import par l'IA enregistre les deux langues en un seul appel (aucun appel de plus à l'enregistrement).

#### E-mails (Resend, `server/utils/email.ts`)
* **Tout par variables d'environnement** : `RESEND_API_KEY`, `EMAIL_FROM` (domaine **vérifié** dans Resend), `ALERT_EMAIL`, `SITE_URL` (liens ; sinon l'adresse de la requête ; aussi redirection de l'ancienne adresse, § 20.18), `EMAIL_APP_NAME` (défaut : « Family Cookbook »). **Sans clé ou sans expéditeur : aucun appel réseau, une ligne de journal sans adresse ni contenu, aucune erreur pour la personne.** Un refus de Resend ou une panne réseau donne `failed`, jamais une exception ; la clé n'est jamais journalisée. `sendEmail(config, message, fetchImpl)` prend le `fetch` en paramètre (tests avec un Resend simulé).
* **Gabarits** (`emailTemplates.ts`, FR/EN selon `profiles.language`, `/en/…` pour les liens anglais) : invitation à un groupe, demande d'ami, alerte de crédit / de budget pour Nina (français). Texte simple : pseudonyme et nom de groupe seulement (échappés, bornés à 60 caractères), **aucune adresse e-mail (ni celle de la personne, ni celle d'un tiers), aucun contenu de recette**, lien vers l'application et rappel pour couper ces e-mails (Réglages).
* **Déclenchement : cron, pas Database Webhook.** Les notifications naissent de déclencheurs SQL (0023). Un webhook demanderait une adresse publique, un secret partagé et un envoi immédiat ; or le plan Hobby n'autorise qu'une tâche par jour, ce qui **regroupe** naturellement les messages (un seul e-mail de synthèse par personne et par passage, plafond Resend gratuit de 100 par jour). `GET /api/cron/notification-emails` (`0 7 * * *`) appelle la RPC `claim_notification_emails(limit, max_age)` : seules les **demandes d'ami et invitations de groupe, non lues, des 48 dernières heures, dont la personne a `profiles.notifications` vrai**, sont prises (colonne **`notifications.emailed_at`**, marquée à la prise : pas de doublon d'un passage à l'autre) ; l'e-mail est celui du **compte destinataire** (`auth.users`), la langue celle de son profil. Un envoi refusé remet les lignes en attente (`release_notification_emails`). **Sans Resend configuré, le cron ne réclame rien** (les notifications restent éligibles 48 h). Pas de rattrapage plus ancien que 48 h (évite d'envoyer des semaines de retard après une longue pause de Resend).
* **Quand le plan change** : sur Vercel Pro, passer `schedule` à `*/15 * * * *` ; sur Hobby, un service externe peut appeler la route (`Authorization: Bearer $CRON_SECRET`).
* **Cron protégé** : `assertCronSecret` (`server/utils/cron.ts`) compare `Authorization: Bearer …` à `CRON_SECRET` en temps constant : 401 si faux, **503 si `CRON_SECRET` est absent ou fait moins de 16 caractères** (jamais ouvert par oubli). Vercel envoie l'en-tête tout seul quand la variable existe.

#### SMTP d'authentification Supabase via Resend (à faire par Nina, rien d'automatisé)
Pré-requis : domaine acheté et **vérifié dans Resend** (Domains → Add domain → enregistrements DNS SPF et DKIM, puis « Verify » ; ajouter un enregistrement DMARC conseillé).
1. Resend → API Keys → créer une clé **dédiée** « supabase-smtp » (permission « Sending access », domaine ci-dessus). Distincte de `RESEND_API_KEY` de l'application, pour pouvoir les révoquer séparément.
2. Supabase Dashboard (projet de production) → **Authentication → Emails → SMTP Settings** (ou Project Settings → Authentication) → activer « Enable custom SMTP » : **Sender email** `no-reply@<domaine>` ; **Sender name** (nom du site) ; **Host** `smtp.resend.com` ; **Port** `465` (ou `587`) ; **Username** `resend` ; **Password** la clé de l'étape 1 ; enregistrer.
3. Authentication → **Rate Limits** : relever la limite d'e-mails par heure (30 par défaut avec un SMTP personnalisé), pour l'ouverture des inscriptions. Resend gratuit : 100 e-mails par jour, 3 000 par mois (à revérifier sur leur page tarifs).
4. Essayer : « Mot de passe oublié » avec un compte de test, vérifier l'arrivée (pas dans les indésirables). Les modèles d'e-mails (confirmation, réinitialisation) se règlent dans Authentication → Emails → Templates.
5. Retour arrière : décocher « Enable custom SMTP » (Supabase reprend son envoi intégré, limité à quelques e-mails par heure).

#### Variables à poser dans Vercel (production), phase 7
| Variable | Valeur | Obligatoire ? |
|---|---|---|
| `SUPABASE_SECRET_KEY` | clé `service_role` (déjà posée pour la suppression de compte) | **oui** : alerte de crédit, e-mails, sonde |
| `CRON_SECRET` | chaîne aléatoire de 32 caractères ou plus | **oui** pour les deux cron (sinon 503) |
| `AI_NEW_ACCOUNT_DAILY_QUOTA` / `AI_NEW_ACCOUNT_DAYS` | `20` / `30` (défauts) | non |
| `AI_MONTHLY_BUDGET_USD` (ou `_CALLS`) | `5` suggéré | non (0 = aucun) |
| `ALERT_EMAIL` | adresse de Nina | à poser avec Resend |
| `RESEND_API_KEY`, `EMAIL_FROM`, `SITE_URL` | après achat du domaine | non tant que le domaine n'est pas prêt : sans elles, **aucun e-mail** et rien ne casse |
Côté OpenAI : crédit **prépayé sans recharge automatique**, limite mensuelle et seuil d'alerte e-mail (dossier §6.5 point 8).

#### Coût estimé
IA : voir §6.4 du dossier (≈ 0,003 $ par import, ≈ 0,001 $ par traduction). Au plafond de 20 appels, un compte neuf coûte au plus ≈ 0,06 $ par jour ; usage réaliste, 1 à 3 appels : quelques centimes par mois et par personne. La sonde de rattrapage : ≈ 0,000003 $ par jour d'alerte, rien sinon. Resend : gratuit jusqu'à 100 e-mails par jour / 3 000 par mois (un e-mail de synthèse au plus par personne et par jour, alertes de Nina : un par jour au plus). Vercel : les deux tâches planifiées quotidiennes sont dans le plan Hobby (limite : une exécution par jour par tâche, horaire approximatif à l'heure près).

#### Fichiers
`supabase/migrations/0028_ai_credit_email.sql` (+ `rollback/0028_ai_credit_email_down.sql`, `tests/test_0028_ai_credit_email.sql`, branché dans `run_local.sh` avec rejeu, retour arrière et ré-application) · `shared/utils/aiStatus.ts` · `server/utils/ai/{billing,availability,creditAlert,probe,guard}.ts` · `server/utils/{email,emailTemplates,notificationEmails,cron,serviceClient}.ts` · `server/api/ai/status.get.ts`, `server/api/cron/{notification-emails,ai-credit-probe}.get.ts` · `app/composables/useAiStatus.ts`, `AiStatusNotice.vue`, `SupportAiStatus.vue` · `vercel.json` (`crons`).

**Tests.** Vitest : `ai/billing.test.ts` (classification), `ai/availability.test.ts` (décision, quota, crédit, budget, RPC absente, erreur HTTP), `ai/creditAlert.test.ts` (un e-mail par 24 h, rattrapage), `email.test.ts` (Resend simulé, absence de clé, gabarits FR/EN, échappement, aucune adresse, envoi groupé), `cron.test.ts` (`CRON_SECRET`). SQL : `test_0028_ai_credit_email.sql` (quota par compte, plafond personnel non modifiable par l'API, alerte une fois par 24 h à 23 h / 25 h, support, budget, e-mails : préférence, lues, anciennes, langue, pas d'adresse d'un tiers). Playwright v2 : `e2e/v2/ai-credit.spec.ts` (crédit épuisé → boutons désactivés + 503 + réactivation par le support, quota atteint avec l'heure de remise à zéro, appel compté, panne de facturation simulée vs simple débit, routes cron). `.env.local.example` : `AI_NEW_ACCOUNT_DAILY_QUOTA=1000` (les comptes de test sont « neufs »).

**Reste à faire (phase 7).** Retraduction automatique des recettes en attente quand l'IA revient (dossier §6.5 point 5) ; e-mail de prévention à 80 % du budget ; sonde plus fréquente que quotidienne ; page de réglage du plafond personnel dans l'écran support (aujourd'hui en SQL) ; brancher le SMTP d'authentification (Nina, après le domaine).

### 20.16 Relecture de sécurité n° 3 (phases 6 à 8)

Corrections sur `fix/v2-security-review-3`. Migrations 0025 à 0029 non encore en production : corrigées en place (0028, 0029, `v2/0020`), avec leurs tests et retours arrière.

| Sujet | Correction | Tests |
|---|---|---|
| **CSRF contourné par encodage** | contrôle de toute écriture, sans condition de chemin (voir § 20.9, middleware CSRF) | `test/unit/csrf.test.ts` : `/%61pi/x`, `/ap%69/x`, `/api/%78`, double encodage, `Origin: null`, `same-site` d'un autre sous-domaine, même origine, absence d'`Origin` |
| **Photo d'autrui signée via un lien public** | `shared_recipe_photo_path` ne renvoie que `<id>/…` et l'id ; `signSharedPhoto` revérifie (`isPhotoOfRecipe`) ; contrainte `recipes_photo_path_in_own_folder` posée par 0029 (NOT VALID puis `validate` si les données passent, avis sinon) et par `v2/0020` (même nom, `if not exists`) ; chaque retour arrière ne retire la contrainte que si l'autre n'est pas appliqué. **Sûre en v1** : l'éditeur (`useRecipePhoto`) n'écrit que `<id de la recette>/<horodatage>.webp`, 0010 et 0011 stockent tel quel ce que l'éditeur envoie ; seule une écriture sur une ligne ancienne qui violerait la contrainte serait refusée | `test_0029_private_photos.sql` (chemin d'une autre recette refusé par la contrainte, et ignoré par la fonction si la contrainte est contournée), `test_0029_v1_photo_path.sql` (`save_recipe` d'un admin : chemin valide passe, chemin d'une autre recette ou libre échoue, v1), `photos.test.ts`, ordres 0029→0020 et 0020→0029 dans `run_local.sh` |
| **Quota IA contournable en parallèle** | `reserve_ai_call` (0028, service_role) : verrou consultatif par compte (+ global si un budget est réglé), contrôle crédit / budget du mois / plafond du jour, insertion d'une ligne `ai_usage` en statut `pending` (contrainte `status` élargie) ; `finish_ai_call` la passe à `ok` / `error`. Côté serveur : `reserveAiAllowed` (`guard.ts`) → `reserveAiCall` (`availability.ts`) → `trackAiCall(…, reservation)`. Le modèle est créé AVANT la réservation (rien ne doit échouer entre les deux). Une réservation jamais terminée (processus tué) reste `pending` et compte : prudent. RPC absente ou en erreur : on laisse passer en journalisant (comme avant). **v1 inchangée** : `assertAiQuota` puis écriture après coup ; la v1 est réservée à quatre administrateurs et 0028 n'existe pas avant la bascule, la course n'y est pas exploitable | `test_0028_ai_credit_email.sql` (réservation, fin, plafond, compte neuf, crédit, budget), **`run_local.sh` : dix sessions psql simultanées, plafond de 3 → exactement 3 ; budget de 4 sur 5 comptes → exactement 4** (sans les verrous : 10), `availability.test.ts`, `media.test.ts` |
| **Remise à zéro du quota un jour de changement d'heure** | `ai_quota_status` et `reserve_ai_call` calculent minuit suivant sur l'heure locale de Paris (`date_trunc('day', now() at time zone 'Europe/Paris') + interval '1 day'`) et non en ajoutant 24 h à un `timestamptz` : la base de production est en UTC, le jour du passage à l'heure d'hiver l'ancien calcul annonçait 23:00 (trouvé par `e2e/v2/ai-credit.spec.ts` le 25 octobre) | `test_0028_ai_credit_email.sql` (session en UTC), `e2e/v2/ai-credit.spec.ts` |
| **`ai_service_status`** | plus de seuil passé par l'appelant (on pouvait déduire les totaux du mois en le faisant varier) : fonction SANS argument, seuils lus dans `private.app_settings` (table sans accès API), tenus à jour par `reserve_ai_call` à partir de `AI_MONTHLY_BUDGET_*` du serveur ; un compte ordinaire ne reçoit que des booléens | `test_0028_ai_credit_email.sql` |
| **E-mails : caractères bidirectionnels** | `cleanName` retire U+200B–U+200F, U+202A–U+202E, U+2066–U+2069, U+FEFF | `email.test.ts` |
| **E-mails perdus (cron)** | lots de 40 (`NOTIFICATION_EMAIL_BATCH`) et budget de 40 s (`NOTIFICATION_EMAIL_BUDGET_MS`, la fonction Hobby dure 60 s au plus) ; `claim_notification_emails` pose un **bail** (`notifications.claimed_at`, 10 min) au lieu de marquer « envoyé » ; `confirm_notification_emails` marque envoyé (`emailed_at`) après l'envoi ; un `finally` rend à la file (`release_notification_emails`) tout ce qui est réclamé et non envoyé ; si le processus meurt, le bail expire seul | `email.test.ts` (exception en plein lot, budget de temps), `test_0028_ai_credit_email.sql` (bail, expiration, confirmation) |
| **En-têtes de sécurité** | `nuxt.config.ts` `routeRules`, v1 et v2 : `X-Frame-Options: DENY` + CSP `frame-ancestors 'none'`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin` (`no-referrer` sur `/r/**` et `/en/r/**`, posé sur chaque réponse dynamique par `server/middleware/security-headers.ts`, sur le chemin décodé ; une règle `routeRules` s'appliquerait après le middleware et l'écraserait ; les réponses d'erreur gardent les en-têtes par défaut de Nitro, dont `no-referrer`), `Permissions-Policy: microphone=(self), camera=(), geolocation=(), payment=(), usb=()`. Le Picker Google Drive est une iframe de Google dans notre page : c'est Google qui est encadré | `securityHeaders.test.ts`, `e2e/security-headers.spec.ts` (v1), `e2e/v2/security-headers.spec.ts`, `e2e/translator-drive.spec.ts` |

**À régler en production : `AI_MONTHLY_BUDGET_USD` (suggéré `5`) ou `AI_MONTHLY_BUDGET_CALLS`.** Sans l'un des deux (valeur 0 = aucun), l'IA ouverte à tous n'a que le plafond par compte : N comptes × 20 à 50 appels par jour, sans limite globale. Le budget est appliqué sous verrou global par `reserve_ai_call`.

**CSP complète : non posée, volontairement.** Nuxt écrit des scripts en ligne (données d'hydratation, couleur du thème) sans nonce ; une politique sûre exigerait `nuxt-security` avec nonces, et il faudrait vérifier à chaque mise à jour le Picker Google (scripts et iframes `accounts.google.com`, `apis.google.com`, `docs.google.com`, `content.googleapis.com`), Supabase (`connect-src` HTTPS et WebSocket du projet, `img-src` Storage), Sentry (`connect-src` du DSN, éventuel tunnel) et le service worker (`worker-src 'self'`). Une politique trop stricte casserait la connexion ou le Picker sans bruit. Proposition à déployer d'abord en `Content-Security-Policy-Report-Only` avec un point de collecte (`report-uri`) pendant deux semaines, puis à durcir :
`default-src 'self'; script-src 'self' 'unsafe-inline' https://accounts.google.com https://apis.google.com; frame-src https://accounts.google.com https://docs.google.com https://content.googleapis.com; connect-src 'self' https://<projet>.supabase.co wss://<projet>.supabase.co https://*.ingest.sentry.io https://www.googleapis.com https://accounts.google.com; img-src 'self' data: blob: https://<projet>.supabase.co https://*.googleusercontent.com https://*.gstatic.com; style-src 'self' 'unsafe-inline'; font-src 'self' https://fonts.gstatic.com; worker-src 'self'; manifest-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'` (à compléter par ce que le mode rapport remontera). Ne pas ajouter `Cross-Origin-Opener-Policy: same-origin` (casse la pop-up Google).

**Dépendances.** `npm audit fix` (sans `--force`) : `nuxt` 4.5.2 → 4.6.2 (`package.json` : `^4.6.2`), `@nuxt/*` 4.6.2, `nitropack` 2.13.5, `vite` 8.3.5, `undici` 8.12.3, `serialize-javascript` 7.1.4, `happy-dom` 20.14.6, `@nuxt/cli` 4.0.1. Restent signalés : `zod` (3.25.76, dernier 3.x ; la correction n'existe qu'en 4.6.6+, changement majeur, hors périmètre ici), `happy-dom` (correction seulement en 21.0.4+, majeur, dépendance de test uniquement), et la chaîne `node-forge` ← `listhen` ← `nitropack` / `@nuxt/cli` (npm propose un « correctif » qui rétrograde `nuxt` en 4.1.3 : refusé). À reprendre avec une montée de `zod` en 4 et de `nitropack`.

### 20.17 Phase 10 : répétition de la bascule sur les vraies données

Compte rendu : [supabase/REPETITION_V2.md](supabase/REPETITION_V2.md) ; procédure et **checklist du jour J** : [supabase/BASCULE_V2.md](supabase/BASCULE_V2.md) § 6.

- **Rejouer la répétition** : `npm run db:local:up` puis `bash supabase/local/rehearsal.sh` (`npm run db:local:rehearsal`). Elle remet la base à zéro, charge le snapshot
  (gitignoré), pose l'état « comme la prod » (0001 → 0017, 0019, 0021, 0023, 0024) puis 0025 → 0030, joue le jour J avec des paramètres factices (pseudonymes inventés, propriétaire =
  l'admin le plus ancien), les contrôles, les mesures, puis le retour arrière complet et compare l'empreinte des données (`local/rehearsal_fingerprint.sql`). Options : `--keep-v2` (s'arrête en état
  v2, pour les e2e v2 ou la navigation à la main ; revenir ensuite par `npm run db:local:reset`), `--no-reset`, `--skip-perf`. Environ 30 s.
- **Contrôles fonctionnels** (`local/rehearsal_checks.sql`, 68 contrôles) : par membre du groupe, via `set local role authenticated` + `request.jwt.claims` : voit toutes les recettes, peut les
  modifier (RLS), favoris / planning / courses conservés, catégories personnelles cohérentes avec l'ancien texte, traductions, recherche FR et EN ; compte neuf et visiteur : rien. Transaction annulée.
- **Mesures** (`local/rehearsal_perf.sql`) : `explain analyze` sous `authenticated`, 5 passes. Le snapshot n'a pas de traductions : `local/rehearsal_seed_translations.sql` en fabrique une anglaise par recette
  (dictionnaire, sans IA) pour que la recherche bilingue et les compteurs soient représentatifs.
- **0030** (`can_read_recipe` en plpgsql, retour anticipé) : la fonction était appelée une fois par ligne par toutes les politiques de lecture et coûtait ~0,5 ms l'appel (SQL SECURITY DEFINER non « inliné »,
  sous-plan `reports` évalué à chaque fois). Même résultat (`test_0030_can_read_recipe_perf.sql` compare l'ancienne expression, 60 cas), 10 fois plus rapide.
- **Test d'intégration** `save-recipe.local.test.ts` : dépend du mode (marqueur v2 : un visiteur ne lit plus aucune recette). v1 : `save_recipe` refusé à un non-admin (42501) ; v2 : accepté pour ses propres recettes
  (propriétaire = l'appelant), refusé sur la recette d'autrui.
- **Corrigés au passage** : les routes `/api/cron/*` répondaient 500 (et alertaient Sentry) au lieu de 503 tant que `CRON_SECRET` manquait (`handleApiError` n'épargne que les erreurs < 500) ; `e2e/v2/categories.spec.ts`
  échouait sur une base v2 fraîche (deux `option` « Soupes » : la liste déroulante et le `<select>` natif de la bannière « Explorer »).

### 20.18 Phase 9 : marque, domaine, manifeste PWA (et note sur les sous-domaines par groupe)

Domaine acheté : **familycookbook.fr** (pas encore branché sur Vercel : DNS, Vercel, Resend et Supabase sont à faire par Nina, liste dans [supabase/BASCULE_V2.md](supabase/BASCULE_V2.md) § « Domaine »).

- **Nom du produit** : `shared/brand.ts` (`BRAND_NAME = 'Family Cookbook'`, `BRAND_SHORT_NAME`, `LEGACY_HOST`). C'est le nom de l'édition générique (identique en français et en anglais, nom propre), le nom par défaut des e-mails (`EMAIL_APP_NAME` le surcharge) et celui de tout thème sans nom. Les membres des Boultons gardent « Recettes des Boultons » par leur thème (`shared/editions/boultons.ts`).
- **Manifeste dynamique** : `@vite-pwa/nuxt` ne génère plus de manifeste (`pwa.manifest: false`, plus de `webmanifest` dans le précache). `server/routes/manifest.webmanifest.get.ts` répond, avec `server/utils/manifest.ts` (logique pure, testée). **v1** : manifeste de l'édition (`NUXT_PUBLIC_EDITION`), mêmes valeurs qu'avant, `Cache-Control: public, max-age=600`. **v2** : thème actif de la personne (même règle que `useThemeStore` : groupe actif via `list_my_groups` sous RLS, sinon `profiles.theme_settings`), passé par la liste blanche `resolveTheme` ; visiteur, thème invalide ou base indisponible : thème par défaut ; `Cache-Control: private, max-age=300` et `Vary: Cookie` (jamais mis en cache partagé), et la réponse ne contient que nom, couleurs et icônes. Nom court : celui du préréglage, sinon le nom du thème coupé à 12 caractères. Icônes : cocotte pour Boultons, toque terracotta (PNG) pour le thème par défaut, **toque SVG à la couleur du thème** pour les autres (`/pwa-icon.svg?c=rrggbb[&m=1]`, couleur validée `#rrggbb`, sinon 400). Limite connue : les SVG de manifeste sont acceptés par Chrome/Android ; iOS prend l'icône du `<head>` (`apple-touch-icon`, toujours terracotta ou cocotte), pas celle du manifeste.
- **Adresse canonique** : `SITE_URL` (ex. `https://familycookbook.fr`, origine seule). `server/middleware/canonical-host.ts` + `shared/utils/siteUrl.ts` (`canonicalRedirectTarget`, pure) : si `SITE_URL` est valide et que l'hôte demandé est **exactement** `recettes-des-boultons.vercel.app`, réponse **301** vers le même chemin et la même requête sur `SITE_URL`. Jamais redirigés : les déploiements de prévisualisation (`recettes-des-boultons-git-….vercel.app`, `-<hash>.vercel.app`), `localhost`, le nouveau domaine, les méthodes autres que GET/HEAD, `/api/cron/*` (l'appel de la tâche planifiée Vercel) ; pas de boucle si `SITE_URL` est l'ancien alias ; sans `SITE_URL`, rien ne change. Le 301 est gardé 1 h en cache navigateur (`Cache-Control: public, max-age=3600`) pour pouvoir corriger vite après la bascule ; on pourra l'allonger. `SITE_URL` sert aussi : aux liens des e-mails (déjà le cas), à `<link rel="canonical">` et `og:url`/`og:site_name` (`app.vue`, absents sans `SITE_URL` et sur `/r/<jeton>`), et aux liens copiés (lien public `/r/<jeton>`, invitation de groupe : `publicOrigin()` ne prend `SITE_URL` que sur le site de production, pour que localhost et prévisualisations gardent des liens qui marchent). Les redirections d'authentification (`redirectTo` Google, mot de passe oublié) restent sur l'origine courante : le jeton PKCE vit dans cette origine.
- **La redirection abandonne la session** : le cookie de session de Supabase est propre à l'hôte (aucun `cookieOptions.domain` n'est posé), et `localStorage` aussi. Après le 301, une personne arrive sur un autre site sans session et doit **se reconnecter** une fois. Les favoris, listes et recettes sont en base et ne bougent pas. Un lien de confirmation ou de réinitialisation envoyé avant la bascule (vers l'ancien site) est à redemander. Le dossier disait « même connexion » : c'est faux entre deux origines, à annoncer aux membres.
- **À changer chez les tiers** (liste exacte dans BASCULE_V2.md § « Domaine ») : Supabase → Authentication → URL Configuration (Site URL, Redirect URLs), Google Cloud (origines JavaScript autorisées, URI de redirection du client OAuth ; origines du Picker Drive), Resend (domaine d'envoi), Vercel (domaine + `www`).

**Personnalisation du carnet (décision de Nina) : pas de sous-domaine, mais le nom choisi s'affiche partout.** Le thème (`profiles.theme_settings` ou `groups.theme`) portait déjà une clé `name` validée (`themeNameSchema`) qui devient le nom du site (en-tête, `<title>`, pied de page, manifeste `name`/`short_name`) ; elle n'avait pas de champ dans l'interface. Ajout (v2 seulement, **aucune migration** : le JSON accepte déjà la clé) : champ « Nom affiché » dans `ThemePicker` (Réglages, page d'un groupe, onboarding), conservé quand on change de préréglage, refusé s'il contient des caractères hors liste blanche, vide = « Family Cookbook ». Sur la page d'un groupe, bouton « Utiliser le nom du groupe » (le nom du groupe est proposé, jamais imposé). Tests : `manifest.test.ts`, `e2e/v2/manifest.spec.ts` (v2-mf6).

**Note de conception : un sous-domaine par groupe (`lesboultons.familycookbook.fr`). Non implémenté.**

- *DNS et TLS* : il faudrait un domaine générique `*.familycookbook.fr` sur Vercel. Vercel n'émet un certificat générique que si ses **serveurs de noms** gèrent la zone (délégation complète du DNS). **Décision de Nina : on garde les serveurs de noms d'Ionos**, donc pas de wildcard Vercel ; sans lui, chaque sous-domaine serait à ajouter à la main (un enregistrement DNS chez Ionos + un domaine dans Vercel), ce qui écarte un sous-domaine créé automatiquement par groupe.
- *Cookies d'authentification* : aujourd'hui aucun `cookieOptions.domain` (cookie propre à l'hôte, `sameSite=lax`). Entre sous-domaines il faudrait `domain=.familycookbook.fr` pour que la session suive, ce qui l'expose à **tous** les sous-domaines (un groupe ne crée pas de contenu exécutable, mais toute faille d'un sous-domaine pèse sur l'ensemble) ; sans cela, une connexion par sous-domaine, donc par groupe. `localStorage` reste de toute façon propre à chaque hôte. Le garde CSRF (`Sec-Fetch-Site: same-site`) exigerait aussi une revue.
- *Listes d'autorisation* : Supabase n'accepte les redirections que vers les URL listées (un joker `https://*.familycookbook.fr/**` est permis) ; Google OAuth **n'accepte pas** de joker dans les URI de redirection : il faut faire passer la connexion par un seul hôte (`familycookbook.fr/confirm`) puis renvoyer vers le sous-domaine, ce qui ajoute un mécanisme de jeton de renvoi à écrire et à sécuriser.
- *Le modèle de données ne colle pas* : une personne peut appartenir à plusieurs groupes, et le carnet est **par personne** (recettes de plusieurs groupes, amis, favoris, planning). Un sous-domaine impliquerait un contexte « groupe » dans chaque page, alors que le thème actif est un choix de la personne (`active_theme_group_id`), pas du domaine.
- *Coût* : sécurité (prise de contrôle de sous-domaines, noms réservés `www`, `api`, `mail`), unicité et modération des noms, SEO dupliqué, e-mails et liens à fabriquer par groupe.
- *Alternative peu coûteuse* : un nom de groupe « vanity » qui **redirige en 301** `lesboultons.familycookbook.fr` vers une page de groupe (`/groupes/<id>`) sur le domaine principal, via un simple enregistrement et une règle `vercel.json`/middleware (hôte → chemin) pour chaque groupe choisi à la main. Aucun changement de cookie, d'authentification ni de listes d'autorisation, et chaque lien reste valable si le groupe change de nom. À envisager seulement si un groupe le demande.

### 20.19 Retour de test n° 1 : logo, nom affiché, recettes partagées dans la langue de la lecture

Trois retours de Nina après un essai local (v2 seulement ; la v1 est inchangée).

1. **La cocotte est celle du thème Les Boultons, pas du produit.** `genericEdition.brand.logo` vaut désormais `null` : l'en-tête affiche alors la toque (icône Lucide `chef-hat` sur une pastille `bg-primary`, donc à la couleur du thème), `data-testid="site-logo-generic"` ; avec le préréglage Boultons, l'image `/images/logo.png` (`site-logo`). Audit des références à la cocotte : `public/images/logo.png` (en-tête Boultons seulement), `public/editions/boultons/*` (favicon, `apple-touch-icon`, icônes du manifeste : choisis par `brand.icons`, donc Boultons seulement), `scripts/generate-edition-icons.mjs` (génération). Rien dans l'accueil, la connexion, les e-mails (texte seul), le manifeste du thème par défaut (toque), ni d'image Open Graph. Effet de bord : l'édition générique de la **v1** (`NUXT_PUBLIC_EDITION=generic`, non déployée) montre aussi la toque.
2. **« Nom affiché » partout.** Un seul point d'entrée : `useSiteName()` (`app/composables/useSiteName.ts`, logique pure `shared/utils/siteName.ts`) : nom du thème actif, sinon « Family Cookbook ». Utilisé par l'en-tête, le pied de page, le titre de l'accueil (génération et Boultons), `<title>` / `og:site_name` (`app.vue`) et le pied d'impression de la fiche. **Pages neutres** : le lien public `/r/<jeton>` (et `/en/r/…`), les pages légales et « compte supprimé » gardent « Family Cookbook » même pour une personne qui a un nom (`isNeutralSitePath`). **Hors périmètre, volontairement** : les e-mails (`EMAIL_APP_NAME`, sinon « Family Cookbook » : ils viennent du service, pas du carnet de quelqu'un, et l'expéditeur ne connaît pas le thème du destinataire) et le manifeste (déjà piloté par le thème). Les clés i18n `shopping.print.footer` et `planningPrint.footer` (« Recettes des Boultons ») ne sont lues nulle part.
3. **Recette partagée dans la langue de la personne qui la lit.** Modèle (inchangé) : une ligne `recipe_translations` par recette, vers l'autre langue que `recipes.lang`, écrite à l'enregistrement par l'auteur (coût sur son quota). Les chemins d'affichage (fiche, cartes de `list_cookbook` / `list_shared_with_me` / `list_author_recipes`, favoris, planning, `get_shared_recipe(token, locale)`) choisissaient déjà la traduction quand elle existe. **Le trou** : une recette sans traduction à jour (IA indisponible ou plafond atteint à l'enregistrement, recette d'avant le bilingue, texte modifié) restait dans sa langue d'origine, et seul son auteur pouvait la traduire. **Correction** : traduction **à la demande** à l'ouverture.
   - `POST /api/v2/recipes/<id>/translate` (connecté : droit de lire vérifié sous RLS, sinon 404) et `POST /api/v2/shared/<jeton>/translate` (sans compte : jeton résolu par `shared_recipe_id`), corps `{ locale }`. Réponse 200 `{ status }` : `same-language | ready | translated | busy | unavailable`. Logique pure et testée : `server/utils/sharedTranslationCore.ts` (`ensureRecipeTranslation`, `TranslationGuard`) ; branchement : `server/utils/sharedTranslation.ts`. Écriture par `save_recipe_translation_server` (**migration 0031**, `service_role` seulement).
   - **Qui paie** : l'**auteur** de la recette (`reserveAiAllowed` avec son identifiant, `feature = 'translate_recipe'`), comme à l'enregistrement ; le quota de la personne qui lit n'est **jamais** touché. Crédit coupé, budget du mois et plafond de l'auteur sont appliqués comme partout. Une traduction réussie est écrite une fois : toutes les lectures suivantes dans cette langue sont gratuites. Garde-fous : une seule traduction à la fois par recette et par langue (`busy`), un échec n'est pas rejoué avant 10 minutes (`cooldown`, par instance du serveur, au mieux), une recette dont l'auteur a supprimé son compte n'est pas traduite. Un visiteur anonyme ne peut déclencher que la traduction d'une recette dont il a le jeton, une fois.
   - Navigateur : `useOnDemandTranslation` (`app/composables/useOnDemandTranslation.ts`), sur la fiche et sur `/r/<jeton>` : si la recette affichée n'est pas dans la langue de l'interface (`needsTranslation`), une demande par recette et par langue et par session, mention « Traduction en cours… texte d'origine affiché en attendant » (`recipeDetail.language.translating`), puis rechargement ; en cas d'échec, « Traduction indisponible pour le moment » et le texte d'origine reste. Les **listes** ne déclenchent rien (coût : une page de cartes ferait N appels) : elles montrent la traduction quand elle existe.
   - Notifications « recette partagée » : le titre du payload est figé à l'envoi ; la page lit le titre traduit des recettes (`localizedRecipeTitle`). Les titres des toasts d'ajout / copie (« Partagées », « Explorer ») suivent la langue. Les e-mails ne citent aucun titre de recette.
   - Tests : `test/unit/sharedTranslation.test.ts` (22), `test/unit/siteName.test.ts`, `supabase/tests/test_0031_shared_recipe_translation.sql` (branché dans `run_local.sh`), `e2e/v2/shared-translation.spec.ts` (v2-tr1 à tr3) et `e2e/v2/manifest.spec.ts` (v2-mf6, v2-mf7).

