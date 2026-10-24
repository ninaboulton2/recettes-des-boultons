-- Test 0029 — photos privées (phase 8), sous la chaîne COMPLÈTE (… → 0018 → 0020 → 0029 migration + v2/0029 bascule des photos).
--   * public.shared_recipe_photo_path(jeton) : service_role seulement, jeton inconnu / sans photo / photo hors du dossier de la recette = aucune ligne ;
--   * bucket recipe-photos privé ; politiques storage.objects : lecture = can_read_recipe, écriture = can_edit_recipe,
--     suppression = AUTEUR seulement ; le public (anon) et un étranger ne voient rien.
-- a = Nina (auteure du seed, propriétaire de la recette r1 du seed), b = membre du groupe (droit de groupe edit_original sur r1),
-- d = étranger, e = amie avec un droit « read » direct. Transaction annulée.
begin;

create or replace function tests.try(q text) returns text language plpgsql as $$
begin execute q; return 'ok'; exception when others then return sqlstate; end $$;
grant execute on function tests.try(text) to anon, authenticated, service_role;

create or replace function tests.rows_affected(q text) returns bigint language plpgsql as $$
declare n bigint;
begin
  execute q; get diagnostics n = row_count; return n;
exception when insufficient_privilege then return -1;
          when others then return -2;
end $$;
grant execute on function tests.rows_affected(text) to anon, authenticated, service_role;

create or replace function tests.visible(q text) returns bigint language plpgsql as $$
declare n bigint;
begin
  execute 'select count(*) from (' || q || ') s' into n; return n;
exception when insufficient_privilege then return -1;
end $$;
grant execute on function tests.visible(text) to anon, authenticated, service_role;

do $$
declare
  a constant uuid := '00000000-0000-0000-0000-00000000000a';
  b constant uuid := '00000000-0000-0000-0000-00000000000b';
  d constant uuid := '00000000-0000-0000-0000-0000000000d9';
  e constant uuid := '00000000-0000-0000-0000-0000000000e9';
  r1 constant uuid := '10000000-0000-0000-0000-000000000001';
  rp uuid; rn uuid; tok uuid; tok_nophoto uuid; p_priv text; p_r1 text;
