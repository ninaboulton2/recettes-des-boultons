-- Tests de l'ISOLATION avec les données RÉELLEMENT remplies par v2/0018 (plus de simulation), sous les
-- politiques de la bascule v2/0020. Exécuté par run_local.sh APRÈS 0018 puis 0020. Transaction annulée.
--
-- Personnes : a = Nina (propriétaire, support) · b, c = les deux autres membres du groupe « Les Boultons »
--             (b était admin avant 0018, il est maintenant `user`) · d = compte neuf, hors groupe.
begin;

create or replace function tests.rows_affected(q text) returns bigint language plpgsql as $$
declare n bigint;
begin
  execute q; get diagnostics n = row_count; return n;
exception when insufficient_privilege then return -1;
          when others then return -2;
end $$;
grant execute on function tests.rows_affected(text) to anon, authenticated, service_role;

create or replace function tests.visible(q text) returns bigint language plpgsql as $$
declare n bigint;
begin
  execute 'select count(*) from (' || q || ') s' into n; return n;
exception when insufficient_privilege then return -1;
end $$;
grant execute on function tests.visible(text) to anon, authenticated, service_role;

do $$
declare
  a constant uuid := '00000000-0000-0000-0000-00000000000a';
  b constant uuid := '00000000-0000-0000-0000-00000000000b';
  c constant uuid := '00000000-0000-0000-0000-00000000000c';
  d constant uuid := '00000000-0000-0000-0000-0000000000d1';
  r1 constant uuid := '10000000-0000-0000-0000-000000000001';
  r2 constant uuid := '10000000-0000-0000-0000-000000000002';
  r3 constant uuid := '10000000-0000-0000-0000-000000000003';
  n_rec bigint; n_sec bigint; n_ing bigint; n_ins bigint; v_new uuid; v_new_b uuid; v_id uuid; n bigint;
  payload jsonb := $j${
    "title": "Tarte du jour", "category": "desserts et gâteaux", "servings": 6, "lang": "fr",
    "sections": [
      { "name": "Pâte", "type": "ingredients", "ingredients": [ { "name": "farine", "amount": "250", "unit": "g" } ] },
      { "name": "Préparation", "type": "instructions", "instructions": [ "Cuire." ] } ]
  }$j$;
