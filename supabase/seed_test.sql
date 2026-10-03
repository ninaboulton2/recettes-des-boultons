-- ============================================================================
--  Données JETABLES pour les tests locaux (jamais en production)
-- ============================================================================
--  Chargé par tests/run_local.sh APRÈS 0001/0002 et AVANT 0003, pour imiter
--  l'état réel de la prod (anonymisé, inspiré des lectures du 2026-10-03) :
--    - R1, R2, R5, R6 : recettes SANS section, contenu dans le JSONB legacy,
--      avec des lignes recipe_ingredients « orphelines » (section_id null)
--      dupliquant le JSONB (comme 889 lignes en prod) ; R6 sans orphelin
--      (1 cas en prod).
--    - R3 : recette AVEC sections, JSONB vide (comme 23 recettes en prod).
--    - R4 : recette AVEC sections mais JSONB périmé + 11 orphelins + 1
--      instruction orpheline (comme 20 recettes en prod).
--    - Unités variées (FR/EN, casse, accents, pluriels, non reconnues),
--      montants « 1/2 », « 1,5 », « 2-3 », « 1 1/2 », « 2 à 3 », « ½ »,
--      texte non numérique.
--    - 3 utilisateurs (1 admin, 2 users), listes de courses, favoris, planning.
-- ============================================================================
set search_path = public, extensions;

-- Utilisateurs (le trigger handle_new_user crée les profils) -----------------
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000000a', 'admin@test.local', '{"name":"Admin Test","role":"admin"}'),
  ('00000000-0000-0000-0000-00000000000b', 'user-b@test.local', '{"name":"User B"}'),
  ('00000000-0000-0000-0000-00000000000c', 'user-c@test.local', '{"name":"User C"}')
on conflict (id) do nothing;

-- R1 : sans section, JSONB numérique « classique » ----------------------------
insert into recipes (id, title, description, category, ingredients, instructions, prep_time, cook_time, servings, image, tags, notes) values (
  '10000000-0000-0000-0000-000000000001', 'Gâteau au yaourt', 'Le gâteau du goûter, moelleux et simple.', 'desserts et gâteaux',
  '[{"name":"Yaourt nature","unit":"pot","amount":1},
    {"name":"Farine","unit":"g","amount":225},
    {"name":"Sucre","unit":"g","amount":150},
    {"name":"Oeufs","unit":"unit","amount":3},
    {"name":"Huile","unit":"CàS","amount":2},
    {"name":"Levure chimique","unit":"sachets","amount":1},
    {"name":"Sel","unit":"pincée","amount":1},
    {"name":"Extrait de vanille","unit":"","amount":0}]'::jsonb,
  '["Préchauffer le four à 180°C.","Mélanger le yaourt, le sucre et les oeufs.","Ajouter la farine, la levure, le sel puis l''huile.","Cuire 35 minutes."]'::jsonb,
  15, 35, 6, '/images/desserts.png', array['végétarien'], null);

insert into recipe_ingredients (recipe_id, section_id, name, amount, unit, optional, order_index) values
  ('10000000-0000-0000-0000-000000000001', null, 'Yaourt nature', '1', 'pot', false, 0),
  ('10000000-0000-0000-0000-000000000001', null, 'Farine', '225', 'g', false, 1),
  ('10000000-0000-0000-0000-000000000001', null, 'Sucre', '150', 'g', false, 2),
  ('10000000-0000-0000-0000-000000000001', null, 'Oeufs', '3', 'unit', false, 3),
  ('10000000-0000-0000-0000-000000000001', null, 'Huile', '2', 'CàS', false, 4),
  ('10000000-0000-0000-0000-000000000001', null, 'Levure chimique', '1', 'sachets', false, 5),
  ('10000000-0000-0000-0000-000000000001', null, 'Sel', '1', 'pincée', false, 6),
  ('10000000-0000-0000-0000-000000000001', null, 'Extrait de vanille', null, null, false, 7);

-- R2 : sans section, unités anglaises + montants texte ------------------------
insert into recipes (id, title, description, category, ingredients, instructions, prep_time, cook_time, servings, image, tags) values (
  '10000000-0000-0000-0000-000000000002', 'Fried rice', 'Riz sauté express.', 'plats',
  '[{"name":"Oil for frying","unit":"tbsp","amount":1},
    {"name":"Beaten egg","unit":"unit","amount":1},
    {"name":"Chopped mushrooms","unit":"handful","amount":1},
    {"name":"Crushed garlic","unit":"cloves","amount":2},
    {"name":"Grated ginger","unit":"piece","amount":1},
    {"name":"Cooked basmati rice","unit":"cups","amount":2},
    {"name":"Soy sauce","unit":"","amount":"splash"},
    {"name":"Salt","unit":"","amount":"to taste"}]'::jsonb,
  '["Heat the oil, tip in the egg.","Add the vegetables and fry.","Add the rice and soy sauce, stir."]'::jsonb,
  10, 10, 2, '/images/plats.png', array['végétarien','🌶️']);

