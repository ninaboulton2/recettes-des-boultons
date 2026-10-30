-- Test 0033 — export_my_data contient le rayon des articles et les rayons préférés (et rien d'une autre personne). Transaction annulée.
begin;

do $$
declare
  d constant uuid := '00000000-0000-0000-0000-0000000000da';
  e constant uuid := '00000000-0000-0000-0000-0000000000ea';
  lst uuid; itm uuid; j jsonb;
begin
  insert into auth.users (id, email, raw_user_meta_data) values (d, 'dave33@test.local', '{}'), (e, 'eve33@test.local', '{}');

  perform tests.login(d, 'authenticated');
  insert into public.shopping_lists (user_id, name) values (d, 'Liste 33') returning id into lst;
  insert into public.shopping_items (list_id, name) values (lst, 'tomates') returning id into itm;
  insert into public.shopping_items (list_id, name) values (lst, 'savon');
  perform public.set_shopping_item_aisle(itm, 'bakery', 'tomate');
  perform tests.logout();

  insert into public.shopping_aisle_prefs (user_id, name_key, aisle) values (e, 'savon eve', 'household');

  perform tests.login(d, 'authenticated');
  j := public.export_my_data();
  perform tests.logout();
  assert jsonb_array_length(j -> 'shopping_aisle_prefs') = 1
     and j -> 'shopping_aisle_prefs' -> 0 ->> 'name_key' = 'tomate' and j -> 'shopping_aisle_prefs' -> 0 ->> 'aisle' = 'bakery', '0033 : mes rayons préférés exportés';
  assert (select count(*) from jsonb_array_elements(j -> 'shopping_lists' -> 0 -> 'items') it where it ->> 'name' = 'tomates' and it ->> 'aisle' = 'bakery') = 1
     and (select count(*) from jsonb_array_elements(j -> 'shopping_lists' -> 0 -> 'items') it where it ->> 'name' = 'savon' and it ->> 'aisle' is null and it ? 'aisle') = 1, '0033 : rayon des articles exporté (null si automatique)';
  assert j::text not like '%savon eve%' and position(e::text in j::text) = 0, '0033 : rien d''une autre personne';

  raise notice '[test 0033] OK';
end $$;

rollback;
