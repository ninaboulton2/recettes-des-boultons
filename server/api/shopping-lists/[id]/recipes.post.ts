import { defineEventHandler } from 'h3'
import { addRecipeToListSchema, idParamsSchema } from '#shared/schemas'
import type { ShoppingItemRow } from '~~/server/utils/shopping'

/**
 * POST /api/shopping-lists/:id/recipes — ajoute les ingrédients d'une recette
 * à la liste (toutes les sections ou `sectionIds`), quantités × `servingsFactor`,
 * avec fusion des doublons (`add_recipe_to_list` → `merge_shopping_item`).
 * Body : `{ recipeId, sectionIds?, servingsFactor? }`.
 * Réponse : `{ success, items }` — les articles créés ou mis à jour.
 */
export default defineEventHandler(async (event) => {
  try {
    const { supabase } = await requireUser(event)
    const { id: listId } = validateRouterParams(event, idParamsSchema)
    const input = await validateBody(event, addRecipeToListSchema)

    const { data, error } = await supabase.rpc('add_recipe_to_list', {
      p_recipe_id: input.recipeId,
      p_list_id: listId,
      p_section_ids: input.sectionIds ?? null,
      p_servings_factor: input.servingsFactor ?? 1
    })
    if (error) {
      throwSupabaseError(error, 'shopping-lists/[id]/recipes add_recipe_to_list')
    }

    const rows = (Array.isArray(data) ? data : []) as ShoppingItemRow[]
    const items = rows.map(mapShoppingItemRow)
    return {
      success: true,
      items,
      message: items.length > 0
        ? `${items.length} ingrédient${items.length > 1 ? 's' : ''} ajouté${items.length > 1 ? 's' : ''} à la liste`
        : 'Aucun ingrédient à ajouter'
    }
  } catch (error: unknown) {
    handleApiError(error, 'shopping-lists/[id]/recipes.post')
  }
})
