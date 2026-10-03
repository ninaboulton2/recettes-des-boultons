-- ============================================================================
--  0013 — Contrat : suppression des colonnes JSONB legacy
--         `recipes.ingredients` / `recipes.instructions`
-- ============================================================================
--  QUAND : en production, QUELQUES JOURS APRÈS la bascule (nouveau code en
--  ligne, 0005 appliquée, contrôles OK). Voir supabase/BASCULE_PROD.md, étape 7.
--  ⚠️  Après cette migration, l'ANCIEN code (branche main d'avant la bascule)
--  ne fonctionne plus : un « Instant Rollback » Vercel exige d'abord
--  supabase/rollback/0013_contract_jsonb_down.sql (voir RÉVERSIBILITÉ).
--
--  QUOI
--   1. Pré-requis vérifiés (sinon arrêt) : 0005 appliquée (aucune recette sans
--      section, aucun ingrédient orphelin), 0010/0011 appliquées
--      (`recipes.photo_path`, `save_recipe` écrit `photo_path`).
--   2. Instructions orphelines (`instructions.section_id IS NULL`, jamais
--      affichées) : archivées dans `instructions_orphans_20261003` (si ce
--      n'est déjà fait par 0005), puis traitées ligne à ligne :
--        a. DOUBLON : même contenu (comparaison `fold_text` : casse, accents,
--           ponctuation ignorés) qu'une étape rattachée de la même recette
--           → supprimée ;
--        b. VERSION REMPLACÉE : les 2 lignes listées ci-dessous, dont la
--           recette contient la version corrigée → supprimées ;
--        c. sinon → RATTACHÉE (aucune perte) à la dernière section
--           « instructions » ou « mixed » de la recette (créée sous le nom
--           « Préparation » s'il n'y en a pas), `order_index` en fin.
--      Décision pour les 7 orphelines constatées en prod le 2026-10-03
--      (identifiants identiques en prod et dans le snapshot local) :
--        Confiture d'oranges   b6dc78cf… « Garder les pépins et les mettre dans
--                              le saladier. »  = étape 6 de « Préparation » → a
--        Gaspacho              17b0535d… « Couper grossierement… »   = étape 1 → a
--                              9d58b331… et 624368c7… « Servir tres frais. »
--                                                                     = étape 3 → a
--                              9caf2d69… « Mettre les legumes au blender…
--                              hiile d'olive… » : ancienne version de l'étape 2
--                              (faute de frappe corrigée depuis : « huile ») → b
--        Lasagnes épinards     aa6dbe08… « Si le fromage dore trop vite… »
--                                                  = étape 2 de « La cuisson » → a
--                              65e4850d… « Enfourner pour 30 à 35 minutes. » :
--                              ancienne version de « Enfourner pour 35-40
--                              minutes. » (« La cuisson », étape 1) → b
--      → 7 supprimées, 0 rattachée. Elles restent consultables dans
--        `instructions_orphans_20261003` jusqu'à 0014.
--   3. `public.save_recipe(payload jsonb)` recréée = version 0011 SANS le
--      recalcul ni l'écriture des colonnes JSONB (même signature, mêmes
--      droits : execute pour `authenticated` seulement, SECURITY INVOKER,
--      `photo_path` conservé, mêmes messages d'erreur). `delete_recipe` n'est
--      pas touchée.
--   4. `alter table public.recipes drop column ingredients, drop column
--      instructions` (`if exists` : rejouable).
--   5. `public.search_recipes(...)` recréée SANS les colonnes `ingredients` /
--      `instructions` dans son type de retour (drop + create : le type de
--      retour change). Même logique, mêmes droits (anon, authenticated,
--      service_role). Le front n'utilisait pas ces deux champs
--      (`toRecipeSummary`).
--   6. `notify pgrst, 'reload schema'` (PostgREST oublie les colonnes).
--
--  CE QUI N'EST PAS SUPPRIMÉ (décision)
--   `recipe_ingredients.amount` (texte) est CONSERVÉE : c'est la quantité
--   telle que saisie (« 2 à 3 », « au goût », « 1 ½ »), affichée quand
--   `amount_num` est NULL ; `amount_num` (0004) sert aux calculs (portions,
--   additions dans les courses). Les sauvegardes `*_backup_20261003` sont
--   gardées (0014, une semaine après la bascule).
--
--  POURQUOI
--   Depuis 0005 toutes les recettes sont décrites par leurs sections ; le
--   nouveau code ne lit ni n'écrit plus ces colonnes (vérifié par grep dans
--   app/, server/, shared/ : seules les sections sont lues). Les garder
--   imposerait à save_recipe de maintenir une copie dénormalisée (et 20
--   recettes avaient déjà un JSONB périmé).
--
--  RÉVERSIBILITÉ
--   supabase/rollback/0013_contract_jsonb_down.sql : recrée les colonnes
--   (jsonb NOT NULL), les RECALCULE depuis les sections (format exact de
--   0006/0011, ce que l'ancien code attend) et recrée search_recipes avec ces
--   colonnes ; puis rejouer 0011_save_recipe_photo.sql. Les valeurs
--   d'origine (avant 0005) restent dans `recipes_backup_20261003.ingredients
--   /instructions` jusqu'à 0014 :
--     update public.recipes r set ingredients = b.ingredients,
--            instructions = b.instructions
--       from public.recipes_backup_20261003 b where b.id = r.id;
--   Les instructions orphelines supprimées se restaurent depuis
--   `instructions_orphans_20261003` (colonnes de `instructions` + archived_at).
--
--  COMPTES ATTENDUS EN PROD (après 0005, lecture du 2026-10-03)
--   recettes 181, sections 359, ingrédients 1 529 (1 546 dans le snapshot :
--   « Carrot cake » a perdu 17 ingrédients en prod le 2026-10-03, voir
--   BASCULE_PROD.md), instructions 1 545 → 1 538 (− 7 orphelines),
--   0 orpheline, colonnes JSONB absentes. NOTICE attendue :
--   « [0013] 7 instruction(s) orpheline(s) : 5 doublon(s) supprimé(s),
--     2 version(s) remplacée(s) supprimée(s), 0 rattachée(s) … »
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- 1. Pré-requis + comptes avant
-- ----------------------------------------------------------------------------
do $$
begin
  assert to_regclass('public.recipe_sections') is not null, '[0013] table recipe_sections absente';
  assert exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'recipes' and column_name = 'photo_path'),
    '[0013] recipes.photo_path absente : appliquer 0010 puis 0011 d''abord';
  assert to_regprocedure('public.fold_text(text)') is not null, '[0013] fold_text absente : appliquer 0003 d''abord';
  assert not exists (select 1 from public.recipes r
                      where not exists (select 1 from public.recipe_sections s where s.recipe_id = r.id)),
    '[0013] des recettes n''ont aucune section : appliquer 0005 d''abord (le JSONB serait leur seule copie)';
  assert not exists (select 1 from public.recipe_ingredients where section_id is null),
    '[0013] ingrédients orphelins (section_id NULL) présents : appliquer 0005 d''abord';
end $$;

create temporary table tmp_0013_before on commit drop as
  select (select count(*) from public.recipes)                                  as n_recipes,
         (select count(*) from public.recipe_sections)                          as n_sections,
         (select count(*) from public.recipe_ingredients)                       as n_ingredients,
         (select count(*) from public.instructions)                             as n_instructions,
         (select count(*) from public.instructions where section_id is null)    as n_orphans;

-- Information (avant suppression) : recettes dont le JSONB ne correspond plus
-- aux sections. Rien n'est perdu : `recipes_backup_20261003` garde l'original.
do $$
declare n int; sample text;
begin
  if exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'recipes' and column_name = 'ingredients') then
    execute $q$
      select count(*), string_agg(format('« %s » (JSONB %s / sections %s)', title, n_json, n_rows), ' ; ' order by title)
        from (select r.title,
                     case when jsonb_typeof(r.ingredients) = 'array' then jsonb_array_length(r.ingredients) else 0 end as n_json,
                     (select count(*) from public.recipe_ingredients i where i.recipe_id = r.id) as n_rows
                from public.recipes r) x
       where n_json <> n_rows $q$ into n, sample;
    raise notice '[0013] % recette(s) avec un JSONB ingrédients différent des sections (JSONB périmé, ignoré par le nouveau code) : %',
      n, coalesce(left(sample, 1500), '—');
  else
    raise notice '[0013] colonnes JSONB déjà supprimées : rejeu (seules les fonctions sont recréées)';
  end if;
end $$;

-- ----------------------------------------------------------------------------
-- 2. Instructions orphelines : archivage, puis suppression ou rattachement
-- ----------------------------------------------------------------------------
create temporary table tmp_0013_orphans on commit drop as
  select o.id, o.recipe_id, o.order_index, o.created_at,
         case
           when exists (select 1 from public.instructions i
                         where i.recipe_id = o.recipe_id and i.section_id is not null
                           and public.fold_text(i.content) = public.fold_text(o.content)) then 'doublon'
           when o.id in ('9caf2d69-3d08-4fce-81a7-73b7958cb8b3',   -- Gaspacho : « … hiile d'olive … »
                         '65e4850d-91af-43f1-82f8-dfc44a250048')   -- Lasagnes : « Enfourner pour 30 à 35 minutes. »
                and exists (select 1 from public.instructions i
                             where i.recipe_id = o.recipe_id and i.section_id is not null) then 'remplacee'
           else 'rattacher'
         end as action
    from public.instructions o
   where o.section_id is null;

do $$
declare n_missing int;
begin
  if exists (select 1 from tmp_0013_orphans) then
    if to_regclass('public.instructions_orphans_20261003') is null then
      raise exception '[0013] instructions orphelines présentes mais archive instructions_orphans_20261003 absente (0005 non appliquée ou 0014 déjà passée) — arrêt';
    end if;
    insert into public.instructions_orphans_20261003
    select o.*, now() from public.instructions o
     where o.section_id is null
       and o.id not in (select a.id from public.instructions_orphans_20261003 a);
    select count(*) into n_missing from tmp_0013_orphans t
     where not exists (select 1 from public.instructions_orphans_20261003 a where a.id = t.id);
    assert n_missing = 0, format('[0013] %s orpheline(s) non archivée(s)', n_missing);
  end if;
end $$;

-- c. Rattachement : section cible = dernière section instructions/mixed.
create temporary table tmp_0013_targets on commit drop as
  select t.recipe_id,
         (select s.id from public.recipe_sections s
           where s.recipe_id = t.recipe_id and s.type in ('instructions', 'mixed')
           order by s.order_index desc, s.created_at desc limit 1) as section_id
    from (select distinct recipe_id from tmp_0013_orphans where action = 'rattacher') t;

create temporary table tmp_0013_new_sections on commit drop as
  select t.recipe_id, gen_random_uuid() as section_id from tmp_0013_targets t where t.section_id is null;

insert into public.recipe_sections (id, recipe_id, name, type, order_index)
select n.section_id, n.recipe_id, 'Préparation', 'instructions',
       coalesce((select max(s.order_index) + 1 from public.recipe_sections s where s.recipe_id = n.recipe_id), 0)
  from tmp_0013_new_sections n;

update tmp_0013_targets t set section_id = n.section_id
  from tmp_0013_new_sections n where n.recipe_id = t.recipe_id and t.section_id is null;

update public.instructions i
   set section_id  = t.section_id,
       order_index = coalesce((select max(x.order_index) from public.instructions x where x.section_id = t.section_id), -1)
                     + o.rang
  from (select id, recipe_id, row_number() over (partition by recipe_id order by order_index, created_at, id) as rang
          from tmp_0013_orphans where action = 'rattacher') o
  join tmp_0013_targets t on t.recipe_id = o.recipe_id
 where i.id = o.id;

-- a/b. Doublons et versions remplacées : suppression (archivées ci-dessus).
delete from public.instructions i
 using tmp_0013_orphans o
 where i.id = o.id and o.action in ('doublon', 'remplacee');

do $$
declare b record; n bigint;
  n_dup int; n_rep int; n_att int; n_new int;
begin
  select * into b from tmp_0013_before;
  select count(*) filter (where action = 'doublon'), count(*) filter (where action = 'remplacee'),
         count(*) filter (where action = 'rattacher')
    into n_dup, n_rep, n_att from tmp_0013_orphans;
  select count(*) into n_new from tmp_0013_new_sections;

  select count(*) into n from public.instructions where section_id is null;
  assert n = 0, format('[0013] %s instruction(s) orpheline(s) restante(s)', n);
  select count(*) into n from public.instructions;
  assert n = b.n_instructions - n_dup - n_rep,
    format('[0013] instructions : %s, attendu %s', n, b.n_instructions - n_dup - n_rep);
  select count(*) into n from public.recipe_sections;
  assert n = b.n_sections + n_new, format('[0013] sections : %s, attendu %s', n, b.n_sections + n_new);
  select count(*) into n from public.recipe_ingredients;
  assert n = b.n_ingredients, format('[0013] ingrédients : %s, attendu %s (inchangé)', n, b.n_ingredients);

  raise notice '[0013] % instruction(s) orpheline(s) : % doublon(s) supprimé(s), % version(s) remplacée(s) supprimée(s), % rattachée(s) (% section(s) créée(s))',
    b.n_orphans, n_dup, n_rep, n_att, n_new;
end $$;

-- ----------------------------------------------------------------------------
-- 3. save_recipe sans JSONB (= 0011 moins l'étape « JSONB legacy »)
-- ----------------------------------------------------------------------------
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

-- ----------------------------------------------------------------------------
-- 4. Suppression des colonnes JSONB
-- ----------------------------------------------------------------------------
alter table public.recipes
  drop column if exists ingredients,
  drop column if exists instructions;

comment on column public.recipe_ingredients.amount is
  'Quantité telle que saisie (texte libre : « 2 à 3 », « au goût », « 1 ½ »), affichée si amount_num est NULL. Conservée volontairement (0013) ; amount_num sert aux calculs.';

-- ----------------------------------------------------------------------------
-- 5. search_recipes sans ingredients / instructions (type de retour modifié)
-- ----------------------------------------------------------------------------
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

-- ----------------------------------------------------------------------------
-- 6. Vérifications finales
-- ----------------------------------------------------------------------------
do $$
begin
  assert not exists (select 1 from information_schema.columns
                      where table_schema = 'public' and table_name = 'recipes'
                        and column_name in ('ingredients', 'instructions')),
    '[0013] colonnes JSONB toujours présentes';
  assert (select count(*) from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
           where ns.nspname = 'public' and p.proname = 'save_recipe') = 1, '[0013] save_recipe : 1 surcharge attendue';
  assert position('photo_path' in pg_get_functiondef('public.save_recipe(jsonb)'::regprocedure)) > 0,
    '[0013] save_recipe doit écrire photo_path';
  assert has_function_privilege('authenticated', 'public.save_recipe(jsonb)', 'execute')
     and not has_function_privilege('anon', 'public.save_recipe(jsonb)', 'execute'),
    '[0013] droits save_recipe';
  assert has_function_privilege('anon', 'public.search_recipes(text, text, text[], int, int)', 'execute'),
    '[0013] droits search_recipes';
  raise notice '[0013] colonnes recipes.ingredients / recipes.instructions supprimées ; save_recipe et search_recipes recréées';
end $$;

notify pgrst, 'reload schema';

commit;
