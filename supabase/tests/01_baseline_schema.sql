-- ============================================================================
--  Schéma de base « tel qu'en prod AVANT 0001 » (tests locaux UNIQUEMENT)
-- ============================================================================
--  Reconstruit depuis information_schema / pg_constraint / pg_indexes /
--  pg_trigger de la prod tzlkabxcmmbwhpyvmato (lecture du 2026-10-03).
--  Sert uniquement à rejouer 0001 → 0010 sur un Postgres local.
--  Les 11 fonctions SECURITY DEFINER historiques sont créées en « stubs »
--  parce que 0001 les révoque sans `if exists` puis 0002 les supprime.
--  ⚠️  Ne JAMAIS exécuter en production.
-- ============================================================================
set search_path = public, extensions;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  name text,
  role text default 'user' check (role in ('admin','user')),
  language text default 'fr',
  theme text default 'light',
  notifications boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.recipes (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  category text not null,
  ingredients jsonb not null,
  instructions jsonb not null,
  prep_time integer,
  cook_time integer,
  servings integer,
  image text,
  tags text[] default '{}'::text[],
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists idx_recipes_category on public.recipes (category);
create index if not exists idx_recipes_tags on public.recipes using gin (tags);
create index if not exists idx_recipes_title on public.recipes using gin (to_tsvector('french', title));

create table if not exists public.recipe_sections (
  id uuid primary key default gen_random_uuid(),
  recipe_id uuid not null references public.recipes(id) on delete cascade,
  name text not null,
  type text not null check (type in ('ingredients','instructions','mixed')),
  order_index integer not null default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists idx_recipe_sections_recipe_id on public.recipe_sections (recipe_id);
create index if not exists idx_recipe_sections_order on public.recipe_sections (recipe_id, order_index);
create index if not exists idx_recipe_sections_type on public.recipe_sections (type);
create index if not exists idx_recipe_sections_name on public.recipe_sections (name);

create table if not exists public.recipe_ingredients (
  id uuid primary key default gen_random_uuid(),
  recipe_id uuid not null references public.recipes(id) on delete cascade,
  section_id uuid references public.recipe_sections(id),
  name text not null,
  amount text,
  unit text,
  optional boolean default false,
  order_index integer not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists idx_recipe_ingredients_recipe_id on public.recipe_ingredients (recipe_id);
create index if not exists idx_recipe_ingredients_section_id on public.recipe_ingredients (section_id);
create index if not exists idx_recipe_ingredients_order on public.recipe_ingredients (recipe_id, order_index);

create table if not exists public.instructions (
  id uuid primary key default gen_random_uuid(),
  recipe_id uuid not null references public.recipes(id) on delete cascade,
  section_id uuid references public.recipe_sections(id) on delete set null,
  content text not null,
  order_index integer not null default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists idx_instructions_recipe_id on public.instructions (recipe_id);
create index if not exists idx_instructions_section_id on public.instructions (section_id);
create index if not exists idx_instructions_order on public.instructions (recipe_id, order_index);

create table if not exists public.favorites (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  recipe_id uuid not null references public.recipes(id) on delete cascade,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create unique index if not exists idx_favorites_user_recipe_unique on public.favorites (user_id, recipe_id);

create table if not exists public.planning (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  date_string text not null,
  meal_type text not null check (meal_type in ('lunch','dinner')),
  recipe_id uuid references public.recipes(id) on delete cascade,
  custom_title text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create unique index if not exists idx_planning_user_date_meal_recipe on public.planning (user_id, date_string, meal_type, recipe_id);

create table if not exists public.planning_notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  date_string text not null,
  note_type text not null check (note_type in ('day','lunch','dinner')),
  content text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create unique index if not exists idx_planning_notes_user_date_type_unique on public.planning_notes (user_id, date_string, note_type);

create table if not exists public.shopping_lists (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null default 'Liste principale',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.shopping_items (
  id uuid primary key default gen_random_uuid(),
  list_id uuid not null references public.shopping_lists(id) on delete cascade,
  name text not null,
  amount text,
  unit text,
  recipe_id uuid references public.recipes(id) on delete set null,
  is_checked boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists idx_shopping_items_list on public.shopping_items (list_id);
create index if not exists idx_shopping_items_recipe on public.shopping_items (recipe_id);

-- Fonctions / triggers existants -------------------------------------------
create or replace function public.update_updated_at_column() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

create or replace function public.update_favorites_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer as $$
begin
  insert into public.profiles (id, email, name, role)
  values (new.id, new.email,
          coalesce(new.raw_user_meta_data->>'name', new.email),
          coalesce(new.raw_user_meta_data->>'role', 'user'));
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

do $$
declare t text;
begin
  foreach t in array array['recipes','favorites','planning','shopping_lists','shopping_items',
                           'recipe_sections','recipe_ingredients','instructions'] loop
    execute format('drop trigger if exists update_%s_updated_at on public.%I', t, t);
    execute format('create trigger update_%s_updated_at before update on public.%I for each row execute function public.update_updated_at_column()', t, t);
  end loop;
end $$;

-- Stubs des 11 fonctions SECURITY DEFINER historiques (révoquées par 0001,
-- supprimées par 0002). Corps vide : seul le prototype compte.
create or replace function public.add_shopping_item(uuid, text, text, text, uuid) returns void language sql security definer as $$ select null::void $$;
create or replace function public.check_user_favorite_exists(uuid, uuid) returns boolean language sql security definer as $$ select false $$;
create or replace function public.create_user_shopping_list(uuid, text) returns void language sql security definer as $$ select null::void $$;
create or replace function public.delete_shopping_item(uuid, uuid) returns void language sql security definer as $$ select null::void $$;
create or replace function public.delete_user_shopping_list(uuid, uuid) returns void language sql security definer as $$ select null::void $$;
create or replace function public.get_shopping_list_items(uuid) returns setof public.shopping_items language sql security definer as $$ select * from public.shopping_items where false $$;
create or replace function public.get_user_favorites(uuid) returns setof public.favorites language sql security definer as $$ select * from public.favorites where false $$;
create or replace function public.get_user_shopping_lists(uuid) returns setof public.shopping_lists language sql security definer as $$ select * from public.shopping_lists where false $$;
create or replace function public.remove_user_favorite(uuid, uuid) returns void language sql security definer as $$ select null::void $$;
create or replace function public.update_shopping_item(uuid, uuid, text, text, text, boolean) returns void language sql security definer as $$ select null::void $$;
create or replace function public.update_user_shopping_list(uuid, uuid, text) returns void language sql security definer as $$ select null::void $$;
create or replace function public.get_recipe_by_id(uuid) returns setof public.recipes language sql security definer as $$ select * from public.recipes where false $$;
create or replace function public.add_user_favorite(uuid, uuid) returns void language sql security definer as $$ select null::void $$;
create or replace function public.delete_user_favorite_by_id(uuid, uuid) returns void language sql security definer as $$ select null::void $$;
create or replace function public.delete_user_favorite_by_recipe(uuid, uuid) returns void language sql security definer as $$ select null::void $$;

-- Grants par défaut Supabase ------------------------------------------------
grant usage on schema public to anon, authenticated, service_role, supabase_auth_admin;
grant all on all tables in schema public to anon, authenticated, service_role;
grant all on all sequences in schema public to anon, authenticated, service_role;
grant execute on all functions in schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;

-- Politiques permissives « avant durcissement » (0001 les supprime toutes)
do $$
declare t text;
begin
  foreach t in array array['recipes','recipe_sections','recipe_ingredients','instructions',
                           'favorites','planning','planning_notes','shopping_lists','shopping_items','profiles'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "legacy_all" on public.%I', t);
    execute format('create policy "legacy_all" on public.%I for all using (true) with check (true)', t);
  end loop;
end $$;
