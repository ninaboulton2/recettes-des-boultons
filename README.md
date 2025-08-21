# 🍳 Recettes des Boultons - Application Web Complète

Une application web moderne et complète de gestion de recettes familiales, construite avec **Nuxt.js 3**, **Vue 3** et **Tailwind CSS**. Cette application permet de gérer vos recettes, planifier vos repas, organiser vos courses et bien plus encore !

## ✨ Fonctionnalités Principales

### 🍽️ **Gestion des Recettes**
- **CRUD complet** : Créer, lire, modifier et supprimer des recettes
- **Catégorisation** : 9 catégories organisées (soupes, entrées, plats, poissons, viandes, yaourts/fromages, desserts, boissons, confitures)
- **Système de tags** : Végétarien, vegan et tags personnalisés
- **Recherche avancée** : Par titre, description, ingrédients ou tags
- **Filtrage intelligent** : Par catégorie et tags
- **Système de favoris** : Marquer et retrouver vos recettes préférées

### 🛒 **Listes de Courses**
- **Gestion dynamique** : Créer, modifier et supprimer des listes
- **Génération automatique** : À partir des recettes sélectionnées
- **Interface intuitive** : Ajout/suppression d'articles en temps réel
- **Persistance locale** : Sauvegarde automatique dans le navigateur
- **Impression** : Export PDF pour vos courses

### 📅 **Planning Hebdomadaire**
- **Vue semaine** : Organisation claire par jour et par repas
- **Drag & Drop** : Réorganiser facilement vos repas
- **Gestion des repas** : Déjeuners et dîners séparés
- **Navigation temporelle** : Avancer/reculer dans les semaines
- **Impression** : Export du planning pour l'affichage

### 🤖 **Traducteur IA**
- **Intégration OpenAI** : Conversion automatique de recettes
- **Support Google Drive** : Collez directement vos recettes depuis Drive
- **Structuration automatique** : Extraction intelligente des ingrédients et instructions
- **Ajout immédiat** : Intégration directe dans votre collection
- **Gestion des erreurs** : Validation et correction automatique

### 🔐 **Système d'Authentification**
- **Sécurité JWT** : Authentification sécurisée avec tokens
- **Gestion des sessions** : Connexion/déconnexion sécurisée
- **Actions admin** : Édition et suppression des recettes
- **Protection des routes** : Accès restreint aux fonctionnalités sensibles

### 🌍 **Internationalisation**
- **Français/Anglais** : Interface bilingue complète
- **Détection automatique** : Langue du navigateur
- **Switcher intégré** : Changement de langue en un clic
- **Traductions complètes** : Tous les textes et interfaces

### 📱 **Interface Moderne**
- **Design responsive** : Optimisé pour tous les écrans
- **Tailwind CSS** : Interface moderne et élégante
- **Animations fluides** : Transitions et interactions agréables
- **Thème clair** : Interface claire et lisible
- **Navigation intuitive** : Menu et structure logiques

## 🚀 Démarrage Rapide

### Prérequis
- **Node.js** 18+ 
- **npm** 8+
- **Clé API OpenAI** (pour le traducteur IA)

### Installation

```bash
# Cloner le projet
git clone [votre-repo]
cd boultons-shopping-list

# Installer les dépendances
npm install

# Copier la configuration d'environnement
cp env.example .env

# Éditer le fichier .env avec vos clés API
nano .env

# Lancer l'application
npm run dev
```

L'application sera accessible sur `http://localhost:3001`

### Configuration des Variables d'Environnement

Créez un fichier `.env` à la racine du projet :

```bash
# Configuration OpenAI (obligatoire pour le traducteur IA)
OPENAI_API_KEY=sk-your_openai_api_key_here

# Configuration d'authentification (optionnel en développement)
ADMIN_USERNAME=admin
ADMIN_PASSWORD=password123
JWT_SECRET=your_jwt_secret_here

# Configuration de l'API
API_BASE=http://localhost:3001
NODE_ENV=development
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

### **Stockage**
- **JSON Files** : Base de données simple et portable
- **Local Storage** : Persistance côté client
- **Cookies sécurisés** : Sessions et préférences

### **Sécurité**
- **Headers de sécurité** : Protection contre les attaques courantes
- **Validation des données** : Sanitisation des entrées
- **Rate limiting** : Protection contre les abus
- **CORS configuré** : Contrôle des origines

## 📁 Structure du Projet

```
boultons-shopping-list/
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
├── assets/              # Ressources statiques
│   └── css/             # Styles CSS
└── public/              # Fichiers publics
    ├── data/            # Base de données JSON
    └── images/          # Images des recettes
