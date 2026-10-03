import { createError, defineEventHandler } from 'h3'
import { idParamsSchema, shoppingListInputSchema } from '#shared/schemas'
import type { ShoppingListRow } from '~~/server/utils/shopping'

/** PUT /api/shopping-lists/:id — renomme une liste. Liste inconnue (RLS) → 404. */
export default defineEventHandler(async (event) => {
  try {
    const { supabase } = await requireUser(event)
    const { id } = validateRouterParams(event, idParamsSchema)
    const { name } = await validateBody(event, shoppingListInputSchema)

    const { data, error } = await supabase
      .from('shopping_lists')
      .update({ name, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select('*')
      .maybeSingle()

    if (error) {
      throwSupabaseError(error, 'shopping-lists.put')
    }
    if (!data) {
      throw createError({ statusCode: 404, statusMessage: 'Liste introuvable' })
    }

    return {
      success: true,
      list: mapShoppingListRow(data as ShoppingListRow),
      message: 'Liste renommée'
    }
  } catch (error: unknown) {
    handleApiError(error, 'shopping-lists.put')
  }
})
