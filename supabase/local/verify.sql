-- ============================================================================
--  Vérifications post-amorçage (base LOCALE avec le snapshot prod)
-- ============================================================================
--  Compare l'état de la base locale, migrations 0003 → 0015 appliquées, aux
--  comptes attendus (MIGRATION_NOTES.md § 4 et § 8, snapshot prod du
--  2026-10-03). Les comptes de contenu ne portent que sur les recettes du
--  snapshot (created_at < 2026-10-03) : les recettes créées ensuite en local
--  (tests de l'app) sont ignorées. Une recette du snapshot MODIFIÉE en local
--  fera apparaître un écart (normal) : relancer après `npm run db:local:reset`.
--  Si le snapshot est régénéré, mettre à jour la date et les valeurs, ou
--  lancer setup.sh --no-verify.
--  Échec = exception → setup.sh s'arrête avec un code non nul.
-- ============================================================================
begin;
create temporary table tmp_snap on commit drop as
  select id from public.recipes where created_at < '2026-10-03';
create temporary table tmp_verify (name text, expected text, actual text) on commit drop;

insert into tmp_verify values
  ('recettes du snapshot',          '181',  (select count(*) from tmp_snap)::text),
  ('units (0003)',                  '37',   (select count(*) from public.units)::text),
  ('unit_aliases (0003)',           '190',  (select count(*) from public.unit_aliases)::text),
  ('unit_code renseignés (0003/0015)', '1233', (select count(*) from public.recipe_ingredients where unit_code is not null and recipe_id in (select id from tmp_snap))::text),
  ('amount_num renseignés (0004)',  '1403', (select count(*) from public.recipe_ingredients where amount_num is not null and recipe_id in (select id from tmp_snap))::text),
  ('unités non reconnues (0015)',   '6',    (select count(*) from public.recipe_ingredients where unit is not null and unit_code is null and recipe_id in (select id from tmp_snap))::text),
  ('recipe_sections (0005/0015)',   '358',  (select count(*) from public.recipe_sections where recipe_id in (select id from tmp_snap))::text),
  ('recipe_ingredients (0005)',     '1546', (select count(*) from public.recipe_ingredients where recipe_id in (select id from tmp_snap))::text),
  ('instructions (0005/0013)',      '1538', (select count(*) from public.instructions where recipe_id in (select id from tmp_snap))::text),
  ('ingrédients orphelins (0005)',  '0',    (select count(*) from public.recipe_ingredients where section_id is null)::text),
  ('instructions orphelines (0013)', '0',   (select count(*) from public.instructions where section_id is null)::text),
  ('recettes sans section (0005)',  '0',    (select count(*) from public.recipes r where not exists (select 1 from public.recipe_sections s where s.recipe_id = r.id))::text),
  ('colonnes JSONB recipes (0013)', 'absentes', case when exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'recipes' and column_name in ('ingredients', 'instructions')) then 'présentes' else 'absentes' end),
  ('search_recipes sans JSONB (0013)', 'oui', case when position('ingredients' in pg_get_function_result('public.search_recipes(text, text, text[], int, int)'::regprocedure)) = 0 then 'oui' else 'non' end),
  ('sauvegardes *_20261003 (0014)', '0 ou 6', (select case when count(*) in (0, 6) then '0 ou 6' else count(*)::text end from pg_tables where schemaname = 'public' and (tablename like '%\_backup\_20261003' or tablename like '%\_orphans\_20261003'))),
  ('sauvegarde nettoyage (0015)',   '28',   (select count(*) from public.recipe_ingredients_backup_cleanup)::text),
  ('politiques public (0009/0012)', '44',   (select count(*) from pg_policies where schemaname = 'public')::text),
  ('public.is_admin (0009)',        'absente', case when to_regprocedure('public.is_admin()') is null then 'absente' else 'présente' end),
  ('private.is_admin (0009)',       'présente', case when to_regprocedure('private.is_admin()') is null then 'absente' else 'présente' end),
  ('hook JWT (0009)',               'présente', case when to_regprocedure('public.custom_access_token_hook(jsonb)') is null then 'absente' else 'présente' end),
  ('bucket recipe-photos (0010)',   'public', (select case when public then 'public' else 'privé' end from storage.buckets where id = 'recipe-photos')),
  ('politiques storage (0010)',     '4',    (select count(*) from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname like 'recipe_photos%')::text),
  ('ai_usage (0012)',               'présente', case when to_regclass('public.ai_usage') is null then 'absente' else 'présente' end),
  ('admin@local.test',              'admin', (select p.role from public.profiles p join auth.users u on u.id = p.id where u.email = 'admin@local.test')),
  ('user@local.test',               'user',  (select p.role from public.profiles p join auth.users u on u.id = p.id where u.email = 'user@local.test'));

select name, expected, actual, case when expected = actual then 'ok' else 'ÉCART' end as statut
  from tmp_verify order by name;

do $$
declare n int; detail text;
begin
  select count(*), string_agg(format('%s : attendu %s, obtenu %s', name, expected, coalesce(actual, 'NULL')), ' ; ')
    into n, detail from tmp_verify where expected is distinct from actual;
  if n > 0 then
    raise exception '[verify] % écart(s) avec les comptes attendus — %', n, detail;
  end if;
  raise notice '[verify] % vérifications OK', (select count(*) from tmp_verify);
end $$;
commit;
