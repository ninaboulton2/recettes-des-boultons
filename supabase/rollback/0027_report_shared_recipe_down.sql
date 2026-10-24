-- Retour arrière de 0027 : supprime report_shared_recipe. Aucune donnée n'est touchée (les signalements déjà enregistrés restent).
-- Le bouton « Signaler » de la page publique /r/<jeton> (phase 6E) échoue : retirer d'abord le code v2. Rejouable.
begin;
drop function if exists public.report_shared_recipe(uuid, text, text);
notify pgrst, 'reload schema';
commit;
