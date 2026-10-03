# Qualité des données des recettes

Rapport établi le **2026-10-03** sur la base locale (snapshot de la prod du même jour, migrations
0003 → 0013 appliquées : toutes les recettes ont des sections, plus d'orphelins). Les recettes
de la prod et du snapshot ont les mêmes identifiants ; seule différence connue : « Carrot cake »
a perdu 17 ingrédients en prod le 2026-10-03 (voir `supabase/BASCULE_PROD.md`, « Écarts »).

Périmètre : 181 recettes, 359 sections, 1 546 ingrédients, 1 538 étapes.

Chaque problème est classé :

* **0015** : corrigé automatiquement par la migration optionnelle
  `supabase/migrations/0015_data_cleanup.sql` (corrections sans perte d'information, liste
  exacte, sauvegarde des lignes dans `*_backup_cleanup`) ;
* **humain** : demande une décision (sens, traduction, quantité inconnue) → à corriger dans
  l'éditeur de recettes, par un admin.

---

## 1. Unités non reconnues (14 graphies, 22 lignes)

`unit` renseignée mais `unit_code` NULL : la graphie n'est pas une unité du référentiel
(0003). La plupart sont des **qualificatifs** saisis dans la case « unité ». Sur la table brute
d'avant 0005 (avec les doublons orphelins), on en comptait 26 lignes ; 22 sont réellement
affichées.

| Unité saisie | Lignes | Recette · ingrédient · quantité | Correction proposée | Qui |
|---|---|---|---|---|
| `cuil.` | 4 | Dips indiens avec poppadoms · Sel 0.25 et 0.5, Graines de cumin 0.5, Sucre 1 | `cuil.` est ambigu (soupe ou café ?). Probablement **c. à café** (quantités < 1 cuillère de sel/cumin) → `unit_code = 'cac'` | humain |
| `à 15`, `à 2` | 2 | Pizzaladière · olives noires « 10 » ; Raie au beurre noisette · Branches de céleri « 1 » | La plage a été coupée en deux : quantité « 10 à 15 », « 1 à 2 », sans unité | 0015 (R1) |
| `large` | 2 | Black bean chili · onions 2 ; Enchiladas · onion 1 | Qualificatif → dans le nom : « onions, large » | 0015 (R4) |
| `petit` | 3 | Curry d'aubergine · oignon ; Nems · piment rouge ; Wok de Légumes · Petit piment ou poudre de piments | « oignon, petit », « piment rouge, petit » ; le 3ᵉ contient déjà « Petit » → unité simplement retirée | 0015 (R4) |
| `petite` | 3 | Raie au beurre noisette · Carotte ; Ravioli à l'encre… · noix de beurre ; Soupe de lentilles… · Butternut | « Carotte, petite »… (à reformuler ensuite en « petite carotte » si on veut) | 0015 (R4) |
| `grands` | 1 | Banana Bread · oeufs 2 | « oeufs, grands » | 0015 (R4) |
| `medium` | 1 | Vegetable pasties · onion 1 | « onion, medium » | 0015 (R4) |
| `ripe` | 1 | Banana Bread · bananes 6 | « bananes, ripe » (à traduire : « bananes bien mûres ») | 0015 (R4) puis humain |
| `chopped`, `crumbled`, `sliced` | 3 | Black bean chili · spring onions, feta cheese, radishes (quantité « optional ») | « spring onions, chopped »… et `optional = true` (voir § 2) | 0015 (R2 + R4) |
| `demi` | 1 | Fritters · « jus d'un demi citron », quantité 1 | Le « demi » est déjà dans le nom : retirer l'unité **et** la quantité 1 (« 1 jus d'un demi citron » n'a pas de sens) | humain |
| `squeeze` | 1 | Enchiladas · tomato puree 1 | « 1 squeeze » = une giclée : `unit_code = 'qs'` ou une quantité réelle (ex. 1 c. à soupe) | humain |

Après 0015 : **6 lignes** restent non reconnues (`cuil.` ×4, `demi`, `squeeze`).

## 2. Quantités non comprises (`amount` sans `amount_num`, 12 lignes)

| Quantité saisie | Lignes | Recette · ingrédient | Correction proposée | Qui |
|---|---|---|---|---|
| `optional` | 5 | Black bean chili · soured cream, spring onions, avocado, feta cheese, radishes | `optional = true`, quantité vide (la case « optionnel » existe) | 0015 (R2) |
| `to taste` | 3 | Enchiladas · salt, pepper, sugar | quantité vide, unité « to taste » → `unit_code = 'qs'` (quantité suffisante), comme les 4 lignes déjà saisies ainsi | 0015 (R3) |
| `a few shakes` | 1 | Black bean chili · chipotle powder or cayenne | `qs`, ou « 1 pincée » | humain |
| `some` | 1 | Enchiladas · grated cheddar | une quantité réelle (ex. 100 g) ou `qs` | humain |
| `splash` | 1 | Enchiladas · soy sauce | « 1 c. à soupe » ou `qs` | humain |
| `for frying` | 1 | Enchiladas · olive oil | `qs` + mention « pour la cuisson » dans le nom | humain |

Après 0015 : **4 lignes**. Les quantités de type plage (« 2 à 3 », « 2-3 ») ou fraction
(« 1/2 », « ½ ») sont bien comprises (`amount_num` = borne basse) ; le texte `amount` est
conservé pour l'affichage.

## 3. Unité sans quantité (16 lignes)

La plupart sont normales (« au goût », « quelques feuilles », « 1 pincée » implicite). À revoir :

| Recette · ingrédient | Unité | Proposition | Qui |
|---|---|---|---|
| Sauces pour pâtes · feuilles de basilic frais, fromage, fromage râpé, parmesan et/ou pecorino, pignons ou noix de cajou | g | **Quantités manquantes** (5 lignes) : les compléter ; la recette n'a pas non plus de nombre de portions | humain |
| Sauces pour pâtes · saumon fumé | tranches | nombre de tranches à compléter | humain |
| Gâteau de patate douce et gingembre · Poudre à lever | pack | probablement 1 sachet : quantité 1, `unit_code = 'sachet'` | humain |
| Foie gras… · Piment de Cayenne | pincée | quantité 1 (sinon la liste de courses n'additionne rien) | humain |
| Enchiladas · salt / pepper / sugar ; Pizzaladière · filets d'anchois | to taste / au goût | normal (`qs`) | — |
| Black bean chili · avocado | chunks | normal (optionnel, en morceaux) | — |
| Raie au beurre noisette · Persil haché ; Tartare de saumon · Coriandre ; Tarte à la tomate · Basilic | poignée / feuilles | normal | — |

123 ingrédients n'ont ni quantité ni unité (« sel », « poivre », « huile »…) : c'est voulu,
pas de correction.

## 4. Recettes sans étape ou sans ingrédient

**Aucune** dans le snapshot (après 0005 : 0 recette sans section, 0 sans ingrédient, 0 sans
étape).

⚠️ En **prod**, « Carrot cake » a aujourd'hui ses sections « Gâteau » et « Glaçage traditionnel »
**vides** (17 ingrédients disparus le 2026-10-03 à 19 h 48, heure de Paris) : à restaurer, voir
`supabase/BASCULE_PROD.md` (§ « Écarts constatés »). Sections vides restantes dans le snapshot :

| Recette | Section vide | Proposition | Qui |
|---|---|---|---|
| Gaspacho | « Nouvelle section » (étapes) | supprimer (nom par défaut de l'ancien éditeur, jamais remplie) | 0015 (R6) |
| Raviolis aux crevettes et saumon fumé avec bisque maison | « Pour le montage des raviolis » (ingrédients) | ressemble à un titre d'étapes : vérifier s'il manque des ingrédients, sinon supprimer | humain |
| Raviolis Chinois Frits aux Crevettes | « Confectionner les raviolis » (ingrédients) | idem | humain |

## 5. Doublons de titres

| Titre | Recettes | Différences | Proposition | Qui |
|---|---|---|---|---|
| Gâteau de patate douce et gingembre | `d9658c1d…` (créée le 2025-11-10 à 9 h 25, sections « Ingrédients / Préparation ») et `a46b9a94…` (créée 45 min plus tard, sections « (sans titre) / Pour le glaçage / Préparation », modifiée en janvier 2026) | 15 ingrédients et 9 étapes chacune, mais contenus différents (la seconde a un glaçage) ; aucune n'est en favori, au planning ni dans une liste | garder la plus récente (`a46b9a94…`, avec glaçage), supprimer l'autre après comparaison | humain |

Aucun autre doublon (comparaison sans casse, accents ni ponctuation).

## 6. Autres constats

| Constat | Détail | Proposition | Qui |
|---|---|---|---|
| Espaces superflus | 4 ingrédients (« Basilic␣ », « Vinaigre balsamique » quantité « 1␣ », « Feuilles de lasagnes - 1 paquet␣ », « Sauce tomate␣␣1/2 litre… ») et 3 étapes terminées par un espace | supprimés | 0015 (R5) |
| Quantité dans le nom | Lasagnes Épinards et Ricotta · « Feuilles de lasagnes - 1 paquet », « Sauce tomate 1/2 litre (Huile d'Olive, Oignons…) » | « Feuilles de lasagnes » 1 paquet ; « Sauce tomate » 0.5 l (+ la recette de la sauce en note) | humain |
| Nombre de portions absent | Sauces pour pâtes | à renseigner (sinon pas d'ajustement des portions) | humain |
| Étapes répétées dans une même section | Couscous végétarien (« Cuire 20 min. » ×2), Raviolis Chinois Frits (« Faire chauffer la friteuse à 160 degrés » ×2), Reese's (« Mettre le moule au frigidaire… » ×2), Sushi (2 étapes répétées, roulage de plusieurs makis), Taboulé libanais (« Saler et poivrer » ×2) | probablement voulues (étape refaite plus tard) : relire | humain |
| Qualificatifs en anglais dans une recette française | Banana Bread (« bananes, ripe ») | traduire | humain |
| Tags | 5 tags, sans variante de casse ni doublon (végétarien 140, vegan 37, pescétarien 28, 🌶️ 4, sans gluten 1) | — | — |
| JSONB périmé | 32 recettes avaient un JSONB différent de leurs sections (non affiché par le nouveau code) | sans objet après 0013 (colonnes supprimées) ; original gardé dans `recipes_backup_20261003` jusqu'à 0014 | — |

---

## Récapitulatif

**Appliqué par 0015** (si on l'exécute) : 2 plages, 5 « optional », 3 « to taste », 14
qualificatifs, 4 ingrédients + 3 étapes aux espaces superflus, 1 section vide. Identifiants
listés en `NOTICE` et sauvegardés dans `recipe_ingredients_backup_cleanup` (28 lignes : une par
ingrédient et par règle), `instructions_backup_cleanup` (3), `recipe_sections_backup_cleanup` (1).

**À faire par un humain dans l'éditeur** (par ordre d'importance) :

1. Restaurer les 17 ingrédients de « Carrot cake » en prod (script dans `BASCULE_PROD.md`).
2. Choisir entre les deux « Gâteau de patate douce et gingembre ».
3. Sauces pour pâtes : quantités manquantes (6 ingrédients) et nombre de portions.
4. Dips indiens : `cuil.` → c. à café (ou soupe) ×4.
5. Enchiladas : « some », « splash », « for frying », « squeeze » ; Black bean chili : « a few shakes ».
6. Fritters : « 1 » + « demi » sur « jus d'un demi citron ».
7. Lasagnes Épinards et Ricotta : quantités écrites dans les noms.
8. Sections vides des deux recettes de raviolis.
9. Relire les étapes répétées, traduire les qualificatifs anglais (« ripe », « large »…).

## Refaire l'analyse

```sql
-- unités non reconnues
select r.title, ri.name, ri.amount, ri.unit from recipe_ingredients ri join recipes r on r.id = ri.recipe_id
 where ri.unit is not null and ri.unit_code is null order by ri.unit, r.title;
-- quantités non comprises
select r.title, ri.name, ri.amount from recipe_ingredients ri join recipes r on r.id = ri.recipe_id
 where ri.amount is not null and ri.amount_num is null order by ri.amount;
-- unité sans quantité
select r.title, ri.name, ri.unit from recipe_ingredients ri join recipes r on r.id = ri.recipe_id
 where ri.unit is not null and ri.amount is null order by r.title;
-- recettes sans ingrédient / sans étape
select title from recipes r where not exists (select 1 from recipe_ingredients i where i.recipe_id = r.id)
   or not exists (select 1 from instructions i where i.recipe_id = r.id);
-- doublons de titres
select fold_text(title), count(*) from recipes group by 1 having count(*) > 1;
-- sections vides
select r.title, s.name from recipe_sections s join recipes r on r.id = s.recipe_id
 where not exists (select 1 from recipe_ingredients i where i.section_id = s.id)
   and not exists (select 1 from instructions i where i.section_id = s.id);
```
