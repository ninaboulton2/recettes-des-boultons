-- ============================================================================
--  0005 — Recettes sans section : JSONB legacy → une section « Recette »
--         + archivage/suppression des ingrédients orphelins
-- ============================================================================
--  QUOI
--   1. Sauvegardes intégrales (recipes, recipe_sections, recipe_ingredients,
--      instructions) dans *_backup_20261003 (RLS activé, aucune politique :
--      invisibles via l'API).
--   2. Pour chaque recette SANS AUCUNE section : création d'une section
--      `name = 'Recette'`, `type = 'mixed'`, `order_index = 0`, puis insertion
--      des ingrédients et instructions depuis `recipes.ingredients` /
--      `recipes.instructions` (JSONB).
--        - forme JSONB constatée en prod : ingredients = [{name, unit, amount}]
--          (amount : nombre, ou chaîne « to taste »…, ou null ; 2 recettes ont
--          aussi `optional`), instructions = [string].
--        - amount 0 → NULL (c'est ce que faisait déjà l'ancien import : les
--          4 lignes orphelines concernées sont à NULL), unit '' → NULL.
--        - amount_num / unit_code dérivés via parse_amount / normalize_unit.
--   3. Les lignes `recipe_ingredients.section_id IS NULL` (« orphelins »,
--      jamais lues : l'API filtre `section_id is not null`) sont archivées
--      dans `recipe_ingredients_orphans_20261003` puis SUPPRIMÉES (exception
--      « expand only » explicitement autorisée). Garde-fou : chaque orphelin
--      doit avoir un homonyme dans le JSONB de sa recette (1 060/1 060 en
--      prod), sinon la migration s'arrête.
--   4. Les 7 `instructions.section_id IS NULL` sont archivées dans
--      `instructions_orphans_20261003` mais CONSERVÉES (suppression non
--      autorisée par le cahier des charges ; décision humaine en phase 4).
--
--  Choix du nom de section : le front (pages/recettes/[id].vue) affiche
--  toujours `section.name` en <h3>, même pour une section unique ; une chaîne
--  vide laisserait un titre blanc → nom neutre « Recette ».
--
--  NE SUPPRIME PAS les colonnes JSONB (phase 4) — elles restent lues par le
--  front en repli et sont recalculées par save_recipe (0006).
--
--  RÉVERSIBILITÉ
--   Les tables *_backup_20261003 permettent de restaurer l'état exact :
--     delete from recipe_ingredients where section_id in (select id from
--       recipe_sections where name='Recette' and type='mixed' and created_at >= <date>) …
--   ou plus simplement truncate + insert … select from *_backup_20261003
--   (ordre : recipes, recipe_sections, recipe_ingredients, instructions).
--
--  COMPTES ATTENDUS EN PROD (lecture du 2026-10-03)
--   Avant : 181 recettes, 241 sections, 1 712 ingrédients (1 060 orphelins),
--           641 instructions (7 orphelines), 118 recettes sans section.
--   Migration : +118 sections, +894 ingrédients, +904 instructions,
--               1 060 orphelins archivés puis supprimés, 7 instr. archivées.
--   Après : 359 sections, 1 546 ingrédients (0 orphelin), 1 545 instructions,
--           0 recette sans section.
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- 1. Sauvegardes (créées une seule fois ; `if not exists` → rejeu sans effet)
-- ----------------------------------------------------------------------------
create table if not exists public.recipes_backup_20261003            as select * from public.recipes;
create table if not exists public.recipe_sections_backup_20261003    as select * from public.recipe_sections;
create table if not exists public.recipe_ingredients_backup_20261003 as select * from public.recipe_ingredients;
create table if not exists public.instructions_backup_20261003       as select * from public.instructions;

do $$
declare t text;
begin
  foreach t in array array['recipes_backup_20261003','recipe_sections_backup_20261003',
                           'recipe_ingredients_backup_20261003','instructions_backup_20261003'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('comment on table public.%I is %L', t,
      'Sauvegarde avant migration 0005 (2026-10-03). À supprimer en phase 4 après validation.');
  end loop;
end $$;

-- ----------------------------------------------------------------------------
-- 2. Cibles : recettes sans aucune section
-- ----------------------------------------------------------------------------
create temporary table tmp_0005_targets on commit drop as
  select r.id as recipe_id,
         case when jsonb_typeof(r.ingredients) = 'array' then r.ingredients else '[]'::jsonb end as ingredients,
         case when jsonb_typeof(r.instructions) = 'array' then r.instructions else '[]'::jsonb end as instructions
    from public.recipes r
   where not exists (select 1 from public.recipe_sections s where s.recipe_id = r.id);

create temporary table tmp_0005_expected on commit drop as
  select (select count(*) from tmp_0005_targets)                                              as n_recipes,
         (select count(*) from tmp_0005_targets t, jsonb_array_elements(t.ingredients) e
            where coalesce(btrim(e->>'name'), '') <> '')                                     as n_ing,
         (select count(*) from tmp_0005_targets t, jsonb_array_elements(t.instructions) e
            where coalesce(btrim(case when jsonb_typeof(e) = 'string' then e #>> '{}' else e->>'content' end), '') <> '')
                                                                                               as n_ins,
         (select count(*) from public.recipe_sections)                                        as n_sections_before,
         (select count(*) from public.recipe_ingredients)                                     as n_ingredients_before,
         (select count(*) from public.instructions)                                           as n_instructions_before,
         (select count(*) from public.recipe_ingredients where section_id is null)            as n_orphans_before;

-- Garde-fou : tout orphelin doit correspondre (par nom) à une entrée du JSONB
-- de sa recette, sinon sa suppression perdrait de l'information.
do $$
declare n_unmatched int; sample text;
begin
  select count(*), string_agg(format('%s « %s »', o.recipe_id, o.name), ' ; ' order by o.name) filter (where true)
    into n_unmatched, sample
    from public.recipe_ingredients o
   where o.section_id is null
     and not exists (
       select 1 from public.recipes r, jsonb_array_elements(case when jsonb_typeof(r.ingredients) = 'array' then r.ingredients else '[]'::jsonb end) e
        where r.id = o.recipe_id and btrim(e->>'name') = btrim(o.name));
  assert n_unmatched = 0,
    format('[0005] %s ingrédient(s) orphelin(s) sans homonyme dans le JSONB de leur recette — arrêt : %s', n_unmatched, left(sample, 2000));
end $$;

-- ----------------------------------------------------------------------------
-- 3. Section par défaut + contenu depuis le JSONB
-- ----------------------------------------------------------------------------
create temporary table tmp_0005_sections on commit drop as
  select t.recipe_id, gen_random_uuid() as section_id from tmp_0005_targets t;

insert into public.recipe_sections (id, recipe_id, name, type, order_index)
select s.section_id, s.recipe_id, 'Recette', 'mixed', 0 from tmp_0005_sections s;

insert into public.recipe_ingredients (recipe_id, section_id, name, amount, amount_num, unit, unit_code, optional, order_index)
select t.recipe_id,
       s.section_id,
       btrim(e->>'name'),
       x.amount_txt,
       public.parse_amount(x.amount_txt),
       x.unit_txt,
       public.normalize_unit(x.unit_txt),
       coalesce((e->>'optional')::boolean, false),
       (ord - 1)::int
  from tmp_0005_targets t
  join tmp_0005_sections s on s.recipe_id = t.recipe_id
  cross join lateral jsonb_array_elements(t.ingredients) with ordinality as a(e, ord)
  cross join lateral (
    select case
             when jsonb_typeof(e->'amount') = 'number' and (e->>'amount')::numeric = 0 then null
             when jsonb_typeof(e->'amount') = 'number' then public.format_amount((e->>'amount')::numeric)
             else nullif(btrim(e->>'amount'), '')
           end as amount_txt,
           nullif(btrim(e->>'unit'), '') as unit_txt
  ) x
 where coalesce(btrim(e->>'name'), '') <> '';

insert into public.instructions (recipe_id, section_id, content, order_index)
select t.recipe_id,
       s.section_id,
       btrim(case when jsonb_typeof(e) = 'string' then e #>> '{}' else e->>'content' end),
       (ord - 1)::int
  from tmp_0005_targets t
  join tmp_0005_sections s on s.recipe_id = t.recipe_id
  cross join lateral jsonb_array_elements(t.instructions) with ordinality as a(e, ord)
 where coalesce(btrim(case when jsonb_typeof(e) = 'string' then e #>> '{}' else e->>'content' end), '') <> '';

-- ----------------------------------------------------------------------------
-- 4. Orphelins : archivage puis suppression (ingrédients) / archivage (instr.)
-- ----------------------------------------------------------------------------
create table if not exists public.recipe_ingredients_orphans_20261003 as
  select o.*, now() as archived_at from public.recipe_ingredients o where false;
alter table public.recipe_ingredients_orphans_20261003 enable row level security;
revoke all on public.recipe_ingredients_orphans_20261003 from anon, authenticated;
comment on table public.recipe_ingredients_orphans_20261003 is
  'Ingrédients section_id NULL (jamais lus par l''API) archivés puis supprimés par 0005. À supprimer en phase 4.';

insert into public.recipe_ingredients_orphans_20261003
select o.*, now()
  from public.recipe_ingredients o
 where o.section_id is null
   and o.id not in (select id from public.recipe_ingredients_orphans_20261003);

delete from public.recipe_ingredients where section_id is null;

create table if not exists public.instructions_orphans_20261003 as
  select o.*, now() as archived_at from public.instructions o where false;
alter table public.instructions_orphans_20261003 enable row level security;
revoke all on public.instructions_orphans_20261003 from anon, authenticated;
comment on table public.instructions_orphans_20261003 is
  'Instructions section_id NULL (jamais lues par l''API) archivées par 0005 — CONSERVÉES dans instructions. Décision phase 4.';

insert into public.instructions_orphans_20261003
select o.*, now()
  from public.instructions o
 where o.section_id is null
   and o.id not in (select id from public.instructions_orphans_20261003);

-- ----------------------------------------------------------------------------
-- 5. Vérifications
-- ----------------------------------------------------------------------------
do $$
declare e record; n bigint;
begin
  select * into e from tmp_0005_expected;

  select count(*) into n from public.recipes r
   where not exists (select 1 from public.recipe_sections s where s.recipe_id = r.id);
  assert n = 0, format('[0005] %s recette(s) toujours sans section', n);

  select count(*) into n from public.recipe_sections;
  assert n = e.n_sections_before + e.n_recipes,
    format('[0005] sections : %s, attendu %s', n, e.n_sections_before + e.n_recipes);

  select count(*) into n from public.recipe_ingredients;
  assert n = e.n_ingredients_before - e.n_orphans_before + e.n_ing,
    format('[0005] ingrédients : %s, attendu %s', n, e.n_ingredients_before - e.n_orphans_before + e.n_ing);

  select count(*) into n from public.recipe_ingredients where section_id is null;
  assert n = 0, format('[0005] %s orphelin(s) restant(s)', n);

  select count(*) into n from public.instructions;
  assert n = e.n_instructions_before + e.n_ins,
    format('[0005] instructions : %s, attendu %s', n, e.n_instructions_before + e.n_ins);

  select count(*) into n from public.recipe_ingredients_orphans_20261003;
  assert n >= e.n_orphans_before, format('[0005] archive orphelins : %s < %s', n, e.n_orphans_before);

  -- Chaque recette migrée a exactement une section « Recette » mixte.
  select count(*) into n from tmp_0005_targets t
   where (select count(*) from public.recipe_sections s where s.recipe_id = t.recipe_id and s.type = 'mixed' and s.name = 'Recette') <> 1;
  assert n = 0, format('[0005] %s recette(s) migrée(s) sans section unique « Recette »', n);

  raise notice '[0005] % recette(s) migrée(s), +% ingrédient(s), +% instruction(s), % orphelin(s) archivé(s)/supprimé(s), % instruction(s) orpheline(s) archivée(s) (conservées)',
    e.n_recipes, e.n_ing, e.n_ins, e.n_orphans_before,
    (select count(*) from public.instructions_orphans_20261003);
end $$;

commit;
