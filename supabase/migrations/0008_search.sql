-- ============================================================================
--  0008 — Recherche plein texte insensible aux accents
-- ============================================================================
--  QUOI
--   - extension `unaccent` dans le schéma `extensions` (disponible en prod,
--     non installée à ce jour).
--   - `public.immutable_unaccent(text)` : wrapper IMMUABLE (dictionnaire
--     explicite) utilisable dans une colonne générée / un index.
--   - `public.immutable_array_to_string(text[])` : wrapper immuable
--     (array_to_string est déclarée STABLE, interdite dans une colonne générée).
--   - Colonne générée `recipes.search tsvector` = titre (poids A) +
--     description (B) + tags (C), config 'french', texte désaccentué
--     + index GIN.
--   - `public.search_recipes(p_query, p_category, p_tags, p_limit, p_offset)`
--     returns table (colonnes de recipes…, total_count bigint) :
--       * websearch_to_tsquery('french', unaccent(q)) sur `search`
--       * repli ILIKE sur le titre désaccentué (requêtes courtes, préfixes,
--         mots vides)
--       * filtres : catégorie exacte, tags (la recette doit porter TOUS les
--         tags demandés : tags @> p_tags)
--       * tri : pertinence (ts_rank) desc puis created_at desc
--       * total_count = nombre total de résultats avant limit/offset
--       * p_limit borné à [1, 100]
--   Test : « gateau » trouve « Gâteau au yaourt » (et inversement).
--
--  IMPACT sur l'ancien code : `select *` sur recipes renvoie une colonne de
--  plus (`search`, sérialisée en texte par PostgREST). L'API serveur mappe
--  les champs explicitement → aucun effet visible.
--
--  DROITS : search_recipes exécutable par anon + authenticated (lecture
--  publique, comme la table).
--  RÉVERSIBILITÉ : drop function search_recipes ; alter table recipes drop
--  column search ; drop function immutable_unaccent, immutable_array_to_string.
-- ============================================================================

begin;

create extension if not exists unaccent with schema extensions;

create or replace function public.immutable_unaccent(p text)
returns text
language sql
immutable
parallel safe
strict
set search_path = ''
as $$
  select extensions.unaccent('extensions.unaccent'::regdictionary, p);
$$;
comment on function public.immutable_unaccent(text) is 'unaccent() avec dictionnaire explicite → IMMUABLE (colonnes générées, index).';

create or replace function public.immutable_array_to_string(p text[])
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select array_to_string(p, ' ');
$$;

grant execute on function public.immutable_unaccent(text), public.immutable_array_to_string(text[])
  to anon, authenticated, service_role;

alter table public.recipes add column if not exists search tsvector
  generated always as (
    setweight(to_tsvector('french'::regconfig, public.immutable_unaccent(coalesce(title, ''))), 'A') ||
    setweight(to_tsvector('french'::regconfig, public.immutable_unaccent(coalesce(description, ''))), 'B') ||
    setweight(to_tsvector('french'::regconfig, public.immutable_unaccent(coalesce(public.immutable_array_to_string(tags), ''))), 'C')
  ) stored;
comment on column public.recipes.search is 'Vecteur plein texte (french, sans accents) : titre A, description B, tags C. Colonne générée.';

create index if not exists idx_recipes_search on public.recipes using gin (search);

-- drop + create : le type de retour peut changer d'une version à l'autre
-- (0010 ajoute photo_path). Rejouer 0008 seul après 0010 impose de rejouer 0010.
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
         f.prep_time, f.cook_time, f.servings, f.image, f.notes, f.tags,
         f.created_at, f.updated_at,
         count(*) over () as total_count
    from f
   order by f.rank desc, f.created_at desc, f.id
   limit greatest(1, least(coalesce(p_limit, 24), 100))
  offset greatest(0, coalesce(p_offset, 0));
$$;

comment on function public.search_recipes(text, text, text[], int, int) is
  'Recherche plein texte (french, sans accents) + filtres catégorie/tags, paginée, avec total_count.';

grant execute on function public.search_recipes(text, text, text[], int, int) to anon, authenticated, service_role;

-- Vérifications ---------------------------------------------------------------
do $$
begin
  assert public.immutable_unaccent('Gâteau crémeux') = 'Gateau cremeux';
  assert to_tsvector('french', public.immutable_unaccent('gâteau')) @@ websearch_to_tsquery('french', public.immutable_unaccent('gateau')),
    'gateau doit matcher gâteau';
end $$;

commit;
