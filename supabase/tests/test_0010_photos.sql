-- Tests 0010 : photo_path, bucket recipe-photos, politiques storage.objects
begin;

do $$
declare
  admin_id constant uuid := '00000000-0000-0000-0000-00000000000a';
  user_id  constant uuid := '00000000-0000-0000-0000-00000000000b';
  b record;
begin
  -- Sur la vraie stack Supabase, le trigger storage.protect_delete() interdit les
  -- DELETE SQL directs sur storage.objects sauf si ce paramètre vaut 'true'
  -- (sans effet sur le shim Postgres nu de run_local.sh).
  perform set_config('storage.allow_delete_query', 'true', true);

  select * into b from storage.buckets where id = 'recipe-photos';
  assert b.public and b.file_size_limit = 5242880, 'bucket';
  assert b.allowed_mime_types = array['image/jpeg','image/png','image/webp'], 'mime';

  -- Colonne
  update public.recipes set photo_path = '10000000-0000-0000-0000-000000000001/cover.webp' where id = '10000000-0000-0000-0000-000000000001';
  assert (select photo_path from public.search_recipes('yaourt')) like '%cover.webp';

  -- user : ne peut pas déposer
  perform tests.login(user_id, 'authenticated');
  begin
    insert into storage.objects (bucket_id, name, owner) values ('recipe-photos', 'u/x.jpg', user_id);
    raise exception 'user a pu écrire dans le bucket';
  exception when insufficient_privilege then null; end;
  perform tests.logout();

  -- admin : dépôt, mise à jour, suppression OK ; autre bucket refusé
  perform tests.login(admin_id, 'authenticated');
  insert into storage.objects (bucket_id, name, owner) values ('recipe-photos', 'r1/cover.webp', admin_id);
  update storage.objects set name = 'r1/cover2.webp' where bucket_id = 'recipe-photos' and name = 'r1/cover.webp';
  assert (select count(*) from storage.objects where bucket_id = 'recipe-photos') = 1;
  begin
    insert into storage.buckets (id, name) values ('autre', 'autre');     -- postgres superuser requis en vrai ; ici RLS bloque
    raise exception 'admin a créé un bucket';
  exception when insufficient_privilege then null; end;
  perform tests.logout();

  -- anon : lecture publique des objets du bucket
  perform tests.login(user_id, 'anon');
  assert (select count(*) from storage.objects where bucket_id = 'recipe-photos') = 1, 'lecture publique';
  -- un DELETE filtré par RLS ne lève pas d'erreur : il n'affecte aucune ligne
  delete from storage.objects where bucket_id = 'recipe-photos';
  assert (select count(*) from storage.objects where bucket_id = 'recipe-photos') = 1, 'anon a supprimé un objet';
  perform tests.logout();

  perform tests.login(admin_id, 'authenticated');
  delete from storage.objects where bucket_id = 'recipe-photos';
  assert (select count(*) from storage.objects where bucket_id = 'recipe-photos') = 0;
  perform tests.logout();

  raise notice '[test 0010] OK';
end $$;

rollback;
