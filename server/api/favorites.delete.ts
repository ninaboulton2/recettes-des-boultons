import { defineEventHandler, createError, getQuery } from 'h3'

export default defineEventHandler(async (event) => {
  try {
    const { supabase, user } = await requireUser(event)
    const userId = user.id

    const query = getQuery(event)
    const { id, recipeId } = query

    if (!id && !recipeId) {
      throw createError({
        statusCode: 400,
        statusMessage: 'ID de favori ou ID de recette manquant'
      })
    }

    let deleteResult

    if (id) {
      // Supprimer par ID de favori en utilisant la fonction SQL simplifiée
      const { data: success, error } = await supabase
        .rpc('delete_user_favorite_by_id', { 
          favorite_id_param: id, 
          user_id_param: userId 
        })

      if (error) {
        // Fallback : suppression directe si la fonction n'existe pas
        const { data: fallbackData, error: fallbackError } = await supabase
          .from('favorites')
          .delete()
          .eq('id', id)
          .eq('user_id', userId)
          .select('id')
          .single()

        if (fallbackError) {
          console.error('Erreur Supabase lors de la suppression du favori:', fallbackError)
          throw createError({
            statusCode: 500,
            statusMessage: `Erreur lors de la suppression: ${fallbackError.message}`
          })
        }

        deleteResult = fallbackData
      } else {
        deleteResult = success ? { id } : null
      }
    } else if (recipeId) {
      // Supprimer par ID de recette et utilisateur en utilisant la fonction SQL simplifiée
      const { data: success, error } = await supabase
        .rpc('delete_user_favorite_by_recipe', { 
          recipe_id_param: recipeId, 
          user_id_param: userId 
        })

      if (error) {
        // Fallback : suppression directe si la fonction n'existe pas
        const { data: fallbackData, error: fallbackError } = await supabase
          .from('favorites')
          .delete()
          .eq('recipe_id', recipeId)
          .eq('user_id', userId)
          .select('id')
          .single()

        if (fallbackError) {
          console.error('Erreur Supabase lors de la suppression du favori:', fallbackError)
          throw createError({
            statusCode: 500,
            statusMessage: `Erreur lors de la suppression: ${fallbackError.message}`
          })
        }

        deleteResult = fallbackData
      } else {
        deleteResult = success ? { id: recipeId } : null
      }
    }

    if (!deleteResult) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Favori non trouvé ou vous n\'êtes pas autorisé à le supprimer'
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
