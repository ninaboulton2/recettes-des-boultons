-- Tests de la relecture de sécurité n° 2 (0019, 0021, 0023, v2/0020) sous la chaîne COMPLÈTE 0017 → 0019 → 0021 → 0023 → 0018 → 0020.
-- Exécuté par run_local.sh après test_0023_social_rpcs.sql (deux fois : avant et après le retour arrière de la bascule). Transaction annulée.
-- Un bloc DO par correction, avec des messages d'assertion distincts : rejoué sur les anciennes migrations avec
-- `-v ON_ERROR_STOP=0 -v ON_ERROR_ROLLBACK=on`, chaque bloc échoue séparément (voir DEVELOPER.md § 20.9).
--
-- Personnes : s1 créateur du groupe · s2, s3 membres · s4 étranger · s5 (volumes : groupes, bannières) · s6 (volume : recettes)
begin;

create or replace function tests.try(q text) returns text language plpgsql as $$
begin execute q; return 'ok'; exception when others then return sqlstate; end $$;
grant execute on function tests.try(text) to anon, authenticated, service_role;

create or replace function tests.try_msg(q text) returns text language plpgsql as $$
begin execute q; return 'ok'; exception when others then return sqlstate || '|' || sqlerrm; end $$;
grant execute on function tests.try_msg(text) to anon, authenticated, service_role;

create or replace function tests.rows_affected(q text) returns bigint language plpgsql as $$
declare n bigint;
begin
  execute q; get diagnostics n = row_count; return n;
exception when insufficient_privilege then return -1;
          when others then return -2;
end $$;
grant execute on function tests.rows_affected(text) to anon, authenticated, service_role;

create or replace function tests.cnt(q text) returns bigint language plpgsql security definer set search_path = public as $$
declare n bigint;
begin execute 'select count(*) from (' || q || ') s' into n; return n; end $$;
grant execute on function tests.cnt(text) to anon, authenticated, service_role;

-- ================================================================ fixtures
do $$
declare
  s1 constant uuid := '00000000-0000-0000-0000-0000000005e1';
  s2 constant uuid := '00000000-0000-0000-0000-0000000005e2';
  s3 constant uuid := '00000000-0000-0000-0000-0000000005e3';
  s4 constant uuid := '00000000-0000-0000-0000-0000000005e4';
  s5 constant uuid := '00000000-0000-0000-0000-0000000005e5';
  s6 constant uuid := '00000000-0000-0000-0000-0000000005e6';
begin
  assert (select attnotnull from pg_attribute where attrelid = 'public.recipes'::regclass and attname = 'owner_id'), 'bascule 0020 appliquée';
  insert into auth.users (id, email, raw_user_meta_data) values
    (s1, 'sec-1@test.local', '{}'), (s2, 'sec-2@test.local', '{}'), (s3, 'sec-3@test.local', '{}'),
    (s4, 'sec-4@test.local', '{}'), (s5, 'sec-5@test.local', '{}'), (s6, 'sec-6@test.local', '{}');
  update public.profiles set display_name = 'Sec Un'    where id = s1;
  update public.profiles set display_name = 'Sec Deux'  where id = s2;
  update public.profiles set display_name = 'Sec Trois' where id = s3;
  update public.profiles set display_name = 'Sec Quatre' where id = s4;
  update public.profiles set display_name = 'Sec Cinq'  where id = s5;
  update public.profiles set display_name = 'Sec Six'   where id = s6;
  -- s1, s2, s3 sont amis deux à deux (un repartage vise un ami ou un co-membre)
  insert into public.friendships (requester_id, addressee_id, status, responded_at) values
    (s1, s2, 'accepted', now()), (s1, s3, 'accepted', now()), (s2, s3, 'accepted', now());
end $$;

-- ================================================================ 1. Limites de débit : verrou consultatif
do $$
declare t text;
begin
  foreach t in array array['private.check_rate_limit(text, int, text)', 'private.trg_reports_rate_limit()',
                           'private.trg_recipes_quota()', 'private.trg_groups_quota()', 'private.trg_dismissed_prompts_quota()'] loop
    assert position('pg_advisory_xact_lock' in pg_get_functiondef(t::regprocedure)) > 0, format('[1] verrou consultatif absent de %s', t);
  end loop;
  assert position('hashtextextended' in pg_get_functiondef('private.check_rate_limit(text, int, text)'::regprocedure)) > 0,
    '[1] check_rate_limit : verrou par personne et par genre (hashtextextended)';
