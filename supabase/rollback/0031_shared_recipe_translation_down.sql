-- Retour arrière de 0031 : retire les deux fonctions réservées au serveur. Aucune donnée touchée (les traductions déjà écrites restent).
-- Le code v2 qui les appelle doit être retiré (ou ne plus traduire à la demande) avant. Rejouable.
begin;

drop function if exists public.save_recipe_translation_server(uuid, text, jsonb);
drop function if exists public.shared_recipe_id(uuid);

do $$
begin
  assert to_regprocedure('public.save_recipe_translation_server(uuid, text, jsonb)') is null, '[0031 down] save_recipe_translation_server restante';
  assert to_regprocedure('public.shared_recipe_id(uuid)') is null, '[0031 down] shared_recipe_id restante';
  raise notice '[0031 down] fonctions de traduction à la demande retirées';
end $$;

notify pgrst, 'reload schema';
commit;
