import { createError, defineEventHandler } from 'h3'
import { planningIdParamsSchema } from '#shared/schemas'

/** DELETE /api/planning/:id — retire un repas du planning. Inconnu (RLS) → 404. */
export default defineEventHandler(async (event) => {
  try {
    const { supabase } = await requireUser(event)
    const { id } = validateRouterParams(event, planningIdParamsSchema)

    const { data, error } = await supabase
      .from('planning')
      .delete()
      .eq('id', id)
      .select('id')

    if (error) {
      throwSupabaseError(error, 'planning.delete')
    }
    if (!data || data.length === 0) {
      throw createError({ statusCode: 404, statusMessage: 'Repas introuvable' })
    }

    return {
      success: true,
      message: 'Repas supprimé du planning'
    }
  } catch (error: unknown) {
    handleApiError(error, 'planning.delete')
  }
})
