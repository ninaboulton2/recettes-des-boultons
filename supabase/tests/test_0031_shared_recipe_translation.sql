-- Test 0031 — traduction d'une recette partagée par le serveur, sous la chaîne COMPLÈTE (… → 0018 → 0020 → 0031).
--   * public.save_recipe_translation_server : service_role SEULEMENT (anon / authenticated refusés), mêmes validations que
--     save_recipe_translation, écrit une ligne vers l'autre langue (stale = false), corrige la langue source comme elle, rejouable ;
--   * public.shared_recipe_id(jeton) : service_role seulement, NULL pour un jeton inconnu ou révoqué ;
--   * get_shared_recipe(jeton, locale) rend ensuite la traduction à la locale demandée (et aucune dans la langue d'origine).
-- a = Nina (auteure du seed, administratrice), d = étranger (aucun droit). Transaction annulée.
begin;

create or replace function tests.try(q text) returns text language plpgsql as $$
begin execute q; return 'ok'; exception when others then return sqlstate; end $$;
grant execute on function tests.try(text) to anon, authenticated, service_role;

do $$
declare
  a constant uuid := '00000000-0000-0000-0000-00000000000a';
  d constant uuid := '00000000-0000-0000-0000-0000000000d1';
  rid uuid; tok uuid; shared jsonb; n int; tr jsonb;
  payload constant jsonb := '{"title":"Their title","description":"Desc","notes":null,"tags":["a"],"source_hash":"h1","model":"mock","content":{"sections":[]}}';
begin
  insert into auth.users (id, email, raw_user_meta_data) values (d, 'dave31@test.local', '{}');

  perform tests.login(a, 'authenticated', '{"user_role":"admin"}');
  rid := public.save_recipe('{"title":"Tarte aux pommes 0031","category":"desserts et gâteaux","visibility":"private","lang":"fr"}'::jsonb);
  tok := public.create_share_link(rid);
  perform tests.logout();

  -- droits : seul service_role
  perform tests.login(a, 'authenticated', '{"user_role":"admin"}');
  assert tests.try(format('select public.shared_recipe_id(%L)', tok)) = '42501', '0031 : authenticated ne doit pas appeler shared_recipe_id';
  assert tests.try(format('select public.save_recipe_translation_server(%L, ''fr'', %L::jsonb)', rid, payload)) = '42501', '0031 : authenticated ne doit pas appeler save_recipe_translation_server';
  perform tests.logout();
  perform tests.login(d, 'anon');
  assert tests.try(format('select public.shared_recipe_id(%L)', tok)) = '42501', '0031 : anon ne doit pas appeler shared_recipe_id';
  assert tests.try(format('select public.save_recipe_translation_server(%L, ''fr'', %L::jsonb)', rid, payload)) = '42501', '0031 : anon ne doit pas appeler save_recipe_translation_server';
  perform tests.logout();

  perform tests.login(d, 'service_role');
  -- jeton → recette
  assert public.shared_recipe_id(tok) = rid, '0031 : shared_recipe_id doit rendre la recette du lien actif';
  assert public.shared_recipe_id(gen_random_uuid()) is null, '0031 : jeton inconnu = NULL';

  -- validations
  assert tests.try(format('select public.save_recipe_translation_server(%L, ''de'', %L::jsonb)', rid, payload)) = '22023', '0031 : langue invalide refusée';
  assert tests.try(format('select public.save_recipe_translation_server(%L, ''fr'', %L::jsonb)', rid, '[]')) = '22023', '0031 : traduction non objet refusée';
  assert tests.try(format('select public.save_recipe_translation_server(%L, ''fr'', %L::jsonb)', rid, '{"title":"  ","source_hash":"h","content":{"sections":[]}}')) = '22023', '0031 : titre vide refusé';
  assert tests.try(format('select public.save_recipe_translation_server(%L, ''fr'', %L::jsonb)', rid, '{"title":"T","content":{"sections":[]}}')) = '22023', '0031 : source_hash obligatoire';
  assert tests.try(format('select public.save_recipe_translation_server(%L, ''fr'', %L::jsonb)', rid, '{"title":"T","source_hash":"h","content":{"sections":{}}}')) = '22023', '0031 : content.sections doit être un tableau';
  assert tests.try(format('select public.save_recipe_translation_server(%L, ''fr'', %L::jsonb)', gen_random_uuid(), payload)) = 'P0002', '0031 : recette inconnue';
  assert (select count(*) from public.recipe_translations where recipe_id = rid) = 0, '0031 : les refus n''ont rien écrit';

  -- écriture : recette fr → traduction en
  perform public.save_recipe_translation_server(rid, 'fr', payload);
  select count(*) into n from public.recipe_translations where recipe_id = rid and locale = 'en' and title = 'Their title' and stale is false and source_hash = 'h1';
  assert n = 1, '0031 : la traduction en doit être écrite, non périmée';
  assert (select lang from public.recipes where id = rid) = 'fr', '0031 : langue source inchangée';
  perform tests.logout();

  -- la page publique rend la traduction à la bonne locale seulement
  perform tests.login(d, 'anon');
  shared := public.get_shared_recipe(tok, 'en');
  assert shared #>> '{translation,title}' = 'Their title' and shared #>> '{translation,locale}' = 'en', '0031 : get_shared_recipe(en) doit rendre la traduction';
  shared := public.get_shared_recipe(tok, 'fr');
  assert shared -> 'translation' = 'null'::jsonb or shared -> 'translation' is null, '0031 : get_shared_recipe(fr) ne rend aucune traduction (langue d''origine)';
  perform tests.logout();

  -- rejeu : même ligne mise à jour, jamais de doublon, « périmée » remise à faux
  update public.recipe_translations set stale = true where recipe_id = rid;
  perform tests.login(d, 'service_role');
  perform public.save_recipe_translation_server(rid, 'fr', jsonb_set(payload, '{title}', '"Their title v2"'));
  select count(*) into n from public.recipe_translations where recipe_id = rid;
  assert n = 1, '0031 : une seule traduction par recette';
  assert (select title = 'Their title v2' and stale is false from public.recipe_translations where recipe_id = rid), '0031 : rejeu = mise à jour, stale remis à faux';

  -- langue source corrigée par la détection : la recette devient « en », la traduction (en) est retirée et remplacée par fr
  perform public.save_recipe_translation_server(rid, 'en', jsonb_set(payload, '{title}', '"Titre français"'));
  assert (select lang from public.recipes where id = rid) = 'en', '0031 : la langue source doit être corrigée';
  select count(*) into n from public.recipe_translations where recipe_id = rid;
  assert n = 1 and (select locale = 'fr' and title = 'Titre français' from public.recipe_translations where recipe_id = rid), '0031 : traduction vers fr seule après correction';
  perform tests.logout();

  -- lien révoqué : plus de recette derrière le jeton
  perform tests.login(a, 'authenticated', '{"user_role":"admin"}');
  perform public.revoke_share_link(rid);
  perform tests.logout();
  perform tests.login(d, 'service_role');
  assert public.shared_recipe_id(tok) is null, '0031 : jeton révoqué = NULL';
  perform tests.logout();

  raise notice '[0031] OK';
end $$;

rollback;