begin
  insert into auth.users (id, email, raw_user_meta_data) values (d, 'dave9@test.local', '{}'), (e, 'eve9@test.local', '{}');
  update public.profiles set display_name = 'Dave Neuf' where id = d;
  update public.profiles set display_name = 'Eve Neuf'  where id = e;

  -- bucket privé
  assert (select public from storage.buckets where id = 'recipe-photos') = false, 'le bucket recipe-photos doit être privé';

  -- recettes de a : une privée avec photo (lien public + droit « read » pour e), une sans photo (lien public)
  perform tests.login(a, 'authenticated');
  rp := public.save_recipe('{"title":"Avec photo 0029","category":"plats","visibility":"private"}'::jsonb);
  rn := public.save_recipe('{"title":"Sans photo 0029","category":"plats","visibility":"private"}'::jsonb);
  p_priv := rp || '/1700000000000.webp';
  p_r1 := r1 || '/1700000000001.webp';
  update public.recipes set photo_path = p_priv where id = rp;
  tok := (public.create_share_link(rp))::uuid;
  tok_nophoto := (public.create_share_link(rn))::uuid;
  perform tests.logout();
  insert into public.recipe_grants (recipe_id, grantee_user_id, permission, granted_by, origin) values (rp, e, 'read', a, 'direct');

  -- ============================================================ shared_recipe_photo_path
  assert (select has_function_privilege('service_role', 'public.shared_recipe_photo_path(uuid)', 'execute')), 'service_role exécute';
  assert not (select has_function_privilege('anon', 'public.shared_recipe_photo_path(uuid)', 'execute')), 'anon n''exécute pas';
  assert not (select has_function_privilege('authenticated', 'public.shared_recipe_photo_path(uuid)', 'execute')), 'authenticated n''exécute pas';
  perform tests.login(d, 'anon');
  assert tests.try(format($q$select public.shared_recipe_photo_path(%L)$q$, tok)) = '42501', 'anon : refusé';
  perform tests.logout();
  perform tests.login(d, 'authenticated');
  assert tests.try(format($q$select public.shared_recipe_photo_path(%L)$q$, tok)) = '42501', 'authenticated : refusé (le chemin contient l''id de la recette)';
  perform tests.logout();
  perform tests.login(d, 'service_role');
  assert (select photo_path from public.shared_recipe_photo_path(tok)) = p_priv and (select recipe_id from public.shared_recipe_photo_path(tok)) = rp,
    'service_role : id de la recette et chemin de la photo pour un jeton actif';
  assert not exists (select 1 from public.shared_recipe_photo_path(tok_nophoto)), 'recette sans photo : aucune ligne';
  assert not exists (select 1 from public.shared_recipe_photo_path(gen_random_uuid())), 'jeton inconnu : aucune ligne';
  assert not exists (select 1 from public.shared_recipe_photo_path(null)), 'jeton NULL : aucune ligne';
  perform tests.logout();

  -- Photo d'AUTRUI derrière un lien public (relecture de sécurité n° 3) : la contrainte refuse l'écriture, et même si elle était
  -- contournée (donnée ancienne), la fonction ne renvoie rien. Un lien public ne doit jamais faire signer la photo d'une autre recette.
  assert tests.try(format($q$update public.recipes set photo_path = %L where id = %L$q$, p_r1, rp)) = '23514', 'contrainte : chemin de la recette d''une autre';
  assert tests.try(format($q$update public.recipes set photo_path = %L where id = %L$q$, '../' || p_priv, rp)) = '23514', 'contrainte : chemin hors dossier';
  alter table public.recipes drop constraint recipes_photo_path_in_own_folder;   -- simule une ligne ancienne hors contrainte
  update public.recipes set photo_path = p_r1 where id = rp;
  perform tests.login(d, 'service_role');
  assert not exists (select 1 from public.shared_recipe_photo_path(tok)), 'chemin d''une autre recette : aucune ligne (rien à signer)';
  perform tests.logout();
  update public.recipes set photo_path = p_priv where id = rp;
  alter table public.recipes add constraint recipes_photo_path_in_own_folder
    check (photo_path is null or photo_path like id::text || '/%') not valid;
  perform tests.login(d, 'service_role');
  assert (select photo_path from public.shared_recipe_photo_path(tok)) = p_priv, 'chemin rétabli : de nouveau servi';
  perform tests.logout();
  -- lien révoqué : plus de photo
  perform tests.login(a, 'authenticated');
  perform public.revoke_share_link(rp);
  perform tests.logout();
  perform tests.login(d, 'service_role');
  assert not exists (select 1 from public.shared_recipe_photo_path(tok)), 'lien révoqué : aucune ligne';
  perform tests.logout();

  -- ============================================================ politiques storage.objects
  perform tests.login(a, 'authenticated');
  assert tests.rows_affected(format($q$insert into storage.objects (bucket_id, name) values ('recipe-photos', %L)$q$, p_priv)) = 1, 'a téléverse pour sa recette';
  assert tests.rows_affected(format($q$insert into storage.objects (bucket_id, name) values ('recipe-photos', %L)$q$, p_r1)) = 1, 'a téléverse pour r1';
  assert tests.visible(format($q$select 1 from storage.objects where bucket_id = 'recipe-photos' and name = %L$q$, p_priv)) = 1, 'a lit sa photo';
  perform tests.logout();

  -- b : droit de groupe edit_original sur r1 = lit et téléverse, mais ne supprime PAS ; ne voit pas la photo privée de a
  perform tests.login(b, 'authenticated');
  assert tests.visible(format($q$select 1 from storage.objects where bucket_id = 'recipe-photos' and name = %L$q$, p_r1)) = 1, 'b lit la photo d''une recette de son groupe';
  assert tests.visible(format($q$select 1 from storage.objects where bucket_id = 'recipe-photos' and name = %L$q$, p_priv)) = 0, 'b ne lit pas la photo d''une recette privée';
  assert tests.rows_affected(format($q$insert into storage.objects (bucket_id, name) values ('recipe-photos', %L)$q$, r1 || '/b.webp')) = 1, 'un éditeur (edit_original) téléverse';
  assert tests.rows_affected(format($q$delete from storage.objects where bucket_id = 'recipe-photos' and name = %L$q$, p_r1)) = 0, 'un éditeur ne supprime pas la photo de l''auteur';
  assert tests.rows_affected(format($q$delete from storage.objects where bucket_id = 'recipe-photos' and name = %L$q$, r1 || '/b.webp')) = 0, 'un éditeur ne supprime pas, même sa propre photo';
  assert tests.rows_affected(format($q$insert into storage.objects (bucket_id, name) values ('recipe-photos', %L)$q$, rp || '/b.webp')) < 0, 'b ne téléverse pas chez a (recette privée)';
  perform tests.logout();

  -- e : droit « read » direct = lit, ne téléverse pas, ne supprime pas
  perform tests.login(e, 'authenticated');
  assert tests.visible(format($q$select 1 from storage.objects where bucket_id = 'recipe-photos' and name = %L$q$, p_priv)) = 1, 'e lit la photo (droit read)';
  assert tests.rows_affected(format($q$insert into storage.objects (bucket_id, name) values ('recipe-photos', %L)$q$, rp || '/e.webp')) < 0, 'e ne téléverse pas (lecture seule)';
  assert tests.rows_affected(format($q$delete from storage.objects where bucket_id = 'recipe-photos' and name = %L$q$, p_priv)) = 0, 'e ne supprime pas';
  perform tests.logout();

  -- d : étranger, rien du tout ; anon : rien
  perform tests.login(d, 'authenticated');
  assert tests.visible($q$select 1 from storage.objects where bucket_id = 'recipe-photos'$q$) = 0, 'un étranger ne voit aucune photo';
  assert tests.rows_affected(format($q$insert into storage.objects (bucket_id, name) values ('recipe-photos', %L)$q$, rp || '/d.webp')) < 0, 'un étranger ne téléverse pas';
  assert tests.rows_affected(format($q$delete from storage.objects where bucket_id = 'recipe-photos' and name = %L$q$, p_priv)) = 0, 'un étranger ne supprime pas';
  assert tests.rows_affected(format($q$insert into storage.objects (bucket_id, name) values ('recipe-photos', 'pas-un-uuid/x.webp')$q$)) < 0, 'chemin sans identifiant de recette refusé';
  perform tests.logout();
  perform tests.login(d, 'anon');
  assert tests.visible($q$select 1 from storage.objects where bucket_id = 'recipe-photos'$q$) in (0, -1), 'le public ne lit aucune photo';
  assert tests.rows_affected(format($q$insert into storage.objects (bucket_id, name) values ('recipe-photos', %L)$q$, rp || '/anon.webp')) < 0, 'le public ne téléverse pas';
  perform tests.logout();

  -- l'auteur supprime
  perform tests.login(a, 'authenticated');
  assert tests.rows_affected(format($q$delete from storage.objects where bucket_id = 'recipe-photos' and name = %L$q$, p_priv)) = 1, 'l''auteur supprime sa photo';
  assert tests.rows_affected(format($q$delete from storage.objects where bucket_id = 'recipe-photos' and name = %L$q$, p_r1)) = 1, 'l''auteur supprime la photo de sa recette de groupe';
  perform tests.logout();

  -- le service_role (routes serveur) lit et supprime tout, quel que soit le RLS (il le contourne)
  insert into storage.objects (bucket_id, name) values ('recipe-photos', p_priv);
  perform tests.login(d, 'service_role');
  assert tests.visible(format($q$select 1 from storage.objects where bucket_id = 'recipe-photos' and name = %L$q$, p_priv)) = 1, 'service_role lit';
  assert tests.rows_affected(format($q$delete from storage.objects where bucket_id = 'recipe-photos' and name = %L$q$, p_priv)) = 1, 'service_role supprime';
  perform tests.logout();

  raise notice '[0029] shared_recipe_photo_path + bucket privé + politiques storage : OK';
end $$;

rollback;
