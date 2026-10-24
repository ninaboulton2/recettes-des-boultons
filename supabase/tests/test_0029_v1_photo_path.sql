-- Test 0029 côté v1 (relecture de sécurité n° 3) : la contrainte recipes_photo_path_in_own_folder ne casse pas la v1 (avant 0018 / 0020).
--  - `save_recipe` d'un admin avec un chemin « <id de la recette>/… » passe (création puis mise à jour) ;
--  - avec le chemin d'une AUTRE recette, ou un chemin libre, elle échoue (23514) ;
--  - retirer la photo (NULL) et enregistrer sans clé photo_path passent toujours.
-- Exécuté par run_local.sh après test_0025_sec2_v1.sql. Transaction annulée. Données : seed_test.sql (…0a admin).
begin;

create or replace function tests.try(q text) returns text language plpgsql as $$
begin execute q; return 'ok'; exception when others then return sqlstate; end $$;
grant execute on function tests.try(text) to anon, authenticated, service_role;

do $$
declare
  admin_id constant uuid := '00000000-0000-0000-0000-00000000000a';
  other    constant uuid := '10000000-0000-0000-0000-000000000001';
  v_id uuid;
  v_other uuid;
begin
  assert not (select attnotnull from pg_attribute where attrelid = 'public.recipes'::regclass and attname = 'owner_id'), 'état v1 : owner_id nullable';
  assert exists (select 1 from pg_constraint where conname = 'recipes_photo_path_in_own_folder' and conrelid = 'public.recipes'::regclass), 'contrainte absente (0029)';
  perform tests.login(admin_id, 'authenticated');
  v_id := public.save_recipe('{"title":"Photo v1 A","category":"plats"}'::jsonb);
  v_other := public.save_recipe('{"title":"Photo v1 B","category":"plats"}'::jsonb);
  -- chemin valide (ce que écrit l'éditeur : <id>/<horodatage>.webp)
  v_id := public.save_recipe(jsonb_build_object('id', v_id, 'title', 'Photo v1 A', 'category', 'plats', 'photo_path', v_id || '/1700000000000.webp'));
  assert (select photo_path from public.recipes where id = v_id) = v_id || '/1700000000000.webp', 'chemin valide enregistré';
  -- chemin d'une autre recette, chemin libre
  assert tests.try(format($q$select public.save_recipe(%L::jsonb)$q$, jsonb_build_object('id', v_id, 'title', 'Photo v1 A', 'category', 'plats', 'photo_path', v_other || '/1.webp')::text)) = '23514', 'chemin d''une autre recette refusé';
  assert tests.try(format($q$select public.save_recipe(%L::jsonb)$q$, jsonb_build_object('id', v_id, 'title', 'Photo v1 A', 'category', 'plats', 'photo_path', 'x/y.webp')::text)) = '23514', 'chemin libre refusé';
  assert tests.try(format($q$select public.save_recipe(%L::jsonb)$q$, jsonb_build_object('id', v_id, 'title', 'Photo v1 A', 'category', 'plats', 'photo_path', other || '/1.webp')::text)) = '23514', 'chemin d''une recette du seed refusé';
  assert (select photo_path from public.recipes where id = v_id) = v_id || '/1700000000000.webp', 'la photo n''a pas bougé après les refus';
  -- retrait de la photo
  v_id := public.save_recipe(jsonb_build_object('id', v_id, 'title', 'Photo v1 A', 'category', 'plats'));
  assert (select photo_path is null from public.recipes where id = v_id), 'photo retirée';
  perform tests.logout();
  raise notice 'test_0029_v1_photo_path : OK';
end $$;

rollback;