insert into recipe_ingredients (recipe_id, section_id, name, amount, unit, optional, order_index) values
  ('10000000-0000-0000-0000-000000000002', null, 'Oil for frying', '1', 'tbsp', false, 0),
  ('10000000-0000-0000-0000-000000000002', null, 'Beaten egg', '1', 'unit', false, 1),
  ('10000000-0000-0000-0000-000000000002', null, 'Chopped mushrooms', '1', 'handful', false, 2),
  ('10000000-0000-0000-0000-000000000002', null, 'Crushed garlic', '2', 'cloves', false, 3),
  ('10000000-0000-0000-0000-000000000002', null, 'Grated ginger', '1', 'piece', false, 4),
  ('10000000-0000-0000-0000-000000000002', null, 'Cooked basmati rice', '2', 'cups', false, 5),
  ('10000000-0000-0000-0000-000000000002', null, 'Soy sauce', 'splash', null, false, 6),
  ('10000000-0000-0000-0000-000000000002', null, 'Salt', 'to taste', null, false, 7);

-- R3 : avec sections, JSONB vide ----------------------------------------------
insert into recipes (id, title, description, category, ingredients, instructions, prep_time, cook_time, servings, image, tags) values (
  '10000000-0000-0000-0000-000000000003', 'Carrot cake', 'Gâteau aux carottes et glaçage.', 'desserts et gâteaux',
  '[]'::jsonb, '[]'::jsonb, 30, 25, 8, '/images/desserts.png', array['végétarien']);

insert into recipe_sections (id, recipe_id, name, type, order_index) values
  ('30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000003', 'Gâteau', 'ingredients', 0),
  ('30000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000003', 'Glaçage', 'ingredients', 1),
  ('30000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000003', 'Gâteau', 'instructions', 2),
  ('30000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000003', 'Glaçage', 'instructions', 3);

insert into recipe_ingredients (recipe_id, section_id, name, amount, unit, optional, order_index) values
  ('10000000-0000-0000-0000-000000000003', '30000000-0000-0000-0000-000000000001', 'Noix de pécan', '150', 'g', false, 0),
  ('10000000-0000-0000-0000-000000000003', '30000000-0000-0000-0000-000000000001', 'Carottes râpées', '300', 'g', false, 1),
  ('10000000-0000-0000-0000-000000000003', '30000000-0000-0000-0000-000000000001', 'Farine T55', '200', 'g', false, 2),
  ('10000000-0000-0000-0000-000000000003', '30000000-0000-0000-0000-000000000001', 'Oeufs', '3', null, false, 3),
  ('10000000-0000-0000-0000-000000000003', '30000000-0000-0000-0000-000000000001', 'Cannelle en poudre', '1', 'CàS', false, 4),
  ('10000000-0000-0000-0000-000000000003', '30000000-0000-0000-0000-000000000001', 'Noix hachées', '50', 'g', true, 5),
  ('10000000-0000-0000-0000-000000000003', '30000000-0000-0000-0000-000000000002', 'Philadelphia', '150', 'g', false, 0),
  ('10000000-0000-0000-0000-000000000003', '30000000-0000-0000-0000-000000000002', 'Crème fraîche', '2', 'càs', false, 1),
  ('10000000-0000-0000-0000-000000000003', '30000000-0000-0000-0000-000000000002', 'Extrait de vanille liquide', '1', 'càc', false, 2);

insert into instructions (recipe_id, section_id, content, order_index) values
  ('10000000-0000-0000-0000-000000000003', '30000000-0000-0000-0000-000000000003', 'Préchauffer le four à 150°.', 0),
  ('10000000-0000-0000-0000-000000000003', '30000000-0000-0000-0000-000000000003', 'Mélanger les ingrédients secs puis ajouter le reste.', 1),
  ('10000000-0000-0000-0000-000000000003', '30000000-0000-0000-0000-000000000003', 'Cuire 25 minutes.', 2),
  ('10000000-0000-0000-0000-000000000003', '30000000-0000-0000-0000-000000000004', 'Mixer tous les ingrédients du glaçage.', 0);

