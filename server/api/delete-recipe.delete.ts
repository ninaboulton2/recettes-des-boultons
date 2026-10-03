import { defineEventHandler } from 'h3'
import { recipeIdQuerySchema } from '#shared/schemas'

/**
 * DELETE /api/delete-recipe?id= — supprime une recette (admin) via `delete_recipe`.
 * Recette inconnue (ou non autorisée par le RLS) → 404.
 */
export default defineEventHandler(async (event) => {
  try {
    const { supabase } = await requireAdmin(event)
    const { id } = validateQuery(event, recipeIdQuerySchema)

    const { error } = await supabase.rpc('delete_recipe', { p_id: id })
    if (error) {
      throwSupabaseError(error, 'delete-recipe delete_recipe')
    }

    return {
      success: true,
      message: 'Recette supprimée',
      deletedRecipeId: id
    }
  } catch (error: unknown) {
    handleApiError(error, 'delete-recipe')
  }
})
