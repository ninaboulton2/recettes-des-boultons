-- Annule fill_simulated.sql (remet owner_id à NULL partout) une fois la bascule retirée.
update public.recipes set owner_id = null;
