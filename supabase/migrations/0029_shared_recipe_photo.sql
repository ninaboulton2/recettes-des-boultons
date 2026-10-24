-- ============================================================================
--  0029 — shared_recipe_photo_path(p_token) : chemin de la photo derrière un lien public, phase 8
-- ============================================================================
--  QUOI
--   1. Une fonction, `public.shared_recipe_photo_path(uuid)`, qui renvoie (recipe_id, photo_path) : l'identifiant de la recette et
--      le chemin de sa photo (bucket `recipe-photos`) derrière un jeton de lien public actif ; AUCUNE ligne si le jeton est inconnu ou
--      révoqué, si la recette n'a pas de photo, ou si le chemin n'est pas « <id de la recette>/… » (voir 3).
--   2. Une contrainte `recipes_photo_path_in_own_folder` : `photo_path` doit commencer par « <id de la recette>/ ».
--      Même nom, même définition que dans `supabase/v2/0020_rls_switchover.sql` (idempotentes, dans les deux ordres).
--
--  POURQUOI
--   Une fois le bucket privé (bascule `supabase/v2/0029_private_photos_switchover.sql`), un visiteur sans compte ne peut plus
--   lire la photo d'une recette partagée par lien. La page `/r/<jeton>` l'affiche par une route SERVEUR
--   (`/api/v2/shared/<jeton>/photo`) qui vérifie le jeton avec cette fonction puis signe une URL de 2 minutes avec la clé
--   service_role. Sans contrainte, `recipes.photo_path` est un texte libre : un auteur pourrait y écrire le chemin de la photo d'une
--   AUTRE recette (privée) puis publier un lien, et le serveur la signerait avec le service_role. D'où le filtre dans la fonction,
--   la vérification côté serveur (`signSharedPhoto`) ET la contrainte. `get_shared_recipe` (0021) ne renvoie volontairement ni identifiant ni `photo_path` (il contient l'id de la
--   recette) : d'où cette fonction à part.
--
--  CHOIX DE CONCEPTION
--   1. SECURITY DEFINER, search_path vide. Exécutable par `service_role` SEULEMENT (ni PUBLIC, ni anon, ni authenticated) : le
--      chemin contient l'identifiant de la recette, que le navigateur ne doit jamais recevoir. Seule la route serveur l'appelle.
--   2. Même condition de jeton que `get_shared_recipe` (une ligne de `recipe_share_links` = un lien actif).
--   3. La fonction n'accepte qu'un chemin de la forme « <id de la recette>/… » (`like r.id::text || '/%'`).
--   4. La contrainte est posée NOT VALID (les lignes existantes ne sont pas contrôlées, toute écriture future l'est), puis VALIDÉE
--      si aucune ligne existante ne la viole. Sûre pour la v1 : l'éditeur écrit toujours `<id de la recette>/<horodatage>.webp`
--      (`useRecipePhoto`), 0010 et 0011 stockent ce que l'éditeur envoie. Si des lignes anormales existaient, un avis le signale
--      et la contrainte reste NOT VALID : seule une écriture sur ces lignes-là (mise à jour de la recette) serait refusée.
--      `save_recipe` d'un admin avec un chemin valide passe ; avec le chemin d'une autre recette, il échoue (test_0029_v1_photo_path).
--   5. Aucune colonne, politique ni donnée modifiée ; aucun lien public n'existe en v1. Compatible avec le SQL Editor de Supabase
--      (aucune table temporaire).
--
--  Retour arrière : supabase/rollback/0029_shared_recipe_photo_down.sql (retire la contrainte sauf si la bascule 0020 est appliquée). Prérequis : 0010 (photo_path), 0017 (recipe_share_links).
-- ============================================================================
begin;

do $$
begin
  assert to_regclass('public.recipe_share_links') is not null, '[0029] recipe_share_links absente : appliquer 0017 / 0021 d''abord';
  assert exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'recipes' and column_name = 'photo_path'),
    '[0029] recipes.photo_path absente : appliquer 0010 d''abord';
end $$;

-- La signature change par rapport à une version « text » : la retirer d'abord (ce fichier n'était pas encore en production).
drop function if exists public.shared_recipe_photo_path(uuid);
create or replace function public.shared_recipe_photo_path(p_token uuid)
returns table (recipe_id uuid, photo_path text)
language sql
stable
security definer
set search_path = ''
as $$
  select r.id, r.photo_path
    from public.recipe_share_links l
    join public.recipes r on r.id = l.recipe_id
   where l.token = p_token
     and r.photo_path like r.id::text || '/%'
$$;
comment on function public.shared_recipe_photo_path(uuid) is
  'Identifiant et chemin de la photo (bucket recipe-photos) de la recette derrière un lien public actif ; aucune ligne si inconnu, sans photo ou chemin hors du dossier de la recette. Réservée à service_role : appelée par la route serveur /api/v2/shared/<jeton>/photo, qui signe ensuite une URL courte. 0029.';

revoke execute on function public.shared_recipe_photo_path(uuid) from public, anon, authenticated;
grant execute on function public.shared_recipe_photo_path(uuid) to service_role;

-- Contrainte : la photo est toujours dans le dossier de SA recette. Identique à celle de v2/0020 (même nom : le deuxième à passer ne fait rien).
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'recipes_photo_path_in_own_folder' and conrelid = 'public.recipes'::regclass) then
    alter table public.recipes add constraint recipes_photo_path_in_own_folder
      check (photo_path is null or photo_path like id::text || '/%') not valid;
  end if;
  if exists (select 1 from pg_constraint where conname = 'recipes_photo_path_in_own_folder' and conrelid = 'public.recipes'::regclass and not convalidated) then
    if exists (select 1 from public.recipes r where r.photo_path is not null and r.photo_path not like r.id::text || '/%') then
      raise notice '[0029] des recettes existantes ont une photo hors de leur dossier : la contrainte reste NOT VALID (écritures futures contrôlées)';
    else
      alter table public.recipes validate constraint recipes_photo_path_in_own_folder;
    end if;
  end if;
end $$;

do $$
begin
  assert has_function_privilege('service_role', 'public.shared_recipe_photo_path(uuid)', 'execute'), '[0029] service_role doit pouvoir exécuter';
  assert not has_function_privilege('anon', 'public.shared_recipe_photo_path(uuid)', 'execute'), '[0029] anon ne doit pas pouvoir exécuter';
  assert not has_function_privilege('authenticated', 'public.shared_recipe_photo_path(uuid)', 'execute'), '[0029] authenticated ne doit pas pouvoir exécuter';
  assert exists (select 1 from pg_constraint where conname = 'recipes_photo_path_in_own_folder' and conrelid = 'public.recipes'::regclass), '[0029] contrainte absente';
end $$;

notify pgrst, 'reload schema';
commit;
