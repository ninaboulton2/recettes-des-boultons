-- ============================================================================
--  Correctif de données — « Carrot cake » : 17 ingrédients perdus en prod
-- ============================================================================
--  CONSTAT (lecture seule de la prod, 2026-10-03 vers 21 h 45, heure de Paris)
--   La recette b7866cf7-261a-4f2c-a9b2-e35837c954f4 « Carrot cake » a été
--   réenregistrée le 2026-10-03 à 19 h 48 (heure de Paris) : ses 6 sections ont
--   été recréées, ses 12 étapes sont intactes, mais il ne reste que 4 de ses 21
--   ingrédients (« Glaçage léger » sans son 1er ingrédient ; « Gâteau » et
--   « Glaçage traditionnel » vides). C'est le schéma d'un enregistrement
--   interrompu par l'ancien éditeur (écritures une par une, sans transaction).
--   Le snapshot du matin (base locale) contient la version complète.
--
--  ⚠️  AVANT D'EXÉCUTER : demander à la famille si quelqu'un a volontairement
--      vidé ces ingrédients aujourd'hui. Si oui, ne rien faire.
--
--  QUOI : réinsère, dans les sections existantes (retrouvées par nom, type
--  « ingredients » et rang), les ingrédients du snapshot qui manquent (même
--  section, même nom, même rang) → 17 lignes attendues. Les 4 lignes présentes
--  ne sont pas touchées. Ne dépend d'aucune migration (fonctionne avant ou
--  après 0003 : les triggers de 0003/0004 remplissent unit_code / amount_num).
--  Idempotent : rejoué, il n'insère rien.
--
--  OÙ : Dashboard Supabase → SQL Editor → coller → Run.
--  ANNULER : delete from public.recipe_ingredients
--             where recipe_id = 'b7866cf7-261a-4f2c-a9b2-e35837c954f4'
--               and created_at >= '<heure d'exécution>';
-- ============================================================================

begin;

create temporary table tmp_carrot (section_name text, section_order int, name text, amount text, unit text,
                                   optional boolean, order_index int) on commit drop;
insert into tmp_carrot values
  ('Gâteau', 0, 'Noix (pécan ou grenoble)', '150', 'g', false, 0),
  ('Gâteau', 0, 'Sucre roux ou blond', '200', 'g', false, 1),
  ('Gâteau', 0, 'Carottes râpées', '300', 'g', false, 2),
  ('Gâteau', 0, 'Farine T55', '200', 'g', false, 3),
  ('Gâteau', 0, 'Compote de pommes', '100', 'g', false, 4),
  ('Gâteau', 0, 'Huile de tournesol', '150', 'ml', false, 5),
  ('Gâteau', 0, 'Oeufs', '3', NULL, false, 6),
  ('Gâteau', 0, 'Extrait de vanille liquide', '1', 'CàS', false, 7),
  ('Gâteau', 0, 'Sachet de levure chimique', '1', NULL, false, 8),
  ('Gâteau', 0, 'Bicarbonate de sodium', '1', 'càc', false, 9),
  ('Gâteau', 0, 'Cannelle en poudre', '1', 'CàS', false, 10),
  ('Gâteau', 0, 'Gingembre en poudre', '1', 'CàS', false, 11),
  ('Glaçage traditionnel', 1, 'Philadelphia', '150', 'g', false, 0),
  ('Glaçage traditionnel', 1, 'Crème fraîche', '2', 'càs', false, 1),
  ('Glaçage traditionnel', 1, 'Sucre', '120', 'g', false, 2),
  ('Glaçage traditionnel', 1, 'Extrait de vanille liquide', '1', 'càc', false, 3),
  ('Glaçage léger', 2, 'Yaourt grec nature', '200', 'g', false, 0),
  ('Glaçage léger', 2, 'Crème fraîche', '50', 'g', false, 1),
  ('Glaçage léger', 2, 'Sucre blond', '50', 'g', false, 2),
  ('Glaçage léger', 2, 'Extrait de vanille liquide', '1', 'càc', false, 3),
  ('Glaçage léger', 2, 'Extrait de citron liquide', '1', 'càc', false, 4);

create temporary table tmp_carrot_missing on commit drop as
  select s.id as section_id, c.*
    from tmp_carrot c
    join public.recipe_sections s
      on s.recipe_id = 'b7866cf7-261a-4f2c-a9b2-e35837c954f4'
     and s.name = c.section_name and s.type = 'ingredients' and s.order_index = c.section_order
   where not exists (select 1 from public.recipe_ingredients i
                      where i.section_id = s.id and i.name = c.name and i.order_index = c.order_index);

do $$
begin
  assert (select count(*) from public.recipe_sections
           where recipe_id = 'b7866cf7-261a-4f2c-a9b2-e35837c954f4' and type = 'ingredients') = 3,
    'Carrot cake : 3 sections d''ingrédients attendues (Gâteau, Glaçage traditionnel, Glaçage léger) — la recette a changé, ne rien faire';
  assert (select count(*) from public.recipe_ingredients where recipe_id = 'b7866cf7-261a-4f2c-a9b2-e35837c954f4') <= 4
      or not exists (select 1 from tmp_carrot_missing),
    'Carrot cake a déjà plus de 4 ingrédients : quelqu''un l''a complétée, ne rien faire';
end $$;

insert into public.recipe_ingredients (recipe_id, section_id, name, amount, unit, optional, order_index)
select 'b7866cf7-261a-4f2c-a9b2-e35837c954f4', m.section_id, m.name, m.amount, m.unit, m.optional, m.order_index
  from tmp_carrot_missing m;

do $$
declare n int;
begin
  select count(*) into n from public.recipe_ingredients where recipe_id = 'b7866cf7-261a-4f2c-a9b2-e35837c954f4';
  assert n = 21, format('Carrot cake : %s ingrédients après correctif, 21 attendus', n);
  raise notice 'Carrot cake : % ingrédient(s) réinséré(s), 21 au total', (select count(*) from tmp_carrot_missing);
end $$;

commit;
