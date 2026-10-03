# Guide technique — Recettes des Boultons

Application de gestion de recettes familiales : recettes, planning des repas, listes de courses, favoris, et traducteur de recettes par IA.

## Stack technique

| Couche | Technologie |
|---|---|
| Runtime | Node 22 (`.nvmrc`, `engines.node >= 22`) |
| Framework | Nuxt 4 (SSR, structure `app/` + `shared/`) + Vue 3 (Composition API) |
| UI | Nuxt UI v4 (embarque Tailwind CSS 4, `@nuxt/fonts`, `@nuxt/icon`), `@nuxt/image` |
| État | Pinia 3 (`app/stores/`) |
| i18n | `@nuxtjs/i18n` v10 (FR par défaut, EN ; fichiers dans `i18n/locales/`) |
| Backend | API Nitro intégrée (`server/api/`) |
| Base de données / Auth | Supabase (PostgreSQL + Supabase Auth) via `@nuxtjs/supabase` |
| IA | Vercel AI SDK (`ai` 7, `generateObject`) — fournisseur au choix (OpenAI `gpt-4.1-mini` par défaut, Anthropic, Google, Mistral, ou `mock`) — voir « IA » |
| Qualité | TypeScript strict, ESLint (`@nuxt/eslint`), Vitest (`@nuxt/test-utils`), CI GitHub Actions |
| Hébergement | Vercel |

## Structure du projet

```
recettes-des-boultons/
├── app/                     # srcDir Nuxt 4 (alias ~/ et @/)
│   ├── app.vue              # Racine : <UApp> (Nuxt UI) > <NuxtLayout> > <NuxtPage>
│   ├── app.config.ts        # Nuxt UI : primary → palette terracotta, neutral → stone
│   ├── assets/css/main.css  # Tailwind 4 + Nuxt UI, @theme (palette primary, polices)
│   ├── error.vue            # Page d'erreur (404 / 500) en Nuxt UI
│   ├── components/          # Composants Vue réutilisables
│   ├── pages/               # Routes (recettes, planning, courses, favoris, traducteur)
│   ├── layouts/             # Layout par défaut
│   ├── stores/              # Pinia : recipes, planning, favorites, shopping, auth
│   ├── components/planning/ # WeekNavigator, DayColumn, MealSlot, MealCard, MealNoteEditor, AddMealModal, MoveMealModal, DaySlotPicker
│   ├── components/shopping/ # ListTabs, AddItemForm, UnitSelect, ItemList, ItemRow
│   ├── composables/         # useApi (apiFetch), useRecipeSearch, useRecipeFacets, useRecipe, useUnits,
│   │                        # usePlanningWeek, useShoppingLists (toasts + état d'interface)
│   ├── utils/               # week.ts (semaine du planning, clés locales)
│   ├── middleware/auth.ts   # Garde de route côté client (admin)
│   └── plugins/             # toast.client.ts ($toast → useToast() de Nuxt UI)
├── shared/                  # Code partagé client/serveur (alias #shared)
│   ├── types/index.ts       # Modèle de lecture (RecipeSummary, Recipe, Favorite, ...)
│   ├── types/database.ts    # Types Supabase GÉNÉRÉS (ne pas éditer)
│   ├── utils/recipes.ts     # Mapping snake_case → camelCase, formatAmount, formatIngredient
│   ├── utils/shopping.ts    # formatQuantity, splitChecked, aisleOf / groupByAisle (rayons)
│   └── utils/text.ts        # normalizeAccents
├── server/
│   ├── api/                 # Endpoints REST (Nitro)
│   └── utils/               # auth.ts (requireUser / requireAdmin), validate.ts
├── i18n/locales/            # fr.json, en.json
├── supabase/migrations/     # Migrations SQL (RLS, etc.)
├── test/                    # Tests Vitest (test/unit/...)
├── public/images/           # Images des recettes par catégorie
├── nuxt.config.ts, eslint.config.mjs, vitest.config.ts, tsconfig.json
└── .github/workflows/ci.yml # Lint + typecheck + test + build
```

### Conventions Nuxt 4 / Tailwind 4

