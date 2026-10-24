# Bascule v2 — remplissage des données et passage au multi-comptes

Pour : **Nina** et **Claude**, sur le projet Supabase `recettes-boultons` (`tzlkabxcmmbwhpyvmato`) et dans Vercel.
Complète `BASCULE_PROD.md` (§ 10 et § 11 : 0017 et 0019, déjà passées ; **0021 et 0023 se posent aussi tout de suite**, voir § 2) ; correspond à la phase 11 du dossier
« Recettes v2 » (§ 4.2 étapes 3 à 6, § 4.3, § 9).

Ce que fait la bascule : les recettes Boultons reçoivent une propriétaire (Nina), les comptes actuels
entrent dans le groupe « Les Boultons » (qui garde le look actuel), chacun reçoit ses catégories, un
pseudonyme, et **le site cesse d'être public** (il faut un compte pour voir les recettes).

Durée : environ 30 minutes, dont **une fenêtre sensible de 2 à 5 minutes** entre 0020 et la fin du
déploiement du code v2 (étapes 6 → 7). Le SQL lui-même est quasi instantané (**moins de 2 secondes en tout** en local, 0018 en
0,5 s : durées mesurées au § 2, « Durées mesurées »), le reste est du temps humain (lecture des contrôles, déploiement).

**Répétée de bout en bout le 2026-10-25 sur une copie des vraies données** : voir `supabase/REPETITION_V2.md` et la **checklist
du jour J au § 6**. Rejouable à volonté : `bash supabase/local/rehearsal.sh` (ou `npm run db:local:rehearsal`).

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
| Photos | Le bucket `recipe-photos` reste **public** (0020, point 4) : l'adresse d'une photo marche encore sans compte. Il devient privé avec `v2/0029_private_photos_switchover.sql` (étape 6 bis), qui doit suivre le déploiement du code v2. |
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
2. **0017, 0019, 0021 et 0023 appliquées en production** (`BASCULE_PROD.md` § 10 et § 11 pour 0017 et 0019 ; 0021 et 0023 : voir
   « Où s'insère 0021 » et « Où s'insère 0023 » au § 2). Vérification :

   ```sql
   select to_regclass('public.groups') is not null                      as t0017,
          to_regprocedure('private.can_read_recipe(uuid)') is not null  as f0019,
          to_regprocedure('public.copy_recipe(uuid)') is not null       as f0021,
          to_regprocedure('public.send_friend_request(uuid)') is not null as f0023,
          to_regprocedure('public.recipe_access(uuid)') is not null     as f0026,
          to_regprocedure('public.shared_recipe_photo_path(uuid)') is not null as f0029,
          (select prolang = (select oid from pg_language where lanname = 'plpgsql')
             from pg_proc where oid = 'private.can_read_recipe(uuid)'::regprocedure) as f0030,
          (select count(*) from public.recipes where owner_id is not null) as recettes_avec_proprietaire;   -- true ×7 / 0
   ```
   (0025, 0027 et 0028 ne laissent pas de trace aussi simple à tester : `select to_regprocedure('public.report_shared_recipe(uuid, text, text)') is not null, to_regprocedure('public.ai_service_status()') is not null;` → true / true.)
