-- ============================================================================
--  ROLLBACK de 0013 — recrée recipes.ingredients / recipes.instructions (JSONB)
-- ============================================================================
--  À n'utiliser QUE pour revenir à l'ANCIEN code (branche main d'avant la
--  bascule) APRÈS l'application de 0013 : l'ancien code lit/écrit ces colonnes.
--  Ordre : 1) ce fichier ; 2) supabase/migrations/0011_save_recipe_photo.sql
--  (save_recipe qui réécrit le JSONB) ; 3) Instant Rollback Vercel.
--
--  QUOI
--   - ajoute les deux colonnes (jsonb), les RECALCULE depuis les sections au
--     format exact de 0006/0011 :
--       ingredients  = [{"name","unit":"…"|"","amount": nombre|texte|null[, "optional": true]}]
--       instructions = ["…", …]   (ordre : section puis élément)
--     puis remet NOT NULL (comme avant 0013, sans valeur par défaut) ;
--   - recrée search_recipes avec ces colonnes (corps identique à 0010).
--  Les instructions orphelines supprimées par 0013 ne sont PAS recréées
--  (doublons ; l'archive instructions_orphans_20261003 les garde).
--  Valeurs d'origine (avant 0005), si on préfère : voir l'en-tête de 0013.
--
--  Idempotent : rejouable (add column if not exists ; seules les lignes NULL
--  sont recalculées).
-- ============================================================================

begin;

alter table public.recipes
  add column if not exists ingredients  jsonb,
  add column if not exists instructions jsonb;

-- Recalcul sans toucher updated_at (trigger update_recipes_updated_at de la prod).
alter table public.recipes disable trigger update_recipes_updated_at;

update public.recipes r set
  ingredients = coalesce((
    select jsonb_agg(
             jsonb_build_object(
               'name',   ri.name,
               'unit',   coalesce(ri.unit, ''),
               'amount', case when ri.amount_num is not null then to_jsonb(trim_scale(ri.amount_num))
                              when ri.amount is not null     then to_jsonb(ri.amount)
                              else 'null'::jsonb end)
             || case when coalesce(ri.optional, false) then '{"optional": true}'::jsonb else '{}'::jsonb end
             order by rs.order_index, ri.order_index, ri.created_at)
      from public.recipe_ingredients ri
      join public.recipe_sections rs on rs.id = ri.section_id
     where ri.recipe_id = r.id), '[]'::jsonb),
  instructions = coalesce((
    select jsonb_agg(to_jsonb(ins.content) order by rs.order_index, ins.order_index, ins.created_at)
      from public.instructions ins
      join public.recipe_sections rs on rs.id = ins.section_id
     where ins.recipe_id = r.id), '[]'::jsonb)
 where r.ingredients is null or r.instructions is null;

alter table public.recipes enable trigger update_recipes_updated_at;

alter table public.recipes
  alter column ingredients  set not null,
  alter column instructions set not null;

-- search_recipes avec ingredients / instructions (copie de 0010) ---------------
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
  assert (select count(*) from information_schema.columns
           where table_schema = 'public' and table_name = 'recipes'
             and column_name in ('ingredients', 'instructions') and is_nullable = 'NO') = 2,
    '[0013 down] colonnes JSONB non recréées';
  raise notice '[0013 down] colonnes JSONB recréées et recalculées pour % recette(s). Rejouer maintenant 0011_save_recipe_photo.sql.',
    (select count(*) from public.recipes);
end $$;

notify pgrst, 'reload schema';

commit;
