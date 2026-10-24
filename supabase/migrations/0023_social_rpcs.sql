-- ============================================================================
--  0023 — Fonctions métier côté social : amis, groupes, invitations, notifications, profil, compte
-- ============================================================================
--  QUAND : phase 5B du plan v2 (dossier « WebApp - Recettes v2 », §2, §3, §7.4, §7.7, §9 et §10). Peut être
--  appliquée en production À TOUT MOMENT après 0019 : elle ne change RIEN pour le site actuel (v1). Prérequis :
--  0017, 0019 (fonctions d'aide `private.*`, politiques sociales, déclencheurs d'intégrité), 0008
--  (public.immutable_unaccent). Indépendante de 0021 (aucune de ses fonctions n'est appelée ici).
--
--  NUMÉROTATION : 0017 expand · 0018 remplissage (supabase/v2/) · 0019 aides + politiques · 0020 bascule
--  (supabase/v2/) · 0021 fonctions métier côté recettes · 0022 = RÉSERVÉE au « contract » (ne pas l'utiliser) ·
--  0023 = CETTE migration.
--
--  CE QUI EST APPLIQUÉ ICI
--   A. 29 fonctions publiques NOUVELLES, toutes `security definer`, `set search_path = ''`, `(select auth.uid())`,
--      exécutables par `authenticated` (+ `service_role`) seulement, jamais par `anon` ni PUBLIC :
--        Amis          send_friend_request · respond_friend_request · cancel_friend_request · remove_friend ·
--                      list_friends · list_friend_requests
--        Groupes       create_group · rename_group · update_group_theme · invite_to_group · cancel_group_invitation ·
--                      respond_group_invitation · leave_group · remove_group_member · transfer_group_ownership ·
--                      delete_group · list_my_groups · list_group_members · list_group_invitations
--        Liens         create_invite_link · redeem_invite_link   (invitation de groupe par lien, voir CHOIX n° 9)
--        Notifications list_notifications · mark_notifications_read · unread_notifications_count
--        Profil        update_my_profile · get_user_profile
--        Compte        export_my_data · account_deletion_blockers · prepare_account_deletion (service_role SEULEMENT)
--   B. Aides internes dans `private` (aucun droit pour l'API) : display_name_of, notify, check_rate_limit,
--      require_group_creator, level_of, + 9 fonctions de déclencheurs ; une table `private.rate_events`
--      (journal des actions limitées, voir CHOIX n° 6).
--   C. 9 déclencheurs NOUVEAUX (`trg_0023_*`) sur les tables sociales (friendships, invitations, recipe_grants,
--      reports) et sur `profiles` et `recipes` (v1, voir CHOIX n° 4 et n° 8) :
--        friendships   avant écriture : limite de débit + délai de relance ; après écriture : notifications ;
--                      après suppression : nettoyage de la notification d'une demande annulée
--        invitations   avant insertion : limite de débit ; après insertion : notification ; après mise à jour :
--                      notification « invitation acceptée » / nettoyage si annulée
--        recipe_grants après insertion / hausse d'un droit : notification « recette partagée avec vous »
--        reports       avant insertion : limite de 10 signalements par jour
--        profiles      avant écriture du pseudonyme : pas d'« @ », pas de doublon (voir CHOIX n° 7)
--        recipes       AVANT SUPPRESSION : notifie les personnes qui l'avaient dans leur carnet (CHOIX n° 4)
--
--  CE QUI N'EST PAS TOUCHÉ : aucune table existante, colonne, politique RLS, ni fonction existante (0021
--  comprise) ; aucune donnée. Empreintes md5 des politiques (public + storage), des autres fonctions du schéma
--  public et des déclencheurs existants vérifiées en fin de fichier (comme 0019 et 0021). Les nouveaux
--  déclencheurs sur `recipes` et `profiles` sont sans effet tant que `cookbook_entries` est vide (recipes) et
--  que `display_name` n'est pas écrit par l'API (profiles) : c'est le cas de la v1.
--
--  CHOIX DE CONCEPTION (à valider par Nina — le dossier est ambigu ou muet)
--   1. Qui invite dans un groupe : LE CRÉATEUR SEULEMENT (§2.5 « le créateur ajoute et retire des membres »,
--      §10 réponse n° 2, et la politique `group_members_insert` de 0019 n'accepte qu'une invitation émise par le
--      créateur ACTUEL). Un simple membre ne peut ni inviter, ni créer de lien, ni retirer personne. La personne
--      invitée ACCEPTE (aucune recette n'est ajoutée à son carnet : clarification du 2026-10-24).
--   2. Relance d'une demande d'ami refusée (point ouvert de 0019 n° 9) : la ligne `friendships` est RÉUTILISÉE
--      (une seule par paire, 0017 n° 10). (a) La personne qui a REFUSÉ peut à son tour demander : la ligne change
--      de sens (demandeur ⇄ destinataire), sans délai. (b) Le demandeur d'origine peut relancer au plus UNE FOIS
--      PAR 7 JOURS après sa dernière demande (délai compté depuis `created_at`, remis à « maintenant » à chaque
--      nouvelle demande ; appliqué par un déclencheur, donc aussi si l'API met la ligne à jour directement). Un
--      refus n'envoie AUCUNE notification (discrétion) ; le demandeur voit « refusée » dans list_friend_requests.
--      Pas de blocage de personne (hors périmètre) : le délai de 7 jours et la limite quotidienne sont les seuls
--      freins. Si la personne a déjà envoyé une demande en sens inverse : refus clair (« répondez-y »), pas
--      d'acceptation automatique. Une demande déjà en attente ou une amitié existante est renvoyée telle quelle
--      (idempotent, sans nouvelle notification).
--   3. Transfert du créateur (0017 n° 6, 0019 n° 7) : `transfer_group_ownership` verrouille le groupe, met
--      `created_by` ET les deux `role` dans la même transaction (l'ancien repasse « member » avant que le nouveau
--      devienne « creator » : l'index unique « un seul creator »), exige que le nouveau créateur soit déjà MEMBRE,
--      ANNULE les invitations en attente de l'ancien créateur (elles ne seraient plus acceptables selon 0019 ; le
--      nouveau créateur ré-invite) et prévient le nouveau créateur. Le créateur ne peut pas quitter le groupe
--      (`leave_group` refuse) : il transfère ou supprime.
--   4. Suppression d'une recette détenue dans des carnets (réponse n° 4 du §10) : déclencheur AVANT suppression sur
--      `recipes` (v1 : table existante). Choix : un déclencheur plutôt qu'un changement de `delete_recipe` (qui doit
--      rester identique pour la v1, 0021 n° 9) ; il couvre TOUS les chemins (delete_recipe, suppression par le
--      support, suppression d'un compte par cascade). Il notifie les détenteurs de `cookbook_entries` autres que
--      l'auteur QUI POUVAIENT ENCORE LIRE la recette (sinon le titre fuirait vers quelqu'un dont le droit a été
--      retiré : `private.level_of(personne, recette)` reprend `recipe_level` pour une personne donnée ; EXCEPTION : quand c'est le
--      COMPTE de l'auteur qui est supprimé, ses appartenances de groupe sont déjà parties en cascade avant ses recettes, donc le
--      droit implicite aussi : on notifie alors tous les détenteurs), avec ids,
--      titre et pseudonyme de l'auteur dans le payload ; il ne notifie pas les personnes qui ont une COPIE (elle leur
--      appartient) ni les comptes en cours de suppression. Sans effet en v1 : `cookbook_entries` y est vide, le
--      déclencheur ne fait alors qu'un test d'existence indexé (pas d'écriture, pas d'exception possible).
--   5. Suppression d'un groupe : tout part en CASCADE (clés étrangères de 0017) : appartenances, invitations,
--      droits `recipe_grants` donnés AU groupe (et les repartages qui en dépendent), thème actif des membres
--      (`on delete set null`). Le partage implicite « groupes » n'existait que par l'appartenance commune : il
--      disparaît s'il n'y a plus de groupe commun. Les droits directs entre personnes (ami / autre groupe), les
--      recettes et les COPIES restent. Les entrées de carnet « telles quelles » restent en base mais ne sont plus
--      visibles dans list_cookbook tant que la recette n'est plus lisible (0021 n° 5). Chaque membre est prévenu.
--   6. Anti-abus (§7.7) : 20 demandes d'ami, 20 invitations (personne ou lien) et 3 exports par 24 h glissantes
--      et par personne ; 10 signalements par 24 h. Les envois sont comptés dans `private.rate_events` (et non en
--      comptant les lignes de `friendships` / `invitations`) : annuler puis renvoyer, ou créer puis supprimer un
--      groupe, ne remet pas le compteur à zéro. Les signalements se comptent directement sur `reports.created_at`
--      (aucune suppression possible par l'API). Les limites sont dans des DÉCLENCHEURS : elles valent aussi pour
--      les écritures directes que les politiques de 0019 autorisent. Dépassement = SQLSTATE 54000 (message en
--      français). Ignorées sans `auth.uid()` (service, migrations, remplissage). L'export est limité à 3 par jour
--      (le dossier §7.4 dit 1 : trois, pour qu'un téléchargement raté ne bloque pas la personne toute la journée).
--   7. Profil : l'`update` direct de sa ligne reste possible (politiques 0001 / 0020, colonnes non restreintes). Une
--      RPC est quand même nécessaire pour valider : `update_my_profile` (pseudonyme 1-60 caractères, titre ≤ 80,
--      thème = objet ≤ 4000 caractères, thème actif = groupe dont on est membre). Les règles du pseudonyme (pas
--      d'« @ » : jamais d'e-mail affiché ; pas de doublon à la casse et aux accents près, verrou consultatif contre
--      la course) sont dans un déclencheur sur `profiles` (valable aussi pour l'update direct) ; un index unique
--      aurait modifié la table v1. Le doublon est un choix à valider (il évite les sosies dans la recherche). Pour
--      un changement partiel : un paramètre NULL = inchangé ; titre '' = effacer ; thème '{}' = effacer ;
--      `p_personal_theme => true` = revenir au thème personnel (thème actif NULL).
--   8. Notifications créées par déclencheurs (et non seulement dans les RPC) quand l'API peut écrire directement :
--      demande d'ami (friendships), invitation de groupe (invitations), droit direct ou repartage à une personne
--      (recipe_grants : grant_recipe / reshare_recipe de 0021 sont donc couvertes SANS les modifier ; pas de
--      notification pour un lien public ni un droit donné à un groupe ; un doublon non lu pour la même recette est
--      ignoré). Dans les RPC : groupe supprimé, membre retiré, transfert du rôle. Types : friend_request,
--      friend_accepted, group_invitation, group_invitation_accepted, recipe_shared, recipe_deleted,
--      group_member_removed, group_deleted, group_ownership_transferred. Payload : identifiants, pseudonymes,
--      titres, jamais d'e-mail ni de `profiles.name`. `created_at` = horloge réelle (tri stable pour la pagination).
--   9. Invitation par lien : `create_invite_link(group)` (créateur) renvoie le jeton EN CLAIR une seule fois (64
--      caractères hexadécimaux) et ne stocke que son empreinte SHA-256 dans `invitations.token_hash` (valable 7
--      jours ; compte dans la limite de 20 invitations). `redeem_invite_link(token)` (connecté) rejoint le groupe :
--      lien À USAGE UNIQUE (la ligne passe « accepted » et reçoit la personne), message d'échec unique pour
--      jeton inconnu / consommé / expiré. L'invitation par E-MAIL (colonne `target_email`) et l'ENVOI de messages
--      (Resend) relèvent de la phase 7 : rien n'est envoyé ici.
--  10. Compte (§7.4) : `export_my_data()` renvoie un jsonb avec tout ce qui est à moi ; les autres n'y figurent que
--      par leur PSEUDONYME (aucun identifiant de personne, aucun e-mail ; les identifiants de personnes sont retirés
--      des payloads de notifications). Les photos (zip) relèvent de la phase 8. La suppression effective passe par
--      le serveur (`server/api/account/delete.post.ts`, clé service_role, `auth.admin.deleteUser`) :
--      `account_deletion_blockers()` liste les groupes que je CRÉE et qui ont d'autres membres (à transférer ou à
--      supprimer) ; `prepare_account_deletion(user)` (service_role seulement) refuse (SQLSTATE 55000) s'il en reste,
--      sinon supprime les groupes où l'on est seul puis rend la main (le `on delete restrict` de `groups.created_by`
--      ne bloque plus). La suppression en cascade des recettes déclenche les notifications du CHOIX n° 4.
--  11. get_user_profile(user) ne renvoie une personne que si l'appelant peut déjà la voir (`private.can_see_profile` :
--      soi, groupe commun, amitié ou demande, invitation, auteur d'une recette lisible), sinon AUCUNE ligne (pas de
--      distinction « inconnu / invisible »). Pour une personne trouvée par search_users, le pseudonyme vient déjà de
--      la recherche. Jamais d'e-mail, jamais `profiles.name`.
--  12. Erreurs : refus de droit 42501 (message français) ; introuvable P0002 ; entrée invalide 22023 ; limite de débit
--      54000 ; groupe à transférer avant suppression de compte 55000. Un groupe ou une demande dont on n'est pas partie
--      est « introuvable » (P0002), pas « refusé » : on n'en révèle pas l'existence.
--
--  13. (relecture de sécurité n° 2) Concurrence et abus. (a) `private.check_rate_limit`, le déclencheur des signalements et les
--      plafonds de 0019 prennent d'abord un verrou consultatif `pg_advisory_xact_lock(hashtextextended(personne || ':' || genre, 0))`
--      (tenu jusqu'à la fin de la transaction) : deux appels parallèles ne dépassent plus la limite. (b) `private.require_group_creator`
--      verrouille la ligne du groupe (`for update`, d'où `volatile`) : transfert, départ, retrait, invitation, lien, suppression et
--      renommage d'un même groupe sont sérialisés ; si le rôle a changé pendant l'attente, l'ancien créateur reçoit « introuvable ».
--      `leave_group` verrouille le groupe AVANT de lire son rôle ; `transfer_group_ownership` vérifie qu'une seule ligne est
--      passée « creator » (sinon 55000). (c) `redeem_invite_link` et `respond_group_invitation` exigent
--      `groups.created_by = invitations.inviter_id` : l'invitation (ou le lien) d'un ex-créateur est refusée avec le message d'un
--      jeton / d'une invitation inconnus. (d) Pseudonyme : caractères de format, invisibles et espaces spéciales refusés ; pas de mélange
--      latin + cyrillique / grec ; unicité sur la forme normalisée (NFKC, minuscules, sans accents). Les pseudonymes d'un seul
--      alphabet cyrillique ou grec restent permis (limite connue : un pseudonyme entièrement cyrillique qui ressemble à un
--      pseudonyme latin n'est pas détecté).
--
--  RÉVERSIBILITÉ : supabase/rollback/0023_social_rpcs_down.sql (supprime fonctions, déclencheurs et journal ; les
--  notifications déjà créées restent).
--  IDEMPOTENTE : rejouable (create or replace, drop trigger if exists, grants rejoués).
--  COMPATIBLE SQL EDITOR : aucun `create temporary table` (instantané dans `private.tmp_0023_before`, supprimé en fin).
--  ATTENDU APRÈS : 29 fonctions publiques nouvelles, 9 déclencheurs nouveaux, 0 politique / donnée modifiée.
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- 0. Pré-requis et empreintes « avant »
-- ----------------------------------------------------------------------------
do $$
begin
  assert to_regclass('public.groups') is not null and to_regclass('public.notifications') is not null,
    '[0023] tables sociales absentes : appliquer 0017';
  assert to_regclass('public.dismissed_prompts') is not null
     and to_regprocedure('private.can_see_profile(uuid)') is not null
     and to_regprocedure('private.permission_rank(text)') is not null
     and to_regprocedure('private.is_group_creator(uuid)') is not null,
    '[0023] fonctions d''aide absentes : appliquer 0019';
  assert to_regprocedure('public.immutable_unaccent(text)') is not null, '[0023] immutable_unaccent absente : appliquer 0008';
end $$;

create schema if not exists private;

-- Instantané dans une vraie table (le SQL Editor de Supabase ne garde pas les tables temporaires d'une
-- instruction à l'autre) ; supprimée par la vérification finale.
drop table if exists private.tmp_0023_before;
create table private.tmp_0023_before as
  select (select count(*) from public.recipes)          as n_recipes,
         (select count(*) from public.profiles)         as n_profiles,
         (select count(*) from public.friendships)      as n_friendships,
         (select count(*) from public.invitations)      as n_invitations,
         (select count(*) from public.notifications)    as n_notifications,
         (select count(*) from public.group_members)    as n_members,
         (select md5(coalesce(string_agg(
                   concat_ws('|', schemaname, tablename, policyname, cmd, roles::text, qual, with_check),
                   E'\n' order by schemaname, tablename, policyname), ''))
            from pg_policies
           where schemaname in ('public', 'storage')) as policies_md5,
         (select md5(coalesce(string_agg(pg_get_functiondef(p.oid), E'\n' order by p.oid::regprocedure::text), ''))
            from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
           where ns.nspname = 'public'
             and p.proname not in ('send_friend_request', 'respond_friend_request', 'cancel_friend_request', 'remove_friend',
                                   'list_friends', 'list_friend_requests', 'create_group', 'rename_group', 'update_group_theme',
                                   'invite_to_group', 'cancel_group_invitation', 'respond_group_invitation', 'leave_group',
                                   'remove_group_member', 'transfer_group_ownership', 'delete_group', 'list_my_groups',
                                   'list_group_members', 'list_group_invitations', 'create_invite_link', 'redeem_invite_link',
                                   'list_notifications', 'mark_notifications_read', 'unread_notifications_count',
                                   'update_my_profile', 'get_user_profile', 'export_my_data', 'account_deletion_blockers',
                                   'prepare_account_deletion')) as functions_md5,
         -- tous les déclencheurs existants (toutes tables, tous schémas) hors les nôtres
         (select md5(coalesce(string_agg(pg_get_triggerdef(t.oid), E'\n' order by t.tgrelid::regclass::text, t.tgname), ''))
            from pg_trigger t
           where not t.tgisinternal and left(t.tgname, 9) <> 'trg_0023_') as triggers_md5;

-- ----------------------------------------------------------------------------
-- 1. Journal des actions limitées (private : jamais exposé par l'API)
-- ----------------------------------------------------------------------------
create table if not exists private.rate_events (
  id         bigint      generated always as identity primary key,
  user_id    uuid        not null references auth.users (id) on delete cascade,
  kind       text        not null check (kind in ('friend_request', 'group_invitation', 'export')),
  created_at timestamptz not null default now()
);
comment on table private.rate_events is 'Journal des actions soumises à une limite de débit (0023 CHOIX n° 6). Purgé au fil de l''eau (> 2 jours).';
create index if not exists rate_events_user_kind_idx on private.rate_events (user_id, kind, created_at);
alter table private.rate_events enable row level security;
revoke all on private.rate_events from public, anon, authenticated;

-- ----------------------------------------------------------------------------
-- 2. Aides internes (aucun droit pour l'API)
-- ----------------------------------------------------------------------------
-- Pseudonyme seulement (JAMAIS `profiles.name` : handle_new_user y recopie l'e-mail)
create or replace function private.display_name_of(p_user uuid)
returns text language sql stable security definer set search_path = '' as $$
  select p.display_name from public.profiles p where p.id = p_user
$$;

-- Crée une notification (horloge réelle : tri stable même au sein d'une transaction)
create or replace function private.notify(p_user uuid, p_type text, p_payload jsonb)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_user is null then return; end if;
  insert into public.notifications (user_id, type, payload, created_at)
  values (p_user, p_type, jsonb_strip_nulls(coalesce(p_payload, '{}'::jsonb)), clock_timestamp());
end $$;

-- Limite de débit : au plus p_max actions de ce genre par 24 h glissantes pour la personne connectée.
-- Compte l'action courante. Sans auth.uid() (service, migrations) : sans effet.
create or replace function private.check_rate_limit(p_kind text, p_max int, p_message text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_me uuid := (select auth.uid());
  n    int;
begin
  if v_me is null then return; end if;
  -- verrou consultatif par personne et par genre, tenu jusqu'à la fin de la transaction : sans lui, deux appels parallèles
  -- comptent tous deux « n » avant que l'autre n'ait inséré et dépassent la limite (relecture de sécurité n° 2)
  perform pg_advisory_xact_lock(hashtextextended(v_me::text || ':' || p_kind, 0));
  delete from private.rate_events where user_id = v_me and created_at < now() - interval '2 days';
  select count(*) into n from private.rate_events
   where user_id = v_me and kind = p_kind and created_at > now() - interval '1 day';
  if n >= p_max then
    raise exception '%', p_message using errcode = '54000';
  end if;
  insert into private.rate_events (user_id, kind) values (v_me, p_kind);
end $$;

-- Exige que la personne connectée soit le créateur du groupe (P0002 si elle n'en est pas membre : on ne révèle rien)
create or replace function private.require_group_creator(p_group uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_me uuid := (select auth.uid());
begin
  if v_me is null then
    raise exception 'Connexion requise' using errcode = '42501';
  end if;
  if p_group is null or not exists (select 1 from public.group_members m where m.group_id = p_group and m.user_id = v_me) then
    raise exception 'Groupe introuvable' using errcode = 'P0002';
  end if;
  if not exists (select 1 from public.groups g where g.id = p_group and g.created_by = v_me) then
    raise exception 'Réservé au créateur du groupe' using errcode = '42501';
  end if;
  -- verrou sur le groupe jusqu'à la fin de la transaction : un transfert, un départ, un retrait et une invitation ne
  -- s'exécutent jamais en parallèle sur le même groupe. Si le rôle de créateur a été transféré entre-temps (on a attendu le
  -- verrou), le groupe est « introuvable » pour l'ancien créateur.
  perform 1 from public.groups g where g.id = p_group and g.created_by = v_me for update;
  if not found then
    raise exception 'Groupe introuvable' using errcode = 'P0002';
  end if;
end $$;

-- Niveau d'UNE personne donnée sur une recette (reprend private.recipe_level de 0019, qui lit auth.uid()) :
-- 0 aucun · 1 read · 2 copy · 3 edit_original · 4 auteur. Sert aux notifications (le déclencheur n'agit pas « en tant que »
-- le détenteur). À garder identique à recipe_level (test_0023 les compare).
create or replace function private.level_of(p_user uuid, p_recipe uuid)
returns int language sql stable security definer set search_path = '' as $$
  select coalesce(max(lvl), 0) from (
    select 4 as lvl from public.recipes r where r.id = p_recipe and r.owner_id = p_user
    union all
    select private.permission_rank(g.permission)
      from public.recipe_grants g
     where g.recipe_id = p_recipe
       and (g.grantee_user_id = p_user
            or g.grantee_group_id in (select m.group_id from public.group_members m where m.user_id = p_user))
    union all
    select 2 from public.recipes r
     where r.id = p_recipe and r.visibility = 'groups' and r.owner_id is not null
       and exists (select 1 from public.group_members a
                     join public.group_members b on b.group_id = a.group_id
                    where a.user_id = r.owner_id and b.user_id = p_user)
  ) s
$$;

revoke execute on function private.display_name_of(uuid), private.notify(uuid, text, jsonb),
                           private.check_rate_limit(text, int, text), private.require_group_creator(uuid),
                           private.level_of(uuid, uuid) from public, anon, authenticated;

-- ----------------------------------------------------------------------------
-- 3. Amis
-- ----------------------------------------------------------------------------
create or replace function public.send_friend_request(p_user uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me  uuid := (select auth.uid());
  v_row public.friendships%rowtype;
  v_id  uuid;
begin
  if v_me is null then
    raise exception 'Connexion requise' using errcode = '42501';
  end if;
  if p_user is null then
    raise exception 'Indiquez la personne' using errcode = '22023';
  end if;
  if p_user = v_me then
    raise exception 'Vous ne pouvez pas vous ajouter vous-même' using errcode = '22023';
  end if;
  if not exists (select 1 from public.profiles p where p.id = p_user) then
    raise exception 'Personne introuvable' using errcode = 'P0002';
  end if;

  select * into v_row from public.friendships f
   where least(f.requester_id, f.addressee_id) = least(v_me, p_user)
     and greatest(f.requester_id, f.addressee_id) = greatest(v_me, p_user)
   for update;

  if not found then
    insert into public.friendships (requester_id, addressee_id) values (v_me, p_user) returning id into v_id;
  elsif v_row.status = 'accepted' then
    v_id := v_row.id;                       -- déjà amis : idempotent
  elsif v_row.status = 'pending' then
    if v_row.requester_id <> v_me then
      raise exception 'Cette personne vous a déjà envoyé une demande : répondez-y' using errcode = '22023';
    end if;
    v_id := v_row.id;                       -- déjà demandée : idempotent, pas de nouvelle notification
  else
    -- refusée : la personne qui avait refusé peut demander à son tour ; le demandeur peut relancer (délai de 7 jours,
    -- appliqué par le déclencheur trg_0023_friendships_before)
    update public.friendships
       set requester_id = v_me, addressee_id = p_user, status = 'pending', responded_at = null
     where id = v_row.id
    returning id into v_id;
  end if;
  return v_id;
end;
$$;
comment on function public.send_friend_request(uuid) is
  'Demande d''ami (idempotente). Après un refus : la personne qui a refusé peut demander à son tour ; le demandeur peut relancer une fois par 7 jours. 20 demandes par jour (SQLSTATE 54000). Notifie le destinataire. 0023.';

create or replace function public.respond_friend_request(p_id uuid, p_accept boolean)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me  uuid := (select auth.uid());
  v_row public.friendships%rowtype;
  v_status text;
begin
  if v_me is null then
    raise exception 'Connexion requise' using errcode = '42501';
  end if;
  if p_accept is null then
    raise exception 'Indiquez si vous acceptez' using errcode = '22023';
  end if;
  select * into v_row from public.friendships f where f.id = p_id for update;
  if not found or (v_row.requester_id <> v_me and v_row.addressee_id <> v_me) then
    raise exception 'Demande introuvable' using errcode = 'P0002';
  end if;
  if v_row.addressee_id <> v_me then
    raise exception 'Seul le destinataire peut répondre à une demande' using errcode = '42501';
  end if;
  if v_row.status <> 'pending' then
    raise exception 'Demande déjà traitée' using errcode = '22023';
  end if;
  v_status := case when p_accept then 'accepted' else 'declined' end;
  update public.friendships set status = v_status, responded_at = now() where id = p_id;
  return v_status;
end;
$$;
comment on function public.respond_friend_request(uuid, boolean) is
  'Le destinataire accepte (notifie le demandeur) ou refuse (aucune notification) une demande en attente. Renvoie le nouveau statut. 0023.';

create or replace function public.cancel_friend_request(p_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := (select auth.uid());
  n    integer;
begin
  if v_me is null then
    raise exception 'Connexion requise' using errcode = '42501';
  end if;
  delete from public.friendships f
   where f.id = p_id and f.requester_id = v_me and f.status = 'pending';
  get diagnostics n = row_count;
  return n > 0;
end;
$$;
comment on function public.cancel_friend_request(uuid) is
  'Le demandeur retire sa demande en attente (la notification non lue du destinataire disparaît). true si retirée, false sinon (inconnue ou non permise, sans distinction). Ne remet pas à zéro la limite quotidienne. 0023.';

create or replace function public.remove_friend(p_user uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := (select auth.uid());
  n    integer;
begin
  if v_me is null then
    raise exception 'Connexion requise' using errcode = '42501';
  end if;
  -- le déclencheur trg_friendship_removed (0019) retire les droits directs entre les deux s'ils ne partagent aucun groupe
  delete from public.friendships f
   where f.status = 'accepted'
     and ((f.requester_id = v_me and f.addressee_id = p_user) or (f.requester_id = p_user and f.addressee_id = v_me));
  get diagnostics n = row_count;
  return n > 0;
end;
$$;
comment on function public.remove_friend(uuid) is
  'Met fin à une amitié (la ligne est supprimée : chacun peut redemander). Le déclencheur de 0019 retire les droits directs entre les deux personnes s''ils ne partagent aucun groupe. true si une amitié a été retirée. 0023.';

create or replace function public.list_friends()
returns table (friendship_id uuid, user_id uuid, display_name text, cookbook_title text, since timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select f.id,
         o.id,
         o.display_name,
         o.cookbook_title,
         f.responded_at
    from public.friendships f
    join public.profiles o on o.id = case when f.requester_id = (select auth.uid()) then f.addressee_id else f.requester_id end
   where f.status = 'accepted'
     and (f.requester_id = (select auth.uid()) or f.addressee_id = (select auth.uid()))
   order by lower(o.display_name) nulls last, o.id
$$;
comment on function public.list_friends() is
  'Mes amis (pseudonyme et titre de carnet seulement, jamais d''e-mail). 0023.';

create or replace function public.list_friend_requests()
returns table (friendship_id uuid, direction text, user_id uuid, display_name text, status text,
               created_at timestamptz, retry_after timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select f.id,
         case when f.addressee_id = (select auth.uid()) then 'incoming' else 'outgoing' end,
         o.id,
         o.display_name,
         f.status,
         f.created_at,
         case when f.status = 'declined' then f.created_at + interval '168 hours' end
    from public.friendships f
    join public.profiles o on o.id = case when f.requester_id = (select auth.uid()) then f.addressee_id else f.requester_id end
   where (f.addressee_id = (select auth.uid()) and f.status = 'pending')
      or (f.requester_id = (select auth.uid()) and f.status in ('pending', 'declined'))
   order by f.created_at desc, f.id
$$;
comment on function public.list_friend_requests() is
  'Demandes reçues en attente (incoming) et demandes envoyées en attente ou refusées (outgoing ; retry_after = date à partir de laquelle on peut relancer). Pseudonymes seulement. 0023.';

-- ----------------------------------------------------------------------------
-- 4. Déclencheurs des amitiés : limite, délai de relance, notifications
-- ----------------------------------------------------------------------------
create or replace function private.trg_friendships_before()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_me   uuid := (select auth.uid());
  v_days int;
begin
  if v_me is null then return new; end if;     -- service, migrations, remplissage : sans limite
  if tg_op = 'INSERT' then
    if new.status = 'pending' and new.requester_id = v_me then
      perform private.check_rate_limit('friend_request', 20, 'Limite atteinte : 20 demandes d''ami par jour. Réessayez demain.');
    end if;
  elsif old.status = 'declined' and new.status = 'pending' then
    -- nouvelle demande sur une ligne refusée. Le demandeur d'origine attend 7 jours après sa dernière demande ;
    -- l'autre personne (qui avait refusé) peut demander tout de suite. (168 h et non « 7 days » : pas de dérive aux changements d'heure)
    if new.requester_id = old.requester_id and old.created_at > now() - interval '168 hours' then
      v_days := greatest(1, ceil(extract(epoch from (old.created_at + interval '168 hours' - now())) / 86400)::int);
      raise exception 'Demande déjà refusée : vous pourrez la renouveler dans % jour(s)', v_days using errcode = '22023';
    end if;
    perform private.check_rate_limit('friend_request', 20, 'Limite atteinte : 20 demandes d''ami par jour. Réessayez demain.');
    new.created_at := now();                    -- la date de la dernière demande fait foi pour le délai de 7 jours
  end if;
  return new;
end $$;
drop trigger if exists trg_0023_friendships_before on public.friendships;
create trigger trg_0023_friendships_before before insert or update on public.friendships
  for each row execute function private.trg_friendships_before();

create or replace function private.trg_friendships_notify()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    if new.status = 'pending' then
      perform private.notify(new.addressee_id, 'friend_request', jsonb_build_object(
        'friendship_id', new.id, 'from_user_id', new.requester_id, 'from_name', private.display_name_of(new.requester_id)));
    end if;
  elsif old.status = 'declined' and new.status = 'pending' then
    perform private.notify(new.addressee_id, 'friend_request', jsonb_build_object(
      'friendship_id', new.id, 'from_user_id', new.requester_id, 'from_name', private.display_name_of(new.requester_id)));
  elsif old.status = 'pending' and new.status = 'accepted' then
    perform private.notify(new.requester_id, 'friend_accepted', jsonb_build_object(
      'friendship_id', new.id, 'user_id', new.addressee_id, 'name', private.display_name_of(new.addressee_id)));
  end if;
  return new;
end $$;
drop trigger if exists trg_0023_friendships_notify on public.friendships;
create trigger trg_0023_friendships_notify after insert or update on public.friendships
  for each row execute function private.trg_friendships_notify();

-- Demande annulée : la notification non lue du destinataire disparaît
create or replace function private.trg_friendships_cleanup()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if old.status = 'pending' then
    delete from public.notifications n
     where n.user_id = old.addressee_id and n.type = 'friend_request' and n.read_at is null
       and n.payload ->> 'friendship_id' = old.id::text;
  end if;
  return old;
end $$;
drop trigger if exists trg_0023_friendships_cleanup on public.friendships;
create trigger trg_0023_friendships_cleanup after delete on public.friendships
  for each row execute function private.trg_friendships_cleanup();

-- ----------------------------------------------------------------------------
-- 5. Groupes
-- ----------------------------------------------------------------------------
create or replace function public.create_group(p_name text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me   uuid := (select auth.uid());
  v_name text := btrim(coalesce(p_name, ''));
  v_id   uuid;
begin
  if v_me is null then
    raise exception 'Connexion requise' using errcode = '42501';
  end if;
  if char_length(v_name) not between 1 and 60 then
    raise exception 'Le nom du groupe doit faire de 1 à 60 caractères' using errcode = '22023';
  end if;
  -- atomique : le groupe ET la ligne « creator » dans la même transaction
  insert into public.groups (name, created_by) values (v_name, v_me) returning id into v_id;
  insert into public.group_members (group_id, user_id, role) values (v_id, v_me, 'creator');
  return v_id;
end;
$$;
comment on function public.create_group(text) is
  'Crée un groupe dont l''appelant est le créateur (groupe + ligne creator, atomique). Renvoie l''id. 0023.';

create or replace function public.rename_group(p_group uuid, p_name text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_name text := btrim(coalesce(p_name, ''));
begin
  perform private.require_group_creator(p_group);
  if char_length(v_name) not between 1 and 60 then
    raise exception 'Le nom du groupe doit faire de 1 à 60 caractères' using errcode = '22023';
  end if;
  update public.groups set name = v_name where id = p_group;
end;
$$;
comment on function public.rename_group(uuid, text) is 'Renomme un groupe (créateur seulement). 0023.';

create or replace function public.update_group_theme(p_group uuid, p_theme jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_group_creator(p_group);
  if p_theme is null or jsonb_typeof(p_theme) <> 'object' then
    raise exception 'Le thème doit être un objet JSON' using errcode = '22023';
  end if;
  if char_length(p_theme::text) > 4000 then
    raise exception 'Thème trop volumineux (4000 caractères au plus)' using errcode = '22023';
  end if;
  update public.groups set theme = p_theme where id = p_group;
end;
$$;
comment on function public.update_group_theme(uuid, jsonb) is
  'Remplace le thème du groupe (créateur seulement) ; objet JSON de 4000 caractères au plus, la forme est validée côté application (Zod). 0023.';

create or replace function public.invite_to_group(p_group uuid, p_user uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := (select auth.uid());
  v_id uuid;
begin
  perform private.require_group_creator(p_group);
  if p_user is null then
    raise exception 'Indiquez la personne à inviter' using errcode = '22023';
  end if;
  if p_user = v_me then
    raise exception 'Vous êtes déjà dans ce groupe' using errcode = '22023';
  end if;
  if not exists (select 1 from public.profiles p where p.id = p_user) then
    raise exception 'Personne introuvable' using errcode = 'P0002';
  end if;
  if exists (select 1 from public.group_members m where m.group_id = p_group and m.user_id = p_user) then
    raise exception 'Cette personne est déjà dans le groupe' using errcode = '22023';
  end if;

  -- une invitation en attente mais périmée est close (l'index unique « une seule en attente » la compte encore)
  update public.invitations
     set status = 'expired', responded_at = now()
   where group_id = p_group and target_user_id = p_user and kind = 'group' and status = 'pending' and expires_at <= now();

  select i.id into v_id from public.invitations i
   where i.group_id = p_group and i.target_user_id = p_user and i.kind = 'group' and i.status = 'pending';
  if found then
    return v_id;                            -- idempotent : déjà invitée, pas de nouvelle notification
  end if;

  if exists (select 1 from public.invitations i
              where i.group_id = p_group and i.target_user_id = p_user and i.kind = 'group'
                and i.status = 'declined' and i.responded_at > now() - interval '7 days') then
    raise exception 'Cette personne a refusé l''invitation récemment : réessayez dans quelques jours' using errcode = '22023';
  end if;

  insert into public.invitations (kind, inviter_id, target_user_id, group_id)
  values ('group', v_me, p_user, p_group)
  returning id into v_id;                   -- le déclencheur applique la limite et notifie
  return v_id;
end;
$$;
comment on function public.invite_to_group(uuid, uuid) is
  'Le CRÉATEUR invite une personne (invitation à accepter, valable 30 jours). Idempotente tant qu''elle est en attente ; refusée récemment : 7 jours d''attente. 20 invitations par jour (54000). Notifie la personne. 0023.';

create or replace function public.create_invite_link(p_group uuid)
returns table (invitation_id uuid, token text, expires_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me    uuid := (select auth.uid());
  v_token text := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
  v_id    uuid;
  v_exp   timestamptz := now() + interval '7 days';
begin
  perform private.require_group_creator(p_group);
  insert into public.invitations (kind, inviter_id, group_id, token_hash, expires_at)
  values ('group', v_me, p_group, encode(sha256(convert_to(v_token, 'UTF8')), 'hex'), v_exp)
  returning id into v_id;
  -- le jeton en clair n'est renvoyé qu'ici ; seule son empreinte est stockée
  return query select v_id, v_token, v_exp;
end;
$$;
comment on function public.create_invite_link(uuid) is
  'Le CRÉATEUR crée un lien d''invitation à usage unique valable 7 jours. Le jeton en clair (64 caractères hexadécimaux) n''est renvoyé que par cet appel ; seule son empreinte SHA-256 est stockée. Compte dans les 20 invitations par jour. 0023.';

create or replace function public.redeem_invite_link(p_token text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me  uuid := (select auth.uid());
  v_inv public.invitations%rowtype;
begin
  if v_me is null then
    raise exception 'Connexion requise' using errcode = '42501';
  end if;
  select * into v_inv from public.invitations i
   where i.token_hash = encode(sha256(convert_to(btrim(coalesce(p_token, '')), 'UTF8')), 'hex')
   for update;
  -- l'invitation doit avoir été émise par le créateur ACTUEL du groupe (un ex-créateur n'invite plus) ; même message
  -- que pour un jeton inconnu
  if not found or v_inv.kind <> 'group' or v_inv.status <> 'pending' or v_inv.expires_at <= now()
     or not exists (select 1 from public.groups g where g.id = v_inv.group_id and g.created_by = v_inv.inviter_id) then
    raise exception 'Lien d''invitation invalide ou expiré' using errcode = 'P0002';
  end if;
  if v_inv.inviter_id = v_me then
    raise exception 'Vous ne pouvez pas utiliser votre propre lien' using errcode = '22023';
  end if;
  if exists (select 1 from public.group_members m where m.group_id = v_inv.group_id and m.user_id = v_me) then
    return v_inv.group_id;                  -- déjà membre : le lien n'est pas consommé
  end if;
  insert into public.group_members (group_id, user_id, role) values (v_inv.group_id, v_me, 'member');
  update public.invitations set target_user_id = v_me, status = 'accepted', responded_at = now() where id = v_inv.id;
  return v_inv.group_id;
end;
$$;
comment on function public.redeem_invite_link(text) is
  'Rejoint le groupe d''un lien d''invitation (usage unique ; jeton inconnu, consommé ou expiré : même message). Aucune recette n''est ajoutée au carnet. Notifie le créateur. 0023.';

create or replace function public.cancel_group_invitation(p_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := (select auth.uid());
  n    integer;
begin
  if v_me is null then
    raise exception 'Connexion requise' using errcode = '42501';
  end if;
  update public.invitations i
     set status = 'cancelled', responded_at = now()
   where i.id = p_id and i.kind = 'group' and i.status = 'pending'
     and exists (select 1 from public.groups g where g.id = i.group_id and g.created_by = v_me);
  get diagnostics n = row_count;
  return n > 0;
end;
$$;
comment on function public.cancel_group_invitation(uuid) is
  'Le créateur annule une invitation (personne ou lien) en attente. true si annulée, false sinon. 0023.';

create or replace function public.respond_group_invitation(p_id uuid, p_accept boolean)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me  uuid := (select auth.uid());
  v_inv public.invitations%rowtype;
begin
  if v_me is null then
    raise exception 'Connexion requise' using errcode = '42501';
  end if;
  if p_accept is null then
    raise exception 'Indiquez si vous acceptez' using errcode = '22023';
  end if;
  select * into v_inv from public.invitations i where i.id = p_id for update;
  if not found or v_inv.kind <> 'group' or v_inv.target_user_id is distinct from v_me
     or not exists (select 1 from public.groups g where g.id = v_inv.group_id and g.created_by = v_inv.inviter_id) then
    raise exception 'Invitation introuvable' using errcode = 'P0002';   -- inconnue, ou émise par un ex-créateur du groupe
  end if;
  if v_inv.status <> 'pending' then
    raise exception 'Invitation déjà traitée' using errcode = '22023';
  end if;
  if v_inv.expires_at <= now() then
    raise exception 'Invitation expirée' using errcode = '22023';
  end if;

  if p_accept then
    -- rejoindre comme `member` (le déclencheur de 0019 passe l'invitation à « accepted » et notifie le créateur) ;
    -- aucune recette n'est ajoutée au carnet (clarification du 2026-10-24)
    insert into public.group_members (group_id, user_id, role) values (v_inv.group_id, v_me, 'member')
    on conflict (group_id, user_id) do nothing;
    update public.invitations set status = 'accepted', responded_at = now() where id = p_id and status = 'pending';
    return 'accepted';
  end if;
  update public.invitations set status = 'declined', responded_at = now() where id = p_id;
  return 'declined';
end;
$$;
comment on function public.respond_group_invitation(uuid, boolean) is
  'La personne invitée accepte (elle rejoint le groupe ; aucune recette n''est ajoutée à son carnet ; le créateur est prévenu) ou refuse (aucune notification). Renvoie le nouveau statut. 0023.';

create or replace function public.leave_group(p_group uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me   uuid := (select auth.uid());
  v_role text;
begin
  if v_me is null then
    raise exception 'Connexion requise' using errcode = '42501';
  end if;
  -- verrou AVANT de lire le rôle : sinon un transfert en cours qui fait de moi le créateur me laisserait partir et le
  -- groupe n'aurait plus de créateur
  if p_group is null or not exists (select 1 from public.group_members m where m.group_id = p_group and m.user_id = v_me) then
    raise exception 'Vous n''êtes pas dans ce groupe' using errcode = 'P0002';   -- sans verrou : un étranger ne bloque rien
  end if;
  perform 1 from public.groups where id = p_group for update;
  select m.role into v_role from public.group_members m where m.group_id = p_group and m.user_id = v_me;
  if not found then
    raise exception 'Vous n''êtes pas dans ce groupe' using errcode = 'P0002';
  end if;
  if v_role = 'creator' then
    raise exception 'Le créateur ne peut pas quitter le groupe : passez le rôle à un autre membre ou supprimez le groupe' using errcode = '22023';
  end if;
  -- les déclencheurs de 0019 retirent les repartages issus du groupe, les droits directs sans autre lien et le thème actif
  delete from public.group_members m where m.group_id = p_group and m.user_id = v_me;
end;
$$;
comment on function public.leave_group(uuid) is
  'Quitter un groupe (membre seulement ; le créateur transfère ou supprime). L''accès aux recettes partagées par ce groupe est perdu. 0023.';

create or replace function public.remove_group_member(p_group uuid, p_user uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me   uuid := (select auth.uid());
  v_name text;
  n      integer;
begin
  perform private.require_group_creator(p_group);
  if p_user is null or p_user = v_me then
    raise exception 'Pour partir, transférez le rôle de créateur ou supprimez le groupe' using errcode = '22023';
  end if;
  perform 1 from public.groups where id = p_group for update;       -- déjà verrouillé par require_group_creator ; explicite par prudence
  delete from public.group_members m where m.group_id = p_group and m.user_id = p_user and m.role = 'member';
  get diagnostics n = row_count;
  if n > 0 then
    select g.name into v_name from public.groups g where g.id = p_group;
    perform private.notify(p_user, 'group_member_removed', jsonb_build_object('group_id', p_group, 'group_name', v_name));
  end if;
  return n > 0;
end;
$$;
comment on function public.remove_group_member(uuid, uuid) is
  'Le créateur retire un membre (jamais lui-même). true si retiré ; la personne est prévenue. 0023.';

create or replace function public.transfer_group_ownership(p_group uuid, p_new_creator uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me   uuid := (select auth.uid());
  v_name text;
  n      integer;
begin
  perform private.require_group_creator(p_group);
  if p_new_creator is null or p_new_creator = v_me then
    raise exception 'Choisissez un autre membre du groupe' using errcode = '22023';
  end if;
  perform 1 from public.groups g where g.id = p_group for update;       -- verrou : un seul transfert à la fois
  if not exists (select 1 from public.group_members m
                  where m.group_id = p_group and m.user_id = p_new_creator and m.role = 'member') then
    raise exception 'Le nouveau créateur doit déjà être membre du groupe' using errcode = '22023';
  end if;
  -- même transaction : created_by ET les deux rôles (l'ancien d'abord : un seul « creator » par groupe)
  update public.group_members set role = 'member'  where group_id = p_group and user_id = v_me;
  update public.group_members set role = 'creator' where group_id = p_group and user_id = p_new_creator and role = 'member';
  get diagnostics n = row_count;
  if n <> 1 then
    raise exception 'Transfert impossible : le nouveau créateur n''est plus membre du groupe' using errcode = '55000';
  end if;
  update public.groups set created_by = p_new_creator where id = p_group returning name into v_name;
  -- les invitations en attente de l'ancien créateur ne sont plus acceptables (0019 n° 7) : annulées, le nouveau ré-invite
  update public.invitations set status = 'cancelled', responded_at = now()
   where group_id = p_group and kind = 'group' and status = 'pending';
  perform private.notify(p_new_creator, 'group_ownership_transferred', jsonb_build_object(
    'group_id', p_group, 'group_name', v_name, 'from_user_id', v_me, 'from_name', private.display_name_of(v_me)));
end;
$$;
comment on function public.transfer_group_ownership(uuid, uuid) is
  'Le créateur passe son rôle à un membre (atomique : created_by + les deux rôles). Annule les invitations en attente ; prévient le nouveau créateur. 0023.';

create or replace function public.delete_group(p_group uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me   uuid := (select auth.uid());
  v_name text;
  r      record;
begin
  perform private.require_group_creator(p_group);
  select g.name into v_name from public.groups g where g.id = p_group for update;
  for r in select m.user_id from public.group_members m where m.group_id = p_group and m.user_id <> v_me loop
    perform private.notify(r.user_id, 'group_deleted', jsonb_build_object('group_id', p_group, 'group_name', v_name));
  end loop;
  -- notifications d'invitation devenues sans objet
  delete from public.notifications n
   where n.type in ('group_invitation', 'group_invitation_accepted') and n.payload ->> 'group_id' = p_group::text and n.read_at is null;
  -- CASCADE : appartenances, invitations, droits donnés au groupe (et leurs repartages), thème actif (set null)
  delete from public.groups where id = p_group;
end;
$$;
comment on function public.delete_group(uuid) is
  'Supprime un groupe (créateur seulement). Cascade : appartenances, invitations, droits donnés au groupe et leurs repartages ; les recettes, copies et droits directs entre personnes restent. Chaque membre est prévenu. 0023.';

create or replace function public.list_my_groups()
returns table (group_id uuid, name text, theme jsonb, role text, creator_name text, member_count integer,
               joined_at timestamptz, created_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select g.id, g.name, g.theme, m.role, private.display_name_of(g.created_by),
         (select count(*)::integer from public.group_members x where x.group_id = g.id),
         m.created_at, g.created_at
    from public.group_members m
    join public.groups g on g.id = m.group_id
   where m.user_id = (select auth.uid())
   order by lower(g.name), g.id
$$;
comment on function public.list_my_groups() is
  'Mes groupes (nom, thème, mon rôle, pseudonyme du créateur, nombre de membres). 0023.';

create or replace function public.list_group_members(p_group uuid)
returns table (user_id uuid, display_name text, role text, joined_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'Connexion requise' using errcode = '42501';
  end if;
  if p_group is null or not exists (select 1 from public.group_members m
                                     where m.group_id = p_group and m.user_id = (select auth.uid())) then
    raise exception 'Groupe introuvable' using errcode = 'P0002';
  end if;
  return query
    select m.user_id, p.display_name, m.role, m.created_at
      from public.group_members m
      left join public.profiles p on p.id = m.user_id
     where m.group_id = p_group
     order by (m.role = 'creator') desc, lower(p.display_name) nulls last, m.user_id;
end;
$$;
comment on function public.list_group_members(uuid) is
  'Membres d''un groupe dont je fais partie (pseudonyme et rôle seulement, jamais d''e-mail). 0023.';

create or replace function public.list_group_invitations()
returns table (invitation_id uuid, direction text, group_id uuid, group_name text, user_id uuid, display_name text,
               channel text, created_at timestamptz, expires_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select i.id,
         case when i.target_user_id = (select auth.uid()) then 'received' else 'sent' end,
         i.group_id,
         g.name,
         o.id,
         o.display_name,
         case when i.target_user_id is not null then 'user' when i.target_email is not null then 'email' else 'link' end,
         i.created_at,
         i.expires_at
    from public.invitations i
    join public.groups g on g.id = i.group_id
    left join public.profiles o
           on o.id = case when i.target_user_id = (select auth.uid()) then i.inviter_id else i.target_user_id end
   where i.kind = 'group' and i.status = 'pending' and i.expires_at > now()
     and (i.target_user_id = (select auth.uid()) or g.created_by = (select auth.uid()))
   order by i.created_at desc, i.id
$$;
comment on function public.list_group_invitations() is
  'Invitations de groupe en attente : reçues par moi (direction received, user = l''invitant) et, pour les groupes que je crée, envoyées (sent, user = la personne invitée ; NULL pour un lien). Jamais d''e-mail ni de jeton. 0023.';

-- ----------------------------------------------------------------------------
-- 6. Déclencheurs des invitations et des droits : limites et notifications
-- ----------------------------------------------------------------------------
create or replace function private.trg_invitations_before()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.uid()) is not null and new.inviter_id = (select auth.uid()) then
    perform private.check_rate_limit('group_invitation', 20, 'Limite atteinte : 20 invitations par jour. Réessayez demain.');
  end if;
  return new;
end $$;
drop trigger if exists trg_0023_invitations_before on public.invitations;
create trigger trg_0023_invitations_before before insert on public.invitations
  for each row execute function private.trg_invitations_before();

create or replace function private.trg_invitations_notify()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_group record;
begin
  if new.kind <> 'group' then return new; end if;
  select g.name, g.created_by into v_group from public.groups g where g.id = new.group_id;
  if tg_op = 'INSERT' then
    if new.status = 'pending' and new.target_user_id is not null then
      perform private.notify(new.target_user_id, 'group_invitation', jsonb_build_object(
        'invitation_id', new.id, 'group_id', new.group_id, 'group_name', v_group.name,
        'from_user_id', new.inviter_id, 'from_name', private.display_name_of(new.inviter_id)));
    end if;
  elsif old.status = 'pending' and new.status = 'accepted' and new.target_user_id is not null then
    perform private.notify(v_group.created_by, 'group_invitation_accepted', jsonb_build_object(
      'invitation_id', new.id, 'group_id', new.group_id, 'group_name', v_group.name,
      'user_id', new.target_user_id, 'name', private.display_name_of(new.target_user_id)));
  elsif old.status = 'pending' and new.status = 'cancelled' and new.target_user_id is not null then
    delete from public.notifications n
     where n.user_id = new.target_user_id and n.type = 'group_invitation' and n.read_at is null
       and n.payload ->> 'invitation_id' = new.id::text;
  end if;
  return new;
end $$;
drop trigger if exists trg_0023_invitations_notify on public.invitations;
create trigger trg_0023_invitations_notify after insert or update of status on public.invitations
  for each row execute function private.trg_invitations_notify();

-- Droit direct ou repartage donné à une PERSONNE (grant_recipe / reshare_recipe de 0021, ou écriture directe)
create or replace function private.trg_grants_notify()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_title text;
begin
  if new.grantee_user_id is null or new.origin not in ('direct', 'reshare') then return new; end if;
  if tg_op = 'UPDATE' then
    if private.permission_rank(new.permission) <= private.permission_rank(old.permission) then return new; end if;
  end if;
  -- un doublon non lu pour la même recette est ignoré
  if exists (select 1 from public.notifications n
              where n.user_id = new.grantee_user_id and n.type = 'recipe_shared' and n.read_at is null
                and n.payload ->> 'recipe_id' = new.recipe_id::text) then
    return new;
  end if;
  select r.title into v_title from public.recipes r where r.id = new.recipe_id;
  perform private.notify(new.grantee_user_id, 'recipe_shared', jsonb_build_object(
    'recipe_id', new.recipe_id, 'title', v_title, 'permission', new.permission,
    'from_user_id', new.granted_by, 'from_name', private.display_name_of(new.granted_by)));
  return new;
end $$;
drop trigger if exists trg_0023_grants_notify on public.recipe_grants;
create trigger trg_0023_grants_notify after insert or update of permission on public.recipe_grants
  for each row execute function private.trg_grants_notify();

-- Signalements : 10 par jour et par personne (comptés sur reports.created_at)
create or replace function private.trg_reports_rate_limit()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.uid()) is null or new.reporter_id is distinct from (select auth.uid()) then return new; end if;
  perform pg_advisory_xact_lock(hashtextextended(new.reporter_id::text || ':report', 0));   -- même verrou que check_rate_limit
  if (select count(*) from public.reports r
           where r.reporter_id = new.reporter_id and r.created_at > now() - interval '1 day') >= 10 then
    raise exception 'Limite atteinte : 10 signalements par jour. Réessayez demain.' using errcode = '54000';
  end if;
  return new;
end $$;
drop trigger if exists trg_0023_reports_rate_limit on public.reports;
create trigger trg_0023_reports_rate_limit before insert on public.reports
  for each row execute function private.trg_reports_rate_limit();

-- Suppression d'une recette : les personnes qui l'avaient dans leur carnet (CHOIX n° 4)
create or replace function private.trg_recipes_notify_deleted()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  -- v1 : cookbook_entries est vide, ce test indexé est tout le coût
  if exists (select 1 from public.cookbook_entries e where e.recipe_id = old.id and e.user_id is distinct from old.owner_id) then
    insert into public.notifications (user_id, type, payload, created_at)
    select e.user_id, 'recipe_deleted',
           jsonb_strip_nulls(jsonb_build_object('recipe_id', old.id, 'title', old.title, 'author_id', old.owner_id,
                                                'author_name', private.display_name_of(old.owner_id))),
           clock_timestamp()
      from public.cookbook_entries e
      join auth.users u on u.id = e.user_id            -- pas de notification pour un compte en cours de suppression
     where e.recipe_id = old.id and e.user_id is distinct from old.owner_id
       and (private.level_of(e.user_id, old.id) >= 1     -- seulement ceux qui pouvaient encore la lire…
            or not exists (select 1 from auth.users o where o.id = old.owner_id));   -- …sauf suppression du COMPTE de l'auteur (ses appartenances
                                                                                      -- de groupe sont déjà parties en cascade : le droit implicite aussi)
  end if;
  return old;
end $$;
drop trigger if exists trg_0023_recipe_deleted on public.recipes;
create trigger trg_0023_recipe_deleted before delete on public.recipes
  for each row execute function private.trg_recipes_notify_deleted();

-- Pseudonyme : pas d'« @ », pas de caractère de contrôle, de format ni invisible, pas d'espace autre que U+0020, pas de
-- mélange latin + cyrillique / grec (homoglyphes), pas de doublon sur la forme NORMALISÉE (NFKC, minuscules, sans accents).
-- PostgreSQL n'a pas de classes Unicode (\p{Cf}) : les plages sont écrites en clair (\uXXXX).
create or replace function private.trg_profiles_guard_display_name()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_norm text;
begin
  if new.display_name is null then return new; end if;
  if tg_op = 'UPDATE' and new.display_name is not distinct from old.display_name then return new; end if;
  if (select auth.uid()) is null then return new; end if;     -- service, migrations, remplissage 0018 (qui a ses propres contrôles)
  new.display_name := btrim(new.display_name);
  if position('@' in new.display_name) > 0 then
    raise exception 'Le pseudonyme ne peut pas contenir « @ » (jamais d''adresse e-mail affichée)' using errcode = '22023';
  end if;
  if new.display_name ~ '[[:cntrl:]]' then
    raise exception 'Le pseudonyme contient un caractère interdit' using errcode = '22023';
  end if;
  -- format (Cf), séparateurs de ligne / paragraphe (Zl, Zp), espaces autres que U+0020 (Zs, NEL), caractères invisibles
  -- (jonction de graphèmes, remplisseurs hangul, braille vide, sélecteurs de variation)
  if new.display_name ~ ('[\u0085\u00A0\u00AD\u034F\u0600-\u0605\u061C\u06DD\u070F\u0890\u0891\u08E2\u115F\u1160\u1680\u17B4\u17B5'
                        || '\u180B-\u180F\u2000-\u200F\u2028-\u202F\u205F-\u2064\u2066-\u206F\u2800\u3000\u3164'
                        || '\uFE00-\uFE0F\uFEFF\uFFA0\uFFF9-\uFFFB\U000110BD\U000110CD\U0001BCA0-\U0001BCA3'
                        || '\U00013430-\U0001343F\U0001D173-\U0001D17A\U000E0001\U000E0020-\U000E007F\U000E0100-\U000E01EF]') then
    raise exception 'Le pseudonyme contient un caractère invisible, de mise en forme ou une espace spéciale' using errcode = '22023';
  end if;
  v_norm := normalize(new.display_name, NFKC);
  -- latin + cyrillique, ou latin + grec, dans un même pseudonyme : refusé (« Nіna » avec un і cyrillique)
  if v_norm ~ '[A-Za-z\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u024F\u1E00-\u1EFF]'
     and v_norm ~ '[\u0370-\u03FF\u0400-\u052F\u1C80-\u1C8F\u1F00-\u1FFF\u2DE0-\u2DFF\uA640-\uA69F]' then
    raise exception 'Le pseudonyme ne peut pas mélanger l''alphabet latin avec le cyrillique ou le grec' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtext('recettes:display_name'));
  if exists (select 1 from public.profiles p
              where p.id <> new.id and p.display_name is not null
                and lower(public.immutable_unaccent(normalize(p.display_name, NFKC))) = lower(public.immutable_unaccent(v_norm))) then
    raise exception 'Ce pseudonyme est déjà pris' using errcode = '22023';
  end if;
  return new;
end $$;
drop trigger if exists trg_0023_profiles_display_name on public.profiles;
create trigger trg_0023_profiles_display_name before insert or update of display_name on public.profiles
  for each row execute function private.trg_profiles_guard_display_name();

revoke execute on function private.trg_friendships_before(), private.trg_friendships_notify(), private.trg_friendships_cleanup(),
                           private.trg_invitations_before(), private.trg_invitations_notify(), private.trg_grants_notify(),
                           private.trg_reports_rate_limit(), private.trg_recipes_notify_deleted(),
                           private.trg_profiles_guard_display_name() from public, anon, authenticated;

-- ----------------------------------------------------------------------------
-- 7. Notifications
-- ----------------------------------------------------------------------------
create or replace function public.list_notifications(p_limit int default 30, p_before timestamptz default null)
returns table (id uuid, type text, payload jsonb, read_at timestamptz, created_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select n.id, n.type, n.payload, n.read_at, n.created_at
    from public.notifications n
   where n.user_id = (select auth.uid())
     and (p_before is null or n.created_at < p_before)
   order by n.created_at desc, n.id desc
   limit greatest(1, least(coalesce(p_limit, 30), 100))
$$;
comment on function public.list_notifications(int, timestamptz) is
  'Mes notifications, les plus récentes d''abord ; pagination : p_before = created_at de la dernière reçue. 1 à 100 par page. Payload : identifiants, pseudonymes, titres. 0023.';

create or replace function public.mark_notifications_read(p_ids uuid[] default null)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := (select auth.uid());
  n    integer;
begin
  if v_me is null then
    raise exception 'Connexion requise' using errcode = '42501';
  end if;
  update public.notifications x
     set read_at = now()
   where x.user_id = v_me and x.read_at is null
     and (p_ids is null or x.id = any (p_ids));
  get diagnostics n = row_count;
  return n;
end;
$$;
comment on function public.mark_notifications_read(uuid[]) is
  'Marque comme lues les notifications indiquées (les miennes seulement) ou, sans argument, toutes. Renvoie le nombre marqué. 0023.';

create or replace function public.unread_notifications_count()
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::integer from public.notifications n
   where n.user_id = (select auth.uid()) and n.read_at is null
$$;
comment on function public.unread_notifications_count() is 'Nombre de mes notifications non lues (pastille de la cloche). 0023.';

-- ----------------------------------------------------------------------------
-- 8. Profil
-- ----------------------------------------------------------------------------
create or replace function public.update_my_profile(
  p_display_name          text    default null,
  p_cookbook_title        text    default null,
  p_discoverable          boolean default null,
  p_theme_settings        jsonb   default null,
  p_active_theme_group_id uuid    default null,
  p_personal_theme        boolean default false
)
returns table (display_name text, cookbook_title text, discoverable boolean, theme_settings jsonb, active_theme_group_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me    uuid := (select auth.uid());
  v_name  text;
  v_title text;
begin
  if v_me is null then
    raise exception 'Connexion requise' using errcode = '42501';
  end if;
  if not exists (select 1 from public.profiles p where p.id = v_me) then
    raise exception 'Profil introuvable' using errcode = 'P0002';
  end if;
  if p_display_name is not null then
    v_name := btrim(p_display_name);
    if char_length(v_name) not between 1 and 60 then
      raise exception 'Le pseudonyme doit faire de 1 à 60 caractères' using errcode = '22023';
    end if;
  end if;
  if p_cookbook_title is not null then
    v_title := nullif(btrim(p_cookbook_title), '');
    if char_length(coalesce(v_title, '')) > 80 then
      raise exception 'Le titre du carnet doit faire 80 caractères au plus' using errcode = '22023';
    end if;
  end if;
  if p_theme_settings is not null then
    if jsonb_typeof(p_theme_settings) <> 'object' then
      raise exception 'Le thème doit être un objet JSON' using errcode = '22023';
    end if;
    if char_length(p_theme_settings::text) > 4000 then
      raise exception 'Thème trop volumineux (4000 caractères au plus)' using errcode = '22023';
    end if;
  end if;
  if p_personal_theme and p_active_theme_group_id is not null then
    raise exception 'Choisissez un groupe OU le thème personnel' using errcode = '22023';
  end if;
  if p_active_theme_group_id is not null and not exists (
       select 1 from public.group_members m where m.group_id = p_active_theme_group_id and m.user_id = v_me) then
    raise exception 'Le thème actif doit être celui d''un groupe dont vous êtes membre' using errcode = '42501';
  end if;

  -- le déclencheur trg_0023_profiles_display_name applique « @ » et doublon ; trg_profiles_guard_active_theme (0019) le groupe
  update public.profiles p
     set display_name          = coalesce(v_name, p.display_name),
         cookbook_title        = case when p_cookbook_title is null then p.cookbook_title else v_title end,
         discoverable          = coalesce(p_discoverable, p.discoverable),
         theme_settings        = case when p_theme_settings is null then p.theme_settings
                                      when p_theme_settings = '{}'::jsonb then null else p_theme_settings end,
         active_theme_group_id = case when p_personal_theme then null
                                      else coalesce(p_active_theme_group_id, p.active_theme_group_id) end
   where p.id = v_me;

  return query
    select p.display_name, p.cookbook_title, p.discoverable, p.theme_settings, p.active_theme_group_id
      from public.profiles p where p.id = v_me;
end;
$$;
comment on function public.update_my_profile(text, text, boolean, jsonb, uuid, boolean) is
  'Met à jour MON profil (paramètre NULL = inchangé ; titre '''' = effacer ; thème ''{}'' = effacer ; p_personal_theme => true = thème personnel). Pseudonyme 1-60 caractères, sans « @ », unique ; titre ≤ 80 ; thème objet ≤ 4000 caractères ; thème actif = un de mes groupes. Renvoie les valeurs enregistrées. 0023.';

create or replace function public.get_user_profile(p_user uuid)
returns table (user_id uuid, display_name text, cookbook_title text, is_self boolean, friendship_status text,
               friendship_id uuid, common_groups jsonb, readable_recipe_count integer)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_me uuid := (select auth.uid());
  v_f  public.friendships%rowtype;
  v_status text := 'none';
begin
  if v_me is null then
    raise exception 'Connexion requise' using errcode = '42501';
  end if;
  if p_user is null or not private.can_see_profile(p_user) then
    return;                                  -- aucune ligne : on ne distingue pas « inconnu » et « invisible »
  end if;
  select * into v_f from public.friendships f
   where least(f.requester_id, f.addressee_id) = least(v_me, p_user)
     and greatest(f.requester_id, f.addressee_id) = greatest(v_me, p_user);
  if found then
    v_status := case
      when v_f.status = 'accepted' then 'friends'
      when v_f.status = 'pending' and v_f.requester_id = v_me then 'request_sent'
      when v_f.status = 'pending' then 'request_received'
      when v_f.requester_id = v_me then 'request_declined'
      else 'none' end;
  end if;
  return query
    select p.id, p.display_name, p.cookbook_title, p.id = v_me, v_status,
           case when v_status = 'none' then null else v_f.id end,
           coalesce((select jsonb_agg(jsonb_build_object('id', g.id, 'name', g.name) order by lower(g.name))
                       from public.group_members a
                       join public.group_members b on b.group_id = a.group_id
                       join public.groups g on g.id = a.group_id
                      where a.user_id = v_me and b.user_id = p_user and p_user <> v_me), '[]'::jsonb),
           (select count(*)::integer from public.recipes r
             where r.owner_id = p_user and p_user <> v_me and private.recipe_level(r.id) >= 1)
      from public.profiles p where p.id = p_user;
end;
$$;
comment on function public.get_user_profile(uuid) is
  'Profil public d''une personne que je peux déjà voir : pseudonyme, titre du carnet, statut d''amitié (none | friends | request_sent | request_received | request_declined), groupes en commun, nombre de ses recettes que je peux lire. Aucune ligne sinon. Jamais d''e-mail. 0023.';

-- ----------------------------------------------------------------------------
-- 9. Compte : export, blocages de suppression, préparation de la suppression
-- ----------------------------------------------------------------------------
create or replace function public.export_my_data()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := (select auth.uid());
  j    jsonb;
begin
  if v_me is null then
    raise exception 'Connexion requise' using errcode = '42501';
  end if;
  perform private.check_rate_limit('export', 3, 'Limite atteinte : 3 exports par jour. Réessayez demain.');

  select jsonb_build_object(
    'exported_at', now(),
    'profile', (select jsonb_build_object(
                  'id', p.id, 'email', p.email, 'name', p.name, 'display_name', p.display_name,
                  'cookbook_title', p.cookbook_title, 'language', p.language, 'theme', p.theme,
                  'theme_settings', p.theme_settings, 'discoverable', p.discoverable,
                  'active_theme_group', (select g.name from public.groups g where g.id = p.active_theme_group_id),
                  'onboarded_at', p.onboarded_at, 'created_at', p.created_at)
                  from public.profiles p where p.id = v_me),
    'recipes', coalesce((
      select jsonb_agg(((to_jsonb(r) - 'search') || jsonb_build_object(
               'sections', coalesce((
                 select jsonb_agg(((to_jsonb(s) - 'recipe_id') || jsonb_build_object(
                          'ingredients', coalesce((select jsonb_agg(to_jsonb(i) - 'recipe_id' - 'section_id' order by i.order_index, i.id)
                                                     from public.recipe_ingredients i where i.section_id = s.id), '[]'::jsonb),
                          'instructions', coalesce((select jsonb_agg(to_jsonb(n) - 'recipe_id' - 'section_id' order by n.order_index, n.id)
                                                      from public.instructions n where n.section_id = s.id), '[]'::jsonb)))
                          order by s.order_index, s.id)
                   from public.recipe_sections s where s.recipe_id = r.id), '[]'::jsonb),
               'translations', coalesce((select jsonb_agg(to_jsonb(t) - 'search' - 'recipe_id' order by t.locale)
                                           from public.recipe_translations t where t.recipe_id = r.id), '[]'::jsonb),
               'public_link_token', (select l.token from public.recipe_share_links l where l.recipe_id = r.id)))
             order by r.created_at, r.id)
        from public.recipes r where r.owner_id = v_me), '[]'::jsonb),
    'recipes_shared_by_me', coalesce((
      select jsonb_agg(jsonb_build_object(
               'recipe_id', g.recipe_id, 'recipe_title', r.title, 'permission', g.permission, 'origin', g.origin,
               'to_person', private.display_name_of(g.grantee_user_id),
               'to_group', (select x.name from public.groups x where x.id = g.grantee_group_id),
               'created_at', g.created_at) order by g.created_at, g.id)
        from public.recipe_grants g join public.recipes r on r.id = g.recipe_id
       where r.owner_id = v_me), '[]'::jsonb),
    'recipes_shared_with_me', coalesce((
      select jsonb_agg(jsonb_build_object(
               'recipe_id', g.recipe_id, 'recipe_title', r.title, 'permission', g.permission, 'origin', g.origin,
               'from_person', private.display_name_of(g.granted_by), 'created_at', g.created_at) order by g.created_at, g.id)
        from public.recipe_grants g join public.recipes r on r.id = g.recipe_id
       where g.grantee_user_id = v_me), '[]'::jsonb),
    'cookbook_entries', coalesce((
      select jsonb_agg(jsonb_build_object(
               'recipe_id', e.recipe_id,
               'recipe_title', case when private.recipe_level(e.recipe_id) >= 1 then r.title end,
               'author', case when private.recipe_level(e.recipe_id) >= 1 then private.display_name_of(r.owner_id) end,
               'category', (select c.slug from public.categories c where c.id = e.category_id),
               'added_at', e.created_at) order by e.created_at, e.recipe_id)
        from public.cookbook_entries e join public.recipes r on r.id = e.recipe_id
       where e.user_id = v_me), '[]'::jsonb),
    'categories', coalesce((
      select jsonb_agg(jsonb_build_object('slug', c.slug, 'name_fr', c.name_fr, 'name_en', c.name_en, 'icon', c.icon,
                                          'color', c.color, 'sort_order', c.sort_order, 'created_at', c.created_at)
                       order by c.sort_order, c.slug)
        from public.categories c where c.owner_id = v_me), '[]'::jsonb),
    'groups', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', g.id, 'name', g.name, 'role', m.role, 'theme', g.theme, 'joined_at', m.created_at,
               'created_by', private.display_name_of(g.created_by),
               'members', coalesce((select jsonb_agg(private.display_name_of(x.user_id) order by x.created_at, x.user_id)
                                      from public.group_members x where x.group_id = g.id), '[]'::jsonb))
             order by m.created_at, g.id)
        from public.group_members m join public.groups g on g.id = m.group_id
       where m.user_id = v_me), '[]'::jsonb),
    'friends', coalesce((
      select jsonb_agg(jsonb_build_object('name', private.display_name_of(
               case when f.requester_id = v_me then f.addressee_id else f.requester_id end), 'since', f.responded_at)
             order by f.responded_at, f.id)
        from public.friendships f
       where f.status = 'accepted' and (f.requester_id = v_me or f.addressee_id = v_me)), '[]'::jsonb),
    'friend_requests', coalesce((
      select jsonb_agg(jsonb_build_object(
               'direction', case when f.addressee_id = v_me then 'incoming' else 'outgoing' end,
               'name', private.display_name_of(case when f.requester_id = v_me then f.addressee_id else f.requester_id end),
               'status', f.status, 'created_at', f.created_at) order by f.created_at, f.id)
        from public.friendships f
       where f.status <> 'accepted' and (f.requester_id = v_me or f.addressee_id = v_me)), '[]'::jsonb),
    'group_invitations', coalesce((
      select jsonb_agg(jsonb_build_object(
               'direction', case when i.target_user_id = v_me then 'received' else 'sent' end,
               'group', g.name, 'status', i.status,
               'person', private.display_name_of(case when i.target_user_id = v_me then i.inviter_id else i.target_user_id end),
               'created_at', i.created_at) order by i.created_at, i.id)
        from public.invitations i join public.groups g on g.id = i.group_id
       where i.kind = 'group' and (i.target_user_id = v_me or i.inviter_id = v_me)), '[]'::jsonb),
    'favorites', coalesce((
      select jsonb_agg(jsonb_build_object(
               'recipe_id', f.recipe_id, 'recipe_title', case when private.recipe_level(f.recipe_id) >= 1 then r.title end,
               'created_at', f.created_at) order by f.created_at, f.id)
        from public.favorites f left join public.recipes r on r.id = f.recipe_id
       where f.user_id = v_me), '[]'::jsonb),
    'planning', coalesce((
      select jsonb_agg(jsonb_build_object(
               'date', pl.date_string, 'meal_type', pl.meal_type, 'recipe_id', pl.recipe_id,
               'recipe_title', case when pl.recipe_id is not null and private.recipe_level(pl.recipe_id) >= 1 then r.title end,
               'custom_title', pl.custom_title, 'created_at', pl.created_at) order by pl.date_string, pl.meal_type, pl.id)
        from public.planning pl left join public.recipes r on r.id = pl.recipe_id
       where pl.user_id = v_me), '[]'::jsonb),
    'planning_notes', coalesce((
      select jsonb_agg(jsonb_build_object('date', pn.date_string, 'note_type', pn.note_type, 'content', pn.content,
                                          'created_at', pn.created_at) order by pn.date_string, pn.id)
        from public.planning_notes pn where pn.user_id = v_me), '[]'::jsonb),
    'shopping_lists', coalesce((
      select jsonb_agg(jsonb_build_object(
               'name', l.name, 'created_at', l.created_at,
               'items', coalesce((select jsonb_agg(jsonb_build_object(
                                    'name', it.name, 'amount', it.amount, 'unit', it.unit, 'checked', it.is_checked,
                                    'created_at', it.created_at) order by it.created_at, it.id)
                                    from public.shopping_items it where it.list_id = l.id), '[]'::jsonb))
             order by l.created_at, l.id)
        from public.shopping_lists l where l.user_id = v_me), '[]'::jsonb),
    'ai_usage', coalesce((
      select jsonb_agg(jsonb_build_object(
               'created_at', u.created_at, 'feature', u.feature, 'provider', u.provider, 'model', u.model,
               'input_tokens', u.input_tokens, 'output_tokens', u.output_tokens,
               'estimated_cost_usd', u.estimated_cost_usd, 'status', u.status) order by u.created_at, u.id)
        from public.ai_usage u where u.user_id = v_me), '[]'::jsonb),
    'notifications', coalesce((
      select jsonb_agg(jsonb_build_object(
               'type', n.type, 'payload', n.payload - 'from_user_id' - 'user_id' - 'author_id',
               'read_at', n.read_at, 'created_at', n.created_at) order by n.created_at, n.id)
        from public.notifications n where n.user_id = v_me), '[]'::jsonb),
    'dismissed_banners', coalesce((
      select jsonb_agg(jsonb_build_object('kind', d.kind, 'recipe_id', case when d.kind = 'new_recipe' then d.target_id end,
                                          'created_at', d.created_at) order by d.created_at, d.target_id)
        from public.dismissed_prompts d where d.user_id = v_me), '[]'::jsonb),
    'reports_filed', coalesce((
      select jsonb_agg(jsonb_build_object('recipe_id', rp.recipe_id, 'reason', rp.reason, 'details', rp.details,
                                          'status', rp.status, 'created_at', rp.created_at) order by rp.created_at, rp.id)
        from public.reports rp where rp.reporter_id = v_me), '[]'::jsonb)
  ) into j;
  return j;
end;
$$;
comment on function public.export_my_data() is
  'Toutes MES données en jsonb (profil, recettes complètes, droits, carnet, catégories, groupes, amis, favoris, planning, courses, notifications…). Les autres personnes n''y figurent que par pseudonyme (aucun identifiant de personne, aucun e-mail). 3 exports par jour (54000). 0023.';

create or replace function public.account_deletion_blockers()
returns table (group_id uuid, group_name text, other_member_count integer)
language sql
stable
security definer
set search_path = ''
as $$
  select g.id, g.name,
         (select count(*)::integer from public.group_members m where m.group_id = g.id and m.user_id <> g.created_by)
    from public.groups g
   where g.created_by = (select auth.uid())
     and exists (select 1 from public.group_members m where m.group_id = g.id and m.user_id <> g.created_by)
   order by lower(g.name), g.id
$$;
comment on function public.account_deletion_blockers() is
  'Groupes que je CRÉE et qui ont d''autres membres : à transférer (transfer_group_ownership) ou supprimer avant de supprimer mon compte. 0023.';

-- Réservée au serveur (clé service_role) : appelée par server/api/account/delete.post.ts avant auth.admin.deleteUser
create or replace function public.prepare_account_deletion(p_user uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare n integer;
begin
  if p_user is null then
    raise exception 'Utilisateur manquant' using errcode = '22023';
  end if;
  perform 1 from public.groups g where g.created_by = p_user for update;      -- verrou : personne ne rejoint pendant le contrôle
  if exists (select 1 from public.groups g
              where g.created_by = p_user
                and exists (select 1 from public.group_members m where m.group_id = g.id and m.user_id <> p_user)) then
    raise exception 'Transférez ou supprimez vos groupes avant de supprimer le compte' using errcode = '55000';
  end if;
  delete from public.groups g where g.created_by = p_user;                    -- seuls les groupes où l'on est seul restent
  get diagnostics n = row_count;
  return n;
end;
$$;
comment on function public.prepare_account_deletion(uuid) is
  'SERVICE_ROLE SEULEMENT. Refuse (55000) si p_user crée un groupe qui a d''autres membres ; sinon supprime les groupes où il est seul (le restrict de groupes.created_by ne bloque plus). Renvoie leur nombre. 0023.';

-- ----------------------------------------------------------------------------
-- 10. Droits d'exécution : authenticated (+ service_role) ; prepare_account_deletion : service_role seulement
-- ----------------------------------------------------------------------------
do $$
declare r record;
begin
  for r in select p.oid::regprocedure as sig, p.proname
             from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public'
              and p.proname in ('send_friend_request', 'respond_friend_request', 'cancel_friend_request', 'remove_friend',
                                'list_friends', 'list_friend_requests', 'create_group', 'rename_group', 'update_group_theme',
                                'invite_to_group', 'cancel_group_invitation', 'respond_group_invitation', 'leave_group',
                                'remove_group_member', 'transfer_group_ownership', 'delete_group', 'list_my_groups',
                                'list_group_members', 'list_group_invitations', 'create_invite_link', 'redeem_invite_link',
                                'list_notifications', 'mark_notifications_read', 'unread_notifications_count',
                                'update_my_profile', 'get_user_profile', 'export_my_data', 'account_deletion_blockers',
                                'prepare_account_deletion') loop
    execute format('revoke execute on function %s from public, anon, authenticated', r.sig);
    if r.proname = 'prepare_account_deletion' then
      execute format('grant execute on function %s to service_role', r.sig);
    else
      execute format('grant execute on function %s to authenticated, service_role', r.sig);
    end if;
  end loop;
end $$;

-- ----------------------------------------------------------------------------
-- 11. Vérifications finales
-- ----------------------------------------------------------------------------
do $$
declare b record; r record; n integer;
  names constant text[] := array['send_friend_request', 'respond_friend_request', 'cancel_friend_request', 'remove_friend',
                                 'list_friends', 'list_friend_requests', 'create_group', 'rename_group', 'update_group_theme',
                                 'invite_to_group', 'cancel_group_invitation', 'respond_group_invitation', 'leave_group',
                                 'remove_group_member', 'transfer_group_ownership', 'delete_group', 'list_my_groups',
                                 'list_group_members', 'list_group_invitations', 'create_invite_link', 'redeem_invite_link',
                                 'list_notifications', 'mark_notifications_read', 'unread_notifications_count',
                                 'update_my_profile', 'get_user_profile', 'export_my_data', 'account_deletion_blockers',
                                 'prepare_account_deletion'];
begin
  select * into b from private.tmp_0023_before;
  assert (select count(*) from public.recipes) = b.n_recipes and (select count(*) from public.profiles) = b.n_profiles
     and (select count(*) from public.friendships) = b.n_friendships and (select count(*) from public.invitations) = b.n_invitations
     and (select count(*) from public.notifications) = b.n_notifications and (select count(*) from public.group_members) = b.n_members,
    '[0023] des données ont changé';

  -- sans effet pour la v1 : AUCUNE politique n'a changé ; aucune autre fonction publique, aucun autre déclencheur non plus
  assert (select md5(coalesce(string_agg(
                concat_ws('|', schemaname, tablename, policyname, cmd, roles::text, qual, with_check),
                E'\n' order by schemaname, tablename, policyname), ''))
            from pg_policies where schemaname in ('public', 'storage')) = b.policies_md5,
    '[0023] une politique a changé';
  assert (select md5(coalesce(string_agg(pg_get_functiondef(p.oid), E'\n' order by p.oid::regprocedure::text), ''))
            from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
           where ns.nspname = 'public' and p.proname <> all (names)) = b.functions_md5,
    '[0023] une fonction existante du schéma public a changé';
  assert (select md5(coalesce(string_agg(pg_get_triggerdef(t.oid), E'\n' order by t.tgrelid::regclass::text, t.tgname), ''))
            from pg_trigger t where not t.tgisinternal and left(t.tgname, 9) <> 'trg_0023_') = b.triggers_md5,
    '[0023] un déclencheur existant a changé';

  -- 29 fonctions publiques nouvelles : security definer, search_path vide, jamais PUBLIC ni anon
  select count(*) into n from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
   where ns.nspname = 'public' and p.proname = any (names);
  assert n = 29, format('[0023] 29 fonctions attendues, %s trouvées (surcharge ?)', n);
  for r in select p.oid, p.proname, p.prosecdef, p.proconfig
             from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
            where ns.nspname = 'public' and p.proname = any (names) loop
    assert r.prosecdef, format('[0023] %s n''est pas security definer', r.proname);
    assert r.proconfig is not null and 'search_path=""' = any (r.proconfig), format('[0023] %s : search_path non vide', r.proname);
    assert not has_function_privilege('anon', r.oid, 'execute'), format('[0023] %s : exécutable par anon', r.proname);
    assert has_function_privilege('authenticated', r.oid, 'execute') = (r.proname <> 'prepare_account_deletion'),
      format('[0023] %s : droit authenticated inattendu', r.proname);
    assert has_function_privilege('service_role', r.oid, 'execute'), format('[0023] %s : service_role sans droit', r.proname);
    assert not exists (select 1 from pg_proc x, aclexplode(coalesce(x.proacl, acldefault('f', x.proowner))) a
                        where x.oid = r.oid and a.grantee = 0), format('[0023] %s : exécutable par PUBLIC', r.proname);
  end loop;

  -- aides internes et fonctions de déclencheurs : aucune exécution possible par l'API
  assert not exists (select 1 from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
                      where ns.nspname = 'private'
                        and p.proname in ('display_name_of', 'notify', 'check_rate_limit', 'require_group_creator', 'level_of',
                                          'trg_friendships_before', 'trg_friendships_notify', 'trg_friendships_cleanup',
                                          'trg_invitations_before', 'trg_invitations_notify', 'trg_grants_notify',
                                          'trg_reports_rate_limit', 'trg_recipes_notify_deleted', 'trg_profiles_guard_display_name')
                        and (has_function_privilege('authenticated', p.oid, 'execute') or has_function_privilege('anon', p.oid, 'execute'))),
    '[0023] une aide interne est exécutable par l''API';
  assert not has_table_privilege('authenticated', 'private.rate_events', 'select')
     and not has_table_privilege('anon', 'private.rate_events', 'select'), '[0023] rate_events lisible par l''API';

  select count(*) into n from pg_trigger t where not t.tgisinternal and left(t.tgname, 9) = 'trg_0023_';
  assert n = 9, format('[0023] 9 déclencheurs attendus, %s trouvés', n);

  raise notice '[0023] 29 fonctions publiques + 9 déclencheurs nouveaux ; politiques, fonctions et déclencheurs existants inchangés';
end $$;

drop table if exists private.tmp_0023_before;

notify pgrst, 'reload schema';

commit;