- `~/` pointe sur `app/` ; le code partagé s'importe via `#shared/...` (auto-importé pour `shared/utils` et `shared/types`).
- `tsconfig.json` ne contient que des *references* vers les tsconfig générés dans `.nuxt/` (`typescript.strict: true` dans `nuxt.config.ts`).
- Tailwind 4 : la configuration vit dans `app/assets/css/main.css` (`@theme`, `@layer components`, `@utility`). Les valeurs de l'ancien `tailwind.config.js` ont été reprises à l'identique ; quelques réglages rétablissent les défauts v3 (hover sur tous les appareils, bordures `gray-200`, placeholders `gray-400`, curseur `pointer` sur les boutons). Les blocs `<style scoped>` qui utiliseraient `@apply` doivent commencer par `@reference "~/assets/css/main.css";` (aucun cas aujourd'hui).
- Nuxt UI : mode sombre actif (`ui.colorMode: true`, classe `.dark`, bouton `<UColorModeButton>` dans le header) ; `<UApp>` reçoit la locale Nuxt UI (`fr` / `en`) depuis `app.vue`. Voir la section « Design » ci-dessous.
- `pages/recettes/[id].vue` déclare un `path` restreint aux UUID (`definePageMeta`) : Nuxt 4 ordonne `[category]` avant `[id]`, ce qui capturait les identifiants de recettes.


## Design (Nuxt UI 4)

Système commun à toutes les pages ; les tokens vivent dans `app/assets/css/main.css`
(`@theme static`) et `app/app.config.ts`.

- **Couleurs** : uniquement les utilitaires sémantiques de Nuxt UI — surfaces `bg-default`,
  `bg-muted`, `bg-elevated`, `bg-accented` ; textes `text-highlighted`, `text-default`,
  `text-muted`, `text-dimmed`, `text-inverted` ; bordures `border-default`, `border-accented` ;
  accent `text-primary` / `bg-primary` / `bg-primary/10` ; états `text-error`, `text-success`…
  Aucun hex ni `gray-*` / `slate-*` dans les composants : ces utilitaires s'adaptent seuls au
  mode sombre.
- **Palette** : neutre chaud `stone` (`ui.colors.neutral`) + accent terracotta `primary`
  (`--color-primary-50…950`, 500 = `#c2603e`). `--ui-primary` vaut la nuance 600 en clair
  (blanc sur terracotta : 5,5:1) et 400 en sombre (texte foncé : 6:1). Pas de `secondary`.
- **Typographie** : `font-sans` = Inter (interface), `font-serif` = Fraunces (titres de pages
  et de recettes : `font-serif font-semibold text-highlighted`), `font-lobster` réservé au logo.
  Hiérarchie par taille/graisse, pas par la couleur.
- **Surfaces** : bordures fines (`border border-default`, `hover:border-accented`) plutôt
  qu'ombres ; `rounded-lg` par défaut, `rounded-xl` pour cartes et modales.
- **Composants** : Nuxt UI uniquement (`UButton`, `UModal`, `UDrawer`, `UCard`, `UInput`,
  `USelectMenu`, `UForm` + `UFormField` (schémas zod), `UBadge`, `USkeleton`, `UPagination`,
  `UDropdownMenu`, `UCheckbox`, `UAlert`, `UIcon`…). Icônes Lucide `i-lucide-*` (collection
  locale `@iconify-json/lucide`). Boutons icône : toujours un `aria-label`.
- **Toasts** : `useToast().add({ title, description, color, icon })` (Nuxt UI). La façade
  `$toast` (`useNuxtApp().$toast`, plugin `toast.client.ts`) conserve l'API historique
  `$toast.success(title, message?, duration?)` / `error` / `info` / `warning` / `show`.
- **Composants partagés** (API inchangée, rendu Nuxt UI) : `ConfirmModal` (`show`, `title`,
  `message`, `confirmText`, `cancelText`, `loading` ; émet `confirm`, `cancel`, `close`),
  `LoadingButton` (`loading`, `variant`, `size`, `disabled`), `LoadingState` / `ActionLoading`
  (`message`), `EmptyState` (`title`, `message`, `icon` Lucide, `actionText`, `actionHandler`,
  slot `action`), `ErrorState` (`title`, `message`, `retryAction`, `retryText`),
  `AuthRequired` (émet `login`), `AuthModal` (`isOpen` ; émet `close`, `success` — connexion,
  inscription et OAuth réunis), `RecipeCard`, `RecipeAddToListModal`, `RecipeFilters`,
  `RecipeGridSkeleton`, `CategoryGrid`, `LanguageSwitcher`, `AppUserMenu`, `AppMobileNav`.
- **Layout** : header compact (logo, navigation desktop, `UColorModeButton`, langue, menu
  utilisateur) ; sur mobile, barre d'onglets en bas (Recettes / Planning / Courses / Favoris /
  Moi) — le layout réserve le padding bas (`pb-20 md:pb-0`), les pages n'ont rien à prévoir ;
  conteneur unique `UContainer` pour toutes les pages ; footer desktop ; `app/error.vue`.
- **Accessibilité** : focus visible (`outline-primary`) sur les éléments natifs, composants
  Nuxt UI focusables au clavier, `aria-current="page"` sur la navigation, `prefers-reduced-motion`
  respecté (animations/transitions neutralisées dans `main.css`).
- **Catégories** : `useCategories()` (`app/composables/useCategories.ts`) fournit libellés
  i18n (`categories.<clé>.name`) et icônes Lucide ; `categoryIcon(category)` sert de repli
  visuel quand une recette n'a pas de `photoPath` (plus d'illustrations par catégorie).
- **Photos** : `RecipeCard` affiche `photoPath` depuis l'URL publique du bucket Storage
  `recipe-photos` (`<supabase.url>/storage/v1/object/public/recipe-photos/<path>`) via un
  `<img loading="lazy">` (le provider ipx de `@nuxt/image` n'optimise pas les domaines externes).
- **i18n** : bloc `ui` (textes communs : `ui.common.*`, `ui.nav.*`, `ui.card.*`, `ui.error.*`…)
  et blocs `auth`, `home`, `recipes`, `favorites`, `categories`, `footer`, `navigation`.
- **Dette** : la classe `.btn-primary` (`main.css`) est conservée en version minimale tant que
  `pages/recettes/[id].vue`, `components/RecipeTranslator.vue` et `pages/courses.vue`
  l'utilisent (`TODO(phase 4)`).

### OAuth (Google, Apple)

La modale d'authentification affiche « Continuer avec Google » (et Apple si listé) selon
`runtimeConfig.public.authProviders` (`NUXT_PUBLIC_AUTH_PROVIDERS=google,apple`, défaut
`google`). Le bouton appelle `supabase.auth.signInWithOAuth({ provider, options: { redirectTo:
`${origin}/confirm` } })` ; la page `app/pages/confirm.vue` attend `useSupabaseUser()` puis
revient sur la page d'origine (mémorisée dans `sessionStorage`) ou l'accueil.

- **Google Cloud** : créer un identifiant OAuth 2.0 « Application Web » (console Google Cloud →
  APIs & Services → Credentials) avec comme URI de redirection autorisée
  `https://<ref>.supabase.co/auth/v1/callback` (prod) et `http://127.0.0.1:54321/auth/v1/callback`
  (local). Récupérer `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`.
- **Prod (dashboard Supabase)** : Authentication → Providers → Google : activer, coller l'ID
  et le secret ; dans Authentication → URL Configuration, ajouter `https://<domaine>/confirm`
  (et `https://<domaine>/en/confirm`) aux *Redirect URLs*.
- **Local (`supabase/config.toml`)** : les secrets ne sont jamais commités, ils viennent de
  l'environnement de la CLI (`supabase/.env` gitignoré, ou variables exportées avant
  `npm run db:local:up`) :

  ```toml
  [auth.external.google]
  enabled = true
  client_id = "env(GOOGLE_CLIENT_ID)"
  secret = "env(GOOGLE_CLIENT_SECRET)"
  # Laisser redirect_uri vide : http://127.0.0.1:54321/auth/v1/callback
  skip_nonce_check = true   # requis pour Google One Tap / certains navigateurs en local
  ```

  et ajouter `http://localhost:3021/confirm` (port de dev) aux `additional_redirect_urls` de
  `[auth]`, puis `npx supabase stop && npx supabase start`.
