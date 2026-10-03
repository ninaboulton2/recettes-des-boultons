-- ============================================================================
--  0010 — Photos de recettes : colonne photo_path + bucket recipe-photos
-- ============================================================================
--  QUOI
--   - `recipes.photo_path text` (nullable) : chemin de l'objet dans le bucket
--     (ex. « <recipe_id>/cover.webp »). `recipes.image` (illustration par
--     catégorie) reste intacte et sert de repli.
--   - Bucket `recipe-photos` : public (lecture par URL sans token), 5 Mo max,
--     MIME image/jpeg | image/png | image/webp. Création idempotente via
--     `storage.buckets`.
--   - Politiques `storage.objects` pour ce bucket : lecture publique ;
--     insert/update/delete réservés à `private.is_admin()` (0009).
--   - `search_recipes` recréée pour renvoyer aussi `photo_path`
--     (le type de retour change → drop + create).
--
--  RÉVERSIBILITÉ : drop policy … on storage.objects ; delete from
--  storage.buckets where id='recipe-photos' (après avoir vidé le bucket) ;
--  alter table recipes drop column photo_path.
--
--  NOTE : en prod, les politiques sur storage.objects se créent depuis le
--  rôle postgres (SQL Editor / apply_migration), comme le fait le dashboard.
-- ============================================================================

begin;

alter table public.recipes add column if not exists photo_path text;
comment on column public.recipes.photo_path is 'Chemin de la photo dans le bucket storage « recipe-photos » (NULL → repli sur image).';

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('recipe-photos', 'recipe-photos', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set
  public             = excluded.public,
  file_size_limit    = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "recipe_photos_read_public"  on storage.objects;
drop policy if exists "recipe_photos_admin_insert" on storage.objects;
drop policy if exists "recipe_photos_admin_update" on storage.objects;
drop policy if exists "recipe_photos_admin_delete" on storage.objects;

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

-- search_recipes : même logique que 0008 + photo_path -------------------------
drop function if exists public.search_recipes(text, text, text[], int, int);

create function public.search_recipes(
  p_query     text    default null,
  p_category  text    default null,
  p_tags      text[]  default null,
  p_limit     int     default 24,
  p_offset    int     default 0
)
returns table (
  id            uuid,
  title         text,
  description   text,
  category      text,
  ingredients   jsonb,
  instructions  jsonb,
  prep_time     int,
  cook_time     int,
  servings      int,
  image         text,
  photo_path    text,
  notes         text,
  tags          text[],
  created_at    timestamptz,
  updated_at    timestamptz,
  total_count   bigint
)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  with q as (
    select nullif(btrim(p_query), '') as raw,
           case when nullif(btrim(p_query), '') is null then null
                else websearch_to_tsquery('french'::regconfig, public.immutable_unaccent(btrim(p_query))) end as tsq
  ),
  f as (
    select r.*,
           case when q.tsq is not null and numnode(q.tsq) > 0 and r.search @@ q.tsq
                then ts_rank(r.search, q.tsq) else 0::real end as rank
      from public.recipes r
      cross join q
     where (p_category is null or r.category = p_category)
       and (p_tags is null or cardinality(p_tags) = 0 or r.tags @> p_tags)
       and (q.raw is null
            or (case when q.tsq is not null and numnode(q.tsq) > 0 then r.search @@ q.tsq else false end)
            or public.immutable_unaccent(r.title) ilike '%' || public.immutable_unaccent(q.raw) || '%')
  )
  select f.id, f.title, f.description, f.category, f.ingredients, f.instructions,
         f.prep_time, f.cook_time, f.servings, f.image, f.photo_path, f.notes, f.tags,
         f.created_at, f.updated_at,
         count(*) over () as total_count
    from f
   order by f.rank desc, f.created_at desc, f.id
   limit greatest(1, least(coalesce(p_limit, 24), 100))
  offset greatest(0, coalesce(p_offset, 0));
$$;

comment on function public.search_recipes(text, text, text[], int, int) is
  'Recherche plein texte (french, sans accents) + filtres catégorie/tags, paginée, avec total_count et photo_path.';

grant execute on function public.search_recipes(text, text, text[], int, int) to anon, authenticated, service_role;

do $$
begin
  assert exists (select 1 from storage.buckets where id = 'recipe-photos' and public), '[0010] bucket manquant';
  assert (select count(*) from pg_policies where schemaname = 'storage' and tablename = 'objects'
            and policyname like 'recipe_photos_%') = 4, '[0010] 4 politiques storage attendues';
end $$;

commit;
