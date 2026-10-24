-- Remplissage SIMULÉ d'owner_id (le vrai est la migration 0018, phase 4) : toutes les recettes de
-- seed_test.sql au compte admin a, avant d'appliquer la bascule v2/0020. Tests locaux uniquement.
update public.recipes set owner_id = '00000000-0000-0000-0000-00000000000a' where owner_id is null;
