-- ============================================================================
--  Comptes de test LOCAUX (jamais en prod) — idempotent
-- ============================================================================
--  admin@local.test / password123  → profiles.role = 'admin'
--  user@local.test  / password123  → profiles.role = 'user'
--  Si le snapshot prod les a déjà créés (mêmes e-mails, uuid prod), ils sont
--  conservés ; sinon ils sont créés avec des uuid fixes. Le profil est créé
--  par le trigger handle_new_user, puis son rôle est aligné (le trigger
--  anti-escalade est suspendu le temps de l'opération).
-- ============================================================================
do $$
declare
  acc record;
begin
  for acc in
    select * from (values
      ('a0000000-0000-4000-8000-000000000001'::uuid, 'admin@local.test', 'Admin local', 'admin'),
      ('a0000000-0000-4000-8000-000000000002'::uuid, 'user@local.test',  'Utilisateur local', 'user')
    ) as t(id, email, name, role)
  loop
    if not exists (select 1 from auth.users u where u.email = acc.email) then
      insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
        raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
        confirmation_token, recovery_token, email_change_token_new, email_change,
        phone_change, phone_change_token, email_change_token_current, reauthentication_token,
        is_sso_user, is_anonymous)
      values ('00000000-0000-0000-0000-000000000000', acc.id, 'authenticated', 'authenticated', acc.email,
        extensions.crypt('password123', extensions.gen_salt('bf')), now(),
        '{"provider":"email","providers":["email"]}'::jsonb,
        jsonb_build_object('name', acc.name, 'role', acc.role, 'email_verified', true),
        now(), now(), '', '', '', '', '', '', '', '', false, false);

      insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
      values (gen_random_uuid(), acc.id, acc.id::text,
        jsonb_build_object('sub', acc.id::text, 'email', acc.email, 'email_verified', true, 'phone_verified', false),
        'email', now(), now(), now())
      on conflict (provider_id, provider) do nothing;
    end if;
  end loop;
end $$;

-- Rôles attendus (le profil existe déjà via handle_new_user ou le snapshot).
alter table public.profiles disable trigger trg_prevent_role_change;
insert into public.profiles (id, email, name, role)
select u.id, u.email, coalesce(u.raw_user_meta_data ->> 'name', u.email),
       case when u.email = 'admin@local.test' then 'admin' else 'user' end
  from auth.users u
 where u.email in ('admin@local.test', 'user@local.test')
on conflict (id) do update set role = excluded.role, email = excluded.email;
alter table public.profiles enable trigger trg_prevent_role_change;

do $$
begin
  assert (select p.role from public.profiles p join auth.users u on u.id = p.id where u.email = 'admin@local.test') = 'admin',
    '[test_accounts] admin@local.test n''est pas admin';
  assert (select p.role from public.profiles p join auth.users u on u.id = p.id where u.email = 'user@local.test') = 'user',
    '[test_accounts] user@local.test n''est pas user';
end $$;
