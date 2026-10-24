-- Tests de la relecture de sécurité n° 2 SANS la bascule : la v1 n'est pas cassée (0019 + 0021 + 0023 appliquées, AVANT le
-- remplissage 0018 et la bascule 0020). Exécuté par run_local.sh après test_0023_v1_compat.sql. Transaction annulée.
--  - un compte modifie son profil comme avant (colonnes utilisées par l'app), mais plus son e-mail ni son identifiant ;
--  - le plafond de 2000 recettes par auteur est SANS EFFET tant que owner_id est NULL (le déclencheur n'est même pas appelé) ;
--  - le garde de 0023 sur les pseudonymes accepte un pseudonyme ordinaire ; les contraintes de taille des thèmes sont en place.
-- Données : seed_test.sql (…0a admin, …0b et …0c simples comptes).
begin;

create or replace function tests.try(q text) returns text language plpgsql as $$
begin execute q; return 'ok'; exception when others then return sqlstate; end $$;
grant execute on function tests.try(text) to anon, authenticated, service_role;

do $$
declare
  admin_id constant uuid := '00000000-0000-0000-0000-00000000000a';
  user_id  constant uuid := '00000000-0000-0000-0000-00000000000b';
  n bigint;
begin
  assert not (select attnotnull from pg_attribute where attrelid = 'public.recipes'::regclass and attname = 'owner_id'), 'v1 : owner_id nullable';

  -- profil : colonnes de la v1 modifiables, e-mail et identifiant non
  perform tests.login(user_id, 'authenticated');
  update public.profiles set name = 'Bob', language = 'en', theme = 'dark', notifications = false where id = user_id;
  get diagnostics n = row_count;
  assert n = 1, 'v1 : name / language / theme / notifications modifiables';
  assert tests.try(format($q$update public.profiles set email = 'autre@test.local' where id = %L$q$, user_id)) = '42501', 'v1 : e-mail modifiable';
  assert tests.try(format($q$update public.profiles set id = gen_random_uuid() where id = %L$q$, user_id)) = '42501', 'v1 : identifiant modifiable';
  assert (select email from public.profiles where id = user_id) = 'user-b@test.local', 'v1 : e-mail inchangé';
  assert (select count(*) from public.profiles where id = user_id) = 1, 'v1 : son profil reste lisible (select *)';
  assert tests.try(format($q$update public.profiles set theme_settings = jsonb_build_object('x', repeat('a', 4100)) where id = %L$q$, user_id)) = '23514', 'v1 : thème démesuré accepté';
  perform tests.logout();
  perform tests.login(user_id, 'anon');
  assert tests.try(format($q$update public.profiles set name = 'x' where id = %L$q$, user_id)) = '42501', 'v1 : anon modifie un profil';
  perform tests.logout();
  -- un admin v1 change toujours un rôle (colonne conservée, garde du déclencheur de 0001)
  perform tests.login(admin_id, 'authenticated');
  update public.profiles set role = 'user' where id = user_id;
  update public.profiles set role = 'user' where id = admin_id and false;
  perform tests.logout();

  -- plafond de recettes : sans effet quand owner_id est NULL (v1)
  perform tests.login(admin_id, 'authenticated');
  insert into public.recipes (title, category) select 'Vrac ' || g, 'plats' from generate_series(1, 2005) g;
  get diagnostics n = row_count;
  assert n = 2005, 'v1 : 2005 recettes sans propriétaire insérées (aucun plafond)';
  assert (select count(*) from public.recipes where owner_id is null and title like 'Vrac %') = 2005, 'v1 : owner_id reste NULL';
  perform tests.logout();
  assert (select pg_get_triggerdef(oid) from pg_trigger where tgname = 'trg_recipes_quota' and tgrelid = 'public.recipes'::regclass) like '%WHEN%owner_id IS NOT NULL%',
    'v1 : le déclencheur du plafond ne s''exécute que si owner_id n''est pas NULL';

  -- pseudonyme ordinaire accepté (admin, v1)
  perform tests.login(admin_id, 'authenticated');
  update public.profiles set display_name = 'Nina Test v1' where id = admin_id;
  get diagnostics n = row_count;
  assert n = 1, 'v1 : pseudonyme ordinaire accepté';
  perform tests.logout();
end $$;

rollback;
do $$ begin raise notice '[test sec2 v1] profil, plafond de recettes inerte, tailles de thème : OK'; end $$;
