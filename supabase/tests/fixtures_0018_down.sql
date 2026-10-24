-- Retire fixtures_0018.sql (remet le seed d'origine pour les tests suivants).
set search_path = public, extensions;
delete from public.favorites
 where (user_id, recipe_id) in (('00000000-0000-0000-0000-00000000000c', '10000000-0000-0000-0000-000000000002'),
                                ('00000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-000000000001'),
                                ('00000000-0000-0000-0000-00000000000c', '10000000-0000-0000-0000-000000000007'));
delete from public.recipes where id = '10000000-0000-0000-0000-000000000007';
do $$ begin perform set_config('request.jwt.claims', '{"role":"service_role","user_role":"admin"}', false); end $$;
update public.profiles set role = 'user' where id = '00000000-0000-0000-0000-00000000000b';
do $$ begin perform set_config('request.jwt.claims', '', false); end $$;
drop table if exists tests.snap_0018_counts;
drop table if exists tests.snap_0018_updated;
