import { createError, defineEventHandler } from 'h3'
import { idParamsSchema } from '#shared/schemas'

/**
 * DELETE /api/shopping-items/:id — supprime un article de ses listes.
 * Article inconnu (ou d'une autre personne, RLS) → 404.
 */
export default defineEventHandler(async (event) => {
  try {
    const { supabase } = await requireUser(event)
    const { id } = validateRouterParams(event, idParamsSchema)

    const { data, error } = await supabase
      .from('shopping_items')
      .delete()
      .eq('id', id)
      .select('id')

    if (error) {
      throwSupabaseError(error, 'shopping-items.delete')
    }
    if (!data || data.length === 0) {
      throw createError({ statusCode: 404, statusMessage: 'Article introuvable' })
    }

    return {
      success: true,
      message: 'Article supprimé'
    }
  } catch (error: unknown) {
    handleApiError(error, 'shopping-items.delete')
  }
})
