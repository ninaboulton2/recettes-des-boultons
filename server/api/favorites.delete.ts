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

    // Suppression directe — le RLS garantit qu'on ne supprime que ses propres favoris.
    // Le filtre user_id est redondant avec le RLS mais explicite (défense en profondeur).
    let request = supabase.from('favorites').delete().eq('user_id', userId)
    request = id ? request.eq('id', id) : request.eq('recipe_id', recipeId)

    const { data: deleted, error } = await request.select('id')

    if (error) {
      throw createError({
        statusCode: 500,
        statusMessage: `Erreur lors de la suppression: ${error.message}`
      })
    }

    if (!deleted || deleted.length === 0) {
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
    if (error.statusCode) {
      throw error
    }
    console.error('Erreur lors de la suppression du favori:', error)
    throw createError({
      statusCode: 500,
      statusMessage: `Erreur interne du serveur: ${error.message || 'Erreur inconnue'}`
    })
  }
})
