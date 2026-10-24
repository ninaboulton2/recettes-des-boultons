-- Jeu de données du remplissage v2/0018 (tests locaux UNIQUEMENT), à partir de seed_test.sql :
--   3 profils (a = Nina, b, c) dont 2 ADMINS (a et b, comme la prod avant la bascule), des recettes avec
--   catégorie (6 du seed, dont « desserts et gâteaux », « plats », « soupes », « entrees »), 1 recette de
--   plus avec une catégorie INCONNUE (« Apéro & tapas »), des favoris (b : R1 ; c : R2 ; a : R1, sa propre
--   recette), un planning et des courses (seed). Annulé par fixtures_0018_down.sql.
set search_path = public, extensions;

-- 2ᵉ admin : `prevent_role_change` exige un admin ; on porte le claim comme le fait 0018 (voir son CHOIX n° 5)
do $$ begin perform set_config('request.jwt.claims', '{"role":"service_role","user_role":"admin"}', false); end $$;
update public.profiles set role = 'admin' where id = '00000000-0000-0000-0000-00000000000b';
do $$ begin perform set_config('request.jwt.claims', '', false); end $$;

insert into public.recipes (id, title, category, servings)
values ('10000000-0000-0000-0000-000000000007', 'Mini-feuilletés', 'Apéro & tapas', 4);

insert into public.favorites (user_id, recipe_id) values
  ('00000000-0000-0000-0000-00000000000c', '10000000-0000-0000-0000-000000000002'),
  ('00000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-000000000001'),
  ('00000000-0000-0000-0000-00000000000c', '10000000-0000-0000-0000-000000000007');

-- instantanés « avant » pour test_0018 (comptes et dates)
create table if not exists tests.snap_0018_counts (k text primary key, n bigint not null);
truncate tests.snap_0018_counts;
insert into tests.snap_0018_counts values
  ('recipes', (select count(*) from public.recipes)),
  ('sections', (select count(*) from public.recipe_sections)),
  ('ingredients', (select count(*) from public.recipe_ingredients)),
  ('instructions', (select count(*) from public.instructions)),
  ('favorites', (select count(*) from public.favorites)),
  ('planning', (select count(*) from public.planning)),
  ('items', (select count(*) from public.shopping_items)),
  ('lists', (select count(*) from public.shopping_lists)),
  ('profiles', (select count(*) from public.profiles));
create table if not exists tests.snap_0018_updated (id uuid primary key, updated_at timestamptz);
truncate tests.snap_0018_updated;
insert into tests.snap_0018_updated select id, updated_at from public.recipes;