end $$;

-- ================================================================ 2. Transfert / départ / retrait : verrous et contrôle du résultat
do $$
declare
  s1 constant uuid := '00000000-0000-0000-0000-0000000005e1';
  s2 constant uuid := '00000000-0000-0000-0000-0000000005e2';
  s3 constant uuid := '00000000-0000-0000-0000-0000000005e3';
  g uuid;
begin
  assert position('for update' in lower(pg_get_functiondef('public.leave_group(uuid)'::regprocedure))) > 0, '[2] leave_group ne verrouille pas le groupe';
  assert position('for update' in lower(pg_get_functiondef('public.remove_group_member(uuid, uuid)'::regprocedure))) > 0, '[2] remove_group_member ne verrouille pas le groupe';
  assert position('row_count' in lower(pg_get_functiondef('public.transfer_group_ownership(uuid, uuid)'::regprocedure))) > 0, '[2] transfer_group_ownership ne vérifie pas row_count';
  assert not (select provolatile = 's' from pg_proc where oid = 'private.require_group_creator(uuid)'::regprocedure), '[2] require_group_creator doit être volatile (verrou)';

  perform tests.login(s1, 'authenticated');
  g := public.create_group('Verrous');
  perform tests.logout();
  insert into public.group_members (group_id, user_id, role) values (g, s2, 'member'), (g, s3, 'member');
  -- après le transfert, l'ancien créateur n'est plus créateur : il ne peut plus retirer personne, et le nouveau ne peut pas partir
  perform tests.login(s1, 'authenticated');
  perform public.transfer_group_ownership(g, s2);
  assert tests.try(format('select public.remove_group_member(%L, %L)', g, s3)) = '42501', '[2] un ancien créateur ne retire plus personne';
  perform tests.logout();
  perform tests.login(s2, 'authenticated');
  assert tests.try(format('select public.leave_group(%L)', g)) = '22023', '[2] le nouveau créateur ne peut pas quitter le groupe';
  assert (select count(*) from public.group_members where group_id = g and role = 'creator') = 1, '[2] un seul créateur';
  perform tests.logout();
end $$;

-- ================================================================ 3. Invitation / lien d'un ex-créateur
do $$
declare
  s1 constant uuid := '00000000-0000-0000-0000-0000000005e1';
  s2 constant uuid := '00000000-0000-0000-0000-0000000005e2';
  s3 constant uuid := '00000000-0000-0000-0000-0000000005e3';
  s4 constant uuid := '00000000-0000-0000-0000-0000000005e4';
  g uuid; i1 uuid; link record; unknown_msg text; msg text; tok constant text := repeat('ab', 32); i2 uuid;
