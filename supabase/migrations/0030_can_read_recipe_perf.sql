-- ============================================================================
--  0030 — private.can_read_recipe : même résultat, ~10 fois plus rapide (répétition de la bascule, phase 10)
-- ============================================================================
--  CONSTAT (répétition sur la copie des vraies données, 181 recettes, membre du groupe, `explain analyze`, rôle authenticated)
--   `select * from recipes` sous RLS : 77 ms ; `search_recipes(...)` : 150 ms ; une fiche : 29 ms. Cause : `can_read_recipe` est une fonction
--   SQL SECURITY DEFINER (donc jamais « inlinée ») appelée UNE FOIS PAR LIGNE par les politiques de lecture, et sa forme
--   `recipe_level(p) >= 1 OR (is_support() AND EXISTS(reports…))` coûte ~0,5 ms par appel (le sous-plan « reports » est évalué
--   à chaque appel même quand le premier terme suffit). La croissance est linéaire : à 1 000 recettes, ~0,5 s par liste.
--
--  QUOI
--   Même fonction (même signature, SECURITY DEFINER, STABLE, search_path vide, mêmes droits d'exécution), réécrite en plpgsql avec
--   un retour anticipé : si `recipe_level >= 1` on répond tout de suite ; seul le cas « support + recette signalée » lit `reports`.
--   Résultat identique pour toute entrée (test_0030_can_read_recipe_perf.sql le vérifie contre l'ancienne expression).
--   Mesuré : `select * from recipes` 77 → 7 ms, `search_recipes` 150 → 15 ms, fiche 29 → 3 ms (même jeu de données).
--
--  PORTÉE
--   Aucune table, colonne, politique ni donnée touchée : sans effet pour la v1, avant ou après 0018 / 0020 (la fonction n'est lue
--   que par les politiques sociales et v2). Compatible SQL Editor (pas de table temporaire). Rejouable.
--   À appliquer avec 0025 → 0029, AVANT 0018 (ou n'importe quand : indépendante de 0018 / 0020).
--  Retour arrière : supabase/rollback/0030_can_read_recipe_perf_down.sql (à jouer AVANT celui de 0019 : il recrée la fonction SQL).
--  Prérequis : 0019.
-- ============================================================================
begin;

do $$
begin
  assert to_regprocedure('private.recipe_level(uuid)') is not null and to_regprocedure('private.is_support()') is not null,
    '[0030] 0019 absente : appliquer 0019 d''abord';
  assert to_regprocedure('private.can_read_recipe(uuid)') is not null, '[0030] private.can_read_recipe absente : appliquer 0019 d''abord';
end $$;

create or replace function private.can_read_recipe(p_recipe uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if private.recipe_level(p_recipe) >= 1 then
    return true;
  end if;
  return private.is_support()
     and exists (select 1 from public.reports r
                  where r.recipe_id = p_recipe and r.status in ('open', 'reviewed'));
end;
$$;

do $$
begin
  assert (select p.prolang = (select oid from pg_language where lanname = 'plpgsql') and p.prosecdef and p.provolatile = 's'
            from pg_proc p where p.oid = 'private.can_read_recipe(uuid)'::regprocedure), '[0030] attributs de can_read_recipe inattendus';
  assert has_function_privilege('authenticated', 'private.can_read_recipe(uuid)', 'execute')
     and not has_function_privilege('anon', 'private.can_read_recipe(uuid)', 'execute'), '[0030] droits d''exécution de can_read_recipe modifiés';
  raise notice '[0030] can_read_recipe réécrite (plpgsql, retour anticipé) ; aucune table, politique ni donnée touchée';
end $$;

commit;
