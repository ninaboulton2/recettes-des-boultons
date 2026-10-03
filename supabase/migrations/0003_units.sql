-- ============================================================================
--  0003 — Référentiel d'unités canoniques + normalisation des unités libres
-- ============================================================================
--  QUOI
--   - Table `units` (code canonique, libellés FR/EN, abréviation, famille,
--     facteur vers g ou ml) et table `unit_aliases` (toutes les graphies
--     rencontrées en prod + variantes courantes → code).
--   - Fonctions `fold_text(text)` (minuscules, sans accents, sans ponctuation)
--     et `normalize_unit(text)` (alias → code, tolère pluriels « s »/« x »).
--   - Colonne `unit_code` (nullable, FK units) sur `recipe_ingredients` et
--     `shopping_items`, remplie depuis `unit` ; trigger de synchronisation
--     pour les lignes écrites par l'ancien code (qui ne connaît que `unit`).
--
--  POURQUOI
--   109 graphies distinctes (non vides) pour ~35 unités réelles (« CàS »,
--   « càs », « cuil. à soupe », « tbsp »…) rendent impossible toute addition
--   dans la liste de courses ou toute conversion. La colonne texte `unit`
--   reste intacte : l'ancien code continue de fonctionner.
--
--  RÉVERSIBILITÉ
--   drop trigger … ; drop function normalize_unit, fold_text, sync_unit_code ;
--   alter table … drop column unit_code ; drop table unit_aliases, units.
--   Aucune donnée existante n'est modifiée ni supprimée.
--
--  COMPTES ATTENDUS EN PROD (lecture du 2026-10-03, mapping vérifié
--  localement sur les 109 graphies : 95 reconnues, 14 non reconnues)
--   recipe_ingredients : 1 712 lignes, 322 unit NULL → unit_code NULL ;
--   14 graphies non reconnues (26 lignes) restent NULL : « cuil. » (4),
--   « large » (3), « petit » (3), « petite » (3), « chopped » (2),
--   « crumbled » (2), « sliced » (2), « demi », « grands », « medium »,
--   « ripe », « squeeze », « à 15 », « à 2 » (1 chacun) — ce sont des
--   qualificatifs, pas des unités.
--   → 1 712 − 322 − 26 = 1 364 lignes avec unit_code non NULL.
--   shopping_items : 43 lignes, 9 unit '' → NULL, 34 avec unit_code.
--   La migration affiche (NOTICE) la liste exacte des non reconnus.
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- 1. Référentiel
-- ----------------------------------------------------------------------------
create table if not exists public.units (
  code        text primary key,
  label_fr    text not null,
  label_en    text not null,
  abbr        text not null,
  kind        text not null check (kind in ('mass','volume','count','other')),
  to_base     numeric,             -- facteur vers g (mass) ou ml (volume), null sinon
  sort_order  integer not null default 100
);
comment on table public.units is 'Unités canoniques (code stable). to_base : facteur vers g (mass) ou ml (volume).';

create table if not exists public.unit_aliases (
  alias text primary key,
  code  text not null references public.units(code) on update cascade on delete cascade
);
comment on table public.unit_aliases is 'Graphies connues (déjà passées par fold_text) → code d''unité.';

alter table public.units enable row level security;
alter table public.unit_aliases enable row level security;
drop policy if exists "units_read_public" on public.units;
create policy "units_read_public" on public.units for select using (true);
drop policy if exists "unit_aliases_read_public" on public.unit_aliases;
create policy "unit_aliases_read_public" on public.unit_aliases for select using (true);
-- lecture seule via l'API ; l'écriture se fait par migration (postgres).
revoke all on public.units, public.unit_aliases from anon, authenticated;
grant select on public.units, public.unit_aliases to anon, authenticated, service_role;

