-- ============================================================================
--  v2/0029 — Bascule des photos : le bucket `recipe-photos` devient PRIVÉ (phase 8)
-- ============================================================================
--  À APPLIQUER LE JOUR J, APRÈS `v2/0020_rls_switchover.sql`, au moment du déploiement du code v2 (étape « photos » de
--  `supabase/BASCULE_V2.md`). NE PAS l'appliquer seule ni avant : la v1 affiche les photos par leur adresse publique
--  (`getPublicUrl`) ; bucket privé = photos cassées dans la v1. Le code v2 les affiche par URL signée.
--
--  QUOI
--   1. `storage.buckets.public = false` pour `recipe-photos` : l'adresse publique (`/object/public/…`) ne répond plus. Les chemins
--      ne changent pas (`<id de la recette>/<horodatage>.webp`) : aucun fichier à déplacer.
--   2. Politiques `storage.objects` (toutes `to authenticated`, aucune pour `anon`) :
--        lecture      : `private.can_read_recipe(private.recipe_id_from_path(name))`   (déjà posée par 0020, rappelée ici)
--        écriture     : `private.can_edit_recipe(…)` (auteur ou droit edit_original)   (inchangée, comme 0020)
--        modification : `private.can_edit_recipe(…)`                                   (inchangée)
--        suppression  : AUTEUR seulement, `private.is_recipe_owner(…)`                 (0020 : tout éditeur ; ici : propriétaire)
--      Un éditeur edit_original ne supprime plus d'objet lui-même : le remplacement d'une photo est nettoyé par le serveur
--      (`/api/update-recipe`, service_role), et la suppression d'une recette par `/api/delete-recipe`.
--   3. Aucune donnée touchée (ni `recipes.photo_path`, ni les objets).
--
--  CE QUI RESTE PUBLIC : rien. La page `/r/<jeton>` (sans compte) passe par la route serveur `/api/v2/shared/<jeton>/photo`
--  (fonction `shared_recipe_photo_path`, migration 0029, appliquée tout de suite).
--
--  PRÉREQUIS : 0010 (bucket), 0019 (aides RLS), v2/0020 (politiques `recipe_photos_*`, sinon refus), migration 0029.
--  RETOUR ARRIÈRE : supabase/rollback/0029_private_photos_switchover_down.sql (bucket public + suppression par les éditeurs).
--  À appliquer par le rôle postgres (SQL Editor / apply_migration), comme 0010 et 0020. Rejouable.
-- ============================================================================
begin;

do $$
begin
  assert exists (select 1 from storage.buckets where id = 'recipe-photos'), '[v2/0029] bucket recipe-photos absent : appliquer 0010 d''abord';
  assert exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'recipe_photos_select_readable'),
    '[v2/0029] v2/0020 non appliquée (politique recipe_photos_select_readable absente) : appliquer d''abord la bascule 0020';
  assert to_regprocedure('private.is_recipe_owner(uuid)') is not null, '[v2/0029] private.is_recipe_owner absente : appliquer 0019 d''abord';
end $$;

-- 1. Bucket privé ---------------------------------------------------------------
update storage.buckets set public = false where id = 'recipe-photos';

-- 2. Politiques : lecture / écriture comme 0020, suppression réservée à l'auteur -----------
drop policy if exists "recipe_photos_select_readable" on storage.objects;
drop policy if exists "recipe_photos_delete_editor"   on storage.objects;
drop policy if exists "recipe_photos_delete_owner"    on storage.objects;

create policy "recipe_photos_select_readable" on storage.objects for select to authenticated
  using (bucket_id = 'recipe-photos' and private.can_read_recipe(private.recipe_id_from_path(name)));
create policy "recipe_photos_delete_owner" on storage.objects for delete to authenticated
  using (bucket_id = 'recipe-photos' and private.is_recipe_owner(private.recipe_id_from_path(name)));

do $$
begin
  assert (select public from storage.buckets where id = 'recipe-photos') = false, '[v2/0029] le bucket doit être privé';
  assert (select count(*) from pg_policies where schemaname = 'storage' and tablename = 'objects'
             and policyname like 'recipe_photos_%') = 4, '[v2/0029] 4 politiques storage attendues';
  assert not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects'
                      and policyname like 'recipe_photos_%' and roles <> '{authenticated}'), '[v2/0029] politique ouverte au public';
  assert exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'recipe_photos_delete_owner'),
    '[v2/0029] suppression par l''auteur absente';
  raise notice '[v2/0029] bucket recipe-photos privé ; lecture = can_read_recipe, écriture = can_edit_recipe, suppression = auteur';
end $$;

commit;
