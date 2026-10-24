-- Test 0026 — recipe_access(p_recipe), sous la chaîne COMPLÈTE 0017 → 0019 → 0021 → 0023 → 0018 (remplissage) → 0020 (bascule) → 0026.
-- Même jeu de personnes que test_0021 : a = Nina (auteure du seed, créatrice du groupe « Les Boultons »), b et c = membres du groupe
-- (droit de groupe edit_original sur les 7 recettes du seed), d = étranger, e = amie de a. Transaction annulée.
begin;

create or replace function tests.try(q text) returns text language plpgsql as $$
begin execute q; return 'ok'; exception when others then return sqlstate; end $$;
grant execute on function tests.try(text) to anon, authenticated, service_role;

do $$
declare
  a constant uuid := '00000000-0000-0000-0000-00000000000a';
  b constant uuid := '00000000-0000-0000-0000-00000000000b';
  c constant uuid := '00000000-0000-0000-0000-00000000000c';
  d constant uuid := '00000000-0000-0000-0000-0000000000d6';
  e constant uuid := '00000000-0000-0000-0000-0000000000e6';
  r1 constant uuid := '10000000-0000-0000-0000-000000000001';
  rp uuid; rg uuid; gr uuid; ecopy uuid; bcopy uuid; cat_a uuid;
  k record; n bigint;
begin
  insert into auth.users (id, email, raw_user_meta_data) values (d, 'dave6@test.local', '{}'), (e, 'eve6@test.local', '{}');
  update public.profiles set display_name = 'Dave Six' where id = d;
  update public.profiles set display_name = 'Eve Six'  where id = e;
  insert into public.friendships (requester_id, addressee_id, status, responded_at) values (a, e, 'accepted', now());
  select id into cat_a from public.categories where owner_id = a order by sort_order limit 1;
  delete from public.cookbook_entries where user_id in (b, c);

  perform tests.login(a, 'authenticated');
  rp := public.save_recipe(jsonb_build_object('title', 'Privée 0026', 'category', 'plats', 'visibility', 'private', 'category_id', cat_a));
  rg := public.save_recipe('{"title":"Groupes 0026","category":"plats","visibility":"groups"}'::jsonb);
  -- l'auteure
  select * into k from public.recipe_access(rp);
  assert k.permission = 'author' and k.explicit_permission is null and k.in_cookbook = false and k.owner_id = a
     and k.visibility = 'private' and k.category_id = cat_a and k.copied_from is null and k.has_share_link = false
     and k.owner_name = (select display_name from public.profiles where id = a), 'auteure : author, catégorie, pas de lien';
  perform public.create_share_link(rp);
  assert (select has_share_link from public.recipe_access(rp)), 'auteure : lien public actif';
  perform public.revoke_share_link(rp);
  assert not (select has_share_link from public.recipe_access(rp)), 'auteure : lien révoqué';
  perform tests.logout();

  -- étranger : aucune ligne (recette privée, recette inexistante : même réponse)
  perform tests.login(d, 'authenticated');
  select count(*) into n from public.recipe_access(rp);
  assert n = 0, 'étranger : aucune ligne sur une recette privée';
  select count(*) into n from public.recipe_access(gen_random_uuid());
  assert n = 0, 'étranger : aucune ligne sur une recette inconnue';
  select count(*) into n from public.recipe_access(null);
  assert n = 0, 'identifiant NULL : aucune ligne';
  perform tests.logout();

  -- membre du groupe : droit de groupe edit_original (explicite) sur r1 ; partage implicite copy sur rg (pas explicite)
  perform tests.login(b, 'authenticated');
  select * into k from public.recipe_access(r1);
  assert k.permission = 'edit_original' and k.explicit_permission = 'edit_original' and k.category_id is null and k.has_share_link = false,
    'membre : edit_original explicite, catégorie et lien masqués';
  select * into k from public.recipe_access(rg);
  assert k.permission = 'copy' and k.explicit_permission is null and k.owner_id = a, 'membre : copy implicite, pas de droit explicite à repartager';
  select count(*) into n from public.recipe_access(rp);
  assert n = 0, 'membre : recette privée illisible, aucune ligne';
  assert (select in_cookbook from public.recipe_access(rg)) = false, 'membre : pas dans le carnet';
  perform public.add_to_cookbook(rg);
  assert (select in_cookbook from public.recipe_access(rg)), 'membre : dans le carnet après ajout';
  bcopy := public.copy_recipe(r1);
  select * into k from public.recipe_access(bcopy);
  assert k.permission = 'author' and k.copied_from = r1 and k.copied_from_title = (select title from public.recipes where id = r1),
    'copie : auteur, original lisible et titré';
  perform tests.logout();

  -- amie : read puis copy ; copie ; l'auteure retire le droit : l'original n'est plus lisible, la copie ne le désigne plus
  perform tests.login(a, 'authenticated');
  gr := public.grant_recipe(rp, e, null, 'read');
  perform tests.logout();
  perform tests.login(e, 'authenticated');
  select * into k from public.recipe_access(rp);
  assert k.permission = 'read' and k.explicit_permission = 'read', 'amie : read explicite';
  perform tests.logout();
  perform tests.login(a, 'authenticated');
  gr := public.grant_recipe(rp, e, null, 'copy');
  perform tests.logout();
  perform tests.login(e, 'authenticated');
  select * into k from public.recipe_access(rp);
  assert k.permission = 'copy' and k.explicit_permission = 'copy', 'amie : copy explicite (droit remplacé)';
  ecopy := public.copy_recipe(rp);
  assert (select copied_from_title from public.recipe_access(ecopy)) = 'Privée 0026', 'copie de l''amie : original lisible';
  perform tests.logout();
  perform tests.login(a, 'authenticated');
  assert public.revoke_recipe_grant(gr), 'droit retiré';
  perform tests.logout();
  perform tests.login(e, 'authenticated');
  select * into k from public.recipe_access(ecopy);
  assert k.copied_from is null and k.copied_from_title is null and k.permission = 'author', 'original devenu illisible : ni identifiant ni titre';
  select count(*) into n from public.recipe_access(rp);
  assert n = 0, 'amie : plus d''accès à l''original';
  perform tests.logout();

  -- droits d'exécution
  assert tests.try(format('select * from public.recipe_access(%L)', rp)) = '42501', 'sans session : connexion requise';
  assert not has_function_privilege('anon', 'public.recipe_access(uuid)', 'execute'), 'anon refusé';
  assert has_function_privilege('authenticated', 'public.recipe_access(uuid)', 'execute'), 'authenticated autorisé';
  raise notice '[test 0026] recipe_access : OK';
end $$;

rollback;