insert into public.units (code, label_fr, label_en, abbr, kind, to_base, sort_order) values
  -- masse
  ('g',        'gramme',               'gram',          'g',        'mass',   1,       10),
  ('kg',       'kilogramme',           'kilogram',      'kg',       'mass',   1000,    11),
  ('mg',       'milligramme',          'milligram',     'mg',       'mass',   0.001,   12),
  -- volume
  ('ml',       'millilitre',           'milliliter',    'ml',       'volume', 1,       20),
  ('cl',       'centilitre',           'centiliter',    'cl',       'volume', 10,      21),
  ('dl',       'décilitre',            'deciliter',     'dl',       'volume', 100,     22),
  ('l',        'litre',                'liter',         'l',        'volume', 1000,    23),
  ('cas',      'cuillère à soupe',     'tablespoon',    'c. à s.',  'volume', 15,      30),
  ('cac',      'cuillère à café',      'teaspoon',      'c. à c.',  'volume', 5,       31),
  ('verre',    'verre',                'glass',         'verre',    'volume', 200,     32),
  ('tasse',    'tasse',                'cup',           'tasse',    'volume', 250,     33),
  ('goutte',   'goutte',               'drop',          'goutte',   'volume', 0.05,    34),
  -- comptage
  ('piece',    'pièce',                'piece',         'pièce',    'count',  null,    40),
  ('tranche',  'tranche',              'slice',         'tranche',  'count',  null,    41),
  ('gousse',   'gousse',               'clove',         'gousse',   'count',  null,    42),
  ('sachet',   'sachet',               'sachet',        'sachet',   'count',  null,    43),
  ('bouquet',  'bouquet',              'bunch',         'bouquet',  'count',  null,    44),
  ('feuille',  'feuille',              'leaf',          'feuille',  'count',  null,    45),
  ('boite',    'boîte',                'can',           'boîte',    'count',  null,    46),
  ('pot',      'pot',                  'jar',           'pot',      'count',  null,    47),
  ('cube',     'cube',                 'cube',          'cube',     'count',  null,    48),
  ('botte',    'botte',                'bunch',         'botte',    'count',  null,    49),
  ('brin',     'brin',                 'sprig',         'brin',     'count',  null,    50),
  ('branche',  'branche',              'stalk',         'branche',  'count',  null,    51),
  ('tige',     'tige',                 'stem',          'tige',     'count',  null,    52),
  ('zeste',    'zeste',                'zest',          'zeste',    'count',  null,    53),
  ('poignee',  'poignée',              'handful',       'poignée',  'count',  null,    54),
  ('paquet',   'paquet',               'pack',          'paquet',   'count',  null,    55),
  ('bouteille','bouteille',            'bottle',        'bouteille','count',  null,    56),
  ('tube',     'tube',                 'tube',          'tube',     'count',  null,    57),
  ('tete',     'tête',                 'head',          'tête',     'count',  null,    58),
  ('dosette',  'dosette',              'pod',           'dosette',  'count',  null,    59),
  ('portion',  'portion',              'serving',       'portion',  'count',  null,    60),
  ('morceau',  'morceau',              'chunk',         'morceau',  'count',  null,    61),
  -- autres
  ('pincee',   'pincée',               'pinch',         'pincée',   'other',  null,    70),
  ('qs',       'quantité suffisante',  'to taste',      'q.s.',     'other',  null,    71),
  ('cm',       'centimètre',           'centimeter',    'cm',       'other',  null,    72)
on conflict (code) do update set
  label_fr = excluded.label_fr, label_en = excluded.label_en, abbr = excluded.abbr,
  kind = excluded.kind, to_base = excluded.to_base, sort_order = excluded.sort_order;

