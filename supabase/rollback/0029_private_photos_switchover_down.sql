-- Retour arrière de v2/0029 (bascule des photos) : le bucket `recipe-photos` redevient PUBLIC et la suppression de photo
-- redevient permise à tout éditeur (état posé par v2/0020). Aucune donnée touchée. À faire AVANT le retour arrière de v2/0020.
-- Effet : les adresses publiques des photos répondent à nouveau (v1). Rejouable.
begin;

update storage.buckets set public = true where id = 'recipe-photos';

drop policy if exists "recipe_photos_delete_owner"  on storage.objects;
drop policy if exists "recipe_photos_delete_editor" on storage.objects;
create policy "recipe_photos_delete_editor" on storage.objects for delete to authenticated
  using (bucket_id = 'recipe-photos' and private.can_edit_recipe(private.recipe_id_from_path(name)));

do $$
begin
  assert (select public from storage.buckets where id = 'recipe-photos') = true, '[v2/0029 down] le bucket doit être public';
  assert (select count(*) from pg_policies where schemaname = 'storage' and tablename = 'objects'
             and policyname like 'recipe_photos_%') = 4, '[v2/0029 down] 4 politiques storage attendues';
end $$;

commit;
