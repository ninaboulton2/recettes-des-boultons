-- ============================================================================
--  ROLLBACK de 0005 — sections / ingrédients / étapes remis comme avant 0005
-- ============================================================================
--  À n'utiliser QUE si l'on revient à l'ANCIEN code (Instant Rollback Vercel)
--  après 0005 : l'ancien code charge tous les ingrédients en une requête que
--  l'API tronque à 1 000 lignes ; après 0005 il y en a ~1 530 → ingrédients et
--  étapes manquants sur une partie des recettes. Avant 0005 : ~650 lignes lues.
--  Prérequis : 0013 NON appliquée (sinon d'abord rollback/0013_contract_jsonb_down.sql)
--  et 0014 non appliquée (les sauvegardes *_20261003 doivent exister).
--
--  QUOI : pour chaque recette présente dans recipes_backup_20261003 (et encore
--  en base), supprime ses sections / ingrédients / étapes actuels et remet
--  ceux de la sauvegarde (y compris les 1 060 ingrédients orphelins, que
--  l'ancien code ignore). Les recettes CRÉÉES après 0005 ne sont pas touchées.
--  ⚠️  Les modifications faites avec le nouveau code sur une recette existante
--  sont perdues : elles sont listées en NOTICE avant restauration (la
--  transaction peut être annulée en remplaçant `commit` par `rollback`).
--  Les sauvegardes elles-mêmes ne sont pas modifiées (rejouable).
-- ============================================================================

begin;

do $$
begin
  assert to_regclass('public.recipes_backup_20261003') is not null
     and to_regclass('public.recipe_sections_backup_20261003') is not null
     and to_regclass('public.recipe_ingredients_backup_20261003') is not null
     and to_regclass('public.instructions_backup_20261003') is not null,
    'Sauvegardes *_20261003 absentes (0014 déjà passée ?) : restaurer depuis le pg_dump d''avant bascule';
end $$;

create temporary table tmp_restore on commit drop as
  select b.id, b.title, b.updated_at as backup_updated_at, r.updated_at
    from public.recipes_backup_20261003 b join public.recipes r on r.id = b.id;

do $$
declare n int; sample text;
begin
  select count(*), string_agg(format('« %s »', title), ', ' order by title) into n, sample
    from tmp_restore where updated_at is distinct from backup_updated_at;
  raise notice '[0005 rollback] % recette(s) restaurée(s) ; % modifiée(s) depuis la sauvegarde (modifications perdues) : %',
    (select count(*) from tmp_restore), n, coalesce(left(sample, 1500), '—');
end $$;

delete from public.recipe_ingredients where recipe_id in (select id from tmp_restore);
delete from public.instructions       where recipe_id in (select id from tmp_restore);
delete from public.recipe_sections    where recipe_id in (select id from tmp_restore);

insert into public.recipe_sections (id, recipe_id, name, type, order_index, created_at, updated_at)
select id, recipe_id, name, type, order_index, created_at, updated_at
  from public.recipe_sections_backup_20261003 where recipe_id in (select id from tmp_restore);

insert into public.recipe_ingredients (id, recipe_id, section_id, name, amount, unit, optional, order_index,
                                       created_at, updated_at, unit_code, amount_num)
select id, recipe_id, section_id, name, amount, unit, optional, order_index, created_at, updated_at, unit_code, amount_num
  from public.recipe_ingredients_backup_20261003 where recipe_id in (select id from tmp_restore);

insert into public.instructions (id, recipe_id, section_id, content, order_index, created_at, updated_at)
select id, recipe_id, section_id, content, order_index, created_at, updated_at
  from public.instructions_backup_20261003 where recipe_id in (select id from tmp_restore);

do $$
declare a bigint; b bigint;
begin
  select count(*) into a from public.recipe_sections where recipe_id in (select id from tmp_restore);
  select count(*) into b from public.recipe_sections_backup_20261003 where recipe_id in (select id from tmp_restore);
  assert a = b, format('[0005 rollback] sections %s ≠ sauvegarde %s', a, b);
  select count(*) into a from public.recipe_ingredients where recipe_id in (select id from tmp_restore);
  select count(*) into b from public.recipe_ingredients_backup_20261003 where recipe_id in (select id from tmp_restore);
  assert a = b, format('[0005 rollback] ingrédients %s ≠ sauvegarde %s', a, b);
  select count(*) into a from public.instructions where recipe_id in (select id from tmp_restore);
  select count(*) into b from public.instructions_backup_20261003 where recipe_id in (select id from tmp_restore);
  assert a = b, format('[0005 rollback] étapes %s ≠ sauvegarde %s', a, b);
  raise notice '[0005 rollback] état d''avant 0005 restauré (sections, ingrédients, étapes)';
end $$;

commit;
