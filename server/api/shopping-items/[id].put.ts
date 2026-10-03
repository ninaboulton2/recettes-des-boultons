import { createError, defineEventHandler } from 'h3'
import { amountToText, idParamsSchema, shoppingItemUpdateSchema, textOrNull } from '#shared/schemas'
import type { ShoppingItemRow } from '~~/server/utils/shopping'

/**
 * PUT /api/shopping-items/:id — modifie nom, quantité, unité ou état coché.
 * `amount_num` / `unit_code` sont resynchronisés par les triggers SQL.
 * Article inconnu (ou d'une autre personne, RLS) → 404.
 */
export default defineEventHandler(async (event) => {
  try {
    const { supabase } = await requireUser(event)
    const { id } = validateRouterParams(event, idParamsSchema)
    const input = await validateBody(event, shoppingItemUpdateSchema)

    const updates: Record<string, string | boolean | null> = { updated_at: new Date().toISOString() }
    if (input.name !== undefined) updates.name = input.name
    if (input.amount !== undefined) updates.amount = amountToText(input.amount)
    if (input.unit !== undefined) updates.unit = textOrNull(input.unit)
    if (input.isChecked !== undefined) updates.is_checked = input.isChecked

    const { data, error } = await supabase
      .from('shopping_items')
      .update(updates)
      .eq('id', id)
      .select('*')
      .maybeSingle()

    if (error) {
      throwSupabaseError(error, 'shopping-items.put')
    }
    if (!data) {
      throw createError({ statusCode: 404, statusMessage: 'Article introuvable' })
    }

    return {
      success: true,
      item: mapShoppingItemRow(data as ShoppingItemRow),
      message: 'Article mis à jour'
    }
  } catch (error: unknown) {
    handleApiError(error, 'shopping-items.put')
  }
})
