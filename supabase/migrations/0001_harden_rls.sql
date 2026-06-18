-- ============================================================================
--  Durcissement de la sécurité base de données — Recettes des Boultons
-- ============================================================================
--  ⚠️  À APPLIQUER UNIQUEMENT APRÈS avoir déployé le nouveau code applicatif
--      (serveur + client) sur Vercel.
--
--  Avant ce code, le site envoie ses requêtes avec la clé anon SANS token
--  utilisateur. Tant que l'ancien code tourne en prod, appliquer cette
--  migration CASSERA l'admin et les fonctionnalités courses/planning/favoris.
--
--  Ce que fait cette migration :
--   1. Crée une fonction is_admin() fiable (security definer, search_path fixe).
--   2. Remplace les politiques "tout public" par :
--        - lecture publique du contenu recettes (le site se consulte sans compte)
--        - écriture du contenu recettes réservée aux admins
--        - données personnelles (favoris/planning/notes/courses) limitées à
--          leur propriétaire via auth.uid() = user_id
--        - profiles : chacun ne voit/modifie que sa ligne ; un trigger empêche
--          un non-admin de changer son rôle (anti-escalade de privilèges)
--   3. Révoque l'exécution par anon/public des fonctions SECURITY DEFINER
--      (elles contournent le RLS et étaient appelables directement par anon).
--   4. Fixe un search_path sûr sur toutes les fonctions (corrige l'advisor
--      "Function Search Path Mutable").
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- 1. Fonction utilitaire is_admin()
-- ----------------------------------------------------------------------------
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

-- is_admin() renvoie false pour anon (auth.uid() est null) : aucune fuite.
-- On l'autorise à anon ET authenticated pour éviter les erreurs d'évaluation
-- des politiques RLS qui l'appellent.
grant execute on function public.is_admin() to anon, authenticated;

-- ----------------------------------------------------------------------------
-- 2. Table rase : suppression de toutes les politiques permissives existantes
-- ----------------------------------------------------------------------------
do $$
declare
  pol record;
  tbl text;
  tables text[] := array[
    'recipes','recipe_sections','recipe_ingredients','instructions',
    'favorites','planning','planning_notes','shopping_lists','shopping_items',
    'profiles'
  ];
begin
  foreach tbl in array tables loop
    execute format('alter table public.%I enable row level security', tbl);
    for pol in
      select policyname from pg_policies
      where schemaname = 'public' and tablename = tbl
    loop
      execute format('drop policy if exists %I on public.%I', pol.policyname, tbl);
    end loop;
  end loop;
end $$;

-- ----------------------------------------------------------------------------
-- 3. Contenu recettes : lecture publique, écriture admin
-- ----------------------------------------------------------------------------
-- recipes
create policy "recipes_read_public"  on public.recipes for select using (true);
create policy "recipes_admin_insert" on public.recipes for insert with check (public.is_admin());
create policy "recipes_admin_update" on public.recipes for update using (public.is_admin()) with check (public.is_admin());
create policy "recipes_admin_delete" on public.recipes for delete using (public.is_admin());

-- recipe_sections
create policy "sections_read_public"  on public.recipe_sections for select using (true);
create policy "sections_admin_insert" on public.recipe_sections for insert with check (public.is_admin());
create policy "sections_admin_update" on public.recipe_sections for update using (public.is_admin()) with check (public.is_admin());
create policy "sections_admin_delete" on public.recipe_sections for delete using (public.is_admin());

-- recipe_ingredients
create policy "ingredients_read_public"  on public.recipe_ingredients for select using (true);
create policy "ingredients_admin_insert" on public.recipe_ingredients for insert with check (public.is_admin());
create policy "ingredients_admin_update" on public.recipe_ingredients for update using (public.is_admin()) with check (public.is_admin());
create policy "ingredients_admin_delete" on public.recipe_ingredients for delete using (public.is_admin());

-- instructions
create policy "instructions_read_public"  on public.instructions for select using (true);
create policy "instructions_admin_insert" on public.instructions for insert with check (public.is_admin());
create policy "instructions_admin_update" on public.instructions for update using (public.is_admin()) with check (public.is_admin());
create policy "instructions_admin_delete" on public.instructions for delete using (public.is_admin());

-- ----------------------------------------------------------------------------
-- 4. Données personnelles : propriétaire uniquement (auth.uid() = user_id)
-- ----------------------------------------------------------------------------
-- favorites
create policy "favorites_owner_select" on public.favorites for select using (auth.uid() = user_id);
create policy "favorites_owner_insert" on public.favorites for insert with check (auth.uid() = user_id);
create policy "favorites_owner_update" on public.favorites for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "favorites_owner_delete" on public.favorites for delete using (auth.uid() = user_id);

-- planning
create policy "planning_owner_select" on public.planning for select using (auth.uid() = user_id);
create policy "planning_owner_insert" on public.planning for insert with check (auth.uid() = user_id);
create policy "planning_owner_update" on public.planning for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "planning_owner_delete" on public.planning for delete using (auth.uid() = user_id);

-- planning_notes
create policy "pnotes_owner_select" on public.planning_notes for select using (auth.uid() = user_id);
create policy "pnotes_owner_insert" on public.planning_notes for insert with check (auth.uid() = user_id);
create policy "pnotes_owner_update" on public.planning_notes for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "pnotes_owner_delete" on public.planning_notes for delete using (auth.uid() = user_id);

