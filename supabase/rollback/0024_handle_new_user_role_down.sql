-- Retour arrière de 0024 : NE PAS appliquer (réouvre la faille d'auto-attribution du rôle admin).
-- Conservé pour mémoire : l'ancienne version lisait coalesce(new.raw_user_meta_data->>'role', 'user').
select 1;
