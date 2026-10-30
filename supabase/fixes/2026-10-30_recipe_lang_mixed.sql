-- ============================================================================
--  Correctif de données (2026-10-30) : 3 recettes dont la traduction est fausse
-- ============================================================================
--  CONSTAT (lecture seule en prod, 2026-10-30)
--   * f5a14312 « Fritters - Peas and butter beans fritters » et 7559b2e0 « Fritters - Sweet potatoes red
--     lentils and chickpea » : titre anglais mais ingrédients et étapes en FRANÇAIS ; la détection de langue
--     les a classées `en`, donc leur « traduction fr » est en réalité de l'anglais.
--     → `lang` passe à 'fr' ; la ligne de traduction (anglaise) passe en locale 'en' et est marquée périmée.
--   * 33afe58e « Enchiladas » : source anglaise correcte, mais la « traduction fr » a gardé les ingrédients
--     en anglais. → traduction marquée périmée.
--  Une traduction périmée reste affichée telle quelle (aucune perte) ; la v2 la refait à la prochaine
--  ouverture de la fiche (traduction à la demande, § 20.19 de DEVELOPER.md, budget global du mois).
--  QUAND : n'importe quand (sans effet de structure). À jouer en un seul Run dans le SQL Editor.
--  Retour arrière : en bas du fichier (commenté).
-- ============================================================================
begin;

do $$
declare n int;
begin
  -- Garde-fous : l'état doit être exactement celui constaté, sinon on n'écrit rien.
  select count(*) into n from public.recipes r join public.recipe_translations t on t.recipe_id = r.id
   where r.id::text like any (array['f5a14312%','7559b2e0%']) and r.lang = 'en' and t.locale = 'fr';
  assert n = 2, format('[fix] fritters : état inattendu (%s lignes au lieu de 2), rien n''est modifié', n);
  select count(*) into n from public.recipes r join public.recipe_translations t on t.recipe_id = r.id
   where r.id::text like '33afe58e%' and r.lang = 'en' and t.locale = 'fr';
  assert n = 1, format('[fix] enchiladas : état inattendu (%s lignes au lieu de 1), rien n''est modifié', n);
end $$;

update public.recipe_translations t set locale = 'en', stale = true
  from public.recipes r
 where r.id = t.recipe_id and r.id::text like any (array['f5a14312%','7559b2e0%']) and t.locale = 'fr';

update public.recipes set lang = 'fr'
 where id::text like any (array['f5a14312%','7559b2e0%']) and lang = 'en';

update public.recipe_translations set stale = true
 where recipe_id::text like '33afe58e%' and locale = 'fr';

do $$
begin
  assert (select count(*) from public.recipes where id::text like any (array['f5a14312%','7559b2e0%']) and lang = 'fr') = 2;
  assert (select count(*) from public.recipe_translations where recipe_id::text like any (array['f5a14312%','7559b2e0%','33afe58e%']) and stale) = 3;
  raise notice '[fix 2026-10-30] 2 recettes repassées en fr, 3 traductions marquées à refaire';
end $$;

commit;

-- Retour arrière :
-- begin;
-- update public.recipes set lang = 'en' where id::text like any (array['f5a14312%','7559b2e0%']);
-- update public.recipe_translations set locale = 'fr', stale = false where recipe_id::text like any (array['f5a14312%','7559b2e0%']) and locale = 'en';
-- update public.recipe_translations set stale = false where recipe_id::text like '33afe58e%' and locale = 'fr';
-- commit;
