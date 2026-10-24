-- Tests 0017 : schéma social v2 (expand-only) — tables, contraintes, cascades,
-- RLS fermée, fonctions existantes intactes.
-- Données : seed_test.sql (3 comptes a / b / c, recettes 10000000-…-01 et -02), après 0013 → 0017.
-- Transaction annulée à la fin. Le rejeu de 0017 et le rollback sont vérifiés par run_local.sh.
begin;

do $$
declare
  a constant uuid := '00000000-0000-0000-0000-00000000000a';
  b constant uuid := '00000000-0000-0000-0000-00000000000b';
  c constant uuid := '00000000-0000-0000-0000-00000000000c';
  r1 constant uuid := '10000000-0000-0000-0000-000000000001';
  r2 constant uuid := '10000000-0000-0000-0000-000000000002';
  g1 uuid; g2 uuid; cat1 uuid; grant1 uuid; v_id uuid; v_list uuid; n bigint; t text;
  tables constant text[] := array['categories', 'groups', 'group_members', 'friendships', 'invitations',
                                  'recipe_grants', 'recipe_share_links', 'cookbook_entries',
                                  'notifications', 'reports', 'system_alerts'];
  tr jsonb := $j${
    "title": "Yogurt cake", "description": "A classic.", "tags": ["vegetarian"],
    "source_hash": "h1", "model": "mock",
    "content": { "sections": [ { "name": "Cake", "ingredients": [ { "name": "flour", "amount": null, "unit": null } ], "instructions": [] } ] }
  }$j$;
