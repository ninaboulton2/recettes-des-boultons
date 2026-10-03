# Régénérer le snapshot des données prod (lecture seule)

Le dossier `supabase/local/snapshot/` est **gitignoré** : il contient les recettes et les
données personnelles (favoris, planning, courses) de la famille, anonymisées côté comptes
(aucun e-mail réel ; mots de passe locaux `password123`). Chaque développeur le régénère
sur sa machine. La prod n'est **jamais** modifiée : uniquement des `SELECT`.

## 1. Exporter les tables en JSON

Dans le **SQL Editor** du dashboard Supabase (projet `tzlkabxcmmbwhpyvmato`) — ou via l'outil
MCP `execute_sql` — exécuter chacune des requêtes ci-dessous et enregistrer le résultat
tel quel dans `supabase/local/snapshot/raw/<nom>.json`. Le script accepte indifféremment :

* un tableau JSON de lignes `[{…}, {…}]` (export « JSON » du SQL Editor) ;
* le résultat brut `[{"data": …}]` ;
* l'enveloppe texte renvoyée par l'outil MCP (`{"result": "…"}`).

Une table peut être découpée en plusieurs fichiers (`recipes_1.json`, `recipes_2.json`, …
avec `limit/offset`) si le résultat est trop gros ; les lots sont concaténés.

```sql
-- raw/recipes.json  (ou recipes_1.json / recipes_2.json avec limit 91 offset 0 / 91)
select json_agg(t order by t.id) as data from (
  select id,title,description,category,ingredients,instructions,prep_time,cook_time,
         servings,image,tags,notes,created_at,updated_at
    from public.recipes order by id) t;

-- raw/recipe_sections.json
select json_agg(t order by t.id) as data from (
  select id,recipe_id,name,type,order_index,created_at,updated_at from public.recipe_sections) t;

-- raw/recipe_ingredients.json  (ou _1 / _2 avec limit 856 offset 0 / 856)
select json_agg(t order by t.id) as data from (
  select id,recipe_id,section_id,name,amount,unit,optional,order_index,created_at,updated_at
    from public.recipe_ingredients order by id) t;

-- raw/instructions.json
select json_agg(t order by t.id) as data from (
  select id,recipe_id,section_id,content,order_index,created_at,updated_at from public.instructions) t;

-- raw/user_data.json  (un seul fichier, un objet) — AUCUN e-mail n'est exporté
select json_build_object(
  'shopping_lists', (select json_agg(t order by t.created_at) from (select id,user_id,name,created_at,updated_at from public.shopping_lists) t),
  'shopping_items', (select json_agg(t order by t.created_at) from (select id,list_id,name,amount,unit,recipe_id,is_checked,created_at,updated_at from public.shopping_items) t),
  'planning',       (select json_agg(t order by t.created_at) from (select id,user_id,date_string,meal_type,recipe_id,custom_title,created_at,updated_at from public.planning) t),
  'planning_notes', (select json_agg(t order by t.created_at) from (select id,user_id,date_string,note_type,content,created_at,updated_at from public.planning_notes) t),
  'favorites',      (select json_agg(t order by t.created_at) from (select id,user_id,recipe_id,created_at,updated_at from public.favorites) t),
  'profiles',       (select json_agg(t order by t.created_at) from (select id,name,role,language,theme,notifications,created_at,updated_at from public.profiles) t),
  'users',          (select json_agg(t order by t.created_at) from (
                       select id, created_at, updated_at, email_confirmed_at is not null as confirmed,
                              raw_user_meta_data->>'name' as meta_name, raw_user_meta_data->>'full_name' as meta_full_name,
                              raw_user_meta_data->>'role' as meta_role
                         from auth.users) t)
) as data;
```

Les exports doivent être pris **avant** l'application de 0003 → 0010 en prod (colonnes
« avant migration »). Une fois les migrations appliquées en prod, le snapshot restera
valable (les colonnes ajoutées sont nullable et recalculées par les triggers), mais les
comptes de `verify.sql` devront être revus (les orphelins auront déjà été supprimés en prod,
0005 n'aura donc plus rien à migrer : utiliser `setup.sh --no-verify` ou ajuster `verify.sql`).

## 2. Construire les fichiers SQL

```sh
npm run db:local:snapshot        # = node supabase/local/build_snapshot.mjs
```

Produit `snapshot/00_users.sql` → `50_user_data.sql` (`insert … on conflict do nothing`),
puis affiche la correspondance uuid prod → e-mail local :

* le 1er admin (par date de création) → `admin@local.test`, le 2e → `admin2@local.test` ;
* le 1er utilisateur → `user@local.test`, puis `user2@…`, `user3@…` (comptes sans profil en dernier) ;
* mot de passe `password123` pour tous ; les uuid prod sont **conservés** pour que favoris,
  planning et listes de courses restent attachés.

## 3. Charger

```sh
npm run db:local:reset           # supabase db reset + setup.sh (schéma, snapshot, 0003 → 0010, vérifs)
```

## Alternative : `pg_dump`

Avec le mot de passe de la base (Dashboard → Settings → Database), un
`pg_dump --data-only --column-inserts --table=public.recipes …` vers `snapshot/10_recipes.sql`
fonctionne aussi, à condition d'anonymiser `profiles.email` et de générer `00_users.sql`
à la main (voir le format produit par `build_snapshot.mjs`). Ne jamais dumper `auth.users`
tel quel (e-mails et hachages réels).
