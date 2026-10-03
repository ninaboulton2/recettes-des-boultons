-- ============================================================================
--  Shim « Supabase » pour PostgreSQL vanilla (tests locaux UNIQUEMENT)
-- ============================================================================
--  Reproduit le strict nécessaire de l'environnement Supabase hébergé pour
--  pouvoir rejouer les migrations sur un Postgres 17 local sans Docker :
--    - rôles anon / authenticated / service_role / supabase_auth_admin /
--      supabase_storage_admin / authenticator
--    - schéma extensions (+ pgcrypto, uuid-ossp)
--    - schéma auth : table users minimale + fonctions uid() / jwt() / role()
--      (définitions copiées depuis la prod, lecture de request.jwt.claims)
--    - schéma storage : tables buckets / objects minimales (RLS activé)
--
--  ⚠️  Ne JAMAIS exécuter ce fichier en production : il n'y a rien à créer,
--      tout existe déjà. Il n'est référencé que par tests/run_local.sh.
-- ============================================================================

-- Rôles -----------------------------------------------------------------------
do $$
declare r text;
begin
  foreach r in array array['anon','authenticated','service_role','supabase_auth_admin',
                           'supabase_storage_admin','authenticator','supabase_admin'] loop
    if not exists (select 1 from pg_roles where rolname = r) then
      execute format('create role %I nologin', r);
    end if;
  end loop;
end $$;
alter role service_role bypassrls;
grant anon, authenticated, service_role to authenticator;
grant anon, authenticated, service_role to postgres;

-- Schéma extensions -----------------------------------------------------------
create schema if not exists extensions;
grant usage on schema extensions to anon, authenticated, service_role, supabase_auth_admin;
create extension if not exists pgcrypto with schema extensions;
create extension if not exists "uuid-ossp" with schema extensions;
alter database postgres set search_path = "$user", public, extensions;
set search_path = "$user", public, extensions;

-- Schéma auth -----------------------------------------------------------------
create schema if not exists auth;
grant usage on schema auth to anon, authenticated, service_role, supabase_auth_admin;

create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  email text unique,
  raw_user_meta_data jsonb default '{}'::jsonb,
  raw_app_meta_data jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);
grant select on auth.users to supabase_auth_admin;

create or replace function auth.uid() returns uuid
language sql stable as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid
$$;

create or replace function auth.jwt() returns jsonb
language sql stable as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')
  )::jsonb
$$;

create or replace function auth.role() returns text
language sql stable as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role')
  )::text
$$;
grant execute on function auth.uid(), auth.jwt(), auth.role() to anon, authenticated, service_role, supabase_auth_admin;

-- Schéma storage --------------------------------------------------------------
create schema if not exists storage;
grant usage on schema storage to anon, authenticated, service_role;

create table if not exists storage.buckets (
  id text primary key,
  name text not null,
  owner uuid,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  public boolean default false,
  avif_autodetection boolean default false,
  file_size_limit bigint,
  allowed_mime_types text[],
  owner_id text
);

create table if not exists storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text references storage.buckets(id),
  name text,
  owner uuid,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  last_accessed_at timestamptz default now(),
  metadata jsonb,
  owner_id text,
  user_metadata jsonb
);
alter table storage.buckets enable row level security;
alter table storage.objects enable row level security;
grant all on storage.buckets, storage.objects to anon, authenticated, service_role;

-- Aide aux tests : simuler un utilisateur connecté --------------------------
-- select tests.login('<uuid>', 'authenticated', '{"user_role":"admin"}') puis
-- select tests.logout() ; les politiques RLS lisent request.jwt.claims.
create schema if not exists tests;
grant usage on schema tests to anon, authenticated, service_role, supabase_auth_admin;
create or replace function tests.login(p_uid uuid, p_role text default 'authenticated', p_extra jsonb default '{}'::jsonb)
returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    (jsonb_build_object('sub', p_uid, 'role', p_role) || coalesce(p_extra, '{}'::jsonb))::text, true);
  execute format('set local role %I', p_role);
end $$;

create or replace function tests.logout() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '', true);
  reset role;
end $$;
grant execute on function tests.login(uuid, text, jsonb), tests.logout() to anon, authenticated, service_role, supabase_auth_admin;