begin
  perform tests.login(s1, 'authenticated');
  g := public.create_group('Invitations');
  i1 := public.invite_to_group(g, s3);
  select * into link from public.create_invite_link(g);
  perform tests.logout();
  perform tests.login(s4, 'authenticated');
  unknown_msg := tests.try_msg(format('select public.redeem_invite_link(%L)', repeat('cd', 32)));
  assert unknown_msg like 'P0002|%', '[3] jeton inconnu : P0002';
  perform tests.logout();

  -- (a) transfert : les invitations en attente sont annulées, le lien aussi
  insert into public.group_members (group_id, user_id, role) values (g, s2, 'member');
  perform tests.login(s1, 'authenticated');
  perform public.transfer_group_ownership(g, s2);
  perform tests.logout();
  perform tests.login(s3, 'authenticated');
  assert tests.try(format('select public.respond_group_invitation(%L, true)', i1)) <> 'ok', '[3] ancienne invitation refusée après le transfert';
  perform tests.logout();
  perform tests.login(s4, 'authenticated');
  assert tests.try(format('select public.redeem_invite_link(%L)', link.token)) = 'P0002', '[3] ancien lien refusé après le transfert';
  perform tests.logout();

  -- (b) reliquat d'une course (invitation « pending » de l'ex-créateur, qui ne devrait pas exister) : refusée quand même
  insert into public.invitations (kind, inviter_id, target_user_id, group_id) values ('group', s1, s3, g) returning id into i2;
  insert into public.invitations (kind, inviter_id, group_id, token_hash, expires_at)
  values ('group', s1, g, encode(sha256(convert_to(tok, 'UTF8')), 'hex'), now() + interval '7 days');
  perform tests.login(s3, 'authenticated');
  msg := tests.try_msg(format('select public.respond_group_invitation(%L, true)', i2));
  assert msg like 'P0002|Invitation introuvable%', '[3] invitation d''un ex-créateur : même message qu''une invitation inconnue, obtenu : ' || msg;
  assert not exists (select 1 from public.group_members where group_id = g and user_id = s3), '[3] l''invitation d''un ex-créateur n''a pas fait entrer s3';
  perform tests.logout();
  perform tests.login(s4, 'authenticated');
  msg := tests.try_msg(format('select public.redeem_invite_link(%L)', tok));
  assert msg = unknown_msg, '[3] lien d''un ex-créateur : même message qu''un jeton inconnu, obtenu : ' || msg;
  assert not exists (select 1 from public.group_members where group_id = g and user_id = s4), '[3] le lien d''un ex-créateur n''a pas fait entrer s4';
  perform tests.logout();
  -- le créateur actuel invite normalement
  perform tests.login(s2, 'authenticated');
  assert public.invite_to_group(g, s4) is not null, '[3] le créateur actuel invite';
  assert (select token from public.create_invite_link(g)) is not null, '[3] le créateur actuel crée un lien';
  perform tests.logout();
end $$;

-- ================================================================ 4. E-mail du profil, colonnes modifiables, tailles des thèmes
do $$
declare
  s1 constant uuid := '00000000-0000-0000-0000-0000000005e1';
  s2 constant uuid := '00000000-0000-0000-0000-0000000005e2';
  g uuid;
begin
  perform tests.login(s1, 'authenticated');
  assert tests.try(format($q$update public.profiles set email = 'vole@test.local' where id = %L$q$, s1)) = '42501', '[4] profiles.email modifiable par son titulaire';
  assert tests.try(format($q$update public.profiles set email = 'vole@test.local' where id = %L$q$, s2)) = '42501', '[4] profiles.email modifiable (autre ligne)';
  assert tests.try(format($q$update public.profiles set id = gen_random_uuid() where id = %L$q$, s1)) = '42501', '[4] profiles.id modifiable';
  assert tests.rows_affected(format($q$update public.profiles set name = 'Un', language = 'en', theme = 'dark', notifications = false where id = %L$q$, s1)) = 1, '[4] colonnes v1 non modifiables';
  assert tests.rows_affected(format($q$update public.profiles set cookbook_title = 'Mon carnet', discoverable = false, onboarded_at = now() where id = %L$q$, s1)) = 1, '[4] colonnes v2 non modifiables';
  assert tests.rows_affected(format($q$update public.profiles set role = 'admin' where id = %L$q$, s1)) < 0, '[4] un compte ordinaire se nomme admin';
  assert (select email from public.profiles where id = s1) = 'sec-1@test.local', '[4] e-mail inchangé';
  -- taille des thèmes (profil)
  assert tests.try_msg(format($q$update public.profiles set theme_settings = jsonb_build_object('x', repeat('a', 4100)) where id = %L$q$, s1)) like '23514|%profiles_theme_settings_size%',
    '[4/5] theme_settings de plus de 4000 caractères accepté en écriture directe';
  assert tests.rows_affected(format($q$update public.profiles set theme_settings = '{"preset":"terracotta"}'::jsonb where id = %L$q$, s1)) = 1, '[5] thème normal refusé';
  g := public.create_group('Thèmes');
  assert tests.try_msg(format($q$update public.groups set theme = jsonb_build_object('x', repeat('a', 4100)) where id = %L$q$, g)) like '23514|%groups_theme_size%',
    '[5] groups.theme de plus de 4000 caractères accepté en écriture directe';
  assert tests.rows_affected(format($q$update public.groups set theme = '{"preset":"sauge"}'::jsonb where id = %L$q$, g)) = 1, '[5] thème de groupe normal refusé';
  perform tests.logout();
  perform tests.login(s1, 'anon');
  assert tests.try(format($q$update public.profiles set name = 'x' where id = %L$q$, s1)) = '42501', '[4] anon modifie un profil';
  perform tests.logout();
  -- les contraintes sont validées
  assert (select convalidated from pg_constraint where conname = 'profiles_theme_settings_size') and (select convalidated from pg_constraint where conname = 'groups_theme_size'),
    '[5] contraintes de taille non validées';
