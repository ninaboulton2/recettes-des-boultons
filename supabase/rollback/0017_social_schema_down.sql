-- ============================================================================
--  Retour arrière de 0017 — schéma social v2
-- ============================================================================
--  QUAND : pour revenir à l'état d'avant 0017 (aucun code ne dépend encore de
--  ces objets tant que les phases 3 et suivantes ne sont pas déployées).
--  ⚠️ SUPPRIME toutes les données des tables sociales (groupes, membres, amitiés,
--  invitations, droits, liens publics, carnets, notifications, signalements,
--  alertes, catégories par personne) et les colonnes `recipes.owner_id /
--  visibility / copied_from / category_id` et `profiles.display_name /
--  cookbook_title / theme_settings / active_theme_group_id / discoverable /
--  onboarded_at`. Après le remplissage (0018), exporter ces données avant.
--  Les recettes, sections, ingrédients, étapes, favoris, planning, listes et
--  politiques RLS existantes ne sont pas touchés.
--
--  QUOI (inverse de 0017, dans l'ordre inverse)
--   1. colonnes ajoutées à profiles, puis à recipes
--   2. tables : system_alerts, reports, notifications, cookbook_entries,
--      recipe_share_links, recipe_grants, invitations, friendships,
--      group_members, groups, categories
--
--  Rejouable : tout est `if exists`.
-- ============================================================================

begin;

-- Compte rendu de ce qui va disparaître
do $$
declare t text; n bigint; msg text := '';
begin
  foreach t in array array['categories', 'groups', 'group_members', 'friendships', 'invitations',
                           'recipe_grants', 'recipe_share_links', 'cookbook_entries',
                           'notifications', 'reports', 'system_alerts'] loop
    if to_regclass(format('public.%I', t)) is not null then
      execute format('select count(*) from public.%I', t) into n;
      msg := msg || format('%s=%s ', t, n);
    end if;
  end loop;
  raise notice '[0017 down] lignes supprimées : %', coalesce(nullif(msg, ''), '(tables déjà absentes)');
end $$;

-- 1. Colonnes (les contraintes et index associés partent avec elles)
alter table public.profiles
  drop column if exists display_name,
  drop column if exists cookbook_title,
  drop column if exists theme_settings,
  drop column if exists active_theme_group_id,
  drop column if exists discoverable,
  drop column if exists onboarded_at;

alter table public.recipes
  drop column if exists owner_id,
  drop column if exists visibility,
  drop column if exists copied_from,
  drop column if exists category_id;

-- 2. Tables (ordre inverse des dépendances)
drop table if exists public.system_alerts;
drop table if exists public.reports;
drop table if exists public.notifications;
drop table if exists public.cookbook_entries;
drop table if exists public.recipe_share_links;
drop table if exists public.recipe_grants;
drop table if exists public.invitations;
drop table if exists public.friendships;
drop table if exists public.group_members;
drop table if exists public.groups;
drop table if exists public.categories;

-- Vérifications
do $$
declare t text;
begin
  foreach t in array array['categories', 'groups', 'group_members', 'friendships', 'invitations',
                           'recipe_grants', 'recipe_share_links', 'cookbook_entries',
                           'notifications', 'reports', 'system_alerts'] loop
    assert to_regclass(format('public.%I', t)) is null, format('[0017 down] %s existe encore', t);
  end loop;
  assert not exists (select 1 from information_schema.columns
                      where table_schema = 'public' and table_name = 'recipes'
                        and column_name in ('owner_id', 'visibility', 'copied_from', 'category_id')),
    '[0017 down] colonnes de recipes encore présentes';
  assert not exists (select 1 from information_schema.columns
                      where table_schema = 'public' and table_name = 'profiles'
                        and column_name in ('display_name', 'cookbook_title', 'theme_settings',
                                            'active_theme_group_id', 'discoverable', 'onboarded_at')),
    '[0017 down] colonnes de profiles encore présentes';
  raise notice '[0017 down] schéma social retiré';
end $$;

notify pgrst, 'reload schema';

commit;
