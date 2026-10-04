# Bascule en production — pas à pas

Pour : **Nina** et **Claude**, sur le projet Supabase `recettes-boultons`
(`tzlkabxcmmbwhpyvmato`) et dans Vercel.

**Qui applique les migrations** (décision de Nina) : Claude, avec l'outil MCP Supabase
`apply_migration` (un appel par fichier, `name` = nom du fichier sans extension), puis les
requêtes de contrôle avec `execute_sql`. Le **SQL Editor** du dashboard reste le plan B,
suivant la procédure ci-dessous. Les réglages du dashboard (Auth, Vercel) restent faits par
Nina.
Rédigé le 2026-10-03. Comptes de la prod relevés le **2026-10-03 à 21 h 43 (heure de Paris)**,
en lecture seule.

Durée totale le jour J : environ 1 h, dont **une fenêtre sensible de 2 à 5 minutes** (entre la
fin du déploiement Vercel et l'exécution de 0005, étapes 3 → 4). Ensuite, deux petites
étapes différées : 0013 quelques jours plus tard, 0014 une semaine après la bascule.

## Avant de commencer : comment exécuter un fichier

Voie normale : Claude applique le fichier avec `apply_migration` et lit le résultat. Plan B,
à la main :

* SQL Editor → **New query** → ouvrir le fichier sur ton Mac (dans le dépôt, branche
  `modernisation`), **tout** copier, coller, **Run**. **Un fichier = un Run.**
* Chaque fichier contient `begin; … commit;` et des contrôles (`assert`) : s'il y a une
  erreur, **rien** n'est appliqué pour ce fichier. Ne rien « corriger » à la main : noter
  l'erreur, s'arrêter, et me la transmettre.
* Les fichiers écrivent un compte rendu avec `raise notice` (lignes `NOTICE: [0005] …`).
  Le SQL Editor ne les affiche pas toujours ; les **requêtes de contrôle** données à chaque
  étape font foi. (Variante qui affiche tout : `psql "$PROD_DB_URL" -v ON_ERROR_STOP=1 -f
  supabase/migrations/0003_units.sql` depuis le Terminal, avec la chaîne de connexion du
  § 0.1.)
* Tous les fichiers sont rejouables : relancer un fichier déjà passé ne casse rien.
* Si l'application renvoie « 404 » sur un appel `rpc` juste après une migration : exécuter
  `notify pgrst, 'reload schema';`.

---

## 0. Préparation (la veille ou le matin)

### 0.1 Sauvegarde de la base (obligatoire)

1. **Database → Backups** : regarder ce qui est proposé. Sur le **plan gratuit** il n'y a
   **pas de PITR** (retour à une minute près) et pas de sauvegarde téléchargeable fiable : on
   fait donc **un export manuel**.
2. Récupérer la chaîne de connexion : bouton **Connect** (en haut du Dashboard) →
   **Connection string** → **Session pooler** (port **5432** ; pas le « Transaction pooler »
   6543). Elle ressemble à
   `postgresql://postgres.tzlkabxcmmbwhpyvmato:[YOUR-PASSWORD]@aws-0-<région>.pooler.supabase.com:5432/postgres`.
   Remplacer `[YOUR-PASSWORD]` par le mot de passe de la base (oublié ? Project Settings →
   Database → *Reset database password* ; sans effet sur l'application, qui utilise les clés
   API).
3. Dans le Terminal du Mac (PostgreSQL 17 : `brew install postgresql@17` s'il manque) :

   ```sh
   export PROD_DB_URL='postgresql://postgres.tzlkabxcmmbwhpyvmato:MOT_DE_PASSE@aws-0-REGION.pooler.supabase.com:5432/postgres'
   PG=/opt/homebrew/opt/postgresql@17/bin
   # 1) sauvegarde complète (restaurable avec pg_restore)
   $PG/pg_dump "$PROD_DB_URL" --format=custom --no-owner \
     --file ~/Desktop/recettes-prod-$(date +%Y-%m-%d-%H%M).dump
   # 2) copie lisible des données de l'application (recettes, listes, planning…)
   $PG/pg_dump "$PROD_DB_URL" --data-only --schema=public --inserts \
     --file ~/Desktop/recettes-prod-public-$(date +%Y-%m-%d-%H%M).sql
   # vérification : la liste des objets doit défiler, et le .sql contenir des INSERT
   $PG/pg_restore --list ~/Desktop/recettes-prod-*.dump | grep -c "TABLE DATA"
   grep -c "INSERT INTO public.recipes " ~/Desktop/recettes-prod-public-*.sql   # 181
   ```
   Garder ces deux fichiers au moins un mois (hors du dépôt Git : ce sont des données de
   famille).
4. **Option retenue par Nina, en plus ou à la place du `pg_dump`** : export JSON des tables
   de l'application par Claude, **en lecture seule**, via l'outil MCP `execute_sql`
   (requêtes `select` uniquement, par exemple
   `select json_agg(t) from public.recipes t;`, une requête par table : `profiles`,
   `recipes`, `recipe_sections`, `recipe_ingredients`, `instructions`, `favorites`,
   `planning`, `planning_notes`, `shopping_lists`, `shopping_items`). Les fichiers JSON sont
   enregistrés sur le Mac, hors du dépôt Git. Limite : ce n'est pas une sauvegarde
   restaurable par `pg_restore` (ni schéma, ni comptes `auth.users`, ni fichiers Storage) ;
   une restauration se ferait par des `insert` préparés à partir du JSON.

### 0.2 Photographie de départ (SQL Editor)

```sql
-- Requête A : à relancer avant l'étape 1 et noter les résultats
select (select count(*) from public.recipes)                                         as recettes,
       (select count(*) from public.recipe_sections)                                 as sections,
       (select count(*) from public.recipe_ingredients)                              as ingredients,
       (select count(*) from public.recipe_ingredients where section_id is null)     as ingr_orphelins,
       (select count(*) from public.instructions)                                    as etapes,
       (select count(*) from public.instructions where section_id is null)           as etapes_orphelines,
       (select count(*) from public.recipes r
          where not exists (select 1 from public.recipe_sections s where s.recipe_id = r.id)) as recettes_sans_section,
       (select count(*) from public.profiles)                                        as profils,
       (select count(*) from pg_policies where schemaname = 'public')                as politiques,
       (select max(updated_at) from public.recipes)                                  as derniere_modif;
```

| | recettes | sections | ingrédients | orphelins | étapes | étapes orph. | sans section | profils | politiques |
|---|---|---|---|---|---|---|---|---|---|
| **Prod, 2026-10-03 21 h 43** | 181 | 241 | **1 695** | 1 060 | 641 | 7 | 118 | 4 | 39 |
| Snapshot local (matin du 03/10) | 181 | 241 | 1 712 | 1 060 | 641 | 7 | 118 | 4 (+1 créé en local) | 39 |

Si les chiffres du jour J diffèrent (une recette ajoutée, modifiée…), ce n'est pas grave :
les migrations s'adaptent, seuls les comptes attendus ci-dessous bougent (une recette sans
section ajoutée entre-temps = +1 section après 0005, etc.). Ne s'inquiéter que si un
contrôle « 0 attendu » ne donne pas 0.

### 0.3 Écarts constatés entre la prod et le snapshot (à traiter AVANT l'étape 1)

1. **« Carrot cake » a perdu 17 de ses 21 ingrédients en prod**, le **2026-10-03 à 19 h 48**
   (heure de Paris) : la recette a été réenregistrée, ses 6 sections recréées, ses 12 étapes
   sont intactes, mais les sections « Gâteau » et « Glaçage traditionnel » sont vides et
   « Glaçage léger » a perdu son 1er ingrédient (yaourt grec). C'est la trace d'un
   enregistrement interrompu de l'**ancien** éditeur (il écrit ligne par ligne, sans
   transaction ; le nouveau passe par `save_recipe`, tout ou rien).
   → **Demander à la famille** si c'était voulu. Sinon, exécuter
   `supabase/fixes/2026-10-03_carrot_cake_ingredients.sql` (réinsère les 17 ingrédients du
   snapshot ; refuse de tourner si la recette a changé depuis ; rejouable). Contrôle :
   `select count(*) from recipe_ingredients where recipe_id = 'b7866cf7-261a-4f2c-a9b2-e35837c954f4';` → **21**.
