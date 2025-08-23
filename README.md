# Recettes des Boultons

Application de gestion de recettes avec planification de repas et listes de courses.

## 🚀 Démarrage Rapide

```bash
npm install
npm run dev
```

L'application sera accessible sur `http://localhost:3001`

## 🔧 Configuration

### Variables d'Environnement Requises

```bash
# Configuration Supabase (obligatoire)
SUPABASE_URL=https://votre-projet.supabase.co
SUPABASE_API_KEY=votre_cle_anonyme_supabase

# Configuration OpenAI (pour le traducteur IA)
OPENAI_API_KEY=sk-your_openai_api_key_here

# Configuration d'authentification (optionnel en développement)
ADMIN_USERNAME=admin
ADMIN_PASSWORD=password123
JWT_SECRET=your_jwt_secret_here
```

## 🏗️ Architecture Technique

### **Frontend**
- **Nuxt.js 3** : Framework Vue.js moderne avec SSR
- **Vue 3** : Composition API et réactivité avancée
- **Tailwind CSS** : Framework CSS utilitaire
- **Pinia** : Gestion d'état moderne et performante

### **Backend**
- **API Nuxt** : Endpoints REST intégrés
- **JWT** : Authentification sécurisée
- **bcrypt** : Hashage des mots de passe
- **Middleware** : Sécurité et validation

### **Base de Données**
- **Supabase** : Base de données PostgreSQL avec authentification
- **Row Level Security** : Sécurité au niveau des lignes
- **API REST** : Interface de programmation standardisée

### **Sécurité**
- **Headers de sécurité** : Protection contre les attaques courantes
- **Validation des données** : Sanitisation des entrées
- **Rate limiting** : Protection contre les abus
- **CORS configuré** : Contrôle des origines

## 📁 Structure du Projet

```
recettes-des-boultons/
├── components/           # Composants Vue réutilisables
│   ├── RecipeCard.vue   # Carte d'affichage des recettes
│   ├── RecipeEditor.vue # Éditeur de recettes
│   ├── RecipeTranslator.vue # Traducteur IA
│   └── ...
├── pages/               # Pages de l'application
│   ├── index.vue        # Page d'accueil
│   ├── recettes/        # Gestion des recettes
│   ├── courses/         # Listes de courses
│   ├── planning/        # Planning hebdomadaire
│   └── traducteur/      # Traducteur IA
├── stores/              # Gestion d'état Pinia
│   ├── recipes.ts       # Store des recettes
│   ├── shopping.ts      # Store des courses
│   ├── planning.ts      # Store du planning
│   └── auth.ts          # Store d'authentification
├── server/api/          # API backend
│   ├── auth/            # Endpoints d'authentification
│   ├── add-recipe.post.ts
│   ├── translate-recipe.post.ts
│   └── ...
├── i18n/                # Internationalisation
│   └── locales/         # Fichiers de traduction
├── utils/               # Utilitaires
│   ├── supabase.ts      # Client Supabase
│   ├── config.ts        # Configuration
│   └── auth.ts          # Authentification
└── public/              # Fichiers publics
    └── images/          # Images des recettes
```

## 🗄️ Base de Données

### Tables Supabase
- **recipes** : Recettes avec ingrédients et instructions
- **favorites** : Recettes favorites des utilisateurs
- **planning** : Planning hebdomadaire des repas
- **shopping_lists** : Listes de courses
- **shopping_items** : Articles des listes de courses

### Schéma Principal
```sql
-- Table des recettes
CREATE TABLE recipes (
  id UUID PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL,
  ingredients JSONB NOT NULL,
  instructions JSONB NOT NULL,
  prep_time INTEGER,
  cook_time INTEGER,
  servings INTEGER,
  image TEXT,
  tags TEXT[],
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

## 🌐 Déploiement

### Vercel
- Configuration automatique via `vercel.json`
- Variables d'environnement dans l'interface Vercel
- Build automatique à chaque push

### Variables de Production
```bash
SUPABASE_URL=https://votre-projet.supabase.co
SUPABASE_API_KEY=votre_cle_anonyme_supabase
OPENAI_API_KEY=sk-your_production_key
NODE_ENV=production
```

## 📱 Fonctionnalités

- **Gestion des recettes** : CRUD complet avec images
- **Planification** : Planning hebdomadaire des repas
- **Listes de courses** : Gestion des courses avec consolidation
- **Traducteur IA** : Conversion automatique via OpenAI
- **Authentification** : Système JWT sécurisé
- **Internationalisation** : Support FR/EN
- **Responsive** : Design adaptatif mobile/desktop

## 🔍 Développement

### Scripts Disponibles
```bash
npm run dev          # Développement local
npm run build        # Build de production
npm run start        # Démarrage production
npm run generate     # Génération statique
```

### Tests
```bash
# Test de connexion Supabase
node scripts/test-supabase.js

# Test de structure des tables
node scripts/test-tables-structure.js

# Test des APIs
node scripts/test-apis.js
```

## 📚 Documentation

- **SUPABASE_SETUP.md** : Configuration complète de Supabase
- **DEVELOPER.md** : Guide technique pour développeurs 