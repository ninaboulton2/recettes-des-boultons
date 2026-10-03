# Migrations 0003 → 0010 — fondations base de données

Projet Supabase `recettes-boultons` (`tzlkabxcmmbwhpyvmato`, Postgres 17, `en_US.UTF-8`).
Lecture de l'état prod : **2026-10-03**. Aucune de ces migrations n'a été appliquée en
production : l'application sera faite par un humain après revue (procédure § 4).

Principe **« expand only »** : aucune colonne/table supprimée, aucun changement de type,
politiques RLS existantes conservées (0009 les recrée à l'identique en changeant uniquement la
fonction appelée). L'ancien code applicatif continue de fonctionner pendant et après
l'application. Deux exceptions explicitement autorisées : suppression des 1 060 ingrédients
orphelins (0005, archivés avant) et suppression de `public.is_admin()` (0009, remplacée).

Chaque migration est idempotente (`if not exists`, `create or replace`, `on conflict`),
encapsulée dans `begin; … commit;`, avec un en-tête quoi / pourquoi / réversibilité / comptes
attendus, et des blocs `do $$ … assert … $$` qui **stoppent la transaction** si un compte ne
correspond pas.

---

## 1. Fichiers

| Fichier | Rôle |
|---|---|
| `migrations/0003_units.sql` | Référentiel `units` + `unit_aliases`, `fold_text()`, `normalize_unit()`, colonne `unit_code` + trigger |
| `migrations/0004_amount_num.sql` | `parse_amount()`, `format_amount()`, colonne `amount_num` + trigger |
| `migrations/0005_jsonb_to_sections.sql` | Sauvegardes `*_backup_20261003`, section « Recette » pour les 118 recettes sans section, archivage/suppression des orphelins |
| `migrations/0006_save_recipe.sql` | RPC `save_recipe(payload)` / `delete_recipe(id)` |
| `migrations/0007_shopping_rpc.sql` | RPC `merge_shopping_item(...)` / `add_recipe_to_list(...)` |
| `migrations/0008_search.sql` | `unaccent`, colonne générée `recipes.search`, RPC `search_recipes(...)` |
| `migrations/0009_admin_claim.sql` | Schéma `private`, `private.is_admin()`, bascule des 14 politiques, suppression `public.is_admin()`, hook `custom_access_token_hook` |
| `migrations/0010_recipe_photos.sql` | `recipes.photo_path`, bucket `recipe-photos`, politiques storage, `search_recipes` + `photo_path` |
| `seed_test.sql` | Données **jetables** pour les tests locaux (jamais en prod) |
| `tests/00_supabase_shim.sql`, `tests/01_baseline_schema.sql` | Émulation Supabase + schéma prod « avant 0001 » pour Postgres local |
| `tests/run_local.sh` | Rejoue tout (shim → 0001/0002 → seed → 0003…0010 → rejeu idempotence → tests) sur un cluster PG17 temporaire |
| `tests/test_00xx.sql` | Un script d'assertions par migration (transaction annulée à la fin) |

### Comment les migrations ont été testées

Docker n'étant pas disponible, la CLI Supabase locale n'a pas pu être utilisée. À la place :
PostgreSQL 17.11 Homebrew (`/opt/homebrew/opt/postgresql@17`), cluster jetable initialisé en
`en_US.UTF-8` (comme la prod), schéma `auth`/`storage`/rôles émulés (`tests/00_supabase_shim.sql`,
fonctions `auth.uid()/jwt()/role()` copiées de la prod), schéma public reconstruit depuis
`information_schema`/`pg_constraint`/`pg_indexes`/`pg_trigger` de la prod
(`tests/01_baseline_schema.sql`), puis 0001 et 0002 rejoués (→ 39 politiques et 5 fonctions,
identiques à la prod). Le jeu de données `seed_test.sql` reproduit les cas prod : recettes sans
section avec orphelins, recette avec sections et JSONB vide, recette avec sections + JSONB périmé
+ orphelins + instruction orpheline, unités FR/EN/casse/pluriels/inconnues, montants « 1/2 »,
« 1,5 », « 2-3 », « 1 1/2 », « 2 à 3 », « ½ », texte.

