-- Tests 0018 : état APRÈS le remplissage v2/0018 (avant la bascule 0020).
-- Données : seed_test.sql + fixtures_0018.sql (3 comptes a / b / c dont 2 admins, 7 recettes avec catégorie
-- dont une catégorie inconnue, favoris), paramètres saisis par run_local.sh (pseudonymes « … Test »).
-- Les refus (paramètres manquants, ambigus, inconnus), le rejeu et le retour arrière sont vérifiés par run_local.sh.
-- Lecture seule (aucune écriture).
do $$
declare
  a constant uuid := '00000000-0000-0000-0000-00000000000a';
  b constant uuid := '00000000-0000-0000-0000-00000000000b';
  c constant uuid := '00000000-0000-0000-0000-00000000000c';
  r1 constant uuid := '10000000-0000-0000-0000-000000000001';
  r2 constant uuid := '10000000-0000-0000-0000-000000000002';
  r7 constant uuid := '10000000-0000-0000-0000-000000000007';
  g uuid; n bigint; k record; v_prev text := current_setting('request.jwt.claims', true);
  chk record;
begin
  -- ------------------------------------------------------------ comptes de données inchangés
  for k in select * from tests.snap_0018_counts loop
    execute format('select count(*) from public.%I', case k.k when 'recipes' then 'recipes' when 'sections' then 'recipe_sections'
        when 'ingredients' then 'recipe_ingredients' when 'instructions' then 'instructions' when 'favorites' then 'favorites'
        when 'planning' then 'planning' when 'items' then 'shopping_items' when 'lists' then 'shopping_lists' else 'profiles' end) into n;
    assert n = k.n, format('compte %s : %s, attendu %s', k.k, n, k.n);
  end loop;
  assert not exists (select 1 from public.recipes r join tests.snap_0018_updated s on s.id = r.id where r.updated_at is distinct from s.updated_at),
    'updated_at d''une recette modifié par le remplissage';

  -- ------------------------------------------------------------ groupe
  assert (select count(*) from public.groups) = 1, 'un seul groupe';
  select id into g from public.groups;
  assert (select name from public.groups where id = g) = 'Les Boultons', 'nom du groupe';
  assert (select created_by from public.groups where id = g) = a, 'créateur = Nina';
  assert (select theme->>'preset' from public.groups where id = g) = 'boultons'
     and (select theme->>'neutral' from public.groups where id = g) = 'slate'
     and (select theme->>'name' from public.groups where id = g) = 'Recettes des Boultons', 'thème Boultons';
  assert (select count(*) from public.group_members where group_id = g) = 3, '3 membres';
  assert (select count(*) from public.group_members where group_id = g and role = 'creator') = 1, '1 créateur';
  assert (select user_id from public.group_members where group_id = g and role = 'creator') = a, 'le créateur est Nina';
  assert (select count(*) from public.group_members where group_id = g and role = 'member' and user_id in (b, c)) = 2, 'b et c membres';

  -- ------------------------------------------------------------ profils
  assert (select display_name from public.profiles where id = a) = 'Nina Test'
     and (select display_name from public.profiles where id = b) = 'Bob Test'
     and (select display_name from public.profiles where id = c) = 'Cleo Test', 'pseudonymes des paramètres';
  assert (select cookbook_title from public.profiles where id = c) = 'Le carnet de Cleo', 'titre du carnet (paramètre)';
  assert (select cookbook_title from public.profiles where id = a) is null, 'titre du carnet laissé vide sans paramètre';
  assert not exists (select 1 from public.profiles where display_name like '%@%' or display_name = email or display_name = name), 'aucun repli sur e-mail / name';
  assert (select count(*) from public.profiles where active_theme_group_id = g) = 3, 'thème actif = groupe pour les 3';
  assert (select count(*) from public.profiles where onboarded_at is not null) = 3, 'onboarded_at';
  assert (select role from public.profiles where id = a) = 'admin', 'Nina reste admin (support)';
  assert (select role from public.profiles where id = b) = 'user', 'le 2e admin repasse user';
  assert (select role from public.profiles where id = c) = 'user';
  assert (select count(*) from public.profiles where role = 'admin') = 1, 'un seul admin';
  -- rôles d'origine gardés pour le retour arrière
  assert (select role from private.backup_0018_profiles where id = b) = 'admin' and (select role from private.backup_0018_profiles where id = c) = 'user', 'rôles d''origine sauvegardés';
  assert (select display_name is null from private.backup_0018_profiles where id = a), 'display_name d''origine sauvegardé (NULL)';
  assert exists (select 1 from pg_trigger where tgname = 'trg_prevent_role_change' and tgenabled = 'O'), 'le déclencheur anti-escalade reste actif';
  assert exists (select 1 from pg_trigger where tgname = 'update_recipes_updated_at' and tgenabled = 'O'), 'le déclencheur updated_at est réactivé';
  begin
    update public.profiles set role = 'admin' where id = c;
    raise exception 'le déclencheur anti-escalade aurait dû refuser';
  exception when others then
    assert sqlerrm like '%Modification du rôle non autorisée%', 'anti-escalade : ' || sqlerrm;
  end;
  assert coalesce(current_setting('request.jwt.claims', true), '') = coalesce(v_prev, ''), 'claim JWT de session restauré';

  -- ------------------------------------------------------------ recettes
  assert (select count(*) from public.recipes where owner_id = a) = 7, '7 recettes à Nina';
  assert (select count(*) from public.recipes where owner_id is null) = 0, 'aucune recette sans propriétaire';
  assert (select count(*) from public.recipes where visibility <> 'groups') = 0, 'visibility = groups';
  assert (select count(*) from public.recipes where category_id is null) = 0, 'toutes les recettes ont une catégorie reliée';

  -- ------------------------------------------------------------ catégories : 9 + 1 inconnue, par compte
  assert (select count(*) from public.categories) = 30, '30 catégories (10 par compte)';
  assert (select count(distinct owner_id) from public.categories) = 3;
  assert (select count(*) from public.categories where owner_id = a and slug in
           ('soupes', 'entrees', 'plats', 'poissons', 'viandes', 'yaourts_et_fromages', 'desserts_et_gateaux', 'boissons', 'confitures')) = 9,
    'les 9 catégories actuelles (clé i18n comme slug)';
  assert exists (select 1 from public.categories where owner_id = b and slug = 'apero_tapas' and name_fr = 'Apéro & tapas' and name_en is null), 'catégorie inconnue conservée';
  assert (select name_fr from public.categories where owner_id = c and slug = 'desserts_et_gateaux') = 'Desserts et gâteaux'
     and (select name_en from public.categories where owner_id = c and slug = 'desserts_et_gateaux') = 'Desserts and cakes'
     and (select icon from public.categories where owner_id = c and slug = 'desserts_et_gateaux') = 'i-lucide-cake-slice'
     and (select sort_order from public.categories where owner_id = c and slug = 'soupes') = 0, 'noms fr / en, icône, ordre';
  for chk in select rc.id, rc.category, cat.slug, cat.owner_id as cat_owner, rc.owner_id from public.recipes rc join public.categories cat on cat.id = rc.category_id loop
    assert chk.cat_owner = chk.owner_id, 'la catégorie d''une recette est celle de son auteur';
  end loop;
  assert (select cat.slug from public.recipes rc join public.categories cat on cat.id = rc.category_id where rc.id = r1) = 'desserts_et_gateaux', 'R1 → desserts_et_gateaux';
  assert (select cat.slug from public.recipes rc join public.categories cat on cat.id = rc.category_id where rc.id = r7) = 'apero_tapas', 'R7 → catégorie inconnue';

  -- ------------------------------------------------------------ droits : un par recette, au groupe
  assert (select count(*) from public.recipe_grants) = 7, '1 droit par recette';
  assert (select count(*) from public.recipe_grants where grantee_group_id = g and permission = 'edit_original' and origin = 'direct'
            and granted_by = a and grantee_user_id is null and source_grant_id is null) = 7, 'droits edit_original du groupe';

  -- ------------------------------------------------------------ carnets : favoris sur les recettes des autres seulement
  assert (select count(*) from public.cookbook_entries) = 3, '3 entrées : b/R1, c/R2, c/R7 (pas a/R1 : sa propre recette)';
  assert exists (select 1 from public.cookbook_entries where user_id = b and recipe_id = r1), 'favori de b dans son carnet';
  assert exists (select 1 from public.cookbook_entries where user_id = c and recipe_id = r2);
  assert not exists (select 1 from public.cookbook_entries where user_id = a), 'pas d''entrée pour l''auteur';
  assert (select category_id from public.cookbook_entries where user_id = b and recipe_id = r1)
       = (select id from public.categories where owner_id = b and slug = 'desserts_et_gateaux'), 'rangé dans SA catégorie';
  assert (select count(*) from public.dismissed_prompts) = 0, 'aucune bannière fermée';

  -- ------------------------------------------------------------ les vraies fonctions de 0019
  perform set_config('request.jwt.claims', jsonb_build_object('sub', b, 'role', 'authenticated')::text, true);
  assert (select count(*) from public.recipes where private.can_edit_recipe(id)) = 7 and private.recipe_level(r1) = 3, 'b : niveau 3 (edit_original) partout';
  perform set_config('request.jwt.claims', jsonb_build_object('sub', c, 'role', 'authenticated')::text, true);
  assert (select count(*) from public.recipes where private.can_edit_recipe(id)) = 7, 'c : niveau 3 partout';
  perform set_config('request.jwt.claims', jsonb_build_object('sub', a, 'role', 'authenticated')::text, true);
  assert private.recipe_level(r1) = 4, 'a : auteur';
  perform set_config('request.jwt.claims', jsonb_build_object('sub', gen_random_uuid(), 'role', 'authenticated')::text, true);
  assert (select count(*) from public.recipes where private.can_read_recipe(id)) = 0, 'un inconnu ne lit rien';
  -- recherche par nom : les 3 comptes sont trouvables par un inconnu (display_name rempli)
  assert (select count(*) from public.search_users('test')) = 3, 'les 3 comptes sont trouvables';
  -- un membre voit les autres membres via get_public_profiles (même groupe)
  perform set_config('request.jwt.claims', jsonb_build_object('sub', b, 'role', 'authenticated')::text, true);
  assert (select count(*) from public.get_public_profiles(array[a, c])) = 2, 'b voit les noms de a et c';
  assert (select display_name from public.get_public_profiles(array[a])) = 'Nina Test';
  perform set_config('request.jwt.claims', coalesce(v_prev, ''), true);

  -- ------------------------------------------------------------ 0020 pourra tourner
  assert not exists (select 1 from public.recipes where owner_id is null);
  assert not exists (select 1 from public.recipes r where not exists (select 1 from public.profiles p where p.id = r.owner_id));
  -- tables de travail supprimées, sauvegardes présentes
  assert to_regclass('private.tmp_0018_before') is null and to_regclass('private.tmp_0018_ctx') is null
     and to_regclass('private.tmp_0018_slugs') is null and to_regclass('private.tmp_0018_catmap') is null, 'tables de travail restantes';
  assert to_regclass('private.backup_0018_profiles') is not null and to_regclass('private.backup_0018_created') is not null;
  assert not has_table_privilege('authenticated', 'private.backup_0018_profiles', 'select')
     and not has_table_privilege('anon', 'private.v2_fill_params', 'select')
     and not has_table_privilege('authenticated', 'private.v2_fill_params', 'select'), 'tables privées ouvertes à l''API';
  raise notice '[test 0018] remplissage : OK';
end $$;