3. **Code v2 prêt** : branche fusionnable, CI verte, **déployé en préproduction et non promu** (Vercel :
   déploiement « staged », à promouvoir à l'étape 7). Noter l'identifiant du déploiement de production actuel
   (celui de l'*Instant Rollback*). Les « previews » Vercel ne doivent pas pointer sur la base de production.
4. **Prévenir les autres comptes** : ils devront se connecter ; fenêtre de quelques minutes.
5. **Relever les comptes** (service pour l'étape 3) : `select id, email, role, created_at, display_name from public.profiles order by created_at;`
   Attendu d'après le dossier (§ 4.3) : 4 comptes dont 2 admins. **Le snapshot local en compte 5 (dont 2 admins)** : le nombre réel du jour J fait foi.
   Repérer **l'adresse de Nina** et celle de chaque autre compte. **Chaque ligne de cette liste doit recevoir un pseudonyme à l'étape 3** (y compris un compte
   inutilisé ou de test) : sinon 0018 s'arrête (sans rien modifier, vérifié) avec « pseudonyme manquant pour : … ».
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

### Où s'insère 0026 (phase 6B)

* `supabase/migrations/0026_recipe_access.sql` : une seule fonction de lecture, `recipe_access(uuid)` (droit de la personne sur une recette lisible, pour afficher les bons
  boutons). Dépend de 0019 et 0021 seulement ; **aucune table, colonne, politique ni donnée touchée**, donc sans effet pour la v1, avant ou après 0018 / 0020. À appliquer **avant**
  le déploiement du code v2 (la fiche l'appelle). Un seul Run dans le SQL Editor (ou `apply_migration` sur le « go » de Nina).
* Retour arrière : `supabase/rollback/0026_recipe_access_down.sql` (supprime la fonction ; retirer d'abord le code v2).

### Où s'insère 0028 (phase 7 : IA ouverte à tous, crédit épuisé, e-mails)

* `supabase/migrations/0028_ai_credit_email.sql` : deux colonnes **nullables** (`profiles.ai_daily_quota`, `notifications.emailed_at`), un index partiel, 10 fonctions (quota du jour, état du service, alertes de crédit, e-mails de notification ; celles du serveur sont réservées à `service_role`).
  Dépend de 0012 (`ai_usage`), 0017 (`system_alerts`, `notifications`) et 0019 (`private.is_support`, droits de colonnes de `profiles`). **Aucune politique, déclencheur ni donnée existante modifiés : sans effet pour la v1**, avant ou après 0018 / 0020 ; `check_ai_quota` (0012), utilisée par la v1, est inchangée. Compatible avec le SQL Editor (aucune table temporaire). Un seul Run (ou `apply_migration` sur le « go » de Nina), **avant** le déploiement du code v2.
* **Variables à poser dans Vercel avant de promouvoir le code v2** (détail et valeurs : `DEVELOPER.md` § 20.15) : `SUPABASE_SECRET_KEY` (déjà posée pour la suppression de compte), **`CRON_SECRET`** (32 caractères aléatoires ou plus ; sans lui les deux tâches planifiées de `vercel.json` répondent 503), `ALERT_EMAIL`, et, quand le domaine est prêt, `RESEND_API_KEY`, `EMAIL_FROM`, `SITE_URL`. Facultatives : `AI_NEW_ACCOUNT_DAILY_QUOTA` (20), `AI_NEW_ACCOUNT_DAYS` (30), `AI_MONTHLY_BUDGET_USD` (5 suggéré). **Sans Resend, aucun e-mail n'est envoyé et rien ne casse.**
* Après le déploiement : Vercel → Settings → Cron Jobs doit lister `/api/cron/ai-credit-probe` et `/api/cron/notification-emails` ; le SMTP d'authentification de Supabase se branche à part (procédure en § 20.15, rien d'automatisé).
* **Retour arrière** : `supabase/rollback/0028_ai_credit_email_down.sql` (supprime fonctions, index et les deux colonnes ; les notifications et `system_alerts` restent). À jouer **après** avoir retiré le code v2 (ou repassé `NUXT_PUBLIC_V2` à false) : le serveur v2 appelle ces fonctions. Indépendant de 0018 / 0020.

### Où s'insèrent 0029 et la bascule des photos (phase 8)

Ordre complet : … → 0026 → 0027 → **0029 (migration)** → paramètres → **0018** → **0020** → **`v2/0029_private_photos_switchover.sql`** → code v2.

* **`supabase/migrations/0029_shared_recipe_photo.sql` s'applique tout de suite** (avec 0026 et 0027) : une fonction, `shared_recipe_photo_path(uuid)` (renvoie l'id et le chemin, seulement si le chemin est `<id de la recette>/…`), réservée à `service_role`, et la contrainte `recipes_photo_path_in_own_folder` sur `recipes` (NOT VALID, puis validée si aucune ligne existante ne la viole ; un avis le dit sinon). Aucune politique ni donnée modifiée : **sans effet pour la v1**, dont l'éditeur n'écrit que `<id de la recette>/<horodatage>.webp`. `v2/0020` pose la même contrainte (même nom, idempotente) ; chaque retour arrière ne la retire que si l'autre n'est pas appliqué. À appliquer **avant** le déploiement du code v2 (la photo de la page publique l'appelle).
* **`supabase/v2/0029_private_photos_switchover.sql` fait partie de la bascule** (étape 6 bis, juste après 0020) : le bucket `recipe-photos` devient **privé**. **À ne jamais appliquer avant le déploiement du code v2** : la v1 affiche les photos par leur adresse publique ; bucket privé = photos cassées en v1. Il refuse de tourner si 0020 n'est pas appliquée. Les chemins ne changent pas, aucun fichier n'est déplacé.
* **Variable Vercel** : `SUPABASE_SECRET_KEY` (clé service_role, côté serveur seulement), déjà demandée pour la suppression de compte, sert aussi à signer la photo de la page publique, copier une photo, et nettoyer le stockage. Sans elle, ces routes répondent 500 (le reste marche).
* **Retour arrière** : `supabase/rollback/0029_private_photos_switchover_down.sql` (bucket redevient public, suppression de photo de nouveau permise aux éditeurs) **AVANT** `0020_rls_switchover_down`. Puis `0029_shared_recipe_photo_down.sql` (indépendant de 0018 / 0020, après avoir retiré le code v2).

### Où s'insèrent 0024, 0025, 0027 et 0030 (petites migrations « sans effet pour la v1 »)

Ordre complet des migrations de ce fichier : **0017 → 0019 → 0021 → 0023 → 0024 → 0025 → 0026 → 0027 → 0028 → 0029 → 0030**
(0017, 0019, 0021, 0023, 0024 sont déjà en production ; **Nina applique 0025 → 0030 d'un coup, avant le jour J**, un fichier = un Run).

* **0024** (déjà en production) : rôle `user` en dur à l'inscription. Rien à refaire.
* **0025** `0025_profile_onboarding.sql` : remplace `update_my_profile` par une version à 7 paramètres (fin de l'accueil). Elle **supprime l'ancienne
  signature à 6 paramètres** (aucun code déployé ne l'appelle). Aucune table, politique ni donnée touchée. Retour : `rollback/0025_profile_onboarding_down.sql`.
* **0027** `0027_report_shared_recipe.sql` : une fonction de signalement depuis la page publique `/r/<jeton>`. Sans effet v1. Retour : `rollback/0027_report_shared_recipe_down.sql`.
* **0030** `0030_can_read_recipe_perf.sql` (ajoutée par la répétition, phase 10) : réécrit `private.can_read_recipe` en plpgsql avec retour anticipé.
  **Même résultat, ~10 fois plus rapide** : `select * from recipes` d'un membre 77 → 7 ms, `search_recipes` 150 → 15 ms, une fiche 29 → 3 ms (181 recettes,
  linéaire en nombre de recettes : sans elle ~0,5 s par liste à 1 000 recettes). Aucune table, colonne, politique ni donnée touchée : sans effet v1. Un Run.
  Retour : `rollback/0030_can_read_recipe_perf_down.sql` (remet la version SQL de 0019), **à jouer avant le retour arrière de 0019**.

### Où s'insère 0023 (fonctions métier côté social, phase 5B)

Ordre complet : **0017 → 0019 → 0021 → 0023 → 0024 → 0025 → 0026 → 0027 → 0028** → paramètres → **0018** → **0020** → code v2. (**0022 est RÉSERVÉE** au « contract » : ne
pas l'utiliser.)

* **0023 s'applique tout de suite après 0021** : `supabase/migrations/0023_social_rpcs.sql`, un seul Run dans le SQL Editor (ou
  `apply_migration` sur le « go » de Nina). Elle ne change **rien pour la v1** : aucune table existante, colonne, politique ni donnée ;
  elle ajoute 29 fonctions, 9 déclencheurs (`trg_0023_*`, dont un `before delete` sur `recipes` et un sur `profiles`, sans effet tant
  que `cookbook_entries` est vide et que `display_name` n'est pas écrit par l'API) et le journal `private.rate_events`. Elle vérifie
  elle-même, en fin de fichier, les empreintes md5 des politiques, des autres fonctions publiques et des déclencheurs existants.
  **Indépendante de 0021** (seule 0019 est requise) : elle peut passer avant ou après.
* **Le remplissage 0018 et la bascule 0020 ne sont pas gênés** : les limites de débit et les règles du pseudonyme sont ignorées sans
  `auth.uid()` (SQL Editor, service), et 0018 ne crée ni amitié, ni invitation, ni droit à une personne (donc aucune notification).
* **Avant le déploiement du code v2** : définir `SUPABASE_SECRET_KEY` (clé secrète `service_role`) dans Vercel, côté serveur seulement,
  pour la route `POST /api/account/delete` ; sans elle la route répond 500 et tout le reste fonctionne.
* **Retour arrière** : indépendant de 0018 / 0020 et de 0021 (`supabase/rollback/0023_social_rpcs_down.sql`, ne supprime aucune
  donnée sociale ; les notifications déjà créées restent). À jouer AVANT le retour arrière de 0019 (les fonctions s'appuient sur
  `private.*`). Les clients v2 qui appellent les fonctions supprimées échouent : retirer d'abord le code v2.

| # | Étape | Qui |
|---|---|---|
| 1 | Photographie de départ | Claude (lecture) |
| 2 | Créer la table des paramètres (`v2/0018_params.sql`) | Claude / Nina |
| 3 | Saisir les paramètres (e-mails, pseudonymes) | **Nina** |
| 4 | Remplissage `v2/0018_v2_data_fill.sql` | Claude, sur le « go » |
| 5 | Contrôles 0018 | Claude |
| 6 | Bascule `v2/0020_rls_switchover.sql` | Claude, sur le « go » |
| 6 bis | Bascule des photos `v2/0029_private_photos_switchover.sql` (juste après 0020) | Claude, sur le « go » |
| 7 | Promotion du code v2 (déjà construit) | Nina / Claude |
| 8 | Vérification d'accès des comptes (§ 4.3, phase 11) | Nina |
| 9 | Nettoyage | Claude |

#### Durées mesurées (répétition locale du 2026-10-25, copie des vraies données : 181 recettes, 1 546 ingrédients, 5 comptes)

Temps d'exécution du fichier par `psql` en local, sans latence réseau : en production (SQL Editor, `apply_migration`), compter quelques secondes de plus,
pas davantage. La **durée réelle du jour J est dominée par le temps humain** (lire les contrôles, déployer le code v2).

| Étape | Fichier | Durée |
|---|---|---|
| Migrations 0025 → 0030 (6 Runs) | `migrations/0025…0030` | 0,03 à 0,06 s chacune |
| 2 | `v2/0018_params.sql` | 0,03 s |
| 4 | `v2/0018_v2_data_fill.sql` | **0,5 à 0,7 s** (181 recettes, 36 à 45 catégories, 181 droits) |
| 5 | contrôles A à F | < 0,1 s |
| 6 | `v2/0020_rls_switchover.sql` | 0,05 à 0,10 s |
| 6 bis | `v2/0029_private_photos_switchover.sql` | 0,04 s |
| Retour 0 / 1 / 2 | `0029` down / `0020` down / `0018` down | 0,07 / 0,08 / 0,08 s |
| Contrôles fonctionnels | `local/rehearsal_checks.sql` (68 contrôles) | ~1 s |

La fenêtre sensible (0020 → code v2 promu) ne dépend donc que de la promotion Vercel (quelques secondes à 2 minutes), pas de la base.

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
* `display_name:<e-mail>` : **obligatoire pour CHAQUE compte** du relevé de l'étape 1.5 — pas seulement les 3 ou 4 qui servent — (c'est le nom que les autres verront ; sans lui, le
  compte est introuvable). Compter les lignes : `select count(*) from private.v2_fill_params where key like 'display_name:%'` doit égaler le nombre de profils. Jamais d'e-mail ni de « @ ». Le champ `profiles.name` contient l'e-mail : il n'est
  volontairement **jamais** utilisé en repli.
* Une faute de frappe (e-mail inconnu, clé inconnue, pseudonyme en double) arrête 0018 avec un message : rien n'est
  modifié, corriger la ligne et relancer.

### Étape 4 — Remplissage (0018)

Exécuter `supabase/v2/0018_v2_data_fill.sql` (un Run). Tout est dans une transaction : s'il y a une erreur, **rien**
n'est appliqué ; lire le message, corriger le paramètre, relancer. Le fichier est rejouable.

**NOTICE attendue** (dernière ligne, exemple avec 4 comptes ; la répétition locale en donne 5 membres et « 1 entrée(s) de carnet » ; le SQL Editor ne les affiche pas toujours, les
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

### Étape 6 bis — Photos privées (`v2/0029_private_photos_switchover.sql`)

Tout de suite après 0020, dans la même fenêtre sensible. NOTICE : `[v2/0029] bucket recipe-photos privé ; lecture = can_read_recipe, écriture = can_edit_recipe, suppression = auteur`.

Contrôles :

```sql
select public from storage.buckets where id = 'recipe-photos';                                           -- false
select policyname, cmd, roles from pg_policies where schemaname = 'storage' and tablename = 'objects'
 and policyname like 'recipe_photos_%' order by 1;           -- 4 lignes, toutes {authenticated} : delete_owner, insert_editor, select_readable, update_editor
select has_function_privilege('anon', 'public.shared_recipe_photo_path(uuid)', 'execute');              -- false
```

Après la promotion (étape 7), à la main : (1) une adresse `…/storage/v1/object/public/recipe-photos/<id>/<fichier>` copiée avant la bascule répond une erreur ; (2) connecté, les cartes et la fiche affichent les photos (l'adresse de l'image contient `/object/sign/` et `token=`) ;
(3) une recette partagée par lien : la page `/r/<jeton>` en navigation privée affiche la photo ; (4) copier une recette qui a une photo : la copie a sa photo.

**Purger les caches d'images (juste après la promotion, étape 7).** L'optimiseur d'images de Vercel (`/_vercel/image?url=…` en production, `/_ipx/…` en développement) a pu garder des copies des photos qui étaient publiques : tableau de bord Vercel → le projet → *Settings* → *Caches* → purger le cache CDN (*Purge CDN Cache*), ou invalider par image source (API Vercel « invalidate by src images » ; l'intitulé exact peut varier, à vérifier dans le tableau de bord). **Prévenir aussi** : le cache `images` du service worker (PWA) de chaque appareil n'est pas purgeable à distance ; ses entrées expirent seules (30 jours au plus, 120 entrées) et ne contiennent que ce que l'appareil avait déjà vu.

**Avant la bascule 0028 (production) : régler `AI_MONTHLY_BUDGET_USD` (suggéré 5) ou `AI_MONTHLY_BUDGET_CALLS` dans Vercel** — sans budget, l'IA ouverte à tous n'a que le plafond par compte (`DEVELOPER.md` § 20.16).

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

0. **Photos d'abord** — `supabase/rollback/0029_private_photos_switchover_down.sql` (si la bascule des photos a été appliquée) : le bucket redevient public et la suppression de photo redevient permise aux éditeurs. Contrôle : `select public from storage.buckets where id = 'recipe-photos'` → `true`. Sans cela, la v1 afficherait des photos cassées.
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

**Vérifié à la répétition (2026-10-25)** : après photos → 0020 → 0018 (en moins de 0,3 s au total), l'empreinte des données (`local/rehearsal_fingerprint.sql` : nombre de
lignes et md5 des colonnes v1 de 12 tables, recettes avec `updated_at`) est **identique** à celle d'avant ; le bucket redevient public, les 4 politiques
`recipes_read_public`… reviennent, la v1 repasse ses 117 parcours e2e. Ce qui **reste** après un retour arrière : les comptes créés entre-temps (ils
gardent leur profil), `recipes.visibility = 'groups'` (valeur par défaut posée par 0017, sans effet en v1) et la table `private.v2_fill_params` si on ne la supprime pas.
Les migrations 0025 → 0030 n'ont **pas** à être retirées pour revenir à la v1 (sans effet v1) ; si on le veut quand même : 0030 down → 0029 down (`0029_shared_recipe_photo_down.sql`)
→ 0028 → 0027 → 0026 → 0025, **avant** les retours arrière de 0023 / 0021 / 0019 (qui supprimeraient les fonctions dont elles dépendent).

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
* **Créateur du groupe** : Nina ne peut pas supprimer son compte tant que le groupe « Les Boultons » a d'autres membres
  (`groups.created_by` est `on delete restrict`) : elle doit d'abord passer le rôle (`transfer_group_ownership`, 0023) ou
  supprimer le groupe ; `account_deletion_blockers()` le lui indique, `prepare_account_deletion` le contrôle côté serveur.
* **À vérifier dans Supabase avant la bascule (relecture de sécurité n° 2)** :
  1. *Settings → API → Exposed schemas* : le schéma `private` ne doit **pas** figurer dans la liste (seulement `public`, et `graphql_public`
     si utilisé). Les aides RLS, le journal `private.rate_events` et les fonctions de déclencheurs ne doivent jamais être joignables par l'API.
  2. Le **thème de groupe** (`groups.theme`) et le thème personnel (`profiles.theme_settings`) sont du JSON libre (objet de 4000 caractères au plus,
     seule contrainte de la base) : à valider par une **liste blanche au rendu** (phase 6A) avant d'appliquer la moindre couleur ou propriété.
  3. Après 0019 : `select has_column_privilege('authenticated', 'public.profiles', 'email', 'update');` doit répondre `false` (l'e-mail du profil
     n'est plus modifiable par l'API ; le code actuel ne modifie aucune colonne de `profiles`).
  4. Déploiement du code v2 : le middleware `server/middleware/csrf.ts` refuse les écritures `/api/**` venues d'un autre site ; la suppression
     de compte exige une connexion de moins de 10 minutes (401 `REAUTH_REQUIRED` : l'interface redemande le mot de passe).
* **Photos publiques** jusqu'à la phase 8 (bucket `recipe-photos` toujours public).
* **Nouvelles inscriptions** : tant que les inscriptions sont ouvertes, un compte neuf ne voit rien (pas de groupe) ;
  c'est normal.

## 5. Comptes attendus (dossier § 4.3)

| Élément | Avant | Après 0018 + 0020 |
|---|---|---|
| Recettes | 181 | 181, toutes à Nina, `visibility = groups` |
| Sections / ingrédients / étapes | 358 / 1 546 / 1 538 | identiques |
| Traductions | 181 | identiques |
| Comptes (`profiles`) | 4 (5 sur le snapshot local : relever le nombre réel à l'étape 1.5) | identique |
| Groupes | 0 | 1 (« Les Boultons ») |
| Membres du groupe | 0 | 4 (Nina `creator`, 3 `member`) |
| Droits (`recipe_grants`) | 0 | 181 (groupe Boultons, `edit_original`, un par recette) |
| Catégories | 9 (texte) | 36 (9 par compte) ; 181 recettes reliées |
| Entrées de carnet | 0 | favoris des autres comptes sur des recettes de Nina (1 sur le snapshot de la répétition, selon les favoris réels) |
| Favoris / repas / articles | 5 / 70 / 43 | identiques, même propriétaire |
| Admins | 2 | 1 (Nina, rôle « support ») |

## 6. Checklist du jour J (à cocher)

Chaque case correspond à une étape répétée ci-dessus. Ne passer à la suivante qu'une fois la case cochée. Les `[ ]` se cochent dans une copie de ce fichier ou dans l'Obsidian de Nina.

**Avant (J-1 ou le matin)**

- [ ] Sauvegarde : export JSON des tables + `pg_dump` (`BASCULE_PROD.md` § 0.1) **hors du dépôt**, liste des fichiers du bucket `recipe-photos`.
- [ ] Prérequis 1.2 : 0017, 0019, 0021, 0023, 0024 présentes (requête du § 1, `recettes_avec_proprietaire = 0`).
- [ ] Appliquer **0025, 0026, 0027, 0028, 0029, 0030**, un fichier = un Run ; la requête du § 1.2 répond `true` partout. (Sans effet v1 : le site reste utilisable.)
- [ ] Variables Vercel posées : `SUPABASE_SECRET_KEY`, `CRON_SECRET` (≥ 16 caractères), `ALERT_EMAIL`, `AI_MONTHLY_BUDGET_USD` (suggéré 5) ; `RESEND_API_KEY`, `EMAIL_FROM`, `SITE_URL` si le domaine est prêt (`DEVELOPER.md` § 20.15).
- [ ] Supabase → Settings → API → *Exposed schemas* : `private` **absent** (§ 4).
- [ ] Code v2 construit, CI verte, **déployé en préproduction et non promu** ; identifiant du déploiement actuel noté (Instant Rollback). Les « previews » ne pointent pas sur la prod.
- [ ] Autres comptes prévenus (fenêtre de quelques minutes, ils devront se reconnecter).
- [ ] Onglets ouverts : SQL Editor, Vercel → Deployments, Authentication → Users.

**Jour J**

- [ ] Étape 1 : photographie de départ lancée et **chiffres notés** (recettes, sections, ingrédients, étapes, traductions, profils, admins, favoris, repas, articles, `derniere_modif`).
- [ ] Étape 1.5 : relevé des comptes (`select id, email, role, created_at, display_name from public.profiles order by created_at`) ; l'adresse de Nina repérée.
- [ ] Étape 2 : `v2/0018_params.sql` → NOTICE `table private.v2_fill_params prête (0 ligne(s))`.
- [ ] Étape 3 : paramètres saisis, `owner_email` = Nina, **un `display_name:` pour CHAQUE compte du relevé** (comptage = nombre de profils).
- [ ] Étape 4 : `v2/0018_v2_data_fill.sql` → NOTICE `[0018] groupe « Les Boultons » …` (ou contrôles de l'étape 5 si le SQL Editor n'affiche pas les NOTICE).
- [ ] Étape 5 : contrôles A à F ; D identique à l'étape 1 ; F = `0 / 0` ; un seul admin ; 9 catégories par compte.
- [ ] Le site fonctionne encore comme avant (0020 pas passée), sauf l'édition du 2ᵉ admin.
- [ ] **Go de Nina** pour la fenêtre sensible.
- [ ] Étape 6 : `v2/0020_rls_switchover.sql` → NOTICE `[0020] bascule appliquée` ; contrôles : `4`, `NO`, `0`.
- [ ] Étape 6 bis : `v2/0029_private_photos_switchover.sql` → NOTICE `[v2/0029] bucket recipe-photos privé` ; contrôles : `false`, 4 politiques `{authenticated}`, `false`.
- [ ] Étape 7 : **Promote to Production** du déploiement v2 ; accueil et connexion de Nina contrôlés tout de suite (fin de la fenêtre sensible).
- [ ] Purge du cache CDN Vercel (images) faite ; autres comptes prévenus pour le cache du service worker.
- [ ] Étape 8 pour **chaque compte** : se connecter, voir les recettes (même nombre qu'à l'étape 1) et leurs photos, favoris / planning / courses inchangés, look Boultons et pseudonyme, modifier puis remettre une note (autres membres), ajouter une recette (Nina) et la voir en lecture seule chez les autres.
- [ ] Tests négatifs : visiteur sans compte (fenêtre privée) = aucune recette ; compte neuf = connecté mais aucune recette.
- [ ] Photos : adresse publique ancienne en erreur ; `/object/sign/` + `token=` connecté ; `/r/<jeton>` en navigation privée avec photo ; copie d'une recette avec photo.
- [ ] Vercel → Settings → Cron Jobs : `/api/cron/ai-credit-probe` et `/api/cron/notification-emails` listées (réponse 401 sans le secret).
- [ ] Authentication → Users : chaque compte s'est connecté.

**Après (semaine de surveillance)**

- [ ] Étape 9 : `drop table private.v2_fill_params;` (supprime e-mails et pseudonymes saisis).
- [ ] Garder `private.backup_0018_profiles` et `private.backup_0018_created` une semaine (retour arrière), puis les retirer avec le « contract » (0022) ou par le retour arrière.
- [ ] En cas de problème : retour arrière du § 3 **dans l'ordre** (photos, 0020, 0018, puis Instant Rollback Vercel) ; le contrôle d'identité des données est `local/rehearsal_fingerprint.sql` (à jouer avant et après).