- **Apple** : même principe (`[auth.external.apple]`, Services ID + clé `.p8` → secret JWT
  généré) ; n'ajouter `apple` à `NUXT_PUBLIC_AUTH_PROVIDERS` qu'une fois le fournisseur activé.

## Authentification & sécurité

> ⚠️ L'authentification repose sur **Supabase Auth**, pas sur un système JWT/bcrypt maison.
> Le rôle d'administrateur est porté par la colonne `role` de la table `profiles`.

### Côté client

- **Session** : gérée par le module `@nuxtjs/supabase` (`redirect: false`). Un seul client (`useSupabaseClient()`), session persistée dans un **cookie** (`@supabase/ssr`), donc disponible au SSR et aux endpoints `/api/*`. `useSupabaseUser()` (claims du JWT) est la source de vérité.
- **Store** : `app/stores/auth.ts` (setup store) suit `useSupabaseUser()` (claims du JWT) : `isAuthenticated` vient de `sub`, `isAdmin` du claim `user_role` (hook `custom_access_token_hook`, migration 0009) avec repli sur `profiles.role` si le claim est absent. Le profil applicatif (`profiles` : nom, préférences) est accolé côté client sans bloquer le rendu. Expose `isAuthenticated`, `isAdmin`, `role`, `currentUser`, `login`, `logout`, `checkAuth`, `init`.
- **Garde de route** : `app/middleware/auth.ts` protège les pages marquées `meta.requiresAdmin` (redirige vers `/` si non-admin) **sans requête réseau** (claims du cookie). ⚠️ C'est une garde **d'affichage uniquement** — la vraie sécurité est côté serveur.
- **Lectures** : directes depuis le client Supabase typé (`useSupabaseClient<Database>()`, RLS) via `useAsyncData` (SSR) — voir « Lecture des données ». **Écritures** : les stores passent par `apiFetch` (`app/composables/useApi.ts`), simple `fetch` same-origin : le cookie de session part automatiquement, plus besoin d'en-tête `Authorization`.

### Côté serveur (la barrière qui fait foi)

`server/utils/auth.ts` expose deux gardes, utilisées par tous les endpoints d'écriture :

- **`requireUser(event)`** — accepte **soit** le cookie de session (`serverSupabaseClient` / `serverSupabaseUser` du module), **soit** un en-tête `Authorization: Bearer <jwt>` (clients externes). Renvoie `{ supabase, user }` : un client Supabase agissant au nom de l'utilisateur (le RLS s'applique avec `auth.uid()`) et son identité. `user.id` est **toujours dérivé du token validé**, jamais d'un `userId` envoyé par le client (évite l'usurpation / IDOR).
- **`requireAdmin(event)`** — `requireUser` + rôle admin : le claim `user_role` du JWT fait foi s'il est présent (cookie : `serverSupabaseUser`, Bearer : charge utile du token validé) ; sinon repli sur `profiles.role`. Renvoie 401 si non connecté, 403 si non-admin.

Il n'y a plus d'endpoint GET : les lectures se font directement depuis le client Supabase (SSR + navigateur) sous RLS.

Défense en profondeur : vérification explicite côté serveur **+** RLS en base.

### Modèle RLS (Row Level Security)

Défini dans `supabase/migrations/0001_harden_rls.sql` :

| Tables | Lecture | Écriture |
|---|---|---|
| `recipes`, `recipe_sections`, `recipe_ingredients`, `instructions` | publique | admin uniquement (`is_admin()`) |
| `favorites`, `planning`, `planning_notes`, `shopping_lists` | propriétaire (`auth.uid() = user_id`) | propriétaire |
| `shopping_items` | propriétaire (via la liste parente) | propriétaire (via la liste parente) |
| `profiles` | sa ligne (ou admin) | sa ligne ; un trigger empêche un non-admin de changer son `role` |

Fonctions `SECURITY DEFINER` : **les RPC favoris n'existent plus** (migration `0002_drop_unused_secdef_functions.sql`) ; favoris et planning passent en accès direct aux tables sous RLS. Voir [SECURITY_HARDENING.md](SECURITY_HARDENING.md).

## Base de données (schéma réel)

```sql
profiles            (id uuid PK = auth.users.id, email, name, role 'user'|'admin',
                     language, theme, notifications, created_at, updated_at)

recipes             (id uuid PK, title, description, category, ingredients jsonb,
                     instructions jsonb, prep_time, cook_time, servings, image,
                     tags text[], notes, created_at, updated_at)

recipe_sections     (id uuid PK, recipe_id FK, name, type, order_index,
                     created_at, updated_at)
recipe_ingredients  (id uuid PK, recipe_id FK, section_id FK, name, amount, unit,
                     optional, order_index, created_at, updated_at)
instructions        (id uuid PK, recipe_id FK, section_id FK, content, order_index,
                     created_at, updated_at)

favorites           (id uuid PK, user_id, recipe_id FK, created_at, updated_at)
planning            (id uuid PK, user_id, date_string, meal_type 'lunch'|'dinner',
                     recipe_id FK?, custom_title, created_at, updated_at)
planning_notes      (id uuid PK, user_id, date_string, note_type 'day'|'lunch'|'dinner',
                     content, created_at, updated_at)
shopping_lists      (id uuid PK, user_id, name, created_at, updated_at)
shopping_items      (id uuid PK, list_id FK, name, amount, unit, recipe_id FK?,
                     is_checked, created_at, updated_at)
```

