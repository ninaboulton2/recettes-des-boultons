import { defineEventHandler, getRouterParam, createError } from 'h3'

export default defineEventHandler(async (event) => {
  try {
    const { supabase } = await requireUser(event)

    const listId = getRouterParam(event, 'id')

    if (!listId) {
      throw createError({
        statusCode: 400,
        statusMessage: 'ID de liste manquant'
      })
    }

    // Supprimer d'abord tous les items de la liste
    const { error: itemsError } = await supabase
      .from('shopping_items')
      .delete()
      .eq('list_id', listId)

    if (itemsError) {
      console.error('Erreur lors de la suppression des items:', itemsError)
      throw createError({
        statusCode: 500,
        statusMessage: `Erreur lors de la suppression des items: ${itemsError.message}`
      })
    }

    // Supprimer la liste
    const { error: listError } = await supabase
      .from('shopping_lists')
      .delete()
      .eq('id', listId)

    if (listError) {
      console.error('Erreur lors de la suppression de la liste:', listError)
      throw createError({
        statusCode: 500,
        statusMessage: `Erreur lors de la suppression de la liste: ${listError.message}`
      })
    }

    return {
      success: true,
      message: 'Liste de courses supprimée avec succès'
    }

  } catch (error: any) {
    console.error('Erreur lors de la suppression de la liste:', error)
    
    if (error.statusCode) {
      throw error
    }

    throw createError({
      statusCode: 500,
      statusMessage: `Erreur interne du serveur: ${error.message || 'Erreur inconnue'}`
    })
  }
})
