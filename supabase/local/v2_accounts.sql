-- ============================================================================
--  Comptes de test v2 (base LOCALE) — créés APRÈS le remplissage 0018 et la bascule 0020
-- ============================================================================
--  nouveau@local.test / password123 : compte « neuf » (onboarded_at vide, aucun pseudonyme, aucune catégorie,
--  dans aucun groupe) : sert à l'accueil en 3 écrans. Le profil est créé par handle_new_user (0024).
--  ami@local.test / password123 : deuxième compte neuf, pour les parcours à plusieurs (phases 6B-6C).
--  Idempotent : un compte existant est conservé tel quel.
-- ============================================================================
do $$
declare
  acc record;
begin
  for acc in
    select * from (values
      ('a0000000-0000-4000-8000-000000000011'::uuid, 'nouveau@local.test', 'Nouveau local'),
      ('a0000000-0000-4000-8000-000000000012'::uuid, 'ami@local.test',     'Ami local')
    ) as t(id, email, name)
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
        jsonb_build_object('name', acc.name, 'email_verified', true),
        now(), now(), '', '', '', '', '', '', '', '', false, false);

      insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
      values (gen_random_uuid(), acc.id, acc.id::text,
        jsonb_build_object('sub', acc.id::text, 'email', acc.email, 'email_verified', true, 'phone_verified', false),
        'email', now(), now(), now())
      on conflict (provider_id, provider) do nothing;
    end if;
  end loop;
end $$;

do $$
begin
  assert (select count(*) from public.profiles p join auth.users u on u.id = p.id where u.email in ('nouveau@local.test', 'ami@local.test')) = 2,
    '[v2_accounts] profils manquants (handle_new_user, 0024)';
  assert (select p.role from public.profiles p join auth.users u on u.id = p.id where u.email = 'nouveau@local.test') = 'user',
    '[v2_accounts] nouveau@local.test devrait être user';
end $$;
