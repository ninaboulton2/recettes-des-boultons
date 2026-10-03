-- Tests 0004 : parse_amount / format_amount / trigger amount_num
begin;

do $$
declare v numeric; v_id uuid;
begin
  -- Cas réels prod
  assert public.parse_amount('1000') = 1000;
  assert public.parse_amount('2.5') = 2.5;
  assert public.parse_amount('0.25') = 0.25;
  assert public.parse_amount('1 ') = 1;
  assert public.parse_amount('1/2') = 0.5;
  assert public.parse_amount('optional') is null;
  assert public.parse_amount('a few shakes') is null;
  assert public.parse_amount('for frying') is null;
  assert public.parse_amount('some') is null;
  assert public.parse_amount('splash') is null;
  assert public.parse_amount('to taste') is null;

  -- Formes demandées par le cahier des charges
  assert public.parse_amount('1,5') = 1.5;
  assert public.parse_amount('2-3') = 2;
  assert public.parse_amount('2 à 3') = 2;
  assert public.parse_amount('2 – 3') = 2;        -- tiret demi-cadratin
  assert public.parse_amount('1 1/2') = 1.5;
  assert public.parse_amount('½') = 0.5;
  assert public.parse_amount('¾') = 0.75;
  assert public.parse_amount('1⅓') = 1.3333;
  assert public.parse_amount('2 to 3') = 2;
  assert public.parse_amount('1/2 à 1') = 0.5;
  assert public.parse_amount('3 ou 4') = 3;

  -- Refus
  assert public.parse_amount('1 kg') is null, 'unité collée refusée';
  assert public.parse_amount('env. 3') is null;
  assert public.parse_amount('x2') is null;
  assert public.parse_amount('1/0') is null;
  assert public.parse_amount('1-') is null;

  -- format_amount
  assert public.format_amount(775) = '775';
  assert public.format_amount(0.25) = '0.25';
  assert public.format_amount(2.50) = '2.5';
  assert public.format_amount(1.3333) = '1.333';
  assert public.format_amount(null) is null;
  assert public.parse_amount(public.format_amount(1.5)) = 1.5, 'aller-retour';

  -- Trigger (ancien code : écrit `amount` texte uniquement)
  insert into public.recipe_ingredients (recipe_id, section_id, name, amount, unit, order_index)
  values ('10000000-0000-0000-0000-000000000003', '30000000-0000-0000-0000-000000000001', 'T', '1 1/2', 'g', 98)
  returning id into v_id;
  select amount_num into v from public.recipe_ingredients where id = v_id;
  assert v = 1.5, format('trigger insert : %s', v);

  update public.recipe_ingredients set amount = '2,25' where id = v_id;
  select amount_num into v from public.recipe_ingredients where id = v_id;
  assert v = 2.25, format('trigger update : %s', v);

  update public.recipe_ingredients set amount = 'au goût' where id = v_id;
  select amount_num into v from public.recipe_ingredients where id = v_id;
  assert v is null, 'texte → NULL';

  -- amount_num explicite conservé
  update public.recipe_ingredients set amount = '3', amount_num = 7 where id = v_id;
  select amount_num into v from public.recipe_ingredients where id = v_id;
  assert v = 7, 'amount_num explicite écrasé';

  -- Seed : remplissage
  assert (select amount_num from public.recipe_ingredients where recipe_id = '10000000-0000-0000-0000-000000000005' and name = 'Huile d''olive') = 1.5;
  assert (select amount_num from public.recipe_ingredients where recipe_id = '10000000-0000-0000-0000-000000000005' and name = 'Concentré de tomate') = 0.5;
  assert (select amount_num from public.recipe_ingredients where recipe_id = '10000000-0000-0000-0000-000000000005' and name = 'Tomates') = 2;
  assert (select amount_num from public.recipe_ingredients where recipe_id = '10000000-0000-0000-0000-000000000005' and name = 'Safran') is null;
  assert (select amount_num from public.shopping_items where name = 'Mixed spice') = 0.5;

  raise notice '[test 0004] OK';
end $$;

rollback;