-- shopping_lists
create policy "slists_owner_select" on public.shopping_lists for select using (auth.uid() = user_id);
create policy "slists_owner_insert" on public.shopping_lists for insert with check (auth.uid() = user_id);
create policy "slists_owner_update" on public.shopping_lists for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "slists_owner_delete" on public.shopping_lists for delete using (auth.uid() = user_id);

-- shopping_items : pas de user_id direct — la propriété passe par la liste parente
create policy "sitems_owner_select" on public.shopping_items for select
  using (exists (select 1 from public.shopping_lists l where l.id = list_id and l.user_id = auth.uid()));
create policy "sitems_owner_insert" on public.shopping_items for insert
  with check (exists (select 1 from public.shopping_lists l where l.id = list_id and l.user_id = auth.uid()));
create policy "sitems_owner_update" on public.shopping_items for update
  using (exists (select 1 from public.shopping_lists l where l.id = list_id and l.user_id = auth.uid()))
  with check (exists (select 1 from public.shopping_lists l where l.id = list_id and l.user_id = auth.uid()));
create policy "sitems_owner_delete" on public.shopping_items for delete
  using (exists (select 1 from public.shopping_lists l where l.id = list_id and l.user_id = auth.uid()));

-- ----------------------------------------------------------------------------
-- 5. profiles : sa propre ligne (ou admin), pas de changement de rôle non-admin
-- ----------------------------------------------------------------------------
create policy "profiles_select_self_or_admin" on public.profiles for select
  using (auth.uid() = id or public.is_admin());
create policy "profiles_insert_self" on public.profiles for insert
  with check (auth.uid() = id);
create policy "profiles_update_self_or_admin" on public.profiles for update
  using (auth.uid() = id or public.is_admin())
  with check (auth.uid() = id or public.is_admin());
-- (aucune politique DELETE : la suppression de profil n'est pas autorisée)

-- Trigger anti-escalade : un non-admin ne peut pas modifier la colonne role.
create or replace function public.prevent_role_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.role is distinct from old.role and not public.is_admin() then
    raise exception 'Modification du rôle non autorisée';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_prevent_role_change on public.profiles;
create trigger trg_prevent_role_change
  before update on public.profiles
  for each row execute function public.prevent_role_change();

-- ----------------------------------------------------------------------------
-- 6. Verrouillage des fonctions SECURITY DEFINER (contournent le RLS)
--    Elles étaient appelables directement par anon → on retire cet accès.
--    authenticated/service_role conservent leurs droits explicites : le code
--    serveur (qui agit avec le token de l'utilisateur = rôle authenticated)
--    continue de fonctionner.
-- ----------------------------------------------------------------------------
do $$
declare
  r record;
begin
  for r in
    select p.oid::regprocedure as sig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prosecdef
  loop
    execute format('revoke execute on function %s from anon, public', r.sig);
  end loop;
end $$;

-- 6b. Neutralisation des fonctions SECURITY DEFINER NON UTILISÉES par le code.
--     (Confirmé par recherche : seules get_recipe_by_id, add_user_favorite,
--      delete_user_favorite_by_id, delete_user_favorite_by_recipe sont appelées.)
--     On retire aussi l'exécution par authenticated pour fermer tout IDOR
--     résiduel (ces fonctions prennent un user_id en paramètre et contournent
--     le RLS). Si une fonction venait à être réutilisée, ajuster ici.
revoke execute on function public.add_shopping_item(uuid, text, text, text, uuid)            from public, anon, authenticated;
revoke execute on function public.check_user_favorite_exists(uuid, uuid)                     from public, anon, authenticated;
revoke execute on function public.create_user_shopping_list(uuid, text)                      from public, anon, authenticated;
revoke execute on function public.delete_shopping_item(uuid, uuid)                           from public, anon, authenticated;
revoke execute on function public.delete_user_shopping_list(uuid, uuid)                      from public, anon, authenticated;
revoke execute on function public.get_shopping_list_items(uuid)                              from public, anon, authenticated;
revoke execute on function public.get_user_favorites(uuid)                                   from public, anon, authenticated;
revoke execute on function public.get_user_shopping_lists(uuid)                              from public, anon, authenticated;
revoke execute on function public.remove_user_favorite(uuid, uuid)                           from public, anon, authenticated;
revoke execute on function public.update_shopping_item(uuid, uuid, text, text, text, boolean) from public, anon, authenticated;
revoke execute on function public.update_user_shopping_list(uuid, uuid, text)               from public, anon, authenticated;

-- ----------------------------------------------------------------------------
-- 7. search_path sûr sur toutes les fonctions du schéma public
--    (corrige l'advisor "Function Search Path Mutable")
-- ----------------------------------------------------------------------------
do $$
declare
  r record;
begin
  for r in
    select p.oid::regprocedure as sig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
  loop
    execute format('alter function %s set search_path = public, pg_temp', r.sig);
  end loop;
end $$;

commit;

-- ============================================================================
--  Vérification post-migration (à lancer séparément) :
--
--    select tablename, policyname, cmd, roles
--    from pg_policies where schemaname='public' order by tablename, cmd;
--
--  Puis relancer l'advisor de sécurité Supabase : les 19 "RLS Policy Always
--  True" et les "Public Can Execute SECURITY DEFINER Function" doivent
--  disparaître.
-- ============================================================================
