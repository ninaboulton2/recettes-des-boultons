import { defineEventHandler } from 'h3'
import { shoppingListInputSchema } from '#shared/schemas'
import type { ShoppingListRow } from '~~/server/utils/shopping'

/** POST /api/shopping-lists — crée une liste pour l'utilisateur connecté. */
export default defineEventHandler(async (event) => {
  try {
    const { supabase, user } = await requireUser(event)
    const { name } = await validateBody(event, shoppingListInputSchema)

    const { data, error } = await supabase
      .from('shopping_lists')
      .insert({ name, user_id: user.id })
      .select('*')
      .single()

    if (error) {
      throwSupabaseError(error, 'shopping-lists.post')
    }

    const list = mapShoppingListRow(data as ShoppingListRow)
    return {
      success: true,
      list,
      message: `Liste « ${list.name} » créée`
    }
  } catch (error: unknown) {
    handleApiError(error, 'shopping-lists.post')
  }
})
