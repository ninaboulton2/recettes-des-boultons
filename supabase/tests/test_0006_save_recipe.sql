-- Tests 0006 : save_recipe / delete_recipe sous RLS (admin via profiles.role, puis via claim JWT)
begin;

do $$
declare
  v_id uuid; v_id2 uuid; r record; n int; j jsonb;
  admin_id constant uuid := '00000000-0000-0000-0000-00000000000a';
  user_id  constant uuid := '00000000-0000-0000-0000-00000000000b';
  payload jsonb := $j${
    "title": "  Tarte aux pommes ",
    "description": "Classique",
    "category": "desserts et gâteaux",
    "prep_time": 20, "cook_time": 40, "servings": 6,
    "image": "/images/desserts.png",
    "tags": ["végétarien"],
    "notes": "Servir tiède",
    "sections": [
      { "name": "Pâte", "type": "ingredients", "order_index": 0,
        "ingredients": [
          { "name": "Farine", "amount": "250", "unit": "g" },
          { "name": "Beurre", "amount_num": 125, "unit_code": "g" },
          { "name": "Sel", "amount": "1", "unit": "pincée", "optional": true },
          { "name": "Eau", "amount": "1/2", "unit": "verre" }
        ] },
      { "name": "Garniture", "type": "ingredients",
        "ingredients": [ { "name": "Pommes", "amount": "4", "unit": "" } ] },
      { "name": "Préparation", "type": "instructions",
        "instructions": [ { "content": "Préparer la pâte." }, "Garnir de pommes.", { "content": "   " }, { "content": "Cuire 40 min." } ] }
    ]
  }$j$;
