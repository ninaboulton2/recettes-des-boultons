-- ============================================================================
--  0018 (v2/) — Table des PARAMÈTRES du remplissage (à exécuter AVANT 0018)
-- ============================================================================
--  Crée la table `private.v2_fill_params` (clé / valeur), vide. Le remplissage
--  v2/0018_v2_data_fill.sql la lit : les e-mails et pseudonymes des comptes ne
--  sont JAMAIS écrits dans un fichier du dépôt, Nina les saisit le jour J
--  (voir supabase/BASCULE_V2.md, étape 3) :
--
--    insert into private.v2_fill_params (key, value) values
--      ('owner_email',                      'adresse-de-nina@exemple.fr'),   -- facultatif (voir ci-dessous)
--      ('display_name:adresse-de-nina@exemple.fr',  'Nina'),                 -- un par compte, e-mail EN MINUSCULES
--      ('display_name:adresse-2@exemple.fr',        'Pseudo 2'),
--      ('display_name:adresse-3@exemple.fr',        'Pseudo 3')
--    on conflict (key) do update set value = excluded.value;
--
--  Clés reconnues (toute autre est refusée par 0018) :
--    owner_email                  compte propriétaire des recettes et créateur du groupe.
--                                 Absent : le compte « admin » le plus ancien (arrêt s'il y a
--                                 égalité). Nina vérifie le NOTICE de 0018.
--    group_name                   nom du groupe (défaut : Les Boultons)
--    display_name:<e-mail>        pseudonyme affiché aux autres (OBLIGATOIRE pour chaque
--                                 compte qui n'en a pas encore ; pas d'e-mail, pas de « @ »)
--    cookbook_title:<e-mail>      titre du carnet (facultatif ; sinon laissé vide)
--
--  Table fermée à l'API (RLS sans politique, aucun droit pour anon / authenticated).
--  À supprimer en fin de bascule : drop table private.v2_fill_params;
--  Idempotente (rejouable : ne touche pas aux lignes déjà saisies).
-- ============================================================================

begin;

create schema if not exists private;

create table if not exists private.v2_fill_params (
  key   text primary key check (key = lower(btrim(key)) and key <> ''),
  value text not null check (btrim(value) <> '')
);
comment on table private.v2_fill_params is
  'Paramètres du remplissage v2/0018 (e-mails, pseudonymes) saisis le jour de la bascule. À supprimer ensuite.';
alter table private.v2_fill_params enable row level security;
revoke all on private.v2_fill_params from public, anon, authenticated;

do $$
begin
  assert to_regclass('private.v2_fill_params') is not null, '[0018 params] table absente';
  raise notice '[0018 params] table private.v2_fill_params prête (% ligne(s)) : renseigner les paramètres puis exécuter 0018_v2_data_fill.sql',
    (select count(*) from private.v2_fill_params);
end $$;

commit;
