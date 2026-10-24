-- Tests 0024 — l'inscription ne peut pas choisir son rôle ; le nom est toujours repris des métadonnées. Transaction annulée.
begin;

do $$
declare
  a constant uuid := '00000000-0000-0000-0000-0000000024a1';
  b constant uuid := '00000000-0000-0000-0000-0000000024a2';
  c constant uuid := '00000000-0000-0000-0000-0000000024a3';
begin
  -- inscription avec role=admin dans les métadonnées fournies par le client : rôle 'user'
  insert into auth.users (id, email, raw_user_meta_data) values (a, 'pirate-24@test.local', '{"role":"admin","name":"Pirate"}');
  assert (select role from public.profiles where id = a) = 'user', '0024 : role=admin dans les métadonnées doit donner user';
  assert (select name from public.profiles where id = a) = 'Pirate', '0024 : le nom est repris des métadonnées';
  -- métadonnées exotiques
  insert into auth.users (id, email, raw_user_meta_data) values (b, 'autre-24@test.local', '{"role":"support"}');
  assert (select role from public.profiles where id = b) = 'user', '0024 : un rôle inconnu donne user';
  assert (select name from public.profiles where id = b) = 'autre-24@test.local', '0024 : sans nom, repli sur l''e-mail';
  insert into auth.users (id, email, raw_user_meta_data) values (c, 'vide-24@test.local', null);
  assert (select role from public.profiles where id = c) = 'user', '0024 : métadonnées nulles : user';
  assert position('raw_user_meta_data->>''role''' in pg_get_functiondef('public.handle_new_user'::regproc)) = 0, '0024 : la fonction ne lit pas le rôle';
end $$;

rollback;
do $$ begin raise notice '[test_0024] OK'; end $$;
