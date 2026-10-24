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
| Nom | Recettes des Boultons (Lobster `#7b88bd`) | Carnet de recettes / Recipe Book (Lobster `primary`) |
| Couleurs | bleu-vert d'origine + `slate` | terracotta + `stone` |
| Accueil | `HomeBoultons` : héros diagonal pleine largeur sur toute la hauteur visible sous l'en-tête (`100svh`), `boultons.png`, bouton et pastille animée (`animate-bounce`, collante sur petits écrans, coupée si mouvements réduits) qui défilent vers les catégories, grille d'illustrations 3 × 3, fonctionnalités | `HomeGeneric` : héros typographique, catégories en icônes |
| Sans photo | illustration de la catégorie (cadre blanc) | icône Lucide |
| Cartes | zone visuelle toujours `aspect-[4/3]` | zone basse si aucune photo dans la grille (§ 8) |

**Choisir l'édition** : `NUXT_PUBLIC_EDITION=boultons|generic` → `runtimeConfig.public.edition`
(défaut `boultons` ; valeur inconnue = `boultons`). La variable est lue à l'exécution pour
tout le rendu (pas besoin de rebuild), sauf le manifeste PWA et le `<title>` par défaut de
`nuxt.config.ts`, figés avec l'édition présente **au build** (même variable). En local :

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
« maskable ») suivent l'édition de **build**. Régénérer les icônes Boultons après un changement
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
- **En-têtes de sécurité** : le dépôt n'a aucune Content-Security-Policy (ni `nuxt-security`, ni
  en-têtes dans `vercel.json`). Si une CSP est ajoutée un jour, autoriser : `script-src`
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
| `NUXT_PUBLIC_EDITION` | `runtimeConfig.public.edition` (+ manifeste PWA au build) | édition du site : `boultons` (défaut) ou `generic` (§ 9) |
| `NUXT_PUBLIC_GOOGLE_CLIENT_ID`, `NUXT_PUBLIC_GOOGLE_API_KEY`, `NUXT_PUBLIC_GOOGLE_APP_ID` | `runtimeConfig.public.google` | import Google Drive du traducteur (publiques) ; l'une vide = bouton masqué (§ 12) |
| `AI_PROVIDER` | `runtimeConfig.aiProvider`, `getAiConfig()` | `openai` (défaut), `anthropic`, `google`, `mistral`, `mock` |
| `AI_MODEL` | idem | modèle ; vide = défaut du fournisseur |
| `AI_TRANSCRIBE_MODEL` | idem | modèle de transcription de la dictée (défaut `gpt-4o-mini-transcribe`, OpenAI) |
| `AI_DAILY_QUOTA` | idem | appels par personne et par jour (défaut 50, `0` = coupé) |
| `SUPABASE_SECRET_KEY` | `@nuxtjs/supabase` (`serverSupabaseServiceRole`), `POST /api/account/delete` | clé secrète `service_role` / `sb_secret_…`, **serveur seulement** (suppression de compte, § 20.8) ; vide = la route répond 500, le reste fonctionne |
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
fichier : bucket de photos **public** à passer en privé avec les liens signés (phase 8). `save_recipe_translation`
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
- Les routes `add-recipe`, `update-recipe`, `delete-recipe` et les endpoints IA restent réservés aux admins (`requireAdmin`) :
  les ouvrir à tout compte (le RLS décide) relève des phases 6 et 7. Le schéma `recipeInputSchema` accepte déjà `visibility` et
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
- `update_my_profile` ne touche pas `onboarded_at` (l'update direct de sa ligne reste possible) ; le pseudonyme est validé aussi en
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

**Middleware CSRF** (`server/middleware/csrf.ts`, logique dans `server/utils/csrf.ts`) : refuse en 403 tout `POST` / `PUT` / `PATCH` / `DELETE` sur
`/api/**` quand `Sec-Fetch-Site` vaut `cross-site`, ou quand `Origin` est présent et diffère de l'hôte (`Host`, ou `X-Forwarded-Host`).
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