Notes :
- Depuis la migration 0005, **toutes** les recettes sont décrites par leurs sections (`recipe_sections` → `recipe_ingredients` / `instructions`). Les colonnes JSONB `recipes.ingredients` / `instructions` subsistent en base (compatibilité, `NOT NULL`) mais **ne sont plus lues par le front** : le type `Recipe` ne les expose plus.
- Colonnes dérivées par trigger (migrations 0003/0004) : `recipe_ingredients.amount_num` / `unit_code` et `shopping_items.amount_num` / `unit_code` (`parse_amount`, `normalize_unit`). `recipes.photo_path` (0010) et `recipes.search` (0008, tsvector généré).
- `profiles.id` référence `auth.users.id` ; un trigger `handle_new_user` crée le profil à l'inscription.

## Lecture des données (client Supabase typé)

Les lectures ne passent plus par `/api/*` : le client Supabase typé (`useSupabaseClient<Database>()`,
types générés dans `shared/types/database.ts`) interroge PostgREST directement, côté serveur (SSR,
cookie de session) comme dans le navigateur, sous RLS. Les lignes snake_case sont converties une seule
fois en camelCase par `shared/utils/recipes.ts` (`toRecipeSummary`, `toRecipe`, `formatAmount`…).

| Besoin | Composable / store | Requête |
|---|---|---|
| Liste paginée (24/page), recherche, filtres | `useRecipeSearch(scope, { query, category, tags, page })` | RPC `search_recipes(p_query, p_category, p_tags, p_limit, p_offset)` → `RecipeSummary[]` + `total_count` |
| Compteurs par catégorie, tags disponibles | `useRecipeFacets()` | `select category, tags from recipes` |
| Fiche complète (sections, ingrédients, instructions) | `useRecipe(id)` / `fetchRecipeById(supabase, id)` | `recipes` + `recipe_sections(*, recipe_ingredients(*), instructions(*))` |
| Favoris | `useFavoritesStore().refresh()` | `favorites` puis `recipes` par `in('id', …)` |
| Planning d'une semaine (+ notes) | `usePlanningStore().loadWeek(date)` / `refresh()` | `planning` (+ `recipe:recipes(…)`) et `planning_notes` par plage de dates |
| Listes de courses | `useShoppingStore().refresh()` | `shopping_lists` avec `shopping_items(*)` imbriqués |

