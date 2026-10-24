-- Test 0025 : update_my_profile gère onboarded_at (chaîne complète 0017 → 0025 appliquée, 0018 comprise). Transaction annulée.
begin;

create or replace function tests.try(q text) returns text language plpgsql as $$
begin execute q; return 'ok'; exception when others then return sqlstate; end $$;
grant execute on function tests.try(text) to anon, authenticated, service_role;

do $$
declare
  b constant uuid := '00000000-0000-0000-0000-00000000000b';
  k record; t0 timestamptz;
begin
  assert (select count(*) from pg_proc where proname = 'update_my_profile' and pronamespace = 'public'::regnamespace) = 1, 'une seule surcharge';
  perform tests.login(b, 'authenticated');
  -- (0018 renseigne onboarded_at des comptes existants : on simule un compte neuf par l'update direct, autorisé par 0019)
  update public.profiles set onboarded_at = null where id = b;
  assert (select onboarded_at from public.profiles where id = b) is null, 'onboarded_at vide au départ';

  select * into k from public.update_my_profile(p_display_name => 'Bob Accueil');
  assert k.onboarded_at is null, 'inchangé sans p_complete_onboarding';
  select * into k from public.update_my_profile(p_display_name => 'Bob Accueil 2', p_cookbook_title => 'Carnet de Bob', p_complete_onboarding => true);
  assert k.onboarded_at is not null and k.display_name = 'Bob Accueil 2' and k.cookbook_title = 'Carnet de Bob', 'renseigné avec le profil';
  t0 := k.onboarded_at;
  perform pg_sleep(0.05);
  select * into k from public.update_my_profile(p_complete_onboarding => true);
  assert k.onboarded_at = t0, 'la 1re date est conservée (idempotent)';
  select * into k from public.update_my_profile(p_complete_onboarding => false);
  assert k.onboarded_at = t0, 'jamais remis à NULL par la fonction';
  assert tests.try(format($q$select public.update_my_profile(p_display_name => %L, p_complete_onboarding => true)$q$, 'bob@exemple.fr')) = '22023', 'pseudonyme avec @ refusé';
  -- les anciens appels (sans le nouveau paramètre, par nom) restent valides et non ambigus
  assert tests.try($q$select public.update_my_profile(p_discoverable => true)$q$) = 'ok', 'appel par nom non ambigu';
  perform tests.logout();

  assert not has_function_privilege('anon', 'public.update_my_profile(text, text, boolean, jsonb, uuid, boolean, boolean)', 'execute'), 'anon refusé';
  raise notice '[test 0025] update_my_profile / onboarded_at : OK';
end $$;

rollback;