begin
  -- ------------------------------------------------------------ schéma : tables, RLS, index sur FK
  foreach t in array tables loop
    assert to_regclass(format('public.%I', t)) is not null, format('table %s absente', t);
    assert (select relrowsecurity from pg_class where oid = format('public.%I', t)::regclass), format('RLS off sur %s', t);
    -- (après 0019, les tables ont leurs politiques : ce contrôle ne vaut que pour l'état « 0017 seule »)
    assert to_regprocedure('private.can_read_recipe(uuid)') is not null
        or not exists (select 1 from pg_policies where schemaname = 'public' and tablename = t), format('politique inattendue sur %s', t);
    assert exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = t and column_name = 'created_at'),
      format('created_at manquant sur %s', t);
  end loop;

  -- toute clé étrangère des tables 0017 (et des nouvelles colonnes) a un index dont la 1re colonne est la sienne
  assert not exists (
    select 1
      from pg_constraint con
      join pg_class cl on cl.oid = con.conrelid
      join pg_namespace ns on ns.oid = cl.relnamespace
     where con.contype = 'f' and ns.nspname = 'public'
       and (cl.relname = any (tables)
            or (cl.relname = 'recipes' and con.conkey && array[
                  (select attnum from pg_attribute where attrelid = 'public.recipes'::regclass and attname = 'owner_id'),
                  (select attnum from pg_attribute where attrelid = 'public.recipes'::regclass and attname = 'copied_from'),
                  (select attnum from pg_attribute where attrelid = 'public.recipes'::regclass and attname = 'category_id')])
            or (cl.relname = 'profiles' and con.conkey && array[
                  (select attnum from pg_attribute where attrelid = 'public.profiles'::regclass and attname = 'active_theme_group_id')]))
       and not exists (select 1 from pg_index i
                        where i.indrelid = con.conrelid and i.indkey[0] = con.conkey[1])),
    'clé étrangère sans index';

  -- ------------------------------------------------------------ colonnes ajoutées : sans effet
  assert (select count(*) from public.recipes where owner_id is not null or copied_from is not null or category_id is not null) = 0;
  assert (select count(*) from public.recipes where visibility <> 'groups') = 0, 'visibility par défaut';
  assert (select count(*) from public.profiles where not discoverable or display_name is not null or theme_settings is not null) = 0;
  assert (select data_type from information_schema.columns where table_schema = 'public' and table_name = 'profiles' and column_name = 'theme') = 'text',
    'profiles.theme (light|dark) doit rester intact';

  -- ------------------------------------------------------------ categories
  insert into public.categories (owner_id, slug, name_fr, name_en) values (a, 'desserts', 'Desserts', 'Desserts') returning id into cat1;
  insert into public.categories (owner_id, slug, name_fr) values (b, 'desserts', 'Desserts');   -- même slug, autre personne : ok
  begin insert into public.categories (owner_id, slug, name_fr) values (a, 'desserts', 'Doublon'); raise exception 'slug en double';
  exception when unique_violation then null; end;
  begin insert into public.categories (owner_id, slug, name_fr) values (a, 'Bad Slug', 'X'); raise exception 'slug invalide';
  exception when check_violation then null; end;
  begin insert into public.categories (owner_id, slug) values (a, 'sans-nom'); raise exception 'catégorie sans nom';
  exception when check_violation then null; end;
  update public.categories set name_fr = 'Douceurs' where id = cat1;
  assert (select updated_at >= created_at from public.categories where id = cat1);

  -- recettes : propriétaire, catégorie, copie
  update public.recipes set owner_id = a, category_id = cat1 where id = r1;
  update public.recipes set owner_id = b, copied_from = r1 where id = r2;
  begin update public.recipes set visibility = 'public' where id = r1; raise exception 'visibility invalide';
  exception when check_violation then null; end;
  begin update public.recipes set owner_id = gen_random_uuid() where id = r1; raise exception 'propriétaire inconnu';
  exception when foreign_key_violation then null; end;

  -- ------------------------------------------------------------ groups, group_members
  insert into public.groups (name, created_by) values ('Les Boultons', a) returning id into g1;
  insert into public.groups (name, created_by, theme) values ('Amis', b, '{"preset":"boultons"}') returning id into g2;
  assert (select theme ->> 'preset' from public.groups where id = g1) = 'terracotta', 'thème par défaut';
  begin insert into public.groups (name, created_by) values ('', a); raise exception 'nom vide';
  exception when check_violation then null; end;
  begin insert into public.groups (name, created_by) values (repeat('x', 61), a); raise exception 'nom trop long';
  exception when check_violation then null; end;
  begin insert into public.groups (name, created_by, theme) values ('T', a, '[]'); raise exception 'thème non objet';
  exception when check_violation then null; end;

  insert into public.group_members (group_id, user_id, role) values (g1, a, 'creator'), (g1, b, 'member'), (g1, c, 'member'), (g2, b, 'creator'), (g2, a, 'member');
  begin insert into public.group_members (group_id, user_id, role) values (g1, b, 'member'); raise exception 'membre en double';
  exception when unique_violation then null; end;
  begin insert into public.group_members (group_id, user_id, role) values (g2, c, 'creator'); raise exception 'deux créateurs';
  exception when unique_violation then null; end;
  begin insert into public.group_members (group_id, user_id, role) values (g2, c, 'chef'); raise exception 'rôle invalide';
  exception when check_violation then null; end;

  -- un créateur ne peut pas supprimer son compte tant qu'il crée un groupe
  begin delete from auth.users where id = a; raise exception 'suppression du créateur acceptée';
  exception when foreign_key_violation then null; end;

  -- profiles : thème actif = groupe, supprimé avec le groupe (set null)
  update public.profiles set active_theme_group_id = g2, display_name = 'Mamie', cookbook_title = 'Recettes de Mamie',
                             theme_settings = '{"preset":"custom","primary":"#aa4466"}', onboarded_at = now() where id = c;
  begin update public.profiles set display_name = '' where id = c; raise exception 'pseudo vide';
  exception when check_violation then null; end;
  begin update public.profiles set theme_settings = '"x"' where id = c; raise exception 'thème non objet';
  exception when check_violation then null; end;

  -- ------------------------------------------------------------ friendships
  insert into public.friendships (requester_id, addressee_id) values (a, b);
  begin insert into public.friendships (requester_id, addressee_id) values (b, a); raise exception 'paire inversée en double';
  exception when unique_violation then null; end;
  begin insert into public.friendships (requester_id, addressee_id) values (a, b); raise exception 'paire en double';
  exception when unique_violation then null; end;
  begin insert into public.friendships (requester_id, addressee_id) values (c, c); raise exception 'ami de soi-même';
  exception when check_violation then null; end;
  begin insert into public.friendships (requester_id, addressee_id, status) values (a, c, 'accepted'); raise exception 'acceptée sans date de réponse';
  exception when check_violation then null; end;
  begin insert into public.friendships (requester_id, addressee_id, status) values (a, c, 'blocked'); raise exception 'statut invalide';
  exception when check_violation then null; end;
  insert into public.friendships (requester_id, addressee_id, status, responded_at) values (b, c, 'accepted', now());

  -- ------------------------------------------------------------ invitations
  insert into public.invitations (kind, inviter_id, target_user_id, group_id) values ('group', a, c, g2);
  begin insert into public.invitations (kind, inviter_id, target_user_id, group_id) values ('group', b, c, g2); raise exception 'invitation en attente en double';
  exception when unique_violation then null; end;
  insert into public.invitations (kind, inviter_id, target_user_id, group_id, status, responded_at) values ('group', a, c, g2, 'declined', now());   -- refus : l'historique ne bloque pas
  begin insert into public.invitations (kind, inviter_id, group_id) values ('group', a, g1); raise exception 'invitation sans cible';
  exception when check_violation then null; end;
  begin insert into public.invitations (kind, inviter_id, target_user_id) values ('group', a, b); raise exception 'invitation de groupe sans groupe';
  exception when check_violation then null; end;
  begin insert into public.invitations (kind, inviter_id, target_email, group_id) values ('friend', a, 'x@y.z', g1); raise exception 'invitation d''amitié avec groupe';
  exception when check_violation then null; end;
  begin insert into public.invitations (kind, inviter_id, target_user_id, group_id) values ('group', a, a, g1); raise exception 'auto-invitation';
  exception when check_violation then null; end;
  begin insert into public.invitations (kind, inviter_id, target_email) values ('friend', a, 'Pas.Minuscule@x.fr'); raise exception 'e-mail non normalisé';
  exception when check_violation then null; end;
  insert into public.invitations (kind, inviter_id, target_email, token_hash) values ('friend', a, 'ami@x.fr', repeat('h', 64));
  begin insert into public.invitations (kind, inviter_id, token_hash) values ('friend', b, repeat('h', 64)); raise exception 'token_hash en double';
  exception when unique_violation then null; end;
  assert (select expires_at > now() + interval '29 days' from public.invitations where target_email = 'ami@x.fr'), 'expiration par défaut';

  -- ------------------------------------------------------------ recipe_grants
  insert into public.recipe_grants (recipe_id, grantee_group_id, permission, granted_by) values (r1, g1, 'edit_original', a) returning id into grant1;
  insert into public.recipe_grants (recipe_id, grantee_user_id, permission, granted_by) values (r1, b, 'copy', a);
  begin insert into public.recipe_grants (recipe_id, grantee_user_id, permission, granted_by) values (r1, b, 'read', a); raise exception 'droit utilisateur en double';
  exception when unique_violation then null; end;
  begin insert into public.recipe_grants (recipe_id, grantee_group_id, permission, granted_by) values (r1, g1, 'read', a); raise exception 'droit groupe en double';
  exception when unique_violation then null; end;
  begin insert into public.recipe_grants (recipe_id, permission, granted_by) values (r1, 'read', a); raise exception 'sans bénéficiaire';
  exception when check_violation then null; end;
  begin insert into public.recipe_grants (recipe_id, grantee_user_id, grantee_group_id, permission, granted_by) values (r2, c, g1, 'read', b); raise exception 'deux bénéficiaires';
  exception when check_violation then null; end;
  begin insert into public.recipe_grants (recipe_id, grantee_user_id, permission, granted_by) values (r2, b, 'read', b); raise exception 'droit à soi-même';
  exception when check_violation then null; end;
  begin insert into public.recipe_grants (recipe_id, grantee_user_id, permission, granted_by) values (r2, c, 'admin', b); raise exception 'niveau invalide';
  exception when check_violation then null; end;
  begin insert into public.recipe_grants (recipe_id, grantee_user_id, permission, granted_by, origin) values (r2, c, 'read', b, 'reshare'); raise exception 'repartage sans source';
  exception when check_violation then null; end;
  begin insert into public.recipe_grants (recipe_id, grantee_user_id, permission, granted_by, source_grant_id) values (r2, c, 'read', b, grant1); raise exception 'source sans repartage';
  exception when check_violation then null; end;
  begin insert into public.recipe_grants (recipe_id, grantee_user_id, permission, granted_by, origin, source_grant_id) values (r1, c, 'edit_original', b, 'reshare', grant1);
    raise exception 'repartage avec droit d''édition';
  exception when check_violation then null; end;
  begin insert into public.recipe_grants (recipe_id, grantee_user_id, permission, granted_by, origin) values (r2, c, 'edit_original', b, 'link'); raise exception 'lien avec droit d''édition';
  exception when check_violation then null; end;
  -- repartage valide, supprimé en cascade avec sa source
  insert into public.recipe_grants (recipe_id, grantee_user_id, permission, granted_by, origin, source_grant_id) values (r1, c, 'copy', b, 'reshare', grant1);
  assert (select count(*) from public.recipe_grants where source_grant_id = grant1) = 1;
  delete from public.recipe_grants where id = grant1;
  assert (select count(*) from public.recipe_grants where source_grant_id = grant1) = 0, 'repartage non supprimé avec sa source';

  -- ------------------------------------------------------------ recipe_share_links
  insert into public.recipe_share_links (recipe_id) values (r1);
  assert (select token is not null from public.recipe_share_links where recipe_id = r1);
  begin insert into public.recipe_share_links (recipe_id) values (r1); raise exception 'deux liens pour une recette';
  exception when unique_violation then null; end;

  -- ------------------------------------------------------------ cookbook_entries
  insert into public.cookbook_entries (user_id, recipe_id, category_id) values (c, r1, cat1), (c, r2, null);
  begin insert into public.cookbook_entries (user_id, recipe_id) values (c, r1); raise exception 'entrée de carnet en double';
  exception when unique_violation then null; end;
  begin insert into public.cookbook_entries (user_id, recipe_id) values (c, gen_random_uuid()); raise exception 'recette inconnue';
  exception when foreign_key_violation then null; end;

  -- ------------------------------------------------------------ notifications, reports, system_alerts
  insert into public.notifications (user_id, type, payload) values (c, 'friend_request', '{"from":"b"}');
  begin insert into public.notifications (user_id, type, payload) values (c, 'x', '[]'); raise exception 'payload non objet';
  exception when check_violation then null; end;
  insert into public.reports (recipe_id, reporter_id, reason, details) values (r1, c, 'spam', 'test');
  begin insert into public.reports (recipe_id, reason) values (r1, 'autre'); raise exception 'motif invalide';
  exception when check_violation then null; end;
  insert into public.system_alerts (key, status, count) values ('ai_credit', 'alert', 1);
  begin insert into public.system_alerts (key, status) values ('ai_credit', 'ok'); raise exception 'clé en double';
  exception when unique_violation then null; end;
  begin insert into public.system_alerts (key, count) values ('k', -1); raise exception 'compteur négatif';
  exception when check_violation then null; end;

  -- ------------------------------------------------------------ cascades
  -- supprimer une recette : retirée des carnets, liens, droits ; la copie garde sa vie (copied_from -> null) ; le signalement reste
  delete from public.recipes where id = r1;
  assert (select count(*) from public.cookbook_entries where recipe_id = r1) = 0, 'carnets non nettoyés';
  assert (select count(*) from public.cookbook_entries where user_id = c) = 1, 'une seule entrée devait disparaître';
  assert (select count(*) from public.recipe_share_links where recipe_id = r1) = 0, 'lien public non supprimé';
  assert (select count(*) from public.recipe_grants where recipe_id = r1) = 0, 'droits non supprimés';
  assert (select copied_from from public.recipes where id = r2) is null, 'copied_from doit passer à null';
  assert (select count(*) from public.recipes where id = r2) = 1, 'la copie doit survivre';
  assert (select recipe_id from public.reports where reporter_id = c) is null, 'signalement conservé, recette_id null';

  -- supprimer un groupe : membres, invitations, droits de groupe partent ; le thème actif repasse en personnel
  delete from public.groups where id = g2;
  assert (select count(*) from public.group_members where group_id = g2) = 0;
  assert (select count(*) from public.invitations where group_id = g2) = 0;
  assert (select active_theme_group_id from public.profiles where id = c) is null, 'thème actif non remis en personnel';

  -- supprimer un compte non créateur : appartenances, amitiés, carnet, catégories, notifications partent
  delete from public.groups where id = g1;        -- libère le créateur a
  insert into public.groups (name, created_by) values ('Autre', b) returning id into g2;
  insert into public.group_members (group_id, user_id, role) values (g2, b, 'creator'), (g2, c, 'member');
  delete from auth.users where id = c;
  assert (select count(*) from public.group_members where user_id = c) = 0;
  assert (select count(*) from public.friendships where requester_id = c or addressee_id = c) = 0;
  assert (select count(*) from public.cookbook_entries where user_id = c) = 0;
  assert (select count(*) from public.notifications where user_id = c) = 0;
  assert (select count(*) from public.reports) = 1 and (select reporter_id from public.reports) is null, 'signalement conservé, reporter null';
  begin delete from auth.users where id = b; raise exception 'suppression du créateur de g2 acceptée';   -- b crée g2 : refusé
  exception when foreign_key_violation then null; end;
  raise notice '[test 0017] contraintes et cascades : OK';
