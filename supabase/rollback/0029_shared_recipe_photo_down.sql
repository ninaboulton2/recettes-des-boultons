-- Retour arrière de 0029 : supprime shared_recipe_photo_path. Aucune donnée n'est touchée.
-- La photo de la page publique /r/<jeton> (phase 8) n'est plus servie : retirer d'abord le code v2. Rejouable.
begin;
drop function if exists public.shared_recipe_photo_path(uuid);
notify pgrst, 'reload schema';
commit;