2. ~~Un profil de moins~~ : **fausse alerte** (vérifié le 2026-10-03). La prod a toujours eu
   4 profils pour 5 comptes : le compte `04e227cb…` (créé le 2025-08-24) n'a jamais eu de
   profil. Le 5ᵉ profil du snapshot a été créé **localement** par l'amorçage
   (`handle_new_user`) à 18 h 57. Rien à faire.

La modification de Carrot cake a eu lieu **aujourd'hui en prod** via l'ancien éditeur, avec un
compte admin (aucun agent n'avait d'identifiants de prod). Si personne de la famille n'en est
l'auteur, vérifier qu'aucun outil de développement n'a été
lancé contre la prod (fichier `.env` → prod avec `npm run dev`). Pour la suite, développer
avec `npm run dev:local`.

Dans les tableaux ci-dessous, la colonne **« sans correctif »** correspond à la prod telle
quelle, **« avec correctif »** à la prod après le correctif Carrot cake (= le snapshot).

### 0.4 Vercel (avant la fusion)

Vercel → projet → **Settings** :

* **General → Node.js Version : 22.x** — ✅ déjà réglé.
* **Environment Variables**, environnement **Production** :

  | Variable | Valeur | Statut |
  |---|---|---|
  | `SUPABASE_URL` | `https://tzlkabxcmmbwhpyvmato.supabase.co` | existante, ne pas toucher |
  | `SUPABASE_ANON_KEY` | clé anon actuelle | existante, ne pas toucher |
  | `OPENAI_API_KEY` | clé OpenAI actuelle | existante (traducteur) |
  | `AI_PROVIDER` | `openai` | optionnelle (défaut `openai`) |
  | `AI_MODEL` | vide → `gpt-4.1-mini` | optionnelle |
  | `AI_DAILY_QUOTA` | `50` (0 = traducteur coupé) | optionnelle |
  | `NUXT_PUBLIC_AUTH_PROVIDERS` | `google` (défaut) ; `none` pour masquer le bouton Google si l'étape suivante n'est pas faite | optionnelle |
  | `NUXT_PUBLIC_SENTRY_DSN` | DSN du projet Sentry | ✅ déjà ajoutée (Production + Preview) |
  | `API_BASE`, `NODE_ENV` | — | plus lues par le code : peuvent être supprimées après la bascule |

