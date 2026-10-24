-- Retour arrière de 0026 : supprime recipe_access. Aucune donnée n'est touchée. Les clients v2 de la phase 6B qui l'appellent
-- (fiche recette, partage, éditeur) échouent : retirer d'abord le code v2. Rejouable.
begin;
drop function if exists public.recipe_access(uuid);
notify pgrst, 'reload schema';
commit;
