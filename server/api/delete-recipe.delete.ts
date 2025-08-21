import { defineEventHandler, getQuery, createError } from 'h3'
import fs from 'fs'
import path from 'path'

export default defineEventHandler(async (event) => {
  try {
    // Récupérer l'ID de la recette à supprimer depuis les paramètres de requête
    const query = getQuery(event)
    const recipeId = query.id

    if (!recipeId) {
      throw createError({
        statusCode: 400,
        statusMessage: 'ID de recette manquant'
      })
    }

    // Chemin vers le fichier recipes.json
    const recipesFile = path.join(process.cwd(), 'public/data/recipes.json')
    
    // Lire le fichier JSON actuel
    let recipesData
    try {
      const fileContent = fs.readFileSync(recipesFile, 'utf8')
      recipesData = JSON.parse(fileContent)
    } catch (error) {
      throw createError({
        statusCode: 500,
        statusMessage: 'Erreur lors de la lecture du fichier recipes.json'
      })
    }
    
    // Filtrer la recette à supprimer
    const originalLength = recipesData.recipes.length
    recipesData.recipes = recipesData.recipes.filter(recipe => recipe.id !== recipeId)
    
    // Vérifier si une recette a été supprimée
    if (recipesData.recipes.length === originalLength) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Recette non trouvée'
      })
    }

    // Écrire le fichier mis à jour
    try {
      fs.writeFileSync(recipesFile, JSON.stringify(recipesData, null, 2), 'utf8')
    } catch (error) {
      throw createError({
        statusCode: 500,
        statusMessage: 'Erreur lors de l\'écriture du fichier recipes.json'
      })
    }

    return {
      success: true,
      message: 'Recette supprimée avec succès',
      deletedRecipeId: recipeId,
      remainingRecipes: recipesData.recipes.length
    }

  } catch (error: any) {
    console.error('Erreur lors de la suppression de la recette:', error)
    
    if (error.statusCode) {
      throw error
    }
    
    throw createError({
      statusCode: 500,
      statusMessage: `Erreur interne du serveur: ${error.message || 'Erreur inconnue'}`
    })
  }
}) 