```

## 🎯 Utilisation

### **Ajouter une Recette**

1. **Via l'interface** : Utilisez l'éditeur intégré
2. **Via le traducteur IA** : Collez votre recette depuis Google Drive
3. **Via l'API** : Endpoint POST `/api/add-recipe`

### **Gérer vos Courses**

1. **Créer une liste** : Nom personnalisé et articles
2. **Ajouter des ingrédients** : Manuellement ou depuis les recettes
3. **Organiser** : Réorganiser, modifier, supprimer
4. **Imprimer** : Export PDF pour vos courses

### **Planifier vos Repas**

1. **Sélectionner une semaine** : Navigation temporelle
2. **Ajouter des recettes** : Drag & drop depuis votre collection
3. **Organiser** : Déjeuners et dîners séparés
4. **Imprimer** : Planning complet de la semaine

### **Utiliser le Traducteur IA**

1. **Accéder** : Page `/traducteur`
2. **Coller** : Votre recette depuis Google Drive
3. **Traduire** : L'IA structure automatiquement
4. **Ajouter** : Intégration immédiate dans votre collection

## 🔧 Développement

### **Scripts Disponibles**

```bash
# Développement
npm run dev          # Serveur de développement (port 3001)

# Production
npm run build        # Build de production
npm run start        # Démarrer en production
npm run generate     # Génération statique
```

### **Ajouter une Nouvelle Catégorie**

1. Modifier `stores/recipes.ts` dans `recipesByCategory`
2. Ajouter la catégorie dans l'objet `grouped`
3. Mettre à jour les traductions dans `i18n/locales/`

### **Modifier l'Interface**

- **Composants** : `components/`
- **Pages** : `pages/`
- **Styles** : `assets/css/main.css`
- **Configuration Tailwind** : `tailwind.config.js`

## 🚀 Déploiement

### **Build de Production**

```bash
# Construire l'application
npm run build

# Démarrer en production
npm run start
```

### **Variables d'Environnement en Production**

```bash
NODE_ENV=production
OPENAI_API_KEY=your_production_key
ADMIN_USERNAME=your_admin_username
ADMIN_PASSWORD=your_secure_password
JWT_SECRET=your_64_char_secret
API_BASE=https://votre-domaine.com
```

### **Hébergement Recommandé**

- **Vercel** : Déploiement automatique depuis Git
- **Netlify** : Déploiement statique optimisé
- **Railway** : Déploiement full-stack
- **VPS** : Contrôle total avec PM2

## 🤝 Contribution

### **Ajouter des Recettes**
1. Utilisez l'interface web ou le traducteur IA
2. Respectez la structure JSON des recettes
3. Ajoutez des images appropriées dans `public/images/`
4. Testez l'affichage dans l'application

### **Améliorer l'Interface**
1. Modifiez les composants Vue
2. Ajustez les styles Tailwind
3. Testez la responsivité
4. Vérifiez l'accessibilité

### **Étendre les Fonctionnalités**
1. Ajoutez de nouveaux stores Pinia
2. Créez de nouveaux composants
3. Étendez l'API backend
4. Mettez à jour les traductions

## 📊 Métriques et Performance

- **Temps de chargement** : < 2s sur connexion moyenne
- **Taille du bundle** : Optimisé avec tree-shaking
- **SEO** : Meta tags et structure sémantique
- **Accessibilité** : ARIA labels et navigation clavier
- **PWA Ready** : Service workers et cache

## 🔒 Sécurité

- **JWT sécurisé** : Tokens avec expiration
- **Validation des données** : Sanitisation des entrées
- **Headers de sécurité** : Protection contre les attaques
- **Rate limiting** : Protection contre les abus
- **CORS configuré** : Contrôle des origines

## 📱 Compatibilité

- **Navigateurs** : Chrome, Firefox, Safari, Edge (dernières versions)
- **Mobiles** : iOS Safari, Chrome Mobile, Samsung Internet
- **Tablettes** : iPad, Android tablets
- **Responsive** : Tous les écrans de 320px à 4K

## 🆘 Support et Dépannage

### **Problèmes Courants**

1. **Traducteur IA ne fonctionne pas** : Vérifiez votre clé OpenAI
2. **Authentification échoue** : Vérifiez les credentials dans `.env`
3. **Images ne s'affichent pas** : Vérifiez le dossier `public/images/`
4. **Erreurs de build** : Vérifiez la version de Node.js (18+)

### **Logs et Debug**

- **Console navigateur** : Erreurs frontend
- **Terminal serveur** : Logs backend
- **Vue DevTools** : Inspection des composants
- **Nuxt DevTools** : Debug de l'application

## 📄 Licence

Ce projet est sous licence **MIT**. Voir le fichier `LICENSE` pour plus de détails.

## 🙏 Remerciements

- **Nuxt.js** : Framework Vue.js moderne
- **Tailwind CSS** : Framework CSS utilitaire
- **OpenAI** : API de traduction IA
- **Vue.js** : Framework JavaScript progressif
- **Pinia** : Gestion d'état Vue.js

---

**Bon appétit et bon développement ! 🍽️✨** 