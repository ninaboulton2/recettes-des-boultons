-- Tests 0013 : colonnes JSONB supprimées, orpheline rattachée, save_recipe /
-- search_recipes sans JSONB (données : seed_test.sql, après 0013 → 0015)
begin;

do $$
declare
  v_id uuid; v_id2 uuid; r record;
  admin_id constant uuid := '00000000-0000-0000-0000-00000000000a';
  user_id  constant uuid := '00000000-0000-0000-0000-00000000000b';
  payload jsonb := $j${
    "title": "  Tarte aux pommes ", "category": "desserts et gâteaux", "servings": 6,
    "photo_path": "x/cover.webp", "tags": ["végétarien"],
    "sections": [
      { "name": "Pâte", "type": "ingredients",
        "ingredients": [ { "name": "Farine", "amount": "250", "unit": "g" },
                         { "name": "Sel", "amount": "au goût", "optional": true } ] },
      { "name": "Préparation", "type": "instructions",
        "instructions": [ "Préparer la pâte.", { "content": "  " }, { "content": "Cuire 40 min." } ] }
    ]
  }$j$;
begin
  -- ------------------------------------------------------------ schéma
  assert not exists (select 1 from information_schema.columns
                      where table_schema = 'public' and table_name = 'recipes'
                        and column_name in ('ingredients', 'instructions')), 'colonnes JSONB encore présentes';
  assert exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'recipe_ingredients' and column_name = 'amount'),
    'recipe_ingredients.amount doit être conservée';
  assert position('ingredients' in pg_get_function_result('public.search_recipes(text, text, text[], int, int)'::regprocedure)) = 0,
    'search_recipes renvoie encore ingredients';
  assert position('photo_path' in pg_get_function_result('public.search_recipes(text, text, text[], int, int)'::regprocedure)) > 0;
  assert position('jsonb_agg' in pg_get_functiondef('public.save_recipe(jsonb)'::regprocedure)) = 0,
    'save_recipe recalcule encore le JSONB';

  -- ------------------------------------------------------------ orphelines
  assert (select count(*) from public.instructions where section_id is null) = 0, 'orpheline restante';
  -- seed : « Servir frais. » (R4, sans équivalent) → rattachée en fin de « Préparation »
  select * into r from public.instructions where recipe_id = '10000000-0000-0000-0000-000000000004' and content = 'Servir frais.';
  assert r.section_id = '40000000-0000-0000-0000-000000000002' and r.order_index = 2,
    format('rattachement : section %s, rang %s', r.section_id, r.order_index);
  assert (select count(*) from public.instructions where recipe_id = '10000000-0000-0000-0000-000000000004') = 3;

  -- ------------------------------------------------------------ search_recipes (anon)
  perform tests.login(user_id, 'anon');
  assert (select count(*) from public.search_recipes('gateau')) = 2, 'recherche gateau';
  perform id, title, description, category, prep_time, cook_time, servings, image, photo_path, notes, tags,
          created_at, updated_at, total_count from public.search_recipes('tofu');
  begin
    perform ingredients from public.search_recipes('tofu');
    raise exception 'search_recipes expose encore ingredients';
  exception when undefined_column then null; end;
  perform tests.logout();

  -- ------------------------------------------------------------ save_recipe
  perform tests.login(user_id, 'anon');
  begin
    perform public.save_recipe(payload);
    raise exception 'anon a pu appeler save_recipe';
  exception when insufficient_privilege then null; end;
  perform tests.logout();

  perform tests.login(user_id, 'authenticated');
  begin
    perform public.save_recipe(payload);
    raise exception 'un simple utilisateur a pu créer une recette';
  exception when insufficient_privilege then
    assert sqlerrm = 'Action réservée aux administrateurs', sqlerrm;
  end;
  perform tests.logout();

  perform tests.login(admin_id, 'authenticated');
  begin
    perform public.save_recipe(payload - 'title');
    raise exception 'titre manquant accepté';
  exception when others then assert sqlerrm = 'Le titre de la recette est obligatoire', sqlerrm; end;
  begin
    perform public.save_recipe(payload || '{"sections": [{"ingredients": [{"name": "x", "unit_code": "parsec"}]}]}');
    raise exception 'unité inconnue acceptée';
  exception when others then assert sqlerrm like 'Unité inconnue%', sqlerrm; end;

  v_id := public.save_recipe(payload);
  select * into r from public.recipes where id = v_id;
  assert r.title = 'Tarte aux pommes' and r.photo_path = 'x/cover.webp' and r.servings = 6, 'création';
  assert (select count(*) from public.recipe_sections where recipe_id = v_id) = 2;
  assert (select count(*) from public.recipe_ingredients where recipe_id = v_id) = 2;
  assert (select count(*) from public.instructions where recipe_id = v_id) = 2, 'instruction vide ignorée';
  assert (select amount_num = 250 and unit_code = 'g' from public.recipe_ingredients where recipe_id = v_id and name = 'Farine');
  assert (select amount = 'au goût' and amount_num is null and optional from public.recipe_ingredients where recipe_id = v_id and name = 'Sel'),
    'amount texte conservé';

  -- mise à jour : remplacement complet, photo retirée si absente
  v_id2 := public.save_recipe((payload - 'photo_path') || jsonb_build_object('id', v_id,
             'sections', '[{"name":"Tout","type":"mixed","ingredients":[{"name":"Pommes","amount":"6"}],"instructions":["Cuire."]}]'::jsonb));
  assert v_id2 = v_id;
  assert (select photo_path is null from public.recipes where id = v_id), 'photo retirée';
  assert (select count(*) from public.recipe_sections where recipe_id = v_id) = 1;
  assert (select count(*) from public.recipe_ingredients where recipe_id = v_id) = 1;

  -- recette sans section : acceptée (l'éditeur l'interdit, la RPC non)
  v_id2 := public.save_recipe('{"title":"Vide","category":"plats"}');
  assert v_id2 is not null;

  perform public.delete_recipe(v_id);
  assert not exists (select 1 from public.recipes where id = v_id);
  perform tests.logout();

  -- admin via claim JWT
  perform tests.login(user_id, 'authenticated', '{"user_role":"admin"}');
  assert public.save_recipe('{"title":"Via claim","category":"plats"}') is not null;
  perform tests.logout();

  raise notice '[test 0013] OK';
end $$;

rollback;