### 0.5 Supabase Auth (avant la fusion)

* **Authentication → URL Configuration** : *Site URL* = `https://recettes-des-boultons.vercel.app` ;
  *Redirect URLs* : ajouter `https://recettes-des-boultons.vercel.app/confirm` et
  `https://recettes-des-boultons.vercel.app/en/confirm` (et
  `http://localhost:3000/confirm` pour le développement si besoin).
* **Connexion Google** — ✅ configurée par Nina : client OAuth « Web application » créé dans
  Google Cloud Console, *Authorized redirect URI* =
  `https://tzlkabxcmmbwhpyvmato.supabase.co/auth/v1/callback`, fournisseur Google activé
  dans Supabase (**Authentication → Sign In / Providers → Google**, *Client ID* et
  *Client Secret*). Le jour J, vérifier seulement la connexion (étape 5.6). En cas de
  problème : `NUXT_PUBLIC_AUTH_PROVIDERS=none` masque le bouton.

### 0.6 Le jour J, juste avant

* La branche `modernisation` est à jour (travaux 4A/4B fusionnés), la CI est verte, et
  `npm run db:local:test` passe.
* Ouvrir à l'avance : un onglet SQL Editor avec **0005 déjà collé** (sans l'exécuter), un
  onglet Vercel → Deployments, un onglet GitHub sur la pull request `modernisation → main`.

---

## 1. Migrations 0003 et 0004 (sans effet sur l'ancien code)

| Ordre | Fichier | Ce que ça fait |
|---|---|---|
| 1 | `supabase/migrations/0003_units.sql` | tables `units` / `unit_aliases`, colonne `unit_code` remplie + trigger |
| 2 | `supabase/migrations/0004_amount_num.sql` | colonne `amount_num` (quantité en nombre) remplie + trigger |

Sans effet sur l'ancien code : nouvelles tables et colonnes **facultatives** ; quand l'ancien
code écrit `unit` / `amount`, les triggers remplissent les nouvelles colonnes ; les
`select *` de l'ancien code reçoivent deux champs de plus, qu'il ignore.

