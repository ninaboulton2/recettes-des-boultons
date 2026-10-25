# Répétition de la bascule v2 (phase 10) — compte rendu

Date : 2026-10-25. Branche `feat/v2-rehearsal` (partie de `modernisation` @ 27430b9). **Base locale Docker uniquement** : la production n'a pas été touchée.
Aucune donnée personnelle dans ce fichier : les pseudonymes et adresses de la répétition sont fictifs et générés par le script.

Rejouable en une commande (≈ 30 s) : `npm run db:local:rehearsal` (`supabase/local/rehearsal.sh`, voir `DEVELOPER.md` § 20.17). Procédure et checklist : `supabase/BASCULE_V2.md` (§ 6).

## Ce qui a été répété

| Étape | Résultat |
|---|---|
| Base « comme la prod » : snapshot réel (181 recettes, 358 sections, 1 546 ingrédients, 1 538 étapes, 5 comptes dont 2 admins, 5 favoris, 70 repas, 43 articles) + 0001 → 0017, 0019, 0021, 0023, 0024 | `setup.sh --until 24` : charge les données **avant** 0003 (le snapshot a encore les colonnes JSONB, 0013 les retire ensuite), rejoue dans l'ordre ; compatible. `verify.sql` est volontairement ignoré dès que le schéma social est là. |
| Puis ce que Nina applique : 0025, 0026, 0027, 0028, 0029 (+ 0030, nouvelle) | 0,03 à 0,06 s chacune, aucune erreur. |
| v1 sur cette base (sans `NUXT_PUBLIC_V2`) | e2e v1 : **117 passés, 3 ignorés, 0 échec** (les 3 ignorés le sont par les specs elles-mêmes : Échap du menu « Moi » sur mobile, rechargement hors ligne × 2). Aucun « relevé connu » n'existe dans le dépôt : ce relevé est le premier. Même résultat avec 0018 appliquée seule (§ 0.1 du runbook confirmé), puis après le retour arrière. |
| Jour J : 0018 params → paramètres (propriétaire = admin le plus ancien, pseudonymes inventés) → 0018 → contrôles A à F → 0020 → contrôles → v2/0029 photos → contrôles | Toutes les NOTICE attendues, tous les contrôles du runbook conformes. Durées : voir le tableau de `BASCULE_V2.md` § 2 (0018 : 0,5 à 0,7 s ; 0020 : 0,05 à 0,10 s ; photos : 0,04 s). |
| Contrôles fonctionnels en v2, via SQL (`rehearsal_checks.sql`, 68 contrôles) **et** via le vrai PostgREST avec de vrais jetons (7 comptes + visiteur) | Les 5 comptes voient 181 recettes, peuvent les modifier ; compte neuf et visiteur : 0 ; favoris / planning / courses conservés ; 9 catégories par compte, reliées et cohérentes avec l'ancien texte ; une traduction par recette ; recherche FR et EN. |
| Parcours e2e v2 sur cette base | voir « Tests » ci-dessous. |
| Retour arrière : photos → 0020 → 0018 | < 0,3 s ; empreinte des données **identique** (12 tables : lignes + md5, `updated_at` des recettes compris) ; v1 : 117 passés / 3 ignorés. |

## Écarts trouvés

1. **Comptes** : le snapshot compte **5 profils** (2 admins), pas 4. **0018 exige un pseudonyme pour chaque compte**, pas seulement les 3 ou 4 qui servent : avec 3 pseudonymes il s'est arrêté
   (« pseudonyme manquant pour : … ») sans rien modifier (empreinte vérifiée). Message clair, mais le runbook ne disait pas de compter. → Corrigé dans `BASCULE_V2.md` (étapes 1.5 et 3, checklist).
2. **Traductions** : le snapshot a été pris avant la traduction des recettes (`recipe_translations` vide), alors que la prod en a une par recette. Sans elles, la recherche anglaise et le compteur « traductions inchangées »
   ne sont pas représentatifs. → `rehearsal_seed_translations.sql` en fabrique une par recette (local seulement).
3. **Runbook incomplet** : aucun paragraphe pour 0025 et 0027, la chaîne ne citait pas 0030, le contrôle de prérequis ne couvrait que 0017 / 0019 / 0021 / 0023. → Paragraphe « Où s'insèrent 0024, 0025, 0027 et 0030 », requête de prérequis étendue.
4. **Performance** (voir plus bas) : `can_read_recipe` coûte ~0,5 ms par appel, évaluée par ligne. → **0030**.
5. **Bug** : les routes `/api/cron/*` répondaient **500** (et alertaient Sentry à chaque passage) au lieu de **503** tant que `CRON_SECRET` est absent (`handleApiError` ne laisse passer que les erreurs < 500). Caché en local par un `.env.local` qui
   porte le secret. → Contrôle du secret sorti du `try` dans les deux routes.
6. **Test e2e fragile** : `e2e/v2/categories.spec.ts` (v2-cat1) échoue sur une base v2 **fraîche** (violation du mode strict : deux `option` « Soupes », la liste déroulante et le `<select>` natif de la bannière « Explorer les recettes »). → localisateur précisé.
7. **Test d'intégration** `save-recipe.local.test.ts` : il exigeait un refus 42501 pour un non-admin, faux en v2. → dépend maintenant du mode (v1 : refus ; v2 : accepté pour ses propres recettes, refusé sur celles d'autrui).
8. Le `docker` de la stack est partagé entre les worktrees (même identifiant de projet) : la répétition a remis à zéro la base commune. À savoir si un autre chantier utilise la base en même temps.

