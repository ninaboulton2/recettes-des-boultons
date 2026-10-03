-- Tests 0009 : private.is_admin() (claim puis repli profiles), politiques, hook, prevent_role_change
begin;

do $$
declare
  admin_id constant uuid := '00000000-0000-0000-0000-00000000000a';
  user_id  constant uuid := '00000000-0000-0000-0000-00000000000b';
  ev jsonb; n int;
begin
  assert to_regprocedure('public.is_admin()') is null, 'public.is_admin() doit avoir disparu';
  assert (select count(*) from pg_policies where schemaname = 'public' and tablename <> 'ai_usage' and (qual ~ 'private\.is_admin' or with_check ~ 'private\.is_admin')) = 14;
  assert (select count(*) from pg_policies where schemaname = 'public' and tablename <> 'ai_usage') = 42, 'nombre de politiques (39 + units + unit_aliases + auth_admin ; ai_usage (0012) à part)';

  -- Repli profiles.role (pas de claim)
  perform tests.login(admin_id, 'authenticated');
  assert private.is_admin(), 'admin via profiles.role';
  perform tests.logout();
  perform tests.login(user_id, 'authenticated');
  assert not private.is_admin(), 'user via profiles.role';
  perform tests.logout();

  -- Le claim prime sur le profil (dans les deux sens)
  perform tests.login(user_id, 'authenticated', '{"user_role":"admin"}');
  assert private.is_admin(), 'claim admin';
  perform tests.logout();
  perform tests.login(admin_id, 'authenticated', '{"user_role":"user"}');
  assert not private.is_admin(), 'claim user prime sur profil admin (token non rafraîchi)';
  perform tests.logout();
  perform tests.login(user_id, 'authenticated', '{"app_metadata":{"user_role":"admin"}}');
  assert private.is_admin(), 'claim dans app_metadata';
  perform tests.logout();

  -- anon : jamais admin, et peut appeler la fonction (politiques SELECT publiques)
  perform tests.login(user_id, 'anon');
  assert not private.is_admin();
  assert (select count(*) from public.recipes) = 6, 'lecture publique recettes';
  perform tests.logout();

  -- RLS effectif : user ne peut pas écrire une recette, admin oui
  perform tests.login(user_id, 'authenticated');
  begin
    insert into public.recipes (title, category, ingredients, instructions) values ('x', 'plats', '[]', '[]');
    raise exception 'user a inséré une recette';
  exception when insufficient_privilege then null; end;
  -- profil : voit uniquement le sien
  assert (select count(*) from public.profiles) = 1;
  -- anti-escalade
  begin
    update public.profiles set role = 'admin' where id = user_id;
    raise exception 'escalade de rôle possible';
  exception when others then assert sqlerrm = 'Modification du rôle non autorisée', sqlerrm; end;
  perform tests.logout();

  perform tests.login(admin_id, 'authenticated');
  insert into public.recipes (title, category, ingredients, instructions) values ('x', 'plats', '[]', '[]');
  assert (select count(*) from public.profiles) = 3, 'admin voit tous les profils';
  update public.profiles set role = 'admin' where id = user_id;   -- autorisé pour un admin
  perform tests.logout();

  -- Hook : exécuté par supabase_auth_admin, lit profiles via sa politique
  set local role supabase_auth_admin;
  ev := public.custom_access_token_hook(jsonb_build_object('user_id', admin_id, 'claims', '{"role":"authenticated","aud":"authenticated"}'::jsonb));
  assert ev -> 'claims' ->> 'user_role' = 'admin', ev::text;
  assert ev -> 'claims' ->> 'aud' = 'authenticated', 'claims existants conservés';
  ev := public.custom_access_token_hook(jsonb_build_object('user_id', '00000000-0000-0000-0000-00000000000c', 'claims', '{}'::jsonb));
  assert ev -> 'claims' ->> 'user_role' = 'user';
  ev := public.custom_access_token_hook(jsonb_build_object('user_id', '99999999-9999-9999-9999-999999999999', 'claims', '{}'::jsonb));
  assert jsonb_typeof(ev -> 'claims' -> 'user_role') = 'null', 'utilisateur sans profil → null';
  reset role;

  -- Le hook n'est pas appelable via l'API
  perform tests.login(user_id, 'authenticated');
  begin
    perform public.custom_access_token_hook('{}'::jsonb);
    raise exception 'authenticated a pu appeler le hook';
  exception when insufficient_privilege then null; end;
  perform tests.logout();

  raise notice '[test 0009] OK';
end $$;

rollback;
