-- Tests 0021 — fonctions métier côté recettes, sous la chaîne COMPLÈTE 0017 → 0019 → 0021 → 0018 (remplissage) → 0020
-- (bascule). Exécuté par run_local.sh après switchover_0018_filled.sql. Transaction annulée.
--
-- Personnes : a = Nina (auteure, propriétaire des 7 recettes du seed, créatrice du groupe « Les Boultons »)
--             b = membre du groupe de a (droit de groupe edit_original sur les recettes Boultons)
--             c = autre membre du groupe          d = étranger (aucun lien)
--             e = AMIE de a (hors groupe)          f = amie de a ET de e (hors groupe)
-- Pour chaque fonction : le « oui », puis le « non » pour un étranger, un membre de groupe et une amie.
begin;

create or replace function tests.try(q text) returns text language plpgsql as $$
begin execute q; return 'ok'; exception when others then return sqlstate; end $$;
grant execute on function tests.try(text) to anon, authenticated, service_role;

do $$
declare
  a constant uuid := '00000000-0000-0000-0000-00000000000a';
  b constant uuid := '00000000-0000-0000-0000-00000000000b';
  c constant uuid := '00000000-0000-0000-0000-00000000000c';
  d constant uuid := '00000000-0000-0000-0000-0000000000d2';
  e constant uuid := '00000000-0000-0000-0000-0000000000e2';
  f constant uuid := '00000000-0000-0000-0000-0000000000f2';
  r1 constant uuid := '10000000-0000-0000-0000-000000000001';
  r2 constant uuid := '10000000-0000-0000-0000-000000000002';
  gb uuid; g2 uuid; g3 uuid;
  rp uuid; rg uuid; rn uuid; rb uuid; rc uuid; rpriv uuid; copy_id uuid; copy2 uuid;
  cat_a uuid; cat_b uuid; cat_e uuid; gr1 uuid; gr2 uuid; gr3 uuid; gr4 uuid; tok uuid; tok2 uuid;
  n bigint; n2 bigint; n3 bigint; j jsonb; k record; t text; v_uuid uuid; h uuid := '00000000-0000-0000-0000-0000000000a3';
  payload jsonb := $j${
    "title": "Tarte 0021 privée", "category": "desserts et gâteaux", "servings": 6, "lang": "fr", "visibility": "private",
    "description": "Une tarte.", "tags": ["fruit"], "notes": "Servir tiède.",
    "sections": [
      { "name": "Pâte", "type": "ingredients", "ingredients": [
          { "name": "farine", "amount": "250", "unit": "g" }, { "name": "beurre", "amount": "125", "unit": "g" } ] },
      { "name": "Garniture", "type": "ingredients", "ingredients": [ { "name": "pommes", "amount": "4", "unit": "unit" } ] },
      { "name": "Préparation", "type": "instructions", "instructions": [ "Étaler.", "Cuire." ] } ]
  }$j$;
  tr jsonb := $j${
    "title": "Private pie 0021", "description": "A pie.", "source_hash": "h1", "model": "mock", "tags": ["fruit"],
    "content": { "sections": [
      { "name": "Dough", "ingredients": [ { "name": "flour", "amount": null, "unit": null }, { "name": "butter", "amount": null, "unit": null } ], "instructions": [] },
      { "name": "Filling", "ingredients": [ { "name": "apples", "amount": null, "unit": null } ], "instructions": [] },
      { "name": "Method", "ingredients": [], "instructions": ["Roll.", "Bake."] } ] }
  }$j$;
