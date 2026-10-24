-- ============================================================================
--  0019 — Fonctions d'aide RLS, politiques des tables sociales, bannières fermées
-- ============================================================================
--  QUAND : phase 3 du plan v2 (dossier « WebApp - Recettes v2 », §3 et §9).
--  Peut être appliquée en production À TOUT MOMENT après 0017 : elle ne change
--  RIEN pour le site actuel (v1). Prérequis : 0017 ; 0009 (private.is_admin) ;
--  0008 (public.immutable_unaccent).
--
--  NUMÉROTATION (dossier §4.2, §9)
--   0017 expand (fait) · 0018 remplissage (phase 4, à venir) · 0019 = CETTE
--   migration · 0020 = bascule des politiques des recettes, PRÉPARÉE mais non
--   appliquée : supabase/v2/0020_rls_switchover.sql (voir CHOIX n° 1) · 0021 =
--   fonctions métier côté recettes · 0022 = « contract » (ancien 0020 du dossier). Le dossier mettait « fonctions +
--   remplacement des politiques » dans un seul 0019 ; on le scinde en deux pour
--   que la partie sans risque puisse partir en production tout de suite.
--
--  CE QUI EST APPLIQUÉ ICI (sans effet pour la v1)
--   A. Fonctions d'aide dans le schéma `private` (non exposé par l'API) :
--        is_group_member(g), is_group_creator(g), group_has_creator(g),
--        has_pending_group_invite(g), shares_group_with(u), are_friends(u),
--        is_support(), is_recipe_owner(r), recipe_level(r), can_read_recipe(r),
--        can_copy_recipe(r), can_edit_recipe(r), can_see_profile(u),
--        can_create_grant(…), permission_rank(p), recipe_id_from_path(name).
--      Toutes `security definer`, `stable`, `set search_path = ''`, lisent
--      `(select auth.uid())` à l'intérieur (aucune ne prend « qui je suis » en
--      paramètre : impossible de sonder les droits d'autrui), exécutables par
--      `authenticated` et `service_role` seulement.
--   B. Politiques + `grant` ciblés (colonnes comprises) sur les 11 tables de
--      0017 et sur la nouvelle table `dismissed_prompts`. Toutes `to authenticated`.
--   C. Table `dismissed_prompts` (bannières fermées, par personne).
--   D. RPC publiques : `search_users(q)`, `get_public_profiles(ids)`,
--      `add_author_recipes_to_cookbook(author)`.
--   E. 5 déclencheurs d'intégrité (arrivée dans un groupe → invitation
--      acceptée ; départ → repartages issus du groupe retirés ; fin d'amitié →
--      droits directs entre les deux retirés s'ils ne partagent aucun groupe ;
--      baisse d'un droit → repartages plafonnés).
--
--  CE QUI N'EST PAS APPLIQUÉ ICI (tout est dans supabase/v2/0020_…)
--   Les politiques de `recipes`, `recipe_sections`, `recipe_ingredients`,
--   `instructions`, `recipe_translations`, `favorites` (insertion) et
--   `storage.objects` (bucket recipe-photos). Les politiques actuelles de ces
--   tables sont INCHANGÉES (empreinte md5 vérifiée en fin de fichier), ainsi que
--   toutes les fonctions du schéma public existantes.
--
--  CHOIX DE CONCEPTION (à valider par Nina)
--   1. Bascule en fichier séparé `supabase/v2/` et non dans `migrations/` : le
--      v1 suppose que tout compte connecté lit toutes les recettes, et
--      `owner_id` est NULL partout jusqu'au remplissage. Les nouvelles
--      politiques cacheraient donc toutes les recettes. Le fichier de bascule
--      REFUSE de tourner tant qu'une recette n'a pas de propriétaire. Il est
--      hors de `migrations/` pour que `setup.sh` / un `db push` ne
--      l'appliquent jamais par erreur ; le harnais le teste (tests/run_local.sh).
--   2. Partage par groupe = DROIT IMPLICITE (clarification de Nina du
--      2026-10-24, qui remplace le CHOIX n° 5 de 0017). Une recette
--      `visibility = 'groups'` est lisible ET copiable (niveau « copy ») par
--      tous les membres des groupes de son auteur, recettes existantes comprises,
--      sans ligne `recipe_grants`. Rejoindre un groupe n'ajoute RIEN au carnet
--      de personne : `cookbook_entries` ne se remplit que par un geste explicite.
--      `visibility = 'private'` : auteur + droits explicites seulement.
--      `edit_original` ne s'obtient que par un `recipe_grants` direct de l'auteur.
--   3. Bannières fermées = table dédiée `dismissed_prompts (user_id, kind,
--      target_id, created_at)`, PK composite, plutôt que `notifications` : une
--      notification est un message (lu / non lu, supprimable) ; une bannière
--      fermée est un état durable qui ne doit jamais revenir. Deux genres :
--      'author_recipes' (target_id = l'auteur : « Explorer les recettes de X »)
--      et 'new_recipe' (target_id = la recette : « X a publié… »). Fermer la
--      bannière n'ajoute ni ne retire aucune recette.
--   4. `add_author_recipes_to_cookbook(author)` : ajoute au carnet « telles
--      quelles » (références) toutes les recettes de `author` que l'appelant
--      peut lire, en un appel, idempotente (`on conflict do nothing`), renvoie le
--      nombre d'ajouts NOUVEAUX. Elle ferme aussi la bannière de cet auteur.
--      Security invoker : les politiques de `cookbook_entries` s'appliquent.
--   5. Rôle « support » = `private.is_support()`, pour l'instant simple alias de
--      `private.is_admin()` (même claim JWT, même repli sur `profiles.role`).
--      On ne touche ni au check de `profiles.role`, ni au hook, ni au trigger
--      anti-escalade : le remplacement est PROGRESSIF. Toutes les nouvelles
--      politiques n'utilisent que `is_support()` ; le jour où l'on renomme le
--      rôle, on ne change qu'une fonction. Le support lit les signalements
--      (et, à la bascule, SEULEMENT les recettes signalées « open » ou « reviewed » ;
--      il peut aussi les supprimer) ; il ne modifie jamais le contenu des autres. Le 2ᵉ compte
--      admin repasse `user` au remplissage (phase 4), pas ici.
--   6. Profils : `profiles` garde ses politiques actuelles (soi + support). Les
--      autres ne voient une personne que par `search_users(q)` (≥ 3 lettres,
--      respecte `discoverable`, jamais soi-même) et `get_public_profiles(ids)`
--      (personnes liées : soi, même groupe, amis, demande / invitation en
--      cours, auteur d'une recette lisible). Elles ne renvoient que `id` et
--      `display_name` (+ `cookbook_title`). JAMAIS `profiles.name` en repli :
--      `handle_new_user` y recopie l'e-mail quand le compte n'a pas de nom.
--      Une personne sans `display_name` est donc introuvable par la recherche
--      (le remplissage et l'inscription le renseignent).
--   7. Groupes : le créateur gère les membres MAIS l'arrivée se fait par
--      invitation que la personne accepte : `group_members` n'accepte l'insertion
--      que (a) du créateur lui-même tant que le groupe n'a pas de ligne `creator` (même s'il a déjà invité du monde), ou (b) de la
--      personne invitée, avec une invitation « pending » non expirée émise par
--      le créateur actuel. Le créateur retire un membre ; chacun peut partir
--      seul. Pas de politique UPDATE sur `group_members` ni sur
--      `groups.created_by` (colonnes non modifiables par l'API) : le transfert du
--      rôle de créateur et le départ du créateur passent par une RPC de la
--      phase 5. Accepter = rejoindre ; la personne invitée ne peut que REFUSER
--      par UPDATE (sinon une invitation « acceptée » servirait à revenir après
--      avoir été retirée).
--   8. Droits (`recipe_grants`) : l'auteur donne tout, à un ami ou à une
--      personne partageant un groupe avec lui (pas à un inconnu), ou à un
--      groupe dont il est membre. Un REPARTAGE exige que l'appelant détienne un
--      droit EXPLICITE sur la recette (direct, ou via un groupe) : on pointe
--      `source_grant_id` dessus, niveau ≤ copy et ≤ son niveau. Un accès
--      implicite (groupe `visibility`) n'est pas repartageable : on peut ajouter
--      la recette à son carnet, puis, si on en fait une copie, la partager comme
--      sa propre recette. Les liens publics (`origin = 'link'`) sont réservés au
--      serveur (RPC de la phase 5) : refusés par l'API.
--   9. Fin d'amitié : retire les droits directs / repartages entre les deux
--      personnes s'ils ne partagent aucun groupe. Une demande d'amis refusée ne
--      peut être relancée que par le demandeur d'origine (la ligne est
--      réutilisée) ; l'inverse passe par une RPC de la phase 5.
--  10. Notifications : lecture / marquage lu / suppression par la personne ;
--      AUCUNE insertion par l'API (créées par le serveur ou des RPC, phase 5).
--      `system_alerts` : lecture par le support seulement ; écrites par le serveur.
--  11. Signalements : insertion par tout compte connecté (`reporter_id` = soi,
--      statut « open »), lecture et traitement par le support seulement.
--  12. `list_cookbook` et `get_shared_recipe(token)` (listés par le dossier en
--      phase 3) ne sont PAS faits ici : ils relèvent des phases 5 (API) ; les
--      tables nécessaires et les droits sont prêts.
--
--  13. (relecture de sécurité n° 2) E-MAIL DU PROFIL NON MODIFIABLE PAR L'API : sur Supabase les rôles anon / authenticated
--      ont `UPDATE` sur toute la table `profiles` (droit de table) ; la politique « sa propre ligne » laissait donc
--      changer `profiles.email`. On retire le droit de table puis on ne rend modifiables que les colonnes utiles :
--      name, role (toujours gardé par le déclencheur anti-escalade de 0001 : admin seulement), language, theme,
--      notifications, display_name, cookbook_title, theme_settings, active_theme_group_id, discoverable, onboarded_at.
--      Ni `id`, ni `email`, ni `created_at`, ni `updated_at` (posé par déclencheur). Le code v1 ne modifie aucune colonne de
--      `profiles` (il ne fait que lire son profil) : rien ne casse. C'est un droit, pas une politique : les empreintes
--      md5 des politiques existantes restent valables. Retour arrière : le droit de table est rétabli.
--  14. PLAFONDS DE VOLUME (déclencheurs d'insertion, ignorés sans `auth.uid()` comme les limites de débit de 0023, avec le
--      même verrou consultatif par personne que `private.check_rate_limit`) : 2000 recettes par auteur (seulement quand
--      `owner_id` n'est pas NULL : sans effet tant que la v1 écrit des recettes sans propriétaire ; déclencheur `when`
--      + test dans la fonction), 20 groupes créés par personne (`groups.created_by`), 5000 bannières fermées par
--      personne. SQLSTATE 53400 (limite de configuration) et non 54000 : ce n'est pas une limite par jour. Contraintes de
--      taille (4000 caractères, comme `update_my_profile` / `update_group_theme`) sur `profiles.theme_settings` et
--      `groups.theme` : tables créées en 0017 (déjà en production), contraintes ajoutées ici de façon idempotente
--      (`not valid` puis `validate`) ; elles valent aussi pour l'écriture directe (politiques d'update).
--  15. Invitations : l'insertion directe (API) ne sert qu'aux invitations de GROUPE émises par le créateur. Les
--      invitations `kind = 'friend'` passent uniquement par des RPC ou sont réservées à la phase 7 (e-mail).
--  16. Repartage : il ne vise qu'une PERSONNE (ami ou co-membre), jamais un groupe (`can_create_grant`, origine
--      'reshare', exige `grantee_user_id`). Un droit donné à un groupe est réservé à l'auteur de la recette (origine 'direct').
--
--  RÉVERSIBILITÉ : supabase/rollback/0019_rls_helpers_social_down.sql.
--  IDEMPOTENTE : rejouable (create or replace, drop policy / trigger if exists).
--  ATTENDU APRÈS : 12 tables avec politiques, 0 changement sur les politiques /
--  fonctions existantes, 0 donnée modifiée.
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- 0. Pré-requis et empreintes « avant »
-- ----------------------------------------------------------------------------
do $$
begin
  assert to_regclass('public.groups') is not null,              '[0019] tables sociales absentes : appliquer 0017';
  assert to_regclass('public.recipe_grants') is not null,       '[0019] recipe_grants absente : appliquer 0017';
  assert to_regprocedure('private.is_admin()') is not null,     '[0019] private.is_admin() absente : appliquer 0009';
  assert to_regprocedure('public.immutable_unaccent(text)') is not null, '[0019] immutable_unaccent absente : appliquer 0008';
