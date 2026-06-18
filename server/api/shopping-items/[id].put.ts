import { defineEventHandler, getRouterParam, readBody, createError } from 'h3'

export default defineEventHandler(async (event) => {
  try {
    const { supabase } = await requireUser(event)

    const itemId = getRouterParam(event, 'id')
    const body = await readBody(event)
    const { name, amount, unit, isChecked, listId } = body

    if (!itemId) {
      throw createError({
        statusCode: 400,
        statusMessage: 'ID d\'item manquant'
      })
    }

    // Vérifier que l'item existe
    const { data: existingItem, error: checkError } = await supabase
      .from('shopping_items')
      .select('id, name')
      .eq('id', itemId)
      .single()

    if (checkError || !existingItem) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Item non trouvé'
      })
    }

    // Préparer les mises à jour
    const updates: any = {
      updated_at: new Date().toISOString()
    }

    if (name !== undefined) updates.name = name
    if (amount !== undefined) updates.amount = amount
    if (unit !== undefined) updates.unit = unit
    if (isChecked !== undefined) updates.is_checked = isChecked

    // Mettre à jour l'item
    const { data, error } = await supabase
      .from('shopping_items')
      .update(updates)
      .eq('id', itemId)
      .select(`
        *,
        list:shopping_lists(name)
      `)
      .single()

    if (error) {
      console.error('Erreur Supabase lors de la mise à jour:', error)
      throw createError({
        statusCode: 500,
        statusMessage: `Erreur lors de la mise à jour: ${error.message}`
      })
    }

    // Formater la réponse
    const formattedItem = {
      id: data.id,
      name: data.name,
      amount: data.amount,
      unit: data.unit,
      recipeId: data.recipe_id,
      listId: data.list_id,
      isChecked: data.is_checked,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
      list: data.list ? {
        id: data.list.id,
        name: data.list.name
      } : null
    }

    return {
      success: true,
      item: formattedItem,
      message: 'Item mis à jour avec succès'
    }

  } catch (error: any) {
    console.error('Erreur lors de la mise à jour de l\'item:', error)
    
    if (error.statusCode) {
      throw error
    }

    throw createError({
      statusCode: 500,
      statusMessage: `Erreur interne du serveur: ${error.message || 'Erreur inconnue'}`
    })
  }
})
