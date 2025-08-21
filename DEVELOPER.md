# 🚀 Guide Développeur - Recettes des Boultons

## 🏗️ Architecture du Projet

### **Stack Technique**
- **Frontend** : Nuxt.js 3 + Vue 3 + Composition API
- **Styling** : Tailwind CSS + CSS personnalisé
- **État** : Pinia stores
- **Backend** : API Nuxt + JWT + bcrypt
- **Base de données** : JSON files + Local Storage

### **Structure des Dossiers**
```
├── components/          # Composants Vue réutilisables
├── pages/              # Pages de l'application (routing automatique)
├── stores/             # Stores Pinia pour la gestion d'état
├── server/api/         # API backend (endpoints REST)
├── i18n/               # Internationalisation (FR/EN)
├── assets/             # Ressources statiques (CSS, images)
├── public/             # Fichiers publics (data, images)
└── middleware/         # Middleware Nuxt (auth, etc.)
```

## 🔧 Développement Local

### **Prérequis**
```bash
Node.js >= 18
npm >= 8
```

### **Installation et Démarrage**
```bash
# Installer les dépendances
npm install

# Copier la configuration d'environnement
cp env.example .env

# Éditer .env avec vos clés API
nano .env

# Lancer en développement
npm run dev
```

### **Variables d'Environnement Requises**
```bash
# Obligatoire pour le traducteur IA
OPENAI_API_KEY=sk-your_key_here

# Optionnel en développement
ADMIN_USERNAME=admin
ADMIN_PASSWORD=password123
JWT_SECRET=your_secret_here
```


## 🔐 Authentification et Sécurité

### **Protection des Routes**
```vue
<script setup>
// Dans un composant ou une page
const { $auth } = useNuxtApp()

// Vérifier si l'utilisateur est connecté
if (!$auth.isAuthenticated) {
  await navigateTo('/login')
}
</script>
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

## 🌍 Internationalisation

### **Ajouter une Nouvelle Traduction**
```json
// i18n/locales/fr.json
{
  "newFeature": {
    "title": "Nouvelle Fonctionnalité",
    "description": "Description de la nouvelle fonctionnalité"
  }
}
```

### **Utiliser les Traductions**
```vue
<template>
  <h1>{{ $t('newFeature.title') }}</h1>
  <p>{{ $t('newFeature.description') }}</p>
</template>
```

## 📱 Responsive Design

### **Breakpoints Tailwind**
```vue
<template>
  <!-- Mobile first approach -->
  <div class="w-full md:w-1/2 lg:w-1/3">
    <!-- Contenu responsive -->
  </div>
</template>
```

### **Classes Responsives Utiles**
- `hidden md:block` : Cacher sur mobile, afficher sur desktop
- `text-sm md:text-base lg:text-lg` : Taille de texte responsive
- `grid-cols-1 md:grid-cols-2 lg:grid-cols-3` : Grille responsive

## 🧪 Tests et Debug

### **Vue DevTools**
- Installer l'extension Vue DevTools
- Inspecter les composants et l'état
- Déboguer les stores Pinia

### **Nuxt DevTools**
- Accessibles en développement sur `/__nuxt_devtools__`
- Inspection des modules et de la configuration
- Analyse des performances

## 🚀 Déploiement

### **Build de Production**
```bash
# Construire l'application
npm run build

# Vérifier le build
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

## 📚 Ressources Utiles

### **Documentation Officielle**
- [Nuxt.js 3](https://nuxt.com/docs)
- [Vue.js 3](https://vuejs.org/guide/)
- [Pinia](https://pinia.vuejs.org/)
- [Tailwind CSS](https://tailwindcss.com/docs)

### **Outils de Développement**
- [Vue DevTools](https://devtools.vuejs.org/)
- [Nuxt DevTools](https://devtools.nuxt.com/)
- [Tailwind CSS IntelliSense](https://marketplace.visualstudio.com/items?itemName=bradlc.vscode-tailwindcss)

---
