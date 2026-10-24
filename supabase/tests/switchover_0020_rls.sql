-- Tests de la BASCULE v2/0020 : les nouvelles politiques de recipes, recipe_sections,
-- recipe_ingredients, instructions, recipe_translations, favorites (insertion) et du bucket recipe-photos.
-- Exécuté par run_local.sh APRÈS fill_simulated.sql (owner_id = compte admin du seed partout) et
-- APRÈS l'application de supabase/v2/0020_rls_switchover.sql. Transaction annulée à la fin.
--
-- Personnes : A auteur · B membre du groupe de A · C amie de A (hors groupe) · D étranger ·
--             S support (compte admin du seed, …0a, propriétaire des recettes du seed)
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
  s  constant uuid := '00000000-0000-0000-0000-00000000000a';
  ua constant uuid := '00000000-0000-0000-0000-0000000000a1';
  ub constant uuid := '00000000-0000-0000-0000-0000000000b1';
  uc constant uuid := '00000000-0000-0000-0000-0000000000c1';
  ud constant uuid := '00000000-0000-0000-0000-0000000000d1';
  seed_r constant uuid := '10000000-0000-0000-0000-000000000001';
  r_old uuid; r_priv uuid; r_edit uuid; r_boult uuid; r_read uuid; r_rep uuid; r_copy uuid; r_save uuid; r_bsave uuid;
  g1 uuid; gg uuid; gb uuid; sec uuid; cat_a uuid; cat_b uuid; n bigint; v_list uuid;
  photo_old text; photo_priv text;
  payload jsonb := $j${
    "title": "Tarte switchover", "category": "desserts et gâteaux", "servings": 6, "lang": "fr",
    "sections": [
      { "name": "Pâte", "type": "ingredients", "ingredients": [ { "name": "farine", "amount": "250", "unit": "g" } ] },
      { "name": "Préparation", "type": "instructions", "instructions": [ "Cuire." ] } ]
  }$j$;
  tr jsonb := $j${
    "title": "Pie switchover", "source_hash": "h1", "model": "mock", "tags": [],
    "content": { "sections": [ { "name": "Dough", "ingredients": [ { "name": "flour", "amount": null, "unit": null } ], "instructions": [] },
                               { "name": "Method", "ingredients": [], "instructions": ["Bake."] } ] }
  }$j$;