NOTICE attendues :
`[0003] recipe_ingredients : 1349 lignes avec unit_code, unités non reconnues : cuil. (4), large (3), petit (3), petite (3), chopped (2), crumbled (2), sliced (2), à 15 (1), à 2 (1), demi (1), grands (1), medium (1), ripe (1), squeeze (1)` (1364 avec correctif) ;
`[0003] shopping_items : 34 lignes avec unit_code` ;
`[0004] recipe_ingredients : 1539 amount_num remplis, non parsés : optional (10), to taste (3), a few shakes (2), for frying (1), some (1), splash (1)` (1556 avec correctif) ;
`[0004] shopping_items : 43 amount_num remplis`.

Contrôle :

```sql
select (select count(*) from units) as units,                                                    -- 37
       (select count(*) from unit_aliases) as alias,                                             -- 190
       (select count(*) from recipe_ingredients where unit_code is not null) as unit_code,       -- 1349 (1364 avec correctif)
       (select count(*) from recipe_ingredients where unit is not null and unit_code is null) as non_reconnues, -- 26
       (select count(*) from recipe_ingredients where amount_num is not null) as amount_num,     -- 1539 (1556 avec correctif)
       (select count(*) from recipe_ingredients where amount is not null and amount_num is null) as non_parsees; -- 18
```

## 2. Migrations 0006 → 0012 (sans effet sur l'ancien code)

**Pas 0005 maintenant** : elle passe juste après le déploiement (étape 4). Exécuter dans cet
ordre :

| Ordre | Fichier | Ce que ça fait | Pourquoi l'ancien code n'est pas touché |
|---|---|---|---|
| 3 | `0006_save_recipe.sql` | fonctions `save_recipe`, `delete_recipe` | nouvelles fonctions, jamais appelées par l'ancien code |
| 4 | `0007_shopping_rpc.sql` | fonctions `merge_shopping_item`, `add_recipe_to_list` | idem |
| 5 | `0008_search.sql` | extension `unaccent`, colonne calculée `recipes.search`, index, fonction `search_recipes` | la colonne `search` est calculée par la base ; l'ancien code ne l'écrit jamais (ses mises à jour listent les colonnes une à une) et ignore ce champ en lecture. Verrou de moins d'une seconde sur `recipes` (réécriture de 181 lignes) |
| 6 | `0009_admin_claim.sql` | `private.is_admin()`, les 14 politiques de sécurité basculées dessus, suppression de `public.is_admin()`, fonction du hook JWT | tant que le hook n'est pas activé (étape 6), `private.is_admin()` lit `profiles.role` comme avant → mêmes droits ; l'ancien code vérifie l'admin via `profiles.role` et n'appelle jamais `is_admin()` |
| 7 | `0010_recipe_photos.sql` | colonne `recipes.photo_path`, bucket `recipe-photos`, 4 politiques storage, `search_recipes` + photo | colonne facultative jamais écrite par l'ancien code ; bucket neuf qu'il n'utilise pas |
| 8 | `0011_save_recipe_photo.sql` | `save_recipe` écrit aussi `photo_path` | fonction inutilisée par l'ancien code |
| 9 | `0012_ai_usage.sql` | table `ai_usage`, fonction `check_ai_quota` | nouvelle table, l'ancien traducteur ne l'utilise pas |

NOTICE attendues : `[0009] 14 politique(s) référencent is_admin() (14 attendues en prod)` puis
`[0009] public.is_admin() supprimée, 14 politique(s) basculée(s) vers private.is_admin()` ;
`[0012] ai_usage + check_ai_quota OK`.
Si 0010 échoue avec « must be owner of table objects » : créer les 4 politiques via Storage →
Policies (expressions dans le fichier) puis relancer 0010.

Contrôle :

```sql
select (select count(*) from pg_policies where schemaname = 'public') as politiques,              -- 44
       to_regprocedure('public.is_admin()') as ancienne_fonction,                                  -- NULL
       to_regprocedure('private.is_admin()') as nouvelle_fonction,                                 -- private.is_admin()
       (select count(*) from pg_policies where schemaname = 'storage' and policyname like 'recipe_photos%') as pol_photos, -- 4
       (select public from storage.buckets where id = 'recipe-photos') as bucket_public,           -- true
       (select count(*) from search_recipes('gateau')) as recherche_gateau,                        -- > 0
       position('photo_path' in pg_get_functiondef('public.save_recipe(jsonb)'::regprocedure)) > 0 as save_recipe_photo; -- true
```

Puis ouvrir le site actuel (ancien code) : liste des recettes, une fiche, connexion admin →
tout doit fonctionner comme avant.