```sh
supabase/tests/run_local.sh          # ~10 s ; exit 0 = tout est vert
supabase/tests/run_local.sh --keep   # garde le cluster : psql -h 127.0.0.1 -p 54329 -U postgres
```

Résultat : 0003 → 0010 appliquées, rejouées une seconde fois (idempotence), 8 scripts de test
passés (RLS simulé via `tests.login(uuid, rôle, claims)`). Le mapping des unités a été vérifié
sur les **109 graphies réelles** de la prod (voir § 2.1).

Ce qui n'est **pas** testé localement : le moteur Storage lui-même (seules les tables/politiques
le sont), l'émission réelle du JWT par GoTrue (le hook est appelé directement), PostgREST.

---

## 2. Détail par migration

### 0003 — `units`, `unit_aliases`, `normalize_unit`, `unit_code`

* `units(code pk, label_fr, label_en, abbr, kind ∈ mass|volume|count|other, to_base numeric, sort_order)` — 37 unités.
  `to_base` = facteur vers **g** (mass) ou **ml** (volume) ; `null` pour count/other.
* `unit_aliases(alias pk, code → units)` — 190 alias stockés **repliés** (`fold_text`).
* `fold_text(text)` immuable, indépendant de la locale : accents retirés, minuscules,
  ponctuation/espaces → un espace, `NULL` si vide. Sert aussi à la fusion des articles (0007).
* `normalize_unit(text)` stable : alias exact → code canonique → singulier (« s »/« x » final).
* `recipe_ingredients.unit_code`, `shopping_items.unit_code` (nullable, FK) remplies ; trigger
  `trg_sync_unit_code` : si l'ancien code n'écrit que `unit`, `unit_code` est dérivé ; un
  `unit_code` fourni explicitement n'est jamais écrasé.
* Lecture publique (`anon`, `authenticated`) de `units`/`unit_aliases`, écriture par migration seulement.

**Comptes attendus en prod** : `recipe_ingredients` 1 712 lignes → 322 `unit` NULL, 26 lignes non
reconnues, **1 364 `unit_code` renseignés** ; `shopping_items` 43 → 9 `unit = ''`, **34 renseignés**.
La migration affiche la liste exacte des non reconnus en `NOTICE`.

#### 2.1 Mapping des 109 graphies prod → code (95 reconnues, 1 398 lignes)

| code | graphies prod (effectif) |
|---|---|
| g | g (499) |
| cas | CàS (86), càs (40), tbsp (26), cuillère à soupe (17), cuillères à soupe (17), cuil. à soupe (12), c. à soupe (5), Tbsp (3), c.à.s (3), càS (3), tablespoons (1) |
| ml | ml (178) |
| piece | unit (52), unités (47), pieces (21), unité (17), piece (15), pcs (8), pièce (2) |
| cac | CàC (29), cuillère à café (15), càc (14), tsp (12), cuil. à café (6), cac (3), teaspoon (2), CaC (1), c. à café (1), c.à.c (1) |
| pincee | pincée (43), pinch (12), pincées (4), Pincée (2) |
| sachet | sachet (21), sachets (9) |
| gousse | cloves (11), clove (3), Gousses (1), gousse (1), gousses (1) |
| bouquet | bouquet (8), bunch (5), petit bouquet (3) |
| poignee | handful (7), poignée (5), Poignée (1), grande poignée (1), petite poignée (1) |
| cube | cube (13), cube de 2cm (1) |
| pot | pot (10), pots (3) |
| botte | botte (13) |
| qs | to taste (4), quantité suffisante (3), au goût (1), quantité au choix (1), à convenance (1) |
| cl | cl (10) |
| boite | boîte (3), tin (3), can (2), tins (1) |
| branche | branches (4), branche (3) |
| paquet | pack (3), paquet (2), packs (1) |
| kg | Kg (3), kg (2) |
| morceau | chunks (2), morceaux (2), morceau (1) |
| portion | portion (4) |
| tasse | cups (2), cup (1), tasse (1) |
| verre | glasses (1), grand verre (1), verre (1) |
| bouteille | petite bouteille (3) |
| tige | tiges (2), Tiges (1) |
| goutte | gouttes (2) |
| feuille | feuilles (1), quelques feuilles (1) |
| cm | cm (2) |
| brin | brins (2) |
| l | L (1), l (1) |
| tete | tête (1) |
| dosette | Dosettes (1) |
| tranche | tranches (1) |
| tube | tube (1) |

