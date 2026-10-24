-- Retour arrière de 0030 : remet la version SQL de private.can_read_recipe (celle de 0019), plus lente mais de même résultat.
-- Aucune donnée touchée. À jouer AVANT le retour arrière de 0019 (qui supprime la fonction). Rejouable.
begin;

do $$
begin
  assert to_regprocedure('private.recipe_level(uuid)') is not null and to_regprocedure('private.is_support()') is not null,
    '[0030 down] 0019 absente : rien à rétablir';
end $$;

create or replace function private.can_read_recipe(p_recipe uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.recipe_level(p_recipe) >= 1
      or (private.is_support()
          and exists (select 1 from public.reports r
                       where r.recipe_id = p_recipe and r.status in ('open', 'reviewed')))
$$;

do $$
begin
  assert (select p.prolang = (select oid from pg_language where lanname = 'sql') from pg_proc p where p.oid = 'private.can_read_recipe(uuid)'::regprocedure),
    '[0030 down] can_read_recipe doit redevenir SQL';
  raise notice '[0030 down] can_read_recipe : version SQL de 0019 rétablie';
end $$;

commit;
