-- Test 0032 — rayon choisi (courses) et traduction à la demande hors plafond du jour, sous la chaîne COMPLÈTE (… → 0028 → 0032).
--   * set_shopping_item_aisle : rayon posé sur l'article, préférence par nom replié (upsert), NULL = automatique (préférence retirée),
--     rayon inconnu refusé, article d'autrui refusé, préférences invisibles pour les autres, anon refusé ;
--   * reserve_ai_call('translate_shared') : ignore le plafond du jour (même plafond 1 déjà atteint) mais compte dans le budget du mois ;
--     ai_quota_status n'en tient pas compte. Transaction annulée.
begin;

create or replace function tests.try(q text) returns text language plpgsql as $$
begin execute q; return 'ok'; exception when others then return sqlstate; end $$;
grant execute on function tests.try(text) to anon, authenticated, service_role;

do $$
declare
  d constant uuid := '00000000-0000-0000-0000-0000000000d9';
  e constant uuid := '00000000-0000-0000-0000-0000000000e9';
  lst uuid; itm uuid; itm2 uuid; n int; s jsonb; r jsonb;
begin
  insert into auth.users (id, email, raw_user_meta_data) values (d, 'dave32@test.local', '{}'), (e, 'eve32@test.local', '{}');
  update public.profiles set created_at = now() - interval '90 days' where id in (d, e);

  -- A. rayons ------------------------------------------------------------------------------------------------------------------
  perform tests.login(d, 'authenticated');
  insert into public.shopping_lists (user_id, name) values (d, 'Liste 32') returning id into lst;
  insert into public.shopping_items (list_id, name) values (lst, 'tomates') returning id into itm;
  insert into public.shopping_items (list_id, name) values (lst, 'savon') returning id into itm2;
  assert (select aisle from public.shopping_items where id = itm) is null, '0032 : rayon NULL par défaut';

  perform public.set_shopping_item_aisle(itm, 'grocery', ' tomate ');
  assert (select aisle from public.shopping_items where id = itm) = 'grocery', '0032 : rayon posé sur l''article';
  assert (select aisle from public.shopping_aisle_prefs where user_id = d and name_key = 'tomate') = 'grocery', '0032 : préférence retenue (clé nettoyée)';
  perform public.set_shopping_item_aisle(itm, 'dairy', 'tomate');
  assert (select count(*) from public.shopping_aisle_prefs where user_id = d) = 1 and (select aisle from public.shopping_aisle_prefs where user_id = d) = 'dairy', '0032 : upsert, pas de doublon';
  assert tests.try(format('select public.set_shopping_item_aisle(%L, ''couloir'', ''x'')', itm)) = '22023', '0032 : rayon inconnu refusé';
  assert tests.try(format('update public.shopping_items set aisle = ''couloir'' where id = %L', itm)) = '23514', '0032 : contrainte de colonne';
  assert tests.try(format('insert into public.shopping_aisle_prefs (user_id, name_key, aisle) values (%L, ''y'', ''nope'')', d)) = '23514', '0032 : contrainte de la table';
  assert tests.try(format('insert into public.shopping_aisle_prefs (user_id, name_key, aisle) values (%L, ''y'', ''other'')', e)) = '42501', '0032 : pas de préférence au nom d''autrui';
  perform tests.logout();

  perform tests.login(e, 'authenticated');
  assert (select count(*) from public.shopping_aisle_prefs) = 0, '0032 : préférences d''autrui invisibles';
  assert tests.try(format('select public.set_shopping_item_aisle(%L, ''other'', ''tomate'')', itm)) = '42501', '0032 : article d''autrui refusé';
  perform tests.logout();
  perform tests.login(d, 'anon');
  assert tests.try(format('select public.set_shopping_item_aisle(%L, ''other'', ''tomate'')', itm)) = '42501', '0032 : anon refusé';
  perform tests.logout();

  perform tests.login(d, 'authenticated');
  perform public.set_shopping_item_aisle(itm, null, 'tomate');
  assert (select aisle from public.shopping_items where id = itm) is null and (select count(*) from public.shopping_aisle_prefs) = 0, '0032 : NULL = automatique, préférence retirée';
  perform tests.logout();

  -- B. traduction à la demande hors plafond du jour ---------------------------------------------------------------------------
  perform tests.login(d, 'service_role');
  -- plafond du jour de d = 1 : un appel ordinaire passe, le second est refusé
  r := public.reserve_ai_call(d, 'translate_recipe', 1, 1, 30);
  assert (r ->> 'ok')::boolean, '0032 : premier appel ordinaire accepté';
  assert (public.reserve_ai_call(d, 'translate_recipe', 1, 1, 30) ->> 'reason') = 'quota', '0032 : plafond atteint pour un appel ordinaire';
  -- ... mais la traduction à la demande passe quand même, deux fois
  assert (public.reserve_ai_call(d, 'translate_shared', 1, 1, 30) ->> 'ok')::boolean, '0032 : translate_shared ignore le plafond du jour';
  assert (public.reserve_ai_call(d, 'translate_shared', 1, 1, 30) ->> 'ok')::boolean, '0032 : translate_shared encore accepté';
  perform tests.logout();
  perform tests.login(d, 'authenticated');
  s := public.ai_quota_status(1, 1, 30);
  assert (s ->> 'used')::int = 1, '0032 : ai_quota_status ne compte pas translate_shared (used = 1)';
  perform tests.logout();
  -- le budget du mois les compte : 3 lignes ce mois-ci pour d (1 + 2) ; budget de 3 appels atteint → refus, y compris pour translate_shared
  perform tests.login(d, 'service_role');
  select count(*) into n from public.ai_usage u where u.created_at >= date_trunc('month', now() at time zone 'Europe/Paris') at time zone 'Europe/Paris';
  assert (public.reserve_ai_call(d, 'translate_shared', 1, 1, 30, n::int, 0) ->> 'reason') = 'budget', '0032 : translate_shared compte dans le budget du mois';
  assert (public.reserve_ai_call(e, 'translate_shared', 1, 1, 30, n::int, 0) ->> 'reason') = 'budget', '0032 : budget global, quelle que soit la personne';
  perform tests.logout();

  raise notice '[test 0032] OK';
end $$;

rollback;
