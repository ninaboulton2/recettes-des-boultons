import { defineEventHandler } from 'h3'
import { addRecipeBodySchema, toSaveRecipePayload } from '#shared/schemas'

/**
 * POST /api/add-recipe — crée une recette (admin).
 * Body : `{ recipe: RecipeInput }` (camelCase, forme de l'éditeur).
 * Un seul appel SQL : `save_recipe(payload)` (recette, sections,
 * ingrédients, instructions), puis relecture de la recette.
 */
export default defineEventHandler(async (event) => {
  try {
    const { supabase } = await requireAdmin(event)
    const { recipe } = await validateBody(event, addRecipeBodySchema)

    const { data: recipeId, error } = await supabase.rpc('save_recipe', { payload: toSaveRecipePayload(recipe) })
    if (error) {
      throwSupabaseError(error, 'add-recipe save_recipe')
    }
    if (typeof recipeId !== 'string') {
      throw new Error('save_recipe n\'a pas renvoyé d\'identifiant')
    }

    const saved = await fetchRecipeDetail(supabase, recipeId)
    return {
      success: true,
      recipe: saved,
      message: `Recette « ${saved.title} » ajoutée`
    }
  } catch (error: unknown) {
    handleApiError(error, 'add-recipe')
  }
})
