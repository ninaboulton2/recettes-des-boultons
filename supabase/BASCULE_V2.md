# Bascule v2 — remplissage des données et passage au multi-comptes

Pour : **Nina** et **Claude**, sur le projet Supabase `recettes-boultons` (`tzlkabxcmmbwhpyvmato`) et dans Vercel.
Complète `BASCULE_PROD.md` (§ 10 et § 11 : 0017 et 0019, déjà passées ; **0021 se pose aussi tout de suite**, voir § 2) ; correspond à la phase 11 du dossier
« Recettes v2 » (§ 4.2 étapes 3 à 6, § 4.3, § 9).

Ce que fait la bascule : les recettes Boultons reçoivent une propriétaire (Nina), les comptes actuels
entrent dans le groupe « Les Boultons » (qui garde le look actuel), chacun reçoit ses catégories, un
pseudonyme, et **le site cesse d'être public** (il faut un compte pour voir les recettes).

Durée : environ 30 minutes, dont **une fenêtre sensible de 2 à 5 minutes** entre 0020 et la fin du
déploiement du code v2 (étapes 6 → 7).

> **Rien de ce qui suit n'est appliqué sans le « go » de Nina.** Claude prépare, relit, et n'écrit en
> production qu'après ce « go » (outils `apply_migration` / `execute_sql`). Plan B : le SQL Editor du
> dashboard, comme dans `BASCULE_PROD.md` (« un fichier = un Run »).

## 0. Peut-on faire la bascule des données AVANT l'interface v2 ?

Analyse du code actuel du dépôt (`app/`, `server/`) contre les deux fichiers de données. Le code actuel
suppose : tout le monde lit toutes les recettes (même sans compte), seuls les **admins** écrivent
(`requireAdmin`, boutons réservés à `authStore.isAdmin`), `save_recipe` ne connaît pas `owner_id`.

### 0.1 Avec 0018 seule (remplissage, sans 0020) : rien ne casse, une seule chose change

Les politiques de la v1 ne sont pas touchées : tout le monde lit encore tout, sans compte.

| Quoi | Résultat |
|---|---|
| Lecture (accueil, recherche, fiches, photos, favoris, planning, courses, `/en`) | **Inchangée.** Même sans compte. |
| Écriture par Nina (éditeur, traducteur IA, photos, suppression, `save_recipe`) | **Inchangée** (elle reste `admin`). |
| `recipes.updated_at` | **Inchangé** (le déclencheur est suspendu pendant le remplissage). |
| Le **2ᵉ admin** | Repasse `user` : il **perd l'édition dans la v1** (boutons d'admin, éditeur, `/traducteur`, `requireAdmin`). Son jeton garde `admin` jusqu'à 1 h : l'interface montre encore les boutons, le serveur les accepte encore tant que le jeton n'est pas renouvelé. Seul effet visible. |
| Recette créée dans la v1 **après** 0018 | `owner_id` vide (la v1 ne le remplit pas) : **0020 refusera de tourner** (« recette(s) sans owner_id »). Solution : relancer 0018 (rejouable), elle rattache la recette à Nina. |
| Nouvelles colonnes dans `profiles` | `select *` du code (`app/stores/auth.ts`) les reçoit, sans conséquence. |

### 0.2 Avec 0018 + 0020 et le code v1 : ça marche pour les comptes connectés, mais le site est fermé

