-- ============================================================================
--  Retour arrière de la bascule v2/0020 — le site redevient « tout le monde lit »
-- ============================================================================
--  Recrée À L'IDENTIQUE les politiques d'avant la bascule (0001 / 0009 / 0010 /
--  0016) sur recipes, recipe_sections, recipe_ingredients, instructions,
--  recipe_translations, favorites (insertion) et storage.objects (recipe-photos),
--  retire le déclencheur de garde et le DEFAULT / NOT NULL de recipes.owner_id.
--  À associer à l'Instant Rollback Vercel (l'ancien code lit sans compte).
--  Aucune donnée n'est modifiée. Rejouable.
-- ============================================================================

begin;

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

drop trigger if exists recipes_guard_owner_fields on public.recipes;
drop function if exists private.recipes_guard_owner_fields();
alter table public.recipes drop constraint if exists recipes_photo_path_in_own_folder;
drop function if exists private.section_belongs_to(uuid, uuid);
drop function if exists private.category_belongs_to(uuid, uuid);
drop policy if exists "profiles_select_self" on public.profiles;
drop policy if exists "profiles_update_self" on public.profiles;
drop policy if exists "profiles_select_self_or_admin" on public.profiles;
drop policy if exists "profiles_update_self_or_admin" on public.profiles;
create policy "profiles_select_self_or_admin" on public.profiles for select
  using (auth.uid() = id or private.is_admin());
create policy "profiles_update_self_or_admin" on public.profiles for update
  using (auth.uid() = id or private.is_admin())
  with check (auth.uid() = id or private.is_admin());
alter table public.recipes alter column owner_id drop not null;
alter table public.recipes alter column owner_id drop default;

-- recipes, sections, ingrédients, étapes (0001, passées à private.is_admin() par 0009)
create policy "recipes_read_public"  on public.recipes for select using (true);
create policy "recipes_admin_insert" on public.recipes for insert with check (private.is_admin());
create policy "recipes_admin_update" on public.recipes for update using (private.is_admin()) with check (private.is_admin());
create policy "recipes_admin_delete" on public.recipes for delete using (private.is_admin());

create policy "sections_read_public"  on public.recipe_sections for select using (true);
create policy "sections_admin_insert" on public.recipe_sections for insert with check (private.is_admin());
create policy "sections_admin_update" on public.recipe_sections for update using (private.is_admin()) with check (private.is_admin());
create policy "sections_admin_delete" on public.recipe_sections for delete using (private.is_admin());

create policy "ingredients_read_public"  on public.recipe_ingredients for select using (true);
create policy "ingredients_admin_insert" on public.recipe_ingredients for insert with check (private.is_admin());
create policy "ingredients_admin_update" on public.recipe_ingredients for update using (private.is_admin()) with check (private.is_admin());
create policy "ingredients_admin_delete" on public.recipe_ingredients for delete using (private.is_admin());

create policy "instructions_read_public"  on public.instructions for select using (true);
create policy "instructions_admin_insert" on public.instructions for insert with check (private.is_admin());
create policy "instructions_admin_update" on public.instructions for update using (private.is_admin()) with check (private.is_admin());
create policy "instructions_admin_delete" on public.instructions for delete using (private.is_admin());

-- recipe_translations (0016)
create policy "recipe_translations_read_public" on public.recipe_translations for select using (true);
create policy "recipe_translations_admin_insert" on public.recipe_translations
  for insert with check (private.is_admin());
create policy "recipe_translations_admin_update" on public.recipe_translations
  for update using (private.is_admin()) with check (private.is_admin());
create policy "recipe_translations_admin_delete" on public.recipe_translations
  for delete using (private.is_admin());

-- favorites (0001)
create policy "favorites_owner_insert" on public.favorites for insert with check (auth.uid() = user_id);

-- photos (0010)
create policy "recipe_photos_read_public" on storage.objects
  for select using (bucket_id = 'recipe-photos');
create policy "recipe_photos_admin_insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'recipe-photos' and private.is_admin());
create policy "recipe_photos_admin_update" on storage.objects
  for update to authenticated
  using (bucket_id = 'recipe-photos' and private.is_admin())
  with check (bucket_id = 'recipe-photos' and private.is_admin());
create policy "recipe_photos_admin_delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'recipe-photos' and private.is_admin());

do $$
begin
  assert (select count(*) from pg_policies where schemaname = 'public' and tablename = 'recipes') = 4, '[0020 down] recipes : 4 politiques attendues';
  raise notice '[0020 down] politiques d''avant la bascule rétablies : le site est de nouveau lisible par tous';
end $$;

notify pgrst, 'reload schema';

commit;