end $$;

-- ================================================================ 5. Volumes : groupes, bannières, recettes
do $$
declare
  s5 constant uuid := '00000000-0000-0000-0000-0000000005e5';
  s6 constant uuid := '00000000-0000-0000-0000-0000000005e6';
  s4 constant uuid := '00000000-0000-0000-0000-0000000005e4';
  i int; msg text;
begin
  -- 20 groupes créés par personne
  perform tests.login(s5, 'authenticated');
  for i in 1..20 loop perform public.create_group('Groupe ' || i); end loop;
  msg := tests.try_msg($q$select public.create_group('Groupe 21')$q$);
  assert msg like '53400|Limite atteinte : 20 groupes%', '[5] 21e groupe refusé, obtenu : ' || msg;
  assert tests.try(format($q$insert into public.groups (name, created_by) values ('Direct', %L)$q$, s5)) = '53400', '[5] 21e groupe par écriture directe';
  perform tests.logout();
  perform tests.login(s4, 'authenticated');
  assert tests.try($q$select public.create_group('Mon premier')$q$) = 'ok', '[5] le plafond est par personne';
  perform tests.logout();

  -- 5000 bannières fermées par personne
  insert into public.dismissed_prompts (user_id, kind, target_id)
  select s5, 'new_recipe', gen_random_uuid() from generate_series(1, 5000);
  perform tests.login(s5, 'authenticated');
  msg := tests.try_msg(format($q$insert into public.dismissed_prompts (user_id, kind, target_id) values (%L, 'new_recipe', gen_random_uuid())$q$, s5));
  assert msg like '53400|Limite atteinte : 5000 bannières%', '[5] 5001e bannière refusée, obtenu : ' || msg;
  assert tests.try(format($q$select public.dismiss_prompt('new_recipe', (select target_id from public.dismissed_prompts where user_id = %L limit 1))$q$, s5)) = 'ok',
    '[5] re-fermer une bannière déjà fermée reste idempotent à la limite';
  perform tests.logout();
  perform tests.login(s4, 'authenticated');
  assert tests.try(format($q$insert into public.dismissed_prompts (user_id, kind, target_id) values (%L, 'new_recipe', gen_random_uuid())$q$, s4)) = 'ok', '[5] plafond des bannières par personne';
  perform tests.logout();

  -- 2000 recettes par auteur
  insert into public.recipes (title, category, owner_id, visibility)
  select 'Volume ' || n, 'plats', s6, 'private' from generate_series(1, 2000) n;
  perform tests.login(s6, 'authenticated');
  msg := tests.try_msg($q$insert into public.recipes (title, category) values ('Une de trop', 'plats')$q$);
  assert msg like '53400|Limite atteinte : 2000 recettes%', '[5] 2001e recette refusée, obtenu : ' || msg;
  assert tests.try($q$select public.save_recipe('{"title":"Encore une","category":"plats"}'::jsonb)$q$) = '53400', '[5] 2001e recette refusée aussi par save_recipe';
  perform tests.logout();
  perform tests.login(s4, 'authenticated');
  assert tests.try($q$insert into public.recipes (title, category) values ('Normale', 'plats')$q$) = 'ok', '[5] plafond des recettes par auteur';
  perform tests.logout();
end $$;

-- ================================================================ 6/7. claim_shared_recipe : un droit existant n'est pas modifié
do $$
declare
  s1 constant uuid := '00000000-0000-0000-0000-0000000005e1';
  s2 constant uuid := '00000000-0000-0000-0000-0000000005e2';
  s3 constant uuid := '00000000-0000-0000-0000-0000000005e3';
  rc constant uuid := '50000000-0000-0000-0000-000000000c01';
  tok uuid; gid uuid; row_before record; row_after record;
