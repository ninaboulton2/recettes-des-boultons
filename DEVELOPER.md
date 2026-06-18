# Guide technique — Recettes des Boultons

Application de gestion de recettes familiales : recettes, planning des repas, listes de courses, favoris, et traducteur de recettes par IA.

## Stack technique

| Couche | Technologie |
|---|---|
| Framework | Nuxt 3 (SSR) + Vue 3 (Composition API) |
| UI | Tailwind CSS, `@nuxt/image`, `@nuxtjs/color-mode` |
| État | Pinia (`stores/`) |
| i18n | `@nuxtjs/i18n` (FR par défaut, EN) |
| Backend | API Nitro intégrée (`server/api/`) |
| Base de données / Auth | Supabase (PostgreSQL + Supabase Auth) |
| IA | OpenAI (`gpt-4o-mini`) pour le traducteur de recettes |
| Hébergement | Vercel |

## Structure du projet

```
recettes-des-boultons/
├── components/          # Composants Vue réutilisables
├── pages/               # Routes (recettes, planning, courses, favoris, traducteur)
├── layouts/             # Layout par défaut
├── stores/              # Pinia : recipes, planning, favorites, shopping, auth
├── composables/         # useSupabase (client), useApi (apiFetch)
├── server/
│   ├── api/             # Endpoints REST (Nitro)
│   └── utils/auth.ts    # requireUser / requireAdmin (auth serveur)
├── middleware/auth.ts   # Garde de route côté client (admin)
├── utils/supabase.ts    # Client Supabase anon partagé (lecture publique)
├── i18n/locales/        # fr.json, en.json
├── supabase/migrations/ # Migrations SQL (RLS, etc.)
└── public/images/       # Images des recettes par catégorie
```

## Authentification & sécurité

> ⚠️ L'authentification repose sur **Supabase Auth**, pas sur un système JWT/bcrypt maison.
> Le rôle d'administrateur est porté par la colonne `role` de la table `profiles`.

### Côté client

- **Connexion** : `stores/auth.ts` → `supabase.auth.signInWithPassword({ email, password })`. Le profil (dont `role`) est lu dans `profiles`. Le token de session est conservé dans le store et rafraîchi via `onAuthStateChange`.
- **Garde de route** : `middleware/auth.ts` protège les pages marquées `meta.requiresAdmin` (redirige vers `/` si non-admin). ⚠️ C'est une garde **d'affichage uniquement** — la vraie sécurité est côté serveur.
- **Appels API** : tous les stores passent par `apiFetch` (`composables/useApi.ts`), qui injecte automatiquement `Authorization: Bearer <token Supabase>` dans chaque requête vers `/api/*`.

### Côté serveur (la barrière qui fait foi)

`server/utils/auth.ts` expose deux gardes, utilisées par tous les endpoints d'écriture :

- **`requireUser(event)`** — valide le token Bearer, crée un client Supabase *scopé sur ce token* (le RLS s'applique avec `auth.uid()`), et renvoie `{ supabase, user }`. L'identité (`user.id`) est **toujours dérivée du token**, jamais d'un `userId` envoyé par le client (évite l'usurpation / IDOR).
- **`requireAdmin(event)`** — `requireUser` + vérification que `profiles.role = 'admin'`. Renvoie 401 si non connecté, 403 si non-admin.

Défense en profondeur : vérification explicite côté serveur **+** RLS en base.

### Modèle RLS (Row Level Security)

Défini dans `supabase/migrations/0001_harden_rls.sql` :

| Tables | Lecture | Écriture |
|---|---|---|
| `recipes`, `recipe_sections`, `recipe_ingredients`, `instructions` | publique | admin uniquement (`is_admin()`) |
| `favorites`, `planning`, `planning_notes`, `shopping_lists` | propriétaire (`auth.uid() = user_id`) | propriétaire |
| `shopping_items` | propriétaire (via la liste parente) | propriétaire (via la liste parente) |
| `profiles` | sa ligne (ou admin) | sa ligne ; un trigger empêche un non-admin de changer son `role` |

Fonctions `SECURITY DEFINER` : seules 4 RPC favoris sont utilisées (`get_recipe_by_id`, `add_user_favorite`, `delete_user_favorite_by_id`, `delete_user_favorite_by_recipe`), exécutables par les utilisateurs authentifiés. L'exécution par `anon` est révoquée. Voir [SECURITY_HARDENING.md](SECURITY_HARDENING.md).

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
- 🟢 `GET /api/recipes`, `/api/recipes-simple`, `/api/recipes-simple-sections`
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

> Les endpoints 👤/🔑 ne reçoivent plus de `userId` du client : il est dérivé du token. Le client doit donc envoyer son token (géré automatiquement par `apiFetch`).

## Variables d'environnement

Seules ces variables sont lues par le code :

```bash
SUPABASE_URL=            # URL du projet Supabase
SUPABASE_ANON_KEY=       # clé publique anon
OPENAI_API_KEY=          # traducteur IA
# API_BASE=http://localhost:3001   # optionnel
```

- **Développement** : dans `.env` (gitignoré). Modèle : `env.example`.
- **Production** : dans le dashboard **Vercel** (Settings → Environment Variables) — aucun fichier `.env` n'est déployé.
- ❌ La clé `service_role` n'est **pas** utilisée par l'application et ne doit jamais être exposée côté client.

## Commandes

```bash
npm install
npm run dev        # http://localhost:3001
npm run build      # build de production
npm run start      # serveur de production
npm run generate   # génération statique
```

Déploiement : push sur `main` → build automatique Vercel.

## À savoir

- **Aucun test automatisé** n'est présent dans le projet pour l'instant (les anciens scripts `scripts/test-*.js` référencés dans la doc précédente n'existent pas).
- Migrations base de données : `supabase/migrations/`. Appliquer via le SQL Editor du dashboard Supabase ou la CLI Supabase. Voir [SECURITY_HARDENING.md](SECURITY_HARDENING.md) pour l'ordre de déploiement du durcissement RLS.
