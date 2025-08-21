import { defineEventHandler, readBody, getQuery, createError } from 'h3'
import fs from 'fs'
import path from 'path'

export default defineEventHandler(async (event) => {
  try {
    const query = getQuery(event)
    const recipeId = query.id
    const body = await readBody(event)
    const { favorite } = body

    if (!recipeId) {
      throw createError({
        statusCode: 400,
        statusMessage: 'ID de recette manquant'
      })
    }

    if (typeof favorite !== 'boolean') {
      throw createError({
        statusCode: 400,
        statusMessage: 'État du favori manquant ou invalide'
      })
    }

    // Chemin vers le fichier JSON des recettes
    const recipesFile = path.join(process.cwd(), 'public/data/recipes.json')

    // Lire le fichier existant
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

    // Trouver la recette à mettre à jour
    const recipeIndex = recipesData.recipes.findIndex(recipe => recipe.id === recipeId)
    if (recipeIndex === -1) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Recette non trouvée'
      })
    }

    // Mettre à jour l'état du favori
    recipesData.recipes[recipeIndex].favorite = favorite
    recipesData.recipes[recipeIndex].updatedAt = new Date().toISOString()

    // Écrire le fichier
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
      recipe: recipesData.recipes[recipeIndex],
      message: `Favori ${favorite ? 'ajouté' : 'retiré'} pour "${recipesData.recipes[recipeIndex].title}"`
    }

  } catch (error: any) {
    console.error('Erreur lors de la mise à jour du favori:', error)
    
    if (error.statusCode) {
      throw error
    }

    throw createError({
      statusCode: 500,
      statusMessage: `Erreur interne du serveur: ${error.message || 'Erreur inconnue'}`
    })
  }
}) 