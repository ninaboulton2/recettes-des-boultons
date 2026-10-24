-- ============================================================================
--  0020 (v2/) — BASCULE des politiques : la v2 remplace « tout le monde lit »
-- ============================================================================
--  ⚠️  NE PAS APPLIQUER AVANT LA BASCULE v2 (phase 11 du plan). Ce fichier est
--  volontairement HORS de `supabase/migrations/` : ni `setup.sh`, ni un outil
--  qui applique « tout le dossier migrations » ne doit pouvoir le lancer par
--  erreur. Le harnais (supabase/tests/run_local.sh) l'applique, avec un
--  remplissage simulé de `owner_id`, et le teste.
--
--  QUAND : étape 5 du dossier (§4.2, « verrouillage »), APRÈS 0019 et APRÈS le
--  remplissage 0018 (phase 4), le code v2 déployé en même temps. C'est ici que le
--  site cesse d'être public.
--
--  GARDE-FOUS (le fichier s'arrête avec une erreur sinon)
--   - 0019 appliquée ; AUCUNE recette sans `owner_id` ; aucun profil absent d'un propriétaire.
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
--   5. recipes.owner_id : DEFAULT (auth.uid()) et NOT NULL. Le DEFAULT permet à
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
end $$;

create temporary table tmp_0020_before on commit drop as
  select (select count(*) from public.recipes)            as n_recipes,
         (select count(*) from public.recipe_sections)    as n_sections,
         (select count(*) from public.recipe_ingredients) as n_ingredients,
         (select count(*) from public.instructions)       as n_instructions,
         (select count(*) from public.recipe_translations) as n_translations,
         (select count(*) from public.favorites)          as n_favorites;

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
              and (category_id is null or exists (select 1 from public.categories c
                                                   where c.id = category_id and c.owner_id = recipes.owner_id)));
create policy "recipes_update_editor" on public.recipes for update to authenticated
  using (private.can_edit_recipe(id))
  with check (private.can_edit_recipe(id)
              and (category_id is null or exists (select 1 from public.categories c
                                                   where c.id = category_id and c.owner_id = recipes.owner_id)));
create policy "recipes_delete_author_or_support" on public.recipes for delete to authenticated
  using (owner_id = (select auth.uid())
         or (private.is_support()
             and exists (select 1 from public.reports r where r.recipe_id = recipes.id and r.status in ('open', 'reviewed'))));

-- Un éditeur (edit_original) change le contenu, pas la propriété ni le partage ; personne ne change owner_id
create or replace function private.recipes_guard_owner_fields()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.uid()) is null then return new; end if;   -- serveur / migrations (service_role, postgres)
  if new.owner_id is distinct from old.owner_id then
    raise exception 'Le propriétaire d''une recette ne se change pas' using errcode = '42501';
  end if;
  if (new.visibility is distinct from old.visibility or new.copied_from is distinct from old.copied_from)
     and old.owner_id is distinct from (select auth.uid()) then
    raise exception 'Seul l''auteur change la visibilité ou l''origine d''une recette' using errcode = '42501';
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
    execute format('create policy %I on public.%I for select to authenticated using (private.can_read_recipe(recipe_id))', pfx || '_select_readable', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (private.can_edit_recipe(recipe_id))', pfx || '_insert_editor', t);
    execute format('create policy %I on public.%I for update to authenticated using (private.can_edit_recipe(recipe_id)) with check (private.can_edit_recipe(recipe_id))', pfx || '_update_editor', t);
    execute format('create policy %I on public.%I for delete to authenticated using (private.can_edit_recipe(recipe_id))', pfx || '_delete_editor', t);
  end loop;
end $$;

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
  select * into b from tmp_0020_before;
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

notify pgrst, 'reload schema';

commit;
