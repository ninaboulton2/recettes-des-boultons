import { defineEventHandler, getQuery, createError } from 'h3'

export default defineEventHandler(async (event) => {
  try {
    const { supabase } = await requireAdmin(event)

    // Récupérer l'ID de la recette à supprimer depuis les paramètres de requête
    const query = getQuery(event)
    const recipeId = query.id

    if (!recipeId) {
      throw createError({
        statusCode: 400,
        statusMessage: 'ID de recette manquant'
      })
    }

    // Supprimer la recette de Supabase
    const { error } = await supabase
      .from('recipes')
      .delete()
      .eq('id', recipeId)

    if (error) {
      console.error('Erreur Supabase lors de la suppression:', error)
      throw createError({
        statusCode: 500,
        statusMessage: `Erreur lors de la suppression: ${error.message}`
      })
    }

    return {
      success: true,
      message: 'Recette supprimée avec succès',
      deletedRecipeId: recipeId
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