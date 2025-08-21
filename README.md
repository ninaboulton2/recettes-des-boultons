# Recettes des Boultons 🍳

Une application de recettes familiales construite avec Nuxt.js.

## 🚀 Démarrage rapide

```bash
# Installer les dépendances
npm install

# Lancer le serveur de développement
npm run dev
```

L'application sera accessible sur `http://localhost:3000`

## 📁 Structure du projet

```
boultons-shopping-list/
├── public/
│   └── data/
│       └── recipes.json          # Fichier JSON contenant toutes les recettes
├── stores/
│   └── recipes.ts               # Store Pinia pour la gestion des recettes
├── utils/
│   └── recipeManager.js         # Utilitaire pour gérer les recettes
├── examples/
│   └── addRecipe.js             # Exemple d'ajout de recette
└── pages/
    └── recettes/                # Pages de l'application
```

## 🍽️ Gestion des recettes

### Structure d'une recette

```javascript
{
  "id": "1",
  "title": "Nom de la recette",
  "description": "Description courte",
  "category": "plats", // soupes, entrees, plats, poissons, viandes, yaourts et fromages, desserts et gâteaux, boissons
  "ingredients": [
    { "name": "Ingrédient", "amount": 1, "unit": "g" }
  ],
  "instructions": [
    "Étape 1",
    "Étape 2"
  ],
  "prepTime": 15,        // Temps de préparation en minutes
  "cookTime": 30,        // Temps de cuisson en minutes
  "servings": 4,         // Nombre de portions
  "image": "/images/plats.png",
  "tags": ["végétarien"], // Tags disponibles: "végétarien", "vegan"
  "favorite": false,     // Boolean
  "createdAt": "2024-01-15T00:00:00.000Z",
  "updatedAt": "2024-01-15T00:00:00.000Z",
  "notes": "Astuce ou conseil personnel (optionnel)"
}
```

### Ajouter une nouvelle recette

#### Méthode 1: Utiliser l'utilitaire (recommandé)

```bash
# Voir la liste des recettes existantes
node utils/recipeManager.js list

# Voir comment ajouter une recette
node utils/recipeManager.js add
```

#### Méthode 2: Utiliser le script d'exemple

```bash
# Exécuter l'exemple d'ajout de recette
node examples/addRecipe.js
```

#### Méthode 3: Programmatiquement

```javascript
const { addRecipe } = require('./utils/recipeManager')

const nouvelleRecette = {
  title: "Ma nouvelle recette",
  description: "Description de la recette",
  category: "plats",
  ingredients: [
    { name: "Ingrédient 1", amount: 1, unit: "g" }
  ],
  instructions: [
    "Étape 1",
    "Étape 2"
  ],
  prepTime: 15,
  cookTime: 30,
  servings: 4,
  image: "/images/plats.png",
  tags: ["végétarien"],
  favorite: false
}

addRecipe(nouvelleRecette)
```

### Modifier une recette existante

```javascript
const { updateRecipe } = require('./utils/recipeManager')

updateRecipe("1", {
  title: "Nouveau titre",
  prepTime: 20
})
```

### Supprimer une recette

```javascript
const { deleteRecipe } = require('./utils/recipeManager')

deleteRecipe("1")
```

## 🏷️ Système de tags

Les recettes utilisent un système de tags simple :
- **végétarien** : Recettes sans viande ni poisson
- **vegan** : Recettes sans aucun produit animal

Les badges "Végétarien" et "Vegan" sont affichés automatiquement en fonction des tags présents dans la recette.

## 🎨 Fonctionnalités

- ✅ Affichage des recettes par catégorie
- ✅ Recherche par titre, description ou tags
- ✅ Filtrage par tags (végétarien/vegan)
- ✅ Système de favoris
- ✅ Interface responsive
- ✅ Gestion des recettes via JSON
- ✅ Utilitaire de gestion des recettes
- ✅ Traducteur IA pour ajouter automatiquement des recettes depuis Google Drive
- ✅ Système de tags unifié (plus de propriétés boolean)

## 🚀 Déploiement

### Option 1: Déploiement statique (recommandé)

```bash
# Build pour la production
npm run build

# Les fichiers seront dans le dossier .output/
```

### Option 2: Déploiement avec serveur

```bash
# Build et start
npm run build
npm run start
```

## 📝 Notes importantes

1. **Fichier JSON** : Toutes les recettes sont stockées dans `public/data/recipes.json`
2. **Accessibilité** : Le fichier JSON est public et accessible à tous les utilisateurs
3. **Sauvegarde** : Pensez à sauvegarder régulièrement le fichier `recipes.json`
4. **Images** : Les images doivent être placées dans `public/images/`
5. **Tags** : Seuls "végétarien" et "vegan" sont supportés actuellement

## 🔧 Développement

### Ajouter une nouvelle catégorie

1. Modifier le fichier `stores/recipes.ts` dans la fonction `recipesByCategory`
2. Ajouter la nouvelle catégorie dans l'objet `grouped`
3. Mettre à jour les recettes existantes si nécessaire

### Modifier l'interface

Les composants principaux se trouvent dans :
- `components/RecipeCard.vue` - Carte d'affichage d'une recette
- `pages/recettes/index.vue` - Page d'accueil des recettes
- `pages/recettes/[category].vue` - Page de catégorie

## 🤝 Contribution

Pour ajouter de nouvelles recettes :
1. Utilisez l'utilitaire `recipeManager.js`
2. Respectez la structure JSON
3. Ajoutez des images appropriées
4. Testez l'affichage dans l'application

## 🤖 Traducteur IA

Le traducteur IA permet d'ajouter automatiquement des recettes depuis Google Drive :

### Utilisation
1. Allez sur `/traducteur` dans l'application
2. Collez le texte de votre recette depuis Google Drive
3. Cliquez sur "Ajouter aux recettes"
4. L'IA convertit automatiquement le texte en JSON structuré
5. La recette est ajoutée au fichier `recipes.json` avec un ID unique
6. Un message de succès s'affiche avec des liens vers la recette

### Fonctionnalités
- **Traduction automatique** : L'IA analyse le texte et extrait tous les éléments (titre, ingrédients, instructions, etc.)
- **Ajout automatique** : La recette est immédiatement ajoutée à votre collection
- **Génération d'ID** : Un ID unique est automatiquement généré
- **Métadonnées** : Les dates de création et modification sont ajoutées automatiquement
- **Navigation** : Liens directs vers la recette ajoutée ou toutes les recettes

### Prérequis
- Clé API OpenAI configurée dans le fichier `.env`
- Le fichier `recipes.json` doit être accessible en écriture

---

**Bon appétit ! 🍽️** 