# Guide Technique - Recettes des Boultons

## Architecture

### **Stack Technique**
- **Frontend** : Nuxt.js 3 + Vue 3 + Tailwind CSS
- **Backend** : API Nuxt + JWT + bcrypt
- **Base de données** : Supabase (PostgreSQL)
- **État** : Pinia stores
- **Authentification** : JWT avec cookies sécurisés

### **Structure des Stores**
```typescript
// stores/recipes.ts - Gestion des recettes
interface Recipe {
  id: string
  title: string
  description: string
  category: string
  ingredients: Ingredient[]
  instructions: string[]
  prepTime: number
  cookTime?: number
  servings: number
  image?: string
  tags: string[]
  notes?: string
  createdAt: string
  updatedAt: string
}

// stores/shopping.ts - Gestion des courses
interface ShoppingList {
  id: string
  name: string
  items: ShoppingItem[]
  createdAt: string
  updatedAt: string
}

// stores/planning.ts - Gestion du planning
interface PlanningMeal {
  id: string
  dateString: string
  mealType: 'lunch' | 'dinner'
  recipeId?: string
  customTitle?: string
}
```

## Authentification

### **Système JWT**
```typescript
// utils/auth.ts
export const generateToken = (payload: any): string => {
  const jwtSecret = process.env.JWT_SECRET || 'default-secret-key'
  const jwtExpiresIn = process.env.JWT_EXPIRES_IN || '24h'
  
  return jwt.sign(payload, jwtSecret, { 
    expiresIn: jwtExpiresIn,
    issuer: 'les-boultons-app',
    audience: 'les-boultons-users'
  })
}

export const verifyToken = (token: string): any => {
  try {
    const jwtSecret = process.env.JWT_SECRET || 'default-secret-key'
    return jwt.verify(token, jwtSecret, {
      issuer: 'les-boultons-app',
      audience: 'les-boultons-users'
    })
  } catch (error) {
    return null
  }
}
```

### **Middleware d'Authentification**
```typescript
// middleware/auth.ts
export default defineNuxtRouteMiddleware((to) => {
  const { $auth } = useNuxtApp()
  
  if (!$auth.isAuthenticated) {
    return navigateTo('/login')
  }
})
```

## Base de Données Supabase

### **Tables Principales**
```sql
-- Table des recettes
CREATE TABLE recipes (
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

-- Table des favoris
CREATE TABLE favorites (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID,
  recipe_id UUID NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Table du planning
CREATE TABLE planning (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID,
  date_string TEXT NOT NULL,
  meal_type TEXT NOT NULL CHECK (meal_type IN ('lunch', 'dinner')),
  recipe_id UUID REFERENCES recipes(id) ON DELETE CASCADE,
  custom_title TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

### **Politiques de Sécurité (RLS)**
```sql
-- Activer RLS sur toutes les tables
ALTER TABLE recipes ENABLE ROW LEVEL SECURITY;
ALTER TABLE favorites ENABLE ROW LEVEL SECURITY;
ALTER TABLE planning ENABLE ROW LEVEL SECURITY;

-- Politiques publiques (à ajuster selon vos besoins)
CREATE POLICY "Allow public read access" ON recipes FOR SELECT USING (true);
CREATE POLICY "Allow public insert" ON recipes FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update" ON recipes FOR UPDATE USING (true);
CREATE POLICY "Allow public delete" ON recipes FOR DELETE USING (true);
```

## 🌐 API Endpoints

### **Recettes**
```typescript
// GET /api/recipes - Récupérer toutes les recettes
// POST /api/add-recipe - Ajouter une recette
// PUT /api/update-recipe - Modifier une recette
// DELETE /api/delete-recipe - Supprimer une recette
```

### **Favoris**
```typescript
// GET /api/favorites - Récupérer les favoris
// POST /api/favorites - Ajouter un favori
// DELETE /api/favorites - Supprimer un favori
```

### **Planning**
```typescript
// GET /api/planning - Récupérer le planning
// POST /api/planning - Ajouter un repas
// DELETE /api/planning/:id - Supprimer un repas
```

### **Listes de Courses**
```typescript
// GET /api/shopping-lists - Récupérer les listes
// POST /api/shopping-lists - Créer une liste
// PUT /api/shopping-lists/:id - Modifier une liste
// DELETE /api/shopping-lists/:id - Supprimer une liste
```

### **RecipeCard.vue**
```vue
<template>
  <div class="recipe-card">
    <img :src="recipe.image || '/images/default-recipe.png'" :alt="recipe.title">
    <div class="recipe-info">
      <h3>{{ recipe.title }}</h3>
      <p>{{ recipe.description }}</p>
      <div class="recipe-meta">
        <span>{{ recipe.prepTime }} min</span>
        <span>{{ recipe.servings }} portions</span>
      </div>
    </div>
  </div>
</template>

<script setup>
interface Props {
  recipe: Recipe
}

defineProps<Props>()
</script>
```



## Internationalisation

### **Configuration i18n**
```typescript
// nuxt.config.ts
export default defineNuxtConfig({
  modules: ['@nuxtjs/i18n'],
  i18n: {
    locales: [
      { code: 'fr', iso: 'fr-FR', name: 'Français' },
      { code: 'en', iso: 'en-US', name: 'English' }
    ],
    defaultLocale: 'fr',
    strategy: 'prefix_except_default'
  }
})
```

## Tests

### **Scripts de Test Disponibles**
```bash
# Test de connexion Supabase
node scripts/test-supabase.js

# Test de structure des tables
node scripts/test-tables-structure.js

# Test des APIs
node scripts/test-apis.js

# Test d'intégration shopping
node scripts/test-shopping-integration.js
```

## Déploiement

### **Variables d'Environnement**
```bash
# Supabase (obligatoire)
SUPABASE_URL=
SUPABASE_API_KEY=

# OpenAI (pour le traducteur IA)
OPENAI_API_KEY=

# Authentification
ADMIN_USERNAME=
ADMIN_PASSWORD=
JWT_SECRET=

# Production
NODE_ENV=production
```

### **Build et Déploiement**
```bash
# Build de production
npm run build

# Démarrage en production
npm run start

# Déploiement Vercel (automatique)
git push origin main
```