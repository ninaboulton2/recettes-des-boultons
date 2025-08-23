import { defineEventHandler, getQuery, createError } from 'h3'
import { supabase } from '~/utils/supabase'

export default defineEventHandler(async (event) => {
  try {
    const query = getQuery(event)
    const { id, recipeId, userId = null } = query

    if (!id && !recipeId) {
      throw createError({
        statusCode: 400,
        statusMessage: 'ID de favori ou ID de recette manquant'
      })
    }

    let error

    if (id) {
      // Supprimer par ID de favori
      const { error: deleteError } = await supabase
        .from('favorites')
        .delete()
        .eq('id', id)
      
      error = deleteError
    } else if (recipeId) {
      // Supprimer par ID de recette et utilisateur
      let deleteQuery = supabase
        .from('favorites')
        .delete()
        .eq('recipe_id', recipeId)
      
      if (userId) {
        deleteQuery = deleteQuery.eq('user_id', userId)
      } else {
        // Si pas d'utilisateur, supprimer tous les favoris de cette recette sans utilisateur
        deleteQuery = deleteQuery.is('user_id', null)
      }
      
      const { error: deleteError } = await deleteQuery
      error = deleteError
    }

    if (error) {
      console.error('Erreur Supabase lors de la suppression du favori:', error)
      throw createError({
        statusCode: 500,
        statusMessage: `Erreur lors de la suppression: ${error.message}`
      })
    }

    return {
      success: true,
      message: 'Favori supprimé avec succès'
    }

  } catch (error: any) {
    console.error('Erreur lors de la suppression du favori:', error)
    
    if (error.statusCode) {
      throw error
    }

    throw createError({
      statusCode: 500,
      statusMessage: `Erreur interne du serveur: ${error.message || 'Erreur inconnue'}`
    })
  }
})
