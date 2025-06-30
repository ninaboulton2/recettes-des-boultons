# Recettes des Boultons

Une application moderne de gestion de recettes de cuisine développée avec Vue.js et Nuxt.js.

## 🚀 Fonctionnalités

### 📖 Gestion des recettes
- **Affichage des recettes** par catégories (soupes, entrées, plats, poissons, viandes, yaourts & fromages, desserts, boissons)
- **Recherche et filtres** par nom, catégorie et difficulté
- **Recettes favorites** avec système de cœur
- **Détails complets** : ingrédients, instructions, temps de préparation, nombre de personnes

### 🛒 Listes de courses
- **Création de listes** personnalisées
- **Ajout automatique** des ingrédients depuis les recettes
- **Gestion des articles** : ajout, suppression, marquage comme acheté
- **Persistance locale** des données

### 📅 Planning hebdomadaire
- **Organisation des repas** par jour de la semaine
- **Planification** des menus (petit-déjeuner, déjeuner, dîner)
- **Interface intuitive** pour la gestion des plannings

### 🎨 Interface moderne
- **Design responsive** adapté à tous les écrans
- **Thème personnalisé** avec les couleurs de la famille Boultons
- **Animations fluides** et transitions élégantes
- **Navigation intuitive** avec menu mobile

## 🛠️ Technologies utilisées

- **Vue.js 3** - Framework JavaScript progressif
- **Nuxt.js 3** - Framework Vue.js avec SSR
- **TypeScript** - Typage statique pour une meilleure maintenabilité
- **Tailwind CSS** - Framework CSS utilitaire
- **Pinia** - Gestion d'état moderne pour Vue.js
- **Local Storage** - Persistance des données côté client

## 📦 Installation

### Prérequis
- Node.js 18+ 
- npm ou yarn

### Installation des dépendances
```bash
npm install
```

### Développement
```bash
npm run dev
```
L'application sera accessible sur `http://localhost:3000`

### Build pour production
```bash
npm run build
npm run start
```

### Génération statique
```bash
npm run generate
```

## 📁 Structure du projet

```
boultons-recipes/
├── assets/              # Ressources statiques (CSS, images)
├── components/          # Composants Vue réutilisables
├── layouts/             # Layouts de l'application
├── pages/               # Pages de l'application (routing automatique)
├── stores/              # Stores Pinia pour la gestion d'état
├── types/               # Définitions TypeScript
├── public/              # Fichiers publics (images, favicon)
├── nuxt.config.ts       # Configuration Nuxt.js
├── tailwind.config.js   # Configuration Tailwind CSS
└── package.json         # Dépendances et scripts
```

## 🎯 Fonctionnalités principales

### Page d'accueil
- Présentation de l'application
- Navigation vers les catégories de recettes
- Mise en avant des fonctionnalités

### Gestion des recettes
- **Page principale** : affichage de toutes les recettes avec filtres
- **Page par catégorie** : recettes filtrées par type
- **Page de détail** : recette complète avec ingrédients et instructions
- **Système de favoris** : marquage et gestion des recettes préférées

### Listes de courses
- **Création de listes** multiples
- **Ajout manuel** d'articles
- **Ajout automatique** depuis les recettes
- **Gestion des quantités** et unités
- **Marquage des articles** achetés

### Planning hebdomadaire
- **Organisation des repas** par jour
- **Sélection de recettes** pour chaque repas
- **Vue d'ensemble** de la semaine

## 🎨 Design System

### Couleurs
- **Primary** : Orange chaleureux (#ed7519)
- **Secondary** : Bleu moderne (#0ea5e9)
- **Neutral** : Gris élégants pour le texte et les fonds

### Typographie
- **Lobster** : Police décorative pour les titres
- **Poppins** : Police principale pour le contenu

### Composants
- **Cards** : Affichage des recettes et catégories
- **Buttons** : Actions principales et secondaires
- **Forms** : Saisie des données utilisateur
- **Navigation** : Menu principal et breadcrumbs

## 🔧 Configuration

### Variables d'environnement
Créez un fichier `.env` à la racine du projet :
```env
API_BASE=http://localhost:3000
```

### Personnalisation
- **Couleurs** : Modifiez `tailwind.config.js`
- **Polices** : Ajoutez vos polices dans `assets/css/main.css`
- **Images** : Placez vos images dans `public/images/`

## 📱 Responsive Design

L'application est entièrement responsive et s'adapte à :
- **Mobile** : < 768px
- **Tablet** : 768px - 1024px
- **Desktop** : > 1024px

## 🚀 Déploiement

### Vercel (recommandé)
1. Connectez votre repository GitHub
2. Configurez le build command : `npm run build`
3. Déployez automatiquement

### Netlify
1. Connectez votre repository
2. Build command : `npm run generate`
3. Publish directory : `.output/public`

### Autres plateformes
L'application peut être déployée sur n'importe quelle plateforme supportant Node.js ou les sites statiques.

## 🤝 Contribution

1. Fork le projet
2. Créez une branche pour votre fonctionnalité
3. Committez vos changements
4. Poussez vers la branche
5. Ouvrez une Pull Request

## 📄 Licence

Ce projet est privé et destiné à l'usage de la famille Boultons.

## 👨‍👩‍👧‍👦 À propos

Application développée pour la famille Boultons afin de centraliser et organiser leurs recettes de cuisine préférées.

---

**Développé avec ❤️ pour les Boultons** 