-- Tests 0008/0010 : search_recipes (accents, repli ILIKE, filtres, pagination)
begin;

do $$
declare n int; t text;
begin
  perform tests.login('00000000-0000-0000-0000-00000000000b', 'anon');   -- lecture publique

  -- « gateau » trouve « Gâteau au yaourt » (titre) et « Carrot cake » (description « Gâteau aux carottes »), titre d'abord
  select count(*), min(total_count) into n, t from public.search_recipes('gateau');
  assert n = 2 and t = '2', format('gateau : %s résultats, total %s', n, t);
  select title into t from public.search_recipes('gateau') limit 1;
  assert t = 'Gâteau au yaourt', format('premier résultat : %s', t);
  assert (select count(*) from public.search_recipes('GÂTEAU')) = 2, 'accents dans la requête';
  assert (select count(*) from public.search_recipes('gâteaux')) = 2, 'pluriel (stemming french)';

  -- Repli ILIKE pour les requêtes courtes / préfixes
  assert (select count(*) from public.search_recipes('ga')) = 2, 'préfixe « ga » : Gâteau + Baba ganoush';
  assert (select count(*) from public.search_recipes('tof')) = 1;
  -- Mot vide seul → repli ILIKE (pas d'erreur « no lexemes »)
  assert (select count(*) from public.search_recipes('le')) >= 0;

  -- Plusieurs mots (websearch) : tous requis
  assert (select count(*) from public.search_recipes('riz saute')) = 1;
  assert (select count(*) from public.search_recipes('riz chocolat')) = 0;
  -- Tags indexés
  assert (select count(*) from public.search_recipes('vegan')) >= 2;

  -- Filtres
  assert (select count(*) from public.search_recipes(null, 'plats')) = 2;
  assert (select count(*) from public.search_recipes(null, null, array['vegan'])) = 2;
  assert (select count(*) from public.search_recipes(null, null, array['vegan','végétarien'])) = 1, 'tous les tags requis';
  assert (select count(*) from public.search_recipes('gateau', 'plats')) = 0;
  assert (select count(*) from public.search_recipes(null, null, '{}'::text[])) = 6, 'tableau vide = pas de filtre';

  -- Pagination + total_count
  assert (select count(*) from public.search_recipes(null, null, null, 2, 0)) = 2;
  assert (select total_count from public.search_recipes(null, null, null, 2, 0) limit 1) = 6;
  assert (select count(*) from public.search_recipes(null, null, null, 2, 4)) = 2;
  assert (select count(*) from public.search_recipes(null, null, null, 2, 6)) = 0;
  assert (select count(*) from public.search_recipes(null, null, null, 0, -5)) = 1, 'limit borné à 1 mini';
  -- Sans requête : tri created_at desc
  assert (select count(*) from public.search_recipes()) = 6;

  -- Colonnes attendues (dont photo_path depuis 0010)
  perform id, title, description, category, ingredients, instructions, prep_time, cook_time, servings, image, photo_path, notes, tags, created_at, updated_at, total_count
    from public.search_recipes('tofu');

  perform tests.logout();

  -- La colonne générée suit les mises à jour
  update public.recipes set title = 'Zzz tarte aux abricots' where id = '10000000-0000-0000-0000-000000000006';
  assert (select count(*) from public.search_recipes('abricot')) = 1, 'search non recalculé';

  raise notice '[test 0008] OK';
end $$;

rollback;
