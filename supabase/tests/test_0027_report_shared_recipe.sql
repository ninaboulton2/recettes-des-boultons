-- Test 0027 — report_shared_recipe(p_token, p_reason, p_details), sous la chaîne COMPLÈTE (0017 → 0019 → 0021 → 0023 → 0018 → 0020 → 0027).
-- a = Nina (auteure du seed, admin = support), d = étranger. Vérifie aussi le parcours du support (écran /support/signalements) :
-- lire les signalements ouverts, lire la recette signalée, traiter le signalement, supprimer la recette. Transaction annulée.
begin;

create or replace function tests.try(q text) returns text language plpgsql as $$
begin execute q; return 'ok'; exception when others then return sqlstate; end $$;
grant execute on function tests.try(text) to anon, authenticated, service_role;

do $$
declare
  a constant uuid := '00000000-0000-0000-0000-00000000000a';
  d constant uuid := '00000000-0000-0000-0000-0000000000d7';
  tok uuid; rp uuid; rid uuid; rid2 uuid; k record; n bigint; i int;
begin
  insert into auth.users (id, email, raw_user_meta_data) values (d, 'dave7@test.local', '{}');
  update public.profiles set display_name = 'Dave Sept' where id = d;

  perform tests.login(a, 'authenticated');
  rp := public.save_recipe('{"title":"À signaler 0027","category":"plats","visibility":"private"}'::jsonb);
  tok := (public.create_share_link(rp))::uuid;
  perform tests.logout();

  -- visiteur sans compte : refusé (fonction non exécutable par anon)
  perform tests.login(d, 'anon');
  assert tests.try(format($q$select public.report_shared_recipe(%L, 'spam', null)$q$, tok)) in ('42501'), 'anon : refusé';
  perform tests.logout();

  -- connecté sans session (auth.uid() NULL)
  assert (select has_function_privilege('anon', 'public.report_shared_recipe(uuid, text, text)', 'execute')) = false, 'anon : pas d''exécution';

  -- étranger connecté : signale par jeton, sans voir l'identifiant de la recette
  perform tests.login(d, 'authenticated');
  rid := public.report_shared_recipe(tok, 'copyright', '  texte copié du blog X  ');
  assert rid is not null, 'signalement créé';
  select * into k from public.reports where id = rid;
  assert k.recipe_id = rp and k.reporter_id = d and k.reason = 'copyright' and k.details = 'texte copié du blog X'
     and k.status = 'open' and k.handled_at is null, 'ligne attendue (détails sans espaces de bord)';
  rid2 := public.report_shared_recipe(tok, 'other', '   ');
  assert (select details from public.reports where id = rid2) is null, 'détails vides = NULL';
  -- entrées refusées
  assert tests.try(format($q$select public.report_shared_recipe(%L, 'bad', null)$q$, tok)) = '22023', 'motif inconnu';
  assert tests.try(format($q$select public.report_shared_recipe(%L, null, null)$q$, tok)) = '22023', 'motif NULL';
  assert tests.try(format($q$select public.report_shared_recipe(%L, 'spam', %L)$q$, tok, repeat('x', 2001))) = '22023', 'détails > 2000';
  assert tests.try(format($q$select public.report_shared_recipe(%L, 'spam', %L)$q$, tok, repeat('x', 2000))) = 'ok', 'détails = 2000';
  assert tests.try(format($q$select public.report_shared_recipe(%L, 'spam', null)$q$, gen_random_uuid())) = 'P0002', 'jeton inconnu';
  assert tests.try(format($q$select public.report_shared_recipe(null, 'spam', null)$q$)) = 'P0002', 'jeton NULL';
  -- limite : 10 par jour, partagée avec l'insertion directe (3 signalements déjà faits ici)
  for i in 1..7 loop
    perform public.report_shared_recipe(tok, 'spam', 'n° ' || i);
  end loop;
  assert tests.try(format($q$select public.report_shared_recipe(%L, 'spam', null)$q$, tok)) = '54000', '11e signalement refusé (54000)';
  assert tests.try(format($q$insert into public.reports (recipe_id, reporter_id, reason) values (%L, %L, 'spam')$q$, rp, d)) = '54000', 'insertion directe : même plafond';
  perform tests.logout();

  -- le support : lit, traite, ouvre la recette signalée, la supprime
  perform tests.login(a, 'authenticated', '{"user_role":"admin"}');
  assert private.is_support(), 'a est support';
  select count(*) into n from public.reports where status = 'open';
  assert n >= 10, 'le support voit les signalements ouverts';
  assert exists (select 1 from public.recipes where id = rp), 'le support lit la recette signalée (signalement ouvert)';
  update public.reports set status = 'reviewed', handled_at = now() where id = rid;
  assert (select status from public.reports where id = rid) = 'reviewed' and (select handled_at from public.reports where id = rid) is not null, 'traité';
  assert tests.try(format($q$update public.reports set status = 'nimporte' where id = %L$q$, rid)) = '23514', 'statut inconnu refusé par la contrainte';
  update public.reports set status = 'actioned', handled_at = now() where id = rid;
  delete from public.recipes where id = rp;
  assert not exists (select 1 from public.recipes where id = rp), 'le support supprime la recette signalée';
  assert (select recipe_id is null and status = 'actioned' from public.reports where id = rid), 'le signalement reste, recette détachée';
  perform tests.logout();

  -- un simple membre ne voit que ses propres signalements et ne traite rien
  perform tests.login(d, 'authenticated');
  assert (select count(*) from public.reports where reporter_id <> d) = 0, 'd ne voit que les siens';
  assert tests.try(format($q$update public.reports set status = 'dismissed' where id = %L$q$, rid2)) = 'ok'
     and (select status from public.reports where id = rid2) = 'open', 'd ne peut rien traiter (0 ligne)';
  perform tests.logout();

  raise notice '[test 0027] report_shared_recipe : entrées, limite, support : OK';
end $$;

rollback;