begin
  insert into public.recipes (id, title, category, owner_id, visibility) values (rc, 'Partagée', 'plats', s1, 'private');
  perform tests.login(s1, 'authenticated');
  tok := public.create_share_link(rc);
  perform tests.logout();
  -- s2 : droit edit_original direct ; s3 : droit read direct
  insert into public.recipe_grants (recipe_id, grantee_user_id, permission, granted_by, origin) values
    (rc, s2, 'edit_original', s1, 'direct'), (rc, s3, 'read', s1, 'direct');
  select * into row_before from public.recipe_grants where recipe_id = rc and grantee_user_id = s3;
  perform tests.login(s2, 'authenticated');
  assert public.claim_shared_recipe(tok) = rc, '[7] claim renvoie la recette';
  perform tests.logout();
  perform tests.login(s3, 'authenticated');
  assert public.claim_shared_recipe(tok) = rc, '[7] claim (droit read) renvoie la recette';
  perform tests.logout();
  select * into row_after from public.recipe_grants where recipe_id = rc and grantee_user_id = s3;
  assert row_after is not distinct from row_before, '[7] le droit existant a été modifié par claim_shared_recipe : ' || row_after::text;
  assert (select permission from public.recipe_grants where recipe_id = rc and grantee_user_id = s2) = 'edit_original', '[7] edit_original conservé';
  assert exists (select 1 from public.cookbook_entries where user_id = s2 and recipe_id = rc)
     and exists (select 1 from public.cookbook_entries where user_id = s3 and recipe_id = rc), '[7] l''entrée de carnet est ajoutée';
  -- sans droit existant : le droit « copy » d'origine « link » est créé
  perform tests.login('00000000-0000-0000-0000-0000000005e4', 'authenticated');
  perform public.claim_shared_recipe(tok);
  perform tests.logout();
  assert (select permission || '/' || origin from public.recipe_grants where recipe_id = rc and grantee_user_id = '00000000-0000-0000-0000-0000000005e4') = 'copy/link', '[7] droit copy/link créé';
end $$;

-- ================================================================ 8. Repartage : une personne, jamais un groupe
do $$
declare
  s1 constant uuid := '00000000-0000-0000-0000-0000000005e1';
  s2 constant uuid := '00000000-0000-0000-0000-0000000005e2';
  s3 constant uuid := '00000000-0000-0000-0000-0000000005e3';
  rr constant uuid := '50000000-0000-0000-0000-000000000d01';
  gx uuid; msg text; v uuid;
begin
  insert into public.recipes (id, title, category, owner_id, visibility) values (rr, 'À repartager', 'plats', s1, 'private');
  insert into public.recipe_grants (recipe_id, grantee_user_id, permission, granted_by, origin) values (rr, s2, 'copy', s1, 'direct');
  perform tests.login(s2, 'authenticated');
  gx := public.create_group('Repartage');
  msg := tests.try_msg(format($q$select public.reshare_recipe(%L, null, %L, 'read')$q$, rr, gx));
  assert msg like '22023|%jamais un groupe%', '[8] repartage vers un groupe accepté ou message inattendu : ' || msg;
  assert tests.try(format($q$insert into public.recipe_grants (recipe_id, grantee_group_id, permission, granted_by, source_grant_id, origin)
                             values (%L, %L, 'read', %L, (select id from public.recipe_grants where recipe_id = %L and grantee_user_id = %L), 'reshare')$q$, rr, gx, s2, rr, s2)) = '42501',
    '[8] repartage vers un groupe accepté par écriture directe';
  v := public.reshare_recipe(rr, s3, null, 'read');
  assert v is not null, '[8] repartage vers un ami refusé';
  assert (select count(*) from public.recipe_grants where recipe_id = rr and grantee_group_id is not null) = 0, '[8] aucun droit de groupe';
  assert tests.try_msg(format($q$select public.reshare_recipe(%L, null, null, 'read')$q$, rr)) like '22023|%personne%', '[8] ni personne ni groupe : refus clair';
  perform tests.logout();
end $$;

