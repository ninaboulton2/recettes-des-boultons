-- ============================================================================
--  0009 — is_admin() hors API (schéma private) + claim JWT `user_role`
-- ============================================================================
--  QUOI
--   (a) Schéma `private` (non exposé par PostgREST) ; `private.is_admin()`
--       SECURITY DEFINER, search_path vide, lit d'abord le claim JWT
--       coalesce(auth.jwt()->'app_metadata'->>'user_role', auth.jwt()->>'user_role')
--       et, s'il est absent (hook pas encore activé, ancien token), retombe
--       sur `profiles.role`. Toutes les politiques RLS qui référencent
--       `public.is_admin()` (14 en prod : recipes ×3, recipe_sections ×3,
--       recipe_ingredients ×3, instructions ×3, profiles ×2) sont recréées
--       à l'identique vers `private.is_admin()`, le trigger
--       `prevent_role_change` aussi, puis `public.is_admin()` est SUPPRIMÉE
--       (exception « expand only » autorisée : corrige l'alerte advisor
--       « Signed-In Users Can Execute SECURITY DEFINER Function »).
--       Assertion : même nombre de politiques avant/après, plus aucune
--       référence à public.is_admin.
--   (b) `public.custom_access_token_hook(event jsonb) returns jsonb`
--       (SECURITY INVOKER, exécuté par supabase_auth_admin) : ajoute le claim
--       `user_role` (= profiles.role, ou null) au token. Grants/revokes
--       conformes à la doc Supabase + politique RLS de lecture de `profiles`
--       pour supabase_auth_admin.
--
--  ACTIVATION DU HOOK (manuel, dashboard) — voir MIGRATION_NOTES.md :
--   Authentication → Hooks → « Customize Access Token (JWT) Claims hook »
--   → Postgres → schéma public, fonction custom_access_token_hook → Enable.
--   Tant qu'il n'est pas activé, private.is_admin() fonctionne via le repli
--   profiles.role : aucune régression.
--
--  NOTE : l'ancien code appelle-t-il `rpc('is_admin')` ? Non (vérifié : le
--   serveur lit profiles.role directement, server/utils/auth.ts). Sûr.
--
--  RÉVERSIBILITÉ : recréer public.is_admin() (corps de 0001) et rejouer la
--  boucle de recréation des politiques dans l'autre sens ; drop du hook.
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- (a) private.is_admin()
-- ----------------------------------------------------------------------------
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to anon, authenticated, service_role;
comment on schema private is 'Fonctions internes non exposées par l''API (PostgREST n''expose que public/graphql_public).';

create or replace function private.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when coalesce(auth.jwt() -> 'app_metadata' ->> 'user_role', auth.jwt() ->> 'user_role') is not null
      then coalesce(auth.jwt() -> 'app_metadata' ->> 'user_role', auth.jwt() ->> 'user_role') = 'admin'
    else exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  end;
$$;
comment on function private.is_admin() is
  'Vrai si le JWT porte user_role=admin (hook) ou, à défaut, si profiles.role=admin pour auth.uid().';
revoke execute on function private.is_admin() from public;
grant execute on function private.is_admin() to anon, authenticated, service_role;

-- Trigger anti-escalade : même logique, nouvelle fonction.
create or replace function public.prevent_role_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.role is distinct from old.role and not private.is_admin() then
    raise exception 'Modification du rôle non autorisée';
  end if;
  return new;
end;
$$;
revoke execute on function public.prevent_role_change() from anon, authenticated, public;

-- Recréation des politiques (uniquement si public.is_admin() existe encore :
-- le rejeu de cette migration est alors sans effet).
do $$
declare
  pol record;
  n_before int;
  n_after int;
  n_total_before int;
  n_total_after int;
  def text;
  roles_txt text;
