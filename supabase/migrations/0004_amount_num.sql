-- ============================================================================
--  0004 — Quantités numériques (amount_num) dérivées du texte `amount`
-- ============================================================================
--  QUOI
--   - `parse_amount(text) returns numeric` IMMUABLE : entiers, décimales
--     (virgule ou point), fractions (« 1/2 », « ½ », « 1 1/2 », « 1½ »),
--     plages (« 2-3 », « 2 à 3 », « 2 ou 3 », « 2 to 3 » → borne basse),
--     texte non numérique → NULL.
--   - `format_amount(numeric) returns text` IMMUABLE : rendu lisible
--     (« 2 », « 0.5 », « 1.25 ») utilisé par les RPC pour garder `amount`
--     texte cohérent.
--   - Colonne `amount_num numeric` (nullable) sur `recipe_ingredients` et
--     `shopping_items`, remplie ; trigger de synchronisation pour l'ancien
--     code (qui n'écrit que `amount`).
--
--  POURQUOI
--   Additionner des quantités dans la liste de courses et appliquer un facteur
--   de portions exige un nombre. `amount` texte reste intact.
--
--  RÉVERSIBILITÉ
--   drop trigger … ; alter table … drop column amount_num ;
--   drop function parse_amount, format_amount, sync_amount_num.
--
--  COMPTES ATTENDUS EN PROD (lecture du 2026-10-03)
--   recipe_ingredients : 1 712 lignes, 138 amount NULL, 18 non parsables
--   (« optional » ×10, « to taste » ×3, « a few shakes » ×2, « some »,
--   « for frying », « splash ») → 1 556 amount_num non NULL.
--   shopping_items : 43 lignes, toutes numériques → 43 amount_num.
-- ============================================================================

begin;

create or replace function public.parse_amount(p text)
returns numeric
language plpgsql
immutable
strict
parallel safe
set search_path = ''
as $$
declare
  s text;
  m text[];
begin
  s := lower(btrim(p));
  if s = '' then
    return null;
  end if;

  -- fractions unicode → « n/d » (avec espace devant pour « 1½ » → « 1 1/2 »)
  s := replace(s, '½', ' 1/2');
  s := replace(s, '¼', ' 1/4');
  s := replace(s, '¾', ' 3/4');
  s := replace(s, '⅓', ' 1/3');
  s := replace(s, '⅔', ' 2/3');
  s := replace(s, '⅛', ' 1/8');
  s := replace(s, '⅜', ' 3/8');
  s := replace(s, '⅝', ' 5/8');
  s := replace(s, '⅞', ' 7/8');
  s := replace(s, ',', '.');
  s := btrim(regexp_replace(s, '\s+', ' ', 'g'));

  -- La suite éventuelle est tolérée seulement si c'est une plage :
  -- « - », « – », « — », « à », « a », « ou », « to », « / » (ex. « 2/3 pers » non)
  -- Mixte : « 1 1/2 »
  m := regexp_match(s, '^(\d+)\s+(\d+)\s*/\s*(\d+)(?:\s*(?:-|–|—|à|a|ou|to)\s*\d.*)?$');
  if m is not null and m[3]::numeric <> 0 then
    return trim_scale(round(m[1]::numeric + m[2]::numeric / m[3]::numeric, 4));
  end if;

  -- Fraction simple : « 1/2 »
  m := regexp_match(s, '^(\d+)\s*/\s*(\d+)(?:\s*(?:-|–|—|à|a|ou|to)\s*\d.*)?$');
  if m is not null and m[2]::numeric <> 0 then
    return trim_scale(round(m[1]::numeric / m[2]::numeric, 4));
  end if;

  -- Nombre (entier ou décimal), éventuellement suivi d'une plage
  m := regexp_match(s, '^(\d+(?:\.\d+)?|\.\d+)(?:\s*(?:-|–|—|à|a|ou|to)\s*\d.*)?$');
  if m is not null then
    return trim_scale(m[1]::numeric);
  end if;

  return null;
end;
$$;
comment on function public.parse_amount(text) is 'Texte de quantité → numeric (fractions, plages → borne basse) ; NULL si non numérique.';

create or replace function public.format_amount(p numeric)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select case
    when p is null then null
    when p = trunc(p) then trunc(p)::bigint::text
    else rtrim(round(p, 3)::text, '0')
  end;
$$;
comment on function public.format_amount(numeric) is 'numeric → texte court (« 2 », « 0.5 », « 1.333 »).';

grant execute on function public.parse_amount(text), public.format_amount(numeric) to anon, authenticated, service_role;

-- ----------------------------------------------------------------------------
-- Colonnes + remplissage
-- ----------------------------------------------------------------------------
alter table public.recipe_ingredients add column if not exists amount_num numeric;
alter table public.shopping_items     add column if not exists amount_num numeric;

update public.recipe_ingredients set amount_num = public.parse_amount(amount)
 where amount_num is null and amount is not null;
update public.shopping_items set amount_num = public.parse_amount(amount)
 where amount_num is null and amount is not null;

-- ----------------------------------------------------------------------------
-- Trigger de synchronisation (même logique que sync_unit_code)
-- ----------------------------------------------------------------------------
create or replace function public.sync_amount_num()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.amount_num is null then
      new.amount_num := public.parse_amount(new.amount);
    end if;
  elsif new.amount is distinct from old.amount and new.amount_num is not distinct from old.amount_num then
    new.amount_num := public.parse_amount(new.amount);
  end if;
  return new;
end;
$$;
revoke execute on function public.sync_amount_num() from public, anon, authenticated;

drop trigger if exists trg_sync_amount_num on public.recipe_ingredients;
create trigger trg_sync_amount_num before insert or update of amount, amount_num on public.recipe_ingredients
  for each row execute function public.sync_amount_num();
drop trigger if exists trg_sync_amount_num on public.shopping_items;
create trigger trg_sync_amount_num before insert or update of amount, amount_num on public.shopping_items
  for each row execute function public.sync_amount_num();

-- ----------------------------------------------------------------------------
-- Vérifications
-- ----------------------------------------------------------------------------
do $$
declare n_bad int; unparsed text;
begin
  assert public.parse_amount('1') = 1;
  assert public.parse_amount('1 ') = 1;
  assert public.parse_amount('0.5') = 0.5;
  assert public.parse_amount('1,5') = 1.5;
  assert public.parse_amount('1/2') = 0.5;
  assert public.parse_amount('½') = 0.5;
  assert public.parse_amount('1 1/2') = 1.5;
  assert public.parse_amount('1½') = 1.5;
  assert public.parse_amount('2-3') = 2;
  assert public.parse_amount('2 à 3') = 2;
  assert public.parse_amount('2 a 3') = 2;
  assert public.parse_amount('2 ou 3') = 2;
  assert public.parse_amount('1/2 - 1') = 0.5;
  assert public.parse_amount('0') = 0;
  assert public.parse_amount('.5') = 0.5;
  assert public.parse_amount('1.50')::text = '1.5', 'échelle réduite (trim_scale)';
  assert public.parse_amount('1/3')::text = '0.3333';
  assert public.parse_amount('optional') is null;
  assert public.parse_amount('to taste') is null;
  assert public.parse_amount('2 kg') is null;
  assert public.parse_amount('') is null;
  assert public.parse_amount(null) is null;
  assert public.parse_amount('1/0') is null;
  assert public.format_amount(2) = '2';
  assert public.format_amount(0.5) = '0.5';
  assert public.format_amount(1.5) = '1.5';
  assert public.format_amount(20) = '20';
  assert public.format_amount(1.0/3) = '0.333';

  select count(*) into n_bad from public.recipe_ingredients
   where amount is not null and amount_num is null and public.parse_amount(amount) is not null;
  assert n_bad = 0, format('%s lignes parsables sans amount_num', n_bad);

  select string_agg(format('%s (%s)', amount, n), ', ' order by n desc, amount) into unparsed
    from (select amount, count(*) n from public.recipe_ingredients
           where amount is not null and btrim(amount) <> '' and amount_num is null group by amount) u;
  raise notice '[0004] recipe_ingredients : % amount_num remplis, non parsés : %',
    (select count(*) from public.recipe_ingredients where amount_num is not null), coalesce(unparsed, 'aucun');
  select string_agg(format('%s (%s)', amount, n), ', ' order by n desc, amount) into unparsed
    from (select amount, count(*) n from public.shopping_items
           where amount is not null and btrim(amount) <> '' and amount_num is null group by amount) u;
  raise notice '[0004] shopping_items : % amount_num remplis, non parsés : %',
    (select count(*) from public.shopping_items where amount_num is not null), coalesce(unparsed, 'aucun');
end $$;

commit;
