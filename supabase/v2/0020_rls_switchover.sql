-- ============================================================================
--  0020 (v2/) — BASCULE des politiques : la v2 remplace « tout le monde lit »
-- ============================================================================
--  ⚠️  NE PAS APPLIQUER AVANT LA BASCULE v2 (phase 11 du plan). Ce fichier est
--  volontairement HORS de `supabase/migrations/` : ni `setup.sh`, ni un outil
--  qui applique « tout le dossier migrations » ne doit pouvoir le lancer par
--  erreur. Le harnais (supabase/tests/run_local.sh) l'applique APRÈS le
--  remplissage réel v2/0018_v2_data_fill.sql, et le teste.
--
--  QUAND : étape 5 du dossier (§4.2, « verrouillage »), APRÈS 0019 et APRÈS le
--  remplissage 0018 (phase 4), le code v2 déployé en même temps. C'est ici que le
--  site cesse d'être public.
--
--  GARDE-FOUS (le fichier s'arrête avec une erreur sinon)
--   - 0019 appliquée ; AUCUNE recette sans `owner_id` ; aucune recette dont le propriétaire n'a pas de profil.
--
--  QUOI
--   1. recipes : lecture = can_read_recipe ; insertion = auteur (owner_id = soi,
--      `copied_from` copiable) ; modification = can_edit_recipe (jamais un
--      changement d'owner_id / visibility / copied_from par un éditeur, trigger
--      `recipes_guard_owner_fields`) ; suppression = auteur, ou support sur
--      signalement. Toutes `to authenticated` : le public (sans compte) ne lit plus.
--   2. recipe_sections, recipe_ingredients, instructions, recipe_translations :
--      lecture = can_read_recipe(recipe_id) ; écriture = can_edit_recipe(recipe_id).
--   3. favorites : l'insertion exige que la recette soit lisible (le reste inchangé).
--   4. storage.objects (bucket recipe-photos) : lecture = can_read_recipe du 1er
--      dossier du chemin ; écriture = can_edit_recipe. ⚠️ Le bucket reste PUBLIC
--      (champ `public` non touché) : une URL publique contourne ces politiques.
--      Le passage en privé et les liens signés vont ENSEMBLE avec le code de la
--      phase 8 ; ne pas le faire seul (les photos disparaîtraient du site).
--   5. profiles : lecture et modification de SA ligne seulement, pour tout le monde, support compris
--      (plus aucune lecture de l'e-mail d'un autre par l'API). Le support ne passe plus par `profiles`.
--   6. recipes.photo_path : doit commencer par « <id de la recette>/ » (contrainte NOT VALID : les lignes
--      existantes ne sont pas contrôlées, toute écriture future l'est).
--   7. Contenu : un ingrédient / une étape ne peut référencer qu'une section de SA recette.
--   8. recipes.owner_id : DEFAULT (auth.uid()) et NOT NULL. Le DEFAULT permet à
--      `save_recipe` (v1, qui n'écrit pas owner_id) de continuer à créer des
--      recettes pour la personne connectée ; la phase 5A le rendra explicite.
--      Un client sans identité (service_role) doit donner owner_id.
--
--  CE QUI RESTE À FAIRE ENSUITE (hors de ce fichier)
--   - `save_recipe_translation` garde son garde-fou `is_admin()` (0016) ; la v2 le
--     remplace par can_edit_recipe (phase 5A).
--   - Les modifications d'une recette de quelqu'un d'autre par Nina (support) ne sont
--     plus possibles : voulu (§3.5).
--   - 2ᵉ compte admin → user : fait par le remplissage (phase 4).
--
--  RETOUR ARRIÈRE : supabase/rollback/0020_rls_switchover_down.sql (recrée à
--  l'identique les politiques d'avant — le site redevient public ; la v1 refonctionne).
--  IDEMPOTENT : rejouable.
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- 0. Garde-fous
-- ----------------------------------------------------------------------------
do $$
declare n_null bigint;
begin
  assert to_regprocedure('private.can_read_recipe(uuid)') is not null, '[0020] appliquer d''abord 0019';
  assert to_regprocedure('private.can_edit_recipe(uuid)') is not null, '[0020] appliquer d''abord 0019';
  select count(*) into n_null from public.recipes where owner_id is null;
  if n_null > 0 then
    raise exception '[0020] % recette(s) sans owner_id : appliquer le remplissage (0018) AVANT la bascule', n_null;
  end if;
  select count(*) into n_null from public.recipes r where not exists (select 1 from public.profiles p where p.id = r.owner_id);
  if n_null > 0 then
    raise exception '[0020] % recette(s) dont le propriétaire n''a pas de profil', n_null;
  end if;
end $$;

-- Instantané dans une vraie table (le SQL Editor de Supabase ne garde pas les tables temporaires
-- d'une instruction à l'autre) ; supprimée par la vérification finale.
drop table if exists private.tmp_0020_before;
create table private.tmp_0020_before as
  select (select count(*) from public.recipes)            as n_recipes,
         (select count(*) from public.recipe_sections)    as n_sections,
         (select count(*) from public.recipe_ingredients) as n_ingredients,
         (select count(*) from public.instructions)       as n_instructions,
         (select count(*) from public.recipe_translations) as n_translations,
         (select count(*) from public.favorites)          as n_favorites;

-- Aides : lisent des tables soumises au RLS pour le compte de l'appelant (qui ne les voit pas forcément)
create or replace function private.section_belongs_to(p_section uuid, p_recipe uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.recipe_sections s where s.id = p_section and s.recipe_id = p_recipe)
$$;
create or replace function private.category_belongs_to(p_category uuid, p_owner uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.categories c where c.id = p_category and c.owner_id = p_owner)
$$;
revoke execute on function private.section_belongs_to(uuid, uuid), private.category_belongs_to(uuid, uuid) from public, anon;
grant execute on function private.section_belongs_to(uuid, uuid), private.category_belongs_to(uuid, uuid) to authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 1. Table rase des anciennes politiques de ces tables (toutes celles de v1)
-- ----------------------------------------------------------------------------
do $$
declare pol record;
begin
  for pol in select schemaname, tablename, policyname from pg_policies
              where (schemaname = 'public' and tablename in ('recipes', 'recipe_sections', 'recipe_ingredients',
                                                              'instructions', 'recipe_translations'))
                 or (schemaname = 'public' and tablename = 'favorites' and policyname = 'favorites_owner_insert')
                 or (schemaname = 'storage' and tablename = 'objects' and policyname like 'recipe_photos_%') loop
    execute format('drop policy %I on %I.%I', pol.policyname, pol.schemaname, pol.tablename);
  end loop;
end $$;

-- ----------------------------------------------------------------------------
-- 2. recipes
-- ----------------------------------------------------------------------------
alter table public.recipes alter column owner_id set default auth.uid();
alter table public.recipes alter column owner_id set not null;

-- `owner_id = soi` d'abord : un INSERT … RETURNING relit la ligne neuve, que la fonction (qui interroge
-- la table avec l'instantané de la requête) ne voit pas encore.
create policy "recipes_select_readable" on public.recipes for select to authenticated
  using (owner_id = (select auth.uid()) or private.can_read_recipe(id));
create policy "recipes_insert_author" on public.recipes for insert to authenticated
  with check (owner_id = (select auth.uid())
              and (copied_from is null or private.can_copy_recipe(copied_from))
              and (category_id is null or private.category_belongs_to(category_id, owner_id)));
create policy "recipes_update_editor" on public.recipes for update to authenticated
  using (private.can_edit_recipe(id))
  with check (private.can_edit_recipe(id)
              and (category_id is null or private.category_belongs_to(category_id, owner_id)));
create policy "recipes_delete_author_or_support" on public.recipes for delete to authenticated
  using (owner_id = (select auth.uid())
         or (private.is_support()
             and exists (select 1 from public.reports r where r.recipe_id = recipes.id and r.status in ('open', 'reviewed'))));

-- Un éditeur (edit_original) change le contenu, pas la propriété ni le partage ; personne ne change owner_id
create or replace function private.recipes_guard_owner_fields()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.uid()) is null then return new; end if;   -- serveur / migrations (service_role, postgres)
  -- Mise à jour faite par une clé étrangère (profondeur > 1) : supprimer l'original met `copied_from` des copies des
  -- AUTRES à NULL (`on delete set null`) ; ce n'est pas l'auteur de la copie qui le fait, et ça ne doit pas bloquer
  -- la suppression (corrigé en 0021 : sans cela, supprimer une recette copiée par quelqu'un échouait).
  if pg_trigger_depth() > 1 then return new; end if;
  if new.owner_id is distinct from old.owner_id then
    raise exception 'Le propriétaire d''une recette ne se change pas' using errcode = '42501';
  end if;
  if (new.visibility is distinct from old.visibility or new.copied_from is distinct from old.copied_from)
     and old.owner_id is distinct from (select auth.uid()) then
    raise exception 'Seul l''auteur change la visibilité ou l''origine d''une recette' using errcode = '42501';
  end if;
  -- on ne se rattache pas à une recette qu'on ne peut pas copier (NULL toujours permis)
  if new.copied_from is not null and new.copied_from is distinct from old.copied_from
     and not private.can_copy_recipe(new.copied_from) then
    raise exception 'Origine de la copie non copiable' using errcode = '42501';
  end if;
  return new;
end $$;
revoke execute on function private.recipes_guard_owner_fields() from public, anon, authenticated;
drop trigger if exists recipes_guard_owner_fields on public.recipes;
create trigger recipes_guard_owner_fields before update on public.recipes
  for each row execute function private.recipes_guard_owner_fields();

-- ----------------------------------------------------------------------------
-- 3. Contenu : suit la recette
-- ----------------------------------------------------------------------------
do $$
declare t text; pfx text;
begin
  foreach t in array array['recipe_sections', 'recipe_ingredients', 'instructions', 'recipe_translations'] loop
    pfx := t;
    if t in ('recipe_ingredients', 'instructions') then
      -- la section référencée doit appartenir à LA MÊME recette (sinon on empoisonne la recette d'un autre)
      execute format('create policy %I on public.%I for select to authenticated using (private.can_read_recipe(recipe_id))', pfx || '_select_readable', t);
      execute format('create policy %I on public.%I for insert to authenticated with check (private.can_edit_recipe(recipe_id) and (section_id is null or private.section_belongs_to(section_id, recipe_id)))', pfx || '_insert_editor', t);
      execute format('create policy %I on public.%I for update to authenticated using (private.can_edit_recipe(recipe_id)) with check (private.can_edit_recipe(recipe_id) and (section_id is null or private.section_belongs_to(section_id, recipe_id)))', pfx || '_update_editor', t);
      execute format('create policy %I on public.%I for delete to authenticated using (private.can_edit_recipe(recipe_id))', pfx || '_delete_editor', t);
      continue;
    end if;
    execute format('create policy %I on public.%I for select to authenticated using (private.can_read_recipe(recipe_id))', pfx || '_select_readable', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (private.can_edit_recipe(recipe_id))', pfx || '_insert_editor', t);
    execute format('create policy %I on public.%I for update to authenticated using (private.can_edit_recipe(recipe_id)) with check (private.can_edit_recipe(recipe_id))', pfx || '_update_editor', t);
    execute format('create policy %I on public.%I for delete to authenticated using (private.can_edit_recipe(recipe_id))', pfx || '_delete_editor', t);
  end loop;
end $$;

-- Photo : toujours dans le dossier de SA recette (<id>/<horodatage>.webp)
alter table public.recipes drop constraint if exists recipes_photo_path_in_own_folder;
alter table public.recipes add constraint recipes_photo_path_in_own_folder
  check (photo_path is null or photo_path like id::text || '/%') not valid;

-- profiles : sa propre ligne seulement (le support ne lit plus les e-mails des autres)
do $$
declare pol record;
begin
  for pol in select policyname from pg_policies
              where schemaname = 'public' and tablename = 'profiles'
                and policyname in ('profiles_select_self_or_admin', 'profiles_update_self_or_admin', 'profiles_select_self', 'profiles_update_self') loop
    execute format('drop policy %I on public.profiles', pol.policyname);
  end loop;
end $$;
create policy "profiles_select_self" on public.profiles for select to authenticated
  using ((select auth.uid()) = id);
create policy "profiles_update_self" on public.profiles for update to authenticated
  using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

-- ----------------------------------------------------------------------------
-- 4. favorites : on ne met en favori que ce qu'on peut lire
-- ----------------------------------------------------------------------------
create policy "favorites_owner_insert" on public.favorites for insert
  with check (auth.uid() = user_id and private.can_read_recipe(recipe_id));

-- ----------------------------------------------------------------------------
-- 5. Photos (bucket recipe-photos, qui reste public : voir l'en-tête)
-- ----------------------------------------------------------------------------
create policy "recipe_photos_select_readable" on storage.objects for select to authenticated
  using (bucket_id = 'recipe-photos' and private.can_read_recipe(private.recipe_id_from_path(name)));
create policy "recipe_photos_insert_editor" on storage.objects for insert to authenticated
  with check (bucket_id = 'recipe-photos' and private.can_edit_recipe(private.recipe_id_from_path(name)));
create policy "recipe_photos_update_editor" on storage.objects for update to authenticated
  using (bucket_id = 'recipe-photos' and private.can_edit_recipe(private.recipe_id_from_path(name)))
  with check (bucket_id = 'recipe-photos' and private.can_edit_recipe(private.recipe_id_from_path(name)));
create policy "recipe_photos_delete_editor" on storage.objects for delete to authenticated
  using (bucket_id = 'recipe-photos' and private.can_edit_recipe(private.recipe_id_from_path(name)));

-- ----------------------------------------------------------------------------
-- 6. Vérifications
-- ----------------------------------------------------------------------------
do $$
declare b record; t text;
begin
  select * into b from private.tmp_0020_before;
  assert (select count(*) from public.recipes) = b.n_recipes
     and (select count(*) from public.recipe_sections) = b.n_sections
     and (select count(*) from public.recipe_ingredients) = b.n_ingredients
     and (select count(*) from public.instructions) = b.n_instructions
     and (select count(*) from public.recipe_translations) = b.n_translations
     and (select count(*) from public.favorites) = b.n_favorites, '[0020] des données ont changé';
  foreach t in array array['recipes', 'recipe_sections', 'recipe_ingredients', 'instructions', 'recipe_translations'] loop
    assert not exists (select 1 from pg_policies where schemaname = 'public' and tablename = t and roles <> '{authenticated}'),
      format('[0020] %s : politique ouverte au public', t);
    assert not exists (select 1 from pg_policies where schemaname = 'public' and tablename = t
                        and (qual ~ 'is_admin' or with_check ~ 'is_admin')), format('[0020] %s : reste is_admin', t);
    assert exists (select 1 from pg_policies where schemaname = 'public' and tablename = t and cmd = 'SELECT'), format('[0020] %s : pas de lecture', t);
  end loop;
  assert (select count(*) from pg_policies where schemaname = 'storage' and tablename = 'objects'
             and policyname like 'recipe_photos_%') = 4, '[0020] 4 politiques storage attendues';
  raise notice '[0020] bascule appliquée : recettes, contenu, favoris (insertion) et photos sous RLS v2 ; owner_id NOT NULL';
end $$;

drop table if exists private.tmp_0020_before;

notify pgrst, 'reload schema';

commit;
