-- ============================================================================
--  0027 — report_shared_recipe(p_token, p_reason, p_details) : « Signaler » depuis la page publique /r/<jeton>, phase 6E
-- ============================================================================
--  QUOI
--   Une fonction, `public.report_shared_recipe`, qui enregistre un signalement (table `reports`, 0017) pour la recette
--   derrière un jeton de lien public. Réservée aux personnes CONNECTÉES. Renvoie l'identifiant du signalement.
--
--  POURQUOI
--   La page publique n'a que le jeton : `get_shared_recipe` (0021) ne renvoie volontairement AUCUN identifiant de recette.
--   Or `reports` s'insère par `recipe_id` (politique `reports_insert_own`, 0019). Sans cette fonction, la page publique ne
--   pourrait pas signaler, sauf à révéler l'identifiant de la recette à tout le monde. La fiche d'une recette (connecté,
--   droit de lecture) continue d'insérer directement dans `reports`, sans cette fonction.
--
--  CHOIX DE CONCEPTION
--   1. SECURITY DEFINER, search_path vide, `auth.uid()` jamais passé en paramètre, jamais PUBLIC ni anon : un visiteur sans
--      compte doit se connecter pour signaler (pas de limite de débit possible sans identité, donc pas de porte ouverte au spam).
--   2. LIMITE DE DÉBIT : aucune logique nouvelle. L'insertion passe par le déclencheur `trg_0023_reports_rate_limit` (0023) qui
--      compte les signalements de la personne sur 24 h (10 au plus, SQLSTATE 54000, sous verrou consultatif) : le même plafond
--      que l'insertion directe, partagé entre les deux chemins.
--   3. Entrées : motif parmi illegal | copyright | spam | other (sinon 22023) ; détails facultatifs, 2000 caractères au plus
--      (comme la contrainte de la table), espaces de bord retirés, vide = NULL. Jeton inconnu ou révoqué : P0002.
--   4. Aucune table, colonne, politique ni donnée modifiée : sans effet sur la v1 (aucun lien public n'existe en v1).
--      Compatible avec le SQL Editor de Supabase (aucune table temporaire).
--
--  Retour arrière : supabase/rollback/0027_report_shared_recipe_down.sql. Prérequis : 0017, 0021 (recipe_share_links), 0023 (limite).
-- ============================================================================
begin;

do $$
begin
  assert to_regclass('public.reports') is not null, '[0027] 0017 absente : appliquer 0017 d''abord';
  assert to_regclass('public.recipe_share_links') is not null, '[0027] recipe_share_links absente : appliquer 0017 / 0021 d''abord';
  assert to_regprocedure('private.trg_reports_rate_limit()') is not null, '[0027] 0023 absente : la limite de 10 signalements par jour est requise';
end $$;

create or replace function public.report_shared_recipe(p_token uuid, p_reason text, p_details text default null)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_me      uuid := (select auth.uid());
  v_recipe  uuid;
  v_details text := nullif(btrim(coalesce(p_details, '')), '');
  v_id      uuid;
begin
  if v_me is null then
    raise exception 'Connexion requise' using errcode = '42501';
  end if;
  if p_reason is null or p_reason not in ('illegal', 'copyright', 'spam', 'other') then
    raise exception 'Motif de signalement invalide' using errcode = '22023';
  end if;
  if v_details is not null and char_length(v_details) > 2000 then
    raise exception 'Les détails du signalement sont limités à 2000 caractères' using errcode = '22023';
  end if;
  select l.recipe_id into v_recipe from public.recipe_share_links l where l.token = p_token;
  if v_recipe is null then
    raise exception 'Lien introuvable' using errcode = 'P0002';
  end if;
  -- le déclencheur de 0023 applique la limite (10 par jour, 54000) car reporter_id = auth.uid()
  insert into public.reports (recipe_id, reporter_id, reason, details)
  values (v_recipe, v_me, p_reason, v_details)
  returning id into v_id;
  return v_id;
end;
$$;
comment on function public.report_shared_recipe(uuid, text, text) is
  'Signaler la recette d''un lien public (page /r/<jeton>) : connecté seulement, motif illegal | copyright | spam | other, détails ≤ 2000 caractères, 10 signalements par jour (54000, déclencheur de 0023), jeton inconnu ou révoqué = P0002. 0027.';

revoke execute on function public.report_shared_recipe(uuid, text, text) from public, anon;
grant execute on function public.report_shared_recipe(uuid, text, text) to authenticated, service_role;

do $$
declare r record;
begin
  select p.oid, p.prosecdef, p.proconfig into r
    from pg_proc p where p.oid = 'public.report_shared_recipe(uuid, text, text)'::regprocedure;
  assert r.prosecdef, '[0027] report_shared_recipe n''est pas security definer';
  assert r.proconfig is not null and 'search_path=""' = any (r.proconfig), '[0027] search_path non vide';
  assert has_function_privilege('authenticated', r.oid, 'execute') and not has_function_privilege('anon', r.oid, 'execute'),
    '[0027] droits d''exécution inattendus';
  assert not exists (select 1 from pg_proc x, aclexplode(coalesce(x.proacl, acldefault('f', x.proowner))) a
                      where x.oid = r.oid and a.grantee = 0), '[0027] exécutable par PUBLIC';
  raise notice '[0027] report_shared_recipe créée ; aucune table, politique ni donnée touchée';
end $$;

notify pgrst, 'reload schema';

commit;
