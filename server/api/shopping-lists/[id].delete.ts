import { createError, defineEventHandler } from 'h3'
import { idParamsSchema } from '#shared/schemas'

/**
 * DELETE /api/shopping-lists/:id — supprime une liste (ses articles suivent
 * par `on delete cascade`). Liste inconnue (RLS) → 404.
 */
export default defineEventHandler(async (event) => {
  try {
    const { supabase } = await requireUser(event)
    const { id } = validateRouterParams(event, idParamsSchema)

    const { data, error } = await supabase
      .from('shopping_lists')
      .delete()
      .eq('id', id)
      .select('id')

    if (error) {
      throwSupabaseError(error, 'shopping-lists.delete')
    }
    if (!data || data.length === 0) {
      throw createError({ statusCode: 404, statusMessage: 'Liste introuvable' })
    }

    return {
      success: true,
      message: 'Liste de courses supprimée'
    }
  } catch (error: unknown) {
    handleApiError(error, 'shopping-lists.delete')
  }
})