-- ----------------------------------------------------------------------------
-- 2. Repli de texte (immuable, sans extension, indépendant de la locale) :
--    accents retirés (minuscules ET majuscules), minuscules, ponctuation/
--    espaces multiples → un espace. Sert aux unités ET aux noms
--    d'articles (fusion dans la liste de courses, 0007).
-- ----------------------------------------------------------------------------
create or replace function public.fold_text(p text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select nullif(
    btrim(
      regexp_replace(
        lower(translate(coalesce(p, ''),
                  'àáâäãåèéêëìíîïòóôöõùúûüýÿçñœæÀÁÂÄÃÅÈÉÊËÌÍÎÏÒÓÔÖÕÙÚÛÜÝŸÇÑŒÆ',
                  'aaaaaaeeeeiiiiooooouuuuyycnoaAAAAAAEEEEIIIIOOOOOUUUUYYCNOA')),
        '[[:space:][:punct:]]+', ' ', 'g')),
    '');
$$;
comment on function public.fold_text(text) is 'Clé de comparaison : minuscules, sans accents, ponctuation → espace, trim. NULL si vide.';

-- ----------------------------------------------------------------------------
-- 3. Alias (saisis en graphie naturelle, stockés repliés par fold_text)
-- ----------------------------------------------------------------------------
insert into public.unit_aliases (alias, code)
select distinct public.fold_text(a), c from (values
  -- c. à soupe
  ('CàS','cas'),('càs','cas'),('càS','cas'),('cas','cas'),('cs','cas'),('c.à.s','cas'),('c. à s.','cas'),
  ('c. à soupe','cas'),('c à soupe','cas'),('cuil. à soupe','cas'),('cuil à soupe','cas'),
  ('cuillère à soupe','cas'),('cuillères à soupe','cas'),('cuillere a soupe','cas'),('cuilleres a soupe','cas'),
  ('cuillerée à soupe','cas'),('tbsp','cas'),('tbs','cas'),('tablespoon','cas'),('tablespoons','cas'),
  -- c. à café
  ('CàC','cac'),('càc','cac'),('cac','cac'),('CaC','cac'),('cc','cac'),('c.à.c','cac'),('c. à c.','cac'),
  ('c. à café','cac'),('c à café','cac'),('cuil. à café','cac'),('cuil à café','cac'),
  ('cuillère à café','cac'),('cuillères à café','cac'),('cuillere a cafe','cac'),('cuillerée à café','cac'),
  ('tsp','cac'),('teaspoon','cac'),('teaspoons','cac'),('petite cuillère','cac'),
  -- masse
  ('g','g'),('gr','g'),('gramme','g'),('grammes','g'),('gram','g'),('grams','g'),
  ('kg','kg'),('Kg','kg'),('kilo','kg'),('kilos','kg'),('kilogramme','kg'),('kilogrammes','kg'),('kilogram','kg'),('kilograms','kg'),
  ('mg','mg'),('milligramme','mg'),('milligrammes','mg'),('milligram','mg'),
  -- volume
  ('ml','ml'),('millilitre','ml'),('millilitres','ml'),('milliliter','ml'),('milliliters','ml'),
  ('cl','cl'),('centilitre','cl'),('centilitres','cl'),
  ('dl','dl'),('décilitre','dl'),('décilitres','dl'),
  ('l','l'),('L','l'),('litre','l'),('litres','l'),('liter','l'),('liters','l'),
  ('verre','verre'),('verres','verre'),('grand verre','verre'),('petit verre','verre'),('glass','verre'),('glasses','verre'),
  ('tasse','tasse'),('tasses','tasse'),('cup','tasse'),('cups','tasse'),('mug','tasse'),
  ('goutte','goutte'),('gouttes','goutte'),('drop','goutte'),('drops','goutte'),
  -- comptage
  ('pièce','piece'),('pièces','piece'),('piece','piece'),('pieces','piece'),('pc','piece'),('pcs','piece'),('pce','piece'),
  ('unit','piece'),('units','piece'),('unité','piece'),('unités','piece'),
  ('tranche','tranche'),('tranches','tranche'),('slice','tranche'),('slices','tranche'),
  ('gousse','gousse'),('gousses','gousse'),('Gousses','gousse'),('clove','gousse'),('cloves','gousse'),
  ('sachet','sachet'),('sachets','sachet'),('packet','sachet'),('packets','sachet'),
  ('bouquet','bouquet'),('bouquets','bouquet'),('petit bouquet','bouquet'),('bunch','bouquet'),('bunches','bouquet'),
  ('feuille','feuille'),('feuilles','feuille'),('quelques feuilles','feuille'),('leaf','feuille'),('leaves','feuille'),
  ('boîte','boite'),('boîtes','boite'),('boite','boite'),('boites','boite'),('tin','boite'),('tins','boite'),('can','boite'),('cans','boite'),('conserve','boite'),
  ('pot','pot'),('pots','pot'),('jar','pot'),('jars','pot'),
  ('cube','cube'),('cubes','cube'),('cube de 2cm','cube'),
  ('botte','botte'),('bottes','botte'),
  ('brin','brin'),('brins','brin'),('sprig','brin'),('sprigs','brin'),
  ('branche','branche'),('branches','branche'),('stalk','branche'),('stalks','branche'),('stick','branche'),('sticks','branche'),
  ('tige','tige'),('tiges','tige'),('Tiges','tige'),('stem','tige'),('stems','tige'),
  ('zeste','zeste'),('zestes','zeste'),('zest','zeste'),
  ('poignée','poignee'),('poignées','poignee'),('Poignée','poignee'),('grande poignée','poignee'),('petite poignée','poignee'),('handful','poignee'),('handfuls','poignee'),
  ('paquet','paquet'),('paquets','paquet'),('pack','paquet'),('packs','paquet'),('package','paquet'),
  ('bouteille','bouteille'),('bouteilles','bouteille'),('petite bouteille','bouteille'),('grande bouteille','bouteille'),('bottle','bouteille'),('bottles','bouteille'),
  ('tube','tube'),('tubes','tube'),
  ('tête','tete'),('têtes','tete'),('head','tete'),('heads','tete'),
  ('dosette','dosette'),('dosettes','dosette'),('Dosettes','dosette'),('capsule','dosette'),('capsules','dosette'),('pod','dosette'),('pods','dosette'),
  ('portion','portion'),('portions','portion'),('serving','portion'),('servings','portion'),
  ('morceau','morceau'),('morceaux','morceau'),('chunk','morceau'),('chunks','morceau'),
  -- autres
  ('pincée','pincee'),('pincées','pincee'),('Pincée','pincee'),('pincee','pincee'),('pinch','pincee'),('pinches','pincee'),
  ('quantité suffisante','qs'),('qs','qs'),('q.s.','qs'),('au goût','qs'),('à convenance','qs'),('quantité au choix','qs'),
  ('to taste','qs'),('selon goût','qs'),('selon le goût','qs'),('as needed','qs'),
  ('cm','cm'),('centimètre','cm'),('centimètres','cm')
) as v(a, c)
where public.fold_text(a) is not null
on conflict (alias) do update set code = excluded.code;

-- ----------------------------------------------------------------------------
-- 4. normalize_unit : alias exact, puis code canonique, puis singulier (s/x)
-- ----------------------------------------------------------------------------
create or replace function public.normalize_unit(p text)
returns text
language sql
stable
parallel safe
set search_path = ''
as $$
  with k as (select public.fold_text(p) as key)
  select coalesce(
    (select a.code from public.unit_aliases a, k where a.alias = k.key),
    (select u.code from public.units u, k where u.code = k.key),
    (select a.code from public.unit_aliases a, k
       where k.key ~ '[sx]$' and a.alias = left(k.key, length(k.key) - 1))
  )
  from k
  where k.key is not null;
$$;
comment on function public.normalize_unit(text) is 'Graphie libre d''unité → code units.code, NULL si non reconnue.';

grant execute on function public.fold_text(text), public.normalize_unit(text) to anon, authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 5. Colonnes unit_code + remplissage
-- ----------------------------------------------------------------------------
alter table public.recipe_ingredients add column if not exists unit_code text references public.units(code);
alter table public.shopping_items     add column if not exists unit_code text references public.units(code);
create index if not exists idx_recipe_ingredients_unit_code on public.recipe_ingredients (unit_code);
create index if not exists idx_shopping_items_unit_code     on public.shopping_items (unit_code);

update public.recipe_ingredients set unit_code = public.normalize_unit(unit)
 where unit_code is null and unit is not null;
update public.shopping_items set unit_code = public.normalize_unit(unit)
 where unit_code is null and unit is not null;

-- ----------------------------------------------------------------------------
-- 6. Trigger : l'ancien code n'écrit que `unit` → on dérive unit_code.
--    Un unit_code fourni explicitement (nouveaux RPC) n'est jamais écrasé.
-- ----------------------------------------------------------------------------
create or replace function public.sync_unit_code()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.unit_code is null then
      new.unit_code := public.normalize_unit(new.unit);
    end if;
  elsif new.unit is distinct from old.unit and new.unit_code is not distinct from old.unit_code then
    new.unit_code := public.normalize_unit(new.unit);
  end if;
  return new;
end;
$$;
revoke execute on function public.sync_unit_code() from public, anon, authenticated;

drop trigger if exists trg_sync_unit_code on public.recipe_ingredients;
create trigger trg_sync_unit_code before insert or update of unit, unit_code on public.recipe_ingredients
  for each row execute function public.sync_unit_code();
drop trigger if exists trg_sync_unit_code on public.shopping_items;
create trigger trg_sync_unit_code before insert or update of unit, unit_code on public.shopping_items
  for each row execute function public.sync_unit_code();

-- ----------------------------------------------------------------------------
-- 7. Vérifications
-- ----------------------------------------------------------------------------
do $$
declare
  n_units int; n_alias int; n_bad int; unmapped text;
begin
  select count(*) into n_units from public.units;
  select count(*) into n_alias from public.unit_aliases;
  assert n_units >= 37, format('units : %s lignes, 37 attendues au minimum', n_units);
  assert n_alias >= 150, format('unit_aliases : %s lignes, 150 attendues au minimum', n_alias);

  -- Tout alias doit pointer vers un code existant (FK) et être « replié ».
  select count(*) into n_bad from public.unit_aliases where alias <> public.fold_text(alias);
  assert n_bad = 0, format('%s alias non repliés', n_bad);

  -- Aucune ligne dont l'unité est connue ne doit rester sans code.
  select count(*) into n_bad from public.recipe_ingredients
   where unit is not null and unit_code is null and public.normalize_unit(unit) is not null;
  assert n_bad = 0, format('%s recipe_ingredients avec unité reconnue mais unit_code NULL', n_bad);

  -- Quelques cas de référence (graphies prod).
  assert public.normalize_unit('CàS') = 'cas';
  assert public.normalize_unit('cuil. à soupe') = 'cas';
  assert public.normalize_unit('c.à.s') = 'cas';
  assert public.normalize_unit('Tbsp') = 'cas';
  assert public.normalize_unit('CaC') = 'cac';
  assert public.normalize_unit('teaspoon') = 'cac';
  assert public.normalize_unit('unités') = 'piece';
  assert public.normalize_unit('pcs') = 'piece';
  assert public.normalize_unit('Gousses') = 'gousse';
  assert public.normalize_unit('cloves') = 'gousse';
  assert public.normalize_unit('Kg') = 'kg';
  assert public.normalize_unit('L') = 'l';
  assert public.normalize_unit('morceaux') = 'morceau';
  assert public.normalize_unit('pincées') = 'pincee';
  assert public.normalize_unit('to taste') = 'qs';
  assert public.normalize_unit('cube de 2cm') = 'cube';
  assert public.normalize_unit('') is null;
  assert public.normalize_unit(null) is null;
  assert public.normalize_unit('cuil.') is null;

  select string_agg(format('%s (%s)', unit, n), ', ' order by n desc, unit) into unmapped
    from (select unit, count(*) n from public.recipe_ingredients
           where unit is not null and btrim(unit) <> '' and unit_code is null group by unit) u;
  raise notice '[0003] recipe_ingredients : % lignes avec unit_code, unités non reconnues : %',
    (select count(*) from public.recipe_ingredients where unit_code is not null), coalesce(unmapped, 'aucune');
  select string_agg(format('%s (%s)', unit, n), ', ' order by n desc, unit) into unmapped
    from (select unit, count(*) n from public.shopping_items
           where unit is not null and btrim(unit) <> '' and unit_code is null group by unit) u;
  raise notice '[0003] shopping_items : % lignes avec unit_code, unités non reconnues : %',
    (select count(*) from public.shopping_items where unit_code is not null), coalesce(unmapped, 'aucune');
end $$;

commit;
