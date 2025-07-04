import { defineEventHandler, readBody, createError } from 'h3'
import fs from 'fs'
import path from 'path'

export default defineEventHandler(async (event) => {
  try {
    const body = await readBody(event)
    const { recipe } = body

    if (!recipe) {
      throw createError({
        statusCode: 400,
        statusMessage: 'La recette est requise'
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

    // Générer un nouvel ID
    const maxId = Math.max(...recipesData.recipes.map(r => parseInt(r.id)), 0)
    const newId = (maxId + 1).toString()

    // Préparer la recette avec les métadonnées
    const recipeWithMetadata = {
      ...recipe,
      id: newId,
      favorite: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      notes: recipe.notes || ""
    }

    // Ajouter la recette
    recipesData.recipes.push(recipeWithMetadata)

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
      recipe: recipeWithMetadata,
      message: `Recette "${recipe.title}" ajoutée avec l'ID: ${newId}`
    }

  } catch (error: any) {
    console.error('Erreur lors de l\'ajout de la recette:', error)
    
    if (error.statusCode) {
      throw error
    }

    throw createError({
      statusCode: 500,
      statusMessage: `Erreur interne du serveur: ${error.message || 'Erreur inconnue'}`
    })
  }
}) 