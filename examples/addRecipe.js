const { addRecipe } = require('../utils/recipeManager')

// Exemple d'ajout d'une nouvelle recette
const nouvelleRecette = {
  title: "Ratatouille provençale",
  description: "Un plat traditionnel de légumes du sud de la France",
  category: "plats",
  ingredients: [
    { "name": "Aubergines", "amount": 2, "unit": "grosses" },
    { "name": "Courgettes", "amount": 3, "unit": "moyennes" },
    { "name": "Poivrons", "amount": 2, "unit": "gros" },
    { "name": "Tomates", "amount": 4, "unit": "grosses" },
    { "name": "Oignons", "amount": 2, "unit": "gros" },
    { "name": "Ail", "amount": 4, "unit": "gousses" },
    { "name": "Huile d'olive", "amount": 4, "unit": "cuillères à soupe" },
    { "name": "Thym", "amount": 2, "unit": "brins" },
    { "name": "Laurier", "amount": 2, "unit": "feuilles" },
    { "name": "Sel", "amount": 1, "unit": "pincée" },
    { "name": "Poivre", "amount": 1, "unit": "pincée" }
  ],
  instructions: [
    "Lavez et coupez tous les légumes en dés",
    "Dans une cocotte, faites chauffer l'huile d'olive",
    "Faites revenir les oignons et l'ail émincés",
    "Ajoutez les aubergines et faites-les dorer 5 minutes",
    "Ajoutez les courgettes et les poivrons, remuez 3 minutes",
    "Ajoutez les tomates, le thym et le laurier",
    "Salez et poivrez",
    "Laissez mijoter à feu doux 45 minutes en remuant de temps en temps",
    "Servez chaud ou froid"
  ],
  prepTime: 20,
  cookTime: 45,
  servings: 6,
  image: "/images/plats.png",
  tags: ["végétarien", "vegan"],
  vegetarian: true,
  vegan: true
}

// Ajouter la recette
console.log('🍳 Ajout d\'une nouvelle recette...')
addRecipe(nouvelleRecette) 