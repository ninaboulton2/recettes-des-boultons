-- Tests 0015 : nettoyage mécanique des données.
-- Le seed ne contient pas les recettes de la prod visées par 0015 : ce script
-- crée des recettes témoins portant leurs identifiants, rejoue 0015 (\ir),
-- vérifie, puis supprime tout ce qu'il a créé (y compris les lignes de
-- sauvegarde). Ignoré si ces recettes existent déjà (base avec snapshot prod).
\set ON_ERROR_STOP 1
select (exists (select 1 from public.recipes where id in ('2d4b5e14-b473-4c4c-9579-2bb27ba1cd8e',
        '15e331e0-826d-4781-bca8-92024704e883', '33afe58e-1e3b-4271-ae2c-f80e0837beb2',
        'b618ad5b-66a5-428c-9d48-de31b9060677'))) as skip_0015 \gset
\if :skip_0015
  \echo '[test 0015] ignoré : recettes prod présentes (base avec snapshot) — 0015 y a été vérifiée par setup.sh'
\else
begin;
insert into public.recipes (id, title, category) values
  ('2d4b5e14-b473-4c4c-9579-2bb27ba1cd8e', '__t15 Black bean chili', 'plats'),
  ('15e331e0-826d-4781-bca8-92024704e883', '__t15 Pizzaladière', 'plats'),
  ('33afe58e-1e3b-4271-ae2c-f80e0837beb2', '__t15 Enchiladas', 'plats'),
  ('b618ad5b-66a5-428c-9d48-de31b9060677', '__t15 Wok', 'plats');
insert into public.recipe_sections (id, recipe_id, name, type, order_index) values
  ('15000000-0000-0000-0000-000000000001', '2d4b5e14-b473-4c4c-9579-2bb27ba1cd8e', 'Ingrédients', 'ingredients', 0),
  ('15000000-0000-0000-0000-000000000002', '2d4b5e14-b473-4c4c-9579-2bb27ba1cd8e', 'Préparation', 'instructions', 1),
  ('15000000-0000-0000-0000-000000000003', '2d4b5e14-b473-4c4c-9579-2bb27ba1cd8e', 'Nouvelle section', 'instructions', 2),
  ('15000000-0000-0000-0000-000000000004', '15e331e0-826d-4781-bca8-92024704e883', '', 'mixed', 0),
  ('15000000-0000-0000-0000-000000000005', '33afe58e-1e3b-4271-ae2c-f80e0837beb2', '', 'mixed', 0),
  ('15000000-0000-0000-0000-000000000006', 'b618ad5b-66a5-428c-9d48-de31b9060677', '', 'mixed', 0);
insert into public.recipe_ingredients (recipe_id, section_id, name, amount, unit, order_index) values
  ('2d4b5e14-b473-4c4c-9579-2bb27ba1cd8e', '15000000-0000-0000-0000-000000000001', 'spring onions', 'optional', 'chopped', 0),
  ('2d4b5e14-b473-4c4c-9579-2bb27ba1cd8e', '15000000-0000-0000-0000-000000000001', 'avocado', 'optional', 'chunks', 1),
  ('2d4b5e14-b473-4c4c-9579-2bb27ba1cd8e', '15000000-0000-0000-0000-000000000001', 'onions', '2', 'large', 2),
  ('2d4b5e14-b473-4c4c-9579-2bb27ba1cd8e', '15000000-0000-0000-0000-000000000001', 'onions', '3', 'large', 3),  -- même clé : 2 lignes
  ('2d4b5e14-b473-4c4c-9579-2bb27ba1cd8e', '15000000-0000-0000-0000-000000000001', 'Basilic  frais ', '1 ', 'poignée', 4),
  ('15e331e0-826d-4781-bca8-92024704e883', '15000000-0000-0000-0000-000000000004', 'olives noires', '10', 'à 15', 0),
  ('15e331e0-826d-4781-bca8-92024704e883', '15000000-0000-0000-0000-000000000004', 'olives vertes', '10', 'à 15', 1), -- hors liste
  ('33afe58e-1e3b-4271-ae2c-f80e0837beb2', '15000000-0000-0000-0000-000000000005', 'salt', 'to taste', null, 0),
  ('33afe58e-1e3b-4271-ae2c-f80e0837beb2', '15000000-0000-0000-0000-000000000005', 'tomato puree', '1', 'squeeze', 1), -- humain
  ('b618ad5b-66a5-428c-9d48-de31b9060677', '15000000-0000-0000-0000-000000000006', 'Petit piment ou poudre de piments', '1', 'petit', 0);