begin
  -- ============================================================ état après la bascule
  assert (select count(*) from public.recipes where owner_id is null) = 0, 'owner_id rempli';
  assert (select is_nullable from information_schema.columns where table_schema = 'public' and table_name = 'recipes' and column_name = 'owner_id') = 'NO', 'owner_id NOT NULL';
  assert not exists (select 1 from pg_policies where schemaname = 'public' and tablename in ('recipes', 'recipe_sections', 'recipe_ingredients', 'instructions', 'recipe_translations')
                      and (roles <> '{authenticated}' or qual ~ 'is_admin' or with_check ~ 'is_admin')), 'politiques résiduelles de la v1';
  begin insert into public.recipes (title, category) values ('sans propriétaire', 'plats'); raise exception 'recette sans propriétaire acceptée (superuser)';
  exception when not_null_violation then null; end;

  insert into auth.users (id, email, raw_user_meta_data) values
    (ua, 'a2@test.local', '{}'), (ub, 'b2@test.local', '{}'), (uc, 'c2@test.local', '{}'), (ud, 'd2@test.local', '{}');
  insert into public.groups (name, created_by) values ('Groupe A', ua) returning id into g1;
  insert into public.group_members (group_id, user_id, role) values (g1, ua, 'creator'), (g1, ub, 'member');
  insert into public.friendships (requester_id, addressee_id, status, responded_at) values (ua, uc, 'accepted', now());
  insert into public.categories (owner_id, slug, name_fr) values (ua, 'desserts', 'Desserts') returning id into cat_a;
  insert into public.categories (owner_id, slug, name_fr) values (ub, 'desserts', 'Desserts') returning id into cat_b;

  -- ============================================================ A crée (le DEFAULT auth.uid() remplit owner_id)
  perform tests.login(ua, 'authenticated');
  insert into public.recipes (title, category) values ('Gâteau de A', 'desserts') returning id into r_old;
  assert (select owner_id from public.recipes where id = r_old) = ua, 'owner_id par défaut = auth.uid()';
  assert tests.rows_affected(format($q$insert into public.recipes (title, category, owner_id) values ('Usurpée', 'plats', %L)$q$, ub)) < 0, 'recette au nom d''un autre';
  insert into public.recipes (title, category, visibility) values ('Privée de A', 'plats', 'private') returning id into r_priv;
  insert into public.recipes (title, category, visibility) values ('Éditable', 'plats', 'private') returning id into r_edit;
  insert into public.recipes (title, category, visibility) values ('Boultons', 'plats', 'groups') returning id into r_boult;
  insert into public.recipes (title, category, visibility) values ('En lecture', 'plats', 'private') returning id into r_read;
  insert into public.recipes (title, category, visibility) values ('Signalée', 'plats', 'groups') returning id into r_rep;
  insert into public.recipe_sections (recipe_id, name, type, order_index) values (r_old, 'Pâte', 'ingredients', 0) returning id into sec;
  insert into public.recipe_ingredients (recipe_id, section_id, name, order_index) values (r_old, sec, 'farine', 0);
  insert into public.instructions (recipe_id, section_id, content, order_index) values (r_old, sec, 'Cuire.', 0);
  insert into public.recipe_translations (recipe_id, locale, title, source_hash) values (r_old, 'en', 'A cake', 'h');
  insert into public.recipe_sections (recipe_id, name, type, order_index) values (r_priv, 'Secret', 'ingredients', 0);
  assert tests.rows_affected(format($q$update public.recipes set category_id = %L where id = %L$q$, cat_b, r_old)) < 0, 'catégorie d''un autre';
  assert tests.rows_affected(format($q$update public.recipes set category_id = %L, visibility = 'groups' where id = %L$q$, cat_a, r_old)) = 1, 'sa catégorie';
  assert tests.rows_affected(format($q$update public.recipes set owner_id = %L where id = %L$q$, ub, r_old)) < 0, 'don de propriété';
  assert tests.rows_affected(format($q$update public.recipes set visibility = 'private' where id = %L$q$, r_old)) = 1, 'l''auteur change la visibilité';
  assert tests.rows_affected(format($q$update public.recipes set visibility = 'groups' where id = %L$q$, r_old)) = 1;
  perform tests.logout();

  -- ============================================================ B : lit et copie, ne modifie pas
  perform tests.login(ub, 'authenticated');
  assert tests.visible(format('select 1 from public.recipes where id = %L', r_old)) = 1, 'B lit la recette de groupe';
  assert tests.visible(format('select 1 from public.recipe_sections where recipe_id = %L', r_old)) = 1
     and tests.visible(format('select 1 from public.recipe_ingredients where recipe_id = %L', r_old)) = 1
     and tests.visible(format('select 1 from public.instructions where recipe_id = %L', r_old)) = 1
     and tests.visible(format('select 1 from public.recipe_translations where recipe_id = %L', r_old)) = 1, 'B lit le contenu';
  assert tests.visible(format('select 1 from public.recipes where id = %L', r_priv)) = 0 and tests.visible(format('select 1 from public.recipe_sections where recipe_id = %L', r_priv)) = 0,
    'B lit une recette privée';
  assert tests.rows_affected(format($q$update public.recipes set title = 'Piratée' where id = %L$q$, r_old)) = 0, 'B modifie sans edit_original';
  assert tests.rows_affected(format($q$delete from public.recipes where id = %L$q$, r_old)) = 0, 'B supprime la recette de A';
  assert tests.rows_affected(format($q$update public.recipe_sections set name = 'X' where recipe_id = %L$q$, r_old)) = 0, 'B modifie une section';
  assert tests.rows_affected(format($q$update public.recipe_ingredients set name = 'X' where recipe_id = %L$q$, r_old)) = 0;
  assert tests.rows_affected(format($q$update public.instructions set content = 'X' where recipe_id = %L$q$, r_old)) = 0;
  assert tests.rows_affected(format($q$update public.recipe_translations set title = 'X' where recipe_id = %L$q$, r_old)) = 0;
  assert tests.rows_affected(format($q$delete from public.recipe_sections where recipe_id = %L$q$, r_old)) = 0;
  assert tests.rows_affected(format($q$insert into public.recipe_sections (recipe_id, name, type, order_index) values (%L, 'Intrus', 'ingredients', 5)$q$, r_old)) < 0, 'B ajoute une section';
  assert tests.rows_affected(format($q$insert into public.instructions (recipe_id, content, order_index) values (%L, 'Intrus', 5)$q$, r_old)) < 0;
  -- copie : copied_from autorisé quand on peut copier ; refusé sur une recette illisible
  insert into public.recipes (title, category, copied_from) values ('Ma copie', 'desserts', r_old) returning id into r_copy;
  assert (select owner_id from public.recipes where id = r_copy) = ub and (select copied_from from public.recipes where id = r_copy) = r_old;
  assert tests.rows_affected(format($q$insert into public.recipes (title, category, copied_from) values ('Copie interdite', 'plats', %L)$q$, r_priv)) < 0, 'copie d''une recette illisible';
  assert tests.rows_affected(format($q$update public.recipes set title = 'Ma copie modifiée' where id = %L$q$, r_copy)) = 1, 'le propriétaire modifie sa copie';
  perform tests.logout();

  -- ============================================================ D et anon : rien
  perform tests.login(ud, 'authenticated');
  assert tests.visible(format('select 1 from public.recipes where owner_id = %L', ua)) = 0, 'D voit des recettes de A';
  assert tests.visible(format('select 1 from public.recipe_sections where recipe_id in (%L, %L)', r_old, r_priv)) = 0
     and tests.visible(format('select 1 from public.recipe_translations where recipe_id = %L', r_old)) = 0, 'D voit du contenu';
  assert tests.visible('select 1 from public.recipes') = 0, 'D (sans lien) ne voit aucune recette, même celles du seed';
  assert (select count(*) from public.search_recipes('Gâteau')) = 0, 'search_recipes : D ne trouve rien';
  perform tests.logout();
  perform tests.login(ud, 'anon');
  assert tests.visible('select 1 from public.recipes') = 0 and tests.visible('select 1 from public.recipe_sections') = 0
     and tests.visible('select 1 from public.instructions') = 0 and tests.visible('select 1 from public.recipe_ingredients') = 0
     and tests.visible('select 1 from public.recipe_translations') = 0, 'le public ne lit plus rien';
  perform tests.logout();

  -- ============================================================ droits explicites : read, copy, edit_original
  perform tests.login(ua, 'authenticated');
  insert into public.recipe_grants (recipe_id, grantee_user_id, permission, granted_by) values (r_read, ub, 'read', ua);
  insert into public.recipe_grants (recipe_id, grantee_user_id, permission, granted_by) values (r_priv, uc, 'copy', ua);
  insert into public.recipe_grants (recipe_id, grantee_user_id, permission, granted_by) values (r_edit, ub, 'edit_original', ua) returning id into gb;
  insert into public.recipe_grants (recipe_id, grantee_group_id, permission, granted_by) values (r_boult, g1, 'edit_original', ua) returning id into gg;
  perform tests.logout();

  perform tests.login(ub, 'authenticated');
  assert tests.visible(format('select 1 from public.recipes where id = %L', r_read)) = 1, 'private + read : lisible';
  assert tests.rows_affected(format($q$update public.recipes set title = 'x' where id = %L$q$, r_read)) = 0, 'read ne modifie pas';
  assert tests.rows_affected(format($q$insert into public.recipes (title, category, copied_from) values ('c', 'plats', %L)$q$, r_read)) < 0, 'read ne copie pas';
  -- edit_original : modifie le contenu, pas la propriété ni le partage
  assert tests.rows_affected(format($q$update public.recipes set title = 'Éditée par B' where id = %L$q$, r_edit)) = 1, 'edit_original modifie';
  assert tests.rows_affected(format($q$update public.recipes set owner_id = %L where id = %L$q$, ub, r_edit)) < 0, 'l''éditeur prend la propriété';
  assert tests.rows_affected(format($q$update public.recipes set visibility = 'groups' where id = %L$q$, r_edit)) < 0, 'l''éditeur change la visibilité';
  assert tests.rows_affected(format($q$update public.recipes set copied_from = %L where id = %L$q$, r_old, r_edit)) < 0, 'l''éditeur change copied_from';
  assert tests.rows_affected(format($q$insert into public.recipe_sections (recipe_id, name, type, order_index) values (%L, 'Ajoutée par B', 'ingredients', 1)$q$, r_edit)) = 1, 'l''éditeur ajoute du contenu';
  assert tests.rows_affected(format($q$delete from public.recipe_sections where recipe_id = %L$q$, r_edit)) = 1;
  assert tests.rows_affected(format($q$delete from public.recipes where id = %L$q$, r_edit)) = 0, 'l''éditeur supprime l''original';
  assert tests.rows_affected(format($q$update public.recipes set title = 'Boultons édité' where id = %L$q$, r_boult)) = 1, 'droit edit_original du groupe';
  assert tests.rows_affected(format($q$insert into public.recipe_grants (recipe_id, grantee_user_id, permission, granted_by) values (%L, %L, 'read', %L)$q$, r_edit, ud, ub)) < 0,
    'l''éditeur donne un droit direct';
  perform tests.logout();
  perform tests.login(uc, 'authenticated');
  assert tests.visible(format('select 1 from public.recipes where id = %L', r_priv)) = 1 and tests.visible(format('select 1 from public.recipe_sections where recipe_id = %L', r_priv)) = 1, 'C lit via son droit';
  assert tests.visible(format('select 1 from public.recipes where id = %L', r_old)) = 0, 'C (amie) ne lit pas la recette de groupe';
  assert tests.rows_affected(format($q$update public.recipes set title = 'x' where id = %L$q$, r_priv)) = 0;
  perform tests.logout();

  -- ============================================================ favoris : seulement ce qu'on peut lire
  perform tests.login(ub, 'authenticated');
  assert tests.rows_affected(format($q$insert into public.favorites (user_id, recipe_id) values (%L, %L)$q$, ub, r_old)) = 1, 'favori lisible';
  assert tests.rows_affected(format($q$insert into public.favorites (user_id, recipe_id) values (%L, %L)$q$, ub, r_priv)) < 0, 'favori d''une recette illisible';
  perform tests.logout();
  perform tests.login(ud, 'authenticated');
  assert tests.rows_affected(format($q$insert into public.favorites (user_id, recipe_id) values (%L, %L)$q$, ud, r_old)) < 0, 'D met en favori';
  perform tests.logout();

  -- ============================================================ support : lit pour modérer, supprime seulement sur signalement
  perform tests.login(s, 'authenticated');
  assert tests.visible(format('select 1 from public.recipes where id in (%L, %L)', r_old, r_priv)) = 0, 'le support ne lit pas les recettes non signalées';
  assert tests.rows_affected(format($q$update public.recipes set title = 'modifié par le support' where id = %L$q$, r_old)) = 0, 'le support modifie le contenu des autres';
  assert tests.rows_affected(format($q$update public.recipe_sections set name = 'x' where recipe_id = %L$q$, r_old)) = 0;
  assert tests.rows_affected(format($q$delete from public.recipes where id = %L$q$, r_rep)) = 0, 'le support supprime sans signalement';
  perform tests.logout();
  perform tests.login(ud, 'authenticated');
  insert into public.reports (recipe_id, reporter_id, reason) values (r_rep, ud, 'illegal');
  perform tests.logout();
  perform tests.login(s, 'authenticated');
  assert tests.rows_affected(format($q$delete from public.recipes where id = %L$q$, r_rep)) = 1, 'le support supprime sur signalement';
  assert (select recipe_id from public.reports where reporter_id = ud) is null, 'le signalement reste, recette_id null';
  perform tests.logout();

  -- ============================================================ v1 : fonctions qui passent par les nouvelles politiques
  perform tests.login(s, 'authenticated');
  r_save := public.save_recipe(payload || jsonb_build_object('translation', tr));
  assert (select owner_id from public.recipes where id = r_save) = s, 'save_recipe : owner_id = auth.uid() (DEFAULT)';
  perform public.save_recipe_translation(r_save, 'fr', tr);
  assert (select count(*) from public.recipe_translations where recipe_id = r_save) = 1, 'save_recipe_translation';
  -- modification par save_recipe d'une recette dont on est l'auteur
  perform public.save_recipe(payload || jsonb_build_object('id', r_save, 'title', 'Tarte modifiée'));
  assert (select title from public.recipes where id = r_save) = 'Tarte modifiée', 'save_recipe (mise à jour)';
  assert exists (select 1 from public.search_recipes('Tarte modifiée') where id = r_save), 'search_recipes';   -- le support lit aussi les autres recettes
  perform tests.logout();
  perform tests.login(ub, 'authenticated');
  assert (select count(*) from public.search_recipes('Gâteau')) = 1 and (select count(*) from public.search_recipes('Privée')) = 0, 'search_recipes ne renvoie que le lisible';
  insert into public.shopping_lists (user_id, name) values (ub, 'Liste B') returning id into v_list;
  perform public.add_recipe_to_list(r_old, v_list, null, 1);
  assert (select count(*) from public.shopping_items where list_id = v_list) = 1, 'add_recipe_to_list sur une recette de groupe';
  -- tout compte connecté peut désormais créer SES recettes (owner_id = lui) ; pas modifier celles des autres
  r_bsave := public.save_recipe(payload || '{"title": "Tarte de B"}');
  assert (select owner_id from public.recipes where id = r_bsave) = ub, 'save_recipe : un membre crée sa recette';
  begin
    perform public.save_recipe(payload || jsonb_build_object('id', r_read, 'title', 'Détournée'));
  exception when others then null; end;
  assert (select title from public.recipes where id = r_read) = 'En lecture', 'save_recipe a modifié une recette en lecture seule';
  perform tests.logout();

  -- ============================================================ photos (bucket recipe-photos)
  photo_old := r_old || '/photo.webp';
  photo_priv := r_priv || '/photo.webp';
  perform tests.login(ua, 'authenticated');
  assert tests.rows_affected(format($q$insert into storage.objects (bucket_id, name) values ('recipe-photos', %L)$q$, photo_old)) = 1, 'A téléverse pour sa recette';
  assert tests.rows_affected(format($q$insert into storage.objects (bucket_id, name) values ('recipe-photos', %L)$q$, photo_priv)) = 1;
  assert tests.rows_affected($q$insert into storage.objects (bucket_id, name) values ('recipe-photos', 'pas-un-uuid/x.webp')$q$) < 0, 'chemin invalide';
  perform tests.logout();
  perform tests.login(ub, 'authenticated');
  assert tests.visible(format($q$select 1 from storage.objects where bucket_id = 'recipe-photos' and name = %L$q$, photo_old)) = 1, 'B voit la photo d''une recette lisible';
  assert tests.visible(format($q$select 1 from storage.objects where bucket_id = 'recipe-photos' and name = %L$q$, photo_priv)) = 0, 'B voit la photo d''une recette privée';
  assert tests.rows_affected(format($q$insert into storage.objects (bucket_id, name) values ('recipe-photos', %L)$q$, r_old || '/intrus.webp')) < 0, 'B téléverse chez A';
  assert tests.rows_affected(format($q$delete from storage.objects where name = %L$q$, photo_old)) = 0, 'B supprime la photo de A';
  assert tests.rows_affected(format($q$insert into storage.objects (bucket_id, name) values ('recipe-photos', %L)$q$, r_edit || '/b.webp')) = 1, 'un éditeur téléverse';
  perform tests.logout();
  perform tests.login(ud, 'authenticated');
  assert tests.visible(format($q$select 1 from storage.objects where bucket_id = 'recipe-photos' and name = %L$q$, photo_old)) = 0, 'D voit une photo';
  perform tests.logout();
  perform tests.login(ud, 'anon');
  assert tests.visible($q$select 1 from storage.objects where bucket_id = 'recipe-photos'$q$) = 0, 'le public lit les photos (bucket public : à passer en privé en phase 8)';
  perform tests.logout();

  -- ============================================================ départ du groupe et suppression
  delete from public.group_members where group_id = g1 and user_id = ub;
  perform tests.login(ub, 'authenticated');
  assert tests.visible(format('select 1 from public.recipes where id in (%L, %L)', r_old, r_boult)) = 0, 'B garde l''accès après son départ';
  assert tests.visible(format('select 1 from public.recipes where id = %L', r_read)) = 0, 'droit direct conservé après le départ du dernier groupe commun';
  assert tests.rows_affected(format($q$update public.recipes set title = 'x' where id = %L$q$, r_boult)) = 0, 'B modifie après son départ';
  perform tests.logout();
  insert into public.cookbook_entries (user_id, recipe_id) values (uc, r_priv);
  perform tests.login(ua, 'authenticated');
  assert tests.rows_affected(format($q$delete from public.recipes where id = %L$q$, r_priv)) = 1, 'l''auteur supprime';
  perform tests.logout();
  assert not exists (select 1 from public.cookbook_entries where recipe_id = r_priv), 'la recette supprimée reste dans un carnet';
  assert not exists (select 1 from public.recipe_sections where recipe_id = r_priv), 'contenu orphelin';
  -- l'original supprimé : la copie de B survit, copied_from -> null
  assert (select copied_from from public.recipes where id = r_copy) = r_old, 'copied_from avant suppression';
  delete from public.recipes where id = r_old;
  assert (select copied_from from public.recipes where id = r_copy) is null, 'copied_from après suppression de l''original';
  assert exists (select 1 from public.recipes where id = r_copy), 'la copie doit survivre';

  -- ============================================================ recettes du seed (propriétaire = S) : isolement
  perform tests.login(ud, 'authenticated');
  assert tests.visible(format('select 1 from public.recipes where id = %L', seed_r)) = 0;
  perform tests.logout();
  perform tests.login(s, 'authenticated');
  assert tests.visible(format('select 1 from public.recipes where id = %L', seed_r)) = 1, 'S lit ses recettes';
  perform tests.logout();
  raise notice '[switchover 0020] recettes, contenu, favoris, photos, support, fonctions v1 sous les nouvelles politiques : OK';