begin
  if to_regprocedure('public.is_admin()') is null then
    raise notice '[0009] public.is_admin() déjà supprimée : politiques inchangées';
    return;
  end if;

  select count(*) into n_total_before from pg_policies where schemaname = 'public';
  select count(*) into n_before from pg_policies
   where schemaname = 'public' and (qual ~ '\mis_admin\(\)' or with_check ~ '\mis_admin\(\)');
  raise notice '[0009] % politique(s) référencent is_admin() (14 attendues en prod)', n_before;

  for pol in
    select * from pg_policies
     where schemaname = 'public' and (qual ~ '\mis_admin\(\)' or with_check ~ '\mis_admin\(\)')
     order by tablename, policyname
  loop
    select string_agg(quote_ident(r), ', ') into roles_txt from unnest(pol.roles) r;
    execute format('drop policy %I on %I.%I', pol.policyname, pol.schemaname, pol.tablename);
    def := format('create policy %I on %I.%I as %s for %s to %s',
                  pol.policyname, pol.schemaname, pol.tablename, pol.permissive, pol.cmd, roles_txt);
    if pol.qual is not null then
      def := def || format(' using (%s)', regexp_replace(pol.qual, '(public\.)?\mis_admin\(\)', 'private.is_admin()', 'g'));
    end if;
    if pol.with_check is not null then
      def := def || format(' with check (%s)', regexp_replace(pol.with_check, '(public\.)?\mis_admin\(\)', 'private.is_admin()', 'g'));
    end if;
    execute def;
  end loop;

  select count(*) into n_total_after from pg_policies where schemaname = 'public';
  select count(*) into n_after from pg_policies
   where schemaname = 'public' and (qual ~ 'private\.is_admin\(\)' or with_check ~ 'private\.is_admin\(\)');
  assert n_total_after = n_total_before,
    format('[0009] nombre total de politiques modifié : %s → %s', n_total_before, n_total_after);
  assert n_after = n_before,
    format('[0009] politiques migrées : %s, attendu %s', n_after, n_before);
  assert not exists (
    select 1 from pg_policies where schemaname = 'public'
       and (qual ~ '(^|[^.])\mis_admin\(\)' or with_check ~ '(^|[^.])\mis_admin\(\)')
       and not (qual ~ 'private\.is_admin\(\)' or with_check ~ 'private\.is_admin\(\)')),
    '[0009] des politiques référencent encore public.is_admin()';

  drop function public.is_admin();
  raise notice '[0009] public.is_admin() supprimée, % politique(s) basculée(s) vers private.is_admin()', n_after;
end $$;

-- ----------------------------------------------------------------------------
-- (b) Hook « custom access token » (ajoute user_role aux claims)
-- ----------------------------------------------------------------------------
create or replace function public.custom_access_token_hook(event jsonb)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  claims  jsonb;
  v_role  text;
begin
  select p.role into v_role
    from public.profiles p
   where p.id = (event ->> 'user_id')::uuid;

  claims := coalesce(event -> 'claims', '{}'::jsonb);
  if v_role is not null then
    claims := jsonb_set(claims, '{user_role}', to_jsonb(v_role));
  else
    claims := jsonb_set(claims, '{user_role}', 'null'::jsonb);
  end if;

  return jsonb_set(event, '{claims}', claims);
end;
$$;
comment on function public.custom_access_token_hook(jsonb) is
  'Auth hook Supabase : ajoute le claim user_role (profiles.role) au JWT. À activer dans le dashboard (Authentication → Hooks).';

grant usage on schema public to supabase_auth_admin;
grant execute on function public.custom_access_token_hook(jsonb) to supabase_auth_admin;
revoke execute on function public.custom_access_token_hook(jsonb) from authenticated, anon, public;

grant select on table public.profiles to supabase_auth_admin;
drop policy if exists "profiles_auth_admin_read" on public.profiles;
create policy "profiles_auth_admin_read" on public.profiles
  as permissive for select to supabase_auth_admin using (true);

-- Vérifications ---------------------------------------------------------------
do $$
declare ev jsonb;
begin
  assert to_regprocedure('public.is_admin()') is null, '[0009] public.is_admin() existe encore';
  assert to_regprocedure('private.is_admin()') is not null, '[0009] private.is_admin() manquante';
  ev := public.custom_access_token_hook(jsonb_build_object(
          'user_id', '00000000-0000-0000-0000-000000000000', 'claims', '{"role":"authenticated"}'::jsonb));
  assert ev -> 'claims' ? 'user_role', '[0009] le hook n''ajoute pas user_role';
  assert ev -> 'claims' ->> 'role' = 'authenticated', '[0009] le hook a perdu les claims existants';
end $$;

commit;
