-- ============================================================================
--  Suppression des fonctions SECURITY DEFINER devenues inutiles
-- ============================================================================
--  ⚠️  À APPLIQUER APRÈS le déploiement du code qui n'utilise plus ces RPC
--      (favorites/planning passent désormais en accès direct sous RLS).
--
--  - Les 4 fonctions favoris contournaient le RLS et prenaient un user_id en
--    paramètre (IDOR résiduel entre utilisateurs connectés) → supprimées.
--  - 11 fonctions SECURITY DEFINER n'étaient appelées nulle part → supprimées.
--  - prevent_role_change / handle_new_user restent (triggers) mais on retire
--    leur exécution directe via l'API (elles se déclenchent quand même).
-- ============================================================================

-- Fonctions favoris (désormais remplacées par de l'accès direct)
drop function if exists public.get_recipe_by_id(uuid);
drop function if exists public.add_user_favorite(uuid, uuid);
drop function if exists public.delete_user_favorite_by_id(uuid, uuid);
drop function if exists public.delete_user_favorite_by_recipe(uuid, uuid);

-- Fonctions jamais utilisées par l'application
drop function if exists public.add_shopping_item(uuid, text, text, text, uuid);
drop function if exists public.check_user_favorite_exists(uuid, uuid);
drop function if exists public.create_user_shopping_list(uuid, text);
drop function if exists public.delete_shopping_item(uuid, uuid);
drop function if exists public.delete_user_shopping_list(uuid, uuid);
drop function if exists public.get_shopping_list_items(uuid);
drop function if exists public.get_user_favorites(uuid);
drop function if exists public.get_user_shopping_lists(uuid);
drop function if exists public.remove_user_favorite(uuid, uuid);
drop function if exists public.update_shopping_item(uuid, uuid, text, text, text, boolean);
drop function if exists public.update_user_shopping_list(uuid, uuid, text);

-- Fonctions trigger : pas d'exécution directe via l'API REST (silence l'advisor).
-- Les triggers continuent de se déclencher (les grants n'affectent pas les triggers).
revoke execute on function public.prevent_role_change() from anon, authenticated, public;
revoke execute on function public.handle_new_user() from anon, authenticated, public;