end $$;

-- ---------------------------------------------------------------- corrections de la relecture de sécurité
do $$
declare
  s  constant uuid := '00000000-0000-0000-0000-00000000000a';
  ua constant uuid := '00000000-0000-0000-0000-0000000000a2';
  ub constant uuid := '00000000-0000-0000-0000-0000000000b2';
  g uuid; ra uuid; rb uuid; rc uuid; rpriv uuid; sec_a uuid; sec_b uuid; cat_a uuid; cat_b uuid; rep uuid;
begin
  insert into auth.users (id, email, raw_user_meta_data) values (ua, 'a3@test.local', '{}'), (ub, 'b3@test.local', '{}');
  insert into public.groups (name, created_by) values ('Relecture', ua) returning id into g;
  insert into public.group_members (group_id, user_id, role) values (g, ua, 'creator'), (g, ub, 'member');
  insert into public.categories (owner_id, slug, name_fr) values (ua, 'cat', 'Cat A') returning id into cat_a;
  insert into public.categories (owner_id, slug, name_fr) values (ub, 'cat', 'Cat B') returning id into cat_b;
  insert into public.recipes (title, category, owner_id, visibility, category_id) values ('Recette A', 'plats', ua, 'groups', cat_a) returning id into ra;
  insert into public.recipes (title, category, owner_id, visibility) values ('Privée A', 'plats', ua, 'private') returning id into rpriv;
  insert into public.recipe_sections (recipe_id, name, type, order_index) values (ra, 'Section A', 'ingredients', 0) returning id into sec_a;

  -- (1) empoisonnement par section étrangère
  perform tests.login(ub, 'authenticated');
  insert into public.recipes (title, category) values ('Recette B', 'plats') returning id into rb;
  insert into public.recipe_sections (recipe_id, name, type, order_index) values (rb, 'Section B', 'ingredients', 0) returning id into sec_b;
  assert tests.visible(format('select 1 from public.recipe_sections where id = %L', sec_a)) = 1, 'B lit la section de A (prérequis du scénario)';
  assert tests.rows_affected(format($q$insert into public.recipe_ingredients (recipe_id, section_id, name, order_index) values (%L, %L, 'poison', 0)$q$, rb, sec_a)) < 0,
    'ingrédient de B rattaché à la section de A';
  assert tests.rows_affected(format($q$insert into public.instructions (recipe_id, section_id, content, order_index) values (%L, %L, 'poison', 0)$q$, rb, sec_a)) < 0,
    'étape de B rattachée à la section de A';
  assert tests.rows_affected(format($q$insert into public.recipe_ingredients (recipe_id, section_id, name, order_index) values (%L, %L, 'ok', 0)$q$, rb, sec_b)) = 1, 'section de sa propre recette';
  assert tests.rows_affected(format($q$insert into public.instructions (recipe_id, section_id, content, order_index) values (%L, %L, 'ok', 0)$q$, rb, sec_b)) = 1;
  assert tests.rows_affected(format($q$insert into public.instructions (recipe_id, content, order_index) values (%L, 'sans section', 1)$q$, rb)) = 1, 'section NULL permise';
  assert tests.rows_affected(format($q$update public.recipe_ingredients set section_id = %L where recipe_id = %L$q$, sec_a, rb)) < 0, 'UPDATE vers la section de A (ingrédients)';
  assert tests.rows_affected(format($q$update public.instructions set section_id = %L where recipe_id = %L$q$, sec_a, rb)) < 0, 'UPDATE vers la section de A (étapes)';
  perform tests.logout();
  perform tests.login(ua, 'authenticated');
  assert tests.rows_affected(format($q$delete from public.recipe_sections where id = %L$q$, sec_a)) = 1, 'A supprime sa section sans obstacle';
  perform tests.logout();

  -- (2) un éditeur met à jour une recette dont la catégorie est celle de l'auteur
  perform tests.login(ua, 'authenticated');
  insert into public.recipe_grants (recipe_id, grantee_user_id, permission, granted_by) values (ra, ub, 'edit_original', ua);
  perform tests.logout();
  perform tests.login(ub, 'authenticated');
  assert tests.rows_affected(format($q$update public.recipes set title = 'Retitrée par B' where id = %L$q$, ra)) = 1, 'éditeur : mise à jour avec category_id non NULL';
  assert (select category_id from public.recipes where id = ra) = cat_a, 'catégorie de l''auteur conservée';
  assert tests.rows_affected(format($q$update public.recipes set category_id = %L where id = %L$q$, cat_b, ra)) < 0, 'éditeur : catégorie qui n''est pas celle de l''auteur';
  perform tests.logout();

  -- (3) support : recettes signalées seulement ; profils : sa ligne seulement
  perform tests.login(s, 'authenticated');
  assert tests.visible(format('select 1 from public.recipes where id = %L', rpriv)) = 0, 'support : recette privée non signalée';
  assert tests.visible(format('select 1 from public.recipes where id = %L', ra)) = 0 and tests.visible(format('select 1 from public.recipe_sections where recipe_id = %L', ra)) = 0, 'support : recette de groupe non signalée';
  assert tests.visible('select email from public.profiles') = 1, 'support : seulement sa ligne de profil';
  assert tests.rows_affected(format($q$update public.profiles set name = 'Piraté' where id = %L$q$, ua)) = 0, 'support modifie le profil d''un autre';
  assert tests.rows_affected(format($q$update public.profiles set name = 'Moi' where id = %L$q$, s)) = 1, 'support modifie son profil';
  perform tests.logout();
  perform tests.login(ub, 'authenticated');
  insert into public.reports (recipe_id, reporter_id, reason) values (rpriv, ub, 'spam') returning id into rep;
  perform tests.logout();
  perform tests.login(s, 'authenticated');
  assert tests.visible(format('select 1 from public.recipes where id = %L', rpriv)) = 1, 'support : recette signalée lisible';
  assert tests.rows_affected(format($q$update public.recipes set title = 'x' where id = %L$q$, rpriv)) = 0, 'support : jamais de modification';
  perform tests.logout();
  perform tests.login(ub, 'authenticated');
  assert tests.visible(format('select email from public.profiles where id = %L', ua)) = 0, 'B lit l''e-mail de A';
  assert tests.visible(format('select email from public.profiles where id = %L', ub)) = 1, 'B lit son propre profil';
  assert tests.rows_affected(format($q$update public.profiles set name = 'Piraté' where id = %L$q$, ua)) = 0;
  perform tests.logout();

  -- (7) copied_from : seulement vers une recette copiable
  perform tests.login(ub, 'authenticated');
  assert tests.rows_affected(format($q$update public.recipes set copied_from = %L where id = %L$q$, rpriv, rb)) < 0, 'copied_from vers une recette illisible';
  assert tests.rows_affected(format($q$update public.recipes set copied_from = %L where id = %L$q$, ra, rb)) = 1, 'copied_from vers une recette copiable';
  assert tests.rows_affected(format($q$update public.recipes set copied_from = null where id = %L$q$, rb)) = 1, 'copied_from NULL permis';

  -- (9) photo_path dans le dossier de sa propre recette
  assert tests.rows_affected(format($q$update public.recipes set photo_path = %L where id = %L$q$, ra || '/x.webp', rb)) < 0, 'photo d''une autre recette';
  assert tests.rows_affected(format($q$update public.recipes set photo_path = %L where id = %L$q$, rb || '/x.webp', rb)) = 1, 'photo de sa recette';
  assert tests.rows_affected(format($q$update public.recipes set photo_path = null where id = %L$q$, rb)) = 1;
  perform tests.logout();
  raise notice '[switchover 0020] corrections relecture : OK';
end $$;

rollback;
