-- ============================================================================
--  0026 — recipe_access(p_recipe) : mon niveau de droit sur UNE recette, phase 6B
-- ============================================================================
--  QUOI
--   Une fonction de lecture, `public.recipe_access(p_recipe uuid)`, qui dit à l'interface (fiche recette, bouton « Partager »,
--   éditeur) ce que la personne connectée peut faire d'une recette qu'elle sait lire. Une seule ligne, ou AUCUNE ligne si la
--   recette est inconnue ou illisible (on ne distingue pas les deux : pas d'oracle d'existence).
--   Colonnes : permission (author | edit_original | copy | read), explicit_permission (le droit EXPLICITE le plus haut que je
--   détiens, NULL si mon accès ne vient que du partage implicite « mes groupes » : seul un droit explicite se repartage),
--   in_cookbook, owner_id, owner_name (pseudonyme), visibility, category_id (celle de l'auteur : NULL pour les autres),
--   copied_from + copied_from_title (seulement si l'original est lisible par moi), has_share_link (auteur seulement).
--
--  POURQUOI
--   Le niveau de droit (`private.recipe_level`) n'est pas exposé à l'API, et les trois listes de 0021 ne le renvoient que pour
--   les recettes qu'elles listent. La fiche d'une recette ouverte par un lien, une bannière ou « Partagées avec moi » doit pouvoir
--   afficher les bons boutons. Cette fonction ne DÉCIDE rien : la base continue de refuser (42501) ce qui n'est pas permis ;
--   l'interface s'en sert seulement pour ne pas proposer un bouton voué à l'échec.
--
--  CHOIX DE CONCEPTION
--   1. Même modèle que 0021 : SECURITY DEFINER, search_path vide, lit auth.uid(), jamais PUBLIC ni anon.
--   2. Aucune table, colonne, politique ni donnée touchée : sans effet sur la v1. Compatible SQL Editor.
--   3. Le support n'a pas de niveau (comme recipe_level) : une recette qu'il ne lit que parce qu'elle est signalée renvoie
--      `permission = 'read'` ; il ne peut rien modifier de plus.
--   4. Pas d'e-mail, jamais : le pseudonyme de l'auteur est déjà donné par list_cookbook pour toute recette lisible.
--
--  Retour arrière : supabase/rollback/0026_recipe_access_down.sql. Prérequis : 0019 et 0021.
-- ============================================================================
begin;

do $$
begin
  assert to_regprocedure('private.recipe_level(uuid)') is not null, '[0026] 0019 absente : appliquer 0019 d''abord';
  assert to_regprocedure('public.list_cookbook(uuid, text, integer, integer)') is not null, '[0026] 0021 absente : appliquer 0021 d''abord';
end $$;

create or replace function public.recipe_access(p_recipe uuid)
returns table (
  permission          text,
  explicit_permission text,
  in_cookbook         boolean,
  owner_id            uuid,
  owner_name          text,
  visibility          text,
  category_id         uuid,
  copied_from         uuid,
  copied_from_title   text,
  has_share_link      boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_me    uuid := (select auth.uid());
  v_level int;
begin
  if v_me is null then
    raise exception 'Connexion requise' using errcode = '42501';
  end if;
  if p_recipe is null or not private.can_read_recipe(p_recipe) then
    return;                                   -- inconnue ou illisible : aucune ligne
  end if;
  v_level := private.recipe_level(p_recipe);
  return query
    select case greatest(v_level, 1) when 4 then 'author' when 3 then 'edit_original' when 2 then 'copy' else 'read' end,
           case when v_level = 4 then null
                else (select case max(private.permission_rank(g.permission))
                               when 3 then 'edit_original' when 2 then 'copy' when 1 then 'read' end
                        from public.recipe_grants g
                       where g.recipe_id = r.id
                         and (g.grantee_user_id = v_me
                              or g.grantee_group_id in (select m.group_id from public.group_members m where m.user_id = v_me)))
           end,
           exists (select 1 from public.cookbook_entries e where e.user_id = v_me and e.recipe_id = r.id),
           r.owner_id,
           pr.display_name,
           r.visibility,
           case when r.owner_id = v_me then r.category_id end,
           case when r.copied_from is not null and private.can_read_recipe(r.copied_from) then r.copied_from end,
           case when r.copied_from is not null and private.can_read_recipe(r.copied_from)
                then (select o.title from public.recipes o where o.id = r.copied_from) end,
           (r.owner_id = v_me and exists (select 1 from public.recipe_share_links l where l.recipe_id = r.id))
      from public.recipes r
      left join public.profiles pr on pr.id = r.owner_id
     where r.id = p_recipe;
end;
$$;
comment on function public.recipe_access(uuid) is
  'Mon niveau de droit sur une recette lisible (author | edit_original | copy | read), mon droit explicite le plus haut (seul un droit explicite se repartage), présence dans mon carnet, auteur (pseudonyme), visibilité, catégorie (auteur seulement), original lisible d''une copie, lien public actif (auteur seulement). Aucune ligne si la recette est inconnue ou illisible. Informatif : la base décide. 0026.';

revoke execute on function public.recipe_access(uuid) from public, anon;
grant execute on function public.recipe_access(uuid) to authenticated, service_role;

-- Contrôle d'ensemble : une fonction de plus, security definer, search_path vide, jamais PUBLIC ni anon
do $$
declare r record;
begin
  select p.oid, p.prosecdef, p.proconfig into r
    from pg_proc p where p.oid = 'public.recipe_access(uuid)'::regprocedure;
  assert r.prosecdef, '[0026] recipe_access n''est pas security definer';
  assert r.proconfig is not null and 'search_path=""' = any (r.proconfig), '[0026] search_path non vide';
  assert has_function_privilege('authenticated', r.oid, 'execute') and not has_function_privilege('anon', r.oid, 'execute'),
    '[0026] droits d''exécution inattendus';
  assert not exists (select 1 from pg_proc x, aclexplode(coalesce(x.proacl, acldefault('f', x.proowner))) a
                      where x.oid = r.oid and a.grantee = 0), '[0026] exécutable par PUBLIC';
  raise notice '[0026] recipe_access créée ; aucune table, politique ni donnée touchée';
end $$;

notify pgrst, 'reload schema';

commit;