-- ================================================================ 9. Invitations : insertion directe réservée au groupe du créateur
do $$
declare
  s1 constant uuid := '00000000-0000-0000-0000-0000000005e1';
  s2 constant uuid := '00000000-0000-0000-0000-0000000005e2';
  s3 constant uuid := '00000000-0000-0000-0000-0000000005e3';
  g uuid;
begin
  perform tests.login(s1, 'authenticated');
  g := public.create_group('Insertion directe');
  assert tests.try(format($q$insert into public.invitations (kind, inviter_id, target_user_id) values ('friend', %L, %L)$q$, s1, s3)) = '42501',
    '[9] invitation d''ami insérée directement';
  assert tests.try(format($q$insert into public.invitations (kind, inviter_id, target_user_id, group_id) values ('friend', %L, %L, %L)$q$, s1, s3, g)) = '42501',
    '[9] invitation d''ami (avec group_id) insérée directement';
  assert tests.try(format($q$insert into public.invitations (kind, inviter_id, target_user_id, group_id) values ('group', %L, %L, %L)$q$, s1, s3, g)) = 'ok',
    '[9] invitation de groupe du créateur refusée';
  perform tests.logout();
  perform tests.login(s2, 'authenticated');
  assert tests.try(format($q$insert into public.invitations (kind, inviter_id, target_user_id, group_id) values ('group', %L, %L, %L)$q$, s2, s3, g)) = '42501',
    '[9] invitation de groupe par un non-créateur';
  perform tests.logout();
end $$;

-- ================================================================ 10. save_recipe : pas d'oracle d'existence
do $$
declare
  s1 constant uuid := '00000000-0000-0000-0000-0000000005e1';
  s2 constant uuid := '00000000-0000-0000-0000-0000000005e2';
  rp constant uuid := '50000000-0000-0000-0000-000000000e01';
  rv constant uuid := '50000000-0000-0000-0000-000000000e02';
  fresh constant uuid := '50000000-0000-0000-0000-000000000e03';
  m_hidden text; m_readonly text; v uuid;
begin
  insert into public.recipes (id, title, category, owner_id, visibility) values (rp, 'Secrète', 'plats', s1, 'private'), (rv, 'Lisible', 'plats', s1, 'private');
  insert into public.recipe_grants (recipe_id, grantee_user_id, permission, granted_by, origin) values (rv, s2, 'read', s1, 'direct');
  perform tests.login(s2, 'authenticated');
  m_hidden   := tests.try_msg(format($q$select public.save_recipe(jsonb_build_object('id', %L, 'title', 'Pirate', 'category', 'plats'))$q$, rp));
  m_readonly := tests.try_msg(format($q$select public.save_recipe(jsonb_build_object('id', %L, 'title', 'Pirate', 'category', 'plats'))$q$, rv));
  assert m_readonly like '42501|%', '[10] id lisible mais non modifiable : 42501, obtenu : ' || m_readonly;
  assert m_hidden = m_readonly, '[10] id illisible : doit répondre comme un id refusé (' || m_readonly || '), obtenu : ' || m_hidden;
  v := public.save_recipe(jsonb_build_object('id', fresh, 'title', 'Nouvelle', 'category', 'plats'));
  assert v = fresh, '[10] un id libre est utilisé';
  perform tests.logout();
  assert (select title from public.recipes where id = rp) = 'Secrète' and (select owner_id from public.recipes where id = fresh) = s2, '[10] aucune recette modifiée par erreur';
end $$;

-- ================================================================ 11. Pseudonymes : invisibles, homoglyphes, unicité normalisée
do $$
declare
  s1 constant uuid := '00000000-0000-0000-0000-0000000005e1';
  s2 constant uuid := '00000000-0000-0000-0000-0000000005e2';
  s3 constant uuid := '00000000-0000-0000-0000-0000000005e3';
  s4 constant uuid := '00000000-0000-0000-0000-0000000005e4';
  n text;