end $$;

-- Instantané dans une vraie table (le SQL Editor de Supabase ne garde pas les tables temporaires
-- d'une instruction à l'autre) ; supprimée par la vérification finale.
drop table if exists private.tmp_0019_before;
create table private.tmp_0019_before as
  select (select count(*) from public.recipes)  as n_recipes,
         (select count(*) from public.profiles) as n_profiles,
         (select md5(coalesce(string_agg(
                   concat_ws('|', schemaname, tablename, policyname, cmd, roles::text, qual, with_check),
                   E'\n' order by schemaname, tablename, policyname), ''))
            from pg_policies
           where schemaname in ('public', 'storage')
             and tablename not in ('categories', 'groups', 'group_members', 'friendships', 'invitations',
                                   'recipe_grants', 'recipe_share_links', 'cookbook_entries',
                                   'notifications', 'reports', 'system_alerts', 'dismissed_prompts')) as policies_md5,
         (select md5(coalesce(string_agg(pg_get_functiondef(p.oid), E'\n' order by p.oid::regprocedure::text), ''))
            from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
           where ns.nspname = 'public'
             and p.proname not in ('search_users', 'get_public_profiles', 'add_author_recipes_to_cookbook')) as functions_md5;

-- ----------------------------------------------------------------------------
-- 1. dismissed_prompts — bannières fermées par personne
-- ----------------------------------------------------------------------------
create table if not exists public.dismissed_prompts (
  user_id    uuid        not null references auth.users (id) on delete cascade,
  kind       text        not null check (kind in ('author_recipes', 'new_recipe')),
  target_id  uuid        not null,
  created_at timestamptz not null default now(),
  primary key (user_id, kind, target_id)
);
comment on table  public.dismissed_prompts is 'Bannières fermées (ne reviennent plus) : « Explorer les recettes de X » (kind author_recipes, target_id = auteur) et « X a publié une recette » (kind new_recipe, target_id = recette). target_id sans clé étrangère (dépend de kind) : une ligne orpheline est inoffensive.';
comment on column public.dismissed_prompts.target_id is 'Auteur (author_recipes) ou recette (new_recipe).';

