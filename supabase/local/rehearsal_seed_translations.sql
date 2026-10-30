-- Répétition de la bascule v2 : si le snapshot n'embarque pas les traductions prod (raw/recipe_translations*.json, voir
-- export_snapshot.md), recipe_translations est vide alors que la prod en contient une par recette (dossier v2 § 4.3 : 181).
-- Ce script ne COMBLE QUE LES TROUS, en LOCAL seulement : pour chaque recette sans aucune traduction (donc aucune avec un
-- snapshot complet), il fabrique une traduction « réaliste » (dictionnaire de mots courants, pas d'IA) vers l'autre langue,
-- afin de rejouer la recherche bilingue et de garder les compteurs de la bascule représentatifs.
-- Rejouable (n'ajoute que les traductions manquantes). Ne jamais écraser les vraies traductions. Ne pas jouer en production.
create or replace function pg_temp.en(t text) returns text language sql immutable as $f$
  select regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(
         lower(t),
         'tomates?', 'tomato', 'g'), 'poulet', 'chicken', 'g'), 'chocolat', 'chocolate', 'g'), 'pommes?( de terre)?', 'apple', 'g'),
         'gâteau|gateau', 'cake', 'g'), 'soupe', 'soup', 'g'), 'tarte', 'pie', 'g'), 'salade', 'salad', 'g'),
         'poisson', 'fish', 'g'), 'fromage', 'cheese', 'g')
$f$;

insert into public.recipe_translations (recipe_id, locale, title, description, notes, tags, content, source_hash, model, stale)
select r.id, case when r.lang = 'en' then 'fr' else 'en' end, initcap(pg_temp.en(r.title)), pg_temp.en(r.description), pg_temp.en(r.notes),
       coalesce((select array_agg(pg_temp.en(x)) from unnest(r.tags) x), '{}'),
       jsonb_build_object('sections', coalesce((
         select jsonb_agg(jsonb_build_object(
                  'name', pg_temp.en(s.name), 'type', s.type,
                  'ingredients', coalesce((select jsonb_agg(jsonb_build_object('name', pg_temp.en(i.name), 'unit', i.unit, 'amount', i.amount, 'optional', i.optional) order by i.order_index)
                                             from public.recipe_ingredients i where i.section_id = s.id), '[]'::jsonb),
                  'instructions', coalesce((select jsonb_agg(pg_temp.en(n.content) order by n.order_index)
                                              from public.instructions n where n.section_id = s.id), '[]'::jsonb)
                ) order by s.order_index)
           from public.recipe_sections s where s.recipe_id = r.id), '[]'::jsonb)),
       md5(r.id::text), 'rehearsal-seed', false
  from public.recipes r
 where not exists (select 1 from public.recipe_translations t where t.recipe_id = r.id);
select count(*) as traductions from public.recipe_translations;
