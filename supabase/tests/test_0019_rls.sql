-- Tests 0019 : fonctions d'aide RLS, politiques des tables sociales, bannières fermées, support,
-- données personnelles, non-régression v1.
-- Données : seed_test.sql, après 0013 → 0019. Transaction annulée à la fin.
--
-- Personnes (créées ici) :
--   A  auteur, crée le groupe G1          B  membre de G1 (invité par A)
--   C  ami de A (et de B), hors groupe     D  étranger (aucun lien)
--   E  membre de G1, discoverable = false  S  support (compte admin du seed, …0a)
-- Les politiques de recipes & co ne sont PAS encore remplacées ici (v1 : tout le monde lit) : les
-- droits sur les recettes se vérifient par les fonctions private.can_*_recipe, appelées comme chaque
-- personne ; leur effet sur les tables est testé par switchover_0020_rls.sql (bascule v2/0020).
begin;

-- Aides de test (annulées avec la transaction)
create or replace function tests.rows_affected(q text) returns bigint language plpgsql as $$
declare n bigint;
begin
  execute q; get diagnostics n = row_count; return n;
exception when insufficient_privilege then return -1;   -- refusé (RLS ou droit)
          when others then return -2;                    -- refusé par une contrainte
end $$;
grant execute on function tests.rows_affected(text) to anon, authenticated, service_role;

create or replace function tests.visible(q text) returns bigint language plpgsql as $$
declare n bigint;
begin
  execute 'select count(*) from (' || q || ') s' into n; return n;
exception when insufficient_privilege then return -1;
end $$;
grant execute on function tests.visible(text) to anon, authenticated, service_role;

do $$
declare
  s  constant uuid := '00000000-0000-0000-0000-00000000000a';
  ua constant uuid := '00000000-0000-0000-0000-0000000000a1';
  ub constant uuid := '00000000-0000-0000-0000-0000000000b1';
  uc constant uuid := '00000000-0000-0000-0000-0000000000c1';
  ud constant uuid := '00000000-0000-0000-0000-0000000000d1';
  ue constant uuid := '00000000-0000-0000-0000-0000000000e1';
  g1 uuid; g2 uuid; inv uuid; inv_e uuid; inv_old uuid; fr_ac uuid; fr_bc uuid; fr_ae uuid;
  r_old constant uuid := '90000000-0000-0000-0000-000000000001';   -- groups, créée AVANT l'arrivée de B
  r_priv constant uuid := '90000000-0000-0000-0000-000000000002';  -- private
  r_grp constant uuid := '90000000-0000-0000-0000-000000000003';   -- private + droit explicite pour G1
  r_del constant uuid := '90000000-0000-0000-0000-000000000004';   -- groups, sera supprimée
  r_f constant uuid := '90000000-0000-0000-0000-000000000005';     -- private, droit pour l'amie C
  r_new constant uuid := '90000000-0000-0000-0000-000000000006';   -- groups, créée APRÈS l'arrivée de B
  gb uuid; gg uuid; gc uuid; gf uuid; gre uuid; cat_b uuid; cat_a uuid; n bigint; n2 bigint; j jsonb; r record;