begin
  -- ---------------------------------------------------------------- anon : refusé (pas de grant)
  perform tests.login(user_id, 'anon');
  begin
    perform public.save_recipe(payload);
    raise exception 'anon a pu appeler save_recipe';
  exception when insufficient_privilege then null;
  end;
  perform tests.logout();

  -- ---------------------------------------------------------------- user : refusé par RLS
  perform tests.login(user_id, 'authenticated');
  begin
    perform public.save_recipe(payload);
    raise exception 'un simple utilisateur a pu créer une recette';
  exception when insufficient_privilege then
    assert sqlerrm = 'Action réservée aux administrateurs', sqlerrm;
  end;
  perform tests.logout();

  -- ---------------------------------------------------------------- admin (repli profiles.role, pas de claim)
  perform tests.login(admin_id, 'authenticated');

  -- validations
  begin
    perform public.save_recipe(payload - 'title');
    raise exception 'titre manquant accepté';
  exception when others then assert sqlerrm = 'Le titre de la recette est obligatoire', sqlerrm; end;
  begin
    perform public.save_recipe(payload || '{"category": "  "}');
    raise exception 'catégorie vide acceptée';
  exception when others then assert sqlerrm = 'La catégorie de la recette est obligatoire', sqlerrm; end;
  begin
    perform public.save_recipe(payload || '{"sections": [{"type": "foo"}]}');
    raise exception 'type de section invalide accepté';
  exception when others then assert sqlerrm like 'Type de section invalide%', sqlerrm; end;
  begin
    perform public.save_recipe(payload || '{"sections": [{"ingredients": [{"name": "x", "unit_code": "parsec"}]}]}');
    raise exception 'unité inconnue acceptée';
  exception when others then assert sqlerrm like 'Unité inconnue%', sqlerrm; end;
  begin
    perform public.save_recipe(payload || '{"sections": [{"ingredients": [{"amount": "1"}]}]}');
    raise exception 'ingrédient sans nom accepté';
  exception when others then assert sqlerrm like '%n''a pas de nom', sqlerrm; end;
  begin
    perform public.save_recipe(payload || '{"id": "pas-un-uuid"}');
    raise exception 'uuid invalide accepté';
  exception when others then assert sqlerrm like 'Valeur invalide%', sqlerrm; end;

  -- création
  v_id := public.save_recipe(payload);
  assert v_id is not null;
  select * into r from public.recipes where id = v_id;
  assert r.title = 'Tarte aux pommes', 'titre trimé';
  assert r.tags = array['végétarien'] and r.servings = 6 and r.notes = 'Servir tiède';

  assert (select count(*) from public.recipe_sections where recipe_id = v_id) = 3;
  assert (select count(*) from public.recipe_ingredients where recipe_id = v_id) = 5;
  assert (select count(*) from public.instructions where recipe_id = v_id) = 3, 'instruction vide ignorée';
  -- order_index par défaut = position
  assert (select order_index from public.recipe_sections where recipe_id = v_id and name = 'Garniture') = 1;
  assert (select order_index from public.recipe_sections where recipe_id = v_id and name = 'Préparation') = 2;
  assert (select content from public.instructions where recipe_id = v_id and order_index = 2) = 'Cuire 40 min.';
  -- dérivations
  assert (select amount_num = 250 and unit_code = 'g' from public.recipe_ingredients where recipe_id = v_id and name = 'Farine');
  assert (select amount = '125' and unit = 'g' and amount_num = 125 from public.recipe_ingredients where recipe_id = v_id and name = 'Beurre'), 'amount/unit dérivés de amount_num/unit_code';
  assert (select optional and unit_code = 'pincee' from public.recipe_ingredients where recipe_id = v_id and name = 'Sel');
  assert (select amount_num = 0.5 and unit_code = 'verre' from public.recipe_ingredients where recipe_id = v_id and name = 'Eau');
  assert (select unit is null and unit_code is null from public.recipe_ingredients where recipe_id = v_id and name = 'Pommes'), 'unit vide → NULL';

  -- JSONB legacy recalculé, format prod : [{name, unit, amount}] (+ optional si vrai), instructions = [string]
  assert jsonb_typeof(r.ingredients) = 'array' and jsonb_array_length(r.ingredients) = 5;
  assert r.ingredients -> 0 = '{"name":"Farine","unit":"g","amount":250}'::jsonb, (r.ingredients -> 0)::text;
  assert r.ingredients -> 1 = '{"name":"Beurre","unit":"g","amount":125}'::jsonb, (r.ingredients -> 1)::text;
  assert r.ingredients -> 2 = '{"name":"Sel","unit":"pincée","amount":1,"optional":true}'::jsonb, (r.ingredients -> 2)::text;
  assert r.ingredients -> 3 ->> 'amount' = '0.5';
  assert r.ingredients -> 4 = '{"name":"Pommes","unit":"","amount":4}'::jsonb, (r.ingredients -> 4)::text;
  assert r.instructions = '["Préparer la pâte.","Garnir de pommes.","Cuire 40 min."]'::jsonb, r.instructions::text;
  -- Un montant non numérique est conservé en chaîne dans le JSONB
  v_id2 := public.save_recipe('{"title":"T2","category":"plats","sections":[{"ingredients":[{"name":"Sel","amount":"au goût"}]}]}');
  assert (select ingredients -> 0 from public.recipes where id = v_id2) = '{"name":"Sel","unit":"","amount":"au goût"}'::jsonb;
  -- Sans ingrédient : JSONB = []
  v_id2 := public.save_recipe('{"title":"T3","category":"plats"}');
  assert (select ingredients = '[]'::jsonb and instructions = '[]'::jsonb from public.recipes where id = v_id2);

  -- mise à jour : remplacement complet, même id
  v_id2 := public.save_recipe(payload || jsonb_build_object('id', v_id, 'title', 'Tarte fine aux pommes',
             'sections', '[{"name":"Tout","type":"mixed","ingredients":[{"name":"Pommes","amount":"6"}],"instructions":["Cuire."]}]'::jsonb));
  assert v_id2 = v_id, 'upsert doit garder l''id';
  assert (select title from public.recipes where id = v_id) = 'Tarte fine aux pommes';
  assert (select count(*) from public.recipe_sections where recipe_id = v_id) = 1;
  assert (select count(*) from public.recipe_ingredients where recipe_id = v_id) = 1;
  assert (select count(*) from public.instructions where recipe_id = v_id) = 1;
  assert (select ingredients from public.recipes where id = v_id) = '[{"name":"Pommes","unit":"","amount":6}]'::jsonb;
  -- aucun orphelin créé
  assert (select count(*) from public.recipe_ingredients where recipe_id = v_id and section_id is null) = 0;

  -- id fourni mais inexistant → création avec cet id
  v_id2 := public.save_recipe('{"id":"77777777-7777-7777-7777-777777777777","title":"Nouvelle","category":"soupes"}');
  assert v_id2 = '77777777-7777-7777-7777-777777777777';

  -- re-sauvegarde d'une recette migrée par 0005 : JSONB identique au contenu de la section
  v_id2 := public.save_recipe(jsonb_build_object('id', '10000000-0000-0000-0000-000000000001', 'title', 'Gâteau au yaourt', 'category', 'desserts et gâteaux',
             'sections', (select jsonb_agg(jsonb_build_object('name', s.name, 'type', s.type, 'order_index', s.order_index,
                 'ingredients', (select jsonb_agg(jsonb_build_object('name', i.name, 'amount', i.amount, 'unit', i.unit, 'optional', i.optional, 'order_index', i.order_index) order by i.order_index) from public.recipe_ingredients i where i.section_id = s.id),
                 'instructions', (select jsonb_agg(jsonb_build_object('content', x.content, 'order_index', x.order_index) order by x.order_index) from public.instructions x where x.section_id = s.id)))
               from public.recipe_sections s where s.recipe_id = '10000000-0000-0000-0000-000000000001')));
  select ingredients into j from public.recipes where id = '10000000-0000-0000-0000-000000000001';
  assert jsonb_array_length(j) = 8 and j -> 1 = '{"name":"Farine","unit":"g","amount":225}'::jsonb, j::text;
  assert j -> 7 = '{"name":"Extrait de vanille","unit":"","amount":null}'::jsonb, (j -> 7)::text;

  -- delete_recipe
  begin
    perform public.delete_recipe('00000000-0000-0000-0000-000000000000');
    raise exception 'suppression d''une recette inexistante acceptée';
  exception when no_data_found then null; end;
  perform public.delete_recipe(v_id);
  assert not exists (select 1 from public.recipes where id = v_id);
  assert not exists (select 1 from public.recipe_sections where recipe_id = v_id), 'cascade sections';
  perform tests.logout();

  -- ---------------------------------------------------------------- user : delete refusé
  perform tests.login(user_id, 'authenticated');
  begin
    perform public.delete_recipe('10000000-0000-0000-0000-000000000003');
    raise exception 'un utilisateur a pu supprimer une recette';
  exception when no_data_found then null; end;
  assert exists (select 1 from public.recipes where id = '10000000-0000-0000-0000-000000000003');
  perform tests.logout();

  -- ---------------------------------------------------------------- admin via claim JWT uniquement (profil user)
  perform tests.login(user_id, 'authenticated', '{"user_role":"admin"}');
  v_id := public.save_recipe('{"title":"Via claim","category":"plats"}');
  assert v_id is not null;
  perform tests.logout();

  raise notice '[test 0006] OK';
end $$;

rollback;
