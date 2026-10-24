-- ============================================================================
--  0029 — shared_recipe_photo_path(p_token) : chemin de la photo derrière un lien public, phase 8
-- ============================================================================
--  QUOI
--   Une fonction, `public.shared_recipe_photo_path(uuid)`, qui renvoie le chemin de la photo (bucket `recipe-photos`) de la
--   recette derrière un jeton de lien public actif, sinon NULL (jeton inconnu, révoqué, ou recette sans photo).
--
--  POURQUOI
--   Une fois le bucket privé (bascule `supabase/v2/0029_private_photos_switchover.sql`), un visiteur sans compte ne peut plus
--   lire la photo d'une recette partagée par lien. La page `/r/<jeton>` l'affiche par une route SERVEUR
--   (`/api/v2/shared/<jeton>/photo`) qui vérifie le jeton avec cette fonction puis signe une URL de 2 minutes avec la clé
--   service_role. `get_shared_recipe` (0021) ne renvoie volontairement ni identifiant ni `photo_path` (il contient l'id de la
--   recette) : d'où cette fonction à part.
--
--  CHOIX DE CONCEPTION
--   1. SECURITY DEFINER, search_path vide. Exécutable par `service_role` SEULEMENT (ni PUBLIC, ni anon, ni authenticated) : le
--      chemin contient l'identifiant de la recette, que le navigateur ne doit jamais recevoir. Seule la route serveur l'appelle.
--   2. Même condition de jeton que `get_shared_recipe` (une ligne de `recipe_share_links` = un lien actif).
--   3. Aucune table, colonne, politique ni donnée modifiée : sans effet sur la v1 (aucun lien public n'existe en v1).
--      Compatible avec le SQL Editor de Supabase (aucune table temporaire).
--
--  Retour arrière : supabase/rollback/0029_shared_recipe_photo_down.sql. Prérequis : 0010 (photo_path), 0017 (recipe_share_links).
-- ============================================================================
begin;

do $$
begin
  assert to_regclass('public.recipe_share_links') is not null, '[0029] recipe_share_links absente : appliquer 0017 / 0021 d''abord';
  assert exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'recipes' and column_name = 'photo_path'),
    '[0029] recipes.photo_path absente : appliquer 0010 d''abord';
end $$;

create or replace function public.shared_recipe_photo_path(p_token uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select r.photo_path
    from public.recipe_share_links l
    join public.recipes r on r.id = l.recipe_id
   where l.token = p_token
$$;
comment on function public.shared_recipe_photo_path(uuid) is
  'Chemin de la photo (bucket recipe-photos) de la recette derrière un lien public actif, sinon NULL. Réservée à service_role : appelée par la route serveur /api/v2/shared/<jeton>/photo, qui signe ensuite une URL courte. 0029.';

revoke execute on function public.shared_recipe_photo_path(uuid) from public, anon, authenticated;
grant execute on function public.shared_recipe_photo_path(uuid) to service_role;

do $$
begin
  assert has_function_privilege('service_role', 'public.shared_recipe_photo_path(uuid)', 'execute'), '[0029] service_role doit pouvoir exécuter';
  assert not has_function_privilege('anon', 'public.shared_recipe_photo_path(uuid)', 'execute'), '[0029] anon ne doit pas pouvoir exécuter';
  assert not has_function_privilege('authenticated', 'public.shared_recipe_photo_path(uuid)', 'execute'), '[0029] authenticated ne doit pas pouvoir exécuter';
end $$;

notify pgrst, 'reload schema';
commit;
