-- Tests 0023 — fonctions métier côté social (amis, groupes, invitations, notifications, profil, compte), sous la
-- chaîne COMPLÈTE 0017 → 0019 → 0021 → 0023 → 0018 (remplissage) → 0020 (bascule). Exécuté par run_local.sh après
-- test_0021_recipe_rpcs.sql (deux fois : avant et après le retour arrière de la bascule). Transaction annulée.
--
-- Personnes : a = Nina (auteure, créatrice du groupe « Les Boultons ») · b, c = membres de ce groupe
--             d = Dave (étranger au départ) · e = Eve · f = Fay · g = Gus (jamais en relation) · z = compte des limites de débit
-- Pour chaque fonction : le « oui », puis le « non » (étranger, membre, créateur selon le cas).
begin;

create or replace function tests.try(q text) returns text language plpgsql as $$
begin execute q; return 'ok'; exception when others then return sqlstate; end $$;
grant execute on function tests.try(text) to anon, authenticated, service_role;

-- SQLSTATE et message (pour vérifier que l'erreur est claire, en français)
create or replace function tests.try_msg(q text) returns text language plpgsql as $$
begin execute q; return 'ok'; exception when others then return sqlstate || '|' || sqlerrm; end $$;
grant execute on function tests.try_msg(text) to anon, authenticated, service_role;

-- Comptage « en tant que propriétaire » (contourne le RLS) depuis n'importe quel rôle
create or replace function tests.cnt(q text) returns bigint language plpgsql security definer set search_path = public as $$
declare n bigint;
begin execute 'select count(*) from (' || q || ') s' into n; return n; end $$;
grant execute on function tests.cnt(text) to anon, authenticated, service_role;

do $$
declare
  a constant uuid := '00000000-0000-0000-0000-00000000000a';
  b constant uuid := '00000000-0000-0000-0000-00000000000b';
  c constant uuid := '00000000-0000-0000-0000-00000000000c';
  d constant uuid := '00000000-0000-0000-0000-0000000000d3';
  e constant uuid := '00000000-0000-0000-0000-0000000000e3';
  f constant uuid := '00000000-0000-0000-0000-0000000000f3';
  g constant uuid := '00000000-0000-0000-0000-000000000093';
  z constant uuid := '00000000-0000-0000-0000-0000000000a3';
  r1 constant uuid := '10000000-0000-0000-0000-000000000001';
  gd uuid; gb uuid; g2 uuid; g3 uuid; inv1 uuid; inv2 uuid; inv3 uuid; fr1 uuid; fr2 uuid; fr3 uuid;
  rd uuid; rd2 uuid; ra uuid; ra_copy uuid; rpriv uuid; grant1 uuid;
  k record; j jsonb; t text; n bigint; n2 bigint; ts timestamptz; tok text; tok2 text; v_uuid uuid; v_bool boolean;
  u uuid; email_a text; email_d text; ids uuid[]; re uuid; gx uuid; gx2 uuid; rx uuid; x uuid; i int;
  xid constant uuid := '00000000-0000-0000-0000-0000000000c3';
  rp_json constant jsonb := '{"title":"Tarte de Dave","category":"desserts et gâteaux","servings":4,"lang":"fr"}'::jsonb;
begin
  -- ============================================================ fixtures
  assert (select attnotnull from pg_attribute where attrelid = 'public.recipes'::regclass and attname = 'owner_id'), '0020 appliquée';
  select id into gb from public.groups where name = 'Les Boultons';
  assert gb is not null, 'groupe Boultons (0018)';
  insert into auth.users (id, email, raw_user_meta_data) values
    (d, 'dave-23@test.local', '{}'), (e, 'eve-23@test.local', '{}'), (f, 'fay-23@test.local', '{}'),
    (g, 'gus-23@test.local', '{}'), (z, 'zed-23@test.local', '{}');
  update public.profiles set display_name = 'Dave Étranger' where id = d;
  update public.profiles set display_name = 'Eve Amie'      where id = e;
  update public.profiles set display_name = 'Fay Amie'      where id = f;
  update public.profiles set display_name = 'Gus Inconnu'   where id = g;
  update public.profiles set display_name = 'Zed Limites'   where id = z;
  select email into email_a from public.profiles where id = a;
  email_d := 'dave-23@test.local';
  delete from public.notifications;     -- le remplissage / les tests précédents n'en créent pas, mais on repart de zéro

  -- ============================================================ droits d'exécution : anon refusé, authenticated oui, prepare = service_role seulement
  perform tests.login(d, 'anon');
  assert tests.try(format('select public.send_friend_request(%L)', e)) = '42501', 'anon : send_friend_request refusée';
  assert tests.try('select public.list_notifications()') = '42501', 'anon : list_notifications refusée';
  assert tests.try('select public.export_my_data()') = '42501', 'anon : export_my_data refusée';
  assert tests.try('select public.account_deletion_blockers()') = '42501', 'anon : account_deletion_blockers refusée';
  perform tests.logout();
  perform tests.login(d, 'authenticated');
  assert tests.try(format('select public.prepare_account_deletion(%L)', d)) = '42501', 'authenticated : prepare_account_deletion refusée';
  assert tests.try(format('select private.notify(%L, ''x'', ''{}'')', e)) = '42501', 'authenticated : private.notify inaccessible';
  assert tests.try('select * from private.rate_events') = '42501', 'authenticated : private.rate_events inaccessible';
  perform tests.logout();

  -- ============================================================ AMIS : send_friend_request
  perform tests.login(d, 'authenticated');
  fr1 := public.send_friend_request(e);
  assert fr1 is not null, 'd demande e';
  assert public.send_friend_request(e) = fr1, 'demande idempotente (même id)';
  assert tests.try_msg(format('select public.send_friend_request(%L)', d)) like '22023|%vous-même%', 'soi-même refusé';
  assert tests.try(format('select public.send_friend_request(%L)', gen_random_uuid())) = 'P0002', 'personne inconnue';
  assert tests.try('select public.send_friend_request(null)') = '22023', 'null refusé';
  perform tests.logout();
  select * into k from public.friendships where id = fr1;
  assert k.requester_id = d and k.addressee_id = e and k.status = 'pending' and k.responded_at is null, 'ligne pending';
  assert tests.cnt(format('select 1 from public.notifications where user_id = %L and type = ''friend_request''', e)) = 1,
    'une seule notification (l''appel idempotent n''en crée pas)';
  select payload into j from public.notifications where user_id = e and type = 'friend_request';
  assert j ->> 'friendship_id' = fr1::text and j ->> 'from_user_id' = d::text and j ->> 'from_name' = 'Dave Étranger', 'payload : ids + pseudonyme';
  assert j::text not like '%@%' and j::text not like '%test.local%', 'payload sans e-mail';
  -- la demande en sens inverse tant qu'elle est en attente : message clair, pas d'acceptation automatique
  perform tests.login(e, 'authenticated');
  assert tests.try_msg(format('select public.send_friend_request(%L)', d)) like '22023|%répondez-y%', 'sens inverse : répondre à la demande';
  -- list_friend_requests : incoming pour e, jamais d'e-mail
  select * into k from public.list_friend_requests();
  assert k.direction = 'incoming' and k.user_id = d and k.display_name = 'Dave Étranger' and k.status = 'pending' and k.retry_after is null, 'e voit la demande reçue';
  perform tests.logout();
  perform tests.login(d, 'authenticated');
  select * into k from public.list_friend_requests();
  assert k.direction = 'outgoing' and k.user_id = e and k.status = 'pending', 'd voit la demande envoyée';
  perform tests.logout();
  perform tests.login(g, 'authenticated');
  assert (select count(*) from public.list_friend_requests()) = 0 and (select count(*) from public.list_friends()) = 0, 'g (étranger) : rien';
  perform tests.logout();

  -- respond_friend_request
  perform tests.login(f, 'authenticated');
  assert tests.try(format('select public.respond_friend_request(%L, true)', fr1)) = 'P0002', 'étranger : demande introuvable';
  perform tests.logout();
  perform tests.login(d, 'authenticated');
  assert tests.try(format('select public.respond_friend_request(%L, true)', fr1)) = '42501', 'le demandeur ne peut pas répondre';
  perform tests.logout();
  perform tests.login(e, 'authenticated');
  assert tests.try(format('select public.respond_friend_request(%L, null)', fr1)) = '22023', 'choix manquant';
  assert tests.try(format('select public.respond_friend_request(%L, true)', gen_random_uuid())) = 'P0002', 'demande inconnue';
  assert public.respond_friend_request(fr1, true) = 'accepted', 'e accepte';
  assert tests.try(format('select public.respond_friend_request(%L, false)', fr1)) = '22023', 'déjà traitée';
  perform tests.logout();
  assert (select status from public.friendships where id = fr1) = 'accepted' and (select responded_at from public.friendships where id = fr1) is not null, 'amitié acceptée';
  assert tests.cnt(format('select 1 from public.notifications where user_id = %L and type = ''friend_accepted''', d)) = 1, 'd est prévenu de l''acceptation';
  select payload into j from public.notifications where user_id = d and type = 'friend_accepted';
  assert j ->> 'user_id' = e::text and j ->> 'name' = 'Eve Amie' and j::text not like '%@%', 'payload d''acceptation : id + pseudonyme';
  -- list_friends : pseudonyme seulement
  perform tests.login(d, 'authenticated');
  select * into k from public.list_friends();
  assert k.user_id = e and k.display_name = 'Eve Amie' and k.friendship_id = fr1 and k.since is not null, 'list_friends d';
  assert (select count(*) from public.list_friend_requests()) = 0, 'plus de demande en attente';
  assert public.send_friend_request(e) = fr1, 'déjà amis : renvoie la ligne, sans nouvelle notification';
  perform tests.logout();
  assert tests.cnt(format('select 1 from public.notifications where user_id = %L and type = ''friend_request''', e)) = 1, 'pas de nouvelle demande notifiée';
  perform tests.login(e, 'authenticated');
  assert (select user_id from public.list_friends()) = d, 'list_friends e';
  perform tests.logout();

  -- cancel_friend_request : demandeur seulement, retire la notification non lue
  perform tests.login(d, 'authenticated');
  fr2 := public.send_friend_request(f);
  perform tests.logout();
  assert tests.cnt(format('select 1 from public.notifications where user_id = %L and type = ''friend_request''', f)) = 1, 'f est notifiée';
  perform tests.login(f, 'authenticated');
  assert public.cancel_friend_request(fr2) = false, 'le destinataire ne peut pas annuler (c''est à lui de refuser)';
  perform tests.logout();
  perform tests.login(g, 'authenticated');
  assert public.cancel_friend_request(fr2) = false, 'un étranger ne peut pas annuler';
  perform tests.logout();
  perform tests.login(d, 'authenticated');
  assert public.cancel_friend_request(fr2) = true and public.cancel_friend_request(fr2) = false, 'le demandeur annule (idempotent)';
  assert public.cancel_friend_request(fr1) = false, 'une amitié acceptée ne s''annule pas';
  perform tests.logout();
  assert tests.cnt(format('select 1 from public.friendships where id = %L', fr2)) = 0, 'ligne supprimée';
  assert tests.cnt(format('select 1 from public.notifications where user_id = %L and type = ''friend_request''', f)) = 0, 'notification retirée';

  -- refus, relance, demande en retour
  perform tests.login(d, 'authenticated');
  fr2 := public.send_friend_request(f);
  perform tests.logout();
  perform tests.login(f, 'authenticated');
  assert public.respond_friend_request(fr2, false) = 'declined', 'f refuse';
  perform tests.logout();
  assert tests.cnt(format('select 1 from public.notifications where user_id = %L and type like ''friend_%%'' and payload ->> ''friendship_id'' = %L and type = ''friend_accepted''', d, fr2)) = 0,
    'un refus ne notifie personne';
  perform tests.login(d, 'authenticated');
  select * into k from public.list_friend_requests();
  assert k.direction = 'outgoing' and k.status = 'declined' and k.retry_after > now() + interval '6 days', 'd voit « refusée » et la date de relance';
  t := tests.try_msg(format('select public.send_friend_request(%L)', f));
  assert t like '22023|%renouveler dans 7 jour%', 'relance immédiate refusée avec le nombre de jours : ' || t;
  perform tests.logout();
  update public.friendships set created_at = now() - interval '8 days' where id = fr2;     -- 8 jours plus tard
  perform tests.login(d, 'authenticated');
  assert public.send_friend_request(f) = fr2, 'relance après 7 jours : même ligne';
  perform tests.logout();
  select * into k from public.friendships where id = fr2;
  assert k.status = 'pending' and k.responded_at is null and k.requester_id = d and k.created_at >= now() - interval '1 minute', 'relance : pending, date remise à maintenant';
  assert tests.cnt(format('select 1 from public.notifications where user_id = %L and type = ''friend_request''', f)) = 2, 'f est notifiée de la relance (en plus de la demande initiale non lue)';
  perform tests.login(f, 'authenticated');
  assert public.respond_friend_request(fr2, false) = 'declined', 'f refuse encore';
  -- f (qui a refusé) demande à son tour : tout de suite, la ligne change de sens
  assert public.send_friend_request(d) = fr2, 'f demande à d à son tour (même ligne)';
  perform tests.logout();
  select * into k from public.friendships where id = fr2;
  assert k.requester_id = f and k.addressee_id = d and k.status = 'pending', 'ligne retournée : f demandeuse';
  assert tests.cnt(format('select 1 from public.notifications where user_id = %L and type = ''friend_request'' and payload ->> ''from_user_id'' = %L', d, f)) = 1, 'd est notifié';
  perform tests.login(d, 'authenticated');
  assert public.respond_friend_request(fr2, true) = 'accepted', 'd accepte f';
  perform tests.logout();
  -- l'écriture directe (API) du demandeur d'origine obéit au même délai (déclencheur)
  perform tests.login(g, 'authenticated');
  fr3 := public.send_friend_request(a);
  perform tests.logout();
  perform tests.login(a, 'authenticated');
  assert public.respond_friend_request(fr3, false) = 'declined', 'a refuse g';
  perform tests.logout();
  perform tests.login(g, 'authenticated');
  assert tests.try(format($q$update public.friendships set status = 'pending', responded_at = null where id = %L$q$, fr3)) = '22023',
    'relance directe par l''API : délai de 7 jours aussi';
  perform tests.logout();

  -- ============================================================ remove_friend retire les droits directs (déclencheur de 0019, sans groupe commun)
  perform tests.login(d, 'authenticated');
  rd := public.save_recipe(rp_json || '{"visibility":"private"}'::jsonb);
  grant1 := public.grant_recipe(rd, e, null, 'copy');
  perform tests.logout();
  assert tests.cnt(format('select 1 from public.notifications where user_id = %L and type = ''recipe_shared''', e)) = 1, 'grant_recipe notifie e';
  select payload into j from public.notifications where user_id = e and type = 'recipe_shared';
  assert j ->> 'recipe_id' = rd::text and j ->> 'title' = 'Tarte de Dave' and j ->> 'permission' = 'copy' and j ->> 'from_name' = 'Dave Étranger'
     and j::text not like '%@%', 'recipe_shared : ids, titre, pseudonyme, sans e-mail';
  perform tests.login(e, 'authenticated');
  assert (select count(*) from public.recipes where id = rd) = 1, 'e lit la recette de d (droit direct)';
  perform tests.logout();
  perform tests.login(g, 'authenticated');
  assert public.remove_friend(d) = false, 'g n''est pas ami de d : false';
  perform tests.logout();
  perform tests.login(d, 'authenticated');
  assert public.remove_friend(e) = true and public.remove_friend(e) = false, 'd retire e (idempotent)';
  assert (select count(*) from public.list_friends() where user_id = e) = 0, 'plus amis';
  perform tests.logout();
  assert tests.cnt(format('select 1 from public.recipe_grants where id = %L', grant1)) = 0, 'le droit direct a disparu avec l''amitié';
  perform tests.login(e, 'authenticated');
  assert (select count(*) from public.recipes where id = rd) = 0, 'e ne lit plus la recette';
  assert tests.try(format('select public.send_friend_request(%L)', d)) = 'ok', 'on peut redemander après la fin d''une amitié';
  perform tests.logout();

  -- ============================================================ recipe_shared : doublon non lu ignoré, hausse notifiée, baisse non
  perform tests.login(d, 'authenticated');
  perform public.send_friend_request(f);                 -- d et f sont déjà amis (fr2) : renvoie la ligne
  grant1 := public.grant_recipe(rd, f, null, 'read');
  perform tests.logout();
  assert tests.cnt(format('select 1 from public.notifications where user_id = %L and type = ''recipe_shared''', f)) = 1, 'f notifiée (read)';
  perform tests.login(d, 'authenticated');
  perform public.grant_recipe(rd, f, null, 'copy');      -- hausse, mais une notification non lue existe déjà
  perform tests.logout();
  assert tests.cnt(format('select 1 from public.notifications where user_id = %L and type = ''recipe_shared''', f)) = 1, 'doublon non lu ignoré';
  perform tests.login(f, 'authenticated');
  assert public.mark_notifications_read(null) >= 1, 'f lit tout';
  perform tests.logout();
  perform tests.login(d, 'authenticated');
  perform public.grant_recipe(rd, f, null, 'edit_original');     -- hausse après lecture : nouvelle notification
  perform public.grant_recipe(rd, f, null, 'read');              -- baisse : rien
  perform tests.logout();
  assert tests.cnt(format('select 1 from public.notifications where user_id = %L and type = ''recipe_shared''', f)) = 2, 'hausse notifiée, baisse non';
  -- repartage par f (droit explicite) à une amie : notifie ; un droit à un GROUPE ne notifie pas
  perform tests.login(d, 'authenticated');
  perform public.grant_recipe(rd, f, null, 'copy');
  perform tests.logout();
  perform tests.login(f, 'authenticated');
  perform public.send_friend_request(a);                 -- f → a : a refusera pas ; sert seulement de relation pour le repartage
  perform tests.logout();

  -- ============================================================ GROUPES : create_group
  perform tests.login(d, 'authenticated');
  assert tests.try('select public.create_group(null)') = '22023' and tests.try('select public.create_group(''   '')') = '22023', 'nom vide refusé';
  assert tests.try(format('select public.create_group(%L)', repeat('x', 61))) = '22023', 'nom trop long refusé';
  gd := public.create_group('  Les Voisins  ');
  perform tests.logout();
  select * into k from public.groups where id = gd;
  assert k.name = 'Les Voisins' and k.created_by = d and k.theme = '{"preset":"terracotta"}'::jsonb, 'groupe créé (nom nettoyé, thème par défaut)';
  assert (select role from public.group_members where group_id = gd and user_id = d) = 'creator'
     and (select count(*) from public.group_members where group_id = gd) = 1, 'la ligne creator est créée avec le groupe (atomique)';

  -- rename / thème : créateur seulement
  perform tests.login(d, 'authenticated');
  perform public.rename_group(gd, 'Voisins du 12');
  perform public.update_group_theme(gd, '{"preset":"ocean","primary":"#123456"}'::jsonb);
  assert tests.try(format('select public.update_group_theme(%L, ''[1,2]''::jsonb)', gd)) = '22023', 'thème non objet refusé';
  assert tests.try(format('select public.update_group_theme(%L, null)', gd)) = '22023', 'thème null refusé';
  assert tests.try(format('select public.update_group_theme(%L, jsonb_build_object(''x'', repeat(''y'', 4100)))', gd)) = '22023', 'thème trop gros refusé';
  assert tests.try(format('select public.rename_group(%L, '''')', gd)) = '22023', 'renommage vide refusé';
  perform tests.logout();
  select * into k from public.groups where id = gd;
  assert k.name = 'Voisins du 12' and k.theme ->> 'preset' = 'ocean', 'renommé + thème';
  perform tests.login(g, 'authenticated');
  assert tests.try(format('select public.rename_group(%L, ''Pirate'')', gd)) = 'P0002', 'étranger : groupe introuvable (rename)';
  assert tests.try(format('select public.update_group_theme(%L, ''{}''::jsonb)', gd)) = 'P0002', 'étranger : groupe introuvable (thème)';
  assert tests.try(format('select public.invite_to_group(%L, %L)', gd, g)) = 'P0002', 'étranger : groupe introuvable (invitation)';
  assert tests.try(format('select public.create_invite_link(%L)', gd)) = 'P0002', 'étranger : groupe introuvable (lien)';
  assert tests.try(format('select * from public.list_group_members(%L)', gd)) = 'P0002', 'étranger : membres introuvables';
  assert tests.try(format('select public.delete_group(%L)', gd)) = 'P0002', 'étranger : groupe introuvable (suppression)';
  perform tests.logout();

  -- invite_to_group + notification ; list_group_invitations
  perform tests.login(d, 'authenticated');
  assert tests.try(format('select public.invite_to_group(%L, %L)', gd, d)) = '22023', 'on ne s''invite pas soi-même';
  assert tests.try(format('select public.invite_to_group(%L, %L)', gd, gen_random_uuid())) = 'P0002', 'invité inconnu';
  assert tests.try(format('select public.invite_to_group(%L, null)', gd)) = '22023', 'invité manquant';
  inv1 := public.invite_to_group(gd, e);
  assert public.invite_to_group(gd, e) = inv1, 'invitation idempotente';
  perform tests.logout();
  select * into k from public.invitations where id = inv1;
  assert k.kind = 'group' and k.inviter_id = d and k.target_user_id = e and k.group_id = gd and k.status = 'pending' and k.target_email is null
     and k.expires_at > now() + interval '29 days', 'invitation créée (30 jours)';
  assert tests.cnt(format('select 1 from public.notifications where user_id = %L and type = ''group_invitation''', e)) = 1, 'une notification (idempotent)';
  select payload into j from public.notifications where user_id = e and type = 'group_invitation';
  assert j ->> 'invitation_id' = inv1::text and j ->> 'group_id' = gd::text and j ->> 'group_name' = 'Voisins du 12'
     and j ->> 'from_name' = 'Dave Étranger' and j::text not like '%@%', 'payload d''invitation';
  perform tests.login(e, 'authenticated');
  select * into k from public.list_group_invitations();
  assert k.direction = 'received' and k.group_id = gd and k.user_id = d and k.display_name = 'Dave Étranger' and k.channel = 'user', 'e voit l''invitation reçue';
  assert (select count(*) from public.list_my_groups()) = 0, 'invitée mais pas encore membre';
  perform tests.logout();
  perform tests.login(d, 'authenticated');
  select * into k from public.list_group_invitations();
  assert k.direction = 'sent' and k.user_id = e and k.display_name = 'Eve Amie', 'le créateur voit l''invitation envoyée';
  perform tests.logout();
  perform tests.login(f, 'authenticated');
  assert (select count(*) from public.list_group_invitations()) = 0, 'un tiers ne voit aucune invitation';
  perform tests.logout();

  -- respond_group_invitation : non (étranger, inviteur), puis oui ; aucune recette ajoutée au carnet
  perform tests.login(f, 'authenticated');
  assert tests.try(format('select public.respond_group_invitation(%L, true)', inv1)) = 'P0002', 'tiers : invitation introuvable';
  perform tests.logout();
  perform tests.login(d, 'authenticated');
  assert tests.try(format('select public.respond_group_invitation(%L, true)', inv1)) = 'P0002', 'l''inviteur ne peut pas accepter à la place';
  perform tests.logout();
  perform tests.login(e, 'authenticated');
  assert tests.try(format('select public.respond_group_invitation(%L, null)', inv1)) = '22023', 'choix manquant';
  assert (select count(*) from public.recipes where id = rd) = 0, 'avant : e ne lit pas la recette « groupes » de d';
  assert public.respond_group_invitation(inv1, true) = 'accepted', 'e accepte';
  assert tests.try(format('select public.respond_group_invitation(%L, true)', inv1)) = '22023', 'déjà traitée';
  perform tests.logout();
  assert (select role from public.group_members where group_id = gd and user_id = e) = 'member', 'e est membre';
  assert (select status from public.invitations where id = inv1) = 'accepted', 'invitation acceptée';
  assert tests.cnt(format('select 1 from public.cookbook_entries where user_id = %L', e)) = 0, 'AUCUNE recette ajoutée au carnet en rejoignant';
  assert tests.cnt(format('select 1 from public.notifications where user_id = %L and type = ''group_invitation_accepted''', d)) = 1, 'le créateur est prévenu (une seule fois)';
  select payload into j from public.notifications where user_id = d and type = 'group_invitation_accepted';
  assert j ->> 'user_id' = e::text and j ->> 'name' = 'Eve Amie' and j ->> 'group_name' = 'Voisins du 12' and j::text not like '%@%', 'payload d''acceptation de groupe';
  -- rd est « private » : on en crée une partagée aux groupes pour vérifier l'accès par le groupe
  perform tests.login(d, 'authenticated');
  rd2 := public.save_recipe('{"title":"Soupe des voisins","category":"soupes","visibility":"groups"}'::jsonb);
  perform tests.logout();
  perform tests.login(e, 'authenticated');
  assert (select count(*) from public.recipes where id = rd2) = 1, 'e lit la recette « groupes » de d (groupe commun)';
  assert (select count(*) from public.list_cookbook() where id = rd2) = 0, 'mais elle n''est pas dans son carnet';
  select * into k from public.list_my_groups();
  assert k.group_id = gd and k.name = 'Voisins du 12' and k.role = 'member' and k.creator_name = 'Dave Étranger' and k.member_count = 2, 'list_my_groups e';
  -- list_group_members : pseudonymes seulement, créateur d'abord
  assert (select count(*) from public.list_group_members(gd)) = 2, 'e voit 2 membres';
  select * into k from public.list_group_members(gd) limit 1;
  assert k.user_id = d and k.role = 'creator' and k.display_name = 'Dave Étranger', 'créateur en premier';
  assert tests.try(format('select public.rename_group(%L, ''Piratage'')', gd)) = '42501', 'membre : renommage refusé';
  assert tests.try(format('select public.update_group_theme(%L, ''{}''::jsonb)', gd)) = '42501', 'membre : thème refusé';
  assert tests.try(format('select public.invite_to_group(%L, %L)', gd, f)) = '42501', 'membre : invitation refusée (créateur seulement)';
  assert tests.try(format('select public.create_invite_link(%L)', gd)) = '42501', 'membre : lien refusé';
  assert tests.try(format('select public.remove_group_member(%L, %L)', gd, d)) = '42501', 'membre : retrait refusé';
  assert tests.try(format('select public.transfer_group_ownership(%L, %L)', gd, e)) = '42501', 'membre : transfert refusé';
  assert tests.try(format('select public.delete_group(%L)', gd)) = '42501', 'membre : suppression refusée';
  assert tests.try(format('select public.invite_to_group(%L, %L)', gd, e)) = '42501', 'membre : même une invitation déjà faite';
  perform tests.logout();
  perform tests.login(d, 'authenticated');
  assert tests.try(format('select public.invite_to_group(%L, %L)', gd, e)) = '22023', 'déjà membre refusé';
  perform tests.logout();

  -- refus d'invitation, délai de 7 jours, annulation par le créateur
  perform tests.login(d, 'authenticated');
  inv2 := public.invite_to_group(gd, f);
  perform tests.logout();
  perform tests.login(f, 'authenticated');
  assert public.cancel_group_invitation(inv2) = false, 'l''invité ne peut pas « annuler » (il refuse)';
  assert public.respond_group_invitation(inv2, false) = 'declined', 'f refuse';
  perform tests.logout();
  assert tests.cnt(format('select 1 from public.notifications where user_id = %L and type = ''group_invitation_accepted''', d)) = 1, 'un refus ne notifie personne';
  assert tests.cnt(format('select 1 from public.group_members where group_id = %L and user_id = %L', gd, f)) = 0, 'f n''a pas rejoint';
  perform tests.login(d, 'authenticated');
  assert tests.try(format('select public.invite_to_group(%L, %L)', gd, f)) = '22023', 'ré-inviter tout de suite après un refus : refusé';
  perform tests.logout();
  update public.invitations set responded_at = now() - interval '8 days' where id = inv2;
  perform tests.login(d, 'authenticated');
  inv3 := public.invite_to_group(gd, f);
  assert inv3 <> inv2, 'nouvelle invitation après 7 jours';
  perform tests.logout();
  perform tests.login(g, 'authenticated');
  assert public.cancel_group_invitation(inv3) = false, 'étranger : annulation refusée';
  perform tests.logout();
  perform tests.login(d, 'authenticated');
  assert public.cancel_group_invitation(inv3) = true and public.cancel_group_invitation(inv3) = false, 'le créateur annule (idempotent)';
  perform tests.logout();
  assert tests.cnt(format('select 1 from public.notifications where user_id = %L and type = ''group_invitation'' and payload ->> ''invitation_id'' = %L', f, inv3)) = 0,
    'la notification non lue d''une invitation annulée disparaît';
  perform tests.login(f, 'authenticated');
  assert tests.try(format('select public.respond_group_invitation(%L, true)', inv3)) = '22023', 'accepter une invitation annulée : refusé';
  perform tests.logout();
  -- invitation expirée : refusée, puis remplacée par une nouvelle
  perform tests.login(d, 'authenticated');
  inv3 := public.invite_to_group(gd, f);
  perform tests.logout();
  update public.invitations set expires_at = now() - interval '1 hour', created_at = now() - interval '31 days' where id = inv3;
  perform tests.login(f, 'authenticated');
  assert tests.try_msg(format('select public.respond_group_invitation(%L, true)', inv3)) like '22023|%expirée%', 'expirée : refusée';
  assert (select count(*) from public.list_group_invitations()) = 0, 'expirée : non listée';
  perform tests.logout();
  perform tests.login(d, 'authenticated');
  inv2 := public.invite_to_group(gd, f);
  assert inv2 <> inv3, 'une invitation périmée est remplacée';
  perform tests.logout();
  assert (select status from public.invitations where id = inv3) = 'expired', 'l''ancienne est close';

  -- invitation par lien : jeton en clair une seule fois, empreinte stockée, usage unique
  perform tests.login(d, 'authenticated');
  select * into k from public.create_invite_link(gd);
  tok := k.token; inv3 := k.invitation_id;
  assert length(tok) = 64 and tok ~ '^[0-9a-f]{64}$' and k.expires_at between now() + interval '6 days' and now() + interval '8 days', 'jeton de 64 hex, 7 jours';
  select * into k from public.list_group_invitations() where invitation_id = inv3;
  assert k.direction = 'sent' and k.channel = 'link' and k.user_id is null, 'lien listé pour le créateur (sans personne ni jeton)';
  assert tests.try(format('select token_hash from public.invitations where id = %L', inv3)) = '42501', 'token_hash illisible par l''API';
  perform tests.logout();
  select token_hash into t from public.invitations where id = inv3;
  assert t = encode(sha256(convert_to(tok, 'UTF8')), 'hex') and t <> tok and position(tok in t) = 0, 'seule l''empreinte SHA-256 est stockée';
  perform tests.login(g, 'authenticated');
  assert tests.try(format('select public.redeem_invite_link(%L)', repeat('0', 64))) = 'P0002', 'jeton inconnu';
  assert tests.try('select public.redeem_invite_link(null)') = 'P0002', 'jeton absent';
  assert public.redeem_invite_link(tok) = gd, 'g rejoint par le lien';
  assert tests.try_msg(format('select public.redeem_invite_link(%L)', tok)) like 'P0002|%invalide ou expiré%', 'jeton consommé : même message';
  perform tests.logout();
  assert (select role from public.group_members where group_id = gd and user_id = g) = 'member', 'g est membre';
  select * into k from public.invitations where id = inv3;
  assert k.status = 'accepted' and k.target_user_id = g, 'lien consommé';
  assert tests.cnt(format('select 1 from public.cookbook_entries where user_id = %L', g)) = 0, 'aucune recette ajoutée par le lien';
  assert tests.cnt(format('select 1 from public.notifications where user_id = %L and type = ''group_invitation_accepted'' and payload ->> ''user_id'' = %L', d, g)) = 1,
    'le créateur est prévenu (lien)';
  perform tests.login(d, 'authenticated');
  select * into k from public.create_invite_link(gd);
  tok2 := k.token;
  assert tests.try_msg(format('select public.redeem_invite_link(%L)', tok2)) like '22023|%propre lien%', 'le créateur n''utilise pas son lien';
  perform tests.logout();
  perform tests.login(e, 'authenticated');
  assert public.redeem_invite_link(tok2) = gd, 'déjà membre : renvoie le groupe';
  perform tests.logout();
  assert (select status from public.invitations where token_hash = encode(sha256(convert_to(tok2, 'UTF8')), 'hex')) = 'pending', 'déjà membre : le lien n''est pas consommé';
  update public.invitations set expires_at = now() - interval '1 minute', created_at = now() - interval '8 days'
   where token_hash = encode(sha256(convert_to(tok2, 'UTF8')), 'hex');
  perform tests.login(f, 'authenticated');
  assert tests.try(format('select public.redeem_invite_link(%L)', tok2)) = 'P0002', 'lien expiré';
  perform tests.logout();
  perform tests.login(d, 'authenticated');
  select * into k from public.create_invite_link(gd);
  tok2 := k.token; inv3 := k.invitation_id;
  assert public.cancel_group_invitation(inv3) = true, 'le créateur annule un lien';
  perform tests.logout();
  perform tests.login(f, 'authenticated');
  assert tests.try(format('select public.redeem_invite_link(%L)', tok2)) = 'P0002', 'lien annulé';
  perform tests.logout();


  -- leave_group : perdre l'accès ; le créateur ne part pas
  perform tests.login(d, 'authenticated');
  assert tests.try_msg(format('select public.leave_group(%L)', gd)) like '22023|%passez le rôle%', 'le créateur ne peut pas quitter (message clair)';
  perform tests.logout();
  perform tests.login(e, 'authenticated');
  assert tests.try(format('select public.leave_group(%L)', gen_random_uuid())) = 'P0002', 'groupe inconnu';
  perform public.update_my_profile(p_active_theme_group_id => gd);
  assert (select active_theme_group_id from public.profiles where id = e) = gd, 'thème actif = le groupe';
  assert (select count(*) from public.recipes where id = rd2) = 1, 'avant de partir : e lit la recette du groupe';
  perform public.add_to_cookbook(rd2);
  perform public.leave_group(gd);
  assert (select count(*) from public.recipes where id = rd2) = 0, 'APRÈS être parti : e ne lit plus la recette du groupe';
  assert (select count(*) from public.list_cookbook() where id = rd2) = 0, 'et elle sort de son carnet affiché';
  assert (select count(*) from public.list_my_groups()) = 0, 'plus de groupe';
  assert tests.try(format($q$insert into public.group_members (group_id, user_id, role) values (%L, %L, 'member')$q$, gd, e)) = '42501',
    'on ne revient pas sans nouvelle invitation';
  perform tests.logout();
  assert (select active_theme_group_id from public.profiles where id = e) is null, 'thème actif remis à NULL en partant';
  assert tests.cnt(format('select 1 from public.group_members where group_id = %L and user_id = %L', gd, e)) = 0, 'e n''est plus membre';
  -- nouvelle invitation, acceptée : e revient ; la ligne de carnet réapparaît
  perform tests.login(d, 'authenticated');
  inv1 := public.invite_to_group(gd, e);
  perform tests.logout();
  perform tests.login(e, 'authenticated');
  assert public.respond_group_invitation(inv1, true) = 'accepted', 'e revient';
  assert (select count(*) from public.list_cookbook() where id = rd2) = 1, 'la ligne de carnet redevient visible';
  perform public.remove_from_cookbook(rd2);
  perform tests.logout();

  -- remove_group_member : créateur seulement
  perform tests.login(f, 'authenticated');
  assert tests.try(format('select public.remove_group_member(%L, %L)', gd, e)) = 'P0002', 'étranger : groupe introuvable';
  perform tests.logout();
  perform tests.login(d, 'authenticated');
  assert tests.try(format('select public.remove_group_member(%L, %L)', gd, d)) = '22023', 'le créateur ne se retire pas';
  assert public.remove_group_member(gd, f) = false, 'non-membre : false';
  assert public.remove_group_member(gd, g) = true and public.remove_group_member(gd, g) = false, 'le créateur retire g (idempotent)';
  perform tests.logout();
  assert tests.cnt(format('select 1 from public.group_members where group_id = %L and user_id = %L', gd, g)) = 0, 'g n''est plus membre';
  select payload into j from public.notifications where user_id = g and type = 'group_member_removed';
  assert j ->> 'group_id' = gd::text and j ->> 'group_name' = 'Voisins du 12', 'g est prévenu';
  perform tests.login(g, 'authenticated');
  assert (select count(*) from public.recipes where id = rd2) = 0, 'g a perdu l''accès';
  perform tests.logout();

  -- transfer_group_ownership : atomique, créateur seulement, nouveau créateur déjà membre
  perform tests.login(d, 'authenticated');
  assert tests.try(format('select public.transfer_group_ownership(%L, %L)', gd, d)) = '22023', 'vers soi-même refusé';
  assert tests.try(format('select public.transfer_group_ownership(%L, %L)', gd, f)) = '22023', 'vers un non-membre refusé (f est seulement invitée)';
  assert tests.try(format('select public.transfer_group_ownership(%L, null)', gd)) = '22023', 'cible manquante';
  perform tests.logout();
  assert (select created_by from public.groups where id = gd) = d
     and (select count(*) from public.group_members where group_id = gd and role = 'creator') = 1
     and (select role from public.group_members where group_id = gd and user_id = d) = 'creator', 'un transfert refusé ne change rien';
  perform tests.login(f, 'authenticated');
  assert tests.try(format('select public.transfer_group_ownership(%L, %L)', gd, e)) = 'P0002', 'étranger : introuvable';
  perform tests.logout();
  perform tests.login(d, 'authenticated');
  perform public.transfer_group_ownership(gd, e);
  perform tests.logout();
  assert (select created_by from public.groups where id = gd) = e, 'created_by = e';
  assert (select role from public.group_members where group_id = gd and user_id = e) = 'creator'
     and (select role from public.group_members where group_id = gd and user_id = d) = 'member'
     and (select count(*) from public.group_members where group_id = gd and role = 'creator') = 1, 'les deux rôles ont changé, un seul creator';
  assert (select status from public.invitations where id = inv2) = 'cancelled', 'les invitations en attente de l''ancien créateur sont annulées';
  assert tests.cnt(format('select 1 from public.notifications where user_id = %L and type = ''group_invitation'' and payload ->> ''invitation_id'' = %L and read_at is null', f, inv2)) = 0,
    'et leur notification disparaît';
  select payload into j from public.notifications where user_id = e and type = 'group_ownership_transferred';
  assert j ->> 'group_id' = gd::text and j ->> 'from_name' = 'Dave Étranger' and j::text not like '%@%', 'e est prévenu du transfert';
  perform tests.login(f, 'authenticated');
  assert tests.try(format('select public.respond_group_invitation(%L, true)', inv2)) = '22023', 'f ne peut plus accepter l''invitation de l''ancien créateur';
  perform tests.logout();
  perform tests.login(d, 'authenticated');
  assert tests.try(format('select public.rename_group(%L, ''Encore moi'')', gd)) = '42501', 'l''ancien créateur est un simple membre';
  assert tests.try(format('select public.invite_to_group(%L, %L)', gd, f)) = '42501', 'et ne peut plus inviter';
  perform tests.logout();
  perform tests.login(e, 'authenticated');
  perform public.rename_group(gd, 'Voisins (Eve)');
  perform public.invite_to_group(gd, f);                      -- le nouveau créateur ré-invite
  assert tests.try(format('select public.leave_group(%L)', gd)) = '22023', 'e, créatrice, ne peut pas quitter';
  perform tests.logout();
  perform tests.login(d, 'authenticated');
  perform public.leave_group(gd);                             -- l'ancien créateur, devenu membre, peut partir
  perform tests.logout();
  assert tests.cnt(format('select 1 from public.group_members where group_id = %L', gd)) = 1, 'il ne reste qu''e';

  -- delete_group : cascade, notifications, droits de groupe
  perform tests.login(f, 'authenticated');
  g3 := public.create_group('Groupe éphémère');
  inv1 := public.invite_to_group(g3, e);
  inv2 := public.invite_to_group(g3, d);                      -- d n'acceptera pas
  perform tests.logout();
  perform tests.login(e, 'authenticated');
  perform public.respond_group_invitation(inv1, true);
  perform public.update_my_profile(p_active_theme_group_id => g3);
  perform tests.logout();
  perform tests.login(f, 'authenticated');
  rpriv := public.save_recipe('{"title":"Secret de Fay","category":"plats","visibility":"private"}'::jsonb);
  perform public.grant_recipe(rpriv, null, g3, 'read');       -- droit donné au GROUPE
  perform tests.logout();
  perform tests.login(e, 'authenticated');
  assert (select count(*) from public.recipes where id = rpriv) = 1, 'e lit la recette privée par le droit du groupe';
  perform public.add_to_cookbook(rpriv);
  assert tests.try(format('select public.delete_group(%L)', g3)) = '42501', 'membre : suppression refusée';
  perform tests.logout();
  perform tests.login(d, 'authenticated');
  assert tests.cnt(format('select 1 from public.notifications where user_id = %L and type = ''group_invitation'' and read_at is null', d)) >= 1, 'd a une invitation non lue';
  assert tests.try(format('select public.delete_group(%L)', g3)) = 'P0002', 'invité non membre : introuvable';
  perform tests.logout();
  perform tests.login(f, 'authenticated');
  perform public.delete_group(g3);
  perform tests.logout();
  assert tests.cnt(format('select 1 from public.groups where id = %L', g3)) = 0, 'groupe supprimé';
  assert tests.cnt(format('select 1 from public.group_members where group_id = %L', g3)) = 0
     and tests.cnt(format('select 1 from public.invitations where group_id = %L', g3)) = 0
     and tests.cnt(format('select 1 from public.recipe_grants where grantee_group_id = %L', g3)) = 0, 'cascade : membres, invitations, droits de groupe';
  assert tests.cnt(format('select 1 from public.recipes where id = %L', rpriv)) = 1, 'la recette reste à son auteur';
  assert (select active_theme_group_id from public.profiles where id = e) is null, 'thème actif remis à NULL';
  assert tests.cnt(format('select 1 from public.notifications where user_id = %L and type = ''group_deleted'' and payload ->> ''group_id'' = %L', e, g3)) = 1
     and tests.cnt(format('select 1 from public.notifications where user_id = %L and type = ''group_deleted''', f)) = 0, 'les membres sont prévenus, pas le créateur';
  assert tests.cnt(format('select 1 from public.notifications where user_id = %L and type = ''group_invitation'' and payload ->> ''group_id'' = %L', d, g3)) = 0,
    'la notification d''invitation sans objet disparaît';
  assert tests.cnt(format('select 1 from public.cookbook_entries where user_id = %L and recipe_id = %L', e, rpriv)) = 1, 'la ligne de carnet reste en base…';
  perform tests.login(e, 'authenticated');
  assert (select count(*) from public.recipes where id = rpriv) = 0 and (select count(*) from public.list_cookbook() where id = rpriv) = 0,
    '…mais e ne lit plus la recette et elle sort de son carnet affiché';
  perform tests.logout();

  -- ============================================================ recipe_deleted : détenteurs de carnet, copie, droit retiré
  perform tests.login(a, 'authenticated');
  ra := public.save_recipe('{"title":"Cake de Nina","category":"desserts et gâteaux","visibility":"groups"}'::jsonb);
  perform tests.logout();
  perform tests.login(b, 'authenticated');
  perform public.add_to_cookbook(ra);
  perform tests.logout();
  perform tests.login(c, 'authenticated');
  perform public.add_to_cookbook(ra);
  ra_copy := public.copy_recipe(ra);
  perform tests.logout();
  perform tests.login(a, 'authenticated');
  assert (select cookbook_count from public.recipe_usage(ra)) = 2 and (select copy_count from public.recipe_usage(ra)) = 1, 'recipe_usage avant suppression';
  perform public.delete_recipe(ra);
  perform tests.logout();
  assert tests.cnt(format('select 1 from public.notifications where type = ''recipe_deleted'' and user_id in (%L, %L)', b, c)) = 2
     and tests.cnt(format('select 1 from public.notifications where type = ''recipe_deleted'' and user_id = %L', a)) = 0, 'b et c sont prévenus, pas l''auteure';
  select payload into j from public.notifications where user_id = b and type = 'recipe_deleted';
  assert j ->> 'recipe_id' = ra::text and j ->> 'title' = 'Cake de Nina' and j ->> 'author_id' = a::text and j ->> 'author_name' = 'Nina Test'
     and j::text not like '%@%', 'payload : ids, titre, pseudonyme de l''auteure';
  assert tests.cnt(format('select 1 from public.recipes where id = %L and owner_id = %L and copied_from is null', ra_copy, c)) = 1, 'la copie de c reste à c (copied_from remis à NULL)';
  -- un détenteur qui n'a plus le droit de lire n'est pas prévenu (le titre ne fuit pas)
  perform tests.login(d, 'authenticated');
  rd := public.save_recipe(rp_json || '{"visibility":"private"}'::jsonb);
  grant1 := public.grant_recipe(rd, f, null, 'read');
  perform tests.logout();
  perform tests.login(f, 'authenticated');
  perform public.add_to_cookbook(rd);
  perform tests.logout();
  perform tests.login(d, 'authenticated');
  assert (select cookbook_count from public.recipe_usage(rd)) = 1, 'usage : 1 carnet';
  perform public.revoke_recipe_grant(grant1);
  perform public.delete_recipe(rd);
  perform tests.logout();
  assert tests.cnt(format('select 1 from public.notifications where type = ''recipe_deleted'' and user_id = %L', f)) = 0, 'droit retiré : pas de notification';
  perform tests.login(d, 'authenticated');
  rd := public.save_recipe(rp_json || '{"visibility":"private"}'::jsonb);
  perform public.grant_recipe(rd, f, null, 'read');
  perform tests.logout();
  perform tests.login(f, 'authenticated');
  perform public.add_to_cookbook(rd);
  perform tests.logout();
  perform tests.login(d, 'authenticated');
  perform public.delete_recipe(rd);
  perform tests.logout();
  assert tests.cnt(format('select 1 from public.notifications where type = ''recipe_deleted'' and user_id = %L and payload ->> ''title'' = ''Tarte de Dave''', f)) = 1,
    'droit encore valable : f est prévenue';
  -- level_of reprend recipe_level (même résultat pour une personne donnée)
  perform tests.login(a, 'authenticated');
  rd := public.save_recipe(rp_json || '{"visibility":"groups"}'::jsonb);
  perform public.grant_recipe(rd, null, gb, 'edit_original');
  perform tests.logout();
  for u in select unnest(array[a, b, c, d, e, f, g]) loop
    perform tests.login(u, 'authenticated');
    for k in select unnest(array[r1, rd, rd2, rpriv]) as rid loop
      select private.recipe_level(k.rid) into n;
      perform tests.logout();
      assert private.level_of(u, k.rid) = n, format('level_of = recipe_level pour %s sur %s', u, k.rid);
      perform tests.login(u, 'authenticated');
    end loop;
    perform tests.logout();
  end loop;
  perform tests.login(a, 'authenticated');
  perform public.delete_recipe(rd);
  perform tests.logout();

  -- ============================================================ NOTIFICATIONS : liste, pagination, lecture
  delete from public.notifications where user_id = e;
  insert into public.notifications (user_id, type, payload, created_at) values
    (e, 'friend_request', '{"n":1}', now() - interval '5 hours'), (e, 'friend_request', '{"n":2}', now() - interval '4 hours'),
    (e, 'recipe_shared', '{"n":3}', now() - interval '3 hours'), (e, 'recipe_shared', '{"n":4}', now() - interval '2 hours'),
    (e, 'group_deleted', '{"n":5}', now() - interval '1 hour'), (d, 'friend_request', '{"secret":"d"}', now() - interval '1 hour');
  perform tests.login(e, 'authenticated');
  assert (select count(*) from public.list_notifications()) = 5, 'e voit ses 5 notifications (pas celle de d)';
  assert (select (payload ->> 'n')::int from public.list_notifications() limit 1) = 5, 'les plus récentes d''abord';
  assert (select count(*) from public.list_notifications(2)) = 2, 'limite';
  assert (select count(*) from public.list_notifications(0)) = 1 and (select count(*) from public.list_notifications(-5)) = 1 and (select count(*) from public.list_notifications(100000)) = 5,
    'limite bornée à 1..100';
  select created_at into ts from public.list_notifications(2) offset 1 limit 1;
  assert (select array_agg((payload ->> 'n')::int order by created_at desc) from public.list_notifications(10, ts)) = array[3, 2, 1], 'pagination par p_before';
  assert public.unread_notifications_count() = 5, '5 non lues';
  select array_agg(id) into ids from (select id from public.list_notifications(2)) s;
  assert public.mark_notifications_read(ids) = 2, 'deux notifications marquées lues';
  assert public.unread_notifications_count() = 3, 'il en reste 3 non lues';
  assert public.mark_notifications_read(ids) = 0, 'déjà lues : 0';
  assert public.mark_notifications_read(array[gen_random_uuid()]) = 0 and public.mark_notifications_read(array[]::uuid[]) = 0, 'ids inconnus ou vides : 0';
  perform tests.logout();
  select array_agg(id) into ids from public.notifications where user_id = d;
  perform tests.login(e, 'authenticated');
  assert public.mark_notifications_read(ids) = 0, 'on ne marque pas les notifications d''autrui';
  perform tests.logout();
  assert tests.cnt(format('select 1 from public.notifications where user_id = %L and read_at is null', d)) >= 1, 'celles de d sont toujours non lues';
  perform tests.login(e, 'authenticated');
  assert public.mark_notifications_read() = 3, 'tout marquer lu';
  assert public.unread_notifications_count() = 0 and public.mark_notifications_read(null) = 0, 'plus rien de non lu';
  perform tests.logout();

  -- ============================================================ get_user_profile
  perform tests.login(d, 'authenticated');
  select * into k from public.get_user_profile(e);
  assert k.user_id = e and k.display_name = 'Eve Amie' and k.friendship_status = 'request_received' and k.friendship_id is not null and not k.is_self, 'd voit e : demande reçue';
  select * into k from public.get_user_profile(f);
  assert k.friendship_status = 'friends' and k.common_groups = '[]'::jsonb and k.readable_recipe_count = 0, 'd voit f : amie, aucun groupe commun';
  assert (select count(*) from public.get_user_profile(g)) = 0 and (select count(*) from public.get_user_profile(gen_random_uuid())) = 0 and (select count(*) from public.get_user_profile(null)) = 0,
    'inconnu / sans lien : aucune ligne';
  select * into k from public.get_user_profile(d);
  assert k.is_self and k.friendship_status = 'none' and k.friendship_id is null and k.common_groups = '[]'::jsonb, 'soi-même';
  perform tests.logout();
  perform tests.login(e, 'authenticated');
  assert (select friendship_status from public.get_user_profile(d)) = 'request_sent', 'e voit d : demande envoyée';
  perform tests.logout();
  perform tests.login(b, 'authenticated');
  select * into k from public.get_user_profile(c);
  assert k.display_name = 'Cleo Test' and k.cookbook_title = 'Le carnet de Cleo' and k.friendship_status = 'none'
     and jsonb_array_length(k.common_groups) = 1 and k.common_groups -> 0 ->> 'name' = 'Les Boultons' and k.common_groups -> 0 ->> 'id' = gb::text, 'b voit c : groupe commun';
  select * into k from public.get_user_profile(a);
  assert k.readable_recipe_count = (select count(*) from public.recipes where owner_id = a) and k.readable_recipe_count >= 7, 'nombre de recettes de a lisibles par b';
  assert to_jsonb(k)::text not like '%@%' and to_jsonb(k)::text not like '%test.local%', 'aucun e-mail dans le profil public';
  perform tests.logout();
  perform tests.login(g, 'authenticated');
  assert (select count(*) from public.get_user_profile(a)) = 0, 'refus d''ami + aucun groupe : a reste invisible pour g';
  perform tests.logout();
  perform tests.login(d, 'anon');
  assert tests.try(format('select public.get_user_profile(%L)', e)) = '42501', 'anon : get_user_profile refusée';
  perform tests.logout();

  -- ============================================================ export_my_data
  perform tests.login(e, 'authenticated');
  re := public.save_recipe('{"title":"Quiche d''Eve","category":"plats","visibility":"private","servings":4,"lang":"fr","sections":[{"name":"Appareil","type":"ingredients","ingredients":[{"name":"oeufs","amount":"3","unit":"unit"}]},{"name":"Cuisson","type":"instructions","instructions":["Cuire 30 min."]}]}'::jsonb);
  tok := (public.create_share_link(re))::text;
  perform tests.logout();
  insert into public.favorites (user_id, recipe_id) values (e, re);
  insert into public.planning (user_id, date_string, meal_type, recipe_id, custom_title) values (e, '2026-11-02', 'dinner', re, null), (e, '2026-11-03', 'lunch', null, 'Restes');
  insert into public.planning_notes (user_id, date_string, note_type, content) values (e, '2026-11-02', 'day', 'Penser au pain');
  insert into public.shopping_lists (user_id, name) values (e, 'Courses d''Eve') returning id into v_uuid;
  insert into public.shopping_items (list_id, name, amount, unit) values (v_uuid, 'lait', '1', 'l');
  insert into public.ai_usage (user_id, provider, model, status) values (e, 'mock', 'mock', 'ok');
  insert into public.categories (owner_id, slug, name_fr) values (e, 'tartes_eve', 'Tartes d''Eve');
  insert into public.cookbook_entries (user_id, recipe_id) select e, id from public.recipes where owner_id = a limit 1;
  insert into public.reports (recipe_id, reporter_id, reason, details) values (r1, e, 'spam', 'test');
  perform tests.login(e, 'authenticated');
  j := public.export_my_data();
  perform tests.logout();
  assert j -> 'profile' ->> 'email' = 'eve-23@test.local' and j -> 'profile' ->> 'display_name' = 'Eve Amie' and not (j -> 'profile' ? 'role'), 'profil de e (son e-mail est le sien, pas de rôle)';
  assert jsonb_array_length(j -> 'recipes') = 1 and j -> 'recipes' -> 0 ->> 'title' = 'Quiche d''Eve' and j -> 'recipes' -> 0 ->> 'public_link_token' = tok
     and jsonb_array_length(j -> 'recipes' -> 0 -> 'sections') = 2 and not (j -> 'recipes' -> 0 ? 'search'), 'recettes complètes (sections, lien public)';
  assert j -> 'recipes' -> 0 -> 'sections' -> 0 -> 'ingredients' -> 0 ->> 'name' = 'oeufs'
     and j -> 'recipes' -> 0 -> 'sections' -> 1 -> 'instructions' -> 0 ->> 'content' = 'Cuire 30 min.', 'ingrédients et étapes imbriqués';
  assert jsonb_array_length(j -> 'favorites') = 1 and jsonb_array_length(j -> 'planning') = 2 and jsonb_array_length(j -> 'planning_notes') = 1
     and jsonb_array_length(j -> 'shopping_lists') = 1 and j -> 'shopping_lists' -> 0 -> 'items' -> 0 ->> 'name' = 'lait'
     and jsonb_array_length(j -> 'ai_usage') = 1 and jsonb_array_length(j -> 'categories') = 1 and jsonb_array_length(j -> 'reports_filed') = 1
     and jsonb_array_length(j -> 'cookbook_entries') = 2,
    format('favoris, planning, courses, usage IA, catégories, signalements, carnet : %s', (select jsonb_object_agg(key, jsonb_array_length(value)) from jsonb_each(j) where jsonb_typeof(value) = 'array')::text);
  assert jsonb_array_length(j -> 'groups') = 1 and j -> 'groups' -> 0 ->> 'name' = 'Voisins (Eve)' and j -> 'groups' -> 0 -> 'members' = '["Eve Amie"]'::jsonb, 'groupes : membres = pseudonymes';
  assert j::text like '%Dave Étranger%', 'les autres figurent par leur pseudonyme';
  -- aucune donnée d'autrui : ni identifiant de personne, ni e-mail
  foreach u in array array[a, b, c, d, f, g, z] loop
    assert position(u::text in j::text) = 0, format('export : identifiant d''une autre personne (%s)', u);
  end loop;
  assert j::text not like '%dave-23@%' and j::text not like '%fay-23@%' and j::text not like '%gus-23@%' and j::text not like '%admin@%'
     and j::text not like '%user-b@%' and j::text not like '%user-c@%' and j::text not like '%token_hash%', 'export : aucun e-mail d''autrui, aucun hash';
  assert (select count(*) from jsonb_array_elements(j -> 'notifications') nt where nt -> 'payload' ? 'from_user_id' or nt -> 'payload' ? 'user_id') = 0, 'payloads sans identifiants de personnes';
  -- limite : 3 par jour
  perform tests.login(e, 'authenticated');
  perform public.export_my_data();
  perform public.export_my_data();
  t := tests.try_msg('select public.export_my_data()');
  assert t like '54000|Limite atteinte%', '4e export du jour refusé : ' || t;
  perform tests.logout();
  perform tests.login(d, 'authenticated');
  assert tests.try('select public.export_my_data()') = 'ok', 'la limite est par personne';
  perform tests.logout();
  update private.rate_events set created_at = now() - interval '25 hours' where user_id = e;
  perform tests.login(e, 'authenticated');
  assert tests.try('select public.export_my_data()') = 'ok', 'la fenêtre est glissante (24 h)';
  perform tests.logout();

  -- ============================================================ COMPTE : blocages et suppression
  insert into auth.users (id, email, raw_user_meta_data) values (xid, 'xavier-23@test.local', '{}');
  update public.profiles set display_name = 'Xavier Compte' where id = xid;
  perform tests.login(e, 'authenticated');
  assert (select count(*) from public.account_deletion_blockers()) = 0, 'e crée un groupe avec seulement une invitation en attente : pas bloquée';
  perform tests.logout();
  perform tests.login(xid, 'authenticated');
  gx := public.create_group('Groupe de Xavier');
  gx2 := public.create_group('Groupe solo de Xavier');
  inv1 := public.invite_to_group(gx, e);
  rx := public.save_recipe('{"title":"Plat de Xavier","category":"plats","visibility":"groups"}'::jsonb);
  assert (select count(*) from public.account_deletion_blockers()) = 0, 'invitation en attente seulement : aucun blocage';
  perform tests.logout();
  perform tests.login(e, 'authenticated');
  perform public.respond_group_invitation(inv1, true);
  perform public.add_to_cookbook(rx);
  assert (select count(*) from public.account_deletion_blockers()) = 0, 'e est membre, pas créatrice : aucun blocage';
  perform tests.logout();
  perform tests.login(xid, 'authenticated');
  select * into k from public.account_deletion_blockers();
  assert k.group_id = gx and k.group_name = 'Groupe de Xavier' and k.other_member_count = 1 and (select count(*) from public.account_deletion_blockers()) = 1,
    'blocage : le groupe avec un autre membre (pas le groupe solo)';
  perform tests.logout();
  perform tests.login(xid, 'service_role');
  assert tests.try_msg(format('select public.prepare_account_deletion(%L)', xid)) like '55000|%Transférez%', 'prepare : refusée tant qu''un groupe a des membres';
  assert tests.try('select public.prepare_account_deletion(null)') = '22023', 'prepare : utilisateur manquant';
  perform tests.logout();
  assert tests.try(format('delete from auth.users where id = %L', xid)) = '23503', 'sans préparation, le restrict de created_by bloque la suppression du compte';
  assert tests.cnt(format('select 1 from public.groups where id = %L', gx2)) = 1, 'le refus n''a rien supprimé';
  perform tests.login(xid, 'authenticated');
  perform public.transfer_group_ownership(gx, e);
  assert (select count(*) from public.account_deletion_blockers()) = 0, 'après le transfert : plus de blocage';
  perform tests.logout();
  perform tests.login(e, 'authenticated');
  assert (select group_id from public.account_deletion_blockers()) = gx, 'e hérite du blocage (xavier est membre)';
  perform tests.logout();
  perform tests.login(xid, 'service_role');
  assert public.prepare_account_deletion(xid) = 1, 'prepare : supprime le groupe où il est seul';
  assert public.prepare_account_deletion(xid) = 0, 'prepare : idempotente';
  perform tests.logout();
  assert tests.cnt(format('select 1 from public.groups where id = %L', gx2)) = 0 and tests.cnt(format('select 1 from public.groups where id = %L', gx)) = 1, 'seul le groupe solo a été supprimé';
  delete from auth.users where id = xid;                       -- ce que fait auth.admin.deleteUser (cascade)
  assert tests.cnt(format('select 1 from public.profiles where id = %L', xid)) = 0 and tests.cnt(format('select 1 from public.recipes where id = %L', rx)) = 0, 'compte et recettes supprimés';
  assert (select created_by from public.groups where id = gx) = e and tests.cnt(format('select 1 from public.group_members where group_id = %L', gx)) = 1, 'le groupe transféré survit';
  assert tests.cnt(format('select 1 from public.cookbook_entries where user_id = %L and recipe_id = %L', e, rx)) = 0, 'la référence disparaît du carnet d''e';
  select payload into j from public.notifications where user_id = e and type = 'recipe_deleted' and payload ->> 'recipe_id' = rx::text;
  assert j ->> 'title' = 'Plat de Xavier' and j::text not like '%@%', 'e est prévenue de la suppression en cascade (sans échec de clé étrangère)';

  -- ============================================================ PROFIL : update_my_profile
  perform tests.login(d, 'authenticated');
  select * into k from public.update_my_profile(p_display_name => '  Dave  ');
  assert k.display_name = 'Dave' and k.discoverable and k.cookbook_title is null and k.theme_settings is null and k.active_theme_group_id is null, 'pseudonyme nettoyé, reste inchangé';
  assert tests.try(format($q$select public.update_my_profile(p_display_name => %L)$q$, 'dave@mail.fr')) = '22023', 'pseudonyme avec @ refusé';
  assert tests.try(format($q$select public.update_my_profile(p_display_name => %L)$q$, E'Da\tve')) = '22023', 'caractère de contrôle refusé';
  assert tests.try(format($q$select public.update_my_profile(p_display_name => %L)$q$, 'ÈVE amié')) = '22023', 'doublon (casse et accents) refusé';
  assert tests.try(format($q$select public.update_my_profile(p_display_name => %L)$q$, '   ')) = '22023', 'pseudonyme vide refusé';
  assert tests.try(format($q$select public.update_my_profile(p_display_name => %L)$q$, repeat('x', 61))) = '22023', 'pseudonyme trop long refusé';
  assert tests.try(format($q$select public.update_my_profile(p_display_name => %L)$q$, 'DAVE')) = 'ok', 'changer la casse de son propre pseudonyme';
  select * into k from public.update_my_profile(p_cookbook_title => 'Mon carnet');
  assert k.cookbook_title = 'Mon carnet' and k.display_name = 'DAVE', 'titre du carnet';
  select * into k from public.update_my_profile(p_discoverable => false);
  assert k.cookbook_title = 'Mon carnet' and not k.discoverable, 'changement partiel : le titre est gardé';
  select * into k from public.update_my_profile(p_cookbook_title => '');
  assert k.cookbook_title is null, 'titre vide = effacer';
  assert tests.try(format($q$select public.update_my_profile(p_cookbook_title => %L)$q$, repeat('y', 81))) = '22023', 'titre trop long refusé';
  assert (select count(*) from public.list_friends()) >= 1, 'sanity';
  perform tests.logout();
  perform tests.login(e, 'authenticated');
  assert (select count(*) from public.search_users('dave')) = 0, 'discoverable = false : introuvable par la recherche';
  perform tests.logout();
  perform tests.login(d, 'authenticated');
  perform public.update_my_profile(p_discoverable => true);
  select * into k from public.update_my_profile(p_theme_settings => '{"preset":"ocean","accent":"#336699"}'::jsonb);
  assert k.theme_settings ->> 'preset' = 'ocean', 'thème personnel enregistré';
  assert tests.try(format($q$select public.update_my_profile(p_theme_settings => %L::jsonb)$q$, '[1]')) = '22023', 'thème non objet refusé';
  assert tests.try(format($q$select public.update_my_profile(p_theme_settings => jsonb_build_object('x', repeat('y', 4100)))$q$)) = '22023', 'thème trop gros refusé';
  select * into k from public.update_my_profile(p_theme_settings => '{}'::jsonb);
  assert k.theme_settings is null, 'thème {} = effacer';
  assert tests.try(format($q$select public.update_my_profile(p_active_theme_group_id => %L)$q$, gb)) = '42501', 'thème actif : groupe dont on n''est pas membre refusé';
  perform tests.logout();
  perform tests.login(b, 'authenticated');
  select * into k from public.update_my_profile(p_active_theme_group_id => gb);
  assert k.active_theme_group_id = gb, 'thème actif = groupe Boultons';
  select * into k from public.update_my_profile(p_display_name => 'Bob Test 2');
  assert k.active_theme_group_id = gb, 'le thème actif est gardé (paramètre NULL = inchangé)';
  assert tests.try(format($q$select public.update_my_profile(p_active_theme_group_id => %L, p_personal_theme => true)$q$, gb)) = '22023', 'groupe ET thème personnel refusé';
  select * into k from public.update_my_profile(p_personal_theme => true);
  assert k.active_theme_group_id is null, 'retour au thème personnel';
  -- l'update direct reste possible mais les règles du pseudonyme s'appliquent aussi (déclencheur)
  assert tests.try($q$update public.profiles set display_name = 'bob@exemple.fr' where id = '00000000-0000-0000-0000-00000000000b'$q$) = '22023', 'update direct avec @ refusé';
  assert tests.try($q$update public.profiles set display_name = 'eve AMIE' where id = '00000000-0000-0000-0000-00000000000b'$q$) = '22023', 'update direct en doublon refusé';
  update public.profiles set display_name = 'Pirate' where id = e;
  get diagnostics n = row_count;
  assert n = 0, 'le profil d''un autre n''est pas modifiable';
  perform tests.logout();
  perform tests.login(d, 'anon');
  assert tests.try('select * from public.update_my_profile(p_discoverable => false)') = '42501', 'anon : update_my_profile refusée';
  perform tests.logout();

  -- ============================================================ LIMITES DE DÉBIT (§7.7)
  for i in 1..21 loop
    insert into auth.users (id, email, raw_user_meta_data)
    values (('00000000-0000-0000-0001-' || lpad(to_hex(i), 12, '0'))::uuid, format('lim%s-23@test.local', i), '{}');
  end loop;
  -- 20 demandes d'ami, la 21e est refusée ; annuler ne remet pas à zéro
  perform tests.login(z, 'authenticated');
  for i in 1..20 loop
    perform public.send_friend_request(('00000000-0000-0000-0001-' || lpad(to_hex(i), 12, '0'))::uuid);
  end loop;
  t := tests.try_msg(format('select public.send_friend_request(%L)', '00000000-0000-0000-0001-' || lpad(to_hex(21), 12, '0')));
  assert t like '54000|Limite atteinte : 20 demandes d''ami par jour%', '21e demande refusée, message clair : ' || t;
  select id into v_uuid from public.friendships where requester_id = z and addressee_id = '00000000-0000-0000-0001-000000000001'::uuid;
  assert public.cancel_friend_request(v_uuid) = true, 'annulation';
  assert tests.try(format('select public.send_friend_request(%L)', '00000000-0000-0000-0001-' || lpad(to_hex(21), 12, '0'))) = '54000', 'annuler ne remet pas le compteur à zéro';
  assert tests.try(format($q$insert into public.friendships (requester_id, addressee_id) values (%L, %L)$q$, z, '00000000-0000-0000-0001-' || lpad(to_hex(21), 12, '0'))) = '54000',
    'l''écriture directe par l''API est limitée aussi (déclencheur)';
  perform tests.logout();
  assert tests.cnt(format('select 1 from private.rate_events where user_id = %L and kind = ''friend_request''', z)) = 20, 'journal : 20 demandes';
  update private.rate_events set created_at = now() - interval '25 hours' where user_id = z;
  perform tests.login(z, 'authenticated');
  assert tests.try(format('select public.send_friend_request(%L)', '00000000-0000-0000-0001-' || lpad(to_hex(21), 12, '0'))) = 'ok', 'après 24 h le compteur repart';
  -- 20 invitations de groupe (personne ou lien), la 21e est refusée ; créer puis supprimer des groupes ne triche pas
  gx := public.create_group('Groupe des limites');
  for i in 1..19 loop
    perform public.invite_to_group(gx, ('00000000-0000-0000-0001-' || lpad(to_hex(i), 12, '0'))::uuid);
  end loop;
  perform public.create_invite_link(gx);                       -- la 20e (un lien compte aussi)
  t := tests.try_msg(format('select public.invite_to_group(%L, %L)', gx, '00000000-0000-0000-0001-' || lpad(to_hex(20), 12, '0')));
  assert t like '54000|Limite atteinte : 20 invitations par jour%', '21e invitation refusée : ' || t;
  assert tests.try(format('select public.create_invite_link(%L)', gx)) = '54000', 'lien refusé aussi';
  assert tests.try(format($q$insert into public.invitations (kind, inviter_id, target_user_id, group_id) values ('group', %L, %L, %L)$q$,
                          z, '00000000-0000-0000-0001-000000000014'::uuid, gx)) = '54000', 'invitation directe par l''API limitée aussi';
  perform public.delete_group(gx);
  gx := public.create_group('Autre groupe');
  assert tests.try(format('select public.invite_to_group(%L, %L)', gx, '00000000-0000-0000-0001-000000000014')) = '54000', 'supprimer le groupe ne remet pas le compteur à zéro';
  perform tests.logout();
  perform tests.login(g, 'authenticated');
  assert tests.try(format('select public.invite_to_group(%L, %L)', gx, d)) = 'P0002', 'les limites sont par personne (g n''est pas dans ce groupe)';
  perform tests.logout();
  -- signalements : 10 par jour
  perform tests.login(z, 'authenticated');
  for i in 1..10 loop
    insert into public.reports (recipe_id, reporter_id, reason) values (r1, z, 'spam');
  end loop;
  t := tests.try_msg(format($q$insert into public.reports (recipe_id, reporter_id, reason) values (%L, %L, 'spam')$q$, r1, z));
  assert t like '54000|Limite atteinte : 10 signalements par jour%', '11e signalement refusé : ' || t;
  perform tests.logout();
  perform tests.login(g, 'authenticated');
  assert tests.try(format($q$insert into public.reports (recipe_id, reporter_id, reason) values (%L, %L, 'spam')$q$, r1, g)) = 'ok', 'les signalements d''une autre personne ne comptent pas';
  perform tests.logout();
  update public.reports set created_at = now() - interval '2 days' where reporter_id = z;
  perform tests.login(z, 'authenticated');
  assert tests.try(format($q$insert into public.reports (recipe_id, reporter_id, reason) values (%L, %L, 'other')$q$, r1, z)) = 'ok', 'signalements : fenêtre glissante';
  perform tests.logout();

  -- ============================================================ aucune notification ne contient d'e-mail
  assert tests.cnt('select 1 from public.notifications where payload::text like ''%@%'' or payload::text like ''%test.local%''') = 0, 'AUCUN payload ne contient d''e-mail';
  assert tests.cnt('select 1 from public.notifications where type not in (''friend_request'', ''friend_accepted'', ''group_invitation'', ''group_invitation_accepted'', ''recipe_shared'', ''recipe_deleted'', ''group_member_removed'', ''group_deleted'', ''group_ownership_transferred'', ''friend_request'')
                    and payload ->> ''n'' is null') = 0, 'types de notification connus';

  raise notice '[test 0023] amis, groupes, invitations, liens, notifications, profil, export, suppression de compte, limites de débit : OK';
end $$;

rollback;