-- R4 : avec sections, JSONB périmé, 11 orphelins + 1 instruction orpheline -----
insert into recipes (id, title, description, category, ingredients, instructions, prep_time, cook_time, servings, image, tags) values (
  '10000000-0000-0000-0000-000000000004', 'Baba ganoush', 'Caviar d''aubergine.', 'entrees',
  '[{"name":"Aubergines","unit":"unités","amount":2},{"name":"Tahini","unit":"CàS","amount":2},{"name":"Ail","unit":"gousse","amount":1},
    {"name":"Citron","unit":"unité","amount":1},{"name":"Huile d''olive","unit":"CàS","amount":3},{"name":"Cumin","unit":"CàC","amount":1},
    {"name":"Sel","unit":"pincée","amount":1},{"name":"Poivre","unit":"pincée","amount":1},{"name":"Paprika","unit":"CàC","amount":0.5},
    {"name":"Persil","unit":"bouquet","amount":1},{"name":"Grenade","unit":"unité","amount":0.5}]'::jsonb,
  '["Griller les aubergines.","Mixer avec le reste."]'::jsonb, 15, 40, 4, '/images/entrees,salades,pains,accompagnements.png', array['vegan','végétarien']);

insert into recipe_sections (id, recipe_id, name, type, order_index) values
  ('40000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000004', 'Ingrédients', 'ingredients', 0),
  ('40000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000004', 'Préparation', 'instructions', 1);

insert into recipe_ingredients (recipe_id, section_id, name, amount, unit, optional, order_index) values
  ('10000000-0000-0000-0000-000000000004', '40000000-0000-0000-0000-000000000001', 'Aubergines', '2', 'unités', false, 0),
  ('10000000-0000-0000-0000-000000000004', '40000000-0000-0000-0000-000000000001', 'Tahini', '2', 'CàS', false, 1),
  -- 11 orphelins = copie du JSONB
  ('10000000-0000-0000-0000-000000000004', null, 'Aubergines', '2', 'unités', false, 0),
  ('10000000-0000-0000-0000-000000000004', null, 'Tahini', '2', 'CàS', false, 1),
  ('10000000-0000-0000-0000-000000000004', null, 'Ail', '1', 'gousse', false, 2),
  ('10000000-0000-0000-0000-000000000004', null, 'Citron', '1', 'unité', false, 3),
  ('10000000-0000-0000-0000-000000000004', null, 'Huile d''olive', '3', 'CàS', false, 4),
  ('10000000-0000-0000-0000-000000000004', null, 'Cumin', '1', 'CàC', false, 5),
  ('10000000-0000-0000-0000-000000000004', null, 'Sel', '1', 'pincée', false, 6),
  ('10000000-0000-0000-0000-000000000004', null, 'Poivre', '1', 'pincée', false, 7),
  ('10000000-0000-0000-0000-000000000004', null, 'Paprika', '0.5', 'CàC', false, 8),
  ('10000000-0000-0000-0000-000000000004', null, 'Persil', '1', 'bouquet', false, 9),
  ('10000000-0000-0000-0000-000000000004', null, 'Grenade', '0.5', 'unité', false, 10);

insert into instructions (recipe_id, section_id, content, order_index) values
  ('10000000-0000-0000-0000-000000000004', '40000000-0000-0000-0000-000000000002', 'Griller les aubergines 40 minutes.', 0),
  ('10000000-0000-0000-0000-000000000004', '40000000-0000-0000-0000-000000000002', 'Récupérer la chair, mixer avec le reste.', 1),
  ('10000000-0000-0000-0000-000000000004', null, 'Servir frais.', 2);

-- R5 : sans section, montants « exotiques » et unités variées ------------------
insert into recipes (id, title, description, category, ingredients, instructions, prep_time, cook_time, servings, image, tags) values (
  '10000000-0000-0000-0000-000000000005', 'Soupe de poissons', 'Soupe de poissons de roche.', 'soupes',
  '[{"name":"Poissons de roche","unit":"Kg","amount":"1,5"},
    {"name":"Oignon","unit":"petite","amount":"1/2"},
    {"name":"Tomates","unit":"pièces","amount":"2-3"},
    {"name":"Ail","unit":"gousses","amount":"2 à 3"},
    {"name":"Huile d''olive","unit":"cuil. à soupe","amount":"1 1/2"},
    {"name":"Concentré de tomate","unit":"c.à.s","amount":"½"},
    {"name":"Vin blanc","unit":"cl","amount":"20"},
    {"name":"Eau","unit":"L","amount":"1.5"},
    {"name":"Persil","unit":"botte","amount":"1"},
    {"name":"Laurier","unit":"feuilles","amount":"2"},
    {"name":"Pain","unit":"tranches","amount":"4"},
    {"name":"Gingembre","unit":"cube de 2cm","amount":"1"},
    {"name":"Safran","unit":"quantité suffisante","amount":"optional"},
    {"name":"Piment","unit":"cuil.","amount":"1"}]'::jsonb,
  '["Faire revenir l''oignon et l''ail.","Ajouter les poissons, les tomates, le vin, l''eau.","Cuire 40 minutes puis passer au moulin."]'::jsonb,
  30, 45, 6, '/images/soupes.png', array['pescétarien']);

