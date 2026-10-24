-- ============================================================================
--  Contrôles FONCTIONNELS de la bascule v2 sur les vraies données (phase 10, BASCULE_V2.md étape 8)
-- ============================================================================
--  À jouer APRÈS 0018 + 0020 (+ photos) sur la base LOCALE (copie du snapshot réel), pour chaque membre du groupe
--  « Les Boultons » en simulant `authenticated` avec son jeton (set local role + request.jwt.claims) :
--
--    psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -X -f supabase/local/rehearsal_checks.sql
--
--  Lecture seule en pratique : tout est dans une transaction annulée à la fin (les « modifications » d'essai
--  sont défaites). Les attendus sont CALCULÉS sur les données (aucun chiffre en dur) : on compare ce que voit
--  chaque personne, par le RLS, à ce qui existe. Aucune donnée personnelle n'est affichée (pseudonymes seulement).
--  Pour psql (local ou connexion directe) uniquement : le SQL Editor n'affiche que le dernier résultat et ne garde pas
--  la table temporaire ; en production, la vérification d'accès de l'étape 8 de BASCULE_V2.md se fait à la main.
--  Le dernier bloc échoue (erreur) si un point est KO ; sinon il affiche « N contrôles OK ».
-- ============================================================================
\set ON_ERROR_STOP on
begin;

create temp table chk (n serial primary key, name text, ok boolean, detail text);
grant all on chk to public;
grant usage, select on sequence chk_n_seq to public;

do $$
declare
  grp uuid; owner uuid; m record;
  total bigint; v_vis bigint; v_edit bigint; v_n bigint; v_fav bigint; v_raw bigint; v_a bigint; v_b bigint;
  ghost uuid := gen_random_uuid();
  some_recipe uuid;
  claims text;
