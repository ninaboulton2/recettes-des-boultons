-- Tests 0023 — la v1 N'EST PAS cassée quand 0023 est appliquée (après 0019, AVANT le remplissage 0018 et la bascule 0020),
-- avec ou sans 0021 : politiques v1 intactes (tout le monde lit, les admins écrivent), owner_id toujours NULL, suppression
-- d'une recette sans effet de bord (aucune notification), profils modifiables comme avant, création / suppression de
-- compte intactes, nouvelles fonctions fermées à anon et vides pour un compte sans relation. Transaction annulée.
-- Données : seed_test.sql (…0a admin, …0b et …0c simples comptes).
begin;

create or replace function tests.try(q text) returns text language plpgsql as $$
begin execute q; return 'ok'; exception when others then return sqlstate; end $$;
grant execute on function tests.try(text) to anon, authenticated, service_role;

do $$
declare
  admin_id constant uuid := '00000000-0000-0000-0000-00000000000a';
  user_id  constant uuid := '00000000-0000-0000-0000-00000000000b';
  other_id constant uuid := '00000000-0000-0000-0000-00000000000c';
  new_id   constant uuid := '00000000-0000-0000-0000-0000000000e9';
  v_id uuid; n bigint; n_notif bigint; j jsonb;
  payload jsonb := '{"title":"Tarte 0023 v1","category":"desserts et gâteaux","servings":6,"lang":"fr"}'::jsonb;
begin
  assert not (select attnotnull from pg_attribute where attrelid = 'public.recipes'::regclass and attname = 'owner_id'), 'v1 : owner_id nullable';
  assert (select count(*) from public.recipes where owner_id is not null) = 0, 'v1 : aucune recette n''a de propriétaire';
  assert exists (select 1 from pg_trigger where tgname = 'trg_0023_recipe_deleted' and tgrelid = 'public.recipes'::regclass), 'le déclencheur de suppression est en place';
  assert exists (select 1 from pg_trigger where tgname = 'update_recipes_updated_at' and tgrelid = 'public.recipes'::regclass)
     and exists (select 1 from pg_trigger where tgname = 'trg_prevent_role_change' and tgrelid = 'public.profiles'::regclass), 'déclencheurs v1 toujours là';
  select count(*) into n_notif from public.notifications;

  -- ------------------------------------------------------------ v1 : écriture admin, suppression, sans notification
  perform tests.login(admin_id, 'authenticated');
  v_id := public.save_recipe(payload);
  perform tests.logout();
  perform tests.login(user_id, 'authenticated');
  assert tests.try(format('select public.delete_recipe(%L)', v_id)) = 'P0002', 'v1 : un non-admin ne supprime pas (comme avant)';
  perform tests.logout();
  perform tests.login(admin_id, 'authenticated');
  perform public.delete_recipe(v_id);
  assert tests.try(format('select public.delete_recipe(%L)', v_id)) = 'P0002', 'v1 : recette déjà supprimée = introuvable (comme avant)';
  perform tests.logout();
  assert not exists (select 1 from public.recipes where id = v_id), 'v1 : recette supprimée';
  assert (select count(*) from public.notifications) = n_notif, 'v1 : la suppression ne crée aucune notification';
  perform tests.login(user_id, 'anon');
  assert (select count(*) from public.recipes) > 3, 'v1 : anon lit toujours les recettes';
  perform tests.logout();

  -- ------------------------------------------------------------ v1 : profils, comptes
  perform tests.login(user_id, 'authenticated');
  update public.profiles set name = 'Bob v1', language = 'en' where id = user_id;
  get diagnostics n = row_count;
  assert n = 1, 'v1 : un compte modifie son profil';
  assert tests.try($q$update public.profiles set role = 'admin' where id = '00000000-0000-0000-0000-00000000000b'$q$) <> 'ok'
         or (select role from public.profiles where id = user_id) = 'user', 'v1 : pas de changement de rôle (inchangé)';
  perform tests.logout();
  insert into auth.users (id, email, raw_user_meta_data) values (new_id, 'nouveau-23@test.local', '{"name":"Nouveau"}');
  assert (select name from public.profiles where id = new_id) = 'Nouveau' and (select display_name from public.profiles where id = new_id) is null,
    'v1 : la création de compte crée le profil (pseudonyme vide)';
  delete from auth.users where id = new_id;
  assert not exists (select 1 from public.profiles where id = new_id), 'v1 : la suppression de compte cascade (aucun groupe à transférer)';
  -- un compte qui possède une recette sans propriétaire (v1) se supprime aussi, sans notification
  insert into auth.users (id, email, raw_user_meta_data) values (new_id, 'nouveau-23@test.local', '{}');
  delete from auth.users where id = new_id;
  assert (select count(*) from public.notifications) = n_notif, 'v1 : aucune notification créée par les comptes';

  -- ------------------------------------------------------------ nouvelles fonctions : fermées à anon, vides sans relation
  perform tests.login(user_id, 'anon');
  assert tests.try('select public.list_friends()') = '42501', 'anon : list_friends refusée';
  assert tests.try(format('select public.get_user_profile(%L)', admin_id)) = '42501', 'anon : get_user_profile refusée';
  assert tests.try('select public.unread_notifications_count()') = '42501', 'anon : unread_notifications_count refusée';
  perform tests.logout();
  perform tests.login(user_id, 'authenticated');
  assert (select count(*) from public.list_friends()) = 0 and (select count(*) from public.list_friend_requests()) = 0
     and (select count(*) from public.list_my_groups()) = 0 and (select count(*) from public.list_group_invitations()) = 0
     and (select count(*) from public.list_notifications()) = 0 and public.unread_notifications_count() = 0
     and (select count(*) from public.account_deletion_blockers()) = 0, 'v1 : tout est vide sans relation';
  assert (select count(*) from public.get_user_profile(admin_id)) = 0, 'v1 : le profil d''un inconnu est invisible';
  j := public.export_my_data();
  assert j -> 'profile' ->> 'id' = user_id::text and jsonb_array_length(j -> 'recipes') = 0, 'v1 : export vide mais valide';
  assert tests.try(format('select public.send_friend_request(%L)', admin_id)) = 'ok', 'une demande d''ami est possible dès la v1';
  perform tests.logout();
  perform tests.login(admin_id, 'authenticated');
  assert (select count(*) from public.list_notifications()) = 1, 'et notifie le destinataire';
  assert tests.try(format('select public.prepare_account_deletion(%L)', admin_id)) = '42501', 'prepare_account_deletion : service_role seulement';
  perform tests.logout();

  raise notice '[test 0023 v1] non-régression v1 avec 0023 : OK';
end $$;

rollback;
