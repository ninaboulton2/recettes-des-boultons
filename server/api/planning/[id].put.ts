import { createError, defineEventHandler } from 'h3'
import { planningEntryMoveSchema, planningIdParamsSchema } from '#shared/schemas'

/**
 * PUT /api/planning/:id — déplace un repas vers un autre jour et/ou créneau.
 * Body : `{ dateString: 'AAAA-MM-JJ', mealType: 'lunch'|'dinner' }`.
 * L'identifiant du repas est conservé (contrairement à un supprimer + recréer).
 * Repas inconnu (ou d'une autre personne, RLS) → 404.
 */
export default defineEventHandler(async (event) => {
  try {
    const { supabase } = await requireUser(event)
    const { id } = validateRouterParams(event, planningIdParamsSchema)
    const input = await validateBody(event, planningEntryMoveSchema)

    const { data, error } = await supabase
      .from('planning')
      .update({ date_string: input.dateString, meal_type: input.mealType, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select('id, date_string, meal_type, recipe_id, custom_title, user_id, created_at, updated_at')
      .maybeSingle()

    if (error) {
      throwSupabaseError(error, 'planning.put')
    }
    if (!data) {
      throw createError({ statusCode: 404, statusMessage: 'Repas introuvable' })
    }

    const row = data as {
      id: string
      date_string: string
      meal_type: string
      recipe_id: string | null
      custom_title: string | null
      user_id: string
      created_at: string | null
      updated_at: string | null
    }

    return {
      success: true,
      meal: {
        id: row.id,
        dateString: row.date_string,
        mealType: row.meal_type,
        recipeId: row.recipe_id,
        customTitle: row.custom_title,
        userId: row.user_id,
        createdAt: row.created_at,
        updatedAt: row.updated_at
      },
      message: 'Repas déplacé'
    }
  } catch (error: unknown) {
    handleApiError(error, 'planning.put')
  }
})