begin
  -- Le groupe de la bascule = celui qui porte les droits edit_original ; le propriétaire = son créateur.
  select grantee_group_id into grp from public.recipe_grants where permission = 'edit_original' and grantee_group_id is not null group by 1 order by count(*) desc limit 1;
  select created_by into owner from public.groups where id = grp;
  select count(*) into total from public.recipes;
  select id into some_recipe from public.recipes order by id limit 1;
  insert into chk(name, ok, detail) values
    ('groupe de la bascule trouvé', grp is not null and owner is not null, coalesce(grp::text, 'aucun')),
    ('toutes les recettes ont un propriétaire et un seul', (select count(distinct owner_id) = 1 and count(owner_id) = count(*) from public.recipes), total || ' recettes'),
    ('un droit edit_original du groupe par recette', (select count(*) from public.recipe_grants where grantee_group_id = grp and permission = 'edit_original') = total, ''),
    ('toutes les recettes sont en visibility = groups', (select count(*) = total from public.recipes where visibility = 'groups'), '');

  -- ------------------------------------------------------------ par membre du groupe (3 comptes en tout, 4 dans la prod)
  for m in select p.id, coalesce(p.display_name, '?') as pseudo, gm.role as grole
             from public.group_members gm join public.profiles p on p.id = gm.user_id where gm.group_id = grp order by p.created_at, p.id loop
    claims := jsonb_build_object('sub', m.id, 'role', 'authenticated', 'user_role', 'user')::text;
    perform set_config('request.jwt.claims', claims, true);
    execute 'set local role authenticated';
    -- 1. voit toutes les recettes (par le groupe) et ses sections / ingrédients / étapes
    select count(*) into v_vis from public.recipes;
    select count(*) into v_a from public.recipe_sections;
    select count(*) into v_b from public.recipe_ingredients;
    -- 2. peut modifier (RLS : update sans changement de valeur, défait par le rollback final)
    update public.recipes set notes = notes where id = some_recipe;
    get diagnostics v_edit = row_count;
    select count(*) into v_n from public.recipes r where private.can_edit_recipe(r.id);
    -- 3. ses données personnelles (RLS) : favoris / planning / courses, comparés plus bas aux comptes réels
    select count(*) into v_fav from public.favorites;
    reset role;
    insert into chk(name, ok, detail) values
      (format('[%s] voit les %s recettes', m.pseudo, total), v_vis = total, v_vis || ' vues'),
      (format('[%s] voit toutes les sections et ingrédients', m.pseudo), v_a = (select count(*) from public.recipe_sections) and v_b = (select count(*) from public.recipe_ingredients), v_a || ' sections / ' || v_b || ' ingrédients'),
      (format('[%s] peut modifier une recette (RLS update)', m.pseudo), v_edit = 1 or m.id = owner, 'lignes modifiées : ' || v_edit),
      (format('[%s] can_edit_recipe vrai sur les %s recettes', m.pseudo, total), v_n = total, v_n || ' éditables'),
      (format('[%s] favoris visibles = favoris réels', m.pseudo), v_fav = (select count(*) from public.favorites where user_id = m.id), v_fav || ' favoris');

    -- 4. planning et courses : mêmes lignes par le RLS que dans la table (conservés)
    perform set_config('request.jwt.claims', claims, true);
    execute 'set local role authenticated';
    select count(*) into v_a from public.planning;
    select count(*) into v_b from public.shopping_items;
    select count(*) into v_n from public.shopping_lists;
    reset role;
    insert into chk(name, ok, detail) values
      (format('[%s] planning, listes et articles = ceux du compte', m.pseudo),
       v_a = (select count(*) from public.planning where user_id = m.id)
       and v_n = (select count(*) from public.shopping_lists where user_id = m.id)
       and v_b = (select count(*) from public.shopping_items i join public.shopping_lists l on l.id = i.list_id where l.user_id = m.id),
       v_a || ' repas / ' || v_n || ' listes / ' || v_b || ' articles');

    -- 5. catégories personnelles
    select count(*) into v_a from public.categories where owner_id = m.id;
    insert into chk(name, ok, detail) values
      (format('[%s] a ses catégories personnelles (autant que le propriétaire)', m.pseudo), v_a > 0 and v_a = (select count(*) from public.categories where owner_id = owner), v_a || ' catégories');

    -- 6. recherche, dans les deux langues, par le RLS : même résultat pour tous les membres
    perform set_config('request.jwt.claims', claims, true);
    execute 'set local role authenticated';
    select coalesce(max(total_count), 0) into v_a from public.search_recipes('poulet', null, null, 100, 0);
    select coalesce(max(total_count), 0) into v_b from public.search_recipes('chicken', null, null, 100, 0);
    select count(*) into v_n from public.search_recipes(null, null, null, 100, 0);
    reset role;
    insert into chk(name, ok, detail) values
      (format('[%s] recherche française (« poulet »)', m.pseudo), v_a > 0 and v_a = (select count(*) from public.recipes r where r.search @@ websearch_to_tsquery('french', 'poulet') or exists (select 1 from public.recipe_translations t where t.recipe_id = r.id and (t.search @@ websearch_to_tsquery('french', 'poulet') or t.search @@ websearch_to_tsquery('english', 'poulet')) ) or public.immutable_unaccent(r.title) ilike '%poulet%'), v_a || ' résultat(s)'),
      (format('[%s] recherche anglaise (« chicken », traductions)', m.pseudo), v_b > 0, v_b || ' résultat(s)'),
      (format('[%s] la liste sans requête rend une page pleine (100 max)', m.pseudo), v_n = least(100, total), v_n || ' lignes');
  end loop;

  -- ------------------------------------------------------------ propriétaire : toutes les recettes sont les siennes
  perform set_config('request.jwt.claims', jsonb_build_object('sub', owner, 'role', 'authenticated', 'user_role', 'admin')::text, true);
  execute 'set local role authenticated';
  select count(*) into v_n from public.recipes where owner_id = owner;
  reset role;
  insert into chk(name, ok, detail) values ('le propriétaire possède toutes les recettes', v_n = total, v_n || ' recettes');

  -- ------------------------------------------------------------ un compte neuf (sans groupe ni profil) et un visiteur : rien
  perform set_config('request.jwt.claims', jsonb_build_object('sub', ghost, 'role', 'authenticated', 'user_role', 'user')::text, true);
  execute 'set local role authenticated';
  select count(*) into v_a from public.recipes;
  select count(*) into v_b from public.recipe_translations;
  select count(*) into v_n from public.search_recipes('poulet', null, null, 100, 0);
  update public.recipes set notes = notes where id = some_recipe;
  get diagnostics v_edit = row_count;
  reset role;
  insert into chk(name, ok, detail) values
    ('un compte neuf ne voit aucune recette, traduction ni résultat', v_a = 0 and v_b = 0 and v_n = 0, v_a || '/' || v_b || '/' || v_n),
    ('un compte neuf ne peut modifier aucune recette', v_edit = 0, 'lignes modifiées : ' || v_edit);
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  execute 'set local role anon';
  select count(*) into v_a from public.recipes;
  reset role;
  insert into chk(name, ok, detail) values ('un visiteur sans compte ne voit aucune recette', v_a = 0, v_a::text);

  -- ------------------------------------------------------------ cohérence des données (en superutilisateur)
  insert into chk(name, ok, detail) values
    ('chaque recette est reliée à une catégorie de son propriétaire', (select count(*) = 0 from public.recipes r left join public.categories c on c.id = r.category_id where c.id is null or c.owner_id <> r.owner_id), ''),
    ('catégorie personnelle cohérente avec l''ancien texte (clé = texte sans accents, espaces en _)',
       (select count(*) = 0 from public.recipes r join public.categories c on c.id = r.category_id
         where c.slug is distinct from regexp_replace(lower(public.immutable_unaccent(btrim(r.category))), '\s+', '_', 'g')), ''),
    ('chaque catégorie texte de recette existe pour chaque membre',
       (select count(*) = 0 from (select distinct r.category from public.recipes r) k cross join public.group_members gm
         where gm.group_id = grp and not exists (select 1 from public.categories c where c.owner_id = gm.user_id and c.slug = regexp_replace(lower(public.immutable_unaccent(btrim(k.category))), '\s+', '_', 'g'))), ''),
    ('traductions : une par recette, dans la langue opposée à la source',
       (select count(*) = 0 from public.recipes r where not exists (select 1 from public.recipe_translations t where t.recipe_id = r.id and t.locale <> r.lang)), (select count(*) from public.recipe_translations) || ' traductions'),
    ('traductions FR et EN présentes (titre non vide)', (select count(*) = 0 from public.recipe_translations where btrim(title) = ''), ''),
    ('favoris des autres comptes recopiés dans leur carnet',
       (select count(*) = 0 from public.favorites f join public.recipes r on r.id = f.recipe_id
         where r.owner_id <> f.user_id and not exists (select 1 from public.cookbook_entries e where e.user_id = f.user_id and e.recipe_id = f.recipe_id)), (select count(*) from public.cookbook_entries) || ' entrées'),
    ('un seul admin (support) après la bascule', (select count(*) = 1 from public.profiles where role = 'admin'), ''),
    ('chaque compte a un pseudonyme sans « @ »', (select count(*) = 0 from public.profiles where display_name is null or display_name like '%@%'), ''),
    ('bucket recipe-photos : privé après la bascule des photos', coalesce((select not public from storage.buckets where id = 'recipe-photos'), false), 'faux tant que v2/0029 n''est pas passée');

  -- ------------------------------------------------------------ fiche d'une recette sous RLS (lecture complète)
  perform set_config('request.jwt.claims', jsonb_build_object('sub', (select user_id from public.group_members where group_id = grp and user_id <> owner limit 1), 'role', 'authenticated', 'user_role', 'user')::text, true);
  execute 'set local role authenticated';
  select count(*) into v_a from public.recipes r join public.recipe_sections s on s.recipe_id = r.id join public.recipe_ingredients i on i.section_id = s.id where r.id = some_recipe;
  select count(*) into v_b from public.recipe_translations where recipe_id = some_recipe;
  reset role;
  insert into chk(name, ok, detail) values ('la fiche d''une recette se lit en entier (sections, ingrédients, traduction)', v_a > 0 and v_b > 0, v_a || ' lignes d''ingrédients / ' || v_b || ' traduction(s)');
end $$;

select case when ok then 'OK ' else 'KO ' end || name || coalesce('  — ' || nullif(detail, ''), '') as controle from chk order by n;

do $$
declare ko int; tot int;
begin
  select count(*) filter (where not ok), count(*) into ko, tot from chk;
  if ko > 0 then raise exception '% contrôle(s) KO sur %', ko, tot; end if;
  raise notice '% contrôles OK', tot;
end $$;

rollback;
