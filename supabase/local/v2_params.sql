-- ============================================================================
--  Paramètres FACTICES du remplissage v2/0018, pour la base LOCALE seulement
-- ============================================================================
--  Équivalent local de ce que Nina saisit le jour de la bascule (BASCULE_V2.md, étape 3) :
--  propriétaire des recettes = admin@local.test, un pseudonyme par compte (dérivé de l'e-mail local,
--  unique, sans « @ »), un titre de carnet pour le propriétaire. Aucune donnée réelle.
--  Appelé par setup_v2.sh APRÈS v2/0018_params.sql (qui crée la table) et AVANT v2/0018_v2_data_fill.sql.
--  Idempotent (on conflict do update).
-- ============================================================================
insert into private.v2_fill_params (key, value)
values ('owner_email', 'admin@local.test'),
       ('group_name', 'Les Boultons'),
       ('cookbook_title:admin@local.test', 'Recettes de test')
on conflict (key) do update set value = excluded.value;

-- Les comptes créés APRÈS le remplissage (v2_accounts.sql) ne sont pas des « comptes concernés » : 0018 refuserait leurs paramètres.
delete from private.v2_fill_params where key in ('display_name:nouveau@local.test', 'display_name:ami@local.test');

-- Un pseudonyme par compte existant : « Admin », « Utilisateur », « Admin2 »… (premier mot de l'e-mail, majuscule initiale)
insert into private.v2_fill_params (key, value)
select 'display_name:' || lower(u.email),
       initcap(regexp_replace(split_part(u.email, '@', 1), '[^a-zA-Z0-9]+', '', 'g'))
         || case when row_number() over (partition by initcap(regexp_replace(split_part(u.email, '@', 1), '[^a-zA-Z0-9]+', '', 'g')) order by u.created_at, u.id) > 1
                 then row_number() over (partition by initcap(regexp_replace(split_part(u.email, '@', 1), '[^a-zA-Z0-9]+', '', 'g')) order by u.created_at, u.id)::text else '' end
  from auth.users u
  join public.profiles p on p.id = u.id
 where u.email is not null and p.display_name is null
   and u.email not in ('nouveau@local.test', 'ami@local.test')
on conflict (key) do nothing;
