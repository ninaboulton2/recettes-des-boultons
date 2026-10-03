-- ============================================================================
--  0014 — Suppression des sauvegardes de la migration 0005
-- ============================================================================
--  ⚠️  À APPLIQUER EN PRODUCTION UNE SEMAINE APRÈS LA BASCULE, ET SEULEMENT
--      APRÈS VALIDATION : nouveau code en ligne sans incident, 0013 appliquée
--      depuis quelques jours, contrôles de BASCULE_PROD.md (étape 8) OK.
--      Après 0014, plus AUCUN retour arrière vers l'état d'avant 0005 n'est
--      possible autrement que par la sauvegarde de la base (Database →
--      Backups, ou l'export pg_dump fait avant la bascule).
--
--  QUOI : supprime exactement ces 6 tables (créées par 0005, RLS sans
--  politique, invisibles via l'API) :
--     public.recipes_backup_20261003              (181 lignes en prod)
--     public.recipe_sections_backup_20261003      (241)
--     public.recipe_ingredients_backup_20261003   (1 712 au snapshot ; le
--                                                  nombre réel est celui du
--                                                  jour de 0005)
--     public.instructions_backup_20261003         (641)
--     public.recipe_ingredients_orphans_20261003  (1 060)
--     public.instructions_orphans_20261003        (7)
--  Rien d'autre (la table de sauvegarde de 0015, si 0015 a été appliquée,
--  `recipe_ingredients_backup_cleanup` & co, se supprime à part : voir 0015).
--
--  GARDE-FOUS (arrêt sans rien supprimer si l'un échoue)
--   - 0013 appliquée (colonnes recipes.ingredients/instructions absentes) :
--     tant que 0013 n'est pas passée, ces sauvegardes sont le filet de 0005 ;
--   - aucune recette sans section, aucun ingrédient ni instruction orphelin ;
--   - chaque recette de la sauvegarde encore présente a au moins autant de
--     sections qu'avant 0005 (sections vides retirées par 0015 comprises) OU
--     a été modifiée depuis (updated_at plus récent) → sinon une recette
--     aurait perdu des sections sans édition : arrêt ;
--   - `drop table` SANS cascade : si un objet en dépend, erreur et rien n'est
--     supprimé.
--  NOTICE attendue : la liste des 6 tables avec leur nombre de lignes, puis
--  « [0014] 6 table(s) supprimée(s) ». Rejeu : « 0 table(s) supprimée(s) ».
--
--  RÉVERSIBILITÉ : aucune (données de sauvegarde). Restauration éventuelle
--  depuis la sauvegarde Supabase / le pg_dump d'avant bascule.
-- ============================================================================

begin;

do $$
declare n int; sample text;
begin
  assert not exists (select 1 from information_schema.columns
                      where table_schema = 'public' and table_name = 'recipes'
                        and column_name in ('ingredients', 'instructions')),
    '[0014] 0013 non appliquée (colonnes JSONB présentes) : appliquer 0013 et attendre la validation avant de supprimer les sauvegardes';
  assert not exists (select 1 from public.recipes r
                      where not exists (select 1 from public.recipe_sections s where s.recipe_id = r.id)),
    '[0014] des recettes n''ont aucune section';
  assert not exists (select 1 from public.recipe_ingredients where section_id is null), '[0014] ingrédients orphelins présents';
  assert not exists (select 1 from public.instructions where section_id is null), '[0014] instructions orphelines présentes';

  if to_regclass('public.recipes_backup_20261003') is not null
     and to_regclass('public.recipe_sections_backup_20261003') is not null then
    -- Sections supprimées volontairement par 0015 (R6 : sections vides) : comptées comme présentes.
    execute format($q$
      select count(*), string_agg(format('« %%s » (%%s → %%s)', b.title, b.n_before, b.n_now), ' ; ')
        from (select rb.id, rb.title, rb.updated_at,
                     (select count(*) from public.recipe_sections_backup_20261003 sb where sb.recipe_id = rb.id) as n_before,
                     (select count(*) from public.recipe_sections s where s.recipe_id = rb.id) + %s as n_now
                from public.recipes_backup_20261003 rb) b
        join public.recipes r on r.id = b.id
       where b.n_now < b.n_before and r.updated_at is not distinct from b.updated_at $q$,
      case when to_regclass('public.recipe_sections_backup_cleanup') is not null
           then '(select count(*) from public.recipe_sections_backup_cleanup c where c.recipe_id = rb.id)'
           else '0' end)
      into n, sample;
    assert n = 0, format('[0014] %s recette(s) ont perdu des sections sans avoir été modifiées : %s', n, left(sample, 1500));
  end if;
end $$;

do $$
declare t text; n bigint; dropped int := 0;
begin
  foreach t in array array['recipes_backup_20261003', 'recipe_sections_backup_20261003',
                           'recipe_ingredients_backup_20261003', 'instructions_backup_20261003',
                           'recipe_ingredients_orphans_20261003', 'instructions_orphans_20261003'] loop
    if to_regclass('public.' || t) is not null then
      execute format('select count(*) from public.%I', t) into n;
      raise notice '[0014] suppression de public.% (% ligne(s))', t, n;
      execute format('drop table public.%I', t);
      dropped := dropped + 1;
    end if;
  end loop;
  raise notice '[0014] % table(s) supprimée(s)', dropped;
end $$;

do $$
begin
  assert not exists (select 1 from pg_tables where schemaname = 'public'
                      and (tablename like '%\_backup\_20261003' or tablename like '%\_orphans\_20261003')),
    '[0014] des tables *_20261003 subsistent';
end $$;

notify pgrst, 'reload schema';

commit;