begin
  perform tests.login(s1, 'authenticated');
  -- caractères de format / invisibles / espaces spéciales
  foreach n in array array[
      'Ni' || chr(8203) || 'na',          -- U+200B espace de largeur nulle (Cf)
      'Nina' || chr(65279),               -- U+FEFF
      'Ni' || chr(173) || 'na',           -- U+00AD trait d'union conditionnel (Cf)
      'Ni' || chr(8238) || 'na',          -- U+202E inversion de sens (Cf)
      'Ni' || chr(8288) || 'na',          -- U+2060 (Cf)
      'Ni' || chr(160) || 'na',           -- U+00A0 espace insécable (Zs)
      'Ni' || chr(8195) || 'na',          -- U+2003 espace cadratin (Zs)
      'Ni' || chr(12288) || 'na',         -- U+3000 espace idéographique
      'Ni' || chr(8232) || 'na',          -- U+2028 (Zl)
      'Ni' || chr(8233) || 'na',          -- U+2029 (Zp)
      'Ni' || chr(12644) || 'na',         -- U+3164 remplisseur hangul
      'Ni' || chr(10240) || 'na',         -- U+2800 braille vide
      'Ni' || chr(6158) || 'na',          -- U+180E (Cf)
      'Ni' || chr(917536) || 'na',        -- U+E0020 caractère d'étiquette (Cf)
      'Ni' || chr(9) || 'na'              -- tabulation
    ] loop
    assert tests.try(format('select public.update_my_profile(p_display_name => %L)', n)) = '22023', format('[11] pseudonyme invisible accepté : U+%s', to_hex(ascii(substr(n, 3, 1))));
  end loop;
  assert tests.try(format($q$update public.profiles set display_name = %L where id = %L$q$, 'Ni' || chr(8203) || 'na', s1)) = '22023', '[11] invisible accepté par écriture directe';
  -- mélange latin + cyrillique / grec
  assert tests.try(format('select public.update_my_profile(p_display_name => %L)', 'N' || chr(1110) || 'na')) = '22023', '[11] latin + cyrillique (і U+0456) accepté';
  assert tests.try(format('select public.update_my_profile(p_display_name => %L)', 'Nikos ' || chr(959))) = '22023', '[11] latin + grec (ο U+03BF) accepté';
  assert tests.try(format($q$update public.profiles set display_name = %L where id = %L$q$, 'P' || chr(1072) || 'ul', s1)) = '22023', '[11] latin + cyrillique accepté par écriture directe';
  -- un seul alphabet : permis
  assert tests.try(format('select public.update_my_profile(p_display_name => %L)', chr(1052) || chr(1072) || chr(1088) || chr(1080) || chr(1103))) = 'ok', '[11] pseudonyme entièrement cyrillique refusé';
  assert tests.try(format('select public.update_my_profile(p_display_name => %L)', chr(925) || chr(943) || chr(954) || chr(959) || chr(962))) = 'ok', '[11] pseudonyme entièrement grec refusé';
  assert tests.try('select public.update_my_profile(p_display_name => ''Éloïse & Co - 2024'')') = 'ok', '[11] pseudonyme latin accentué avec ponctuation refusé';
  perform tests.logout();

  -- unicité sur la forme normalisée (NFKC, minuscules, sans accents)
  perform tests.login(s3, 'authenticated');
  perform public.update_my_profile(p_display_name => 'Fidèle');
  perform tests.logout();
  perform tests.login(s4, 'authenticated');
  assert tests.try_msg(format('select public.update_my_profile(p_display_name => %L)', chr(64257) || 'dele')) like '22023|%déjà pris%', '[11] ligature « ﬁ » (NFKC) : doublon de « Fidèle » accepté';
  assert tests.try_msg(format('select public.update_my_profile(p_display_name => %L)', chr(65318) || chr(65353) || chr(65348) || chr(65349) || chr(65356) || chr(65349))) like '22023|%déjà pris%', '[11] lettres pleine chasse (NFKC) : doublon accepté';
  assert tests.try_msg('select public.update_my_profile(p_display_name => ''FIDELE'')') like '22023|%déjà pris%', '[11] casse et accents : doublon accepté';
  assert tests.try_msg(format($q$update public.profiles set display_name = %L where id = %L$q$, chr(64257) || 'dele', s4)) like '22023|%déjà pris%', '[11] doublon accepté par écriture directe';
  perform tests.logout();
  perform tests.login(s2, 'authenticated');
  assert tests.try('select public.update_my_profile(p_display_name => ''Sec Deux'')') = 'ok', '[11] garder son propre pseudonyme';
  perform tests.logout();
