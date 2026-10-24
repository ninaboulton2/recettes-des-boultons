-- ============================================================================
--  Mesures de performance de la v2 sur les vraies données (phase 10) — base LOCALE, état v2
-- ============================================================================
--    psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -X -f supabase/local/rehearsal_perf.sql
--
--  Pour un membre du groupe (pas le propriétaire) et pour le propriétaire, simule `authenticated` (jeton) puis
--  mesure par `explain (analyze, buffers)` : search_recipes (sans requête, « poulet », « chicken »), list_cookbook,
--  pending_prompts, la lecture d'une fiche (recette + sections + ingrédients + étapes + traduction) et un select
--  sur recipes sous RLS. Chaque requête est jouée 1 fois à chaud avant la mesure. Seule la ligne « Execution Time »
--  est gardée ; le détail des plans se lit en retirant le filtre. Transaction annulée.
-- ============================================================================
\set ON_ERROR_STOP on
\pset format unaligned
\pset tuples_only on
begin;
analyze public.recipes; analyze public.recipe_sections; analyze public.recipe_ingredients; analyze public.instructions;
analyze public.recipe_translations; analyze public.recipe_grants; analyze public.group_members; analyze public.cookbook_entries;

create temp table perf (n serial primary key, who text, what text, ms numeric);
grant all on perf to public;
grant usage, select on sequence perf_n_seq to public;

create or replace function pg_temp.timeit(who text, what text, q text) returns void language plpgsql as $$
declare l text; ms numeric := null; best numeric := null; i int;
begin
  -- 1 passe à chaud (non comptée) puis 5 mesures : on garde la médiane approchée (meilleure des 5 et dernière)
  execute q;
  for i in 1..5 loop
    for l in execute 'explain (analyze, timing on) ' || q loop
      if l like 'Execution Time:%' then ms := substring(l from '([0-9.]+) ms')::numeric; end if;
    end loop;
    best := least(coalesce(best, ms), ms);
  end loop;
  insert into perf(who, what, ms) values (who, what, best);
end $$;
grant execute on function pg_temp.timeit(text, text, text) to public;

do $$
declare grp uuid; owner uuid; member uuid; rid uuid; who text; uid uuid;
begin
  select grantee_group_id into grp from public.recipe_grants where permission = 'edit_original' and grantee_group_id is not null group by 1 limit 1;
  select created_by into owner from public.groups where id = grp;
  select user_id into member from public.group_members where group_id = grp and user_id <> owner order by user_id limit 1;
  select id into rid from public.recipes order by (select count(*) from public.recipe_ingredients i where i.recipe_id = recipes.id) desc limit 1;

  foreach who in array array['membre', 'propriétaire'] loop
    uid := case who when 'membre' then member else owner end;
    perform set_config('request.jwt.claims', jsonb_build_object('sub', uid, 'role', 'authenticated', 'user_role', case who when 'membre' then 'user' else 'admin' end)::text, true);
    execute 'set local role authenticated';
    perform pg_temp.timeit(who, 'select * from recipes (RLS, 181 lignes)', 'select * from public.recipes');
    perform pg_temp.timeit(who, 'select id,title from recipes order by created_at desc limit 24', 'select id, title from public.recipes order by created_at desc limit 24');
    perform pg_temp.timeit(who, 'search_recipes(null) page de 24', 'select * from public.search_recipes(null, null, null, 24, 0)');
    perform pg_temp.timeit(who, 'search_recipes(''poulet'') fr', 'select * from public.search_recipes(''poulet'', null, null, 24, 0)');
    perform pg_temp.timeit(who, 'search_recipes(''chicken'') en', 'select * from public.search_recipes(''chicken'', null, null, 24, 0)');
    perform pg_temp.timeit(who, 'search_recipes(''tart'') partiel', 'select * from public.search_recipes(''tart'', null, null, 24, 0)');
    perform pg_temp.timeit(who, 'list_cookbook() page de 24', 'select * from public.list_cookbook(null, null, 24, 0)');
    perform pg_temp.timeit(who, 'list_cookbook(requête)', 'select * from public.list_cookbook(null, ''tarte'', 24, 0)');
    perform pg_temp.timeit(who, 'pending_prompts()', 'select * from public.pending_prompts(null, 20)');
    perform pg_temp.timeit(who, 'recipe_access(fiche)', format('select * from public.recipe_access(%L)', rid));
    perform pg_temp.timeit(who, 'fiche : recette+sections+ingrédients+étapes+traduction',
      format($q$select r.*, (select jsonb_agg(s order by s.order_index) from public.recipe_sections s where s.recipe_id = r.id),
                        (select jsonb_agg(i order by i.order_index) from public.recipe_ingredients i where i.recipe_id = r.id),
                        (select jsonb_agg(n order by n.order_index) from public.instructions n where n.recipe_id = r.id),
                        (select to_jsonb(t) from public.recipe_translations t where t.recipe_id = r.id limit 1)
                   from public.recipes r where r.id = %L$q$, rid));
    perform pg_temp.timeit(who, 'fiche via embed PostgREST (jointures)',
      format('select r.id, s.id, i.id, n.id from public.recipes r left join public.recipe_sections s on s.recipe_id = r.id left join public.recipe_ingredients i on i.section_id = s.id left join public.instructions n on n.section_id = s.id where r.id = %L', rid));
    perform pg_temp.timeit(who, 'favoris + recettes (accueil)', 'select f.recipe_id, r.title from public.favorites f join public.recipes r on r.id = f.recipe_id');
    perform pg_temp.timeit(who, 'planning de la semaine', 'select p.*, r.title from public.planning p left join public.recipes r on r.id = p.recipe_id');
    reset role;
  end loop;
end $$;

\pset tuples_only off
\pset format aligned
select who, what, ms, case when ms < 200 then 'OK' else 'LENT (> 200 ms)' end as verdict from perf order by n;
rollback;
