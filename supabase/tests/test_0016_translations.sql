-- Tests 0016 : recettes bilingues (recipes.lang, recipe_translations, save_recipe,
-- save_recipe_translation, search_recipes, add_recipe_to_list, units.abbr_en).
-- Données : seed_test.sql, après 0013 → 0016. Transaction annulée à la fin.
begin;

do $$
declare
  v_id uuid; v_id2 uuid; r record; n int; v_item record; v_list uuid;
  admin_id constant uuid := '00000000-0000-0000-0000-00000000000a';
  user_id  constant uuid := '00000000-0000-0000-0000-00000000000b';
  tr jsonb := $j${
    "title": "Apple pie", "description": "A classic.", "notes": "Serve warm.", "tags": ["vegetarian"],
    "source_hash": "h1", "model": "mock",
    "content": { "sections": [
      { "name": "Dough", "ingredients": [ { "name": "flour", "amount": null, "unit": null },
                                          { "name": "salt", "amount": "to taste", "unit": null } ],
        "instructions": [] },
      { "name": "Method", "ingredients": [], "instructions": ["Make the dough.", "Bake 40 min."] } ] }
  }$j$;
  payload jsonb := $j${
    "title": "Tarte aux pommes", "category": "desserts et gâteaux", "servings": 6, "lang": "fr",
    "sections": [
      { "name": "Pâte", "type": "ingredients",
        "ingredients": [ { "name": "farine", "amount": "250", "unit": "g" },
                         { "name": "sel", "amount": "au goût", "optional": true } ] },
      { "name": "Préparation", "type": "instructions",
        "instructions": [ "Préparer la pâte.", "Cuire 40 min." ] }
    ]
  }$j$;
