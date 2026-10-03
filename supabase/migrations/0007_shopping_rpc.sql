-- ============================================================================
--  0007 — RPC liste de courses : merge_shopping_item / add_recipe_to_list
-- ============================================================================
--  QUOI
--   - `public.merge_shopping_item(p_list_id uuid, p_name text,
--        p_amount_num numeric, p_unit_code text, p_recipe_id uuid default null)
--      returns public.shopping_items`
--     Si la liste contient déjà un article de même nom (comparaison via
--     fold_text : insensible casse/accents/ponctuation) ET de même unit_code
--     (NULL = NULL), on ADDITIONNE amount_num, on recalcule `amount` texte
--     (format_amount), on remet is_checked à false (l'article redevient « à
--     acheter ») ; sinon on insère. Verrou `for update` sur la ligne cible
--     → deux ajouts simultanés ne créent pas de doublon. SECURITY INVOKER :
--     le RLS limite tout à ses propres listes.
--   - `public.add_recipe_to_list(p_recipe_id uuid, p_list_id uuid,
--        p_section_ids uuid[] default null, p_servings_factor numeric default 1)
--      returns setof public.shopping_items`
--     Ajoute (via merge_shopping_item) tous les ingrédients de la recette —
--     ou seulement ceux des sections listées — en multipliant amount_num par
--     le facteur (ex. 6 pers. pour une recette de 4 → 1.5). Les ingrédients
--     « optional » sont inclus (c'est l'utilisateur qui coche/supprime).
--
--  ERREURS : « Le nom de l''article est obligatoire », « Unité inconnue : … »,
--  « Liste de courses introuvable ou non autorisée », « Recette introuvable »,
--  « Le facteur de portions doit être strictement positif ».
--
--  DROITS : execute pour `authenticated` uniquement.
--  RÉVERSIBILITÉ : drop function … (aucune donnée touchée à l'application).
-- ============================================================================

begin;

create or replace function public.merge_shopping_item(
  p_list_id     uuid,
  p_name        text,
  p_amount_num  numeric,
  p_unit_code   text,
  p_recipe_id   uuid default null
)
returns public.shopping_items
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_name   text;
  v_key    text;
  v_item   public.shopping_items;
  v_total  numeric;
  v_abbr   text;
begin
  v_name := nullif(btrim(p_name), '');
  if v_name is null then
    raise exception 'Le nom de l''article est obligatoire' using errcode = '22023';
  end if;
  if p_amount_num is not null and p_amount_num < 0 then
    raise exception 'La quantité ne peut pas être négative' using errcode = '22023';
  end if;
  p_unit_code := nullif(btrim(p_unit_code), '');
  if p_unit_code is not null then
    select u.abbr into v_abbr from public.units u where u.code = p_unit_code;
    if not found then
      raise exception 'Unité inconnue : %', p_unit_code using errcode = '22023';
    end if;
  end if;
  -- Sous RLS, une liste qui n'appartient pas à l'appelant est invisible.
  if not exists (select 1 from public.shopping_lists l where l.id = p_list_id) then
    raise exception 'Liste de courses introuvable ou non autorisée' using errcode = '42501';
  end if;

  v_key := public.fold_text(v_name);

  select * into v_item
    from public.shopping_items si
   where si.list_id = p_list_id
     and public.fold_text(si.name) = v_key
     and si.unit_code is not distinct from p_unit_code
   order by si.created_at, si.id
   limit 1
   for update;

  if found then
    v_total := case when v_item.amount_num is null and p_amount_num is null then null
                    else coalesce(v_item.amount_num, 0) + coalesce(p_amount_num, 0) end;
    update public.shopping_items set
      amount_num = v_total,
      amount     = public.format_amount(v_total),
      unit       = coalesce(unit, v_abbr),
      recipe_id  = coalesce(recipe_id, p_recipe_id),
      is_checked = false,
      updated_at = now()
    where id = v_item.id
    returning * into v_item;
  else
    insert into public.shopping_items (list_id, name, amount, amount_num, unit, unit_code, recipe_id, is_checked)
    values (p_list_id, v_name, public.format_amount(p_amount_num), p_amount_num, v_abbr, p_unit_code, p_recipe_id, false)
    returning * into v_item;
  end if;

  return v_item;

exception
  when insufficient_privilege then
    raise exception 'Liste de courses introuvable ou non autorisée' using errcode = '42501';
end;
$$;

comment on function public.merge_shopping_item(uuid, text, numeric, text, uuid) is
  'Ajoute un article à une liste en fusionnant avec un article homonyme de même unité (addition de amount_num). SECURITY INVOKER (RLS propriétaire).';

create or replace function public.add_recipe_to_list(
  p_recipe_id        uuid,
  p_list_id          uuid,
  p_section_ids      uuid[]  default null,
  p_servings_factor  numeric default 1
)
returns setof public.shopping_items
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  r record;
begin
  if p_servings_factor is null or p_servings_factor <= 0 then
    raise exception 'Le facteur de portions doit être strictement positif' using errcode = '22023';
  end if;
  if not exists (select 1 from public.recipes x where x.id = p_recipe_id) then
    raise exception 'Recette introuvable' using errcode = 'P0002';
  end if;

  for r in
    select i.name, i.amount_num, i.unit_code
      from public.recipe_ingredients i
      left join public.recipe_sections s on s.id = i.section_id
     where i.recipe_id = p_recipe_id
       and (p_section_ids is null or i.section_id = any (p_section_ids))
     order by coalesce(s.order_index, 0), i.order_index, i.created_at
  loop
    return next public.merge_shopping_item(
      p_list_id,
      r.name,
      case when r.amount_num is null then null else round(r.amount_num * p_servings_factor, 2) end,
      r.unit_code,
      p_recipe_id);
  end loop;
  return;
end;
$$;

comment on function public.add_recipe_to_list(uuid, uuid, uuid[], numeric) is
  'Ajoute les ingrédients d''une recette (toutes sections ou sections choisies) à une liste, quantités × facteur, avec fusion des homonymes.';

revoke execute on function public.merge_shopping_item(uuid, text, numeric, text, uuid) from public, anon;
revoke execute on function public.add_recipe_to_list(uuid, uuid, uuid[], numeric)       from public, anon;
grant  execute on function public.merge_shopping_item(uuid, text, numeric, text, uuid) to authenticated;
grant  execute on function public.add_recipe_to_list(uuid, uuid, uuid[], numeric)       to authenticated;

commit;