end $$;

-- ---------------------------------------------------------------- API fermée
-- Un rôle authenticated / anon ne lit rien : aucune autorisation, et même avec un `select`
-- accordé par erreur, le RLS (sans politique) renverrait zéro ligne.
do $$
declare
  a constant uuid := '00000000-0000-0000-0000-00000000000a';
  t text; n bigint;
  tables constant text[] := array['categories', 'groups', 'group_members', 'friendships', 'invitations',
                                  'recipe_grants', 'recipe_share_links', 'cookbook_entries',
                                  'notifications', 'reports', 'system_alerts'];
begin
  -- Cette section décrit l'état « 0017 seule » ; après 0019 les tables ont des politiques (voir test_0019_rls.sql).
  if to_regprocedure('private.can_read_recipe(uuid)') is not null then
    raise notice '[test 0017] API fermée : ignoré (0019 appliquée)';
    return;
  end if;
  -- Aucune autorisation d'aucune sorte pour anon / authenticated (avant tout grant de test ci-dessous)
  foreach t in array tables loop
    assert not has_any_column_privilege('anon', format('public.%I', t), 'select, insert, update, references')
       and not has_any_column_privilege('authenticated', format('public.%I', t), 'select, insert, update, references')
       and not has_table_privilege('anon', format('public.%I', t), 'delete')
       and not has_table_privilege('authenticated', format('public.%I', t), 'delete')
       and not has_table_privilege('authenticated', format('public.%I', t), 'truncate'),
      format('droit résiduel sur %s pour anon / authenticated', t);
  end loop;

  -- Pas de données : on en ajoute une ligne par table de test (superuser) pour que « zéro ligne » ait un sens.
  insert into public.categories (owner_id, slug, name_fr) values (a, 'api-test', 'API');
  insert into public.groups (name, created_by) values ('API', a);
  insert into public.notifications (user_id, type) values (a, 'api-test');
  insert into public.system_alerts (key) values ('api-test');

  foreach t in array tables loop
    perform tests.login(a, 'authenticated');
    begin
      execute format('select count(*) from public.%I', t) into n;
      assert n = 0, format('authenticated lit %s ligne(s) de %s', n, t);
    exception when insufficient_privilege then null; end;
    begin
      execute format('insert into public.%I default values', t);
      raise exception 'authenticated a pu écrire dans %', t;
    exception when insufficient_privilege then null;
              when not_null_violation then raise exception 'authenticated a pu atteindre l''écriture de %', t; end;
    perform tests.logout();

    perform tests.login(a, 'anon');
    begin
      execute format('select count(*) from public.%I', t) into n;
      assert n = 0, format('anon lit %s ligne(s) de %s', n, t);
    exception when insufficient_privilege then null; end;
    perform tests.logout();

    -- défense en profondeur : même avec un grant accidentel, RLS sans politique = rien
    execute format('grant select, insert on public.%I to authenticated', t);
    perform tests.login(a, 'authenticated');
    execute format('select count(*) from public.%I', t) into n;
    assert n = 0, format('RLS sans politique : authenticated lit %s ligne(s) de %s', n, t);
    perform tests.logout();
    execute format('revoke all on public.%I from authenticated', t);
  end loop;

  -- toutes les privilèges refusés
  foreach t in array tables loop
    assert not has_table_privilege('authenticated', format('public.%I', t), 'select')
       and not has_table_privilege('anon', format('public.%I', t), 'select'), format('droit résiduel sur %s', t);
  end loop;
  raise notice '[test 0017] API fermée : OK';
