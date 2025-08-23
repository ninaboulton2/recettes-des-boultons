-- Ajouter une table pour les notes du planning
-- Cette table permet de stocker les notes générales et par type de repas

CREATE TABLE IF NOT EXISTS planning_notes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID, -- Référence future vers auth.users(id)
  date_string TEXT NOT NULL, -- Format: '2024-01-15'
  note_type TEXT NOT NULL CHECK (note_type IN ('day', 'lunch', 'dinner')), -- Type de note
  content TEXT, -- Contenu de la note
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index pour les notes du planning
CREATE INDEX IF NOT EXISTS idx_planning_notes_user_date ON planning_notes(user_id, date_string);
CREATE INDEX IF NOT EXISTS idx_planning_notes_type ON planning_notes(note_type);

-- Contrainte unique : une seule note par type par jour par utilisateur
CREATE UNIQUE INDEX IF NOT EXISTS idx_planning_notes_user_date_type_unique 
ON planning_notes(user_id, date_string, note_type);

-- Activer RLS sur la table
ALTER TABLE planning_notes ENABLE ROW LEVEL SECURITY;

-- Politique pour permettre la lecture de toutes les notes (pour l'instant)
CREATE POLICY "Allow read access to all planning notes" ON planning_notes
  FOR SELECT USING (true);

-- Politique pour permettre l'insertion de notes (pour l'instant)
CREATE POLICY "Allow insert access to planning notes" ON planning_notes
  FOR INSERT WITH CHECK (true);

-- Politique pour permettre la mise à jour de toutes les notes (pour l'instant)
CREATE POLICY "Allow update access to planning notes" ON planning_notes
  FOR UPDATE USING (true);

-- Politique pour permettre la suppression de toutes les notes (pour l'instant)
CREATE POLICY "Allow delete access to planning notes" ON planning_notes
  FOR DELETE USING (true);

-- Ajouter un commentaire pour expliquer l'usage
COMMENT ON TABLE planning_notes IS 'Notes du planning (notes générales, notes pour déjeuner, notes pour dîner)';
COMMENT ON COLUMN planning_notes.note_type IS 'Type de note: day (note générale), lunch (note déjeuner), dinner (note dîner)';

-- Vérifier que la table a été créée
SELECT table_name, column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'planning_notes'
ORDER BY ordinal_position;