begin
  -- ============================================================ état de départ : chaîne complète appliquée
  assert (select attnotnull from pg_attribute where attrelid = 'public.recipes'::regclass and attname = 'owner_id'), '0020 appliquée';
  select id into gb from public.groups where name = 'Les Boultons';
  assert gb is not null and (select count(*) from public.recipes where owner_id = a) = 7, 'données de 0018';

  -- le remplissage 0018 a mis les favoris de b et c dans leur carnet : on repart d'un carnet vide (annulé en fin de test)
  delete from public.cookbook_entries where user_id in (b, c);
  insert into auth.users (id, email, raw_user_meta_data) values
    (d, 'dave-etranger@test.local', '{}'), (e, 'eve-amie@test.local', '{}'), (f, 'fay-amie-de-eve@test.local', '{}');
  update public.profiles set display_name = 'Dave Étranger' where id = d;
  update public.profiles set display_name = 'Eve Amie'      where id = e;
  update public.profiles set display_name = 'Fay Amie'      where id = f;
  insert into public.friendships (requester_id, addressee_id, status, responded_at) values
    (a, e, 'accepted', now()), (e, f, 'accepted', now()), (a, f, 'accepted', now());
  insert into public.groups (name, created_by) values ('G2 de Nina', a) returning id into g2;
  insert into public.group_members (group_id, user_id, role) values (g2, a, 'creator'), (g2, c, 'member');
  insert into public.groups (name, created_by) values ('G3 de Dave', d) returning id into g3;
  insert into public.group_members (group_id, user_id, role) values (g3, d, 'creator');
  select id into cat_a from public.categories where owner_id = a order by sort_order limit 1;
  select id into cat_b from public.categories where owner_id = b order by sort_order limit 1;
  insert into public.categories (owner_id, slug, name_fr) values (e, 'tartes', 'Tartes') returning id into cat_e;
  -- traduction (en) pour r1 : sert aux tests de locale
  insert into public.recipe_translations (recipe_id, locale, title, description, source_hash, model)
  values (r1, 'en', 'Yogurt cake 0021', 'A cake.', 'h-r1', 'mock');

  -- ============================================================ save_recipe (v2) : l'auteure crée une recette privée complète
  perform tests.login(a, 'authenticated');
  rp := public.save_recipe(payload || jsonb_build_object('translation', tr, 'category_id', cat_a));
  perform tests.logout();
  select count(*) into n from public.recipes where id = rp and owner_id = a and visibility = 'private' and category_id = cat_a;
  assert n = 1, 'save_recipe : owner_id = auteure, visibility et category_id respectés';
  assert (select count(*) from public.recipe_sections where recipe_id = rp) = 3
     and (select count(*) from public.recipe_translations where recipe_id = rp) = 1, 'save_recipe : sections et traduction jointe';
  update public.recipes set photo_path = rp::text || '/photo.webp' where id = rp;   -- pour vérifier que la photo n'est PAS copiée

  perform tests.login(a, 'authenticated');
  -- catégorie d'un autre / visibilité invalide / clé category_id mal formée
  assert tests.try(format($q$select public.save_recipe(%L)$q$, (payload || jsonb_build_object('category_id', cat_b))::text)) = '22023', 'category_id d''un autre refusée';
  assert tests.try(format($q$select public.save_recipe(%L)$q$, (payload || '{"visibility":"tous"}'::jsonb)::text)) = '22023', 'visibilité invalide';
  assert tests.try(format($q$select public.save_recipe(%L)$q$, (payload || '{"category_id":12}'::jsonb)::text)) = '22023', 'category_id mal formé';
  assert tests.try(format($q$select public.save_recipe(%L)$q$, (payload || '{"category_id":"pas-un-uuid"}'::jsonb)::text)) = '22023', 'category_id non uuid';
  -- `category` (texte) absent mais category_id donné : dérivé du nom de la catégorie
  rg := public.save_recipe('{"title":"Sans texte","visibility":"groups"}'::jsonb || jsonb_build_object('category_id', cat_a));
  assert (select category from public.recipes where id = rg) = (select name_fr from public.categories where id = cat_a), 'category dérivée de category_id';
  -- sans visibility : défaut « groups » ; sans category_id : NULL
  rn := public.save_recipe('{"title":"Recette simple","category":"plats"}'::jsonb);
  assert (select visibility from public.recipes where id = rn) = 'groups' and (select category_id from public.recipes where id = rn) is null
     and (select owner_id from public.recipes where id = rn) = a, 'valeurs par défaut v1 + owner_id';
  rc := public.save_recipe('{"title":"Autre nouveauté","category":"plats"}'::jsonb);
  perform tests.logout();

  -- ============================================================ copy_recipe
  -- non : étranger, membre de groupe (recette privée), amie sans droit, amie en lecture seule
  perform tests.login(d, 'authenticated');
  assert tests.try(format('select public.copy_recipe(%L)', r1)) = '42501', 'copie : étranger refusé (recette partagée aux groupes)';
  assert tests.try(format('select public.copy_recipe(%L)', rp)) = '42501', 'copie : étranger refusé (privée)';
  assert tests.try(format('select public.copy_recipe(%L)', gen_random_uuid())) = '42501', 'copie : recette inexistante = même refus';
  perform tests.logout();
  perform tests.login(b, 'authenticated');
  assert tests.try(format('select public.copy_recipe(%L)', rp)) = '42501', 'copie : membre du groupe refusé sur une recette privée';
  perform tests.logout();
  perform tests.login(e, 'authenticated');
  assert tests.try(format('select public.copy_recipe(%L)', rp)) = '42501', 'copie : amie sans droit refusée';
  assert tests.try(format('select public.copy_recipe(%L)', r1)) = '42501', 'copie : amie hors groupe refusée';
  perform tests.logout();
  -- l'auteure donne « read » à l'amie e : toujours pas de copie
  perform tests.login(a, 'authenticated');
  gr1 := public.grant_recipe(rp, e, null, 'read');
  perform tests.logout();
  perform tests.login(e, 'authenticated');
  assert tests.try(format('select public.copy_recipe(%L)', rp)) = '42501', 'copie : droit read insuffisant';
  perform tests.logout();
  -- oui : b (droit de groupe edit_original sur r1) copie r1
  perform tests.login(b, 'authenticated');
  copy_id := public.copy_recipe(r1);
  perform tests.logout();
  assert copy_id is not null and copy_id <> r1, 'copie : id renvoyé';
  select * into k from public.recipes where id = copy_id;
  assert k.owner_id = b and k.copied_from = r1 and k.visibility = 'private' and k.photo_path is null, 'copie : à b, copied_from, privée, sans photo';
  assert k.title = (select title from public.recipes where id = r1) and k.category = (select category from public.recipes where id = r1)
     and k.servings is not distinct from (select servings from public.recipes where id = r1)
     and k.tags is not distinct from (select tags from public.recipes where id = r1), 'copie : champs identiques';
  assert k.category_id = (select cb.id from public.categories cb join public.categories ca on ca.slug = cb.slug and ca.id = (select category_id from public.recipes where id = r1) where cb.owner_id = b),
    'copie : catégorie = celle de b qui porte la même clé';
  -- contenu identique (sections, ingrédients, étapes) et traduction copiée
  assert (select string_agg(concat_ws('|', s.name, s.type, s.order_index), ',' order by s.order_index, s.name) from public.recipe_sections s where s.recipe_id = r1)
       = (select string_agg(concat_ws('|', s.name, s.type, s.order_index), ',' order by s.order_index, s.name) from public.recipe_sections s where s.recipe_id = copy_id), 'copie : sections identiques';
  assert (select string_agg(concat_ws('|', s.order_index, i.name, i.amount, i.amount_num, i.unit, i.unit_code, i.optional, i.order_index), ',' order by s.order_index, i.order_index, i.name)
            from public.recipe_ingredients i join public.recipe_sections s on s.id = i.section_id where i.recipe_id = r1)
       = (select string_agg(concat_ws('|', s.order_index, i.name, i.amount, i.amount_num, i.unit, i.unit_code, i.optional, i.order_index), ',' order by s.order_index, i.order_index, i.name)
            from public.recipe_ingredients i join public.recipe_sections s on s.id = i.section_id where i.recipe_id = copy_id), 'copie : ingrédients identiques';
  assert (select string_agg(concat_ws('|', s.order_index, n.content, n.order_index), ',' order by s.order_index, n.order_index)
            from public.instructions n join public.recipe_sections s on s.id = n.section_id where n.recipe_id = r1)
       = (select string_agg(concat_ws('|', s.order_index, n.content, n.order_index), ',' order by s.order_index, n.order_index)
            from public.instructions n join public.recipe_sections s on s.id = n.section_id where n.recipe_id = copy_id), 'copie : étapes identiques';
  assert (select count(*) from public.recipe_ingredients where recipe_id = copy_id) > 0
     and not exists (select 1 from public.recipe_ingredients i join public.recipe_sections s on s.id = i.section_id where i.recipe_id = copy_id and s.recipe_id <> copy_id), 'copie : enfants rattachés à la copie';
  assert (select count(*) from public.recipe_translations where recipe_id = copy_id and locale = 'en' and title = 'Yogurt cake 0021') = 1, 'copie : traduction copiée';
  -- la copie est modifiable par b ; l'original n'a pas bougé ; a ne voit pas la copie (privée)
  perform tests.login(b, 'authenticated');
  assert public.save_recipe('{"title":"Ma version","category":"desserts et gâteaux"}'::jsonb || jsonb_build_object('id', copy_id)) = copy_id, 'copie modifiable par b';
  perform tests.logout();
  assert (select title from public.recipes where id = r1) <> 'Ma version', 'l''original est intact';
  perform tests.login(a, 'authenticated');
  assert (select count(*) from public.recipes where id = copy_id) = 0, 'la copie privée de b est invisible pour a';
  perform tests.logout();
  -- oui aussi : une amie avec le droit « copy » ; la photo n'est pas copiée
  perform tests.login(a, 'authenticated');
  gr1 := public.grant_recipe(rp, e, null, 'copy');
  perform tests.logout();
  perform tests.login(e, 'authenticated');
  copy2 := public.copy_recipe(rp);
  perform tests.logout();
  select * into k from public.recipes where id = copy2;
  assert k.owner_id = e and k.copied_from = rp and k.photo_path is null and k.category_id is null, 'copie par e : photo non copiée, catégorie sans équivalent';
  assert (select photo_path from public.recipes where id = rp) is not null, 'original : photo intacte';

  -- ============================================================ add_to_cookbook / remove_from_cookbook
  perform tests.login(d, 'authenticated');
  assert tests.try(format('select public.add_to_cookbook(%L)', r1)) = '42501', 'carnet : étranger refusé';
  perform tests.logout();
  perform tests.login(b, 'authenticated');
  assert tests.try(format('select public.add_to_cookbook(%L)', rp)) = '42501', 'carnet : membre de groupe refusé sur une recette privée';
  assert public.add_to_cookbook(r1) = true, 'carnet : première fois = true';
  assert public.add_to_cookbook(r1) = false, 'carnet : idempotente';
  assert (select count(*) from public.cookbook_entries where user_id = b and recipe_id = r1) = 1, 'une seule ligne';
  assert tests.try(format('select public.add_to_cookbook(%L, %L)', r1, cat_a)) = '22023', 'catégorie d''un autre refusée';
  assert public.add_to_cookbook(r1, cat_b) = false, 'rangement dans MA catégorie';
  assert (select category_id from public.cookbook_entries where user_id = b and recipe_id = r1) = cat_b, 'rangement dans MA catégorie';
  assert public.add_to_cookbook(r1) = false, 'sans catégorie : le rangement est gardé';
  assert (select category_id from public.cookbook_entries where user_id = b and recipe_id = r1) = cat_b, 'sans catégorie : le rangement est gardé';
  perform tests.logout();
  perform tests.login(a, 'authenticated');
  assert public.add_to_cookbook(r1) = false, 'carnet : sur ses propres recettes, sans effet';
  assert (select count(*) from public.cookbook_entries where user_id = a) = 0, 'carnet : sur ses propres recettes, sans effet';
  perform tests.logout();
  perform tests.login(e, 'authenticated');
  assert public.add_to_cookbook(rp) = true, 'carnet : amie avec droit (copy) = oui';
  perform tests.logout();

  -- ============================================================ list_cookbook
  perform tests.login(b, 'authenticated');
  select count(*) filter (where relation = 'owned'), count(*) filter (where relation = 'added'), max(total_count)
    into n, n2, n3 from public.list_cookbook();
  assert n = 1 and n2 = 1 and n3 = 2, 'list_cookbook b : 1 copie à lui + 1 recette ajoutée';
  select * into k from public.list_cookbook() where id = r1;
  assert k.relation = 'added' and k.permission = 'edit_original' and k.category_id = cat_b and k.author_id = a and k.author_name = 'Nina Test', 'list_cookbook : ajoutée, droit, catégorie de b, auteur';
  assert k.lang = 'fr' and k.translation ->> 'title' = 'Yogurt cake 0021' and k.translation ->> 'locale' = 'en', 'list_cookbook : lang + traduction (locale)';
  select * into k from public.list_cookbook() where id = copy_id;
  assert k.relation = 'owned' and k.permission = 'author' and k.author_id = b and k.title = 'Ma version', 'list_cookbook : mes recettes (owned)';
  assert (select count(*) from public.list_cookbook(cat_b)) = 1 and (select id from public.list_cookbook(cat_b)) = r1, 'filtre par catégorie (rangement de b)';
  assert (select count(*) from public.list_cookbook(gen_random_uuid())) = 0, 'filtre : catégorie sans recette';
  assert (select count(*) from public.list_cookbook(null, 'Yogurt')) = 2 and exists (select 1 from public.list_cookbook(null, 'yogurt CAKE') where id = r1), 'recherche dans la traduction (casse) : r1 et sa copie (traduction copiée)';
  assert (select count(*) from public.list_cookbook(null, 'gateau')) = 1, 'recherche dans le texte d''origine, sans accents';
  assert (select count(*) from public.list_cookbook(null, 'introuvable')) = 0, 'recherche sans résultat';
  assert (select count(*) from public.list_cookbook(null, null, 1, 0)) = 1 and (select max(total_count) from public.list_cookbook(null, null, 1, 1)) = 2
     and (select id from public.list_cookbook(null, null, 1, 0)) <> (select id from public.list_cookbook(null, null, 1, 1)), 'pagination';
  perform tests.logout();
  -- traduction périmée : ignorée
  update public.recipe_translations set stale = true where recipe_id = r1;
  perform tests.login(b, 'authenticated');
  assert (select translation from public.list_cookbook() where id = r1) is null, 'traduction périmée ignorée';
  perform tests.logout();
  update public.recipe_translations set stale = false where recipe_id = r1;
  perform tests.login(a, 'authenticated');
  assert (select count(*) from public.list_cookbook()) >= 10 and (select count(*) from public.list_cookbook() where relation = 'owned') = (select count(*) from public.list_cookbook()), 'list_cookbook a : tout est owned';
  perform tests.logout();
  perform tests.login(d, 'authenticated');
  assert (select count(*) from public.list_cookbook()) = 0, 'list_cookbook étranger : vide';
  perform tests.logout();
  perform tests.login(e, 'authenticated');
  assert (select count(*) from public.list_cookbook()) = 2 and (select permission from public.list_cookbook() where id = rp) = 'copy', 'list_cookbook e : sa copie + la recette partagée (droit copy)';
  perform tests.logout();
  -- droit retiré : l'entrée disparaît de la liste, sans être supprimée
  perform tests.login(a, 'authenticated');
  assert public.revoke_recipe_grant(gr1) = true, 'a retire le droit de e';
  perform tests.logout();
  perform tests.login(e, 'authenticated');
  assert (select count(*) from public.list_cookbook() where id = rp) = 0, 'droit retiré : la recette sort du carnet affiché';
  perform tests.logout();
  assert (select count(*) from public.cookbook_entries where user_id = e and recipe_id = rp) = 1, 'la ligne reste (redevient visible si le droit revient)';
  -- remove_from_cookbook
  perform tests.login(b, 'authenticated');
  assert public.remove_from_cookbook(r1) = true and public.remove_from_cookbook(r1) = false and public.remove_from_cookbook(rp) = false, 'remove_from_cookbook idempotente';
  perform tests.logout();
  assert (select count(*) from public.cookbook_entries where user_id = b) = 0, 'entrée retirée';
  perform tests.login(d, 'authenticated');
  assert public.remove_from_cookbook(r1) = false and public.remove_from_cookbook(rp) = false, 'un étranger ne retire pas l''entrée d''un autre';
  perform tests.logout();
  assert (select count(*) from public.cookbook_entries where user_id = e) = 1, 'un étranger ne retire pas l''entrée d''un autre';

  -- ============================================================ list_author_recipes
  perform tests.login(b, 'authenticated');
  select count(*), count(*) filter (where in_cookbook), max(total_count) into n, n2, n3 from public.list_author_recipes(a);
  assert n = (select count(*) from public.recipes where owner_id = a and visibility = 'groups') and n2 = 0 and n3 = n, 'list_author_recipes b : recettes de a visibles pour b (pas la privée), aucune dans le carnet';
  assert not exists (select 1 from public.list_author_recipes(a) where id = rp), 'la recette privée n''est pas listée';
  perform public.add_to_cookbook(r1);
  assert (select in_cookbook from public.list_author_recipes(a) where id = r1) and (select permission from public.list_author_recipes(a) where id = r1) = 'edit_original', 'indicateur déjà dans mon carnet + droit';
  assert (select translation ->> 'title' from public.list_author_recipes(a) where id = r1) = 'Yogurt cake 0021', 'list_author_recipes : traduction';
  assert (select count(*) from public.list_author_recipes(b)) = 0, 'soi-même : vide';
  assert (select count(*) from public.list_author_recipes(a, 2, 0)) = 2 and (select count(*) from public.list_author_recipes(a, 2, 100)) = 0, 'pagination';
  perform public.remove_from_cookbook(r1);
  perform tests.logout();
  perform tests.login(d, 'authenticated');
  assert (select count(*) from public.list_author_recipes(a)) = 0, 'list_author_recipes étranger : vide';
  perform tests.logout();
  perform tests.login(e, 'authenticated');
  assert (select count(*) from public.list_author_recipes(a)) = 0, 'list_author_recipes amie sans droit : vide';
  perform tests.logout();

  -- ============================================================ list_shared_with_me
  perform tests.login(b, 'authenticated');
  select count(*) into n from public.list_shared_with_me();
  assert n = (select count(*) from public.recipes where owner_id = a and visibility = 'groups'), 'shared b : les recettes Boultons (droit implicite + groupe)';
  assert not exists (select 1 from public.list_shared_with_me() where id = copy_id or id = rp), 'shared b : ni sa copie ni la privée';
  assert (select via from public.list_shared_with_me() where id = r1) = 'group', 'via = group';
  perform public.add_to_cookbook(r1);
  assert not exists (select 1 from public.list_shared_with_me() where id = r1), 'shared b : disparaît quand ajoutée au carnet';
  perform public.remove_from_cookbook(r1);
  perform tests.logout();
  perform tests.login(a, 'authenticated');
  gr1 := public.grant_recipe(rp, e, null, 'read');
  perform tests.logout();
  perform tests.login(e, 'authenticated');
  perform public.remove_from_cookbook(rp);   -- (la ligne gardée plus haut) : sinon elle n'est plus « à ajouter »
  select * into k from public.list_shared_with_me();
  assert k.id = rp and k.via = 'user' and k.permission = 'read' and k.author_name = 'Nina Test', 'shared e : le droit direct';
  perform tests.logout();
  perform tests.login(d, 'authenticated');
  assert (select count(*) from public.list_shared_with_me()) = 0, 'shared étranger : vide';
  perform tests.logout();
  perform tests.login(a, 'authenticated');
  assert (select count(*) from public.list_shared_with_me()) = 0, 'shared auteure : ses propres recettes exclues';
  perform tests.logout();

  -- ============================================================ grant_recipe / list_recipe_grants / revoke_recipe_grant
  perform tests.login(b, 'authenticated');
  assert tests.try(format('select public.grant_recipe(%L, %L, null, %L)', r1, c, 'read')) = '42501', 'grant : membre de groupe (pas l''auteur) refusé';
  assert tests.try(format('select public.list_recipe_grants(%L)', r1)) = '42501', 'list_recipe_grants : membre de groupe refusé';
  perform tests.logout();
  perform tests.login(e, 'authenticated');
  assert tests.try(format('select public.grant_recipe(%L, %L, null, %L)', rp, f, 'read')) = '42501', 'grant : amie (pas l''auteure) refusée';
  assert tests.try(format('select public.list_recipe_grants(%L)', rp)) = '42501', 'list_recipe_grants : amie refusée';
  perform tests.logout();
  perform tests.login(d, 'authenticated');
  assert tests.try(format('select public.grant_recipe(%L, %L, null, %L)', rp, d, 'read')) = '42501', 'grant : étranger refusé';
  assert public.revoke_recipe_grant(gr1) = false, 'revoke : étranger = false';
  perform tests.logout();
  assert (select count(*) from public.recipe_grants where id = gr1) = 1, 'revoke : étranger, rien retiré';
  perform tests.login(a, 'authenticated');
  assert tests.try(format('select public.grant_recipe(%L, %L, null, %L)', rp, d, 'read')) = '42501', 'grant : à un étranger (ni ami ni groupe commun) refusé';
  assert tests.try(format('select public.grant_recipe(%L, null, %L, %L)', rp, g3, 'read')) = '42501', 'grant : à un groupe dont a n''est pas membre refusé';
  assert tests.try(format('select public.grant_recipe(%L, null, null, %L)', rp, 'read')) = '22023', 'grant : ni personne ni groupe';
  assert tests.try(format('select public.grant_recipe(%L, %L, %L, %L)', rp, e, g2, 'read')) = '22023', 'grant : personne ET groupe';
  assert tests.try(format('select public.grant_recipe(%L, %L, null, %L)', rp, e, 'tout')) = '22023', 'grant : droit invalide';
  assert tests.try(format('select public.grant_recipe(%L, %L, null, %L)', rp, a, 'read')) = '42501', 'grant : à soi-même refusé';
  assert public.grant_recipe(rp, e, null, 'read') = gr1, 'grant : le plus récent remplace (même id)';
  gr2 := public.grant_recipe(rp, c, null, 'copy');   -- c : membre du groupe commun
  gr3 := public.grant_recipe(rp, null, g2, 'read');  -- groupe G2 dont a est membre
  assert gr2 is not null and gr3 is not null, 'grant : membre de groupe, groupe';
  assert public.grant_recipe(rp, e, null, 'edit_original') = gr1, 'grant : edit_original direct';
  assert (select permission from public.recipe_grants where id = gr1) = 'edit_original', 'grant : edit_original direct';
  assert public.grant_recipe(rp, e, null, 'copy') = gr1, 'grant : abaissement';
  assert (select permission from public.recipe_grants where id = gr1) = 'copy', 'grant : abaissement';
  select count(*) into n from public.list_recipe_grants(rp);
  assert n = 3, 'list_recipe_grants : 3 droits';
  select * into k from public.list_recipe_grants(rp) where grant_id = gr1;
  assert k.grantee_user_id = e and k.grantee_name = 'Eve Amie' and k.permission = 'copy' and k.origin = 'direct' and k.granted_by_name = 'Nina Test', 'list_recipe_grants : noms d''affichage';
  assert (select grantee_name from public.list_recipe_grants(rp) where grant_id = gr3) = 'G2 de Nina', 'nom du groupe';
  assert position('test.local' in (select jsonb_agg(to_jsonb(x))::text from public.list_recipe_grants(rp) x)) = 0, 'list_recipe_grants : aucun e-mail';
  perform tests.logout();

  -- ============================================================ reshare_recipe : jamais edit_original, jamais au-dessus de soi
  perform tests.login(e, 'authenticated');   -- e détient un droit copy (direct) sur rp
  assert tests.try(format('select public.reshare_recipe(%L, %L, null, %L)', rp, f, 'edit_original')) = '22023', 'reshare : edit_original refusé, message dédié';
  assert tests.try(format('select public.reshare_recipe(%L, %L, null, %L)', rp, d, 'read')) = '42501', 'reshare : à un étranger refusé';
  assert tests.try(format('select public.reshare_recipe(%L, null, null, %L)', rp, 'read')) = '22023', 'reshare : sans bénéficiaire';
  assert tests.try(format('select public.reshare_recipe(%L, %L, null, %L)', rp, f, 'tout')) = '22023', 'reshare : droit invalide';
  gr4 := public.reshare_recipe(rp, f, null, 'copy');
  assert gr4 is not null, 'reshare : e repartage en copy à son amie f';
  select * into k from public.recipe_grants where id = gr4;
  assert k.origin = 'reshare' and k.source_grant_id = gr1 and k.permission = 'copy' and k.granted_by = e and k.grantee_user_id = f, 'reshare : origine, source, auteur du repartage';
  assert public.reshare_recipe(rp, f, null, 'read') = gr4, 'reshare : mon propre repartage se met à jour';
  assert (select permission from public.recipe_grants where id = gr4) = 'read', 'reshare : mon propre repartage se met à jour';
  assert public.reshare_recipe(rp, a, null, 'read') is null, 'reshare : à l''auteure = rien';
  perform tests.logout();
  assert not exists (select 1 from public.recipe_grants where recipe_id = rp and permission = 'edit_original' and origin <> 'direct'), 'aucun edit_original hérité';
  -- f (repartage read) : ne dépasse pas son niveau
  perform tests.login(f, 'authenticated');
  assert tests.try(format('select public.reshare_recipe(%L, %L, null, %L)', rp, e, 'copy')) = '42501', 'reshare : au-dessus de son niveau refusé (f a read)';
  perform tests.logout();
  -- l'auteure retire le droit de e : le repartage de f disparaît avec lui (chaîne source_grant_id)
  perform tests.login(a, 'authenticated');
  assert public.revoke_recipe_grant(gr1) = true, 'revoke : l''auteure retire le droit de e';
  assert public.revoke_recipe_grant(gr1) = false, 'revoke : idempotente (false la 2e fois)';
  perform tests.logout();
  assert not exists (select 1 from public.recipe_grants where id = gr4), 'revoke : le repartage de f disparaît en cascade';
  -- l'auteure redonne copy à e, e repartage, puis l'auteure donne directement copy à f : le repartage de e ne la remplace plus
  perform tests.login(a, 'authenticated');
  gr1 := public.grant_recipe(rp, e, null, 'copy');
  perform tests.logout();
  perform tests.login(e, 'authenticated');
  gr4 := public.reshare_recipe(rp, f, null, 'read');
  perform tests.logout();
  perform tests.login(a, 'authenticated');
  assert public.grant_recipe(rp, f, null, 'copy') = gr4, 'grant direct remplace le repartage';
  assert (select origin from public.recipe_grants where id = gr4) = 'direct', 'grant direct remplace le repartage';
  perform tests.logout();
  perform tests.login(e, 'authenticated');
  assert public.reshare_recipe(rp, f, null, 'read') is null, 'reshare : ne remplace pas un droit de l''auteure';
  perform tests.logout();
  assert (select permission from public.recipe_grants where id = gr4) = 'copy', 'reshare : ne remplace pas un droit de l''auteure';
  -- accès IMPLICITE seulement (rn : visibilité groupes, aucun droit explicite) : pas de repartage
  perform tests.login(b, 'authenticated');
  assert tests.try(format('select public.reshare_recipe(%L, %L, null, %L)', rn, c, 'read')) = '42501', 'reshare : accès implicite non repartageable';
  perform tests.logout();
  perform tests.login(a, 'authenticated');
  assert tests.try(format('select public.reshare_recipe(%L, %L, null, %L)', rn, c, 'read')) = '42501', 'reshare : l''auteure n''a pas de droit explicite à repartager (elle utilise grant_recipe)';
  perform tests.logout();
  -- renoncer / retirer son propre repartage
  perform tests.login(e, 'authenticated');
  assert tests.try(format('select public.reshare_recipe(%L, %L, null, %L)', rp, c, 'read')) = '42501', 'reshare : c est dans le groupe de a mais pas ami de e : refusé';
  perform tests.logout();
  perform tests.login(d, 'authenticated');
  assert public.revoke_recipe_grant(gr4) = false, 'revoke : étranger = false';
  perform tests.logout();
  perform tests.login(f, 'authenticated');
  assert public.revoke_recipe_grant(gr4) = true, 'revoke : le bénéficiaire renonce';
  perform tests.logout();
  assert not exists (select 1 from public.recipe_grants where id = gr4), 'droit de f retiré';

  -- ============================================================ lien public
  perform tests.login(b, 'authenticated');
  assert tests.try(format('select public.create_share_link(%L)', rp)) = '42501', 'lien : membre de groupe refusé';
  assert tests.try(format('select public.create_share_link(%L)', r1)) = '42501', 'lien : membre de groupe refusé même sur une recette lisible';
  assert tests.try(format('select public.revoke_share_link(%L)', r1)) = '42501', 'revoke lien : membre de groupe refusé';
  perform tests.logout();
  perform tests.login(e, 'authenticated');
  assert tests.try(format('select public.create_share_link(%L)', rp)) = '42501', 'lien : amie refusée';
  perform tests.logout();
  perform tests.login(d, 'authenticated');
  assert tests.try(format('select public.create_share_link(%L)', rp)) = '42501', 'lien : étranger refusé';
  assert tests.try(format('select public.revoke_share_link(%L)', rp)) = '42501', 'revoke lien : étranger refusé';
  perform tests.logout();
  assert (select count(*) from public.recipe_share_links) = 0, 'aucun lien créé par les refus';
  perform tests.login(a, 'authenticated');
  tok := public.create_share_link(rp);
  assert tok is not null and public.create_share_link(rp) = tok, 'lien : créé, idempotent (même jeton)';
  perform tests.logout();
  -- get_shared_recipe : sans compte
  perform tests.login(d, 'anon');
  j := public.get_shared_recipe(tok);
  assert j is not null, 'anon : lit la recette par son jeton';
  assert j ->> 'title' = 'Tarte 0021 privée' and j ->> 'description' = 'Une tarte.' and (j ->> 'servings')::int = 6 and j ->> 'lang' = 'fr'
     and j ->> 'author_name' = 'Nina Test' and (j ->> 'has_photo')::boolean, 'contenu : champs de la recette et pseudonyme';
  assert jsonb_array_length(j -> 'sections') = 3 and jsonb_array_length(j -> 'sections' -> 0 -> 'ingredients') = 2
     and jsonb_array_length(j -> 'sections' -> 2 -> 'instructions') = 2 and j -> 'sections' -> 2 -> 'instructions' ->> 0 = 'Étaler.', 'contenu : sections, ingrédients, étapes';
  assert j -> 'sections' -> 0 -> 'ingredients' -> 0 ->> 'name' = 'farine' and j -> 'sections' -> 0 -> 'ingredients' -> 0 ->> 'unit_code' = 'g', 'contenu : ingrédient';
  assert (select array_agg(key order by key) from jsonb_object_keys(j) key)
       = array['author_name','category','cook_time','description','has_photo','lang','notes','prep_time','sections','servings','tags','title','translation'],
    'seules les clés prévues (ni id, ni owner_id, ni photo_path)';
  assert position(a::text in j::text) = 0 and position(rp::text in j::text) = 0 and position('@' in j::text) = 0
     and position('test.local' in j::text) = 0 and position(cat_a::text in j::text) = 0, 'aucun identifiant ni e-mail dans la réponse';
  assert j -> 'translation' ->> 'title' = 'Private pie 0021' and j -> 'translation' ->> 'locale' = 'en', 'traduction non périmée';
  assert public.get_shared_recipe(tok, 'fr') -> 'translation' = 'null'::jsonb, 'locale fr : pas de traduction vers fr';
  assert public.get_shared_recipe(tok, 'en') -> 'translation' ->> 'title' = 'Private pie 0021', 'locale en';
  assert public.get_shared_recipe(gen_random_uuid()) is null and public.get_shared_recipe(null) is null, 'jeton faux = NULL';
  assert (select count(*) from public.recipes) = 0, 'anon ne lit toujours aucune table (RLS authenticated)';
  assert tests.try(format('select public.claim_shared_recipe(%L)', tok)) = '42501', 'anon : claim refusée';
  perform tests.logout();
  -- un jeton ne révèle que SA recette : le lien de r1 ne donne pas rp
  t := (select title from public.recipes where id = r1);
  perform tests.login(a, 'authenticated');
  tok2 := public.create_share_link(r1);
  perform tests.logout();
  perform tests.login(d, 'anon');
  assert public.get_shared_recipe(tok2) ->> 'title' = t and public.get_shared_recipe(tok2) ->> 'title' <> 'Tarte 0021 privée', 'chaque jeton = sa recette';
  perform tests.logout();

  -- ============================================================ claim_shared_recipe (« Ajouter à mon carnet » depuis la page publique)
  perform tests.login(d, 'authenticated');
  assert tests.try(format('select public.claim_shared_recipe(%L)', gen_random_uuid())) = 'P0002', 'claim : jeton faux';
  assert public.claim_shared_recipe(tok) = rp, 'claim : renvoie la recette';
  assert public.claim_shared_recipe(tok) = rp, 'claim : idempotente';
  perform tests.logout();
  select * into k from public.recipe_grants where recipe_id = rp and grantee_user_id = d;
  assert k.permission = 'copy' and k.origin = 'link' and k.granted_by = a and k.source_grant_id is null, 'claim : droit copy, origine link, accordé par l''auteure';
  assert (select count(*) from public.recipe_grants where recipe_id = rp and grantee_user_id = d) = 1
     and (select count(*) from public.cookbook_entries where user_id = d and recipe_id = rp) = 1, 'claim : un droit, une entrée';
  perform tests.login(d, 'authenticated');
  assert (select count(*) from public.recipes where id = rp) = 1 and (select count(*) from public.list_cookbook() where id = rp) = 1, 'claim : lisible et dans le carnet';
  v_uuid := public.copy_recipe(rp);
  assert v_uuid is not null, 'claim : donne le droit de copie';
  perform tests.logout();
  -- pas de rétrogradation ; mise à niveau d'un droit read
  perform tests.login(a, 'authenticated');
  perform public.grant_recipe(rp, b, null, 'edit_original');
  perform public.grant_recipe(r2, c, null, 'read');   -- c : droit read direct en plus de son droit de groupe
  tok2 := public.create_share_link(r2);
  perform tests.logout();
  perform tests.login(b, 'authenticated');
  assert public.claim_shared_recipe(tok) = rp, 'claim : edit_original conservé';
  assert (select permission from public.recipe_grants where recipe_id = rp and grantee_user_id = b) = 'edit_original', 'claim : edit_original conservé';
  perform tests.logout();
  perform tests.login(c, 'authenticated');
  assert public.claim_shared_recipe(tok2) = r2, 'claim : c sur r2';
  perform tests.logout();
  assert (select permission from public.recipe_grants where recipe_id = r2 and grantee_user_id = c) = 'copy' and (select origin from public.recipe_grants where recipe_id = r2 and grantee_user_id = c) = 'direct', 'claim : read relevé à copy';
  perform tests.login(a, 'authenticated');
  assert public.claim_shared_recipe(tok) = rp, 'claim : sa propre recette';
  assert public.revoke_share_link(rp) = true and public.revoke_share_link(rp) = false, 'revoke_share_link : true puis false';
  assert public.revoke_share_link(r2) = true, 'lien r2 retiré';
  perform tests.logout();
  perform tests.login(d, 'anon');
  assert public.get_shared_recipe(tok) is null, 'jeton révoqué = NULL';
  perform tests.logout();
  perform tests.login(f, 'authenticated');
  assert tests.try(format('select public.claim_shared_recipe(%L)', tok)) = 'P0002', 'claim : jeton révoqué';
  perform tests.logout();
  perform tests.login(d, 'authenticated');
  assert (select count(*) from public.recipes where id = rp) = 1, 'révocation : ceux qui l''ont ajoutée gardent l''accès';
  perform tests.logout();

  -- ============================================================ recipe_usage
  perform tests.login(b, 'authenticated');
  assert tests.try(format('select public.recipe_usage(%L)', rp)) = '42501', 'usage : membre de groupe refusé';
  perform tests.logout();
  perform tests.login(d, 'authenticated');
  assert tests.try(format('select public.recipe_usage(%L)', rp)) = '42501', 'usage : étranger refusé';
  perform tests.logout();
  perform tests.login(e, 'authenticated');
  assert tests.try(format('select public.recipe_usage(%L)', rp)) = '42501', 'usage : amie refusée';
  perform tests.logout();
  perform tests.login(a, 'authenticated');
  select * into k from public.recipe_usage(rp);
  perform tests.logout();
  select count(*) into n from public.cookbook_entries where recipe_id = rp and user_id <> a;
  select count(*) into n2 from public.recipes where copied_from = rp and owner_id <> a;
  assert k.cookbook_count = n and k.copy_count = n2 and n = 2 and n2 = 2, format('usage : %s carnets / %s copies', n, n2);

  -- ============================================================ bannières (pending_prompts, dismiss_prompt)
  perform tests.login(b, 'authenticated');
  select * into k from public.pending_prompts() where kind = 'author_recipes' and target_id = a;
  select count(*) into n from public.recipes r where r.owner_id = a and private.recipe_level(r.id) >= 1
     and not exists (select 1 from public.cookbook_entries x where x.user_id = b and x.recipe_id = r.id);
  assert k.author_id = a and k.author_name = 'Nina Test' and k.recipe_count = n and n >= 7, 'bannière « Explorer les recettes de Nina » avec le bon nombre';
  assert not exists (select 1 from public.pending_prompts() where kind = 'new_recipe' and recipe_id = r1), 'les recettes d''AVANT l''arrivée ne donnent pas de « nouvelle recette »';
  assert exists (select 1 from public.pending_prompts() where kind = 'new_recipe' and recipe_id = rn and title = 'Recette simple' and author_id = a), 'bannière « nouvelle recette » (créée après l''arrivée)';
  assert not exists (select 1 from public.pending_prompts() where kind = 'new_recipe' and recipe_id = copy_id), 'pas ses propres recettes';
  assert not exists (select 1 from public.pending_prompts() where target_id = b), 'pas de bannière sur soi';
  assert (select count(*) from public.pending_prompts(null, 1)) = 1, 'limite';
  assert not exists (select 1 from public.pending_prompts(now() + interval '1 day') where kind = 'new_recipe'), 'since : rien de plus récent';
  -- fermer
  perform public.dismiss_prompt('new_recipe', rn);
  perform public.dismiss_prompt('new_recipe', rn);
  assert not exists (select 1 from public.pending_prompts() where recipe_id = rn), '« nouvelle recette » disparaît après dismiss';
  assert (select count(*) from public.dismissed_prompts where user_id = b and target_id = rn) = 1, 'dismiss idempotent (une ligne)';
  assert tests.try(format('select public.dismiss_prompt(%L, %L)', 'autre', rn)) = '22023', 'dismiss : genre invalide';
  -- ajouter au carnet fait aussi disparaître la bannière
  perform public.add_to_cookbook(rg);
  assert not exists (select 1 from public.pending_prompts() where recipe_id = rg), '« nouvelle recette » disparaît quand elle est ajoutée au carnet';
  assert exists (select 1 from public.pending_prompts() where kind = 'new_recipe' and recipe_id = rc), 'les autres restent';
  perform public.dismiss_prompt('author_recipes', a);
  assert not exists (select 1 from public.pending_prompts() where kind = 'author_recipes'), '« Explorer » disparaît après dismiss';
  perform tests.logout();
  assert (select count(*) from public.cookbook_entries where user_id = b) = 2, 'fermer une bannière n''ajoute rien au carnet (rg + rp réclamée)';
  -- c : « tout ajouter » ferme la bannière et vide les « nouvelle recette » correspondantes
  perform tests.login(c, 'authenticated');
  assert exists (select 1 from public.pending_prompts() where kind = 'author_recipes' and target_id = a) and exists (select 1 from public.pending_prompts() where recipe_id = rn), 'c voit encore les bannières (les fermetures sont par personne)';
  perform public.add_author_recipes_to_cookbook(a);
  assert (select count(*) from public.pending_prompts()) = 0, 'c : tout ajouté, plus de bannière';
  perform tests.logout();
  -- ni étranger, ni amie hors groupe : aucune bannière
  perform tests.login(d, 'authenticated');
  assert (select count(*) from public.pending_prompts()) = 0, 'étranger : aucune bannière';
  perform tests.logout();
  perform tests.login(f, 'authenticated');
  assert (select count(*) from public.pending_prompts()) = 0, 'amie hors groupe : aucune bannière';
  perform tests.logout();
  -- une nouvelle membre voit « Explorer » (pas de « nouvelle recette » pour l'antérieur) ; si elle part, plus rien
  insert into auth.users (id, email, raw_user_meta_data) values (h, 'hana-nouvelle@test.local', '{}');
  update public.profiles set display_name = 'Hana Nouvelle' where id = h;
  insert into public.group_members (group_id, user_id, role) values (gb, h, 'member');
  perform tests.login(h, 'authenticated');
  assert exists (select 1 from public.pending_prompts() where kind = 'author_recipes' and target_id = a), 'nouvelle membre : bannière Explorer';
  assert not exists (select 1 from public.pending_prompts() where kind = 'new_recipe'), 'nouvelle membre : pas de « nouvelle recette » pour l''existant';
  perform tests.logout();
  delete from public.group_members where group_id = gb and user_id = h;
  perform tests.login(h, 'authenticated');
  assert (select count(*) from public.pending_prompts()) = 0, 'ancienne membre : aucune bannière';
  perform tests.logout();

  -- ============================================================ save_recipe (v2) : éditeur, lecteur, étranger
  perform tests.login(b, 'authenticated');   -- b : droit de groupe edit_original sur r1
  v_uuid := public.save_recipe(payload || jsonb_build_object('id', r1, 'title', 'Gâteau modifié par b', 'visibility', 'private',
                                                             'category_id', cat_b, 'translation', tr || '{"title":"Edited by b"}'::jsonb));
  assert v_uuid = r1, 'éditeur : mise à jour de r1';
  perform tests.logout();
  select * into k from public.recipes where id = r1;
  assert k.title = 'Gâteau modifié par b' and k.owner_id = a and k.visibility = 'groups' and k.category_id is distinct from cat_b and k.copied_from is null,
    'éditeur : contenu modifié, owner / visibilité / catégorie / origine inchangés (clés ignorées)';
  assert (select title from public.recipe_translations where recipe_id = r1 and locale = 'en') = 'Edited by b', 'éditeur : traduction jointe enregistrée (save_recipe_translation)';
  perform tests.login(b, 'authenticated');
  perform public.save_recipe_translation(r1, 'fr', tr);
  perform tests.logout();
  -- lecteur / étranger : refusés
  perform tests.login(e, 'authenticated');
  assert tests.try(format($q$select public.save_recipe(%L)$q$, (payload || jsonb_build_object('id', rp))::text)) = '42501', 'lecteur (copy) : save_recipe refusé';
  assert tests.try(format($q$select public.save_recipe_translation(%L, 'fr', %L)$q$, rp, tr::text)) = '42501', 'lecteur : save_recipe_translation refusé';
  perform tests.logout();
  perform tests.login(f, 'authenticated');
  assert tests.try(format($q$select public.save_recipe(%L)$q$, (payload || jsonb_build_object('id', rp))::text)) <> 'ok', 'sans droit (f a renoncé) : save_recipe refusé';
  perform tests.logout();
  perform tests.login(d, 'authenticated');
  assert tests.try(format($q$select public.save_recipe(%L)$q$, (payload || jsonb_build_object('id', gen_random_uuid() ))::text)) = 'ok', 'étranger : crée SA recette';
  assert tests.try(format($q$select public.save_recipe(%L)$q$, (payload || jsonb_build_object('id', r2))::text)) <> 'ok', 'étranger : ne peut pas écraser r2';
  assert tests.try(format($q$select public.save_recipe_translation(%L, 'fr', %L)$q$, r2, tr::text)) = '42501', 'étranger : save_recipe_translation refusé';
  perform tests.logout();
  assert (select title from public.recipes where id = r2) = 'Fried rice', 'r2 intacte';
  -- création par b : visibilité et catégorie à lui ; catégorie d'un autre refusée
  perform tests.login(b, 'authenticated');
  rb := public.save_recipe(payload || jsonb_build_object('title', 'Recette de b', 'visibility', 'groups', 'category_id', cat_b));
  assert tests.try(format($q$select public.save_recipe(%L)$q$, (payload || jsonb_build_object('category_id', cat_a))::text)) = '22023', 'création : catégorie d''un autre refusée';
  perform tests.logout();
  select * into k from public.recipes where id = rb;
  assert k.owner_id = b and k.visibility = 'groups' and k.category_id = cat_b, 'création par b : owner_id = b, visibilité et catégorie respectées';
  -- l'auteure peut changer visibilité et catégorie d'une recette existante (et la vider)
  perform tests.login(a, 'authenticated');
  perform public.save_recipe(payload || jsonb_build_object('id', rp, 'visibility', 'groups', 'category_id', null));
  perform tests.logout();
  select * into k from public.recipes where id = rp;
  assert k.visibility = 'groups' and k.category_id is null and k.owner_id = a, 'auteure : visibilité changée, catégorie vidée';

  -- ============================================================ suppression : avertissement puis cascade
  perform tests.login(b, 'authenticated');
  assert tests.try(format('select public.delete_recipe(%L)', r1)) = 'P0002', 'delete_recipe : un éditeur ne supprime pas l''original';
  perform tests.logout();
  perform tests.login(a, 'authenticated');
  perform public.delete_recipe(rp);
  perform tests.logout();
  assert not exists (select 1 from public.cookbook_entries where recipe_id = rp) and not exists (select 1 from public.recipe_grants where recipe_id = rp), 'suppression : carnets et droits retirés';
  assert (select copied_from from public.recipes where id = copy2) is null and exists (select 1 from public.recipes where id = copy2), 'suppression : les copies des autres restent (copied_from effacé)';
  raise notice '[test 0021] fonctions métier recettes sous la chaîne complète : OK';
end $$;

rollback;