| Quoi | Résultat |
|---|---|
| Nina connectée | **Tout marche** : lecture, création (`owner_id` = elle, par le `DEFAULT auth.uid()`), modification, traducteur, photos, suppression. |
| Les autres membres connectés (lecture) | **Tout marche** : accueil, recherche, fiche, favoris, planning, courses, ajout aux courses (`add_recipe_to_list`), `/en`. Ils lisent les recettes par le groupe. |
| Les autres membres (écriture) | La v1 ne leur donne **aucun bouton** d'édition (`isAdmin`) : rien de nouveau. En base ils *pourraient* modifier les 181 recettes (droit `edit_original` du groupe) : seule la v2 le montre. |
| **Visiteur sans compte** | **Casse** : aucune recette (accueil vide, compteurs à 0, fiche « introuvable »). C'est voulu par la v2 (décision « plus publiques »), mais la v1 n'affiche pas d'invitation à se connecter. |
| **Compte neuf créé dans la v1** (inscription par e-mail ou Google, toujours ouverte) | **Casse** : il n'est dans aucun groupe, donc il ne voit **aucune recette**. |
| Recette **créée par Nina après** 0020 | Lisible par les membres du groupe, mais **pas modifiable** par eux : le droit `edit_original` n'est posé par 0018 que sur les recettes existantes (voir « Choix de conception » n° 3). |
| 2ᵉ admin, jeton périmé (≤ 1 h) | Voit encore les boutons d'édition ; ses écritures passent quand même sur les 181 recettes (droit du groupe), **pas** la suppression. |
| Photos | Le bucket `recipe-photos` reste **public** (0020, point 4) : l'adresse d'une photo marche encore sans compte. Privé en phase 8. |
| `profiles` | Chacun ne lit que sa ligne (la v1 ne lit que la sienne) : sans conséquence. |
| `save_recipe_translation` | Garde-fou `is_admin()` conservé : Nina seule, comme avant. |

**Conclusion.** La bascule **des données peut précéder l'interface v2** :

* **0018 : oui, sans risque**, quand on veut (une seule conséquence : le 2ᵉ admin perd l'édition dans la v1).
* **0020 : possible aussi**, le code v1 reste utilisable par les comptes connectés, **à condition d'accepter**
  que le site soit fermé aux visiteurs et que les inscriptions v1 ne voient rien. C'est la décision de Nina ;
  recommandation : faire 0020 **au moment du déploiement v2** (ordre ci-dessous), comme prévu par le dossier.

## 1. Prérequis (avant le jour J)

1. **Sauvegarde** : export JSON de toutes les tables de l'application (`profiles`, `recipes`, `recipe_sections`,
   `recipe_ingredients`, `instructions`, `recipe_translations`, `favorites`, `planning`, `planning_notes`,
   `shopping_lists`, `shopping_items`, `ai_usage`, et les 11 tables de 0017) + le `pg_dump` du § 0.1 de
   `BASCULE_PROD.md`, **hors du dépôt Git**, + la liste des fichiers du bucket `recipe-photos`.