alter table public.dismissed_prompts enable row level security;
revoke all on public.dismissed_prompts from public, anon, authenticated;

-- ----------------------------------------------------------------------------
-- 2. Fonctions d'aide (schéma private)
-- ----------------------------------------------------------------------------
create schema if not exists private;

-- rang d'un droit : 0 aucun · 1 read · 2 copy · 3 edit_original
create or replace function private.permission_rank(p_permission text)
returns int language sql immutable set search_path = '' as $$
  select case p_permission when 'read' then 1 when 'copy' then 2 when 'edit_original' then 3 else 0 end
$$;

create or replace function private.is_support()
returns boolean language sql stable security definer set search_path = '' as $$
  select private.is_admin()
$$;
comment on function private.is_support() is 'Rôle support (Nina). Alias de private.is_admin() pour l''instant : remplacement progressif (0019, CHOIX n° 5).';

create or replace function private.is_group_member(p_group uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.group_members m
                  where m.group_id = p_group and m.user_id = (select auth.uid()))
$$;

create or replace function private.is_group_creator(p_group uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.groups g
                  where g.id = p_group and g.created_by = (select auth.uid()))
$$;

create or replace function private.group_has_creator(p_group uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.group_members m where m.group_id = p_group and m.role = 'creator')
$$;

-- Invitation « pending » non expirée, adressée à moi, émise par le créateur ACTUEL
create or replace function private.has_pending_group_invite(p_group uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1
                   from public.invitations i
                   join public.groups g on g.id = i.group_id and g.created_by = i.inviter_id
                  where i.group_id = p_group and i.kind = 'group' and i.status = 'pending'
                    and i.target_user_id = (select auth.uid()) and i.expires_at > now())
$$;