insert into recipe_ingredients (recipe_id, section_id, name, amount, unit, optional, order_index) values
  ('10000000-0000-0000-0000-000000000005', null, 'Poissons de roche', '1,5', 'Kg', false, 0),
  ('10000000-0000-0000-0000-000000000005', null, 'Oignon', '1/2', 'petite', false, 1),
  ('10000000-0000-0000-0000-000000000005', null, 'Tomates', '2-3', 'pièces', false, 2),
  ('10000000-0000-0000-0000-000000000005', null, 'Ail', '2 à 3', 'gousses', false, 3),
  ('10000000-0000-0000-0000-000000000005', null, 'Huile d''olive', '1 1/2', 'cuil. à soupe', false, 4),
  ('10000000-0000-0000-0000-000000000005', null, 'Concentré de tomate', '½', 'c.à.s', false, 5),
  ('10000000-0000-0000-0000-000000000005', null, 'Vin blanc', '20', 'cl', false, 6),
  ('10000000-0000-0000-0000-000000000005', null, 'Eau', '1.5', 'L', false, 7),
  ('10000000-0000-0000-0000-000000000005', null, 'Persil', '1', 'botte', false, 8),
  ('10000000-0000-0000-0000-000000000005', null, 'Laurier', '2', 'feuilles', false, 9),
  ('10000000-0000-0000-0000-000000000005', null, 'Pain', '4', 'tranches', false, 10),
  ('10000000-0000-0000-0000-000000000005', null, 'Gingembre', '1', 'cube de 2cm', false, 11),
  ('10000000-0000-0000-0000-000000000005', null, 'Safran', 'optional', 'quantité suffisante', false, 12),
  ('10000000-0000-0000-0000-000000000005', null, 'Piment', '1', 'cuil.', false, 13);

-- R6 : sans section, JSONB sans aucun orphelin (1 cas en prod) -----------------
insert into recipes (id, title, description, category, ingredients, instructions, prep_time, cook_time, servings, image, tags) values (
  '10000000-0000-0000-0000-000000000006', 'Bouchées de tofu au four', 'Tofu croustillant.', 'plats',
  '[{"name":"Tofu ferme","unit":"g","amount":700},{"name":"Levure maltée","unit":"g","amount":60},{"name":"Sauce soja","unit":"ml","amount":30}]'::jsonb,
  '["Préchauffer le four à 190°C.","Enrober le tofu.","Cuire 30 minutes."]'::jsonb,
  10, 30, 4, '/images/plats.png', array['vegan']);

-- Listes de courses ---------------------------------------------------------
insert into shopping_lists (id, user_id, name) values
  ('50000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-00000000000b', 'Liste principale'),
  ('50000000-0000-0000-0000-00000000000c', '00000000-0000-0000-0000-00000000000c', 'Liste principale');

insert into shopping_items (list_id, name, amount, unit, recipe_id, is_checked) values
  ('50000000-0000-0000-0000-00000000000b', 'Farine', '225', 'g', '10000000-0000-0000-0000-000000000001', false),
  ('50000000-0000-0000-0000-00000000000b', 'Salt', '1', 'pinch', '10000000-0000-0000-0000-000000000002', false),
  ('50000000-0000-0000-0000-00000000000b', 'Mixed spice', '0.5', 'teaspoon', null, false),
  ('50000000-0000-0000-0000-00000000000b', 'oeufs entiers', '9', 'unités', null, true),
  ('50000000-0000-0000-0000-00000000000b', 'Mayonnaise', '1', '', null, false),
  ('50000000-0000-0000-0000-00000000000c', 'Halloumi', '1', '', null, false);

-- Favoris / planning --------------------------------------------------------
insert into favorites (user_id, recipe_id) values
  ('00000000-0000-0000-0000-00000000000b', '10000000-0000-0000-0000-000000000001');
insert into planning (user_id, date_string, meal_type, recipe_id) values
  ('00000000-0000-0000-0000-00000000000b', '2026-10-04', 'dinner', '10000000-0000-0000-0000-000000000002');
