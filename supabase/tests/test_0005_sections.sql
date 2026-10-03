-- Tests 0005 : JSONB → section « Recette », orphelins archivés/supprimés
begin;

do $$
declare n int; sec uuid;
begin
  -- Plus aucune recette sans section, plus aucun orphelin
  select count(*) into n from public.recipes r where not exists (select 1 from public.recipe_sections s where s.recipe_id = r.id);
  assert n = 0, format('%s recette(s) sans section', n);
  select count(*) into n from public.recipe_ingredients where section_id is null;
  assert n = 0, format('%s orphelin(s)', n);

  -- Seed : R1, R2, R5, R6 migrées (4), R3/R4 inchangées
  select count(*) into n from public.recipe_sections where name = 'Recette' and type = 'mixed' and order_index = 0;
  assert n = 4, format('%s sections Recette, 4 attendues', n);
  assert (select count(*) from public.recipe_sections where recipe_id = '10000000-0000-0000-0000-000000000003') = 4, 'R3 inchangée';
  assert (select count(*) from public.recipe_sections where recipe_id = '10000000-0000-0000-0000-000000000004') = 2, 'R4 inchangée';

  -- R1 : contenu = JSONB (8 ingrédients, 4 instructions), ordre conservé
  select id into sec from public.recipe_sections where recipe_id = '10000000-0000-0000-0000-000000000001';
  assert (select count(*) from public.recipe_ingredients where section_id = sec) = 8;
  assert (select count(*) from public.instructions where section_id = sec) = 4;
  assert (select name from public.recipe_ingredients where section_id = sec and order_index = 0) = 'Yaourt nature';
  assert (select name from public.recipe_ingredients where section_id = sec and order_index = 7) = 'Extrait de vanille';
  -- amount 0 → NULL, unit '' → NULL
  assert (select amount is null and unit is null and amount_num is null from public.recipe_ingredients where section_id = sec and name = 'Extrait de vanille');
  -- nombre JSON → texte court + amount_num + unit_code
  assert (select amount = '225' and amount_num = 225 and unit_code = 'g' from public.recipe_ingredients where section_id = sec and name = 'Farine');
  assert (select unit_code = 'piece' from public.recipe_ingredients where section_id = sec and name = 'Oeufs');
  assert (select content from public.instructions where section_id = sec and order_index = 3) = 'Cuire 35 minutes.';

  -- R2 : amount texte conservé (« splash », « to taste »), amount_num NULL
  select id into sec from public.recipe_sections where recipe_id = '10000000-0000-0000-0000-000000000002';
  assert (select amount = 'splash' and amount_num is null from public.recipe_ingredients where section_id = sec and name = 'Soy sauce');
  assert (select unit_code = 'gousse' from public.recipe_ingredients where section_id = sec and name = 'Crushed garlic');

  -- R5 : montants exotiques parsés depuis le JSONB (chaînes)
  select id into sec from public.recipe_sections where recipe_id = '10000000-0000-0000-0000-000000000005';
  assert (select count(*) from public.recipe_ingredients where section_id = sec) = 14;
  assert (select amount = '1,5' and amount_num = 1.5 and unit_code = 'kg' from public.recipe_ingredients where section_id = sec and name = 'Poissons de roche');
  assert (select amount = '2 à 3' and amount_num = 2 from public.recipe_ingredients where section_id = sec and name = 'Ail');
  assert (select amount = 'optional' and amount_num is null and unit_code = 'qs' from public.recipe_ingredients where section_id = sec and name = 'Safran');

  -- R6 : sans orphelin au départ, migrée quand même depuis le JSONB
  select id into sec from public.recipe_sections where recipe_id = '10000000-0000-0000-0000-000000000006';
  assert (select count(*) from public.recipe_ingredients where section_id = sec) = 3;
  assert (select count(*) from public.instructions where section_id = sec) = 3;

  -- Archives : 41 orphelins (8+8+14 recettes sans section + 11 de R4), 1 instruction
  assert (select count(*) from public.recipe_ingredients_orphans_20261003) = 41, 'archive orphelins';
  assert (select count(*) from public.instructions_orphans_20261003) = 1, 'archive instructions';
  -- l'instruction orpheline est CONSERVÉE
  assert (select count(*) from public.instructions where section_id is null) = 1;

  -- Les JSONB legacy sont intacts (phase 4)
  assert (select jsonb_array_length(ingredients) from public.recipes where id = '10000000-0000-0000-0000-000000000001') = 8;
  assert (select jsonb_array_length(ingredients) from public.recipes where id = '10000000-0000-0000-0000-000000000004') = 11;

  -- Sauvegardes complètes et invisibles via l'API
  assert (select count(*) from public.recipes_backup_20261003) = 6;
  assert (select count(*) from public.recipe_ingredients_backup_20261003) = 52;   -- R1 8 + R2 8 + R3 9 + R4 13 + R5 14
  perform tests.login('00000000-0000-0000-0000-00000000000b', 'anon');
  begin
    perform count(*) from public.recipes_backup_20261003;
    raise exception 'anon lit la sauvegarde';
  exception when insufficient_privilege then null;
  end;
  perform tests.logout();

  raise notice '[test 0005] OK';
end $$;

rollback;
