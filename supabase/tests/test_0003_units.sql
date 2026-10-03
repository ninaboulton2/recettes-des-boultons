-- Tests 0003 : units / unit_aliases / fold_text / normalize_unit / trigger unit_code
-- Exécution : psql -v ON_ERROR_STOP=1 -f supabase/tests/test_0003_units.sql
-- (sur la base locale après run_local.sh ; chaque test est en transaction annulée)
begin;

do $$
declare v_code text; v_id uuid;
begin
  -- fold_text
  assert public.fold_text('  Cuil. À  Soupe ') = 'cuil a soupe', 'fold_text ponctuation/espaces';
  assert public.fold_text('Œufs') = 'oufs', 'fold_text ligature';
  assert public.fold_text('') is null and public.fold_text(null) is null, 'fold_text vide';

  -- normalize_unit : les 109 graphies prod sont couvertes par 0003 (assertions
  -- dans la migration) ; ici quelques cas de bord supplémentaires.
  assert public.normalize_unit('  TBSP ') = 'cas';
  assert public.normalize_unit('cuillères à soupe') = 'cas';
  assert public.normalize_unit('C. À CAFÉ') = 'cac';
  assert public.normalize_unit('gramme') = 'g';
  assert public.normalize_unit('grammes') = 'g';
  assert public.normalize_unit('pièces') = 'piece';
  assert public.normalize_unit('boîtes') = 'boite';
  assert public.normalize_unit('tranchesss') is null, 'graphie inconnue';
  assert public.normalize_unit('xyz') is null;

  -- Chaque code d'unité est aussi son propre alias implicite
  assert public.normalize_unit('poignee') = 'poignee';
  assert public.normalize_unit('qs') = 'qs';

  -- Référentiel cohérent
  assert (select count(*) from public.units where kind = 'mass' and to_base is null) = 0, 'mass sans to_base';
  assert (select count(*) from public.units where kind = 'volume' and to_base is null) = 0, 'volume sans to_base';
  assert (select count(*) from public.units where kind in ('count','other') and to_base is not null) = 0, 'count/other avec to_base';
  assert (select count(*) from public.unit_aliases a left join public.units u on u.code = a.code where u.code is null) = 0;

  -- Trigger : l'ancien code n'écrit que `unit`
  insert into public.recipe_ingredients (recipe_id, section_id, name, amount, unit, order_index)
  values ('10000000-0000-0000-0000-000000000003', '30000000-0000-0000-0000-000000000001', 'Test trigger', '2', 'Tbsp', 99)
  returning id into v_id;
  select unit_code into v_code from public.recipe_ingredients where id = v_id;
  assert v_code = 'cas', format('trigger insert : %s', v_code);

  update public.recipe_ingredients set unit = 'pincées' where id = v_id;
  select unit_code into v_code from public.recipe_ingredients where id = v_id;
  assert v_code = 'pincee', format('trigger update unit : %s', v_code);

  -- unit_code explicite conservé même si unit change en même temps
  update public.recipe_ingredients set unit = 'bizarre', unit_code = 'g' where id = v_id;
  select unit_code into v_code from public.recipe_ingredients where id = v_id;
  assert v_code = 'g', format('unit_code explicite écrasé : %s', v_code);

  -- unit → NULL ⇒ unit_code → NULL
  update public.recipe_ingredients set unit = null where id = v_id;
  select unit_code into v_code from public.recipe_ingredients where id = v_id;
  assert v_code is null, 'unit null doit vider unit_code';

  -- Même trigger sur shopping_items
  insert into public.shopping_items (list_id, name, amount, unit)
  values ('50000000-0000-0000-0000-00000000000b', 'Test', '1', 'cuillère à café') returning id into v_id;
  select unit_code into v_code from public.shopping_items where id = v_id;
  assert v_code = 'cac', 'trigger shopping_items';

  -- Données seed : vérification du remplissage
  assert (select unit_code from public.recipe_ingredients where recipe_id = '10000000-0000-0000-0000-000000000005' and name = 'Poissons de roche') = 'kg';
  assert (select unit_code from public.recipe_ingredients where recipe_id = '10000000-0000-0000-0000-000000000005' and name = 'Oignon') is null, '« petite » doit rester NULL';
  assert (select unit_code from public.shopping_items where name = 'Salt') = 'pincee';
  assert (select unit_code from public.shopping_items where name = 'Mayonnaise') is null;

  -- Lecture publique via l'API (anon) possible, écriture impossible
  perform tests.login('00000000-0000-0000-0000-00000000000b', 'anon');
  assert (select count(*) from public.units) >= 37, 'anon doit lire units';
  begin
    insert into public.units (code, label_fr, label_en, abbr, kind) values ('zz', 'z', 'z', 'z', 'other');
    raise exception 'anon a pu écrire dans units';
  exception when insufficient_privilege then null;
  end;
  perform tests.logout();

  raise notice '[test 0003] OK';
end $$;

rollback;