Codes définis mais sans occurrence prod : `mg`, `dl`, `zeste`.

**Non reconnues → `unit_code = NULL`** (14 graphies, 26 lignes ; ce sont des qualificatifs,
pas des unités — à corriger à la main dans l'éditeur plus tard) :
`cuil.` (4), `large` (3), `petit` (3), `petite` (3), `chopped` (2), `crumbled` (2), `sliced` (2),
`demi` (1), `grands` (1), `medium` (1), `ripe` (1), `squeeze` (1), `à 15` (1), `à 2` (1).

Réversibilité : `drop trigger trg_sync_unit_code on …`, `drop function sync_unit_code, normalize_unit, fold_text`,
`alter table … drop column unit_code`, `drop table unit_aliases, units`.

### 0004 — `amount_num`, `parse_amount`, `format_amount`

* `parse_amount(text) → numeric` **immuable**, `strict` : `1`, `1 `, `0.5`, `1,5`, `1/2`, `½`,
  `1 1/2`, `1½`, `.5` ; plages `2-3`, `2 – 3`, `2 à 3`, `2 a 3`, `2 ou 3`, `2 to 3` → borne basse ;
  tout le reste (`optional`, `to taste`, `1 kg`, `env. 3`) → `NULL`. Fractions arrondies à 4 décimales,
  échelle réduite (`trim_scale`).
* `format_amount(numeric) → text` immuable : `2`, `0.5`, `1.333`.
* Colonnes `amount_num numeric` (nullable) remplies ; trigger `trg_sync_amount_num` (même logique que 0003).

**Comptes attendus en prod** : `recipe_ingredients` 1 712 → 138 `amount` NULL, **18 non parsables**
(`optional` ×10, `to taste` ×3, `a few shakes` ×2, `some`, `for frying`, `splash`), **1 556 `amount_num`
renseignés** ; `shopping_items` 43 → **43 renseignés**. Liste exacte en `NOTICE`.

Réversibilité : drop trigger/colonne/fonctions. Aucune donnée modifiée.

### 0005 — JSONB → section « Recette », orphelins

Forme JSONB constatée en prod : `ingredients = [{name, unit, amount}]` (`amount` : nombre dans
1 179 cas, `null` 37, chaîne 17 — « optional », « to taste »… ; 2 recettes ont aussi `optional`),
`instructions = ["…", …]`.

1. Sauvegardes `recipes_backup_20261003`, `recipe_sections_backup_20261003`,
   `recipe_ingredients_backup_20261003`, `instructions_backup_20261003` (RLS activé, aucune
   politique, droits révoqués → invisibles via l'API).
2. Pour les **118** recettes sans aucune section : une section `name='Recette'`, `type='mixed'`,
   `order_index=0` + ingrédients et instructions depuis le JSONB. Choix du nom : le front
   (`pages/recettes/[id].vue`, `components/RecipeSections.vue`) affiche toujours `section.name`
   en `<h3>`, y compris pour une section unique → un nom neutre plutôt qu'un titre vide.
   Règles : `amount` nombre → texte court (`225`, `0.5`), `0` → `NULL` (comme les 4 orphelins
   existants), `unit ''` → `NULL`, `amount_num`/`unit_code` dérivés, `optional` repris.
3. Garde-fou : chaque orphelin (`section_id IS NULL`) doit avoir un homonyme dans le JSONB de sa
   recette (1 060/1 060 en prod), sinon arrêt. Puis archivage dans
   `recipe_ingredients_orphans_20261003` et **suppression**. Les 1 060 orphelins = 889 dans les
   118 recettes sans section (copie exacte du JSONB à 4 lignes près : `0 → NULL`) + 171 dans 20
   recettes qui ont déjà des sections (doublons du JSONB jamais affichés).
4. Les **7 instructions** `section_id IS NULL` (Gaspacho ×4, Confiture d'oranges ×1, Lasagnes
   épinards ×2) sont archivées dans `instructions_orphans_20261003` et **conservées** (suppression
   non demandée ; elles ne sont lues par aucun code ; à trancher en phase 4).

**Comptes attendus en prod** : avant 181 / 241 / 1 712 (1 060 orph.) / 641 (7 orph.) → après
**359 sections**, **1 546 ingrédients (0 orphelin)**, **1 545 instructions**, 0 recette sans section,
1 060 lignes dans `recipe_ingredients_orphans_20261003`, 7 dans `instructions_orphans_20261003`.

Les colonnes JSONB **ne sont pas supprimées** (phase 4) ; le front continue de les lire en repli.

Restauration : `truncate` + `insert … select from *_backup_20261003` dans l'ordre recipes,
recipe_sections, recipe_ingredients, instructions (ou suppression ciblée des sections
`name='Recette' and type='mixed'` créées à la date d'application).

### 0006 — `save_recipe`, `delete_recipe`

```
public.save_recipe(payload jsonb) returns uuid        -- plpgsql, SECURITY INVOKER
public.delete_recipe(p_id uuid)   returns void        -- plpgsql, SECURITY INVOKER
```
`grant execute … to authenticated` uniquement. Le RLS fait le reste : un non-admin obtient
`Action réservée aux administrateurs` (SQLSTATE 42501).

Payload (snake_case) :
```ts
{
  id?: string,                 // uuid ; absent → création ; présent et inexistant → création avec cet id
  title: string, category: string,              // obligatoires
  description?, prep_time?, cook_time?, servings?, image?, notes?,
  tags?: string[],
  sections?: [{
    name?: string, type?: 'ingredients'|'instructions'|'mixed' /* défaut mixed */, order_index?: number,
    ingredients?: [{ name: string, amount?: string, amount_num?: number, unit?: string,
                     unit_code?: string, optional?: boolean, order_index?: number }],
    instructions?: [{ content: string, order_index?: number } | string]
  }]
}
```
Dérivations : `amount_num` absent → `parse_amount(amount)` ; `amount` absent → `format_amount(amount_num)` ;
`unit_code` absent → `normalize_unit(unit)` ; `unit` absent → `units.abbr` ; `unit_code` inconnu → erreur ;
`order_index` absent → position ; instruction vide ignorée ; ingrédient sans nom → erreur.
Remplacement **complet** des sections/ingrédients/instructions (plus jamais d'orphelin), puis
**recalcul du JSONB legacy** au format prod :
`ingredients = [{"name","unit":"…"|"","amount": nombre|texte|null[, "optional": true]}]`
(ordre section puis ingrédient), `instructions = ["…"]`.

```ts
const { data: id, error } = await supabase.rpc('save_recipe', { payload })
await supabase.rpc('delete_recipe', { p_id: id })
// error.message : « Le titre de la recette est obligatoire », « Type de section invalide : x »,
// « Unité inconnue : x », « Action réservée aux administrateurs », « Recette introuvable ou suppression non autorisée »
```

### 0007 — `merge_shopping_item`, `add_recipe_to_list`

```
public.merge_shopping_item(p_list_id uuid, p_name text, p_amount_num numeric, p_unit_code text,
                           p_recipe_id uuid default null) returns shopping_items
public.add_recipe_to_list(p_recipe_id uuid, p_list_id uuid, p_section_ids uuid[] default null,
                          p_servings_factor numeric default 1) returns setof shopping_items
```
`authenticated` uniquement, SECURITY INVOKER (RLS : ses propres listes ; une liste d'autrui →
`Liste de courses introuvable ou non autorisée`).

* Fusion si même nom (`fold_text` : casse/accents/ponctuation ignorés) **et** même `unit_code`
  (`NULL = NULL`) : `amount_num` additionné, `amount` texte recalculé, `unit` conservé (ou `abbr`),
  `is_checked` remis à `false`, `recipe_id` conservé s'il existait. Verrou `for update`.
  Unité différente → nouvel article (aucune conversion implicite : `1 kg` et `500 g` restent séparés).
* `add_recipe_to_list` : tous les ingrédients (ou `p_section_ids`), `amount_num × facteur`
  arrondi à 2 décimales, `NULL × facteur = NULL`, ingrédients `optional` inclus.

```ts
await supabase.rpc('merge_shopping_item', { p_list_id, p_name: 'Farine', p_amount_num: 250, p_unit_code: 'g' })
const { data: items } = await supabase.rpc('add_recipe_to_list',
  { p_recipe_id, p_list_id, p_section_ids: null, p_servings_factor: 6 / recipe.servings })
```

### 0008 — recherche

* `create extension unaccent with schema extensions` ; `public.immutable_unaccent(text)`,
  `public.immutable_array_to_string(text[])`.
* Colonne **générée** `recipes.search tsvector` (`french`, sans accents : titre A, description B,
  tags C) + index GIN `idx_recipes_search`. Effet sur l'ancien code : `select *` renvoie une colonne
  de plus (le serveur mappe explicitement → invisible).
* ```
  public.search_recipes(p_query text default null, p_category text default null, p_tags text[] default null,
                        p_limit int default 24, p_offset int default 0)
  returns table (id, title, description, category, ingredients, instructions, prep_time, cook_time,
                 servings, image, photo_path /* depuis 0010 */, notes, tags, created_at, updated_at, total_count bigint)
  ```
  `websearch_to_tsquery` + repli `ILIKE` sur le titre désaccentué (requêtes courtes, préfixes,
  mots vides) ; `p_tags` = la recette doit porter **tous** les tags ; tri pertinence puis
  `created_at desc` ; `p_limit` borné à [1, 100] ; `total_count` = total avant pagination.
  « gateau » trouve « Gâteau au yaourt » et réciproquement. Exécutable par `anon` et `authenticated`.

```ts
const { data } = await supabase.rpc('search_recipes', { p_query: 'gateau', p_category: null, p_tags: ['végétarien'], p_limit: 24, p_offset: 0 })
const total = data?.[0]?.total_count ?? 0
```
⚠️ Si 0008 est rejoué seul après 0010, rejouer 0010 (le type de retour inclut `photo_path`).

### 0009 — `private.is_admin()`, bascule des politiques, hook JWT

* Schéma `private` (non exposé par PostgREST, `usage` pour anon/authenticated/service_role).
* `private.is_admin()` SECURITY DEFINER, `search_path = ''` :
  `coalesce(auth.jwt()->'app_metadata'->>'user_role', auth.jwt()->>'user_role')` ; si le claim est
  **présent**, il fait foi ; sinon repli `profiles.role = 'admin'` pour `auth.uid()`. Tant que le
  hook n'est pas activé, le repli garantit zéro régression.
* Les **14** politiques référençant `is_admin()` (recipes ×3, recipe_sections ×3, recipe_ingredients ×3,
  instructions ×3, profiles ×2) sont recréées **dynamiquement** (même nom, même commande, mêmes
  rôles, même expression avec `private.is_admin()`), le trigger `prevent_role_change` aussi, puis
  `drop function public.is_admin()`. Assertions : nombre total de politiques inchangé, 14 basculées,
  plus aucune référence à `public.is_admin`. Le bloc est ignoré si `public.is_admin()` a déjà disparu.
* `public.custom_access_token_hook(event jsonb) returns jsonb` (plpgsql, stable, SECURITY INVOKER,
  `search_path=''`) : ajoute `claims.user_role` = `profiles.role` (ou `null`). `grant execute … to
  supabase_auth_admin`, `revoke … from authenticated, anon, public`, `grant select on profiles to
  supabase_auth_admin` + politique `profiles_auth_admin_read`.

Après application : 42 politiques dans `public` (39 + `units_read_public` + `unit_aliases_read_public`
+ `profiles_auth_admin_read`), 0 fonction SECURITY DEFINER exécutable par `authenticated` dans
`public` → l'alerte advisor disparaît.

Remarque préexistante (inchangée) : promouvoir un admin depuis le SQL Editor déclenche
`prevent_role_change` sans JWT → « Modification du rôle non autorisée ». Contournement dans une
transaction : `select set_config('request.jwt.claims', '{"user_role":"admin"}', true); update public.profiles set role = 'admin' where email = '…';`.

### 0010 — photos

* `recipes.photo_path text` (chemin dans le bucket ; `image` reste le repli par catégorie).
* Bucket `recipe-photos` : public, 5 Mo (`5242880`), `image/jpeg|png|webp` (`insert … on conflict`).
* Politiques `storage.objects` : `recipe_photos_read_public` (select), `recipe_photos_admin_insert/update/delete`
  (`to authenticated`, `bucket_id = 'recipe-photos' and private.is_admin()`).
* `search_recipes` recréée avec `photo_path`.

```ts
await supabase.storage.from('recipe-photos').upload(`${recipeId}/cover.webp`, file, { upsert: true })
const { data: { publicUrl } } = supabase.storage.from('recipe-photos').getPublicUrl(path)
```

---

## 3. Signatures (résumé)

| Fonction | Sécurité | Exécution | Rôle |
|---|---|---|---|
| `public.fold_text(text) → text` | invoker, immutable | anon, authenticated | clé de comparaison |
| `public.normalize_unit(text) → text` | invoker, stable | anon, authenticated | graphie → code |
| `public.parse_amount(text) → numeric` | invoker, immutable | anon, authenticated | texte → nombre |
| `public.format_amount(numeric) → text` | invoker, immutable | anon, authenticated | nombre → texte |
| `public.save_recipe(jsonb) → uuid` | invoker | authenticated | upsert recette (RLS admin) |
| `public.delete_recipe(uuid) → void` | invoker | authenticated | suppression (RLS admin) |
| `public.merge_shopping_item(uuid, text, numeric, text, uuid) → shopping_items` | invoker | authenticated | ajout/fusion article |
| `public.add_recipe_to_list(uuid, uuid, uuid[], numeric) → setof shopping_items` | invoker | authenticated | recette → liste |
| `public.search_recipes(text, text, text[], int, int) → table` | invoker, stable | anon, authenticated | recherche |
| `public.immutable_unaccent(text) → text` | invoker, immutable | anon, authenticated | utilitaire |
| `private.is_admin() → boolean` | **definer**, stable | anon, authenticated (hors API) | politiques RLS |
| `public.custom_access_token_hook(jsonb) → jsonb` | invoker, stable | supabase_auth_admin | hook GoTrue |
| `public.sync_unit_code()`, `public.sync_amount_num()` | trigger | — | synchro ancien code |

Toutes les fonctions ont un `search_path` figé (advisor « Function Search Path Mutable » OK).

---

## 4. Procédure d'application en production

**Pré-requis** : branche `feat/db-foundation` revue ; sauvegarde Supabase (Database → Backups,
ou `pg_dump` via le pooler) ; fenêtre calme (quelques secondes de verrou sur `recipes` pour la
colonne générée en 0008).

**Ordre strict** : 0003 → 0004 → 0005 → 0006 → 0007 → 0008 → 0009 → 0010 (chaque fichier dépend
du précédent : 0005 utilise `parse_amount`/`normalize_unit`, 0007 `fold_text`, 0010 `private.is_admin()`).

**Outil** : au choix
* MCP `apply_migration(project_id, name, query)` avec le contenu du fichier (un appel par fichier,
  `name` = nom du fichier sans extension, pour l'historique `supabase_migrations.schema_migrations`) ;
* ou Dashboard → SQL Editor, coller le fichier, Run. Les fichiers contiennent déjà
  `begin; … commit;` : si une assertion échoue, **rien** n'est appliqué pour ce fichier.

**Vérifications après chaque étape** (lire les `NOTICE` du résultat, puis) :

```sql
-- 0003
select count(*) from units;                                         -- 37
select count(*) from unit_aliases;                                  -- 190
select count(*) filter (where unit_code is not null) from recipe_ingredients; -- 1364
select unit, count(*) from recipe_ingredients where unit is not null and unit_code is null group by 1 order by 2 desc; -- 14 graphies / 26 lignes
-- 0004
select count(*) filter (where amount_num is not null) from recipe_ingredients; -- 1556
select amount, count(*) from recipe_ingredients where amount is not null and amount_num is null group by 1; -- 6 valeurs / 18 lignes
-- 0005
select (select count(*) from recipe_sections), (select count(*) from recipe_ingredients),
       (select count(*) from recipe_ingredients where section_id is null), (select count(*) from instructions),
       (select count(*) from recipes r where not exists (select 1 from recipe_sections s where s.recipe_id = r.id)),
       (select count(*) from recipe_ingredients_orphans_20261003), (select count(*) from instructions_orphans_20261003);
-- attendu : 359 | 1546 | 0 | 1545 | 0 | 1060 | 7
-- 0006 / 0007 (en tant qu'admin connecté, depuis l'app ou avec un JWT)
select save_recipe('{"title":"__test__","category":"plats","sections":[{"ingredients":[{"name":"Sel","amount":"1","unit":"pincée"}]}]}'); -- puis delete_recipe(id)
-- 0008
select title from search_recipes('gateau');   -- doit lister les gâteaux
-- 0009
select count(*) from pg_policies where schemaname='public';            -- 42
select to_regprocedure('public.is_admin()'), to_regprocedure('private.is_admin()'); -- NULL | private.is_admin()
-- 0010
select id, public, file_size_limit, allowed_mime_types from storage.buckets where id='recipe-photos';
select policyname from pg_policies where schemaname='storage' and tablename='objects' and policyname like 'recipe_photos%'; -- 4
```
Puis `get_advisors(security)` : l'alerte `authenticated_security_definer_function_executable`
sur `is_admin` doit avoir disparu. Si un `rpc()` renvoie 404 juste après : `notify pgrst, 'reload schema';`.

**Rollback** : 0003/0004/0006/0007/0008/0010 → `drop` des objets listés dans chaque en-tête
(aucune donnée existante touchée). 0005 → restauration depuis `*_backup_20261003`. 0009 →
recréer `public.is_admin()` (corps de 0001) et rejouer la boucle de politiques dans l'autre sens.
Après une semaine d'exploitation sans incident, les tables `*_backup_20261003` et
`*_orphans_20261003` pourront être supprimées (phase 4).

**Risques identifiés**
* 0005 est la seule migration destructrice (orphelins) : le garde-fou arrête tout si un orphelin
  n'a pas d'homonyme JSONB ; relire les `NOTICE` et comparer aux comptes ci-dessus.
* 0008 : `alter table recipes add column … generated … stored` réécrit la table (181 lignes,
  quelques ms) et prend un verrou exclusif bref.
* 0009 : tout se passe dans une transaction ; entre l'activation du hook et le rafraîchissement
  des tokens, les utilisateurs déjà connectés gardent un token sans `user_role` → repli
  `profiles.role` (aucune coupure). Un admin dont le rôle change devra se reconnecter pour que
  le claim suive.
* 0010 : si `create policy … on storage.objects` échoue avec « must be owner of table objects »
  depuis `apply_migration`, créer les 4 politiques via Dashboard → Storage → Policies
  (mêmes expressions) et rejouer le reste du fichier.
* L'éditeur actuel (`components/RecipeEditor.vue`, `handleSubmit`) **n'envoie plus** `ingredients`/
  `instructions` JSONB : les recettes modifiées via l'ancien éditeur après 0005 auront un JSONB
  périmé (déjà le cas aujourd'hui pour 20 recettes). Résolu dès que le front passe par `save_recipe`.
  À noter aussi : `recipes.ingredients`/`instructions` sont `NOT NULL` sans défaut ; `save_recipe`
  les écrit toujours.

**Régénération des types (APRÈS application)** :
`npx supabase gen types typescript --project-id tzlkabxcmmbwhpyvmato --schema public > shared/types/database.ts`
ou outil MCP `generate_typescript_types` → `shared/types/database.ts`. Les tables `*_backup_20261003`
et `*_orphans_20261003` y apparaîtront (RLS sans politique : inaccessibles) ; ignorer.

---

## 5. Actions manuelles dashboard (hors SQL)

1. **Activer le hook JWT** : Authentication → Hooks → « Customize Access Token (JWT) Claims hook »
   → type Postgres → schéma `public`, fonction `custom_access_token_hook` → Enable hook. Vérifier
   ensuite en décodant un nouveau token (`user_role` présent). En cas de problème, désactiver le
   hook : `private.is_admin()` retombe automatiquement sur `profiles.role`.
2. **OTP** : Authentication → Providers → Email → « Email OTP Expiration » < 3600 s (advisor
   `auth_otp_long_expiry`).
3. **HaveIBeenPwned** : Authentication → Providers → Email (ou Settings → Password) → activer
   « Leaked password protection » (advisor `auth_leaked_password_protection`).
4. **Patch Postgres** : Settings → Infrastructure → Upgrade (version actuelle
   `supabase-postgres-17.4.1.074`, advisor `vulnerable_postgres_version`). Prévoir une courte
   indisponibilité ; faire une sauvegarde avant.
5. **Clés legacy** : Settings → API Keys → désactiver `anon`/`service_role` legacy une fois le
   front passé aux clés publishable/secret (les variables Vercel doivent être à jour avant).
6. **Storage** : vérifier que le bucket `recipe-photos` apparaît (Storage) ; adapter la taille max
   si besoin (5 Mo).

---

## 6. Migration 0011 — `save_recipe` écrit `photo_path` (phase 3B, fiche/éditeur)

| Fichier | Rôle |
|---|---|
| `migrations/0011_save_recipe_photo.sql` | `create or replace function public.save_recipe(payload jsonb)` : corps identique à 0006 + écriture de `recipes.photo_path` depuis `payload->>'photo_path'` |

* **Quoi** : l'update et l'insert de la recette écrivent
  `photo_path = nullif(btrim(payload->>'photo_path'), '')`. Une clé absente ou vide **retire** la
  photo (l'éditeur renvoie toujours la recette complète, comme pour les sections). Signature,
  droits (`authenticated` seulement), SECURITY INVOKER, recalcul du JSONB legacy et messages
  d'erreur inchangés ; `delete_recipe` n'est pas touchée.
* **Pourquoi** : la photo est téléversée par le navigateur dans le bucket `recipe-photos`
  (client Supabase, politiques admin de 0010) sous `<recipe_id>/<timestamp>.webp`, puis son chemin
  part dans `RecipeInput.photoPath` → `toSaveRecipePayload` → `photo_path`. Sans 0011, la clé est
  ignorée et la photo n'est jamais associée.
* **Prérequis** : 0010 (colonne `photo_path`, bucket, politiques storage).
* **Appliquée en local** le 2026-10-03 (`psql -f`, rejouée une seconde fois : idempotente). Test
  effectué en tant qu'admin (`set local role authenticated` + claims `user_role=admin`) :
  `photo_path` écrit à la création, remis à `NULL` quand la clé est absente, `delete_recipe` OK.
  **Pas appliquée en prod** : à faire après 0003 → 0010 (procédure § 4), simplement en exécutant
  le fichier dans le SQL Editor.
* **Vérification prod** :
  ```sql
  select position('photo_path' in pg_get_functiondef('public.save_recipe(jsonb)'::regprocedure)) > 0; -- true
  ```
* **Rollback** : rejouer `0006_save_recipe.sql` (recrée la version sans `photo_path`). Aucune donnée
  touchée ; la colonne reste.
* **À savoir** : la suppression de l'objet dans le bucket est faite côté client
  (`useRecipePhoto().removeRecipePhotos(recipeId)`) avant `delete_recipe` ; il n'y a pas de trigger
  storage. Les types générés (`shared/types/database.ts`) n'ont pas besoin d'être régénérés
  (signature inchangée).
