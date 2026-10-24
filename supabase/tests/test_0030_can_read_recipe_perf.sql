-- Test 0030 — private.can_read_recipe réécrite en plpgsql : MÊME résultat que l'expression de 0019, pour toute personne et toute recette,
-- sous la chaîne COMPLÈTE (0018 + 0020 appliquées, comme test_0026). Personnes : a auteure et support (compte admin du seed), b membre du
-- groupe, c membre, d étranger. Recettes : r1 (seed, droit de groupe), une privée, une « groups », une privée SIGNALÉE. Transaction annulée.
begin;

do $$
declare
  a constant uuid := '00000000-0000-0000-0000-00000000000a';
  b constant uuid := '00000000-0000-0000-0000-00000000000b';
  c constant uuid := '00000000-0000-0000-0000-00000000000c';
  d constant uuid := '00000000-0000-0000-0000-0000000000d7';
  r1 constant uuid := '10000000-0000-0000-0000-000000000001';
  rp uuid; rg uuid; rr uuid; who uuid; rid uuid; role_claim text; new_v boolean; old_v boolean; n int := 0;
begin
  assert (select prolang = (select oid from pg_language where lanname = 'plpgsql') from pg_proc where oid = 'private.can_read_recipe(uuid)'::regprocedure),
    '0030 : can_read_recipe devrait être en plpgsql';
  insert into auth.users (id, email, raw_user_meta_data) values (d, 'dave7@test.local', '{}');

  perform tests.login(a, 'authenticated', '{"user_role":"admin"}');
  rp := public.save_recipe('{"title":"Privée 0030","category":"plats","visibility":"private"}'::jsonb);
  rg := public.save_recipe('{"title":"Groupes 0030","category":"plats","visibility":"groups"}'::jsonb);
  rr := public.save_recipe('{"title":"Signalée 0030","category":"plats","visibility":"private"}'::jsonb);
  perform tests.logout();
  perform tests.login(b, 'authenticated');
  -- b est membre du groupe de a mais ne lit pas rr (privée) : il la signale, la recette devient lisible par le support
  insert into public.reports (recipe_id, reporter_id, reason) values (r1, b, 'spam');
  perform tests.logout();
  insert into public.reports (recipe_id, reporter_id, reason, status) values (rr, c, 'spam', 'open');

  foreach who in array array[a, b, c, d, null::uuid] loop
    foreach role_claim in array array['user', 'admin'] loop
      if who is null then
        perform set_config('request.jwt.claims', '', true);
        execute 'set local role anon';
      else
        perform tests.login(who, 'authenticated', jsonb_build_object('user_role', role_claim));
      end if;
      foreach rid in array array[r1, rp, rg, rr, gen_random_uuid(), null::uuid] loop
        begin
          new_v := private.can_read_recipe(rid);
          old_v := private.recipe_level(rid) >= 1
                   or (private.is_support() and exists (select 1 from public.reports r where r.recipe_id = rid and r.status in ('open', 'reviewed')));
        exception when insufficient_privilege then
          -- anon n'a pas le droit d'exécuter : même refus pour l'ancienne expression, rien à comparer
          new_v := null; old_v := null;
        end;
        assert new_v is not distinct from old_v, format('0030 : résultat différent (personne %s, rôle %s, recette %s) : %s ≠ %s', who, role_claim, rid, new_v, old_v);
        n := n + 1;
      end loop;
      perform tests.logout();
    end loop;
  end loop;

  -- cas ciblés
  perform tests.login(a, 'authenticated', '{"user_role":"admin"}');
  assert private.can_read_recipe(rr), 'l''auteure lit sa recette signalée';
  perform tests.logout();
  perform tests.login(d, 'authenticated', '{"user_role":"admin"}');
  assert private.is_support() and private.can_read_recipe(rr), 'le support lit une recette signalée';
  assert not private.can_read_recipe(rp), 'le support ne lit pas une recette privée non signalée';
  perform tests.logout();
  perform tests.login(d, 'authenticated', '{"user_role":"user"}');
  assert not private.can_read_recipe(rr) and not private.can_read_recipe(rp) and not private.can_read_recipe(r1) and private.can_read_recipe(rg) is false,
    'un étranger ne lit rien (même une recette signalée)';
  perform tests.logout();
  perform tests.login(b, 'authenticated');
  assert private.can_read_recipe(r1) and private.can_read_recipe(rg), 'un membre lit les recettes du groupe';
  perform tests.logout();

  raise notice '[test 0030] % comparaisons identiques (ancienne expression vs plpgsql)', n;
end $$;

rollback;