end $$;

-- ---------------------------------------------------------------- fonctions existantes (mêmes appels qu'en 0016)
do $$
declare
  admin_id constant uuid := '00000000-0000-0000-0000-00000000000a';
  user_id  constant uuid := '00000000-0000-0000-0000-00000000000b';
  v_id uuid; v_list uuid; r record; n int;
  payload jsonb := $j${
    "title": "Tarte 0017", "category": "desserts et gâteaux", "servings": 6, "lang": "fr",
    "sections": [
      { "name": "Pâte", "type": "ingredients", "ingredients": [ { "name": "farine", "amount": "250", "unit": "g" } ] },
      { "name": "Préparation", "type": "instructions", "instructions": [ "Cuire." ] } ]
  }$j$;
  tr jsonb := $j${
    "title": "Pie 0017", "source_hash": "h1", "model": "mock", "tags": [],
    "content": { "sections": [ { "name": "Dough", "ingredients": [ { "name": "flour", "amount": null, "unit": null } ], "instructions": [] },
                               { "name": "Method", "ingredients": [], "instructions": ["Bake."] } ] }
  }$j$;
begin
  -- save_recipe + save_recipe_translation (admin) : la recette créée n'a pas de propriétaire (NULL), sans erreur
  perform tests.login(admin_id, 'authenticated');
  v_id := public.save_recipe(payload || jsonb_build_object('translation', tr));
  assert (select owner_id is null and visibility = 'groups' from public.recipes where id = v_id), 'nouvelle recette : owner_id NULL, visibility par défaut';
  perform public.save_recipe_translation(v_id, 'fr', tr);
  assert (select count(*) from public.recipe_translations where recipe_id = v_id) = 1;
  perform tests.logout();

  -- search_recipes (anonyme et connecté) : mêmes colonnes qu'en 0016
  perform tests.login(user_id, 'anon');
  select * into r from public.search_recipes('Tarte 0017');
  assert r.id = v_id and r.lang = 'fr' and r.translation ->> 'title' = 'Pie 0017', 'search_recipes';
  assert position('owner_id' in pg_get_function_result('public.search_recipes(text, text, text[], int, int)'::regprocedure)) = 0,
    'search_recipes ne doit pas exposer owner_id';
  perform tests.logout();

  -- add_recipe_to_list (utilisateur)
  perform tests.login(user_id, 'authenticated');
  insert into public.shopping_lists (user_id, name) values (user_id, 'Test 0017') returning id into v_list;
  perform public.add_recipe_to_list(v_id, v_list, null, 1);
  perform public.add_recipe_to_list(v_id, v_list, null, 1, 'en');
  assert (select count(*) from public.shopping_items where list_id = v_list) = 2, 'add_recipe_to_list';
  -- politiques existantes : un non-admin ne peut toujours pas écrire de recette
  begin
    perform public.save_recipe(payload || '{"title": "Interdit"}');
    raise exception 'un utilisateur a pu enregistrer une recette';
  exception when insufficient_privilege then null; end;
  perform tests.logout();

  -- suppression : cascades existantes inchangées
  perform tests.login(admin_id, 'authenticated');
  perform public.delete_recipe(v_id);
  perform tests.logout();
  assert not exists (select 1 from public.recipe_translations where recipe_id = v_id), 'cascade traductions';

  -- une recette existante garde son contenu
  assert (select count(*) from public.recipes) >= 2;
  raise notice '[test 0017] OK';
end $$;

rollback;
