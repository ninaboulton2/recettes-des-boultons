-- ============================================================================
--  Retour arrière de 0016 — recettes bilingues
-- ============================================================================
--  QUAND : pour revenir à l'état d'avant 0016 (ancien code, sans traductions).
--  ⚠️ SUPPRIME les traductions (`recipe_translations`) et la langue source
--  (`recipes.lang`) : elles se régénèrent en réenregistrant les recettes
--  après un nouveau passage de 0016 (coût IA, voir docs/IA_MODELES.md).
--  Les recettes, sections, ingrédients, étapes, favoris, planning et listes
--  ne sont pas touchés.
--
--  QUOI (inverse de 0016, dans l'ordre inverse)
--   1. add_recipe_to_list à 4 paramètres (version de 0007)
--   2. search_recipes sans `lang` / `translation` (version de 0013)
--   3. save_recipe sans `lang` / `translation` (version de 0013)
--   4. suppression de save_recipe_translation et de la table recipe_translations
--   5. recipes.search recréée avec la configuration `french` seule (0008)
--   6. suppression de recipes.lang et de units.abbr_en
--
--  Rejouable : tout est `if exists`.
-- ============================================================================

begin;

-- 1. add_recipe_to_list (0007)
drop function if exists public.add_recipe_to_list(uuid, uuid, uuid[], numeric, text);
create or replace function public.add_recipe_to_list(
  p_recipe_id        uuid,
  p_list_id          uuid,
  p_section_ids      uuid[]  default null,
  p_servings_factor  numeric default 1
)
returns setof public.shopping_items
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  r record;
begin
  if p_servings_factor is null or p_servings_factor <= 0 then
    raise exception 'Le facteur de portions doit être strictement positif' using errcode = '22023';
  end if;
  if not exists (select 1 from public.recipes x where x.id = p_recipe_id) then
    raise exception 'Recette introuvable' using errcode = 'P0002';
  end if;

  for r in
    select i.name, i.amount_num, i.unit_code
      from public.recipe_ingredients i
      left join public.recipe_sections s on s.id = i.section_id
     where i.recipe_id = p_recipe_id
       and (p_section_ids is null or i.section_id = any (p_section_ids))
     order by coalesce(s.order_index, 0), i.order_index, i.created_at
  loop
    return next public.merge_shopping_item(
      p_list_id,
      r.name,
      case when r.amount_num is null then null else round(r.amount_num * p_servings_factor, 2) end,
      r.unit_code,
      p_recipe_id);
  end loop;
  return;
end;
$$;
comment on function public.add_recipe_to_list(uuid, uuid, uuid[], numeric) is
  'Ajoute les ingrédients d''une recette (toutes sections ou sections choisies) à une liste, quantités × facteur, avec fusion des homonymes.';
revoke execute on function public.add_recipe_to_list(uuid, uuid, uuid[], numeric) from public, anon;
grant  execute on function public.add_recipe_to_list(uuid, uuid, uuid[], numeric) to authenticated;

-- 2. search_recipes (0013)
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
  select f.id, f.title, f.description, f.category,
         f.prep_time, f.cook_time, f.servings, f.image, f.photo_path, f.notes, f.tags,
         f.created_at, f.updated_at,
         count(*) over () as total_count
    from f
   order by f.rank desc, f.created_at desc, f.id
   limit greatest(1, least(coalesce(p_limit, 24), 100))
  offset greatest(0, coalesce(p_offset, 0));
$$;
comment on function public.search_recipes(text, text, text[], int, int) is
  'Recherche plein texte (french, sans accents) + filtres catégorie/tags, paginée, avec total_count et photo_path. Depuis 0013 : sans les colonnes JSONB.';
grant execute on function public.search_recipes(text, text, text[], int, int) to anon, authenticated, service_role;

-- 3. save_recipe (0013)
create or replace function public.save_recipe(payload jsonb)
returns uuid
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_id          uuid;
  v_title       text;
  v_category    text;
  v_tags        text[];
  v_exists      boolean := false;
  v_sections    jsonb;
  s             jsonb;
  i             jsonb;
  x             jsonb;
  v_section_id  uuid;
  v_type        text;
  s_idx         int := 0;
  i_idx         int;
  v_name        text;
  v_amount      text;
  v_amount_num  numeric;
  v_unit        text;
  v_unit_code   text;
  v_content     text;
begin
  if payload is null or jsonb_typeof(payload) <> 'object' then
    raise exception 'Payload invalide : un objet JSON est attendu' using errcode = '22023';
  end if;

  v_title    := nullif(btrim(payload->>'title'), '');
  v_category := nullif(btrim(payload->>'category'), '');
  if v_title is null then
    raise exception 'Le titre de la recette est obligatoire' using errcode = '22023';
  end if;
  if v_category is null then
    raise exception 'La catégorie de la recette est obligatoire' using errcode = '22023';
  end if;

  v_sections := coalesce(payload->'sections', '[]'::jsonb);
  if jsonb_typeof(v_sections) <> 'array' then
    raise exception 'sections doit être un tableau' using errcode = '22023';
  end if;

  if payload ? 'tags' and jsonb_typeof(payload->'tags') = 'array' then
    select coalesce(array_agg(t), '{}'::text[]) into v_tags
      from jsonb_array_elements_text(payload->'tags') t;
  else
    v_tags := '{}'::text[];
  end if;

  v_id := nullif(btrim(payload->>'id'), '')::uuid;
  if v_id is not null then
    select true into v_exists from public.recipes r where r.id = v_id;
    v_exists := coalesce(v_exists, false);
  end if;

  -- 1. Recette -------------------------------------------------------------
  if v_exists then
    update public.recipes set
      title       = v_title,
      description = payload->>'description',
      category    = v_category,
      prep_time   = (payload->>'prep_time')::int,
      cook_time   = (payload->>'cook_time')::int,
      servings    = (payload->>'servings')::int,
      image       = payload->>'image',
      photo_path  = nullif(btrim(payload->>'photo_path'), ''),
      tags        = v_tags,
      notes       = payload->>'notes',
      updated_at  = now()
    where id = v_id;
    if not found then
      raise exception 'Action réservée aux administrateurs' using errcode = '42501';
    end if;
  else
    insert into public.recipes (id, title, description, category,
                                prep_time, cook_time, servings, image, photo_path, tags, notes)
    values (coalesce(v_id, gen_random_uuid()), v_title, payload->>'description', v_category,
            (payload->>'prep_time')::int, (payload->>'cook_time')::int, (payload->>'servings')::int,
            payload->>'image', nullif(btrim(payload->>'photo_path'), ''), v_tags, payload->>'notes')
    returning id into v_id;
  end if;

  -- 2. Remplacement complet des enfants ---------------------------------------
  delete from public.recipe_ingredients where recipe_id = v_id;
  delete from public.instructions       where recipe_id = v_id;
  delete from public.recipe_sections    where recipe_id = v_id;

  for s in select * from jsonb_array_elements(v_sections) loop
    if jsonb_typeof(s) <> 'object' then
      raise exception 'Chaque section doit être un objet JSON' using errcode = '22023';
    end if;
    v_type := coalesce(nullif(btrim(s->>'type'), ''), 'mixed');
    if v_type not in ('ingredients', 'instructions', 'mixed') then
      raise exception 'Type de section invalide : %', v_type using errcode = '22023';
    end if;

    insert into public.recipe_sections (recipe_id, name, type, order_index)
    values (v_id, coalesce(s->>'name', ''), v_type, coalesce((s->>'order_index')::int, s_idx))
    returning id into v_section_id;

    -- Ingrédients
    i_idx := 0;
    if jsonb_typeof(s->'ingredients') = 'array' then
      for i in select * from jsonb_array_elements(s->'ingredients') loop
        v_name := nullif(btrim(i->>'name'), '');
        if v_name is null then
          raise exception 'Un ingrédient de la section « % » n''a pas de nom', coalesce(s->>'name', '')
            using errcode = '22023';
        end if;
        v_amount     := nullif(btrim(i->>'amount'), '');
        v_amount_num := case when jsonb_typeof(i->'amount_num') = 'number'
                             then (i->>'amount_num')::numeric
                             else public.parse_amount(v_amount) end;
        if v_amount is null and v_amount_num is not null then
          v_amount := public.format_amount(v_amount_num);
        end if;
        v_unit      := nullif(btrim(i->>'unit'), '');
        v_unit_code := coalesce(nullif(btrim(i->>'unit_code'), ''), public.normalize_unit(v_unit));
        if v_unit_code is not null and not exists (select 1 from public.units u where u.code = v_unit_code) then
          raise exception 'Unité inconnue : %', v_unit_code using errcode = '22023';
        end if;
        if v_unit is null and v_unit_code is not null then
          select u.abbr into v_unit from public.units u where u.code = v_unit_code;
        end if;

        insert into public.recipe_ingredients
          (recipe_id, section_id, name, amount, amount_num, unit, unit_code, optional, order_index)
        values
          (v_id, v_section_id, v_name, v_amount, v_amount_num, v_unit, v_unit_code,
           coalesce((i->>'optional')::boolean, false), coalesce((i->>'order_index')::int, i_idx));
        i_idx := i_idx + 1;
      end loop;
    end if;

    -- Instructions (objet {content} ou simple chaîne)
    i_idx := 0;
    if jsonb_typeof(s->'instructions') = 'array' then
      for x in select * from jsonb_array_elements(s->'instructions') loop
        v_content := nullif(btrim(case when jsonb_typeof(x) = 'string' then x #>> '{}' else x->>'content' end), '');
        if v_content is null then
          continue;
        end if;
        insert into public.instructions (recipe_id, section_id, content, order_index)
        values (v_id, v_section_id, v_content,
                coalesce(case when jsonb_typeof(x) = 'object' then (x->>'order_index')::int end, i_idx));
        i_idx := i_idx + 1;
      end loop;
    end if;

    s_idx := s_idx + 1;
  end loop;

  return v_id;

exception
  when insufficient_privilege then
    raise exception 'Action réservée aux administrateurs' using errcode = '42501';
  when invalid_text_representation then
    raise exception 'Valeur invalide dans le payload (identifiant, nombre ou booléen) : %', sqlerrm
      using errcode = '22023';
end;
$$;
comment on function public.save_recipe(jsonb) is
  'Upsert complet d''une recette (recette + sections + ingrédients + instructions + photo_path). SECURITY INVOKER : réservé aux admins par RLS. Depuis 0013 : plus de JSONB legacy.';
revoke execute on function public.save_recipe(jsonb) from public, anon;
grant  execute on function public.save_recipe(jsonb) to authenticated;

-- 4. Traductions
drop function if exists public.save_recipe_translation(uuid, text, jsonb);
drop table if exists public.recipe_translations;

-- 5. recipes.search : french seul (0008)
drop index if exists public.idx_recipes_search;
alter table public.recipes drop column if exists search;
alter table public.recipes add column search tsvector generated always as (
  setweight(to_tsvector('french'::regconfig, public.immutable_unaccent(coalesce(title, ''))), 'A') ||
  setweight(to_tsvector('french'::regconfig, public.immutable_unaccent(coalesce(description, ''))), 'B') ||
  setweight(to_tsvector('french'::regconfig, public.immutable_unaccent(coalesce(public.immutable_array_to_string(tags), ''))), 'C')
) stored;
create index if not exists idx_recipes_search on public.recipes using gin (search);
comment on column public.recipes.search is 'Vecteur plein texte (french, sans accents) : titre A, description B, tags C. Colonne générée.';

-- 6. Colonnes ajoutées
alter table public.recipes drop constraint if exists recipes_lang_check;
alter table public.recipes drop column if exists lang;
alter table public.units drop column if exists abbr_en;

do $$
begin
  assert to_regclass('public.recipe_translations') is null, '[0016 down] recipe_translations existe encore';
  assert not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'recipes' and column_name = 'lang'),
    '[0016 down] recipes.lang existe encore';
  assert (select count(*) from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
           where ns.nspname = 'public' and p.proname in ('save_recipe', 'search_recipes', 'add_recipe_to_list')) = 3,
    '[0016 down] une surcharge de trop ou de moins';
  raise notice '[0016 down] retour à l''état d''avant 0016';
end $$;

notify pgrst, 'reload schema';

commit;
