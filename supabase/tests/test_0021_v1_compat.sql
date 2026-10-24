-- Tests 0021 — la v1 N'EST PAS cassée quand seule 0021 est appliquée (après 0019, AVANT le remplissage 0018 et la
-- bascule 0020) : politiques v1 intactes (tout le monde lit, les admins écrivent), owner_id toujours NULL,
-- save_recipe / save_recipe_translation / search_recipes se comportent comme avant, les nouvelles fonctions sont
-- fermées à anon (sauf get_shared_recipe) et ne montrent rien à un compte sans droit. Transaction annulée.
-- Données : seed_test.sql (…0a admin, …0b et …0c simples comptes).
begin;

create or replace function tests.try(q text) returns text language plpgsql as $$
begin execute q; return 'ok'; exception when others then return sqlstate; end $$;
grant execute on function tests.try(text) to anon, authenticated, service_role;

do $$
declare
  admin_id constant uuid := '00000000-0000-0000-0000-00000000000a';
  user_id  constant uuid := '00000000-0000-0000-0000-00000000000b';
  v_id uuid; v_id2 uuid; r record; n bigint; j jsonb;
  payload jsonb := $j${
    "title": "Tarte 0021 v1", "category": "desserts et gâteaux", "servings": 6, "lang": "fr",
    "sections": [
      { "name": "Pâte", "type": "ingredients", "ingredients": [ { "name": "farine", "amount": "250", "unit": "g" } ] },
      { "name": "Préparation", "type": "instructions", "instructions": [ "Cuire." ] } ]
  }$j$;
  tr jsonb := $j${
    "title": "Pie 0021", "source_hash": "h1", "model": "mock", "tags": [],
    "content": { "sections": [ { "name": "Dough", "ingredients": [ { "name": "flour", "amount": null, "unit": null } ], "instructions": [] },
                               { "name": "Method", "ingredients": [], "instructions": ["Bake."] } ] }
  }$j$;