insert into public.instructions (recipe_id, section_id, content, order_index) values
  ('2d4b5e14-b473-4c4c-9579-2bb27ba1cd8e', '15000000-0000-0000-0000-000000000002', 'Cuire. ', 0);
commit;

\ir ../migrations/0015_data_cleanup.sql
\ir ../migrations/0015_data_cleanup.sql

begin;
do $$
declare r record;
  chili constant uuid := '2d4b5e14-b473-4c4c-9579-2bb27ba1cd8e';
begin
  select * into r from public.recipe_ingredients where recipe_id = chili and name like 'spring onions%';
  assert r.name = 'spring onions, chopped' and r.optional and r.amount is null and r.unit is null and r.unit_code is null,
    format('R2+R4 : %s / %s / %s', r.name, r.amount, r.unit);
  select * into r from public.recipe_ingredients where recipe_id = chili and name = 'avocado';
  assert r.optional and r.amount is null and r.unit = 'chunks' and r.unit_code = 'morceau', 'R2 avocat';
  assert (select count(*) from public.recipe_ingredients where recipe_id = chili and name = 'onions, large' and unit is null) = 2, 'R4 deux lignes';
  assert (select amount_num from public.recipe_ingredients where recipe_id = chili and name = 'onions, large' and amount = '3') = 3, 'R4 quantité intacte';
  select * into r from public.recipe_ingredients where recipe_id = chili and order_index = 4;
  assert r.name = 'Basilic frais' and r.amount = '1' and r.unit_code = 'poignee', format('R5 : « %s » « %s »', r.name, r.amount);
  assert (select content from public.instructions where recipe_id = chili) = 'Cuire.', 'R5 étape';
  assert not exists (select 1 from public.recipe_sections where id = '15000000-0000-0000-0000-000000000003'), 'R6';

  select * into r from public.recipe_ingredients where name = 'olives noires' and recipe_id = '15e331e0-826d-4781-bca8-92024704e883';
  assert r.amount = '10 à 15' and r.amount_num = 10 and r.unit is null, 'R1';
  assert (select unit from public.recipe_ingredients where name = 'olives vertes') = 'à 15', 'hors liste : intact';

  select * into r from public.recipe_ingredients where name = 'salt' and recipe_id = '33afe58e-1e3b-4271-ae2c-f80e0837beb2';
  assert r.amount is null and r.unit = 'to taste' and r.unit_code = 'qs', 'R3';
  assert (select unit from public.recipe_ingredients where name = 'tomato puree') = 'squeeze', 'squeeze : laissé à un humain';

  assert (select name from public.recipe_ingredients where recipe_id = 'b618ad5b-66a5-428c-9d48-de31b9060677') = 'Petit piment ou poudre de piments',
    'qualificatif déjà dans le nom : pas de doublon';

  -- Sauvegardes : une ligne par (ingrédient, règle) ; rejeu sans doublon
  assert (select count(*) from public.recipe_ingredients_backup_cleanup where recipe_id = chili) = 6,
    format('sauvegardes chili : %s', (select count(*) from public.recipe_ingredients_backup_cleanup where recipe_id = chili));
  assert (select name from public.recipe_ingredients_backup_cleanup where recipe_id = chili and correction = 'R4' and amount = '2') = 'onions';
  assert (select count(*) from public.recipe_sections_backup_cleanup where id = '15000000-0000-0000-0000-000000000003') = 1;
  assert (select count(*) from public.instructions_backup_cleanup where recipe_id = chili) = 1;

  -- invisibles via l'API
  perform tests.login('00000000-0000-0000-0000-00000000000b', 'authenticated');
  begin
    perform count(*) from public.recipe_ingredients_backup_cleanup;
    raise exception 'authenticated lit la sauvegarde 0015';
  exception when insufficient_privilege then null; end;
  perform tests.logout();
  raise notice '[test 0015] OK';
end $$;
commit;

-- Nettoyage des témoins
begin;
delete from public.recipe_ingredients_backup_cleanup where recipe_id in (select id from public.recipes where title like '__t15 %');
delete from public.instructions_backup_cleanup        where recipe_id in (select id from public.recipes where title like '__t15 %');
delete from public.recipe_sections_backup_cleanup     where recipe_id in (select id from public.recipes where title like '__t15 %');
delete from public.recipes where title like '__t15 %';
commit;
\endif
