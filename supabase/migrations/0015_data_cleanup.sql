-- ============================================================================
--  0015 — Nettoyage des données (OPTIONNEL) : corrections sûres et mécaniques
-- ============================================================================
--  QUAND : facultatif, en prod après 0013 (ou avec), une fois la bascule
--  validée. Indépendante de 0014. Rapport complet : docs/QUALITE_DONNEES.md.
--
--  QUOI (uniquement des corrections sans perte d'information, sur une liste
--  exacte de lignes identifiées par (recipe_id, nom, valeur actuelle) : les
--  identifiants des ingrédients créés par 0005 diffèrent entre la prod et la
--  base locale, ceux des recettes sont identiques). Une ligne modifiée entre-
--  temps par quelqu'un ne correspond plus et est simplement ignorée.
--   R1 « plage » (2) : quantité coupée en deux (« 10 » + unité « à 15 »)
--      → amount = « 10 à 15 », unit NULL (amount_num = borne basse, inchangé).
--   R2 « optionnel » (5) : amount = « optional » → optional = true, amount NULL.
--   R3 « au goût » (3) : amount = « to taste » → amount NULL,
--      unit = « to taste », unit_code = 'qs' (comme les 4 lignes existantes).
--   R4 « qualificatif » (14) : unité qui est un adjectif (large, medium, petit,
--      petite, grands, ripe, chopped, crumbled, sliced) → déplacé dans le nom
--      (« onions » + « large » → « onions, large ») sauf s'il y figure déjà
--      (« Petit piment … ») ; unit / unit_code NULL. La quantité ne bouge pas.
--   R5 « espaces » : espaces en début/fin (et doubles espaces dans les noms)
--      des noms d'ingrédients (3), quantités (1) et étapes (3) — règle générale.
--   R6 « section vide » : sections nommées « Nouvelle section » (nom par défaut
--      de l'ancien éditeur) sans ingrédient ni étape (1 : Gaspacho).
--  NON traité (décision humaine, voir le rapport) : « cuil. » (soupe ou
--  café ?), « demi », « squeeze », « a few shakes », « some », « splash »,
--  « for frying », quantités absentes, recette en double, etc.
--
--  SAUVEGARDE : avant toute modification, les lignes touchées sont copiées
--  (avec la règle appliquée) dans `recipe_ingredients_backup_cleanup`,
--  `instructions_backup_cleanup`, `recipe_sections_backup_cleanup` (RLS sans
--  politique, droits révoqués : invisibles via l'API). Les identifiants
--  touchés sont listés en NOTICE.
--
--  RÉVERSIBILITÉ
--   update public.recipe_ingredients ri set name = b.name, amount = b.amount,
--          amount_num = b.amount_num, unit = b.unit, unit_code = b.unit_code,
--          optional = b.optional
--     from public.recipe_ingredients_backup_cleanup b where b.id = ri.id;
--   update public.instructions i set content = b.content
--     from public.instructions_backup_cleanup b where b.id = i.id;
--   insert into public.recipe_sections (id, recipe_id, name, type, order_index, created_at, updated_at)
--   select id, recipe_id, name, type, order_index, created_at, updated_at
--     from public.recipe_sections_backup_cleanup on conflict (id) do nothing;
--   Après validation (quelques semaines) :
--   drop table public.recipe_ingredients_backup_cleanup,
--              public.instructions_backup_cleanup, public.recipe_sections_backup_cleanup;
--
--  COMPTES ATTENDUS (prod = snapshot du 2026-10-03) : NOTICE
--   « [0015] R1 plage 2, R2 optionnel 5, R3 au goût 3, R4 qualificatif 14,
--     R5 espaces 4 (+ 3 étape(s)), R6 section vide 1 » ; non reconnues (unit sans unit_code)
--   22 → 6 lignes (« cuil. » ×4, « demi », « squeeze »).
--  Rejeu : tous les compteurs à 0. Nombre d'ingrédients et d'étapes inchangé.
-- ============================================================================

begin;

do $$
begin
  assert to_regprocedure('public.fold_text(text)') is not null, '[0015] appliquer 0003 d''abord';
  assert exists (select 1 from public.units where code = 'qs'), '[0015] unité qs absente';
end $$;

-- ----------------------------------------------------------------------------
-- Tables de sauvegarde
-- ----------------------------------------------------------------------------
create table if not exists public.recipe_ingredients_backup_cleanup as
  select ri.*, ''::text as correction, now() as backed_up_at from public.recipe_ingredients ri where false;
create table if not exists public.instructions_backup_cleanup as
  select i.*, ''::text as correction, now() as backed_up_at from public.instructions i where false;
create table if not exists public.recipe_sections_backup_cleanup as
  select s.*, ''::text as correction, now() as backed_up_at from public.recipe_sections s where false;

do $$
declare t text;
begin
  foreach t in array array['recipe_ingredients_backup_cleanup', 'instructions_backup_cleanup', 'recipe_sections_backup_cleanup'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('comment on table public.%I is %L', t,
      'Lignes avant correction par 0015 (nettoyage des données). À supprimer après validation.');
  end loop;
end $$;

create temporary table tmp_0015_before on commit drop as
  select (select count(*) from public.recipe_ingredients) as n_ing,
         (select count(*) from public.instructions)       as n_ins,
         (select count(*) from public.recipe_sections)    as n_sec;

-- ----------------------------------------------------------------------------
-- Liste exacte : (règle, recipe_id, nom, amount actuel, unit actuelle)
-- ----------------------------------------------------------------------------
create temporary table tmp_0015_list (rule text, recipe_id uuid, name text, amount text, unit text) on commit drop;
insert into tmp_0015_list values
  -- R1 plage
  ('R1', '15e331e0-826d-4781-bca8-92024704e883', 'olives noires',      '10', 'à 15'),   -- Pizzaladière
  ('R1', '273dbf5a-3443-431c-948c-e5bd01ecd3a3', 'Branches de céleri', '1',  'à 2'),    -- Raie au beurre noisette
  -- R2 optionnel
  ('R2', '2d4b5e14-b473-4c4c-9579-2bb27ba1cd8e', 'soured cream',  'optional', null),       -- Black bean chili
  ('R2', '2d4b5e14-b473-4c4c-9579-2bb27ba1cd8e', 'spring onions', 'optional', 'chopped'),
  ('R2', '2d4b5e14-b473-4c4c-9579-2bb27ba1cd8e', 'avocado',       'optional', 'chunks'),
  ('R2', '2d4b5e14-b473-4c4c-9579-2bb27ba1cd8e', 'feta cheese',   'optional', 'crumbled'),
  ('R2', '2d4b5e14-b473-4c4c-9579-2bb27ba1cd8e', 'radishes',      'optional', 'sliced'),
  -- R3 au goût
  ('R3', '33afe58e-1e3b-4271-ae2c-f80e0837beb2', 'pepper', 'to taste', null),              -- Enchiladas
  ('R3', '33afe58e-1e3b-4271-ae2c-f80e0837beb2', 'salt',   'to taste', null),
  ('R3', '33afe58e-1e3b-4271-ae2c-f80e0837beb2', 'sugar',  'to taste', null),
  -- R4 qualificatif (la quantité n'entre pas dans la clé : R2 la modifie avant)
  ('R4', '2d4b5e14-b473-4c4c-9579-2bb27ba1cd8e', 'spring onions', null, 'chopped'),        -- Black bean chili
  ('R4', '2d4b5e14-b473-4c4c-9579-2bb27ba1cd8e', 'feta cheese',   null, 'crumbled'),
  ('R4', '2d4b5e14-b473-4c4c-9579-2bb27ba1cd8e', 'radishes',      null, 'sliced'),
  ('R4', '2d4b5e14-b473-4c4c-9579-2bb27ba1cd8e', 'onions',        null, 'large'),
  ('R4', '33afe58e-1e3b-4271-ae2c-f80e0837beb2', 'onion',         null, 'large'),          -- Enchiladas
  ('R4', 'f1954e54-f0f9-42a6-b39a-7ab86d8093bd', 'onion',         null, 'medium'),         -- Vegetable pasties
  ('R4', '04ba9aab-20ad-417d-9b41-a8b431f94ef2', 'oeufs',         null, 'grands'),         -- Banana Bread
  ('R4', '04ba9aab-20ad-417d-9b41-a8b431f94ef2', 'bananes',       null, 'ripe'),
  ('R4', '4f780bf3-aa38-4ae7-a4c4-6a94884139ae', 'oignon',        null, 'petit'),          -- Curry d'aubergine
  ('R4', '9e15d0ab-a1cc-4d6d-b73d-b406597b9196', 'piment rouge',  null, 'petit'),          -- Nems
  ('R4', 'b618ad5b-66a5-428c-9d48-de31b9060677', 'Petit piment ou poudre de piments', null, 'petit'), -- Wok de Legumes
  ('R4', '273dbf5a-3443-431c-948c-e5bd01ecd3a3', 'Carotte',       null, 'petite'),         -- Raie au beurre noisette
  ('R4', '20ca7c27-05d9-44cd-8cd0-84343963b5da', 'noix de beurre', null, 'petite'),        -- Ravioli à l'encre de seiches…
  ('R4', '160ffe0c-d325-4d62-80d5-c733bad14e8b', 'Butternut',     null, 'petite');         -- Soupe de lentilles, butternut…

-- Correspondance avec les lignes actuelles, calculée AVANT toute modification
-- (la clé de R4 ne dépend pas de la quantité, que R2 modifie).
create temporary table tmp_0015_hits on commit drop as
  select l.rule, ri.id
    from tmp_0015_list l
    join public.recipe_ingredients ri
      on ri.recipe_id = l.recipe_id and ri.name = l.name
     and ri.unit is not distinct from l.unit
     and (l.rule = 'R4' or ri.amount is not distinct from l.amount)
     and (l.rule = 'R2' or ri.unit_code is null);

-- R5 (règle générale) et R6
insert into tmp_0015_hits
select 'R5', ri.id from public.recipe_ingredients ri
 where ri.name <> regexp_replace(btrim(ri.name), ' {2,}', ' ', 'g') or ri.amount <> btrim(ri.amount);

create temporary table tmp_0015_ins on commit drop as
  select i.id from public.instructions i where i.content <> btrim(i.content);

create temporary table tmp_0015_sec on commit drop as
  select s.id from public.recipe_sections s
   where s.name = 'Nouvelle section'
     and not exists (select 1 from public.recipe_ingredients ri where ri.section_id = s.id)
     and not exists (select 1 from public.instructions i where i.section_id = s.id);

-- ----------------------------------------------------------------------------
-- Sauvegarde des lignes touchées (une ligne par règle appliquée)
-- ----------------------------------------------------------------------------
insert into public.recipe_ingredients_backup_cleanup
select ri.*, h.rule, now() from tmp_0015_hits h join public.recipe_ingredients ri on ri.id = h.id;
insert into public.instructions_backup_cleanup
select i.*, 'R5', now() from tmp_0015_ins t join public.instructions i on i.id = t.id;
insert into public.recipe_sections_backup_cleanup
select s.*, 'R6', now() from tmp_0015_sec t join public.recipe_sections s on s.id = t.id;

-- ----------------------------------------------------------------------------
-- Corrections (amount_num / unit_code posés explicitement : les triggers de
-- 0003/0004 ne les écrasent pas)
-- ----------------------------------------------------------------------------
-- R1 plage : « 10 » + « à 15 » → « 10 à 15 »
update public.recipe_ingredients ri
   set amount = ri.amount || ' ' || ri.unit, amount_num = public.parse_amount(ri.amount || ' ' || ri.unit),
       unit = null, unit_code = null
  from tmp_0015_hits h where h.id = ri.id and h.rule = 'R1';

-- R2 optionnel
update public.recipe_ingredients ri
   set optional = true, amount = null, amount_num = null
  from tmp_0015_hits h where h.id = ri.id and h.rule = 'R2';

-- R3 au goût → unité « quantité suffisante »
update public.recipe_ingredients ri
   set unit = ri.amount, unit_code = 'qs', amount = null, amount_num = null
  from tmp_0015_hits h where h.id = ri.id and h.rule = 'R3';

-- R4 qualificatif → dans le nom
update public.recipe_ingredients ri
   set name = case when position(public.fold_text(ri.unit) in public.fold_text(ri.name)) > 0 then ri.name
                   else ri.name || ', ' || ri.unit end,
       unit = null, unit_code = null
  from tmp_0015_hits h where h.id = ri.id and h.rule = 'R4';

-- R5 espaces
update public.recipe_ingredients ri
   set name = regexp_replace(btrim(ri.name), ' {2,}', ' ', 'g'),
       amount = btrim(ri.amount)
  from tmp_0015_hits h where h.id = ri.id and h.rule = 'R5';
update public.instructions i set content = btrim(i.content) from tmp_0015_ins t where t.id = i.id;

-- R6 sections vides « Nouvelle section »
delete from public.recipe_sections s using tmp_0015_sec t where t.id = s.id;

-- ----------------------------------------------------------------------------
-- Vérifications + compte rendu
-- ----------------------------------------------------------------------------
do $$
declare b record; n bigint; ids text; r text;
  c1 int; c2 int; c3 int; c4 int; c5 int; c5i int; c6 int;
begin
  select * into b from tmp_0015_before;
  select count(*) filter (where rule = 'R1'), count(*) filter (where rule = 'R2'), count(*) filter (where rule = 'R3'),
         count(*) filter (where rule = 'R4'), count(*) filter (where rule = 'R5')
    into c1, c2, c3, c4, c5 from tmp_0015_hits;
  select count(*) into c5i from tmp_0015_ins;
  select count(*) into c6 from tmp_0015_sec;

  assert c1 <= 2 and c2 <= 5 and c3 <= 3 and c4 <= 14, '[0015] plus de lignes que la liste exacte : arrêt';
  select count(*) into n from public.recipe_ingredients;
  assert n = b.n_ing, format('[0015] ingrédients : %s, attendu %s', n, b.n_ing);
  select count(*) into n from public.instructions;
  assert n = b.n_ins, format('[0015] instructions : %s, attendu %s', n, b.n_ins);
  select count(*) into n from public.recipe_sections;
  assert n = b.n_sec - c6, format('[0015] sections : %s, attendu %s', n, b.n_sec - c6);
  -- Les lignes R1→R4 corrigées n'ont plus d'unité non reconnue.
  select count(*) into n from tmp_0015_hits h join public.recipe_ingredients ri on ri.id = h.id
   where h.rule in ('R1', 'R2', 'R3', 'R4') and ri.unit is not null and ri.unit_code is null;
  assert n = 0, format('[0015] %s ligne(s) corrigée(s) avec encore une unité non reconnue', n);

  raise notice '[0015] R1 plage %, R2 optionnel %, R3 au goût %, R4 qualificatif %, R5 espaces % (+ % étape(s)), R6 section vide %',
    c1, c2, c3, c4, c5, c5i, c6;
  for r in select distinct rule from tmp_0015_hits order by 1 loop
    select string_agg(id::text, ', ' order by id) into ids from tmp_0015_hits where rule = r;
    raise notice '[0015] % ingrédients : %', r, ids;
  end loop;
  if c5i > 0 then
    raise notice '[0015] R5 étapes : %', (select string_agg(id::text, ', ' order by id) from tmp_0015_ins);
  end if;
  if c6 > 0 then
    raise notice '[0015] R6 sections : %', (select string_agg(id::text, ', ' order by id) from tmp_0015_sec);
  end if;
  raise notice '[0015] unités encore non reconnues (à traiter à la main) : %',
    (select count(*) from public.recipe_ingredients where unit is not null and unit_code is null);
end $$;

commit;
