-- ============================================================================
--  Vérifications post-amorçage (base LOCALE avec le snapshot prod)
-- ============================================================================
--  Compare l'état de la base locale aux comptes attendus de
--  MIGRATION_NOTES.md § 4 (lecture prod du 2026-10-03). Si le snapshot est
--  régénéré plus tard (nouvelles recettes), mettre à jour les valeurs ici
--  ou lancer setup.sh --no-verify.
--  Échec = exception → setup.sh s'arrête avec un code non nul.
-- ============================================================================
begin;
create temporary table tmp_verify (name text, expected text, actual text) on commit drop;

insert into tmp_verify values
  ('recipes',                       '181',  (select count(*) from public.recipes)::text),
  ('units (0003)',                  '37',   (select count(*) from public.units)::text),
  ('unit_aliases (0003)',           '190',  (select count(*) from public.unit_aliases)::text),
  ('unit_code renseignés (0003)',   '1364', (select count(*) filter (where unit_code is not null) from public.recipe_ingredients_backup_20261003)::text),
  ('amount_num renseignés (0004)',  '1556', (select count(*) filter (where amount_num is not null) from public.recipe_ingredients_backup_20261003)::text),
  ('recipe_sections (0005)',        '359',  (select count(*) from public.recipe_sections)::text),
  ('recipe_ingredients (0005)',     '1546', (select count(*) from public.recipe_ingredients)::text),
  ('ingrédients orphelins (0005)',  '0',    (select count(*) from public.recipe_ingredients where section_id is null)::text),
  ('instructions (0005)',           '1545', (select count(*) from public.instructions)::text),
  ('recettes sans section (0005)',  '0',    (select count(*) from public.recipes r where not exists (select 1 from public.recipe_sections s where s.recipe_id = r.id))::text),
  ('archive orphelins (0005)',      '1060', (select count(*) from public.recipe_ingredients_orphans_20261003)::text),
  ('archive instr. orph. (0005)',   '7',    (select count(*) from public.instructions_orphans_20261003)::text),
  ('politiques public (0009)',      '42',   (select count(*) from pg_policies where schemaname = 'public')::text),
  ('public.is_admin (0009)',        'absente', case when to_regprocedure('public.is_admin()') is null then 'absente' else 'présente' end),
  ('private.is_admin (0009)',       'présente', case when to_regprocedure('private.is_admin()') is null then 'absente' else 'présente' end),
  ('hook JWT (0009)',               'présente', case when to_regprocedure('public.custom_access_token_hook(jsonb)') is null then 'absente' else 'présente' end),
  ('bucket recipe-photos (0010)',   'public', (select case when public then 'public' else 'privé' end from storage.buckets where id = 'recipe-photos')),
  ('politiques storage (0010)',     '4',    (select count(*) from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname like 'recipe_photos%')::text),
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