begin
  assert not (select attnotnull from pg_attribute where attrelid = 'public.recipes'::regclass and attname = 'owner_id'), 'v1 : owner_id nullable';
  assert (select count(*) from public.recipes where owner_id is not null) = 0, 'v1 : aucune recette n''a de propriétaire';

  -- ------------------------------------------------------------ save_recipe, comme avant (v1 : admin)
  perform tests.login(admin_id, 'authenticated');
  v_id := public.save_recipe(payload || jsonb_build_object('translation', tr));
  perform tests.logout();
  select * into r from public.recipes where id = v_id;
  assert r.owner_id is null, 'v1 : une recette créée en v1 reste sans propriétaire (le remplissage 0018 l''attribuera)';
  assert r.visibility = 'groups' and r.category_id is null and r.copied_from is null, 'v1 : valeurs par défaut';
  assert (select count(*) from public.recipe_sections where recipe_id = v_id) = 2
     and (select count(*) from public.recipe_translations where recipe_id = v_id) = 1, 'v1 : sections et traduction jointes';
  -- mise à jour (id fourni) : remplace tout, marque la traduction périmée sans traduction jointe
  perform tests.login(admin_id, 'authenticated');
  assert public.save_recipe(payload || jsonb_build_object('id', v_id, 'title', 'Tarte 0021 bis')) = v_id, 'même id';
  perform tests.logout();
  assert (select title from public.recipes where id = v_id) = 'Tarte 0021 bis', 'v1 : titre mis à jour';
  assert (select stale from public.recipe_translations where recipe_id = v_id), 'v1 : traduction marquée périmée';
  -- erreurs de v1 inchangées
  perform tests.login(admin_id, 'authenticated');
  assert tests.try($q$select public.save_recipe('{"category":"plats"}')$q$) = '22023', 'v1 : titre obligatoire';
  assert tests.try($q$select public.save_recipe('{"title":"x"}')$q$) = '22023', 'v1 : catégorie obligatoire';
  assert tests.try($q$select public.save_recipe('{"title":"x","category":"plats","visibility":"public"}')$q$) = '22023', 'visibilité invalide';
  assert tests.try($q$select public.save_recipe('{"title":"x","category_id":"00000000-0000-0000-0000-000000000099"}')$q$) = '22023', 'catégorie inconnue';
  -- un payload v2 (visibility) est accepté même en v1 : sans effet visible
  v_id2 := public.save_recipe('{"title":"Privée v1","category":"plats","visibility":"private"}'::jsonb);
  assert (select visibility from public.recipes where id = v_id2) = 'private' and (select owner_id from public.recipes where id = v_id2) is null, 'visibility acceptée, owner_id NULL';
  perform tests.logout();
  -- un compte non admin reste refusé
  perform tests.login(user_id, 'authenticated');
  assert tests.try(format($q$select public.save_recipe(%L)$q$, payload::text)) = '42501', 'v1 : non admin refusé (save_recipe)';
  assert tests.try(format($q$select public.save_recipe(%L)$q$, (payload || jsonb_build_object('id', v_id))::text)) = '42501', 'v1 : non admin refusé (mise à jour)';
  assert tests.try(format($q$select public.save_recipe_translation(%L, 'fr', %L)$q$, v_id, tr::text)) = '42501', 'v1 : non admin refusé (traduction)';
  perform tests.logout();
  -- admin : traduction
  perform tests.login(admin_id, 'authenticated');
  perform public.save_recipe_translation(v_id, 'fr', tr);
  assert (select not stale from public.recipe_translations where recipe_id = v_id), 'v1 : traduction réécrite';
  perform tests.logout();

  -- ------------------------------------------------------------ lecture publique v1 inchangée
  perform tests.login(user_id, 'anon');
  select * into r from public.search_recipes('Tarte 0021');
  assert r.id = v_id and r.translation ->> 'title' = 'Pie 0021', 'v1 : search_recipes (anon)';
  assert (select count(*) from public.recipes) > 3, 'v1 : anon lit toujours les recettes';
  perform tests.logout();

  -- ------------------------------------------------------------ nouvelles fonctions : fermées à anon, vides pour un compte sans droit
  perform tests.login(user_id, 'anon');
  assert tests.try('select public.list_cookbook()') = '42501', 'anon : list_cookbook refusée';
  assert tests.try(format('select public.copy_recipe(%L)', v_id)) = '42501', 'anon : copy_recipe refusée';
  assert tests.try('select public.pending_prompts()') = '42501', 'anon : pending_prompts refusée';
  assert tests.try(format('select public.create_share_link(%L)', v_id)) = '42501', 'anon : create_share_link refusée';
  assert public.get_shared_recipe(gen_random_uuid()) is null, 'anon : get_shared_recipe sur un jeton inconnu = NULL';
  perform tests.logout();

  perform tests.login(user_id, 'authenticated');
  assert (select count(*) from public.list_cookbook()) = 0, 'v1 : carnet vide (aucune recette n''a de propriétaire)';
  assert (select count(*) from public.list_shared_with_me()) = 0, 'v1 : rien de partagé';
  assert (select count(*) from public.pending_prompts()) = 0, 'v1 : aucune bannière';
  assert tests.try(format('select public.copy_recipe(%L)', v_id)) = '42501', 'v1 : copie refusée (aucun droit)';
  assert tests.try(format('select public.add_to_cookbook(%L)', v_id)) = '42501', 'v1 : ajout refusé (aucun droit)';
  assert tests.try(format('select public.create_share_link(%L)', v_id)) = '42501', 'v1 : lien refusé (pas l''auteur)';
  assert tests.try(format('select public.recipe_usage(%L)', v_id)) = '42501', 'v1 : usage refusé (pas l''auteur)';
  assert public.remove_from_cookbook(v_id) = false, 'remove_from_cookbook idempotente';
  perform tests.logout();

  -- ------------------------------------------------------------ suppression v1 inchangée
  perform tests.login(admin_id, 'authenticated');
  perform public.delete_recipe(v_id);
  perform public.delete_recipe(v_id2);
  perform tests.logout();
  assert not exists (select 1 from public.recipe_translations where recipe_id = v_id), 'cascade traductions';
  raise notice '[test 0021 v1] non-régression v1 avec 0021 seule : OK';
end $$;

rollback;
