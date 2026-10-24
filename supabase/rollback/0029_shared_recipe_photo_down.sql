-- Retour arrière de 0029 : supprime shared_recipe_photo_path et la contrainte recipes_photo_path_in_own_folder (sauf si la bascule 0020
-- est appliquée : elle pose la même). Aucune donnée n'est touchée.
-- La photo de la page publique /r/<jeton> (phase 8) n'est plus servie : retirer d'abord le code v2. Rejouable.
begin;
drop function if exists public.shared_recipe_photo_path(uuid);
-- La contrainte est aussi posée par v2/0020 : on la retire seulement si la bascule 0020 n'est pas appliquée.
do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'recipes_guard_owner_fields' and tgrelid = 'public.recipes'::regclass) then
    alter table public.recipes drop constraint if exists recipes_photo_path_in_own_folder;
  end if;
end $$;
notify pgrst, 'reload schema';
commit;