- Les pages appellent ces lectures dans `useAsyncData` (`status` / `error` branchés sur `LoadingState` / `ErrorState` / `EmptyState`).
- Le store `recipes` ne garde que l'état d'interface (catégorie, recherche, tags) et un compteur `revision` : `useRecipesStore().refresh()` après une écriture fait recharger liste, fiche et facettes. Les stores `favorites`, `planning`, `shopping` exposent `refresh()` (recharge) et `ensureLoaded()` / `ensureWeekLoaded()` (chargement unique à la demande).
- Régénérer les types après une migration : `npx supabase gen types typescript --local > shared/types/database.ts` (puis replacer l'en-tête « généré, ne pas éditer »).

## Endpoints API (`server/api/`)

Légende auth : 👤 utilisateur connecté (`requireUser`) · 🔑 admin (`requireAdmin`)

> Plus d'endpoints GET : `GET /api/recipes`, `/api/favorites`, `/api/planning`, `/api/shopping-lists` ont été
> remplacés par les lectures directes ci-dessus.


**Écritures** — corps validé par Zod (`shared/schemas/`), erreurs centralisées (`server/utils/errors.ts`)

| Endpoint | Auth | Body / query (schéma) | SQL | Réponse |
|---|---|---|---|---|
| `POST /api/add-recipe` | 🔑 | `{ recipe: RecipeInput }` (`addRecipeBodySchema`) | `rpc save_recipe(payload)` | `{ success, recipe: RecipeDetail, message }` |
| `PUT /api/update-recipe?id=` | 🔑 | `{ updates: RecipeInput }` (`updateRecipeBodySchema`) — remplacement complet | `rpc save_recipe(payload + id)` (404 si inconnue) | `{ success, recipe: RecipeDetail, message }` |
| `DELETE /api/delete-recipe?id=` | 🔑 | `?id=uuid` | `rpc delete_recipe` (404 si inconnue) | `{ success, deletedRecipeId }` |
| `POST /api/translate-recipe` | 🔑 | `{ recipeText (20–20 000), targetLanguage?: fr\|en }` (`translateRecipeBodySchema`) | `rpc check_ai_quota` (429) → AI SDK `generateObject` → insert `ai_usage` | `{ success, recipe: RecipeInput, aiRecipe, usage: { provider, model, inputTokens, outputTokens, estimatedCostUsd, durationMs } }` — rien n'est enregistré, le client enchaîne sur `add-recipe` |
| `POST /api/favorites` | 👤 | `{ recipeId }` | insert (409 si doublon, 404 recette) | `{ success, favorite }` |
| `DELETE /api/favorites?recipeId=` (ou `?id=`) | 👤 | query | delete (404 si absent) | `{ success }` |
| `POST /api/planning` | 👤 | `{ dateString: AAAA-MM-JJ, mealType: lunch\|dinner, recipeId? \| customTitle? }` | insert | `{ success, meal }` |
| `PUT /api/planning/:id` | 👤 | `{ dateString, mealType }` (`planningEntryMoveSchema`) | update (404 si absent) — déplacement, identifiant conservé | `{ success, meal }` |
| `DELETE /api/planning/:id` | 👤 | — | delete (404 si absent) | `{ success }` |
| `POST /api/planning-notes` | 👤 | `{ dateString, noteType: day\|lunch\|dinner, content? }` | update ou insert | `{ success, note }` |
| `DELETE /api/planning-notes?dateString=&noteType=` | 👤 | query | delete (idempotent) | `{ success, deleted }` |
| `POST /api/shopping-lists` | 👤 | `{ name }` | insert | `{ success, list }` |
| `PUT /api/shopping-lists/:id` | 👤 | `{ name }` | update (404 si absente) | `{ success, list }` |
| `DELETE /api/shopping-lists/:id` | 👤 | — | delete (cascade articles, 404 si absente) | `{ success }` |
| `POST /api/shopping-lists/:id/recipes` | 👤 | `{ recipeId, sectionIds?: uuid[], servingsFactor?: > 0 }` | `rpc add_recipe_to_list` (fusion des doublons) | `{ success, items: ShoppingItemDetail[] }` |
| `POST /api/shopping-items` | 👤 | `{ listId, name, amount?: string\|number, unit?, recipeId? }` | `rpc parse_amount` + `normalize_unit` → `rpc merge_shopping_item` (même nom + même unité → quantités additionnées) | `{ success, item: ShoppingItemDetail }` |
| `PUT /api/shopping-items/:id` | 👤 | `{ name?, amount?, unit?, isChecked? }` (≥ 1 champ) | update (triggers `amount_num`/`unit_code`) | `{ success, item }` |
| `DELETE /api/shopping-items/:id` | 👤 | — | delete (404 si absent) | `{ success }` |

`RecipeInput` (camelCase, forme de `RecipeEditor.vue`) : `title` 1–200, `category`, `description?`, `notes?`, `prepTime|cookTime|servings` entiers ≥ 0 ou `null`, `image?`, `tags: string[]`, `sections[] { name, type: ingredients|instructions|mixed, orderIndex, ingredients[] { name, amount: string|number|null, unit, unitCode?: UnitCode, optional, orderIndex }, instructions[] { content, orderIndex } | string }`. Les clés inconnues (`id`, `createdAt`, `favorite`…) sont ignorées. `amount` part en texte vers `save_recipe`, qui calcule `amount_num` (`parse_amount`) et `unit_code` (`normalize_unit`) et recalcule le JSONB legacy.

`RecipeDetail` (réponse, `server/utils/recipes.ts`) : ligne `recipes` **sans** JSONB (`id, title, description, category, prepTime, cookTime, servings, image, photoPath, tags, notes, createdAt, updatedAt`) + `sections[] { id, recipeId, name, type, orderIndex, ingredients[] { id, sectionId, name, amount, amountNum, unit, unitCode, optional, orderIndex }, instructions[] { id, sectionId, content, orderIndex } }`, triés par `orderIndex`.

Erreurs : `400` « Données invalides : champ : raison ; … » (Zod), `401/403` auth, `404/409` métier, erreurs SQL volontaires des RPC (`22023` → 400 avec le message français, `P0002` → 404, `42501` → 403) ; tout le reste → `500` « Une erreur est survenue, réessayez plus tard. » avec le détail uniquement dans la console serveur (`[api] <contexte>`). Côté client, `toUserMessage(err)` (`app/composables/useApiError.ts`) affiche le `statusMessage` pour les 4xx et `errors.generic` (i18n) sinon.

> Les endpoints 👤/🔑 ne reçoivent plus de `userId` du client : il est dérivé de la session (cookie envoyé automatiquement par le navigateur, ou en-tête `Authorization: Bearer` pour un client externe).

## Planning et listes de courses (interface)

Pages `app/pages/planning.vue` et `app/pages/courses.vue` (Nuxt UI, ≤ 300 lignes), découpées en
composants `app/components/planning/**` et `app/components/shopping/**`. Deux composables portent
l'état d'interface et le retour utilisateur (`useToast()` + `toUserMessage()`), les stores ne font
que lire/écrire :

| Couche | Planning | Courses |
|---|---|---|
| Store (données) | `usePlanningStore` : `loadWeek`, `refresh`, `ensureWeekLoaded`, `addMeal`, `addCustomMeal`, `removeMeal`, `moveMeal` (`PUT /api/planning/:id`), `saveNote` (vide → `DELETE`) | `useShoppingStore` : `refresh`, `ensureLoaded`, `createList`/`updateListName`/`deleteList`/`clearList`, `addItem` (fusion en base), `updateItem`, `toggleItem` (optimiste), `toggleAllItems`, `clearChecked`, `resetQuantities`, `moveItem`, `addRecipeToList`, `addIngredientsToLists` (façade) |
| Composable (UI) | `usePlanningWeek(date)` : semaine courante, jours (`PlanningDay[]`), formats de date localisés, actions → toasts | `useShoppingLists()` : liste courante, groupes cochés / à acheter, rayons, préférences `storeMode` / `byAisle` (localStorage), actions → toasts |
| Utilitaires | `app/utils/week.ts` (lundi → dimanche, clés `YYYY-MM-DD` en heure locale, `shiftWeeks`, `fromDateString`) | `shared/utils/shopping.ts` (`formatQuantity`, `splitChecked`, `aisleOf`, `groupByAisle`) |

- Les actions des stores **lèvent** (`ApiError` via `apiErrorFromResponse`) ; aucune logique de
  consolidation côté client : `merge_shopping_item` / `add_recipe_to_list` fusionnent en base
  (même nom replié + même `unit_code`). La quantité affichée vient de `amountNum` + libellé
  `useUnits().unitLabel(unitCode, unit)`.
- `addIngredientsToLists(ingredients)` reste une façade pour la carte et la fiche recette
  (`RecipeCard.vue`, `pages/recettes/[id].vue`) : un `POST /api/shopping-items` par ingrédient dans la
  liste courante (créée sous « Ma liste de courses » si aucune). À remplacer par `addRecipeToList`
  (un seul appel, sections et facteur de portions) quand ces écrans passeront par la RPC.
- `PlanningModal.vue` (ajout d'une recette depuis sa carte/fiche) garde son API : props `show`,
  `recipe: RecipeSummary`, événement `close`.
- Planning : vue en liste par jour sur mobile, grille 7 colonnes sur `lg`, glisser-déposer natif
  (`dataTransfer` = id du repas) avec repli accessible « Déplacer… » (modale jour/créneau) ;
  `?week=AAAA-MM-JJ` ouvre directement une semaine ; impression via `@media print` (paysage).
- Courses : regroupement par rayon optionnel (table de mots-clés statique, `shared/utils/shopping.ts`),
  mode « magasin » (zones tactiles agrandies), unités via `USelectMenu` + saisie libre.
- Textes i18n : blocs `planning`, `shopping`, `planningPrint` (fr/en).

## Variables d'environnement

Seules ces variables sont lues par le code :

```bash
SUPABASE_URL=            # URL du projet Supabase
SUPABASE_ANON_KEY=       # clé publique anon
AI_PROVIDER=openai       # traducteur IA : openai | anthropic | google | mistral | mock (défaut openai)
AI_MODEL=                # modèle du fournisseur (vide = défaut : gpt-4.1-mini, claude-haiku-4-5, gemini-2.5-flash, mistral-small-latest)
AI_DAILY_QUOTA=50        # appels IA max / utilisateur / jour (0 = traducteur désactivé)
OPENAI_API_KEY=          # clé du fournisseur choisi (une seule nécessaire) ; aussi ANTHROPIC_API_KEY,
                         # GOOGLE_GENERATIVE_AI_API_KEY, MISTRAL_API_KEY
NUXT_PUBLIC_AUTH_PROVIDERS=google   # fournisseurs OAuth affichés (google, apple) — défaut : google
```

- **IA** : ces variables sont exposées au serveur via `runtimeConfig` (`nuxt.config.ts`, clés `ai*`,
  `openaiApiKey`…) et relues à l'exécution par `getAiConfig()` (`server/utils/ai/provider.ts`) avec
  repli sur `process.env` : sur Vercel, `OPENAI_API_KEY` existant suffit, `NUXT_AI_PROVIDER` et
  consorts fonctionnent aussi.

- **Mapping Supabase** : le module `@nuxtjs/supabase` attend `SUPABASE_URL` / `SUPABASE_KEY`. Pour ne pas renommer la variable existante sur Vercel, `nuxt.config.ts` mappe explicitement `supabase: { url: process.env.SUPABASE_URL, key: process.env.SUPABASE_ANON_KEY }`. (`NUXT_PUBLIC_SUPABASE_URL` / `NUXT_PUBLIC_SUPABASE_KEY` fonctionnent aussi à l'exécution.)
- **Développement** : dans `.env` (gitignoré). Modèle : `env.example`.
- **Production** : dans le dashboard **Vercel** (Settings → Environment Variables) — aucun fichier `.env` n'est déployé.
- ❌ La clé `service_role` n'est **pas** utilisée par l'application et ne doit jamais être exposée côté client.

## Commandes

```bash
npm install
npm run dev        # http://localhost:3001 (prévisualisation agent : .claude/launch.json → port 3007)
npm run build      # build de production (preset Vercel, .vercel/output)
npm run start      # serveur de production
npm run lint       # ESLint (npm run lint:fix pour corriger)
npm run typecheck  # vue-tsc, TypeScript strict
npm test           # Vitest (npm run test:watch en continu)
```

Déploiement : push sur `main` → build automatique Vercel.

## Base de dev locale

Une stack Supabase complète tourne en local (Docker + CLI Supabase : Postgres 17, Auth,
PostgREST, Storage, Studio) avec le schéma prod, les migrations `0003 → 0010` appliquées, les
vraies recettes (snapshot anonymisé, gitignoré) et des comptes de test. Détails :
[supabase/local/README.md](supabase/local/README.md).

```bash
npm run db:local:up        # Docker → supabase start → supabase/local/setup.sh (schéma, données, 0003→0010, vérifs)
cp .env.local.example .env.local
npm run dev:local          # Nuxt sur la base locale (nuxt dev --dotenv .env.local) ; npm run dev reste sur .env (prod)
npm run db:local:reset     # repartir d'une base vide puis réamorcer
npm run db:local:test      # reset + seed_test.sql + 0003→0010 + supabase/tests/test_00xx.sql (puis db:local:reset)
npm run db:local:down      # arrêter les conteneurs
```

- Comptes : `admin@local.test` / `password123` (admin, uuid prod conservé : favoris, planning, listes)
  et `user@local.test` / `password123`. Studio : http://127.0.0.1:54323, mails : http://127.0.0.1:54324.
- La CLI ne gère **pas** l'historique prod : `[db.migrations] enabled = false` dans
  `supabase/config.toml`, pas de `supabase link`. Les fichiers `supabase/migrations/00xx_*.sql`
  restent appliqués à la main (prod) ou par `setup.sh` (local).
- Le hook JWT (`custom_access_token_hook`, claim `user_role`) est actif en local, comme il le
  sera en prod après activation dans le dashboard.
- Prévisualisation agent : configuration `preview-local` de `.claude/launch.json` (port 3007).
- Traducteur IA en local : `AI_PROVIDER=mock` dans `.env.local` (recette fixe, aucun appel payant) ;
  la migration `0012_ai_usage.sql` doit être appliquée (`psql $LOCAL_DB_URL -f supabase/migrations/0012_ai_usage.sql`
  tant que `setup.sh` ne l'inclut pas).
- Limites : pas d'appel IA réel (fournisseur `mock`), pas d'e-mails sortants (Mailpit),
  Postgres `17.11` local vs `17.4` prod (mêmes extensions).

**Régressions connues de l'app actuelle face à 0003 → 0010** :

- ~~`server/api/recipes.get.ts` chargeait tous les ingrédients/instructions en un `select` (tronqué
  à `max_rows = 1000` → 57 recettes sans ingrédient)~~ — corrigé : la liste passe par `search_recipes`
  et la fiche par une requête ciblée (`useRecipe`), le repli JSONB a disparu du front.
- `components/RecipeEditor.vue` n'envoie plus `ingredients`/`instructions` JSONB : jusqu'au
  passage par `save_recipe` (0006), une recette modifiée garde un JSONB périmé (sans effet
  d'affichage : le front ne lit plus le JSONB).

## IA (traducteur de recettes)

Page `/traducteur` (admins) : texte brut collé → recette structurée (aperçu) → ajout via
`useRecipesStore().addRecipe()`. Tout le code IA est dans `server/utils/ai/` et
`shared/schemas/ai.ts` ; comparatif des modèles et coûts dans [docs/IA_MODELES.md](docs/IA_MODELES.md).

| Fichier | Rôle |
|---|---|
| `shared/schemas/ai.ts` | `translateRecipeBodySchema` (body), `aiRecipeSchema` (forme imposée au modèle : unité ∈ 37 `UNIT_CODES`, catégorie ∈ 9, tout `nullable`, rien d'optionnel), `aiRecipeToRecipeInput` (→ forme de l'éditeur), `TranslateRecipeResponse` |
| `server/utils/ai/provider.ts` | `getAiConfig(event)` (variables `AI_*`, clés), `getModel(config)` → `LanguageModel` AI SDK (`createOpenAI`, `createAnthropic`, `createGoogleGenerativeAI`, `createMistral`, ou mock) |
| `server/utils/ai/mock.ts` | `MockLanguageModelV4` (`ai/test`) : recette fixe, titre = première ligne du texte, tokens ≈ caractères / 4 |
| `server/utils/ai/prompt.ts` | prompt système (français) : règles sections / unités / conversions métriques / « ne rien inventer », langue cible ; prompt utilisateur avec le texte entre balises `<recette>` |
| `server/utils/ai/translate.ts` | `translateRecipeText(model, text, lang)` : `generateObject` + `aiRecipeSchema`, délai 25 s, 1 retry |
| `server/utils/ai/errors.ts` | `throwAiProviderError` : erreurs AI SDK → 401 (clé), 402 (crédit fournisseur), 422 (réponse inexploitable), 502 (modèle/autre), 504 (délai), messages français sans détail technique |
| `server/utils/ai/usage.ts` | `assertAiQuota` (`rpc check_ai_quota`, 429), `logAiUsage` (insert `ai_usage` + coût estimé) |
| `server/utils/ai/pricing.ts` | grille de prix datée par modèle, `estimateCostUsd` |
| `server/utils/ai/media.ts` | préparation phase 5 : `getTranscriptionModel` (OpenAI `gpt-4o-mini-transcribe`), mode d'emploi `experimental_transcribe` et images dans `generateObject` |
| `app/composables/useTranslator.ts`, `app/components/RecipeTranslator.vue`, `app/components/translator/RecipePreview.vue` | front (Nuxt UI) : saisie, aperçu avec unités canoniques (`useUnits`), ajout, erreurs via `toUserMessage` (502/504 → messages i18n `translator.errors.*`) |

Points d'attention :

- **Sorties structurées strictes** (OpenAI) : pas de champ optionnel ni de contrainte de longueur
  dans `aiRecipeSchema` ; les longueurs sont vérifiées après conversion par `recipeInputSchema`
  (le serveur renvoie un `RecipeInput` déjà validé).
- **Quota** : `AI_DAILY_QUOTA` par utilisateur et par jour (Europe/Paris), admins compris, compté
  dans `ai_usage` (appels ok et error). `0` désactive le traducteur.
- **Ouvrir aux non-admins (phase 4)** : remplacer `requireAdmin` par `requireUser` dans
  `translate-recipe.post.ts` et retirer `requiresAdmin` de la page ; quota et journal sont déjà
  par utilisateur. `ai_usage` n'est pas encore dans les types générés (à régénérer après 0012 en prod).
- **Changer de fournisseur** : `AI_PROVIDER` + la clé correspondante sur Vercel, sans code. Un
  fournisseur hors liste : `npm i @ai-sdk/<nom>`, cas dans `getModel`, clé dans `runtimeConfig`.
- Tests : `test/unit/schemas/ai.test.ts`, `test/unit/ai/*.test.ts` (mock, erreurs, prix),
  `test/integration/translate-recipe.local.test.ts` (serveur dev `mock` + base locale, `APP_URL`).

## Fiche recette, éditeur et photos (phase 3B)

### Fiche (`app/pages/recettes/[id].vue`, ≈ 190 lignes)

La page assemble des composants Nuxt UI sous `app/components/recipe/` :

| Composant | Rôle |
|---|---|
| `RecipeHero` | photo du bucket (ou icône de repli sur `bg-muted`), catégorie en `UBadge`, tags, titre `font-serif`, temps, compteur de portions (`RecipeServingsControl`) |
| `RecipeIngredients` | ingrédients par section avec **cases à cocher** (suivi en cuisinant, état local), quantités mises à l'échelle, unité canonique via `useUnits().unitLabel(unitCode, unit)` |
| `RecipeSteps` | étapes numérotées par section |
| `RecipeActions` | favori, courses, planning (`PlanningModal` de 3C, API `show`/`recipe`/`close`), mode cuisine, impression (`window.print()`), modifier/supprimer (admin). La confirmation de suppression est une `UModal` dans la page |
| `RecipeAddToShoppingModal` | choix de la liste (création inline si aucune) et des **sections** à ajouter → `useShoppingStore().addRecipeToList(listId, recipeId, sectionIds, servingsFactor)` |
| `RecipeCookingMode` | `UModal fullscreen` : une étape à la fois, ingrédients de la section, `UProgress`, ←/→/Échap, Wake Lock |

Composables :

- `useServingsScaler(recipe)` — `servings` cible, `factor` (= cible / portions de la recette, `1` si inconnues), `scaledAmount(ingredient)`. La mise à l'échelle vit dans `shared/utils/recipes.ts` : `servingsFactor`, `roundReadable` (< 10 : au quart ou au tiers → ½ ¼ ¾ ⅓ ⅔ ; 10–100 : une décimale ; ≥ 100 : entier), `scaleAmount`, `formatScaledAmount` (texte libre non numérique rendu tel quel). Le facteur est passé à `add_recipe_to_list`.
- `useIngredientLabel()` (`useRecipe.ts`) — « quantité + unité » / « quantité + unité + nom » partagé par la fiche, le mode cuisine et la modale courses.
- `useCookingMode(recipe)` — `flattenSteps` des sections, navigation, `currentIngredientSection` (section de l'étape, sinon section d'ingrédients de même nom, sinon l'unique section d'ingrédients), `navigator.wakeLock.request('screen')` à l'ouverture (redemandé au retour de l'onglet, relâché à la fermeture, **silencieux** si non supporté ou refusé), écouteurs clavier posés/retirés avec `isOpen`.
- Impression : utilitaires `print:` sur les actions/navigation de la page + feuille `@media print` injectée par `useHead` (en-tête/pied du layout masqués, `@page { margin: 1.5cm }`, sauts de page évités dans les listes).

### Éditeur (`app/components/RecipeEditor.vue` → `app/components/editor/`)

`RecipeEditor.vue` est une **façade** qui garde l'API historique utilisée par `pages/recettes/index.vue` et `[id].vue` : props `show` / `recipe: Recipe | null`, émissions `close` / `save(recipe)`. Elle rend une `UModal` contenant `editor/RecipeEditorForm.vue` (recréé à chaque ouverture : `v-if="show"`).

- `RecipeEditorForm` — `UForm` + `recipeInputSchema` (Zod, erreurs sous chaque champ par chemin `sections.0.ingredients.1.name`) + validation custom « au moins un ingrédient et une étape ». L'état du formulaire a la forme du schéma (+ `key` stables). Les sections `mixed` (0005) sont chargées comme une section d'ingrédients **et** une section d'étapes du même nom ; à l'enregistrement les sections d'ingrédients précèdent celles d'étapes (`orderIndex` recalculé). Soumission via `useRecipesStore().addRecipe / updateRecipe`.
- `SectionEditor` — nom, lignes, monter/descendre (sections, ingrédients, étapes), glisser-déposer des étapes par la poignée (dans la section). Les modifications remontent en **updater** `(section) => section'` appliqué sur l'état courant du formulaire (robuste à deux changements dans le même tick).
- `IngredientRow` — quantité (texte libre, `parse_amount` côté base), **unité en `USelectMenu`** alimenté par `useUnits()` (libellé `abbr — label`, valeur = `abbr`, qui se normalise en `unit_code` par `normalize_unit`) avec `create-item` pour une saisie libre ; « sans unité » passe par une sentinelle (`''` est interdit par Reka). `unitCode` n'est pas envoyé : la base le dérive.
- `StepRow`, `PhotoField` (aperçu bucket ou object URL du fichier choisi, remplacer/retirer).

### Photos (`useRecipePhoto`, bucket `recipe-photos`, migrations 0010 + 0011)

- Pas de transformation d'images sur le plan Supabase gratuit : **redimensionnement client** (`resizeRecipeImage` : canvas, `createImageBitmap` avec orientation EXIF, plus grand côté 1600 px, WebP qualité 0,82, repli JPEG).
- `uploadPhoto(recipeId, file)` → `recipe-photos/<recipeId>/<timestamp>.webp` (client Supabase de l'admin, politiques de 0010), `removePhoto(path)`, `removeRecipePhotos(recipeId)` (vide le dossier avant `delete_recipe`), `publicUrl(path)`.
- Flux : modification → la photo est téléversée d'abord (id connu), `photoPath` part dans `RecipeInput`, l'ancien objet est supprimé après l'enregistrement ; création → recette d'abord, puis photo, puis `updateRecipe` avec `photoPath`. `photoPath` absent/vide → `save_recipe` (0011) remet `photo_path` à `NULL`.
- Affichage : `<img>` sur l'URL publique (pas `NuxtImg` : il faudrait `image.domains` ou le provider `supabase` dans `nuxt.config.ts`).
- `RecipeInput` de `shared/types/index.ts` n'a pas encore `photoPath` (clé acceptée par le schéma Zod) : l'éditeur passe par `RecipeInput & { photoPath?: string | null }` ; à ajouter au type en phase 4.

## À savoir

- **Tests** : Vitest via `@nuxt/test-utils` (environnement `happy-dom` par défaut ; `// @vitest-environment nuxt` pour un test nécessitant l'app). Premier test : `test/unit/text.test.ts`.
- **CI** : `.github/workflows/ci.yml` (Node 22, `npm ci`, lint, typecheck, test, build avec variables Supabase factices).
- **Types Supabase** : générés dans `shared/types/database.ts` (`supabase.types` dans `nuxt.config.ts`) ; `useSupabaseClient()` / `serverSupabaseClient()` sont typés. Exception temporaire : `AuthContext.supabase` (`server/utils/auth.ts`) reste non typé tant que les endpoints d'écriture historiques ne compilent pas avec les types générés.
- **Dette lint connue** (warnings) : `console.log` historiques, `catch (error: any)` dans les endpoints, plusieurs racines dans `pages/recettes/[id].vue`.
- Migrations base de données : `supabase/migrations/`. Appliquer via le SQL Editor du dashboard Supabase ou la CLI Supabase. Voir [SECURITY_HARDENING.md](SECURITY_HARDENING.md) pour l'ordre de déploiement du durcissement RLS.