create or replace function private.shares_group_with(p_user uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select p_user is distinct from (select auth.uid())
     and exists (select 1 from public.group_members a
                   join public.group_members b on b.group_id = a.group_id
                  where a.user_id = (select auth.uid()) and b.user_id = p_user)
$$;

create or replace function private.are_friends(p_user uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.friendships f
                  where f.status = 'accepted'
                    and ((f.requester_id = (select auth.uid()) and f.addressee_id = p_user)
                      or (f.addressee_id = (select auth.uid()) and f.requester_id = p_user)))
$$;

create or replace function private.is_recipe_owner(p_recipe uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.recipes r
                  where r.id = p_recipe and r.owner_id = (select auth.uid()))
$$;

-- Niveau de MOI sur une recette : 0 aucun · 1 read · 2 copy · 3 edit_original · 4 auteur.
-- Le support n'a PAS de niveau (il lit via can_read_recipe, il ne modifie jamais).
create or replace function private.recipe_level(p_recipe uuid)
returns int language sql stable security definer set search_path = '' as $$
  select coalesce(max(lvl), 0) from (
    select 4 as lvl
      from public.recipes r
     where r.id = p_recipe and r.owner_id = (select auth.uid())
    union all   -- droits explicites : à moi, ou à un groupe dont je suis membre
    select private.permission_rank(g.permission)
      from public.recipe_grants g
     where g.recipe_id = p_recipe
       and (g.grantee_user_id = (select auth.uid())
            or g.grantee_group_id in (select m.group_id from public.group_members m
                                       where m.user_id = (select auth.uid())))
    union all   -- droit IMPLICITE « groups » : un groupe en commun avec l'auteur (niveau copy)
    select 2
      from public.recipes r
     where r.id = p_recipe and r.visibility = 'groups' and r.owner_id is not null
       and exists (select 1 from public.group_members a
                     join public.group_members b on b.group_id = a.group_id
                    where a.user_id = r.owner_id and b.user_id = (select auth.uid()))
  ) s
$$;

create or replace function private.can_read_recipe(p_recipe uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select private.recipe_level(p_recipe) >= 1
      or (private.is_support()
          and exists (select 1 from public.reports r
                       where r.recipe_id = p_recipe and r.status in ('open', 'reviewed')))
$$;
create or replace function private.can_copy_recipe(p_recipe uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select private.recipe_level(p_recipe) >= 2
$$;
create or replace function private.can_edit_recipe(p_recipe uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select private.recipe_level(p_recipe) >= 3
$$;

-- Puis-je voir le nom d'affichage de cette personne ? (soi, même groupe, amis, demande ou
-- invitation en cours, auteur d'une recette que je peux lire)
create or replace function private.can_see_profile(p_user uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select (select auth.uid()) is not null and (
    p_user = (select auth.uid())
    or private.shares_group_with(p_user)
    or exists (select 1 from public.friendships f
                where f.status in ('pending', 'accepted')
                  and ((f.requester_id = (select auth.uid()) and f.addressee_id = p_user)
                    or (f.addressee_id = (select auth.uid()) and f.requester_id = p_user)))
    or exists (select 1 from public.invitations i
                where i.status = 'pending' and i.expires_at > now()
                  and ((i.inviter_id = (select auth.uid()) and i.target_user_id = p_user)
                    or (i.target_user_id = (select auth.uid()) and i.inviter_id = p_user)))
    or exists (select 1 from public.recipes r
                where r.owner_id = p_user and private.can_read_recipe(r.id))
  )
$$;

-- Ai-je le droit de créer CETTE ligne de recipe_grants ? (voir CHOIX n° 8)
create or replace function private.can_create_grant(
  p_recipe uuid, p_grantee_user uuid, p_grantee_group uuid,
  p_permission text, p_origin text, p_source uuid, p_granted_by uuid)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare
  v_me  uuid := (select auth.uid());
  v_lvl int;
begin
  if v_me is null or p_granted_by is distinct from v_me then return false; end if;
  -- bénéficiaire : un ami ou une personne de l'un de mes groupes ; ou un groupe dont je suis membre
  if p_grantee_user is not null then
    if p_grantee_user = v_me then return false; end if;
    if not (private.are_friends(p_grantee_user) or private.shares_group_with(p_grantee_user)) then return false; end if;
  elsif p_grantee_group is not null then
    if not private.is_group_member(p_grantee_group) then return false; end if;
  else
    return false;
  end if;

  if p_origin = 'direct' then
    return private.is_recipe_owner(p_recipe);
  elsif p_origin = 'reshare' then
    if p_grantee_user is null then return false; end if;       -- un repartage ne vise qu'une personne (CHOIX n° 16)
    if p_permission not in ('read', 'copy') or p_source is null then return false; end if;
    select max(private.permission_rank(g.permission)) into v_lvl
      from public.recipe_grants g
     where g.id = p_source and g.recipe_id = p_recipe
       and (g.grantee_user_id = v_me
            or g.grantee_group_id in (select m.group_id from public.group_members m where m.user_id = v_me));
    return v_lvl is not null and private.permission_rank(p_permission) <= v_lvl;
  end if;
  return false;   -- 'link' : serveur seulement
end $$;

-- Recette d'un chemin de bucket « <recipeId>/<fichier> » (NULL si le premier dossier n'est pas un uuid)
create or replace function private.recipe_id_from_path(p_name text)
returns uuid language sql immutable set search_path = '' as $$
  select case when split_part(p_name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
              then split_part(p_name, '/', 1)::uuid end
$$;

do $$
declare r record;
begin
  for r in select p.oid::regprocedure as sig
             from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'private'
              and p.proname in ('permission_rank', 'is_support', 'is_group_member', 'is_group_creator', 'group_has_creator',
                                'has_pending_group_invite', 'shares_group_with', 'are_friends', 'is_recipe_owner',
                                'recipe_level', 'can_read_recipe', 'can_copy_recipe', 'can_edit_recipe',
                                'can_see_profile', 'can_create_grant', 'recipe_id_from_path') loop
    execute format('revoke execute on function %s from public, anon', r.sig);
    execute format('grant execute on function %s to authenticated, service_role', r.sig);
  end loop;
end $$;

-- ----------------------------------------------------------------------------
-- 3. Déclencheurs d'intégrité
-- ----------------------------------------------------------------------------
-- 3a. Arrivée dans un groupe : l'invitation correspondante passe à « accepted »
create or replace function private.on_group_member_added()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  update public.invitations
     set status = 'accepted', responded_at = now()
   where group_id = new.group_id and target_user_id = new.user_id and kind = 'group' and status = 'pending';
  return new;
end $$;
drop trigger if exists trg_group_member_added on public.group_members;
create trigger trg_group_member_added after insert on public.group_members
  for each row execute function private.on_group_member_added();

-- 3b. Départ d'un groupe : les repartages faits par cette personne grâce à un droit de ce groupe disparaissent
create or replace function private.on_group_member_removed()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  delete from public.recipe_grants rg
   where rg.origin = 'reshare' and rg.granted_by = old.user_id
     and rg.source_grant_id in (select s.id from public.recipe_grants s where s.grantee_group_id = old.group_id);
  -- droits directs entre la personne et les membres restants, s'ils ne sont plus amis ni dans un groupe commun
  -- (symétrique du déclencheur d'amitié)
  delete from public.recipe_grants rg
   using public.group_members m
   where m.group_id = old.group_id and m.user_id <> old.user_id
     and rg.grantee_user_id is not null
     and ((rg.granted_by = old.user_id and rg.grantee_user_id = m.user_id)
       or (rg.granted_by = m.user_id and rg.grantee_user_id = old.user_id))
     and not exists (select 1 from public.friendships f
                      where f.status = 'accepted'
                        and ((f.requester_id = old.user_id and f.addressee_id = m.user_id)
                          or (f.requester_id = m.user_id and f.addressee_id = old.user_id)))
     and not exists (select 1 from public.group_members a
                       join public.group_members b on b.group_id = a.group_id
                      where a.user_id = old.user_id and b.user_id = m.user_id);
  -- le thème actif ne peut pas rester celui d'un groupe quitté
  update public.profiles set active_theme_group_id = null
   where id = old.user_id and active_theme_group_id = old.group_id;
  return old;
end $$;
drop trigger if exists trg_group_member_removed on public.group_members;
create trigger trg_group_member_removed after delete on public.group_members
  for each row execute function private.on_group_member_removed();

-- 3c. Fin d'une amitié : droits donnés entre les deux (sans groupe commun) retirés
create or replace function private.on_friendship_removed()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if old.status = 'accepted'
     and not exists (select 1 from public.group_members a
                       join public.group_members b on b.group_id = a.group_id
                      where a.user_id = old.requester_id and b.user_id = old.addressee_id) then
    delete from public.recipe_grants
     where (granted_by = old.requester_id and grantee_user_id = old.addressee_id)
        or (granted_by = old.addressee_id and grantee_user_id = old.requester_id);
  end if;
  return old;
end $$;
drop trigger if exists trg_friendship_removed on public.friendships;
create trigger trg_friendship_removed after delete on public.friendships
  for each row execute function private.on_friendship_removed();

-- 3d. Un droit baisse : les repartages qui en dépendent sont plafonnés à son niveau
create or replace function private.on_grant_lowered()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  update public.recipe_grants
     set permission = new.permission
   where source_grant_id = new.id
     and private.permission_rank(permission) > private.permission_rank(new.permission);
  return new;
end $$;
drop trigger if exists trg_grant_lowered on public.recipe_grants;
create trigger trg_grant_lowered after update of permission on public.recipe_grants
  for each row when (new.permission is distinct from old.permission)
  execute function private.on_grant_lowered();

-- 3e. Thème actif : seulement un groupe dont on est membre (NULL toujours permis ; serveur / migrations exemptés)
create or replace function private.profiles_guard_active_theme()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.active_theme_group_id is not null
     and (tg_op = 'INSERT' or new.active_theme_group_id is distinct from old.active_theme_group_id)
     and (select auth.uid()) is not null
     and not exists (select 1 from public.group_members m
                      where m.group_id = new.active_theme_group_id and m.user_id = new.id) then
    raise exception 'Le thème actif doit être celui d''un groupe dont on est membre' using errcode = '42501';
  end if;
  return new;
end $$;
drop trigger if exists trg_profiles_guard_active_theme on public.profiles;
create trigger trg_profiles_guard_active_theme before insert or update of active_theme_group_id on public.profiles
  for each row execute function private.profiles_guard_active_theme();

revoke execute on function private.profiles_guard_active_theme() from public, anon, authenticated;
revoke execute on function private.on_group_member_added(), private.on_group_member_removed(),
                           private.on_friendship_removed(), private.on_grant_lowered() from public, anon, authenticated;

-- 3f. Plafonds de volume (CHOIX n° 14) : un verrou par personne et par genre sérialise « compter puis insérer »
create or replace function private.trg_recipes_quota()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.owner_id is null or (select auth.uid()) is null then return new; end if;     -- v1 / service : sans effet
  perform pg_advisory_xact_lock(hashtextextended(new.owner_id::text || ':recipes', 0));
  if (select count(*) from public.recipes r where r.owner_id = new.owner_id) >= 2000 then
    raise exception 'Limite atteinte : 2000 recettes par auteur' using errcode = '53400';
  end if;
  return new;
end $$;
drop trigger if exists trg_recipes_quota on public.recipes;
create trigger trg_recipes_quota before insert on public.recipes
  for each row when (new.owner_id is not null)
  execute function private.trg_recipes_quota();

create or replace function private.trg_groups_quota()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.uid()) is null then return new; end if;
  perform pg_advisory_xact_lock(hashtextextended(new.created_by::text || ':groups', 0));
  if (select count(*) from public.groups g where g.created_by = new.created_by) >= 20 then
    raise exception 'Limite atteinte : 20 groupes créés par personne' using errcode = '53400';
  end if;
  return new;
end $$;
drop trigger if exists trg_groups_quota on public.groups;
create trigger trg_groups_quota before insert on public.groups
  for each row execute function private.trg_groups_quota();

create or replace function private.trg_dismissed_prompts_quota()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.uid()) is null then return new; end if;
  perform pg_advisory_xact_lock(hashtextextended(new.user_id::text || ':dismissed_prompts', 0));
  -- une bannière déjà fermée (idempotence de dismiss_prompt, `on conflict do nothing`) ne compte pas deux fois
  if not exists (select 1 from public.dismissed_prompts d
                  where d.user_id = new.user_id and d.kind = new.kind and d.target_id = new.target_id)
     and (select count(*) from public.dismissed_prompts d where d.user_id = new.user_id) >= 5000 then
    raise exception 'Limite atteinte : 5000 bannières fermées par personne' using errcode = '53400';
  end if;
  return new;
end $$;
drop trigger if exists trg_dismissed_prompts_quota on public.dismissed_prompts;
create trigger trg_dismissed_prompts_quota before insert on public.dismissed_prompts
  for each row execute function private.trg_dismissed_prompts_quota();

revoke execute on function private.trg_recipes_quota(), private.trg_groups_quota(),
                           private.trg_dismissed_prompts_quota() from public, anon, authenticated;

-- 3g. Taille des thèmes JSON (tables de 0017, déjà en production : ajout idempotent, `not valid` puis `validate`)
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_theme_settings_size' and conrelid = 'public.profiles'::regclass) then
    alter table public.profiles
      add constraint profiles_theme_settings_size check (theme_settings is null or length(theme_settings::text) <= 4000) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'groups_theme_size' and conrelid = 'public.groups'::regclass) then
    alter table public.groups
      add constraint groups_theme_size check (length(theme::text) <= 4000) not valid;
  end if;
end $$;
alter table public.profiles validate constraint profiles_theme_settings_size;
alter table public.groups   validate constraint groups_theme_size;

-- ----------------------------------------------------------------------------
-- 4. Politiques et droits des 12 tables sociales
-- ----------------------------------------------------------------------------
do $$
declare pol record;
begin
  for pol in select policyname, tablename from pg_policies
              where schemaname = 'public'
                and tablename in ('categories', 'groups', 'group_members', 'friendships', 'invitations',
                                  'recipe_grants', 'recipe_share_links', 'cookbook_entries',
                                  'notifications', 'reports', 'system_alerts', 'dismissed_prompts') loop
    execute format('drop policy %I on public.%I', pol.policyname, pol.tablename);
  end loop;
end $$;

-- categories : chacun les siennes ---------------------------------------------
create policy "categories_select_own" on public.categories for select to authenticated
  using (owner_id = (select auth.uid()));
create policy "categories_insert_own" on public.categories for insert to authenticated
  with check (owner_id = (select auth.uid()));
create policy "categories_update_own" on public.categories for update to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy "categories_delete_own" on public.categories for delete to authenticated
  using (owner_id = (select auth.uid()));
grant select, insert, update, delete on public.categories to authenticated;

-- groups ----------------------------------------------------------------------
create policy "groups_select_member" on public.groups for select to authenticated
  using (private.is_group_member(id) or created_by = (select auth.uid()) or private.has_pending_group_invite(id));
create policy "groups_insert_self" on public.groups for insert to authenticated
  with check (created_by = (select auth.uid()));
create policy "groups_update_creator" on public.groups for update to authenticated
  using (created_by = (select auth.uid())) with check (created_by = (select auth.uid()));
create policy "groups_delete_creator" on public.groups for delete to authenticated
  using (created_by = (select auth.uid()));
grant select, delete on public.groups to authenticated;
grant insert (name, theme, created_by) on public.groups to authenticated;
grant update (name, theme) on public.groups to authenticated;

-- group_members ---------------------------------------------------------------
create policy "group_members_select_fellow" on public.group_members for select to authenticated
  using (private.is_group_member(group_id) or user_id = (select auth.uid()));   -- `or user_id` : INSERT … RETURNING relit la ligne neuve
create policy "group_members_insert" on public.group_members for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and ((role = 'creator' and private.is_group_creator(group_id) and not private.group_has_creator(group_id))
      or (role = 'member' and private.has_pending_group_invite(group_id))));
create policy "group_members_delete" on public.group_members for delete to authenticated
  using (role = 'member' and (user_id = (select auth.uid()) or private.is_group_creator(group_id)));
grant select, delete on public.group_members to authenticated;
grant insert (group_id, user_id, role) on public.group_members to authenticated;

-- friendships -----------------------------------------------------------------
create policy "friendships_select_party" on public.friendships for select to authenticated
  using (requester_id = (select auth.uid()) or addressee_id = (select auth.uid()));
create policy "friendships_insert_request" on public.friendships for insert to authenticated
  with check (requester_id = (select auth.uid()) and status = 'pending' and responded_at is null);
create policy "friendships_update_respond" on public.friendships for update to authenticated
  using ((addressee_id = (select auth.uid()) and status = 'pending')
      or (requester_id = (select auth.uid()) and status = 'declined'))
  with check ((addressee_id = (select auth.uid()) and status in ('accepted', 'declined') and responded_at is not null)
           or (requester_id = (select auth.uid()) and status = 'pending' and responded_at is null));
create policy "friendships_delete_party" on public.friendships for delete to authenticated
  using (requester_id = (select auth.uid()) or addressee_id = (select auth.uid()));
grant select, delete on public.friendships to authenticated;
grant insert (requester_id, addressee_id) on public.friendships to authenticated;
grant update (status, responded_at) on public.friendships to authenticated;

-- invitations (token_hash jamais lisible ni écrivable par l'API) --------------
create policy "invitations_select_party" on public.invitations for select to authenticated
  using (inviter_id = (select auth.uid()) or target_user_id = (select auth.uid()));
create policy "invitations_insert_inviter" on public.invitations for insert to authenticated
  with check (inviter_id = (select auth.uid())
              and status = 'pending'
              and (target_user_id is null or target_email is null)      -- l'e-mail de quelqu'un d'autre n'est jamais montré à la cible
              and kind = 'group' and private.is_group_creator(group_id));   -- 'friend' : RPC / phase 7 seulement (CHOIX n° 15)
create policy "invitations_update_respond" on public.invitations for update to authenticated
  using ((target_user_id = (select auth.uid()) and status = 'pending' and expires_at > now())
      or (inviter_id = (select auth.uid()) and status = 'pending'))
  with check ((target_user_id = (select auth.uid()) and status = 'declined' and responded_at is not null)
           or (inviter_id = (select auth.uid()) and status = 'cancelled' and responded_at is not null));
grant select (id, kind, inviter_id, target_user_id, target_email, group_id, status, created_at, expires_at, responded_at)
  on public.invitations to authenticated;
grant insert (kind, inviter_id, target_user_id, target_email, group_id) on public.invitations to authenticated;
grant update (status, responded_at) on public.invitations to authenticated;

-- recipe_grants ---------------------------------------------------------------
create policy "recipe_grants_select" on public.recipe_grants for select to authenticated
  using (private.is_recipe_owner(recipe_id)
         or granted_by = (select auth.uid())
         or grantee_user_id = (select auth.uid())
         or (grantee_group_id is not null and private.is_group_member(grantee_group_id)));
create policy "recipe_grants_insert" on public.recipe_grants for insert to authenticated
  with check (private.can_create_grant(recipe_id, grantee_user_id, grantee_group_id, permission, origin,
                                       source_grant_id, granted_by));
create policy "recipe_grants_update_owner" on public.recipe_grants for update to authenticated
  using (private.is_recipe_owner(recipe_id)) with check (private.is_recipe_owner(recipe_id));
create policy "recipe_grants_delete" on public.recipe_grants for delete to authenticated
  using (private.is_recipe_owner(recipe_id)
         or (origin = 'reshare' and granted_by = (select auth.uid()))
         or grantee_user_id = (select auth.uid()));
grant select, delete on public.recipe_grants to authenticated;
grant insert (recipe_id, grantee_user_id, grantee_group_id, permission, granted_by, source_grant_id, origin)
  on public.recipe_grants to authenticated;
grant update (permission) on public.recipe_grants to authenticated;

-- recipe_share_links : le jeton n'est lisible que par l'auteur -----------------
create policy "recipe_share_links_owner_select" on public.recipe_share_links for select to authenticated
  using (private.is_recipe_owner(recipe_id));
create policy "recipe_share_links_owner_insert" on public.recipe_share_links for insert to authenticated
  with check (private.is_recipe_owner(recipe_id));
create policy "recipe_share_links_owner_delete" on public.recipe_share_links for delete to authenticated
  using (private.is_recipe_owner(recipe_id));
grant select, delete on public.recipe_share_links to authenticated;
grant insert (recipe_id) on public.recipe_share_links to authenticated;

-- cookbook_entries : geste explicite, jamais automatique ---------------------
create policy "cookbook_entries_select_own" on public.cookbook_entries for select to authenticated
  using (user_id = (select auth.uid()) and private.can_read_recipe(recipe_id));
create policy "cookbook_entries_insert_own" on public.cookbook_entries for insert to authenticated
  with check (user_id = (select auth.uid()) and private.can_read_recipe(recipe_id)
              and (category_id is null or exists (select 1 from public.categories c
                                                   where c.id = category_id and c.owner_id = (select auth.uid()))));
create policy "cookbook_entries_update_own" on public.cookbook_entries for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid())
              and (category_id is null or exists (select 1 from public.categories c
                                                   where c.id = category_id and c.owner_id = (select auth.uid()))));
create policy "cookbook_entries_delete_own" on public.cookbook_entries for delete to authenticated
  using (user_id = (select auth.uid()));
grant select, delete on public.cookbook_entries to authenticated;
grant insert (user_id, recipe_id, category_id) on public.cookbook_entries to authenticated;
grant update (category_id) on public.cookbook_entries to authenticated;

-- notifications : les siennes (aucune insertion par l'API) ---------------------
create policy "notifications_select_own" on public.notifications for select to authenticated
  using (user_id = (select auth.uid()));
create policy "notifications_update_own" on public.notifications for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "notifications_delete_own" on public.notifications for delete to authenticated
  using (user_id = (select auth.uid()));
grant select, delete on public.notifications to authenticated;
grant update (read_at) on public.notifications to authenticated;

-- reports : tout connecté signale, le support lit et traite ------------------
create policy "reports_insert_own" on public.reports for insert to authenticated
  with check (reporter_id = (select auth.uid()) and status = 'open' and handled_at is null);
create policy "reports_select_support" on public.reports for select to authenticated
  using (private.is_support() or reporter_id = (select auth.uid()));   -- le support lit tout ; chacun relit SES signalements (INSERT … RETURNING)
create policy "reports_update_support" on public.reports for update to authenticated
  using (private.is_support()) with check (private.is_support());
grant select on public.reports to authenticated;
grant insert (recipe_id, reporter_id, reason, details) on public.reports to authenticated;
grant update (status, handled_at) on public.reports to authenticated;

-- system_alerts : lecture par le support (écriture par le serveur) -----------
create policy "system_alerts_select_support" on public.system_alerts for select to authenticated
  using (private.is_support());
grant select on public.system_alerts to authenticated;

-- dismissed_prompts : les siennes ---------------------------------------------
create policy "dismissed_prompts_select_own" on public.dismissed_prompts for select to authenticated
  using (user_id = (select auth.uid()));
create policy "dismissed_prompts_insert_own" on public.dismissed_prompts for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy "dismissed_prompts_delete_own" on public.dismissed_prompts for delete to authenticated
  using (user_id = (select auth.uid()));
grant select, delete on public.dismissed_prompts to authenticated;
grant insert (user_id, kind, target_id) on public.dismissed_prompts to authenticated;

-- profiles : l'e-mail n'est pas modifiable par l'API (CHOIX n° 13). Le droit de table `update` est retiré puis rendu
-- colonne par colonne (un `revoke update (email)` seul n'aurait AUCUN effet tant que le droit de table subsiste).
revoke update on public.profiles from anon, authenticated;
grant update (name, role, language, theme, notifications, display_name, cookbook_title, theme_settings,
              active_theme_group_id, discoverable, onboarded_at) on public.profiles to authenticated;

-- ----------------------------------------------------------------------------
-- 5. RPC publiques
-- ----------------------------------------------------------------------------
-- Recherche d'une personne par nom : ≥ 3 lettres, respecte `discoverable`, jamais l'e-mail
create or replace function public.search_users(p_query text)
returns table (id uuid, display_name text)
language sql stable security definer set search_path = '' as $$
  with q as (
    select lower(public.immutable_unaccent(btrim(coalesce(p_query, '')))) as s
  )
  select p.id, p.display_name
    from public.profiles p, q
   where (select auth.uid()) is not null
     and char_length(q.s) >= 3
     and p.id <> (select auth.uid())
     and p.discoverable
     and p.display_name is not null
     and lower(public.immutable_unaccent(p.display_name))
         like '%' || replace(replace(replace(q.s, '\', '\\'), '%', '\%'), '_', '\_') || '%'
   order by (lower(public.immutable_unaccent(p.display_name))
             like replace(replace(replace(q.s, '\', '\\'), '%', '\%'), '_', '\_') || '%') desc,
            p.display_name, p.id
   limit 20
$$;
comment on function public.search_users(text) is
  'Recherche par nom d''affichage (≥ 3 lettres, discoverable seulement, jamais soi-même, jamais l''e-mail). 0019.';

-- Noms d'affichage des personnes LIÉES à moi (voir private.can_see_profile)
create or replace function public.get_public_profiles(p_ids uuid[])
returns table (id uuid, display_name text, cookbook_title text)
language sql stable security definer set search_path = '' as $$
  select p.id, p.display_name, p.cookbook_title
    from public.profiles p
   where p.id = any (p_ids[1:100])
     and private.can_see_profile(p.id)
$$;
comment on function public.get_public_profiles(uuid[]) is
  'display_name et cookbook_title des personnes liées à l''appelant (soi, groupe, amis, demande en cours, auteur lisible). Jamais l''e-mail. 0019.';

-- Ajoute au carnet, en un appel, toutes les recettes d'un auteur que je peux lire ; ferme sa bannière
create or replace function public.add_author_recipes_to_cookbook(p_author uuid)
returns integer
language plpgsql security invoker set search_path = public, pg_temp as $$
declare
  v_me uuid := (select auth.uid());
  v_n  integer;
begin
  if v_me is null then
    raise exception 'Connexion requise' using errcode = '42501';
  end if;
  if p_author is null or p_author = v_me then
    return 0;
  end if;
  insert into public.cookbook_entries (user_id, recipe_id)
  select v_me, r.id
    from public.recipes r
   where r.owner_id = p_author and private.can_read_recipe(r.id)
  on conflict (user_id, recipe_id) do nothing;
  get diagnostics v_n = row_count;
  insert into public.dismissed_prompts (user_id, kind, target_id)
  values (v_me, 'author_recipes', p_author)
  on conflict do nothing;
  return v_n;
end $$;
comment on function public.add_author_recipes_to_cookbook(uuid) is
  'Ajoute au carnet (références) toutes les recettes de l''auteur que l''appelant peut lire. Idempotente ; renvoie le nombre d''ajouts nouveaux ; ferme la bannière « Explorer les recettes de X ». 0019.';

revoke execute on function public.search_users(text), public.get_public_profiles(uuid[]),
                           public.add_author_recipes_to_cookbook(uuid) from public, anon;
grant execute on function public.search_users(text), public.get_public_profiles(uuid[]),
                          public.add_author_recipes_to_cookbook(uuid) to authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 6. Vérifications finales
-- ----------------------------------------------------------------------------
do $$
declare b record; t text; n bigint;
begin
  select * into b from private.tmp_0019_before;
  assert (select count(*) from public.recipes) = b.n_recipes and (select count(*) from public.profiles) = b.n_profiles,
    '[0019] des données ont changé';

  -- sans effet pour la v1 : politiques et fonctions existantes strictement inchangées
  assert (select md5(coalesce(string_agg(
                concat_ws('|', schemaname, tablename, policyname, cmd, roles::text, qual, with_check),
                E'\n' order by schemaname, tablename, policyname), ''))
            from pg_policies
           where schemaname in ('public', 'storage')
             and tablename not in ('categories', 'groups', 'group_members', 'friendships', 'invitations',
                                   'recipe_grants', 'recipe_share_links', 'cookbook_entries',
                                   'notifications', 'reports', 'system_alerts', 'dismissed_prompts')) = b.policies_md5,
    '[0019] une politique existante a changé';
  assert (select md5(coalesce(string_agg(pg_get_functiondef(p.oid), E'\n' order by p.oid::regprocedure::text), ''))
            from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
           where ns.nspname = 'public'
             and p.proname not in ('search_users', 'get_public_profiles', 'add_author_recipes_to_cookbook')) = b.functions_md5,
    '[0019] une fonction existante du schéma public a changé';

  -- 12 tables : RLS, au moins une politique, uniquement `to authenticated`, rien pour anon
  foreach t in array array['categories', 'groups', 'group_members', 'friendships', 'invitations',
                           'recipe_grants', 'recipe_share_links', 'cookbook_entries',
                           'notifications', 'reports', 'system_alerts', 'dismissed_prompts'] loop
    assert (select relrowsecurity from pg_class where oid = format('public.%I', t)::regclass), format('[0019] RLS off sur %s', t);
    assert exists (select 1 from pg_policies where schemaname = 'public' and tablename = t), format('[0019] aucune politique sur %s', t);
    assert not exists (select 1 from pg_policies where schemaname = 'public' and tablename = t and roles <> '{authenticated}'),
      format('[0019] politique non limitée à authenticated sur %s', t);
    assert not has_any_column_privilege('anon', format('public.%I', t), 'select, insert, update, references')
       and not has_table_privilege('anon', format('public.%I', t), 'delete'),
      format('[0019] anon a un droit sur %s', t);
    assert not has_table_privilege('authenticated', format('public.%I', t), 'truncate'), format('[0019] truncate sur %s', t);
  end loop;

  -- e-mail et jeton d'invitation jamais lisibles ; jeton de lien public lisible seulement via politique auteur
  assert not has_column_privilege('authenticated', 'public.invitations', 'token_hash', 'select'), '[0019] token_hash lisible';
  assert not has_column_privilege('authenticated', 'public.invitations', 'token_hash', 'insert'), '[0019] token_hash écrivable';
  assert not has_column_privilege('authenticated', 'public.groups', 'created_by', 'update'), '[0019] groups.created_by modifiable';
  assert not has_column_privilege('authenticated', 'public.friendships', 'requester_id', 'update'), '[0019] friendships.requester_id modifiable';
  assert not has_column_privilege('authenticated', 'public.profiles', 'email', 'update')
     and not has_column_privilege('anon', 'public.profiles', 'email', 'update'), '[0019] profiles.email modifiable';
  assert not has_column_privilege('authenticated', 'public.profiles', 'id', 'update'), '[0019] profiles.id modifiable';
  assert has_column_privilege('authenticated', 'public.profiles', 'name', 'update')
     and has_column_privilege('authenticated', 'public.profiles', 'language', 'update')
     and has_column_privilege('authenticated', 'public.profiles', 'display_name', 'update'), '[0019] colonnes du profil non modifiables';

  -- fonctions d'aide : pas d'exécution par anon, search_path vide, security definer
  assert not exists (
    select 1 from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
     where ns.nspname = 'private' and p.proname in ('is_group_member', 'shares_group_with', 'are_friends', 'can_read_recipe',
                                                     'can_copy_recipe', 'can_edit_recipe', 'is_support', 'recipe_level')
       and (not p.prosecdef or p.provolatile <> 's' or p.proconfig is null or not ('search_path=""' = any (p.proconfig))
            or has_function_privilege('anon', p.oid, 'execute') or not has_function_privilege('authenticated', p.oid, 'execute'))),
    '[0019] une fonction d''aide n''est pas security definer / stable / search_path vide, ou mal verrouillée';

  select count(*) into n from pg_policies where schemaname = 'public'
   and tablename in ('categories', 'groups', 'group_members', 'friendships', 'invitations', 'recipe_grants',
                     'recipe_share_links', 'cookbook_entries', 'notifications', 'reports', 'system_alerts', 'dismissed_prompts');
  raise notice '[0019] helpers + % politiques sur 12 tables sociales ; politiques et fonctions existantes inchangées', n;
end $$;

drop table if exists private.tmp_0019_before;

notify pgrst, 'reload schema';

commit;
