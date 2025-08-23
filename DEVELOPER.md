# Guide Technique - Recettes des Boultons

## 🏗️ Architecture

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

## 🔐 Authentification

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

## 🗄️ Base de Données Supabase

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

## 🎨 Composants Vue

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

### **RecipeEditor.vue**
```vue
<template>
  <form @submit.prevent="saveRecipe">
    <input v-model="recipe.title" placeholder="Titre de la recette" required>
    <textarea v-model="recipe.description" placeholder="Description"></textarea>
    <select v-model="recipe.category" required>
      <option v-for="cat in categories" :key="cat" :value="cat">
        {{ $t(`categories.${cat}`) }}
      </option>
    </select>
    <!-- Autres champs... -->
  </form>
</template>
```

## 🌍 Internationalisation

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

### **Fichiers de Traduction**
```json
// i18n/locales/fr.json
{
  "categories": {
    "soupes": "Soupes",
    "entrees": "Entrées",
    "plats": "Plats",
    "desserts": "Desserts"
  },
  "common": {
    "save": "Sauvegarder",
    "cancel": "Annuler",
    "delete": "Supprimer"
  }
}
```

## 🧪 Tests

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

### **Tests d'API**
```typescript
// Test d'ajout de recette
const response = await fetch('/api/add-recipe', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    title: 'Test Recipe',
    category: 'desserts',
    ingredients: [{ name: 'Farine', amount: 200, unit: 'g' }],
    instructions: ['Étape 1', 'Étape 2'],
    prepTime: 15,
    servings: 4
  })
})

const data = await response.json()
console.log('Recipe added:', data.success)
```

## 🚀 Déploiement

### **Variables d'Environnement**
```bash
# Supabase (obligatoire)
SUPABASE_URL=https://votre-projet.supabase.co
SUPABASE_API_KEY=votre_cle_anonyme_supabase

# OpenAI (pour le traducteur IA)
OPENAI_API_KEY=sk-your_production_key

# Authentification
ADMIN_USERNAME=admin
ADMIN_PASSWORD=secure_password
JWT_SECRET=your_64_char_secret

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

## 🔧 Configuration

### **Nuxt Config**
```typescript
// nuxt.config.ts
export default defineNuxtConfig({
  modules: [
    '@nuxtjs/tailwindcss',
    '@nuxtjs/i18n',
    '@pinia/nuxt'
  ],
  runtimeConfig: {
    jwtSecret: process.env.JWT_SECRET,
    openaiApiKey: process.env.OPENAI_API_KEY
  },
  nitro: {
    preset: 'vercel'
  }
})
```

### **Tailwind CSS**
```javascript
// tailwind.config.js
module.exports = {
  content: [
    './components/**/*.{js,vue,ts}',
    './layouts/**/*.vue',
    './pages/**/*.vue',
    './plugins/**/*.{js,ts}',
    './nuxt.config.{js,ts}'
  ],
  theme: {
    extend: {
      fontFamily: {
        'lobster': ['Lobster', 'cursive'],
        'poppins': ['Poppins', 'sans-serif']
      }
    }
  }
}
```

## 🌍 Internationalisation

### **Breakpoints Tailwind**
```vue
<template>
  <!-- Mobile first approach -->
  <div class="w-full md:w-1/2 lg:w-1/3">
    <h1 class="text-lg md:text-xl lg:text-2xl">Titre</h1>
    <p class="text-sm md:text-base">Contenu</p>
  </div>
</template>
```

### **Classes Responsives Utiles**
- `hidden md:block` : Cacher sur mobile, afficher sur desktop
- `grid-cols-1 md:grid-cols-2 lg:grid-cols-3` : Grille responsive
- `p-4 md:p-6 lg:p-8` : Padding responsive
- `text-center md:text-left` : Alignement responsive

## 🔍 Debug et Performance

### **Vue DevTools**
- Inspection des composants et de l'état
- Debug des stores Pinia
- Timeline des événements

### **Nuxt DevTools**
- Accessibles sur `/__nuxt_devtools__`
- Inspection des modules
- Analyse des performances
- Debug de la configuration

### **Console et Logs**
```typescript
// Logs de développement
console.log('Recipe loaded:', recipe)

// Logs d'erreur
console.error('API error:', error)

// Logs de performance
console.time('recipe-loading')
// ... code ...
console.timeEnd('recipe-loading')
```
