-- ============================================================================
--  Aide aux tests SQL sur la stack locale : tests.login() / tests.logout()
-- ============================================================================
--  Même contrat que tests/00_supabase_shim.sql (Postgres nu), mais SANS
--  recréer auth / storage / rôles : la vraie stack les fournit déjà.
--  Permet d'exécuter tests/test_00xx.sql via psql sur la base locale
--  (npm run db:local:test). Le schéma `tests` n'est pas exposé par PostgREST.
--    select tests.login('<uuid>', 'authenticated', '{"user_role":"admin"}');
--    select tests.logout();
-- ============================================================================
create schema if not exists tests;
grant usage on schema tests to anon, authenticated, service_role;

create or replace function tests.login(p_uid uuid, p_role text default 'authenticated', p_extra jsonb default '{}'::jsonb)
returns void language plpgsql set search_path = '' as $$
begin
  perform set_config('request.jwt.claims',
    (jsonb_build_object('sub', p_uid, 'role', p_role) || coalesce(p_extra, '{}'::jsonb))::text, true);
  execute format('set local role %I', p_role);
end $$;

create or replace function tests.logout() returns void
language plpgsql set search_path = '' as $$
begin
  perform set_config('request.jwt.claims', '', true);
  reset role;
end $$;

grant execute on function tests.login(uuid, text, jsonb), tests.logout() to anon, authenticated, service_role;
