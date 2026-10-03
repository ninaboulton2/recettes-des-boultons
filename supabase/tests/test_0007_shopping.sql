-- Tests 0007 : merge_shopping_item / add_recipe_to_list sous RLS
begin;

do $$
declare
  it public.shopping_items; n numeric; rows_added int;
  user_b constant uuid := '00000000-0000-0000-0000-00000000000b';
  list_b constant uuid := '50000000-0000-0000-0000-00000000000b';
  list_c constant uuid := '50000000-0000-0000-0000-00000000000c';
  r1 constant uuid := '10000000-0000-0000-0000-000000000001';
begin
  perform tests.login(user_b, 'authenticated');

  -- Validations
  begin
    perform public.merge_shopping_item(list_b, '  ', 1, 'g');
    raise exception 'nom vide accepté';
  exception when others then assert sqlerrm = 'Le nom de l''article est obligatoire', sqlerrm; end;
  begin
    perform public.merge_shopping_item(list_b, 'Sel', 1, 'parsec');
    raise exception 'unité inconnue acceptée';
  exception when others then assert sqlerrm like 'Unité inconnue%', sqlerrm; end;
  begin
    perform public.merge_shopping_item(list_b, 'Sel', -1, 'g');
    raise exception 'quantité négative acceptée';
  exception when others then assert sqlerrm like '%négative', sqlerrm; end;
  -- Liste d'un autre utilisateur : invisible sous RLS
  begin
    perform public.merge_shopping_item(list_c, 'Sel', 1, 'g');
    raise exception 'écriture dans la liste d''un autre utilisateur acceptée';
  exception when insufficient_privilege then null; end;

  -- Fusion : « farine » (casse différente) + même unit_code → addition, amount texte recalculé, décoché
  update public.shopping_items set is_checked = true where list_id = list_b and name = 'Farine';
  it := public.merge_shopping_item(list_b, 'farine', 100, 'g');
  assert it.name = 'Farine', 'conserve le nom existant';
  assert it.amount_num = 325 and it.amount = '325', format('%s / %s', it.amount_num, it.amount);
  assert it.unit = 'g' and it.unit_code = 'g';
  assert it.is_checked = false, 'doit redevenir à acheter';
  assert (select count(*) from public.shopping_items where list_id = list_b and public.fold_text(name) = 'farine') = 1;

  -- Accents / ponctuation ignorés
  it := public.merge_shopping_item(list_b, 'FARINE.', 0.5, 'g');
  assert it.amount_num = 325.5 and it.amount = '325.5';

  -- Unité différente → nouvel article (pas de conversion implicite)
  it := public.merge_shopping_item(list_b, 'Farine', 1, 'kg');
  assert it.amount_num = 1 and it.unit_code = 'kg' and it.unit = 'kg';
  assert (select count(*) from public.shopping_items where list_id = list_b and public.fold_text(name) = 'farine') = 2;

  -- Article sans unité (NULL = NULL) et sans quantité
  it := public.merge_shopping_item(list_b, 'Mayonnaise', null, null);
  assert it.amount_num = 1 and it.amount = '1', 'fusion avec l''article seed Mayonnaise (1, unit vide → unit_code NULL)';
  it := public.merge_shopping_item(list_b, 'Papier cuisson', null, null);
  assert it.amount is null and it.amount_num is null and it.unit is null;

  -- Unité legacy normalisée : « pinch » (seed) + 'pincee' → fusion
  it := public.merge_shopping_item(list_b, 'salt', 2, 'pincee');
  assert it.amount_num = 3 and it.unit = 'pinch', format('%s %s', it.amount_num, it.unit);

  -- recipe_id conservé si déjà renseigné, sinon pris
  it := public.merge_shopping_item(list_b, 'Nouveau', 1, 'g', r1);
  assert it.recipe_id = r1;

  -- add_recipe_to_list : R1 ×2 (8 ingrédients), Farine 225×2 = 450 fusionnée (325.5 + 450)
  select count(*) into rows_added from public.add_recipe_to_list(r1, list_b, null, 2);
  assert rows_added = 8, format('%s lignes renvoyées', rows_added);
  select amount_num into n from public.shopping_items where list_id = list_b and name = 'Farine' and unit_code = 'g';
  assert n = 775.5, format('Farine : %s', n);
  assert (select amount_num from public.shopping_items where list_id = list_b and name = 'Sucre') = 300;
  assert (select amount_num from public.shopping_items where list_id = list_b and name = 'Oeufs') = 6;
  assert (select amount is null from public.shopping_items where list_id = list_b and name = 'Extrait de vanille'), 'quantité NULL × facteur = NULL';

  -- Sections choisies uniquement : Carrot cake, section Glaçage (3 ingrédients)
  select count(*) into rows_added from public.add_recipe_to_list('10000000-0000-0000-0000-000000000003', list_b,
          array['30000000-0000-0000-0000-000000000002'::uuid], 1);
  assert rows_added = 3, format('%s lignes (sections choisies)', rows_added);

  -- Erreurs
  begin
    perform public.add_recipe_to_list(r1, list_b, null, 0);
    raise exception 'facteur 0 accepté';
  exception when others then assert sqlerrm like 'Le facteur%', sqlerrm; end;
  begin
    perform public.add_recipe_to_list('00000000-0000-0000-0000-000000000000', list_b);
    raise exception 'recette inexistante acceptée';
  exception when no_data_found then null; end;

  perform tests.logout();

  -- anon : pas de grant
  perform tests.login(user_b, 'anon');
  begin
    perform public.merge_shopping_item(list_b, 'Sel', 1, 'g');
    raise exception 'anon a pu appeler merge_shopping_item';
  exception when insufficient_privilege then null; end;
  perform tests.logout();

  raise notice '[test 0007] OK';
end $$;

rollback;