## 3. Fusion `modernisation` → `main` et déploiement

1. GitHub → pull request `modernisation` → `main` → **Merge**.
2. Vercel → **Deployments** : attendre que le déploiement de `main` soit **Ready** (2 à 4 min).
   Noter l'URL du déploiement **précédent** (celui de l'ancien code) : c'est la cible du
   retour arrière.

⏱ À partir de « Ready », **la fenêtre sensible commence** : le nouveau code lit les recettes
par leurs sections, et 118 recettes n'en ont pas encore (elles s'affichent sans ingrédients
ni étapes jusqu'à 0005). Passer à l'étape 4 **immédiatement**.

## 4. Migration 0005 (tout de suite)

| Ordre | Fichier |
|---|---|
| 10 | `supabase/migrations/0005_jsonb_to_sections.sql` (déjà collé dans l'onglet préparé → **Run**) |

Ce que ça fait : sauvegarde complète dans `*_backup_20261003`, crée une section « Recette »
pour les 118 recettes qui n'en ont pas (contenu repris du JSONB), archive puis supprime les
1 060 ingrédients orphelins (jamais affichés), archive les 7 étapes orphelines.
Pourquoi après le déploiement : l'ancien code charge **tous** les ingrédients en une requête
que l'API coupe à 1 000 lignes ; après 0005 il y en a 1 529 → l'ancien code afficherait des
recettes incomplètes. La fenêtre est donc minimisée des deux côtés.

NOTICE attendue :
`[0005] 118 recette(s) migrée(s), +894 ingrédient(s), +904 instruction(s), 1060 orphelin(s) archivé(s)/supprimé(s), 7 instruction(s) orpheline(s) archivée(s) (conservées)`.

Contrôle :

```sql
select (select count(*) from recipe_sections) as sections,                                     -- 359
       (select count(*) from recipe_ingredients) as ingredients,                               -- 1529 (1546 avec correctif)
       (select count(*) from recipe_ingredients where section_id is null) as ingr_orphelins,   -- 0
       (select count(*) from instructions) as etapes,                                          -- 1545
       (select count(*) from recipes r where not exists
          (select 1 from recipe_sections s where s.recipe_id = r.id)) as sans_section,         -- 0
       (select count(*) from recipe_ingredients_orphans_20261003) as archive_ingr,             -- 1060
       (select count(*) from instructions_orphans_20261003) as archive_etapes;                 -- 7
```

## 5. Contrôles

SQL (vérifie que rien n'est cassé) :

```sql
-- toutes les recettes ont au moins un ingrédient et une étape ?
select title from recipes r
 where not exists (select 1 from recipe_ingredients i where i.recipe_id = r.id)
    or not exists (select 1 from instructions i where i.recipe_id = r.id);           -- 0 ligne
-- recherche sans accents
select title from search_recipes('gateau') limit 5;                                   -- des gâteaux
-- les sauvegardes sont là
select count(*) from recipes_backup_20261003;                                         -- 181
```

Dans l'application (https://recettes-des-boultons.vercel.app), sur ordinateur **et** téléphone :

1. **Liste** des recettes : elle s'affiche, la recherche « gateau » trouve les gâteaux,
   les filtres par catégorie marchent.
2. **Fiche d'une recette migrée par 0005** : « Stollen de Valérie » (19 ingrédients,
   12 étapes) ou « Enchiladas » (16 / 13) ; puis une recette qui avait déjà des sections :
   « Carrot cake » (21 ingrédients avec correctif, sinon 4).
3. **Connexion admin** (e-mail + mot de passe) : le bouton « Modifier » apparaît ; ouvrir
   l'éditeur d'une recette, **Enregistrer sans rien changer** → la fiche est identique.
4. **Ajout aux courses** : depuis une fiche, « Ajouter à la liste », choisir des sections →
   les articles apparaissent dans « Courses », les quantités d'un même ingrédient
   s'additionnent.
5. Planning : ajouter un repas, le déplacer.
6. Connexion Google (si configurée en 0.5).

En cas de problème bloquant → **Retour arrière** (fin du document).

## 6. Sécurité (le jour J, une fois les contrôles OK)

1. **Hook JWT** : Authentication → **Hooks** → *Customize Access Token (JWT) Claims hook* →
   type **Postgres** → schéma `public` → fonction `custom_access_token_hook` → **Enable**.
   La fonction **n'apparaît dans la liste qu'après l'application de 0009** (étape 2).
   Se déconnecter / reconnecter en admin : le bouton « Modifier » est toujours là. (Problème ?
   Désactiver le hook : les droits retombent automatiquement sur `profiles.role`.)
2. **Authentication → Providers → Email** : *Email OTP Expiration* **< 3600** secondes (ex. 1800).
3. **Leaked password protection** (HaveIBeenPwned) : Authentication → Providers → Email
   (ou Settings → Password security) → activer.
4. **Advisors** : Dashboard → **Advisors → Security Advisor** (ou outil MCP `get_advisors`,
   type `security`) : l'alerte « security definer function executable » sur `is_admin` a
   disparu ; restent éventuellement `vulnerable_postgres_version` (mise à jour Postgres :
   Settings → Infrastructure, avec une sauvegarde avant) et les tables
   `*_backup_20261003` / `*_orphans_20261003` signalées « RLS sans politique » (voulu :
   invisibles par l'API, supprimées en étape 8).

## 7. Quelques jours après (3 à 7 jours sans incident) : 0013, et 0015 en option

| Ordre | Fichier | Ce que ça fait |
|---|---|---|
| 11 | `supabase/migrations/0013_contract_jsonb.sql` | supprime les colonnes `recipes.ingredients` / `recipes.instructions` (plus lues ni écrites par le nouveau code), recrée `save_recipe` et `search_recipes` sans elles, supprime les 7 étapes orphelines (5 doublons exacts, 2 anciennes versions d'étapes corrigées depuis) |
| 12 (option) | `supabase/migrations/0015_data_cleanup.sql` | corrections mécaniques des ingrédients (voir `docs/QUALITE_DONNEES.md`) avec sauvegarde des lignes touchées |

⚠️ Après 0013, l'**ancien code ne fonctionne plus** : un retour arrière du code demande
d'abord `supabase/rollback/0013_contract_jsonb_down.sql` (voir ci-dessous).

NOTICE attendues (0013) :
`[0013] 32 recette(s) avec un JSONB ingrédients différent des sections …` (information) ;
`[0013] 7 instruction(s) orpheline(s) : 5 doublon(s) supprimé(s), 2 version(s) remplacée(s) supprimée(s), 0 rattachée(s) (0 section(s) créée(s))` ;
`[0013] colonnes recipes.ingredients / recipes.instructions supprimées ; save_recipe et search_recipes recréées`.

NOTICE attendues (0015) :
`[0015] R1 plage 2, R2 optionnel 5, R3 au goût 3, R4 qualificatif 14, R5 espaces 4 (+ 3 étape(s)), R6 section vide 1`,
puis la liste des identifiants, puis `[0015] unités encore non reconnues (à traiter à la main) : 6`.

Contrôle :

```sql
select (select count(*) from information_schema.columns where table_schema = 'public'
          and table_name = 'recipes' and column_name in ('ingredients', 'instructions')) as colonnes_json, -- 0
       (select count(*) from instructions) as etapes,                                  -- 1538
       (select count(*) from instructions where section_id is null) as orphelines,     -- 0
       (select count(*) from recipe_sections) as sections,                             -- 359 (358 après 0015)
       (select count(*) from recipe_ingredients) as ingredients,                       -- inchangé : 1529 (1546 avec correctif)
       (select count(*) from recipe_ingredients where unit is not null and unit_code is null) as non_reconnues; -- 26 (6 après 0015)
```

Puis dans l'application : liste, une fiche, **modifier et enregistrer une recette** en admin,
recherche. Si un appel renvoie 404 : `notify pgrst, 'reload schema';`.
Ensuite (pour les développeurs) : régénérer `shared/types/database.ts` contre la prod et
vérifier qu'il est identique à celui du dépôt (déjà régénéré en local après 0013).

## 8. Une semaine après la bascule : 0014

| Ordre | Fichier | Ce que ça fait |
|---|---|---|
| 13 | `supabase/migrations/0014_drop_backups.sql` | supprime les 6 tables `*_backup_20261003` et `*_orphans_20261003` |

À faire seulement si : une semaine d'utilisation sans problème, 0013 appliquée (sinon
0014 refuse de tourner), et un nouvel export `pg_dump` (§ 0.1) fait juste avant.
NOTICE attendues : une ligne par table avec son nombre de lignes
(`recipes_backup_20261003 (181 ligne(s))`, `recipe_sections_backup_20261003 (241)`,
`recipe_ingredients_backup_20261003 (1695)`, `instructions_backup_20261003 (641)`,
`recipe_ingredients_orphans_20261003 (1060)`, `instructions_orphans_20261003 (7)` ; 1 712 au
lieu de 1 695 si le correctif Carrot cake est passé avant 0005), puis `[0014] 6 table(s) supprimée(s)`.

Contrôle : `select count(*) from pg_tables where schemaname = 'public' and tablename like '%20261003';` → **0**.

Si 0015 a été appliquée et que tout va bien quelques semaines plus tard :
`drop table public.recipe_ingredients_backup_cleanup, public.instructions_backup_cleanup, public.recipe_sections_backup_cleanup;`

---

## Retour arrière

**Code** : Vercel → **Deployments** → le déploiement de production **précédent** (ancien
code, noté à l'étape 3) → menu « … » → **Instant Rollback**. Effet en quelques secondes.
(Les déploiements suivants ne sont plus promus automatiquement tant qu'on n'a pas fait
*Undo Rollback* ou promu un nouveau déploiement.)

**Base**, selon l'endroit où l'on en est :

| Situation | Que faire côté base |
|---|---|
| Après les étapes 1-2 seulement (code pas encore fusionné) | Rien : l'ancien code fonctionne avec 0003, 0004, 0006 → 0012. (Pour les retirer quand même : `drop` des objets listés dans l'en-tête de chaque fichier, voir `MIGRATION_NOTES.md` § 4.) |
| Après l'étape 4 (0005) et retour à l'ancien code | Exécuter `supabase/rollback/0005_restore_from_backup.sql` : remet sections, ingrédients et étapes d'avant 0005 depuis les sauvegardes (sinon l'ancien code coupe au-delà de 1 000 ingrédients). Les recettes **modifiées** avec le nouveau code entre-temps reprennent leur version d'avant (liste en NOTICE) ; les recettes **créées** avec le nouveau code sont conservées. |
| Après l'étape 6 (hook activé) | Rien d'obligatoire ; on peut désactiver le hook (Authentication → Hooks). |
| Après 0013 et retour à l'ancien code | 1) `supabase/rollback/0013_contract_jsonb_down.sql` (recrée et recalcule les colonnes JSONB) ; 2) relancer `supabase/migrations/0011_save_recipe_photo.sql` ; 3) si besoin, `rollback/0005_restore_from_backup.sql` ; 4) Instant Rollback. |
| Après 0015 | Requêtes de retour dans l'en-tête de `0015_data_cleanup.sql` (depuis les tables `*_backup_cleanup`). |
| Après 0014 | Plus de sauvegarde en base : restaurer depuis l'export `pg_dump` (§ 0.1) avec `pg_restore` (à faire avec moi). |

Toutes les migrations « ajout seulement » (0003, 0004, 0006 → 0012) sont réversibles sans
perte en supprimant ce qu'elles ont créé ; 0005 est réversible grâce à ses sauvegardes
jusqu'à 0014 ; 0013 est réversible (colonnes recalculées depuis les sections) ; 0014 ne l'est
pas.

## Récapitulatif des comptes attendus

| Après | sections | ingrédients | étapes | orphelins ingr. / étapes | politiques |
|---|---|---|---|---|---|
| départ (2026-10-03) | 241 | 1 695 (1 712) | 641 | 1 060 / 7 | 39 |
| 0003, 0004 | 241 | 1 695 (1 712) | 641 | 1 060 / 7 | 41 |
| 0006 → 0012 | 241 | 1 695 (1 712) | 641 | 1 060 / 7 | 44 |
| 0005 | 359 | 1 529 (1 546) | 1 545 | 0 / 7 | 44 |
| 0013 | 359 | 1 529 (1 546) | 1 538 | 0 / 0 | 44 |
| 0015 (option) | 358 | 1 529 (1 546) | 1 538 | 0 / 0 | 44 |

(Entre parenthèses : avec le correctif Carrot cake.) Ce parcours exact (prod du 03/10,
ordre 0003, 0004, 0006 → 0012, 0005, 0013, 0015, 0014) a été rejoué sur une copie locale
conforme à la prod : tous les comptes ci-dessus en sont issus.
