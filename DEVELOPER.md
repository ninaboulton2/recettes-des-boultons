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
| IA | OpenAI (`gpt-4o-mini`) pour le traducteur de recettes |
| Qualité | TypeScript strict, ESLint (`@nuxt/eslint`), Vitest (`@nuxt/test-utils`), CI GitHub Actions |
| Hébergement | Vercel |

## Structure du projet

```
recettes-des-boultons/
├── app/                     # srcDir Nuxt 4 (alias ~/ et @/)
│   ├── app.vue              # Racine : <UApp> (Nuxt UI) > <NuxtLayout> > <NuxtPage>
│   ├── app.config.ts        # Alias de couleurs Nuxt UI (primary/secondary → palette maison)
│   ├── assets/css/main.css  # Tailwind 4 + Nuxt UI, @theme (palettes, polices, animations)
│   ├── components/          # Composants Vue réutilisables
│   ├── pages/               # Routes (recettes, planning, courses, favoris, traducteur)
│   ├── layouts/             # Layout par défaut
│   ├── stores/              # Pinia : recipes, planning, favorites, shopping, auth
│   ├── composables/         # useApi (apiFetch)
│   ├── middleware/auth.ts   # Garde de route côté client (admin)
│   └── plugins/             # toast.client.js
├── shared/                  # Code partagé client/serveur (alias #shared)
│   ├── types/index.ts       # Types métier (Recipe, User, ...)
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
- Nuxt UI : `ui.colorMode: false` (pas de mode sombre pour l'instant) ; `<UApp>` est en place, les composants maison (modales, toasts) restent utilisés et seront migrés dans une phase ultérieure.
- `pages/recettes/[id].vue` déclare un `path` restreint aux UUID (`definePageMeta`) : Nuxt 4 ordonne `[category]` avant `[id]`, ce qui capturait les identifiants de recettes.

## Authentification & sécurité

> ⚠️ L'authentification repose sur **Supabase Auth**, pas sur un système JWT/bcrypt maison.
> Le rôle d'administrateur est porté par la colonne `role` de la table `profiles`.

### Côté client

- **Session** : gérée par le module `@nuxtjs/supabase` (`redirect: false`). Un seul client (`useSupabaseClient()`), session persistée dans un **cookie** (`@supabase/ssr`), donc disponible au SSR et aux endpoints `/api/*`. `useSupabaseUser()` (claims du JWT) est la source de vérité.
- **Store** : `app/stores/auth.ts` (setup store) suit `useSupabaseUser()` et y accole le profil applicatif lu dans `profiles` (`name`, `role`, préférences). Expose `isAuthenticated`, `isAdmin`, `currentUser`, `login`, `logout`, `checkAuth`, `init`. Plus de token ni de décodage JWT côté client.
- **Garde de route** : `app/middleware/auth.ts` protège les pages marquées `meta.requiresAdmin` (redirige vers `/` si non-admin). ⚠️ C'est une garde **d'affichage uniquement** — la vraie sécurité est côté serveur.
- **Appels API** : les stores passent par `apiFetch` (`app/composables/useApi.ts`), simple `fetch` same-origin : le cookie de session part automatiquement, plus besoin d'en-tête `Authorization`.

### Côté serveur (la barrière qui fait foi)

`server/utils/auth.ts` expose deux gardes, utilisées par tous les endpoints d'écriture :

- **`requireUser(event)`** — accepte **soit** le cookie de session (`serverSupabaseClient` / `serverSupabaseUser` du module), **soit** un en-tête `Authorization: Bearer <jwt>` (clients externes). Renvoie `{ supabase, user }` : un client Supabase agissant au nom de l'utilisateur (le RLS s'applique avec `auth.uid()`) et son identité. `user.id` est **toujours dérivé du token validé**, jamais d'un `userId` envoyé par le client (évite l'usurpation / IDOR).
- **`requireAdmin(event)`** — `requireUser` + vérification que `profiles.role = 'admin'`. Renvoie 401 si non connecté, 403 si non-admin.

Les lectures publiques (`GET /api/recipes`) utilisent `serverSupabaseClient(event)` (anonyme si aucune session).

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
- Une recette stocke ses ingrédients/instructions à la fois en JSONB (champs `ingredients`/`instructions`, compatibilité) **et** de façon structurée via `recipe_sections` → `recipe_ingredients` / `instructions` (modèle à sections).
- `profiles.id` référence `auth.users.id` ; un trigger `handle_new_user` crée le profil à l'inscription.

## Endpoints API (`server/api/`)

Légende auth : 🟢 public · 👤 utilisateur connecté (`requireUser`) · 🔑 admin (`requireAdmin`)

**Recettes**
- 🟢 `GET /api/recipes`
- 🔑 `POST /api/add-recipe` · `PUT /api/update-recipe?id=` · `DELETE /api/delete-recipe?id=`
- 🔑 `POST|PUT|DELETE /api/recipe-sections` · `POST /api/section-ingredients` · `POST /api/section-instructions`
- 🔑 `POST /api/translate-recipe` (OpenAI)

**Favoris** (👤)
- `GET|POST /api/favorites` · `DELETE /api/favorites?recipeId=`

**Planning** (👤)
- `GET|POST /api/planning` · `DELETE /api/planning/:id`
- `POST /api/planning-notes` · `DELETE /api/planning-notes?dateString=&noteType=`

**Courses** (👤)
- `GET|POST /api/shopping-lists` · `PUT|DELETE /api/shopping-lists/:id`
- `POST /api/shopping-items` · `PUT|DELETE /api/shopping-items/:id`

> Les endpoints 👤/🔑 ne reçoivent plus de `userId` du client : il est dérivé de la session (cookie envoyé automatiquement par le navigateur, ou en-tête `Authorization: Bearer` pour un client externe).

## Variables d'environnement

Seules ces variables sont lues par le code :

```bash
SUPABASE_URL=            # URL du projet Supabase
SUPABASE_ANON_KEY=       # clé publique anon
OPENAI_API_KEY=          # traducteur IA (optionnel : page /traducteur)
```

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

## À savoir

- **Tests** : Vitest via `@nuxt/test-utils` (environnement `happy-dom` par défaut ; `// @vitest-environment nuxt` pour un test nécessitant l'app). Premier test : `test/unit/text.test.ts`.
- **CI** : `.github/workflows/ci.yml` (Node 22, `npm ci`, lint, typecheck, test, build avec variables Supabase factices).
- **Types Supabase** : pas encore de types générés ; les clients sont non typés (`// TODO(phase 2)` dans le code). Quand `shared/types/database.ts` existera, pointer `supabase.types` dessus dans `nuxt.config.ts`.
- **Dette lint connue** (warnings) : `console.log` historiques, `catch (error: any)` dans les endpoints, plusieurs racines dans `pages/recettes/[id].vue`.
- Migrations base de données : `supabase/migrations/`. Appliquer via le SQL Editor du dashboard Supabase ou la CLI Supabase. Voir [SECURITY_HARDENING.md](SECURITY_HARDENING.md) pour l'ordre de déploiement du durcissement RLS.
