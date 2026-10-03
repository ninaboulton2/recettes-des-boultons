import { createError, defineEventHandler } from 'h3'
import { favoriteDeleteQuerySchema } from '#shared/schemas'

/**
 * DELETE /api/favorites?recipeId= (ou ?id=) — retire un favori de l'utilisateur
 * connecté (RLS : uniquement les siens). Introuvable → 404.
 */
export default defineEventHandler(async (event) => {
  try {
    const { supabase, user } = await requireUser(event)
    const { id, recipeId } = validateQuery(event, favoriteDeleteQuerySchema)

    let request = supabase.from('favorites').delete().eq('user_id', user.id)
    request = id ? request.eq('id', id) : request.eq('recipe_id', recipeId ?? '')

    const { data, error } = await request.select('id')
    if (error) {
      throwSupabaseError(error, 'favorites.delete')
    }
    if (!data || data.length === 0) {
      throw createError({ statusCode: 404, statusMessage: 'Favori introuvable' })
    }

    return {
      success: true,
      message: 'Favori supprimé'
    }
  } catch (error: unknown) {
    handleApiError(error, 'favorites.delete')
  }
})
