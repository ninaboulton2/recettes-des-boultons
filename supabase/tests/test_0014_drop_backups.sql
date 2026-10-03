-- Tests 0014 : sauvegardes de 0005 supprimées, rien d'autre
begin;

do $$
begin
  assert not exists (select 1 from pg_tables where schemaname = 'public'
                      and (tablename like '%\_backup\_20261003' or tablename like '%\_orphans\_20261003')),
    'tables *_20261003 encore présentes';
  assert to_regclass('public.recipes') is not null and to_regclass('public.recipe_sections') is not null
     and to_regclass('public.recipe_ingredients') is not null and to_regclass('public.instructions') is not null,
    'tables métier absentes';
  assert (select count(*) from public.recipes) > 0, 'recettes perdues';
  raise notice '[test 0014] OK';
end $$;

rollback;
