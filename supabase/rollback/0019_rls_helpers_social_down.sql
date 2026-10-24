-- ============================================================================
--  Retour arrière de 0019 — fonctions d'aide RLS et politiques des tables sociales
-- ============================================================================
--  QUAND : pour revenir à l'état d'après 0017 (tables sociales fermées à l'API).
--  PRÉREQUIS : la bascule (v2/0020) doit être retirée AVANT (ses politiques
--  appellent les fonctions private.*) : rollback/0020_rls_switchover_down.sql.
--  ⚠️ Supprime la table `dismissed_prompts` (bannières fermées) et ses données.
--  Les 11 tables de 0017 gardent leurs données mais redeviennent fermées
--  (RLS sans politique, aucun droit pour anon / authenticated).
--  Rejouable : tout est `if exists`.
-- ============================================================================

begin;

do $$
begin
  if to_regprocedure('private.recipes_guard_owner_fields()') is not null then
    raise exception '[0019 down] retirer d''abord la bascule : rollback/0020_rls_switchover_down.sql';
  end if;
end $$;

-- 1. Politiques et droits des tables sociales
do $$
declare pol record; t text;
begin
  for pol in select policyname, tablename from pg_policies
              where schemaname = 'public'
                and tablename in ('categories', 'groups', 'group_members', 'friendships', 'invitations',
                                  'recipe_grants', 'recipe_share_links', 'cookbook_entries',
                                  'notifications', 'reports', 'system_alerts', 'dismissed_prompts') loop
    execute format('drop policy %I on public.%I', pol.policyname, pol.tablename);
  end loop;
  foreach t in array array['categories', 'groups', 'group_members', 'friendships', 'invitations',
                           'recipe_grants', 'recipe_share_links', 'cookbook_entries',
                           'notifications', 'reports', 'system_alerts'] loop
    if to_regclass(format('public.%I', t)) is not null then
      execute format('revoke all on public.%I from public, anon, authenticated', t);
    end if;
  end loop;
end $$;

-- 2. Déclencheurs
drop trigger if exists trg_group_member_added   on public.group_members;
drop trigger if exists trg_group_member_removed on public.group_members;
drop trigger if exists trg_friendship_removed   on public.friendships;
drop trigger if exists trg_grant_lowered        on public.recipe_grants;
drop function if exists private.on_group_member_added();
drop function if exists private.on_group_member_removed();
drop function if exists private.on_friendship_removed();
drop function if exists private.on_grant_lowered();

-- 3. RPC publiques
drop function if exists public.search_users(text);
drop function if exists public.get_public_profiles(uuid[]);
drop function if exists public.add_author_recipes_to_cookbook(uuid);

-- 4. Bannières fermées
drop table if exists public.dismissed_prompts;

-- 5. Fonctions d'aide (private.is_admin() reste : 0009)
drop function if exists private.recipe_id_from_path(text);
drop function if exists private.can_create_grant(uuid, uuid, uuid, text, text, uuid, uuid);
drop function if exists private.can_see_profile(uuid);
drop function if exists private.can_edit_recipe(uuid);
drop function if exists private.can_copy_recipe(uuid);
drop function if exists private.can_read_recipe(uuid);
drop function if exists private.recipe_level(uuid);
drop function if exists private.is_recipe_owner(uuid);
drop function if exists private.are_friends(uuid);
drop function if exists private.shares_group_with(uuid);
drop function if exists private.has_pending_group_invite(uuid);
drop function if exists private.group_is_empty(uuid);
drop function if exists private.is_group_creator(uuid);
drop function if exists private.is_group_member(uuid);
drop function if exists private.is_support();
drop function if exists private.permission_rank(text);

do $$
begin
  assert to_regclass('public.dismissed_prompts') is null, '[0019 down] dismissed_prompts existe encore';
  assert to_regprocedure('private.can_read_recipe(uuid)') is null and to_regprocedure('public.search_users(text)') is null,
    '[0019 down] fonctions encore présentes';
  assert to_regprocedure('private.is_admin()') is not null, '[0019 down] private.is_admin() doit rester';
  assert not exists (select 1 from pg_policies where schemaname = 'public'
                      and tablename in ('categories', 'groups', 'group_members', 'friendships', 'invitations', 'recipe_grants',
                                        'recipe_share_links', 'cookbook_entries', 'notifications', 'reports', 'system_alerts')),
    '[0019 down] des politiques subsistent';
  raise notice '[0019 down] retiré : les tables sociales sont de nouveau fermées à l''API';
end $$;

notify pgrst, 'reload schema';

commit;
