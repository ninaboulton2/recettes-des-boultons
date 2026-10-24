-- ============================================================================
--  0024 — Correctif de sécurité : le rôle d'un nouveau compte est toujours 'user'
-- ============================================================================
--  FAILLE : handle_new_user recopiait raw_user_meta_data->>'role', fourni par
--  le client à l'inscription (supabase.auth.signUp({ options: { data: { role:
--  'admin' } } }) avec la clé anon publique) → n'importe qui pouvait s'inscrire
--  admin (écriture sur toutes les recettes en v1, rôle support en v2).
--  FAILLE 2 : la politique profiles_insert_self ne contrôlait que l'id → un compte
--  sans profil (il en existe un en prod) pouvait s'insérer un profil role='admin'.
--  CORRECTIF : rôle 'user' en dur dans handle_new_user, et insertion directe d'un
--  profil limitée à role = 'user'. Un admin se nomme uniquement en SQL
--  (service role / SQL Editor). Aucune donnée modifiée. Applicable tout de suite.
-- ============================================================================

begin;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
begin
  insert into public.profiles (id, email, name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'name', new.email),
    'user'
  );
  return new;
end;
$function$;

drop policy if exists profiles_insert_self on public.profiles;
create policy profiles_insert_self on public.profiles
  for insert to authenticated
  with check (id = (select auth.uid()) and role = 'user');

do $$
begin
  assert (select with_check from pg_policies where schemaname = 'public' and tablename = 'profiles'
           and policyname = 'profiles_insert_self') like '%role%',
    '[0024] profiles_insert_self ne contrôle pas le rôle';
  assert position('raw_user_meta_data->>''role''' in pg_get_functiondef('public.handle_new_user'::regproc)) = 0,
    '[0024] handle_new_user lit encore le rôle fourni par le client';
  raise notice '[0024] handle_new_user et profiles_insert_self : rôle ''user'' imposé';
end $$;

commit;