begin
  -- ============================================================ état : 0020 appliquée sur les données de 0018
  assert (select count(*) from public.recipes where owner_id is null) = 0 and (select is_nullable from information_schema.columns
          where table_schema = 'public' and table_name = 'recipes' and column_name = 'owner_id') = 'NO', '0020 appliquée, owner_id NOT NULL';
  select count(*) into n_rec from public.recipes;
  select count(*) into n_sec from public.recipe_sections;
  select count(*) into n_ing from public.recipe_ingredients;
  select count(*) into n_ins from public.instructions;
  assert n_rec = 7 and n_sec > 0 and n_ing > 0 and n_ins > 0, 'données du seed';

  insert into auth.users (id, email, raw_user_meta_data) values (d, 'neuf@test.local', '{}');

  -- ============================================================ Nina : voit et modifie tout, crée à son nom
  perform tests.login(a, 'authenticated');
  assert tests.visible('select 1 from public.recipes') = n_rec, 'Nina voit toutes les recettes';
  assert tests.rows_affected(format($q$update public.recipes set title = 'Gâteau (Nina)' where id = %L$q$, r1)) = 1, 'Nina modifie';
  v_new := public.save_recipe(payload);
  assert (select owner_id from public.recipes where id = v_new) = a, 'save_recipe v1 : owner_id = auth.uid()';
  assert (select visibility from public.recipes where id = v_new) = 'groups', 'visibilité par défaut';
  perform tests.logout();

  -- ============================================================ chaque autre membre : voit tout, modifie, ne supprime pas
  for n in 1..2 loop
    perform tests.login(case n when 1 then b else c end, 'authenticated');
    assert tests.visible('select 1 from public.recipes') = n_rec + 1, 'membre : voit les recettes du groupe (+ la nouvelle de Nina)';
    assert tests.visible('select 1 from public.recipe_sections') > 0 and tests.visible(format('select 1 from public.recipe_sections where recipe_id = %L', r3)) = 4, 'membre : voit les sections';
    assert tests.visible('select 1 from public.recipe_ingredients') > 0 and tests.visible(format('select 1 from public.recipe_ingredients where recipe_id = %L', r3)) = 9, 'membre : voit les ingrédients';
    assert tests.visible('select 1 from public.instructions') > 0 and tests.visible(format('select 1 from public.instructions where recipe_id = %L', r3)) = 4, 'membre : voit les étapes';
    assert tests.visible(format('select 1 from public.recipes where id = %L', r1)) = 1;
    -- modifie une recette Boultons (droit edit_original du groupe, posé par 0018)
    assert tests.rows_affected(format($q$update public.recipes set notes = 'note du membre' where id = %L$q$, r1)) = 1, 'membre : modifie la recette';
    assert tests.rows_affected(format($q$update public.recipe_sections set order_index = order_index where recipe_id = %L$q$, r3)) >= 1, 'membre : modifie les sections';
    assert tests.rows_affected(format($q$insert into public.recipe_sections (recipe_id, name, type, order_index) values (%L, 'Ajout membre', 'mixed', 9)$q$, r1)) = 1, 'membre : ajoute une section';
    -- passe par save_recipe (la fonction du code actuel) : remplacement complet d'une recette de Nina
    v_id := public.save_recipe(jsonb_set(payload, '{id}', to_jsonb(r2::text)));
    assert v_id = r2 and (select title from public.recipes where id = r2) = 'Tarte du jour' and (select owner_id from public.recipes where id = r2) = a,
      'save_recipe par un membre : contenu remplacé, propriétaire inchangé';
    assert (select count(*) from public.recipe_sections where recipe_id = r2) = 2, 'sections de la recette remplacées';
    -- mais : ni suppression, ni propriété, ni visibilité
    assert tests.rows_affected(format($q$delete from public.recipes where id = %L$q$, r1)) = 0, 'membre : ne supprime pas';
    assert tests.rows_affected(format($q$update public.recipes set owner_id = %L where id = %L$q$, case n when 1 then b else c end, r1)) < 0, 'membre : ne prend pas la propriété';
    assert tests.rows_affected(format($q$update public.recipes set visibility = 'private' where id = %L$q$, r1)) < 0, 'membre : ne change pas la visibilité';
    assert tests.rows_affected(format($q$delete from public.recipe_grants where recipe_id = %L$q$, r1)) = 0, 'membre : ne retire pas les droits';
    -- la recette neuve de Nina (sans droit d'édition posé) est lisible, pas modifiable : droit « copy » implicite seulement
    assert tests.rows_affected(format($q$update public.recipes set notes = 'x' where id = %L$q$, v_new)) = 0, 'recette neuve de Nina : pas modifiable par le groupe';
    -- JWT périmé (ancien admin) : rien de plus
    perform tests.logout();
    perform tests.login(case n when 1 then b else c end, 'authenticated', '{"user_role":"admin"}');
    assert tests.rows_affected(format($q$delete from public.recipes where id = %L$q$, r1)) = 0, 'JWT admin périmé : pas de suppression';
    assert tests.visible('select 1 from public.reports') = 0, 'JWT admin périmé : aucun signalement';
    -- photos : écriture pour le dossier d'une recette éditable seulement
    assert tests.rows_affected(format($q$insert into storage.objects (bucket_id, name) values ('recipe-photos', %L)$q$, r1 || '/membre-' || n || '.webp')) = 1, 'membre : téléverse une photo';
    assert tests.rows_affected(format($q$insert into storage.objects (bucket_id, name) values ('recipe-photos', %L)$q$, v_new || '/x.webp')) < 0, 'membre : pas de photo sur une recette non éditable';
    -- ses données personnelles : favoris et carnet restent visibles, courses/planning intacts
    assert tests.visible('select 1 from public.cookbook_entries') = (select count(*) from public.cookbook_entries where user_id = case n when 1 then b else c end), 'carnet : seulement le sien';
    perform tests.logout();
  end loop;

  -- favoris, planning et carnet de b : restent visibles avec les recettes de Nina
  perform tests.login(b, 'authenticated');
  assert tests.visible(format('select 1 from public.favorites f join public.recipes r on r.id = f.recipe_id where f.user_id = %L', b)) = 1, 'favori de b toujours visible';
  assert tests.visible(format('select 1 from public.planning p join public.recipes r on r.id = p.recipe_id where p.user_id = %L', b)) = 1, 'planning de b : recette visible';
  assert tests.visible(format('select 1 from public.cookbook_entries where recipe_id = %L', r1)) = 1, 'b voit sa propre entrée de carnet';
  assert tests.visible(format('select 1 from public.cookbook_entries where user_id = %L', c)) = 0, 'b ne voit pas le carnet de c';
  assert tests.visible('select 1 from public.shopping_items') = (select count(*) from public.shopping_items si join public.shopping_lists sl on sl.id = si.list_id where sl.user_id = b), 'courses de b';
  assert tests.rows_affected(format($q$insert into public.favorites (user_id, recipe_id) values (%L, %L)$q$, b, r2)) = 1, 'b ajoute un favori';
  perform public.add_recipe_to_list(r1, '50000000-0000-0000-0000-00000000000b', null, 1);
  assert (select count(*) from public.shopping_items where list_id = '50000000-0000-0000-0000-00000000000b') >= 7, 'b ajoute une recette de Nina à ses courses';
  assert tests.visible(format('select 1 from public.groups where name = %L', 'Les Boultons')) = 1, 'b voit le groupe';
  assert tests.visible('select 1 from public.group_members') = 3, 'b voit les 3 membres';
  assert tests.visible(format('select email from public.profiles where id = %L', a)) = 0, 'b ne lit pas l''e-mail de Nina';
  assert (select count(*) from public.get_public_profiles(array[a, c])) = 2 and (select count(*) from public.search_users('nina')) = 1, 'b retrouve les autres par leur pseudonyme';
  -- b crée SA recette : propriétaire b, visible des autres en lecture seulement
  v_new_b := public.save_recipe(payload);
  assert (select owner_id from public.recipes where id = v_new_b) = b, 'b : owner_id = b';
  perform tests.logout();
  perform tests.login(c, 'authenticated');
  assert tests.visible(format('select 1 from public.recipes where id = %L', v_new_b)) = 1 and tests.rows_affected(format($q$update public.recipes set notes = 'x' where id = %L$q$, v_new_b)) = 0,
    'c lit la recette neuve de b, sans pouvoir la modifier';
  perform tests.logout();

  -- ============================================================ un compte neuf, hors groupe : ne voit RIEN
  perform tests.login(d, 'authenticated');
  assert tests.visible('select 1 from public.recipes') = 0, 'étranger : aucune recette';
  assert tests.visible('select 1 from public.recipe_sections') = 0 and tests.visible('select 1 from public.recipe_ingredients') = 0
     and tests.visible('select 1 from public.instructions') = 0 and tests.visible('select 1 from public.recipe_translations') = 0, 'étranger : aucun contenu';
  assert tests.visible('select 1 from storage.objects where bucket_id = ''recipe-photos''') = 0, 'étranger : aucune photo listée';
  assert tests.visible('select 1 from public.groups') = 0 and tests.visible('select 1 from public.group_members') = 0
     and tests.visible('select 1 from public.recipe_grants') = 0 and tests.visible('select 1 from public.cookbook_entries') = 0
     and tests.visible('select 1 from public.categories') = 0, 'étranger : ni groupe, ni droits, ni carnets, ni catégories';
  assert tests.rows_affected(format($q$update public.recipes set title = 'piraté' where id = %L$q$, r1)) = 0, 'étranger : ne modifie rien';
  assert tests.rows_affected(format($q$delete from public.recipes where id = %L$q$, r1)) = 0, 'étranger : ne supprime rien';
  assert tests.rows_affected(format($q$insert into public.favorites (user_id, recipe_id) values (%L, %L)$q$, d, r1)) < 0, 'étranger : pas de favori sur une recette illisible';
  assert tests.rows_affected(format($q$insert into public.recipe_sections (recipe_id, name, type, order_index) values (%L, 'pirate', 'mixed', 9)$q$, r1)) < 0, 'étranger : pas de section';
  assert tests.rows_affected(format($q$insert into storage.objects (bucket_id, name) values ('recipe-photos', %L)$q$, r1 || '/pirate.webp')) < 0, 'étranger : pas de photo';
  assert tests.rows_affected(format($q$insert into public.group_members (group_id, user_id, role) values ((select id from public.groups limit 1), %L, 'member')$q$, d)) < 0, 'étranger : ne rejoint pas sans invitation';
  assert (select count(*) from public.get_public_profiles(array[a, b, c])) = 0, 'étranger : ne voit aucun pseudonyme (non lié)';
  assert (select count(*) from public.search_users('test')) = 3 and (select count(*) from public.search_users('bob')) = 1, 'étranger : retrouve les 3 comptes par la recherche (display_name)';
  perform tests.logout();

  perform tests.login(null::uuid, 'anon');
  assert tests.visible('select 1 from public.recipes') = 0 and tests.visible('select 1 from public.recipe_sections') = 0, 'visiteur sans compte : rien';
  perform tests.logout();

  -- ============================================================ Nina (support) : lit son carnet, pas celui des autres
  perform tests.login(a, 'authenticated');
  assert tests.visible('select 1 from public.cookbook_entries') = 0, 'Nina n''a pas d''entrée de carnet (ses recettes sont déjà chez elle)';
  assert tests.visible('select 1 from public.recipe_grants') = n_rec, 'Nina voit les droits de ses recettes (les 7 + aucun pour la nouvelle)';
  assert tests.rows_affected(format($q$delete from public.recipes where id = %L$q$, v_new)) = 1, 'Nina supprime sa recette';
  perform tests.logout();
  raise notice '[switchover 0018 rempli] isolation sur les données réelles de 0018 : OK';
end $$;

rollback;