## Mesures de performance (copie des vraies données, 181 recettes, rôle `authenticated`, médiane de 5 passes, Docker local)

| Appel | Membre, avant 0030 | Membre, après 0030 | Propriétaire, après 0030 |
|---|---|---|---|
| `select * from recipes` (RLS, 181 lignes) | 77 ms | **6,7 ms** | 0,03 ms |
| `search_recipes(null)` page de 24 | 148 ms | **14 ms** | 7,6 ms |
| `search_recipes('poulet')` / `('chicken')` | 151 ms | **17 ms** | 11 ms |
| `list_cookbook()` | 0,9 ms | 1,0 ms | 9,8 ms |
| `pending_prompts()` | 14 ms | 14 ms | 15 ms |
| Lecture d'une fiche (recette + sections + ingrédients + étapes + traduction) | 29 ms | **2,8 ms** | 2,8 ms |
| `recipe_access(fiche)` | 0,6 ms | 0,2 ms | 0,1 ms |
| Favoris / planning de la semaine | < 0,1 ms | < 0,1 ms | < 0,1 ms |

Tout est **sous 200 ms**, même avant correction. Mais le coût de la lecture d'un membre croissait linéairement avec le nombre de recettes (≈ 0,5 ms par ligne : une liste à 1 000 recettes aurait pris ~0,5 s) parce que `private.can_read_recipe`
(fonction SQL SECURITY DEFINER, donc jamais « inlinée ») est appelée une fois par ligne par chaque politique de lecture (`recipes`, sections, ingrédients, étapes, traductions, carnets). Aucun index ne manque (index sur `recipe_grants`, `group_members`, `recipes.owner_id` présents).
**Correction : `0030_can_read_recipe_perf.sql`** — même fonction, même signature et mêmes droits, réécrite en plpgsql avec retour anticipé. Même résultat vérifié sur 60 combinaisons (personne × rôle × recette, y compris le support devant une recette signalée) ;
aucune table, politique ni donnée touchée ; compatible SQL Editor ; rollback `0030_can_read_recipe_perf_down.sql` (remet la version de 0019) ; test `test_0030_can_read_recipe_perf.sql` branché dans `run_local.sh`.
Les chiffres de production seront plus élevés (réseau, instance plus petite) mais dans le même rapport. `pending_prompts()` (14 ms) n'est pas touché : acceptable.

## Retour arrière

Photos → 0020 → 0018 dans l'ordre du runbook : < 0,3 s, aucune erreur. Politiques `recipes` revenues à `recipes_read_public` + 3 politiques admin, bucket public, rôles d'origine rétablis (2 admins), groupe / droits / catégories / carnets supprimés,
`owner_id` et `category_id` à NULL. Empreinte des données identique à l'avant (comptes de test créés après la bascule exclus : le retour arrière ne supprime pas de comptes, voir `BASCULE_V2.md` § 3). Reste après retour : `recipes.visibility = 'groups'` (défaut de 0017, sans effet v1) et les migrations 0025 → 0030 (sans effet v1).

## Tests (fin de travail, base remise en v1 avec le snapshot)

| Suite | Résultat |
|---|---|
| `npm run lint` | propre |
| `npm run typecheck` | propre |
| `npx vitest run` (base v1 **et** base v2) | 723 passés, 32 ignorés (4 fichiers d'intégration qui exigent le serveur) ; `save-recipe.local.test.ts` passe dans les deux modes |
| `bash supabase/tests/run_local.sh` | « Toutes les migrations et tous les tests sont passés » (≈ 2 min), avec `test_0030` (60 comparaisons) |
| e2e v1 (`npm run test:e2e`, base v1 avec 0025 → 0030) | 117 passés, 3 ignorés, 0 échec (≈ 4 min) |
| e2e v2 (`npm run test:e2e:v2`, `db:local:v2`) | 55 passés, 1 ignoré (la partie « avec secret » de `p7-cron`, `CRON_SECRET` vide), 0 échec (≈ 4,4 min) |

Remarque : sur une machine très chargée (autres sessions, simulateur iOS), des parcours v2 (`p8-read`, `6b-share1`) ont dépassé leurs délais ; ils passent seuls et dans le passage complet à charge normale.

## Migrations 0025 à 0029 : modifiées ?

**Non.** Aucun des fichiers 0017 → 0029, `supabase/v2/*` et `supabase/rollback/*` existants n'a été modifié. Ajouts seulement : **0030** (nouvelle migration, à appliquer avec 0025 → 0029), son rollback et son test.

## Reste à faire avant la vraie bascule

- Nina applique 0025 → 0030 (un Run chacune), puis suit la checklist de `BASCULE_V2.md` § 6.
- Vérifier le nombre réel de comptes (le snapshot en a 5, le dossier 4) et saisir un pseudonyme **par compte**.
- Poser les variables Vercel (`CRON_SECRET` ≥ 16 caractères, `SUPABASE_SECRET_KEY`, `ALERT_EMAIL`, budget IA) et contrôler les « Exposed schemas » de Supabase (`private` absent).
- Les parcours qui ne se simulent pas en local restent à faire à la main le jour J : promotion Vercel, purge du cache d'images, photos signées / lien public `/r/<jeton>` en navigation privée, connexion Google.
