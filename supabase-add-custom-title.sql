-- Ajouter la colonne custom_title à la table planning
-- Cette colonne permet de stocker le titre des repas personnalisés (sans recette)

ALTER TABLE planning 
ADD COLUMN custom_title TEXT;

-- Modifier la contrainte NOT NULL sur recipe_id pour permettre les repas personnalisés
ALTER TABLE planning 
ALTER COLUMN recipe_id DROP NOT NULL;

-- Ajouter un commentaire pour expliquer l'usage
COMMENT ON COLUMN planning.custom_title IS 'Titre personnalisé pour les repas sans recette (ex: Restaurant, Pizza, etc.)';
COMMENT ON COLUMN planning.recipe_id IS 'ID de la recette (peut être NULL pour les repas personnalisés)';

-- Vérifier que la colonne a été ajoutée et la contrainte modifiée
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'planning' 
AND column_name IN ('custom_title', 'recipe_id');
