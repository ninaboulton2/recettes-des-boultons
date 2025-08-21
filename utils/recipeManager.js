const fs = require('fs')
const path = require('path')

// Chemin vers le fichier JSON des recettes
const RECIPES_FILE = path.join(__dirname, '../public/data/recipes.json')

// Fonction pour lire toutes les recettes
function readRecipes() {
  try {
    const data = fs.readFileSync(RECIPES_FILE, 'utf8')
    return JSON.parse(data)
  } catch (error) {
    console.error('Erreur lors de la lecture du fichier recipes.json:', error)
    return { recipes: [] }
  }
}

// Fonction pour écrire les recettes
function writeRecipes(recipesData) {
  try {
    fs.writeFileSync(RECIPES_FILE, JSON.stringify(recipesData, null, 2), 'utf8')
    console.log('✅ Recettes sauvegardées avec succès!')
  } catch (error) {
    console.error('❌ Erreur lors de la sauvegarde:', error)
  }
}

// Fonction pour ajouter une nouvelle recette
function addRecipe(newRecipe) {
  const recipesData = readRecipes()
  
  // Générer un nouvel ID
  const maxId = Math.max(...recipesData.recipes.map(r => parseInt(r.id)), 0)
  const newId = (maxId + 1).toString()
  
  // Ajouter les métadonnées
  const recipeWithMetadata = {
    ...newRecipe,
    id: newId,
    favorite: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }
  
  recipesData.recipes.push(recipeWithMetadata)
  writeRecipes(recipesData)
  
  console.log(`✅ Recette "${newRecipe.title}" ajoutée`)
  return newId
}

// Fonction pour mettre à jour une recette
function updateRecipe(id, updates) {
  const recipesData = readRecipes()
  const index = recipesData.recipes.findIndex(r => r.id === id)
  
  if (index === -1) {
    console.error(`❌ Recette avec l'ID ${id} non trouvée`)
    return false
  }
  
  recipesData.recipes[index] = {
    ...recipesData.recipes[index],
    ...updates,
    updatedAt: new Date().toISOString()
  }
  
  writeRecipes(recipesData)
  console.log(`✅ Recette "${recipesData.recipes[index].title}" mise à jour`)
  return true
}

// Fonction pour supprimer une recette
function deleteRecipe(id) {
  const recipesData = readRecipes()
  const index = recipesData.recipes.findIndex(r => r.id === id)
  
  if (index === -1) {
    console.error(`❌ Recette avec l'ID ${id} non trouvée`)
    return false
  }
  
  const deletedRecipe = recipesData.recipes.splice(index, 1)[0]
  writeRecipes(recipesData)
  console.log(`✅ Recette "${deletedRecipe.title}" supprimée`)
  return true
}

// Fonction pour lister toutes les recettes
function listRecipes() {
  const recipesData = readRecipes()
  console.log('\n📋 Liste des recettes:')
  console.log('─'.repeat(80))
  
  recipesData.recipes.forEach(recipe => {
    const tags = recipe.tags.length > 0 ? ` [${recipe.tags.join(', ')}]` : ''
    const favorite = recipe.favorite ? ' ⭐' : ''
    console.log(`${recipe.id}. ${recipe.title}${tags}${favorite}`)
    console.log(`   Catégorie: ${recipe.category} | Temps: ${recipe.prepTime + recipe.cookTime}min | Portions: ${recipe.servings}`)
    if (recipe.notes && recipe.notes.trim() !== "") {
      console.log(`   📝 Notes: ${recipe.notes}`)
    }
    console.log('')
  })
}

// Exemple d'utilisation
if (require.main === module) {
  const command = process.argv[2]
  
  switch (command) {
    case 'list':
      listRecipes()
      break
      
    case 'add':
      console.log('📝 Pour ajouter une recette, utilisez la fonction addRecipe() dans votre code')
      console.log('Exemple:')
      console.log(`
const newRecipe = {
  title: "Nouvelle Recette",
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
  tags: ["végétarien"]
}

addRecipe(newRecipe)
      `)
      break
      
    default:
      console.log('🔧 Utilitaire de gestion des recettes')
      console.log('')
      console.log('Commandes disponibles:')
      console.log('  node utils/recipeManager.js list  - Lister toutes les recettes')
      console.log('  node utils/recipeManager.js add   - Voir comment ajouter une recette')
      console.log('')
      console.log('Pour utiliser dans votre code:')
      console.log('  const { addRecipe, updateRecipe, deleteRecipe } = require("./utils/recipeManager")')
  }
}

module.exports = {
  readRecipes,
  writeRecipes,
  addRecipe,
  updateRecipe,
  deleteRecipe,
  listRecipes
} 