import { createError, defineEventHandler } from 'h3'
import { recipeIdQuerySchema, toSaveRecipePayload, updateRecipeBodySchema } from '#shared/schemas'

/**
 * PUT /api/update-recipe?id= — remplace intégralement une recette (admin).
 * Body : `{ updates: RecipeInput }` (même forme que la création : l'éditeur
 * renvoie toujours la recette complète). `save_recipe` remplace toutes les
 * sections/ingrédients/instructions (pas de doublon).
 */
export default defineEventHandler(async (event) => {
  try {
    const { supabase } = await requireAdmin(event)
    const { id } = validateQuery(event, recipeIdQuerySchema)
    const { updates } = await validateBody(event, updateRecipeBodySchema)

    // save_recipe créerait la recette si l'id est inconnu : pour un PUT on exige qu'elle existe.
    const { data: existing, error: checkError } = await supabase
      .from('recipes')
      .select('id')
      .eq('id', id)
      .maybeSingle()
    if (checkError) {
      throwSupabaseError(checkError, 'update-recipe check')
    }
    if (!existing) {
      throw createError({ statusCode: 404, statusMessage: 'Recette introuvable' })
    }

    const { error } = await supabase.rpc('save_recipe', { payload: toSaveRecipePayload(updates, id) })
    if (error) {
      throwSupabaseError(error, 'update-recipe save_recipe')
    }

    const saved = await fetchRecipeDetail(supabase, id)
    return {
      success: true,
      recipe: saved,
      message: `Recette « ${saved.title} » mise à jour`
    }
  } catch (error: unknown) {
    handleApiError(error, 'update-recipe')
  }
})
