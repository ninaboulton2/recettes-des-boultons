-- Script de configuration Supabase complet pour Recettes des Boultons

-- ========================================
-- 1. TABLE DES RECETTES
-- ========================================

CREATE TABLE IF NOT EXISTS recipes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL,
  ingredients JSONB NOT NULL,
  instructions JSONB NOT NULL,
  prep_time INTEGER,
  cook_time INTEGER,
  servings INTEGER,
  image TEXT,
  tags TEXT[] DEFAULT '{}',
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index pour les recettes
CREATE INDEX IF NOT EXISTS idx_recipes_category ON recipes(category);
CREATE INDEX IF NOT EXISTS idx_recipes_tags ON recipes USING GIN(tags);
CREATE INDEX IF NOT EXISTS idx_recipes_title ON recipes USING GIN(to_tsvector('french', title));

-- ========================================
-- 2. TABLE DES FAVORIS
-- ========================================

CREATE TABLE IF NOT EXISTS favorites (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID, -- Référence future vers auth.users(id)
  recipe_id UUID NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index pour les favoris
CREATE INDEX IF NOT EXISTS idx_favorites_user_id ON favorites(user_id);
CREATE INDEX IF NOT EXISTS idx_favorites_recipe_id ON favorites(recipe_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_favorites_user_recipe_unique ON favorites(user_id, recipe_id);

-- ========================================
-- 3. TABLE DU PLANNING HEBDOMADAIRE
-- ========================================

CREATE TABLE IF NOT EXISTS planning (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID, -- Référence future vers auth.users(id)
  date_string TEXT NOT NULL, -- Format: '2024-01-15'
  meal_type TEXT NOT NULL CHECK (meal_type IN ('lunch', 'dinner')),
  recipe_id UUID REFERENCES recipes(id) ON DELETE CASCADE, -- Peut être NULL pour les repas personnalisés
  custom_title TEXT, -- Titre personnalisé pour les repas sans recette
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index pour le planning
CREATE INDEX IF NOT EXISTS idx_planning_user_date ON planning(user_id, date_string);
CREATE INDEX IF NOT EXISTS idx_planning_meal_type ON planning(meal_type);
-- Contrainte unique modifiée pour permettre les repas personnalisés
-- Un utilisateur ne peut avoir qu'un seul repas du même type par jour
CREATE UNIQUE INDEX IF NOT EXISTS idx_planning_user_date_meal_type 
ON planning(user_id, date_string, meal_type);

-- ========================================
-- 4. TABLE DES LISTES DE COURSES
-- ========================================

CREATE TABLE IF NOT EXISTS shopping_lists (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID, -- Référence future vers auth.users(id)
  name TEXT NOT NULL DEFAULT 'Liste principale',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index pour les listes de courses
CREATE INDEX IF NOT EXISTS idx_shopping_lists_user ON shopping_lists(user_id);

-- ========================================
-- 5. TABLE DES ARTICLES DE COURSES
-- ========================================

CREATE TABLE IF NOT EXISTS shopping_items (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  list_id UUID NOT NULL REFERENCES shopping_lists(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  amount TEXT,
  unit TEXT,
  recipe_id UUID REFERENCES recipes(id) ON DELETE SET NULL,
  is_checked BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index pour les articles de courses
CREATE INDEX IF NOT EXISTS idx_shopping_items_list ON shopping_items(list_id);
CREATE INDEX IF NOT EXISTS idx_shopping_items_recipe ON shopping_items(recipe_id);

-- ========================================
-- SÉCURITÉ ET POLITIQUES
-- ========================================

-- Activer Row Level Security (RLS) sur toutes les tables
ALTER TABLE recipes ENABLE ROW LEVEL SECURITY;
ALTER TABLE favorites ENABLE ROW LEVEL SECURITY;
ALTER TABLE planning ENABLE ROW LEVEL SECURITY;
ALTER TABLE shopping_lists ENABLE ROW LEVEL SECURITY;
ALTER TABLE shopping_items ENABLE ROW LEVEL SECURITY;

-- Politiques pour les recettes
CREATE POLICY "Allow public read access" ON recipes FOR SELECT USING (true);
CREATE POLICY "Allow public insert" ON recipes FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update" ON recipes FOR UPDATE USING (true);
CREATE POLICY "Allow public delete" ON recipes FOR DELETE USING (true);

-- Politiques pour les favoris
CREATE POLICY "Allow public favorites access" ON favorites FOR ALL USING (true);

-- Politiques pour le planning
CREATE POLICY "Allow public planning access" ON planning FOR ALL USING (true);

-- Politiques pour les listes de courses
CREATE POLICY "Allow public shopping access" ON shopping_lists FOR ALL USING (true);

-- Politiques pour les articles de courses
CREATE POLICY "Allow public items access" ON shopping_items FOR ALL USING (true);

-- ========================================
-- FONCTIONS ET TRIGGERS
-- ========================================

-- Fonction pour mettre à jour automatiquement updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Triggers pour toutes les tables
CREATE TRIGGER update_recipes_updated_at
  BEFORE UPDATE ON recipes
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_favorites_updated_at
  BEFORE UPDATE ON favorites
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_planning_updated_at
  BEFORE UPDATE ON planning
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_shopping_lists_updated_at
  BEFORE UPDATE ON shopping_lists
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_shopping_items_updated_at
  BEFORE UPDATE ON shopping_items
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ========================================
-- DONNÉES D'EXEMPLE
-- ========================================

-- Insérer une liste de courses par défaut
INSERT INTO shopping_lists (name) VALUES ('Liste principale')
ON CONFLICT DO NOTHING;

-- Insérer quelques recettes d'exemple
INSERT INTO recipes (title, description, category, ingredients, instructions, prep_time, cook_time, servings, tags) VALUES
(
  'Cookies healthy : sans beurre sans œuf',
  'Une recette de cookies healthy : sans beurre, sans lactose, sans sucre raffiné. Croustillants au possible, ils font complètement oublier les cookies classiques.',
  'desserts et gâteaux',
  '[
    {"name": "farine d''épeautre complète T110", "amount": 200, "unit": "g"},
    {"name": "sucre de canne complet", "amount": 100, "unit": "g"},
    {"name": "lait d''amande", "amount": 100, "unit": "ml"},
    {"name": "huile de coco", "amount": 80, "unit": "ml"},
    {"name": "pépites de chocolat", "amount": 100, "unit": "g"},
    {"name": "noisettes concassées", "amount": 50, "unit": "g"},
    {"name": "raisins secs", "amount": 50, "unit": "g"},
    {"name": "levure chimique", "amount": 1, "unit": "càc"},
    {"name": "sel", "amount": 1, "unit": "pincée"}
  ]',
  '[
    "Préchauffer le four à 180°C.",
    "Mettre tous les ingrédients dans un saladier et bien mélanger jusqu''à l''obtention d''une pâte homogène.",
    "Former des boules de pâte et les disposer sur une plaque recouverte de papier sulfurisé en les espaçant un peu.",
    "Enfourner pour 10-12 minutes puis laisser refroidir sur une grille."
  ]',
  10,
  10,
  10,
  ARRAY['végétarien', 'vegan']
)
ON CONFLICT DO NOTHING;

-- ========================================
-- VÉRIFICATION FINALE
-- ========================================

-- Afficher un résumé des tables créées
SELECT 
  table_name,
  (SELECT COUNT(*) FROM information_schema.columns WHERE table_name = t.table_name) as columns_count
FROM information_schema.tables t
WHERE table_name IN ('recipes', 'favorites', 'planning', 'shopping_lists', 'shopping_items')
ORDER BY table_name;

-- Afficher les contraintes de clés étrangères
SELECT 
  tc.table_name, 
  kcu.column_name, 
  ccu.table_name AS foreign_table_name,
  ccu.column_name AS foreign_column_name 
FROM 
  information_schema.table_constraints AS tc 
  JOIN information_schema.key_column_usage AS kcu
    ON tc.constraint_name = kcu.constraint_name
    AND tc.table_schema = kcu.table_schema
  JOIN information_schema.constraint_column_usage AS ccu
    ON ccu.constraint_name = tc.constraint_name
    AND ccu.table_schema = tc.table_schema
WHERE tc.constraint_type = 'FOREIGN KEY' 
  AND tc.table_name IN ('favorites', 'planning', 'shopping_items')
ORDER BY tc.table_name;