begin
  -- ------------------------------------------------------------ schéma
  assert exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'recipes' and column_name = 'lang');
  assert (select count(*) from public.recipes where lang <> 'fr') = 0, 'les recettes existantes sont en fr';
  assert not exists (select 1 from public.units where abbr_en is null);
  assert (select abbr_en from public.units where code = 'cas') = 'tbsp';
  assert (select relrowsecurity from pg_class where oid = 'public.recipe_translations'::regclass);
  assert position('translation' in pg_get_function_result('public.search_recipes(text, text, text[], int, int)'::regprocedure)) > 0;

  -- ------------------------------------------------------------ droits : non-admin
  perform tests.login(user_id, 'authenticated');
  begin
    perform public.save_recipe_translation('10000000-0000-0000-0000-000000000004', 'fr', tr);
    raise exception 'un utilisateur a pu écrire une traduction';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.recipe_translations (recipe_id, locale, title, source_hash)
    values ('10000000-0000-0000-0000-000000000004', 'en', 'x', 'h');
    raise exception 'insert direct accepté pour un utilisateur';
  exception when insufficient_privilege then null; end;
  perform tests.logout();

  perform tests.login(user_id, 'anon');
  begin
    perform public.save_recipe_translation('10000000-0000-0000-0000-000000000004', 'fr', tr);
    raise exception 'anon a pu appeler save_recipe_translation';
  exception when insufficient_privilege then null; end;
  perform tests.logout();

  -- ------------------------------------------------------------ création avec traduction (une transaction)
  perform tests.login(admin_id, 'authenticated');
  v_id := public.save_recipe(payload || jsonb_build_object('translation', tr));
  select * into r from public.recipes where id = v_id;
  assert r.lang = 'fr', 'lang posée';
  select count(*) into n from public.recipe_translations where recipe_id = v_id;
  assert n = 1, 'une traduction attendue';
  assert (select locale = 'en' and title = 'Apple pie' and not stale and source_hash = 'h1' and tags = array['vegetarian']
            from public.recipe_translations where recipe_id = v_id), 'traduction écrite vers en';

  -- traduction invalide : toute la transaction est annulée (savepoint implicite du bloc)
  begin
    perform public.save_recipe(payload || jsonb_build_object('title', 'Atomique', 'translation', tr - 'title'));
    raise exception 'traduction sans titre acceptée';
  exception when others then assert sqlerrm like 'Le titre traduit%', sqlerrm; end;
  assert not exists (select 1 from public.recipes where title = 'Atomique'), 'recette créée malgré la traduction invalide';

  -- ------------------------------------------------------------ save_recipe sans traduction : périmée, positions conservées
  v_id2 := public.save_recipe((payload - 'lang') || jsonb_build_object('id', v_id, 'title', 'Tarte aux pommes 2'));
  assert v_id2 = v_id;
  assert (select stale from public.recipe_translations where recipe_id = v_id and locale = 'en'), 'traduction non marquée périmée';
  assert (select lang from public.recipes where id = v_id) = 'fr', 'lang conservée quand absente du payload';
  assert (select content #>> '{sections,0,ingredients,1,amount}' from public.recipe_translations where recipe_id = v_id) = 'to taste',
    'le contenu par position survit à save_recipe';

  -- ré-écriture de la traduction : fraîche
  perform public.save_recipe_translation(v_id, 'fr', tr || '{"source_hash": "h2"}');
  assert not (select stale from public.recipe_translations where recipe_id = v_id and locale = 'en');
  assert (select source_hash from public.recipe_translations where recipe_id = v_id and locale = 'en') = 'h2';

  -- langue source corrigée : la traduction change de côté, l'ancienne disparaît
  perform public.save_recipe_translation(v_id, 'en', tr || '{"title": "Tarte aux pommes (fr)"}');
  assert (select lang from public.recipes where id = v_id) = 'en';
  assert (select array_agg(locale) from public.recipe_translations where recipe_id = v_id) = array['fr'], 'seule la traduction fr doit rester';
  perform public.save_recipe_translation(v_id, 'fr', tr);   -- retour à fr

  begin
    perform public.save_recipe_translation(v_id, 'de', tr);
    raise exception 'langue de acceptée';
  exception when others then assert sqlerrm like 'Langue source invalide%', sqlerrm; end;
  begin
    perform public.save_recipe_translation(gen_random_uuid(), 'fr', tr);
    raise exception 'recette inconnue acceptée';
  exception when others then assert sqlerrm = 'Recette introuvable', sqlerrm; end;
  begin
    perform public.save_recipe_translation(v_id, 'fr', tr - 'source_hash');
    raise exception 'hash manquant accepté';
  exception when others then assert sqlerrm like 'source_hash%', sqlerrm; end;
  begin
    perform public.save_recipe_translation(v_id, 'fr', tr || '{"content": {"sections": 3}}');
    raise exception 'content invalide accepté';
  exception when others then assert sqlerrm like 'content doit%', sqlerrm; end;
  perform tests.logout();

  -- ------------------------------------------------------------ recherche dans les deux langues (anon)
  perform tests.login(user_id, 'anon');
  assert (select count(*) from public.search_recipes('pommes')) >= 1, 'recherche dans le texte d''origine';
  assert (select count(*) from public.search_recipes('apple')) = 1, 'recherche dans le titre traduit';
  assert (select count(*) from public.search_recipes('flour')) = 1, 'recherche dans les ingrédients traduits';
  assert (select count(*) from public.search_recipes('classic')) = 1, 'recherche dans la description traduite';
  select * into r from public.search_recipes('apple');
  assert r.lang = 'fr' and r.translation ->> 'title' = 'Apple pie' and r.translation ->> 'locale' = 'en', 'translation renvoyée';
  assert r.translation -> 'tags' = '["vegetarian"]'::jsonb;
  perform tests.logout();

  -- traduction périmée : cherchable mais non renvoyée
  perform tests.login(admin_id, 'authenticated');
  update public.recipe_translations set stale = true where recipe_id = v_id;
  perform tests.logout();
  perform tests.login(user_id, 'anon');
  select * into r from public.search_recipes('apple');
  assert r.translation is null, 'traduction périmée renvoyée';
  perform tests.logout();

  -- ------------------------------------------------------------ add_recipe_to_list : noms traduits
  perform tests.login(admin_id, 'authenticated');
  perform public.save_recipe_translation(v_id, 'fr', tr);
  perform tests.logout();
  perform tests.login(user_id, 'authenticated');
  insert into public.shopping_lists (user_id, name) values (user_id, 'Test 0016') returning id into v_list;
  perform public.add_recipe_to_list(v_id, v_list, null, 1, 'en');
  assert (select count(*) from public.shopping_items where list_id = v_list and name in ('flour', 'salt')) = 2, 'noms anglais attendus';
  perform public.add_recipe_to_list(v_id, v_list, null, 1);      -- sans langue : noms d'origine
  assert (select count(*) from public.shopping_items where list_id = v_list and name in ('farine', 'sel')) = 2, 'noms d''origine attendus';
  perform public.add_recipe_to_list(v_id, v_list, null, 1, 'fr'); -- langue source : noms d'origine, fusion
  assert (select count(*) from public.shopping_items where list_id = v_list) = 4, 'fusion attendue en langue source';
  begin
    perform public.add_recipe_to_list(v_id, v_list, null, 1, 'de');
    raise exception 'langue de acceptée';
  exception when others then assert sqlerrm like 'Langue invalide%', sqlerrm; end;
  perform tests.logout();

  -- ------------------------------------------------------------ cascade
  perform tests.login(admin_id, 'authenticated');
  perform public.delete_recipe(v_id);
  perform tests.logout();
  assert not exists (select 1 from public.recipe_translations where recipe_id = v_id), 'cascade à la suppression';

  raise notice '[test 0016] OK';
end $$;

rollback;