begin
  -- ============================================================ préparation (superuser)
  insert into auth.users (id, email, raw_user_meta_data) values
    (ua, 'a-auteur@test.local', '{}'), (ub, 'b-membre@test.local', '{}'), (uc, 'c-amie@test.local', '{}'),
    (ud, 'd-etranger@test.local', '{}'), (ue, 'e-cachee@test.local', '{}');
  update public.profiles set display_name = 'Alice Auteur'    where id = ua;
  update public.profiles set display_name = 'Bob Membre'      where id = ub;
  update public.profiles set display_name = 'Carole Amie'     where id = uc;
  update public.profiles set display_name = 'Dave Étranger'   where id = ud;
  update public.profiles set display_name = 'Eve Cachée', discoverable = false where id = ue;
  insert into public.categories (owner_id, slug, name_fr) values (ua, 'desserts', 'Desserts') returning id into cat_a;

  -- helpers : fonctions sans effet sur le v1, verrouillées
  assert not has_function_privilege('anon', 'private.can_read_recipe(uuid)', 'execute'), 'anon exécute can_read_recipe';
  assert has_function_privilege('authenticated', 'private.can_read_recipe(uuid)', 'execute');
  assert not has_function_privilege('anon', 'public.search_users(text)', 'execute'), 'anon exécute search_users';
  assert not has_function_privilege('anon', 'public.add_author_recipes_to_cookbook(uuid)', 'execute');
  assert has_function_privilege('authenticated', 'public.add_author_recipes_to_cookbook(uuid)', 'execute');

  -- ============================================================ groupes : création et visibilité
  perform tests.login(ua, 'authenticated');
  insert into public.groups (name, created_by) values ('Les Auteurs', ua) returning id into g1;
  assert tests.rows_affected(format($q$insert into public.groups (name, created_by) values ('Faux', %L)$q$, ub)) < 0, 'created_by usurpé';
  assert tests.rows_affected(format($q$insert into public.group_members (group_id, user_id, role) values (%L, %L, 'creator')$q$, g1, ua)) = 1,
    'le créateur s''inscrit comme creator dans un groupe vide';
  assert tests.rows_affected(format($q$insert into public.group_members (group_id, user_id, role) values (%L, %L, 'creator')$q$, g1, ua)) < 0,
    'second creator / ligne en double';
  assert tests.rows_affected(format($q$insert into public.group_members (group_id, user_id, role) values (%L, %L, 'member')$q$, g1, ub)) < 0,
    'le créateur ne peut pas ajouter quelqu''un d''autre sans son accord';
  perform tests.logout();

  -- recettes (insérées en superuser : les politiques de recipes sont encore celles de la v1)
  insert into public.recipes (id, title, category, owner_id) values
    (r_old, 'Gâteau ancien', 'desserts', ua), (r_priv, 'Secret', 'plats', ua), (r_grp, 'Pour le groupe', 'plats', ua),
    (r_del, 'À supprimer', 'plats', ua), (r_f, 'Pour Carole', 'plats', ua);
  update public.recipes set visibility = 'private' where id in (r_priv, r_grp, r_f);

  -- avant son arrivée, B ne voit rien ; D non plus ; l'auteur a le niveau 4
  perform tests.login(ub, 'authenticated');
  assert not private.can_read_recipe(r_old), 'B lit avant d''être membre';
  assert tests.visible('select 1 from public.groups') = 0, 'B voit un groupe dont il n''est pas membre';
  perform tests.logout();
  perform tests.login(ua, 'authenticated');
  assert private.recipe_level(r_old) = 4 and private.can_edit_recipe(r_priv), 'niveau auteur';
  perform tests.logout();

  -- ============================================================ invitations
  perform tests.login(ua, 'authenticated');
  insert into public.invitations (kind, inviter_id, target_user_id, group_id) values ('group', ua, ub, g1) returning id into inv;
  insert into public.invitations (kind, inviter_id, target_user_id, group_id) values ('group', ua, ue, g1) returning id into inv_e;
  assert tests.rows_affected(format($q$insert into public.invitations (kind, inviter_id, target_user_id, group_id) values ('group', %L, %L, %L)$q$, ub, ud, g1)) < 0,
    'inviter_id usurpé';
  assert tests.rows_affected(format($q$insert into public.invitations (kind, inviter_id, target_user_id, target_email, group_id) values ('group', %L, %L, 'quelquun@x.fr', %L)$q$, ua, ud, g1)) < 0,
    'cible + e-mail d''un tiers';
  assert tests.rows_affected(format($q$insert into public.invitations (kind, inviter_id, target_user_id, group_id, status) values ('group', %L, %L, %L, 'accepted')$q$, ua, ud, g1)) < 0,
    'invitation créée déjà acceptée (colonne status non accordée)';
  insert into public.invitations (kind, inviter_id, target_email) values ('friend', ua, 'ami-externe@x.fr');
  assert tests.visible('select 1 from public.invitations') = 3, 'A voit ses invitations';
  assert tests.visible('select target_email from public.invitations where target_email is not null') = 1;
  assert tests.visible('select token_hash from public.invitations') = -1, 'token_hash lisible';
  perform tests.logout();

  perform tests.login(ub, 'authenticated');
  assert tests.visible('select 1 from public.invitations') = 1, 'B ne voit que SON invitation';
  assert tests.visible('select 1 from public.invitations where target_email is not null') = 0, 'e-mail d''une autre invitation visible';
  assert tests.rows_affected(format($q$insert into public.invitations (kind, inviter_id, target_user_id, group_id) values ('group', %L, %L, %L)$q$, ub, ud, g1)) < 0,
    'un non-créateur invite dans le groupe';
  -- accepter par simple UPDATE est refusé : accepter = rejoindre
  assert tests.rows_affected(format($q$update public.invitations set status = 'accepted', responded_at = now() where id = %L$q$, inv)) < 0,
    'B accepte par UPDATE';
  assert tests.rows_affected(format($q$update public.invitations set target_user_id = %L where id = %L$q$, ud, inv)) < 0, 'cible modifiable';
  assert tests.visible(format('select 1 from public.groups where id = %L', g1)) = 1, 'l''invité voit le groupe';
  assert tests.visible(format('select 1 from public.group_members where group_id = %L', g1)) = 0, 'l''invité voit les membres';
  perform tests.logout();

  perform tests.login(ud, 'authenticated');
  assert tests.visible('select 1 from public.invitations') = 0, 'D voit des invitations';
  assert tests.visible('select 1 from public.groups') = 0, 'D voit un groupe';
  assert tests.rows_affected(format($q$insert into public.group_members (group_id, user_id, role) values (%L, %L, 'member')$q$, g1, ud)) < 0,
    'D rejoint sans invitation';
  assert tests.rows_affected(format($q$update public.invitations set status = 'cancelled', responded_at = now() where id = %L$q$, inv)) = 0, 'D annule l''invitation d''un autre';
  perform tests.logout();

  -- B rejoint ; l'invitation passe à « accepted » ; rien n'est ajouté à son carnet
  perform tests.login(ub, 'authenticated');
  assert tests.rows_affected(format($q$insert into public.group_members (group_id, user_id, role) values (%L, %L, 'creator')$q$, g1, ub)) < 0, 'B se fait creator';
  assert tests.rows_affected(format($q$insert into public.group_members (group_id, user_id, role) values (%L, %L, 'member')$q$, g1, ub)) = 1, 'B rejoint';
  perform tests.logout();
  assert (select status from public.invitations where id = inv) = 'accepted', 'invitation non marquée acceptée';
  assert (select count(*) from public.cookbook_entries) = 0, 'REJOINDRE UN GROUPE NE DOIT RIEN AJOUTER AU CARNET';
  assert (select count(*) from public.dismissed_prompts) = 0;

  -- E : invitation expirée inutilisable, puis valide
  insert into public.invitations (kind, inviter_id, target_user_id, group_id, created_at, expires_at)
  values ('group', ua, uc, g1, now() - interval '2 days', now() - interval '1 day') returning id into inv_old;
  perform tests.login(uc, 'authenticated');
  assert tests.rows_affected(format($q$insert into public.group_members (group_id, user_id, role) values (%L, %L, 'member')$q$, g1, uc)) < 0, 'invitation expirée utilisée';
  perform tests.logout();
  perform tests.login(ue, 'authenticated');
  assert tests.rows_affected(format($q$insert into public.group_members (group_id, user_id, role) values (%L, %L, 'member')$q$, g1, ue)) = 1, 'E rejoint';
  perform tests.logout();

  -- ============================================================ recettes de groupe : droit implicite
  -- B voit la recette créée AVANT son arrivée, peut la copier, ne peut pas la modifier
  perform tests.login(ub, 'authenticated');
  assert private.can_read_recipe(r_old) and private.can_copy_recipe(r_old), 'B lit/copie la recette existante du groupe';
  assert not private.can_edit_recipe(r_old), 'B modifie sans edit_original';
  assert private.recipe_level(r_old) = 2, 'niveau implicite = copy';
  assert not private.can_read_recipe(r_priv), 'B lit une recette privée';
  perform tests.logout();
  perform tests.login(ud, 'authenticated');
  assert not private.can_read_recipe(r_old) and not private.can_read_recipe(r_priv) and not private.can_read_recipe(r_grp), 'D voit une recette de A';
  assert private.recipe_level(r_old) = 0;
  perform tests.logout();
  -- une recette créée APRÈS l'arrivée est aussi lisible ; la rendre privée la retire
  insert into public.recipes (id, title, category, owner_id) values (r_new, 'Nouvelle', 'plats', ua);
  perform tests.login(ub, 'authenticated');
  assert private.can_read_recipe(r_new), 'B lit la nouvelle recette';
  perform tests.logout();
  update public.recipes set visibility = 'private' where id = r_new;
  perform tests.login(ub, 'authenticated');
  assert not private.can_read_recipe(r_new), 'private retire l''accès implicite';
  perform tests.logout();
  update public.recipes set visibility = 'groups' where id = r_new;
  -- une recette sans propriétaire (v1 non remplie) n'ouvre aucun droit implicite
  perform tests.login(ub, 'authenticated');
  assert not private.can_read_recipe('10000000-0000-0000-0000-000000000001'), 'recette sans owner lisible via les fonctions';
  perform tests.logout();

  -- ============================================================ droits explicites (recipe_grants)
  perform tests.login(ua, 'authenticated');
  assert tests.rows_affected(format($q$insert into public.recipe_grants (recipe_id, grantee_user_id, permission, granted_by) values (%L, %L, 'read', %L)$q$, r_priv, ud, ua)) < 0,
    'droit à un inconnu';
  assert tests.rows_affected(format($q$insert into public.recipe_grants (recipe_id, grantee_user_id, permission, granted_by) values (%L, %L, 'read', %L)$q$, r_priv, ub, ub)) < 0,
    'granted_by usurpé';
  assert tests.rows_affected(format($q$insert into public.recipe_grants (recipe_id, grantee_user_id, permission, granted_by, origin) values (%L, %L, 'copy', %L, 'link')$q$, r_priv, ub, ua)) < 0,
    'lien public créé par l''API';
  insert into public.recipe_grants (recipe_id, grantee_user_id, permission, granted_by) values (r_priv, ub, 'read', ua) returning id into gb;
  insert into public.recipe_grants (recipe_id, grantee_group_id, permission, granted_by) values (r_grp, g1, 'copy', ua) returning id into gg;
  perform tests.logout();

  perform tests.login(ub, 'authenticated');
  assert private.can_read_recipe(r_priv) and not private.can_copy_recipe(r_priv), 'private + read : lit, ne copie pas';
  assert private.can_copy_recipe(r_grp) and not private.can_edit_recipe(r_grp), 'droit de groupe copy';
  assert tests.visible('select 1 from public.recipe_grants') = 2, 'B voit les droits qui le concernent';
  assert tests.rows_affected(format($q$update public.recipe_grants set permission = 'edit_original' where id = %L$q$, gb)) = 0, 'B se donne edit_original';
  assert tests.rows_affected(format($q$delete from public.recipe_grants where recipe_id = %L and grantee_group_id is not null$q$, r_grp)) = 0, 'B supprime le droit de groupe';
  -- repartage : refusé sans source, ou au-delà du niveau
  assert tests.rows_affected(format($q$insert into public.recipe_grants (recipe_id, grantee_user_id, permission, granted_by) values (%L, %L, 'read', %L)$q$, r_old, ud, ub)) < 0,
    'B donne un droit direct sur la recette d''un autre';
  perform tests.logout();

  perform tests.login(ud, 'authenticated');
  assert tests.visible('select 1 from public.recipe_grants') = 0, 'D voit des droits';
  perform tests.logout();

  -- A monte B à edit_original sur r_priv
  perform tests.login(ua, 'authenticated');
  assert tests.rows_affected(format($q$update public.recipe_grants set permission = 'edit_original' where id = %L$q$, gb)) = 1;
  perform tests.logout();
  perform tests.login(ub, 'authenticated');
  assert private.can_edit_recipe(r_priv) and private.recipe_level(r_priv) = 3, 'edit_original par grant direct';
  perform tests.logout();

  -- ============================================================ amitiés
  perform tests.login(ua, 'authenticated');
  insert into public.friendships (requester_id, addressee_id) values (ua, uc) returning id into fr_ac;
  assert tests.rows_affected(format($q$insert into public.friendships (requester_id, addressee_id) values (%L, %L)$q$, ub, ud)) < 0, 'demande au nom d''un autre';
  assert tests.rows_affected(format($q$insert into public.friendships (requester_id, addressee_id, status, responded_at) values (%L, %L, 'accepted', now())$q$, ua, ud)) < 0,
    'amitié créée déjà acceptée';
  assert tests.rows_affected(format($q$insert into public.friendships (requester_id, addressee_id) values (%L, %L)$q$, uc, ua)) < 0, 'paire inversée en double';
  assert tests.rows_affected(format($q$update public.friendships set status = 'accepted', responded_at = now() where id = %L$q$, fr_ac)) = 0,
    'le demandeur s''accepte lui-même';
  assert not private.are_friends(uc), 'amis avant acceptation';
  perform tests.logout();
  perform tests.login(ud, 'authenticated');
  assert tests.visible('select 1 from public.friendships') = 0, 'D voit une amitié';
  assert tests.rows_affected(format($q$update public.friendships set status = 'accepted', responded_at = now() where id = %L$q$, fr_ac)) = 0, 'D accepte pour C';
  perform tests.logout();
  perform tests.login(uc, 'authenticated');
  assert tests.visible('select 1 from public.friendships') = 1;
  assert tests.rows_affected(format($q$update public.friendships set status = 'accepted' where id = %L$q$, fr_ac)) < 0, 'acceptée sans date de réponse';
  assert tests.rows_affected(format($q$update public.friendships set requester_id = %L where id = %L$q$, ud, fr_ac)) < 0, 'requester_id modifiable';
  assert tests.rows_affected(format($q$update public.friendships set status = 'accepted', responded_at = now() where id = %L$q$, fr_ac)) = 1, 'C accepte';
  assert tests.rows_affected(format($q$update public.friendships set status = 'declined', responded_at = now() where id = %L$q$, fr_ac)) = 0, 'refus d''une amitié déjà acceptée (utiliser delete)';
  perform tests.logout();
  perform tests.login(ua, 'authenticated');
  assert private.are_friends(uc), 'amis après acceptation';
  perform tests.logout();
  -- B–C amis (pour le repartage), B demande, C accepte
  perform tests.login(ub, 'authenticated');
  insert into public.friendships (requester_id, addressee_id) values (ub, uc) returning id into fr_bc;
  perform tests.logout();
  perform tests.login(uc, 'authenticated');
  update public.friendships set status = 'accepted', responded_at = now() where id = fr_bc;
  perform tests.logout();
  -- refus puis nouvelle demande du demandeur d'origine (A → E)
  perform tests.login(ua, 'authenticated');
  insert into public.friendships (requester_id, addressee_id) values (ua, ue) returning id into fr_ae;
  perform tests.logout();
  perform tests.login(ue, 'authenticated');
  assert tests.rows_affected(format($q$update public.friendships set status = 'declined', responded_at = now() where id = %L$q$, fr_ae)) = 1, 'E refuse';
  assert tests.rows_affected(format($q$update public.friendships set status = 'pending', responded_at = null where id = %L$q$, fr_ae)) = 0, 'le destinataire relance à sa place';
  perform tests.logout();
  -- (0023 impose 7 jours entre deux demandes du même demandeur : on recule la date de la dernière demande, sans effet sans 0023)
  update public.friendships set created_at = now() - interval '8 days' where id = fr_ae;
  perform tests.login(ua, 'authenticated');
  assert tests.rows_affected(format($q$update public.friendships set status = 'pending', responded_at = null where id = %L$q$, fr_ae)) = 1, 'A relance après refus';
  perform tests.logout();

  -- ============================================================ droit accordé à une amie (hors groupe) et fin d'amitié
  perform tests.login(ua, 'authenticated');
  assert tests.rows_affected(format($q$insert into public.recipe_grants (recipe_id, grantee_user_id, permission, granted_by) values (%L, %L, 'copy', %L)$q$, r_f, uc, ua)) = 1, 'droit à une amie';
  perform tests.logout();
  perform tests.login(uc, 'authenticated');
  assert private.can_copy_recipe(r_f) and not private.can_read_recipe(r_priv), 'C : seulement ce qu''on lui a donné';
  assert not private.can_read_recipe(r_old), 'une amitié seule ne donne accès à rien';
  perform tests.logout();

  -- ============================================================ repartage
  perform tests.login(ub, 'authenticated');
  assert tests.rows_affected(format($q$insert into public.recipe_grants (recipe_id, grantee_user_id, permission, granted_by, origin, source_grant_id) values (%L, %L, 'edit_original', %L, 'reshare', %L)$q$, r_priv, uc, ub, gb)) < 0,
    'un repartage donne edit_original';
  assert tests.rows_affected(format($q$insert into public.recipe_grants (recipe_id, grantee_user_id, permission, granted_by, origin, source_grant_id) values (%L, %L, 'copy', %L, 'reshare', %L)$q$, r_priv, ud, ub, gb)) < 0,
    'repartage à un inconnu';
  assert tests.rows_affected(format($q$insert into public.recipe_grants (recipe_id, grantee_user_id, permission, granted_by, origin) values (%L, %L, 'read', %L, 'reshare')$q$, r_old, uc, ub)) < 0,
    'repartage d''un accès implicite (sans source)';
  assert tests.rows_affected(format($q$insert into public.recipe_grants (recipe_id, grantee_user_id, permission, granted_by, origin, source_grant_id) values (%L, %L, 'read', %L, 'reshare', %L)$q$, r_f, uc, ub, gb)) < 0,
    'source d''une autre recette';
  insert into public.recipe_grants (recipe_id, grantee_user_id, permission, granted_by, origin, source_grant_id)
  values (r_priv, uc, 'copy', ub, 'reshare', gb) returning id into gre;
  perform tests.logout();
  perform tests.login(uc, 'authenticated');
  assert private.can_copy_recipe(r_priv) and not private.can_edit_recipe(r_priv), 'C copie mais ne modifie pas (repartage ≠ edit_original)';
  -- C ne peut pas repartager au-delà de ce qu'elle a ni sans source
  assert tests.rows_affected(format($q$insert into public.recipe_grants (recipe_id, grantee_user_id, permission, granted_by, origin, source_grant_id) values (%L, %L, 'copy', %L, 'reshare', %L)$q$, r_priv, ub, uc, gre)) < 0,
    'repartage vers quelqu''un qui a déjà un droit (doublon)';
  perform tests.logout();
  -- l'auteur baisse le droit de B : le repartage est plafonné
  perform tests.login(ua, 'authenticated');
  update public.recipe_grants set permission = 'read' where id = gb;
  perform tests.logout();
  assert (select permission from public.recipe_grants where id = gre) = 'read', 'repartage non plafonné';
  perform tests.login(uc, 'authenticated');
  assert private.can_read_recipe(r_priv) and not private.can_copy_recipe(r_priv);
  perform tests.logout();
  -- supprimer le droit source supprime le repartage
  perform tests.login(ua, 'authenticated');
  assert tests.rows_affected(format($q$delete from public.recipe_grants where id = %L$q$, gb)) = 1;
  perform tests.logout();
  assert not exists (select 1 from public.recipe_grants where id = gre), 'repartage orphelin';
  perform tests.login(ub, 'authenticated');
  assert not private.can_read_recipe(r_priv), 'B garde l''accès après retrait du droit';
  perform tests.logout();

  -- repartage issu d'un droit de GROUPE : quitter le groupe retire le repartage
  perform tests.login(ub, 'authenticated');
  insert into public.recipe_grants (recipe_id, grantee_user_id, permission, granted_by, origin, source_grant_id)
  values (r_grp, uc, 'read', ub, 'reshare', gg) returning id into gre;
  perform tests.logout();
  perform tests.login(uc, 'authenticated');
  assert private.can_read_recipe(r_grp), 'C lit le repartage';
  perform tests.logout();

  -- ============================================================ carnet : geste explicite uniquement
  perform tests.login(ub, 'authenticated');
  insert into public.categories (owner_id, slug, name_fr) values (ub, 'b-cat', 'Ma catégorie') returning id into cat_b;
  assert tests.rows_affected(format($q$insert into public.cookbook_entries (user_id, recipe_id) values (%L, %L)$q$, ub, r_old)) = 1, 'B ajoute r_old';
  assert tests.rows_affected(format($q$insert into public.cookbook_entries (user_id, recipe_id) values (%L, %L)$q$, ub, r_priv)) < 0, 'B ajoute une recette illisible';
  assert tests.rows_affected(format($q$insert into public.cookbook_entries (user_id, recipe_id) values (%L, %L)$q$, ua, r_old)) < 0, 'B remplit le carnet de A';
  assert tests.rows_affected(format($q$insert into public.cookbook_entries (user_id, recipe_id, category_id) values (%L, %L, %L)$q$, ub, r_new, cat_a)) < 0,
    'catégorie d''un autre';
  assert tests.rows_affected(format($q$update public.cookbook_entries set category_id = %L where recipe_id = %L$q$, cat_b, r_old)) = 1, 'rangement dans sa catégorie';
  assert tests.rows_affected(format($q$update public.cookbook_entries set user_id = %L where recipe_id = %L$q$, ua, r_old)) < 0, 'entrée transférable';
  perform tests.logout();
  perform tests.login(ud, 'authenticated');
  assert tests.visible('select 1 from public.cookbook_entries') = 0, 'D voit un carnet';
  perform tests.logout();
  perform tests.login(ua, 'authenticated');
  assert tests.visible('select 1 from public.cookbook_entries') = 0, 'A voit le carnet de B';
  perform tests.logout();

  -- add_author_recipes_to_cookbook : toutes les recettes lisibles d'un auteur, idempotente, ferme la bannière
  perform tests.login(ub, 'authenticated');
  select count(*) into n from public.recipes rc where rc.owner_id = ua and private.can_read_recipe(rc.id);   -- r_old, r_grp, r_del, r_new
  assert n = 4, format('B lit %s recettes de A (4 attendues)', n);
  assert public.add_author_recipes_to_cookbook(ua) = 3, 'ajout des recettes lisibles sauf celle déjà présente';
  assert public.add_author_recipes_to_cookbook(ua) = 0, 'idempotence';
  assert (select count(*) from public.cookbook_entries) = 4, 'carnet de B';
  assert not exists (select 1 from public.cookbook_entries where recipe_id in (r_priv, r_f)), 'recette illisible ajoutée';
  assert (select count(*) from public.dismissed_prompts where kind = 'author_recipes' and target_id = ua) = 1, 'bannière non fermée';
  assert public.add_author_recipes_to_cookbook(ub) = 0, 'ses propres recettes';
  assert public.add_author_recipes_to_cookbook(null) = 0;
  perform tests.logout();
  perform tests.login(ud, 'authenticated');
  assert public.add_author_recipes_to_cookbook(ua) = 0, 'D n''ajoute rien';
  perform tests.logout();
  perform tests.login(ub, 'anon');
  assert tests.rows_affected(format('select public.add_author_recipes_to_cookbook(%L)', ua)) = -1, 'anon exécute la RPC';
  perform tests.logout();

  -- bannières fermées : les siennes seulement
  perform tests.login(ub, 'authenticated');
  assert tests.rows_affected(format($q$insert into public.dismissed_prompts (user_id, kind, target_id) values (%L, 'new_recipe', %L)$q$, ub, r_new)) = 1;
  assert tests.rows_affected(format($q$insert into public.dismissed_prompts (user_id, kind, target_id) values (%L, 'new_recipe', %L)$q$, ub, r_new)) = -2, 'doublon';
  assert tests.rows_affected(format($q$insert into public.dismissed_prompts (user_id, kind, target_id) values (%L, 'new_recipe', %L)$q$, ua, r_new)) < 0, 'fermer la bannière d''un autre';
  assert tests.rows_affected(format($q$insert into public.dismissed_prompts (user_id, kind, target_id) values (%L, 'autre', %L)$q$, ub, r_new)) = -2, 'genre inconnu';
  assert tests.rows_affected(format($q$update public.dismissed_prompts set target_id = %L$q$, ua)) < 0, 'UPDATE accordé';
  perform tests.logout();
  perform tests.login(ud, 'authenticated');
  assert tests.visible(format('select 1 from public.dismissed_prompts where user_id = %L', ub)) = 0
     and tests.rows_affected(format('delete from public.dismissed_prompts where user_id = %L', ub)) = 0, 'D touche aux bannières de B';
  perform tests.logout();
  perform tests.login(ub, 'authenticated');
  assert tests.rows_affected(format($q$delete from public.dismissed_prompts where kind = 'new_recipe' and target_id = %L$q$, r_new)) = 1, 'rouvrir une bannière';
  perform tests.logout();

  -- ============================================================ départ du groupe
  -- Membre : ne retire pas les autres ; ne se retire pas en « creator » ; le créateur retire un membre
  perform tests.login(ub, 'authenticated');
  assert tests.visible(format('select 1 from public.group_members where group_id = %L', g1)) = 3, 'membres du groupe visibles aux membres';
  assert tests.rows_affected(format($q$delete from public.group_members where group_id = %L and user_id = %L$q$, g1, ue)) = 0, 'B retire E';
  assert tests.rows_affected(format($q$delete from public.group_members where group_id = %L and user_id = %L$q$, g1, ua)) = 0, 'B retire le créateur';
  assert tests.rows_affected(format($q$update public.groups set name = 'Piraté' where id = %L$q$, g1)) = 0, 'B renomme le groupe';
  assert tests.rows_affected(format($q$delete from public.groups where id = %L$q$, g1)) = 0, 'B supprime le groupe';
  perform tests.logout();
  perform tests.login(ua, 'authenticated');
  assert tests.rows_affected(format($q$update public.groups set name = 'Les Auteurs 2', theme = '{"preset":"boultons"}' where id = %L$q$, g1)) = 1;
  assert tests.rows_affected(format($q$update public.groups set created_by = %L where id = %L$q$, ub, g1)) < 0, 'created_by modifiable';
  assert tests.rows_affected(format($q$delete from public.group_members where group_id = %L and user_id = %L$q$, g1, ua)) = 0, 'le créateur ne se retire pas';
  assert tests.rows_affected(format($q$delete from public.group_members where group_id = %L and user_id = %L$q$, g1, ue)) = 1, 'le créateur retire E';
  perform tests.logout();
  perform tests.login(ue, 'authenticated');
  assert tests.rows_affected(format($q$insert into public.group_members (group_id, user_id, role) values (%L, %L, 'member')$q$, g1, ue)) < 0,
    'E revient avec une invitation déjà acceptée';
  perform tests.logout();

  -- B part : il perd l'accès, le repartage issu du groupe disparaît, ses entrées de carnet deviennent invisibles
  perform tests.login(ub, 'authenticated');
  assert tests.rows_affected(format($q$delete from public.group_members where group_id = %L and user_id = %L$q$, g1, ub)) = 1, 'B quitte le groupe';
  assert not private.can_read_recipe(r_old) and not private.can_read_recipe(r_new) and not private.can_read_recipe(r_grp), 'B garde l''accès après son départ';
  assert tests.visible('select 1 from public.cookbook_entries') = 0, 'entrées de carnet encore visibles sans accès';
  assert tests.rows_affected(format($q$insert into public.group_members (group_id, user_id, role) values (%L, %L, 'member')$q$, g1, ub)) < 0, 'B revient sans nouvelle invitation';
  assert tests.visible('select 1 from public.groups') = 0;
  perform tests.logout();
  assert not exists (select 1 from public.recipe_grants where id = gre), 'repartage issu du groupe non retiré au départ';
  perform tests.login(uc, 'authenticated');
  assert not private.can_read_recipe(r_grp), 'C garde le repartage de B';
  perform tests.logout();
  -- les entrées de carnet existent toujours en base (retour possible), mais B ne les voit pas
  assert (select count(*) from public.cookbook_entries where user_id = ub) = 4;
  -- B est ré-invité : il retrouve tout
  insert into public.invitations (kind, inviter_id, target_user_id, group_id) values ('group', ua, ub, g1);
  perform tests.login(ub, 'authenticated');
  insert into public.group_members (group_id, user_id, role) values (g1, ub, 'member');
  assert private.can_read_recipe(r_old) and tests.visible('select 1 from public.cookbook_entries') = 4, 'retour dans le groupe';
  perform tests.logout();

  -- ============================================================ suppression d'une recette
  perform tests.login(ub, 'authenticated');
  assert tests.visible(format('select 1 from public.cookbook_entries where recipe_id = %L', r_del)) = 1;
  perform tests.logout();
  delete from public.recipes where id = r_del;
  perform tests.login(ub, 'authenticated');
  assert tests.visible(format('select 1 from public.cookbook_entries where recipe_id = %L', r_del)) = 0, 'la recette supprimée reste dans le carnet';
  assert tests.visible('select 1 from public.cookbook_entries') = 3;
  perform tests.logout();

  -- ============================================================ fin d'amitié : droits directs retirés (sans groupe commun)
  perform tests.login(ua, 'authenticated');
  assert tests.rows_affected(format($q$delete from public.friendships where id = %L$q$, fr_ac)) = 1, 'A met fin à l''amitié';
  perform tests.logout();
  assert not exists (select 1 from public.recipe_grants where recipe_id = r_f), 'droit à une ex-amie conservé';
  perform tests.login(uc, 'authenticated');
  assert not private.can_read_recipe(r_f);
  perform tests.logout();

  -- ============================================================ lien public : jeton lisible par l'auteur seulement
  perform tests.login(ua, 'authenticated');
  assert tests.rows_affected(format($q$insert into public.recipe_share_links (recipe_id) values (%L)$q$, r_old)) = 1;
  assert tests.visible('select 1 from public.recipe_share_links') = 1;
  perform tests.logout();
  perform tests.login(ub, 'authenticated');
  assert tests.visible('select 1 from public.recipe_share_links') = 0, 'B lit le jeton du lien public';
  assert tests.rows_affected(format($q$insert into public.recipe_share_links (recipe_id) values (%L)$q$, r_new)) < 0, 'B crée un lien sur la recette de A';
  assert tests.rows_affected('delete from public.recipe_share_links') = 0;
  perform tests.logout();

  -- ============================================================ catégories : par personne
  perform tests.login(ub, 'authenticated');
  assert tests.visible('select 1 from public.categories') = 1, 'B ne voit que sa catégorie';
  assert tests.rows_affected(format($q$insert into public.categories (owner_id, slug, name_fr) values (%L, 'intrus', 'X')$q$, ua)) < 0;
  assert tests.rows_affected(format($q$update public.categories set owner_id = %L where id = %L$q$, ua, cat_b)) < 0, 'catégorie transférable';
  assert tests.rows_affected(format($q$delete from public.categories where id = %L$q$, cat_a)) = 0;
  perform tests.logout();

  -- ============================================================ notifications : les siennes
  delete from public.notifications;     -- (0023 en crée aussi : demandes d'ami, droits, invitations ; sans effet sans 0023)
  insert into public.notifications (user_id, type) values (ua, 'x'), (ub, 'y');
  perform tests.login(ub, 'authenticated');
  assert tests.visible('select 1 from public.notifications') = 1;
  assert tests.rows_affected(format($q$insert into public.notifications (user_id, type) values (%L, 'z')$q$, ub)) < 0, 'insertion par l''API';
  assert tests.rows_affected(format($q$update public.notifications set read_at = now() where user_id = %L$q$, ua)) = 0, 'B marque lue la notification de A';
  assert tests.rows_affected(format($q$update public.notifications set read_at = now() where user_id = %L$q$, ub)) = 1;
  assert tests.rows_affected(format($q$update public.notifications set payload = '{"a":1}' where user_id = %L$q$, ub)) < 0, 'payload modifiable';
  assert tests.rows_affected(format($q$delete from public.notifications where user_id = %L$q$, ua)) = 0;
  perform tests.logout();

  -- ============================================================ rôle support : signalements
  perform tests.login(ud, 'authenticated');
  assert tests.rows_affected(format($q$insert into public.reports (recipe_id, reporter_id, reason, details) values (%L, %L, 'spam', 'test')$q$, r_old, ud)) = 1, 'D signale';
  assert tests.rows_affected(format($q$insert into public.reports (recipe_id, reporter_id, reason) values (%L, %L, 'spam')$q$, r_old, ub)) < 0, 'signalement au nom d''un autre';
  assert tests.rows_affected(format($q$insert into public.reports (recipe_id, reporter_id, reason, status) values (%L, %L, 'spam', 'actioned')$q$, r_old, ud)) < 0, 'signalement déjà traité';
  assert tests.visible('select 1 from public.reports') = 1 and tests.visible(format('select 1 from public.reports where reporter_id <> %L', ud)) = 0, 'D ne relit que SON signalement';
  assert not private.is_support();
  perform tests.logout();
  perform tests.login(ub, 'authenticated');
  assert tests.visible('select 1 from public.reports') = 0 and tests.visible('select 1 from public.system_alerts') = 0;
  assert tests.rows_affected(format($q$update public.reports set status = 'dismissed'$q$)) = 0, 'B traite un signalement';
  assert tests.rows_affected(format($q$insert into public.system_alerts (key) values ('hack')$q$)) < 0;
  perform tests.logout();
  insert into public.system_alerts (key, status) values ('ai_credit', 'alert');
  perform tests.login(s, 'authenticated');
  assert private.is_support(), 'le compte admin est support';
  assert tests.visible('select 1 from public.reports') = 1, 'le support voit les signalements';
  assert tests.visible('select 1 from public.system_alerts') = 1;
  assert not private.can_read_recipe(r_priv) and not private.can_edit_recipe(r_priv) and private.recipe_level(r_priv) = 0,
    'le support ne lit pas une recette privée non signalée, et ne modifie jamais';
  assert tests.rows_affected(format($q$update public.reports set status = 'reviewed', handled_at = now() where reporter_id = %L$q$, ud)) = 1;
  assert tests.rows_affected(format($q$update public.reports set reason = 'other'$q$)) < 0, 'colonne reason modifiable';
  assert tests.visible('select 1 from public.groups') = 0, 'le support n''entre pas dans les groupes';
  assert tests.visible('select 1 from public.cookbook_entries') = 0, 'le support lit les carnets';
  perform tests.logout();
  -- le claim JWT fait foi (comme is_admin)
  perform tests.login(ub, 'authenticated', '{"user_role":"admin"}');
  assert private.is_support() and tests.visible('select 1 from public.reports') = 1;
  perform tests.logout();

  -- ============================================================ données personnelles
  -- recherche : ≥ 3 lettres, discoverable, jamais soi, jamais l'e-mail
  perform tests.login(ub, 'authenticated');
  assert (select count(*) from public.search_users('dav')) = 1 and (select id from public.search_users('dav')) = ud, 'recherche par nom';
  assert (select count(*) from public.search_users('ETRANGER')) = 1, 'recherche sans accent ni casse';
  assert (select count(*) from public.search_users('eve')) = 0 and (select count(*) from public.search_users('cach')) = 0, 'discoverable = false ignoré';
  assert (select count(*) from public.search_users('bob')) = 0, 'soi-même dans la recherche';
  assert (select count(*) from public.search_users('da')) = 0, 'moins de 3 lettres';
  assert (select count(*) from public.search_users('%%%')) = 0 and (select count(*) from public.search_users('___')) = 0, 'jokers LIKE';
  assert (select count(*) from public.search_users('test.local')) = 0 and (select count(*) from public.search_users('@')) = 0, 'recherche par e-mail';
  assert (select count(*) from public.search_users('e')) = 0;
  select count(*) into n from public.search_users('ali');
  assert n = 1;
  assert (select count(*) from public.search_users('a-auteur')) = 0, 'recherche sur le nom technique (= e-mail)';
  assert pg_get_function_result('public.search_users(text)'::regprocedure) = 'TABLE(id uuid, display_name text)', 'colonnes de search_users';
  select to_jsonb(su) into j from public.search_users('dav') su;
  assert j ?& array['id', 'display_name'] and not (j ? 'email') and not (j ? 'name') and j::text not like '%@%', 'e-mail exposé par search_users';
  perform tests.logout();
  perform tests.login(ub, 'anon');
  assert tests.rows_affected($q$select * from public.search_users('dav')$q$) = -1, 'anon cherche des personnes';
  perform tests.logout();
  -- discoverable = true mais sans display_name : introuvable (le « name » technique est l'e-mail)
  update public.profiles set display_name = null where id = ud;
  perform tests.login(ub, 'authenticated');
  assert (select count(*) from public.search_users('etranger')) = 0 and (select count(*) from public.search_users('d-etr')) = 0, 'compte sans display_name trouvé';
  perform tests.logout();
  update public.profiles set display_name = 'Dave Étranger' where id = ud;

  -- get_public_profiles : personnes liées seulement
  perform tests.login(ub, 'authenticated');
  assert exists (select 1 from public.get_public_profiles(array[ua, ub, uc]) where id = ua and display_name = 'Alice Auteur'), 'groupe';
  assert (select count(*) from public.get_public_profiles(array[ua, ub, uc])) = 3, 'soi + groupe + amie';
  assert (select count(*) from public.get_public_profiles(array[ud])) = 0, 'étranger visible';
  assert (select count(*) from public.get_public_profiles(null)) = 0;
  select to_jsonb(p) into j from public.get_public_profiles(array[ua]) p;
  assert not (j ? 'email') and j::text not like '%@%', 'e-mail exposé par get_public_profiles';
  -- profiles : ligne propre seulement (politiques de v1 inchangées)
  assert tests.visible('select 1 from public.profiles') = 1, 'B lit d''autres profils';
  assert tests.visible(format('select email from public.profiles where id = %L', ua)) = 0, 'e-mail d''un autre lisible';
  perform tests.logout();
  -- une demande d'ami en attente (C → D) rend le nom visible, pas plus
  insert into public.friendships (requester_id, addressee_id) values (uc, ud);
  perform tests.login(ud, 'authenticated');
  assert (select count(*) from public.get_public_profiles(array[uc, ua, ub])) = 1, 'demande d''ami : seulement le demandeur';
  perform tests.logout();

  -- ============================================================ non-régression v1
  -- les politiques et fonctions existantes sont intactes (empreintes md5 vérifiées par la migration) ;
  -- ici : le comportement de la v1 avec les nouvelles tables en place
  perform tests.login(ud, 'anon');
  assert (select count(*) from public.recipes) >= 2, 'v1 : lecture publique des recettes';
  assert tests.visible('select 1 from public.groups') = -1 and tests.visible('select 1 from public.cookbook_entries') = -1
     and tests.visible('select 1 from public.recipe_grants') = -1, 'anon : tables sociales fermées';
  perform tests.logout();
  perform tests.login(ud, 'authenticated');
  assert (select count(*) from public.recipes) >= 2, 'v1 : tout compte connecté lit toutes les recettes';
  perform tests.logout();
  raise notice '[test 0019] politiques sociales, droits implicites et explicites, carnet, bannières, support, données personnelles : OK';
end $$;


-- ---------------------------------------------------------------- corrections de la relecture de sécurité
do $$
declare
  s  constant uuid := '00000000-0000-0000-0000-00000000000a';
  up constant uuid := '00000000-0000-0000-0000-0000000000f1';
  uq constant uuid := '00000000-0000-0000-0000-0000000000f2';
  ur constant uuid := '00000000-0000-0000-0000-0000000000f3';
  ut constant uuid := '00000000-0000-0000-0000-0000000000f4';
  rp constant uuid := '91000000-0000-0000-0000-000000000001';   -- privée de P
  rg uuid; g uuid; g_other uuid; v uuid; rep uuid; rr uuid; n bigint;
begin
  insert into auth.users (id, email, raw_user_meta_data) values
    (up, 'p@test.local', '{}'), (uq, 'q@test.local', '{}'), (ur, 'r@test.local', '{}'), (ut, 't@test.local', '{}');
  update public.profiles set display_name = 'Pierre' where id = up;
  update public.profiles set display_name = 'Quentin' where id = uq;
  insert into public.recipes (id, title, category, owner_id, visibility) values (rp, 'Privée P', 'plats', up, 'private'), ('91000000-0000-0000-0000-000000000009', 'Privée non signalée', 'plats', up, 'private');

  -- (10) création d'un groupe : l'invité a rejoint AVANT que le créateur n'insère sa propre ligne
  perform tests.login(up, 'authenticated');
  insert into public.groups (name, created_by) values ('Ordre inversé', up) returning id into g;
  insert into public.invitations (kind, inviter_id, target_user_id, group_id) values ('group', up, uq, g);
  perform tests.logout();
  perform tests.login(uq, 'authenticated');
  assert tests.rows_affected(format($q$insert into public.group_members (group_id, user_id, role) values (%L, %L, 'member')$q$, g, uq)) = 1, 'Q rejoint';
  perform tests.logout();
  perform tests.login(up, 'authenticated');
  assert tests.rows_affected(format($q$insert into public.group_members (group_id, user_id, role) values (%L, %L, 'creator')$q$, g, up)) = 1,
    'le créateur ne peut plus s''inscrire une fois un membre arrivé';
  assert tests.rows_affected(format($q$insert into public.group_members (group_id, user_id, role) values (%L, %L, 'creator')$q$, g, up)) < 0, 'deux creator';
  perform tests.logout();
  perform tests.login(uq, 'authenticated');
  assert tests.rows_affected(format($q$delete from public.group_members where group_id = %L and user_id = %L$q$, g, uq)) = 1, 'Q quitte';
  perform tests.logout();
  -- un tiers ne peut pas s'inscrire creator d'un groupe qui n'est pas le sien
  perform tests.login(ut, 'authenticated');
  assert tests.rows_affected(format($q$insert into public.group_members (group_id, user_id, role) values (%L, %L, 'creator')$q$, g, ut)) < 0, 'T creator du groupe de P';
  perform tests.logout();

  -- (4) INSERT … RETURNING : group_members et reports
  perform tests.login(up, 'authenticated');
  insert into public.groups (name, created_by) values ('Retour', up) returning id into g_other;
  insert into public.group_members (group_id, user_id, role) values (g_other, up, 'creator') returning user_id into v;
  assert v = up, 'returning group_members';
  perform tests.logout();
  perform tests.login(ut, 'authenticated');
  insert into public.reports (recipe_id, reporter_id, reason) values (rp, ut, 'spam') returning id into rep;
  assert rep is not null, 'returning reports';
  assert tests.visible('select 1 from public.reports') = 1, 'T relit son signalement';
  perform tests.logout();
  perform tests.login(ur, 'authenticated');
  assert tests.visible('select 1 from public.reports') = 0, 'R lit le signalement d''un autre';
  perform tests.logout();

  -- (3) support : lit une recette seulement si elle est signalée (open / reviewed)
  perform tests.login(s, 'authenticated');
  assert private.can_read_recipe(rp), 'support : recette signalée (open)';
  assert not private.can_edit_recipe(rp) and private.recipe_level(rp) = 0, 'support : jamais de droit d''édition';
  perform tests.logout();
  update public.reports set status = 'reviewed' where id = rep;
  perform tests.login(s, 'authenticated');
  assert private.can_read_recipe(rp), 'support : signalement reviewed';
  perform tests.logout();
  update public.reports set status = 'dismissed' where id = rep;
  perform tests.login(s, 'authenticated');
  assert not private.can_read_recipe(rp), 'support : signalement classé -> plus d''accès';
  perform tests.logout();
  -- les autres recettes privées restent illisibles pour le support
  perform tests.login(s, 'authenticated');
  assert not private.can_read_recipe('91000000-0000-0000-0000-000000000009'::uuid), 'support : recette privée non signalée';
  perform tests.logout();

  -- (6) départ d'un groupe : droits directs retirés s'il n'y a plus ni amitié ni groupe commun
  insert into public.group_members (group_id, user_id, role) values (g, uq, 'member');
  insert into public.friendships (requester_id, addressee_id, status, responded_at) values (up, ur, 'accepted', now());
  insert into public.group_members (group_id, user_id, role) values (g, ur, 'member');
  insert into public.recipes (id, title, category, owner_id, visibility) values
    ('91000000-0000-0000-0000-000000000002', 'Pour Q', 'plats', up, 'private'),
    ('91000000-0000-0000-0000-000000000003', 'Pour R (amie)', 'plats', up, 'private'),
    ('91000000-0000-0000-0000-000000000004', 'De Q pour P', 'plats', uq, 'private');
  perform tests.login(up, 'authenticated');
  insert into public.recipe_grants (recipe_id, grantee_user_id, permission, granted_by) values ('91000000-0000-0000-0000-000000000002', uq, 'read', up);
  insert into public.recipe_grants (recipe_id, grantee_user_id, permission, granted_by) values ('91000000-0000-0000-0000-000000000003', ur, 'read', up);
  perform tests.logout();
  perform tests.login(uq, 'authenticated');
  insert into public.recipe_grants (recipe_id, grantee_user_id, permission, granted_by) values ('91000000-0000-0000-0000-000000000004', up, 'read', uq);
  perform tests.logout();
  delete from public.group_members where group_id = g and user_id in (uq, ur);
  assert not exists (select 1 from public.recipe_grants where recipe_id in ('91000000-0000-0000-0000-000000000002', '91000000-0000-0000-0000-000000000004')),
    'droits directs conservés après le départ (plus ni amis ni groupe commun)';
  assert exists (select 1 from public.recipe_grants where recipe_id = '91000000-0000-0000-0000-000000000003'), 'droit à une amie supprimé à tort';

  -- (8) thème actif : membre du groupe seulement ; NULL toujours permis ; remis à NULL au départ
  insert into public.group_members (group_id, user_id, role) values (g, uq, 'member');
  perform tests.login(uq, 'authenticated');
  assert tests.rows_affected(format($q$update public.profiles set active_theme_group_id = %L where id = %L$q$, g_other, uq)) < 0, 'thème d''un groupe étranger';
  assert tests.rows_affected(format($q$update public.profiles set active_theme_group_id = %L where id = %L$q$, g, uq)) = 1, 'thème de son groupe';
  assert tests.rows_affected(format($q$update public.profiles set active_theme_group_id = null where id = %L$q$, uq)) = 1, 'NULL permis';
  assert tests.rows_affected(format($q$update public.profiles set active_theme_group_id = %L where id = %L$q$, g, uq)) = 1;
  perform tests.logout();
  delete from public.group_members where group_id = g and user_id = uq;
  assert (select active_theme_group_id from public.profiles where id = uq) is null, 'thème actif conservé après départ';
  raise notice '[test 0019] corrections relecture : OK';
end $$;

-- ---------------------------------------------------------------- v1 : les mêmes appels qu'en 0017
do $$
declare
  admin_id constant uuid := '00000000-0000-0000-0000-00000000000a';
  user_id  constant uuid := '00000000-0000-0000-0000-00000000000b';
  v_id uuid; v_list uuid; r record;
  payload jsonb := $j${
    "title": "Tarte 0019", "category": "desserts et gâteaux", "servings": 6, "lang": "fr",
    "sections": [
      { "name": "Pâte", "type": "ingredients", "ingredients": [ { "name": "farine", "amount": "250", "unit": "g" } ] },
      { "name": "Préparation", "type": "instructions", "instructions": [ "Cuire." ] } ]
  }$j$;
  tr jsonb := $j${
    "title": "Pie 0019", "source_hash": "h1", "model": "mock", "tags": [],
    "content": { "sections": [ { "name": "Dough", "ingredients": [ { "name": "flour", "amount": null, "unit": null } ], "instructions": [] },
                               { "name": "Method", "ingredients": [], "instructions": ["Bake."] } ] }
  }$j$;
begin
  perform tests.login(admin_id, 'authenticated');
  v_id := public.save_recipe(payload || jsonb_build_object('translation', tr));
  perform public.save_recipe_translation(v_id, 'fr', tr);
  assert (select count(*) from public.recipe_translations where recipe_id = v_id) = 1, 'save_recipe_translation';
  perform tests.logout();

  perform tests.login(user_id, 'anon');
  select * into r from public.search_recipes('Tarte 0019');
  assert r.id = v_id and r.translation ->> 'title' = 'Pie 0019', 'search_recipes (anon)';
  perform tests.logout();

  perform tests.login(user_id, 'authenticated');
  insert into public.shopping_lists (user_id, name) values (user_id, 'Test 0019') returning id into v_list;
  perform public.add_recipe_to_list(v_id, v_list, null, 1);
  perform public.add_recipe_to_list(v_id, v_list, null, 1, 'en');
  assert (select count(*) from public.shopping_items where list_id = v_list) = 2, 'add_recipe_to_list';
  begin
    perform public.save_recipe(payload || '{"title": "Interdit"}');
    raise exception 'un utilisateur a pu enregistrer une recette';
  exception when insufficient_privilege then null; end;
  perform tests.logout();

  perform tests.login(admin_id, 'authenticated');
  perform public.delete_recipe(v_id);
  perform tests.logout();
  assert not exists (select 1 from public.recipe_translations where recipe_id = v_id), 'cascade traductions';
  raise notice '[test 0019] non-régression v1 : OK';
end $$;

rollback;