end $$;

-- ================================================================ 12. recipes_guard_owner_fields à profondeur > 1
create table tests.probe (recipe uuid, action text);
create or replace function tests.probe_fn() returns trigger language plpgsql as $$
begin
  -- mise à jour de `recipes` depuis un déclencheur (profondeur 2), avec les droits de la personne connectée
  if new.action = 'visibility' then update public.recipes set visibility = case when visibility = 'groups' then 'private' else 'groups' end where id = new.recipe;
  elsif new.action = 'owner' then update public.recipes set owner_id = '00000000-0000-0000-0000-0000000005e2' where id = new.recipe;
  elsif new.action = 'copied_from_null' then update public.recipes set copied_from = null where id = new.recipe;
  elsif new.action = 'copied_from_other' then update public.recipes set copied_from = '50000000-0000-0000-0000-000000000f04' where id = new.recipe;
  elsif new.action = 'category_null' then update public.recipes set category_id = null where id = new.recipe;
  elsif new.action = 'title' then update public.recipes set title = 'Retitrée' where id = new.recipe;
  end if;
  return new;
end $$;
create trigger probe_trg after insert on tests.probe for each row execute function tests.probe_fn();
grant insert on tests.probe to authenticated;

do $$
declare
  s1 constant uuid := '00000000-0000-0000-0000-0000000005e1';
  rg constant uuid := '50000000-0000-0000-0000-000000000f01';
  ro constant uuid := '50000000-0000-0000-0000-000000000f02';
  a text;
begin
  insert into public.recipes (id, title, category, owner_id, visibility) values (ro, 'Origine', 'plats', s1, 'groups');
  insert into public.recipes (id, title, category, owner_id, visibility) values ('50000000-0000-0000-0000-000000000f04', 'Autre origine', 'plats', s1, 'groups');
  insert into public.recipes (id, title, category, owner_id, visibility, copied_from) values (rg, 'Copie', 'plats', s1, 'private', ro);
  perform tests.login(s1, 'authenticated');
  assert tests.try(format($q$insert into tests.probe values (%L, 'visibility')$q$, rg)) = '42501', '[12] visibilité modifiée en profondeur 2';
  assert tests.try(format($q$insert into tests.probe values (%L, 'owner')$q$, rg)) = '42501', '[12] propriétaire modifié en profondeur 2';
  assert tests.try(format($q$insert into tests.probe values (%L, 'copied_from_other')$q$, rg)) = '42501', '[12] copied_from modifié (non NULL) en profondeur 2';
  assert (select visibility from public.recipes where id = rg) = 'private' and (select owner_id from public.recipes where id = rg) = s1, '[12] recette inchangée après refus';
  assert tests.try(format($q$insert into tests.probe values (%L, 'copied_from_null')$q$, rg)) = 'ok', '[12] copied_from → NULL doit être toléré (suppression de l''original)';
  assert (select copied_from from public.recipes where id = rg) is null, '[12] copied_from remis à NULL';
  assert tests.try(format($q$insert into tests.probe values (%L, 'category_null')$q$, rg)) = 'ok', '[12] category_id → NULL toléré';
  assert tests.try(format($q$insert into tests.probe values (%L, 'title')$q$, rg)) = 'ok', '[12] autres colonnes inchangées par la garde';
  perform tests.logout();
  -- chemin réel : supprimer l'original met copied_from des copies à NULL sans bloquer
  insert into public.recipes (id, title, category, owner_id, visibility, copied_from) values ('50000000-0000-0000-0000-000000000f03', 'Copie 2', 'plats', '00000000-0000-0000-0000-0000000005e2', 'private', ro);
  perform tests.login(s1, 'authenticated');
  delete from public.recipes where id = ro;
  perform tests.logout();
  assert (select copied_from from public.recipes where id = '50000000-0000-0000-0000-000000000f03') is null, '[12] la suppression de l''original met copied_from à NULL';
end $$;

rollback;
do $$ begin raise notice '[test sec2] verrous, ex-créateur, e-mail du profil, volumes, claim, repartage, invitations, oracle, pseudonymes, garde en profondeur : OK'; end $$;
