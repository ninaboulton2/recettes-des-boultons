import { defineEventHandler } from 'h3'
import type { SupabaseClient } from '@supabase/supabase-js'
import { amountToText, isUnitCode, shoppingItemInputSchema, textOrNull } from '#shared/schemas'
import type { ShoppingItemRow } from '~~/server/utils/shopping'

/**
 * POST /api/shopping-items — ajoute un article à une liste, avec fusion
 * automatique (même nom replié + même unité → quantités additionnées) via
 * `merge_shopping_item`. La quantité texte est convertie par `parse_amount`
 * et l'unité par `normalize_unit` (fonctions SQL : même logique qu'en base).
 */

async function parseAmount(supabase: SupabaseClient, amount: string | number | null | undefined): Promise<number | null> {
  if (typeof amount === 'number') return Number.isFinite(amount) ? amount : null
  const text = amountToText(amount)
  if (text === null) return null
  const { data, error } = await supabase.rpc('parse_amount', { p: text })
  if (error) throwSupabaseError(error, 'shopping-items parse_amount')
  return typeof data === 'number' ? data : (data === null ? null : Number(data))
}

async function normalizeUnit(supabase: SupabaseClient, unit: string | null): Promise<string | null> {
  if (unit === null) return null
  if (isUnitCode(unit)) return unit
  const { data, error } = await supabase.rpc('normalize_unit', { p: unit })
  if (error) throwSupabaseError(error, 'shopping-items normalize_unit')
  return typeof data === 'string' && data !== '' ? data : null
}

export default defineEventHandler(async (event) => {
  try {
    const { supabase } = await requireUser(event)
    const input = await validateBody(event, shoppingItemInputSchema)
    const unitText = textOrNull(input.unit)

    const [amountNum, unitCode] = await Promise.all([
      parseAmount(supabase, input.amount),
      normalizeUnit(supabase, unitText)
    ])

    const { data, error } = await supabase.rpc('merge_shopping_item', {
      p_list_id: input.listId,
      p_name: input.name,
      p_amount_num: amountNum,
      p_unit_code: unitCode,
      p_recipe_id: input.recipeId ?? null
    })
    if (error) {
      throwSupabaseError(error, 'shopping-items merge_shopping_item')
    }

    let row = data as ShoppingItemRow
    // Unité inconnue du référentiel : on conserve le texte saisi (ex. « sachet de levure »).
    if (unitCode === null && unitText !== null && row.unit === null) {
      const { data: updated, error: unitError } = await supabase
        .from('shopping_items')
        .update({ unit: unitText })
        .eq('id', row.id)
        .select('*')
        .single()
      if (unitError) throwSupabaseError(unitError, 'shopping-items keep unit text')
      row = updated as ShoppingItemRow
    }

    const item = mapShoppingItemRow(row)
    return {
      success: true,
      item,
      message: `Article « ${item.name} » ajouté`
    }
  } catch (error: unknown) {
    handleApiError(error, 'shopping-items.post')
  }
})