2. **0017, 0019 et 0021 appliquées en production** (`BASCULE_PROD.md` § 10 et § 11 pour 0017 et 0019 ; 0021 : voir
   « Où s'insère 0021 » au § 2). Vérification :

   ```sql
   select to_regclass('public.groups') is not null                      as t0017,
          to_regprocedure('private.can_read_recipe(uuid)') is not null  as f0019,
          to_regprocedure('public.copy_recipe(uuid)') is not null       as f0021,
          (select count(*) from public.recipes where owner_id is not null) as recettes_avec_proprietaire;   -- true / true / true / 0
   ```
3. **Code v2 prêt** : branche fusionnable, CI verte, **déployé en préproduction et non promu** (Vercel :
   déploiement « staged », à promouvoir à l'étape 7). Noter l'identifiant du déploiement de production actuel
   (celui de l'*Instant Rollback*). Les « previews » Vercel ne doivent pas pointer sur la base de production.
4. **Prévenir les autres comptes** : ils devront se connecter ; fenêtre de quelques minutes.
5. **Relever les comptes** (service pour l'étape 3) : `select id, email, role, created_at, display_name from public.profiles order by created_at;`
   Attendu d'après le dossier (§ 4.3) : 4 comptes dont 2 admins. Repérer **l'adresse de Nina** et celle de chaque
   autre compte.
6. Un onglet SQL Editor ouvert, un onglet Vercel → Deployments, un onglet Authentication → Users.

## 2. L'ordre exact

### Où s'insère 0021 (fonctions métier côté recettes, phase 5A)

Ordre complet : **0017 → 0019 → 0021** → paramètres → **0018** → **0020** → code v2.

* **0021 s'applique tout de suite, comme 0019** : `supabase/migrations/0021_recipe_rpcs.sql`, un seul Run dans le SQL Editor (ou
  `apply_migration` sur le « go » de Nina). Elle ne change **rien pour la v1** : aucune table, colonne, politique ni donnée ;
  elle ajoute 17 fonctions et remplace deux fonctions par des versions de même signature (`save_recipe`,
  `save_recipe_translation`). La migration vérifie elle-même, en fin de fichier, que les empreintes md5 des politiques et des
  autres fonctions n'ont pas bougé. Tant que 0020 n'est pas appliquée, `save_recipe` n'écrit pas `owner_id` (le remplissage 0018
  l'attribuera à Nina) : une recette créée en v1 entre 0021 et 0018 reste donc sans propriétaire, comme aujourd'hui.
* **Avant le déploiement du code v2** : le code v2 appelle ces fonctions, et sans 0021 un éditeur « modifier l'original » ne
  pourrait pas enregistrer la traduction de sa modification (`save_recipe_translation` resterait réservée aux admins).
* **Après 0020**, rien à refaire : `save_recipe` fonctionne alors pour l'auteur et pour un éditeur `edit_original` (le RLS de 0020
  décide ; `visibility` et `category_id` ne sont pris en compte que pour l'auteur).
* **Retour arrière** : indépendant de 0018 / 0020 (`supabase/rollback/0021_recipe_rpcs_down.sql`, n'écrit aucune donnée). À
  jouer AVANT le retour arrière de 0019 (les fonctions de 0021 s'appuient sur `private.*`). Les clients v2 qui appellent les
  fonctions supprimées échouent : retirer d'abord le code v2.

| # | Étape | Qui |
|---|---|---|
| 1 | Photographie de départ | Claude (lecture) |
| 2 | Créer la table des paramètres (`v2/0018_params.sql`) | Claude / Nina |
| 3 | Saisir les paramètres (e-mails, pseudonymes) | **Nina** |
| 4 | Remplissage `v2/0018_v2_data_fill.sql` | Claude, sur le « go » |
| 5 | Contrôles 0018 | Claude |
| 6 | Bascule `v2/0020_rls_switchover.sql` | Claude, sur le « go » |
| 7 | Promotion du code v2 (déjà construit) | Nina / Claude |
| 8 | Vérification d'accès des comptes (§ 4.3, phase 11) | Nina |
| 9 | Nettoyage | Claude |

### Étape 1 — Photographie de départ

```sql
select (select count(*) from public.recipes)             as recettes,
       (select count(*) from public.recipe_sections)     as sections,
       (select count(*) from public.recipe_ingredients)  as ingredients,
       (select count(*) from public.instructions)        as etapes,
       (select count(*) from public.recipe_translations) as traductions,
       (select count(*) from public.profiles)            as profils,
       (select count(*) from public.profiles where role = 'admin') as admins,
       (select count(*) from public.favorites)           as favoris,
       (select count(*) from public.planning)            as repas,
       (select count(*) from public.shopping_items)      as articles,
       (select max(updated_at) from public.recipes)      as derniere_modif;
```

Attendu (dossier § 4.3, base du 18/10, à refaire) : 181 recettes · 358 sections · 1 546 ingrédients · 1 538 étapes ·
181 traductions · 4 profils dont 2 admins · 5 favoris · 70 repas · 43 articles. **Noter ces chiffres** : 0018
contrôle lui-même qu'ils ne bougent pas.

### Étape 2 — Table des paramètres

Exécuter `supabase/v2/0018_params.sql` (crée `private.v2_fill_params`, vide, fermée à l'API).
NOTICE : `[0018 params] table private.v2_fill_params prête (0 ligne(s)) …`.

### Étape 3 — Paramètres (Nina)

Dans le SQL Editor, avec les **vraies** adresses (en **minuscules**) — ces valeurs ne sont écrites dans aucun
fichier du dépôt :

```sql
insert into private.v2_fill_params (key, value) values
  ('owner_email',                          'adresse-de-nina@exemple.fr'),   -- fortement conseillé
  ('display_name:adresse-de-nina@exemple.fr',  'Nina'),                     -- un pseudonyme par compte
  ('display_name:autre-compte-1@exemple.fr',   'Pseudo 1'),
  ('display_name:autre-compte-2@exemple.fr',   'Pseudo 2'),
  ('display_name:autre-compte-3@exemple.fr',   'Pseudo 3')
  -- facultatif : ('cookbook_title:adresse-de-nina@exemple.fr', 'Recettes de Nina'), ('group_name', 'Les Boultons')
on conflict (key) do update set value = excluded.value;
```

* `owner_email` : le compte qui reçoit **toutes** les recettes et crée le groupe. Absent, 0018 retient le compte
  `admin` le plus ancien (et s'arrête s'il y en a deux de même date) : **vérifier alors le NOTICE**.
* `display_name:<e-mail>` : **obligatoire** pour chaque compte (c'est le nom que les autres verront ; sans lui, le
  compte est introuvable). Jamais d'e-mail ni de « @ ». Le champ `profiles.name` contient l'e-mail : il n'est
  volontairement **jamais** utilisé en repli.
* Une faute de frappe (e-mail inconnu, clé inconnue, pseudonyme en double) arrête 0018 avec un message : rien n'est
  modifié, corriger la ligne et relancer.

### Étape 4 — Remplissage (0018)

Exécuter `supabase/v2/0018_v2_data_fill.sql` (un Run). Tout est dans une transaction : s'il y a une erreur, **rien**
n'est appliqué ; lire le message, corriger le paramètre, relancer. Le fichier est rejouable.

**NOTICE attendue** (dernière ligne, exemple avec 4 comptes ; le SQL Editor ne les affiche pas toujours, les
contrôles de l'étape 5 font foi) :

```
[0018] groupe « Les Boultons » (créateur et propriétaire : « Nina ») : 4 membre(s), 1 créateur ;
181 recette(s) au propriétaire (181 remplie(s) par 0018 au total), 181 droit(s) edit_original du groupe ;
9 catégorie(s) par compte ; N entrée(s) de carnet (favoris) ; admins : 1 (support) ; comptes de recettes /
sections / ingrédients / étapes / traductions / favoris / planning / courses inchangés
```

Si `owner_email` est absent, une NOTICE `[0018] owner_email absent : propriétaire = le compte admin le plus ancien …
À VÉRIFIER` s'ajoute avant.

Ce que 0018 a fait : groupe + membres (Nina `creator`) · thème du groupe = préréglage Boultons · `owner_id` = Nina
sur toutes les recettes, `visibility = groups` · un droit `edit_original` du **groupe** par recette · 9 catégories par
compte et `category_id` relié · favoris actuels des autres comptes → leur carnet · pseudonyme, thème actif = groupe,
accueil déjà fait · le 2ᵉ admin repasse `user` (Nina reste `admin` = support).

### Étape 5 — Contrôles de 0018 (lecture seule)

```sql
-- A. Comptes : pseudonyme, 1 seul admin, thème = groupe, 9 catégories chacun
select p.display_name, p.role, p.active_theme_group_id is not null as theme_groupe,
       p.onboarded_at is not null as accueil_fait,
       (select count(*) from public.categories c where c.owner_id = p.id) as categories
  from public.profiles p order by p.created_at;
-- B. Groupe : 1 ligne, membres = nombre de comptes, 1 créateur
select g.name, g.theme->>'preset' as theme,
       (select count(*) from public.group_members m where m.group_id = g.id)                   as membres,
       (select count(*) from public.group_members m where m.group_id = g.id and m.role = 'creator') as createurs
  from public.groups g;
-- C. Recettes : 181 / 181 / 181 / 181 ; droits : 181 ; une seule propriétaire
select count(*) as recettes, count(owner_id) as avec_proprietaire, count(category_id) as avec_categorie,
       count(*) filter (where visibility = 'groups') as en_groupe from public.recipes;
select count(*) as droits_edition from public.recipe_grants where permission = 'edit_original' and grantee_group_id is not null;
select p.display_name, count(*) from public.recipes r join public.profiles p on p.id = r.owner_id group by 1;
-- D. Comptes inchangés (même chiffres qu'à l'étape 1) et recettes non touchées
select (select count(*) from public.recipe_sections) as sections, (select count(*) from public.recipe_ingredients) as ingredients,
       (select count(*) from public.instructions) as etapes, (select count(*) from public.recipe_translations) as traductions,
       (select count(*) from public.favorites) as favoris, (select count(*) from public.planning) as repas,
       (select max(updated_at) from public.recipes) as derniere_modif;       -- identique à l'étape 1
-- E. Carnets : seulement les favoris des autres ; aucune bannière fermée
select (select count(*) from public.cookbook_entries) as entrees_carnet, (select count(*) from public.dismissed_prompts) as bannieres_fermees;   -- N / 0
-- F. 0020 pourra tourner (0 et 0)
select (select count(*) from public.recipes where owner_id is null) as sans_proprietaire,
       (select count(*) from public.recipes r where not exists (select 1 from public.profiles p where p.id = r.owner_id)) as proprietaire_sans_profil;
```

Puis ouvrir le site : **tout fonctionne comme avant** (0020 n'est pas passée), sauf l'édition du 2ᵉ admin.

### Étape 6 — Bascule 0020 (le site se ferme)

Seulement quand le code v2 construit est prêt à être promu (étape 7). Exécuter `supabase/v2/0020_rls_switchover.sql`.
NOTICE : `[0020] bascule appliquée : recettes, contenu, favoris (insertion) et photos sous RLS v2 ; owner_id NOT NULL`.
S'il refuse (« recette(s) sans owner_id ») : une recette a été créée entre-temps → relancer 0018, puis 0020.

Contrôles :

```sql
select count(*) from pg_policies where schemaname = 'public' and tablename = 'recipes';                  -- 4, toutes authenticated
select is_nullable from information_schema.columns
 where table_schema = 'public' and table_name = 'recipes' and column_name = 'owner_id';                  -- NO
select count(*) from pg_policies where schemaname = 'public' and tablename in
  ('recipes','recipe_sections','recipe_ingredients','instructions','recipe_translations')
  and (roles <> '{authenticated}' or qual ~ 'is_admin' or with_check ~ 'is_admin');                      -- 0
```

### Étape 7 — Promotion du code v2

Vercel → le déploiement v2 déjà construit → **Promote to Production**. Contrôler tout de suite l'accueil et la
connexion de Nina. Fin de la fenêtre sensible.

### Étape 8 — Vérification d'accès des comptes (dossier § 4.3, phase 11)

Pour **chacun des comptes** (Nina, puis chaque autre personne, au téléphone ou en navigation privée) :

1. se connecter (e-mail ou Google) ; 2. voir **toutes** les recettes Boultons (181) et les ouvrir (photo, `/en`) ;
3. retrouver ses favoris, son planning, sa liste de courses (mêmes chiffres qu'avant) ; 4. voir le look Boultons
(bleu-vert, cocotte) et son pseudonyme ; 5. **les autres membres** : modifier une recette Boultons (par exemple
une note), puis la remettre ; 6. **Nina** : ajouter une recette, la voir apparaître chez les autres en lecture seule.

Et deux tests négatifs :

* **visiteur sans compte** (fenêtre privée) : aucune recette ;
* **compte neuf** (adresse de test) : connecté mais aucune recette.

Cochez aussi dans Authentication → Users que les comptes se sont bien connectés.

### Étape 9 — Nettoyage

```sql
drop table private.v2_fill_params;      -- supprime les e-mails et pseudonymes saisis
```

Garder `private.backup_0018_profiles` et `private.backup_0018_created` pendant la semaine de surveillance (elles
permettent le retour arrière). Elles seront retirées avec le « contract » (0022) ou par le retour arrière.

## 3. Retour arrière, pas à pas

À faire **vite** (avant que la v2 serve) : voir l'avertissement en bas.

1. **0020 down** — `supabase/rollback/0020_rls_switchover_down.sql` : le site redevient « tout le monde lit »
   (la v1 refonctionne). Contrôle : le nombre de politiques sur `recipes` est de nouveau 4 (`recipes_read_public`…).
2. **0018 down** — `supabase/rollback/0018_v2_data_fill_down.sql` (refuse tant que 0020 est appliquée) : `owner_id`
   et `category_id` à NULL, groupe, membres, droits, catégories et carnets créés par 0018 supprimés, rôles,
   pseudonymes et thème **rétablis** (le 2ᵉ admin redevient admin). NOTICE : `[0018 down] défait : …`. Cette étape
   est **facultative** si l'on veut seulement revenir à la v1 : 0018 seule n'abîme pas la v1 (§ 0.1).
3. **Redéployer la v1** : Vercel → Deployments → l'ancien déploiement de production → **Instant Rollback** (effet en
   quelques secondes). En cas d'urgence, faire cette étape **en premier** : la v1 fonctionne avec 0018 seule, avec
   0018 + 0020 (comptes connectés) et sans rien.

Ensuite : `drop table private.v2_fill_params;` si ce n'est pas déjà fait.

⚠️ **Avertissements du retour arrière**

* Une fois 0020 retirée, **toutes** les recettes redeviennent lisibles par tout le monde, sans compte — y compris
  celles que des gens auraient passées en `private` dans la v2. Ne pas laisser la v2 servir après ce retour.
* 0018 down supprime les catégories, carnets et droits **créés par 0018** ; ce que les gens ont créé dans la v2
  entre-temps (leurs recettes, catégories supplémentaires, amis, groupes) n'est pas listé dans la sauvegarde et reste
  en place ; une recette créée dans la v2 garde son propriétaire.
* Le fichier de sauvegarde JSON de l'étape 1 est la dernière protection.

## 4. Points de vigilance

* **Jeton JWT périmé (jusqu'à 1 h).** Le rôle est lu dans le jeton (`user_role`). Après 0018, le 2ᵉ admin reste
  « admin » pour la v1 jusqu'au renouvellement du jeton : lui demander de se déconnecter / reconnecter. Même chose,
  dans l'autre sens, après un retour arrière.
* **0017 n'est pas dans l'historique `supabase_migrations`** (appliquée par le SQL Editor). Tout outil qui compare
  cet historique (`supabase db push`, `migration up`) voudrait la rejouer — **ne jamais lancer `db push`** pendant la
  bascule. Rejouer 0017 après 0019 retire (`revoke all`) les droits que 0019 a accordés sur les tables sociales, ou
  échoue si ces tables ne sont plus vides. Contrôle de l'historique :
  `select version, name from supabase_migrations.schema_migrations order by 1;` ; si besoin
  `supabase migration repair --status applied <version>`. Même vérification pour 0019. Les fichiers 0018 et 0020
  sont dans `supabase/v2/` exprès : aucun outil ne les applique tout seul.
* **Pas de `begin` / `commit` à ajouter ni à retirer** : les fichiers en contiennent déjà ; ne pas les coller par
  morceaux.
* **Le rôle `postgres` doit être propriétaire de `recipes`** (le cas normal) : 0018 suspend le déclencheur
  `update_recipes_updated_at` pour ne pas changer les dates de modification.
* **Qui rejoint le groupe « Les Boultons » peut modifier ses 181 recettes** : le droit `edit_original` est donné au
  groupe, pas à chaque personne. Pour retirer ce droit à quelqu'un : le sortir du groupe.
* **Les recettes futures de Nina ne sont pas modifiables par le groupe** (elles sont seulement lisibles et
  copiables) tant qu'elle n'a pas accordé `edit_original` (v2, partage).
* **Bannières « Explorer les recettes de Nina »** : 0018 ne ferme aucune bannière ; chaque membre la verra et pourra
  tout ajouter à son carnet d'un geste, comme décidé le 2026-10-24. Les favoris actuels sont déjà dans leur carnet.
* **Créateur du groupe** : Nina ne peut pas supprimer son compte tant que la RPC de transfert (phase 5) n'existe pas
  (`groups.created_by` est `on delete restrict`).
* **Photos publiques** jusqu'à la phase 8 (bucket `recipe-photos` toujours public).
* **Nouvelles inscriptions** : tant que les inscriptions sont ouvertes, un compte neuf ne voit rien (pas de groupe) ;
  c'est normal.

## 5. Comptes attendus (dossier § 4.3)

| Élément | Avant | Après 0018 + 0020 |
|---|---|---|
| Recettes | 181 | 181, toutes à Nina, `visibility = groups` |
| Sections / ingrédients / étapes | 358 / 1 546 / 1 538 | identiques |
| Traductions | 181 | identiques |
| Comptes (`profiles`) | 4 | 4 |
| Groupes | 0 | 1 (« Les Boultons ») |
| Membres du groupe | 0 | 4 (Nina `creator`, 3 `member`) |
| Droits (`recipe_grants`) | 0 | 181 (groupe Boultons, `edit_original`, un par recette) |
| Catégories | 9 (texte) | 36 (9 par compte) ; 181 recettes reliées |
| Entrées de carnet | 0 | favoris des 3 autres comptes sur recettes de Nina |
| Favoris / repas / articles | 5 / 70 / 43 | identiques, même propriétaire |
| Admins | 2 | 1 (Nina, rôle « support ») |
