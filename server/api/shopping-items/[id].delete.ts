import { defineEventHandler, getRouterParam, createError } from 'h3'

export default defineEventHandler(async (event) => {
  try {
    const { supabase } = await requireUser(event)

    const itemId = getRouterParam(event, 'id')

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

    // Supprimer l'item
    const { error } = await supabase
      .from('shopping_items')
      .delete()
      .eq('id', itemId)

    if (error) {
      console.error('Erreur Supabase lors de la suppression:', error)
      throw createError({
        statusCode: 500,
        statusMessage: `Erreur lors de la suppression: ${error.message}`
      })
    }

    return {
      success: true,
      message: `Item "${existingItem.name}" supprimé avec succès`
    }

  } catch (error: any) {
    console.error('Erreur lors de la suppression de l\'item:', error)
    
    if (error.statusCode) {
      throw error
    }

    throw createError({
      statusCode: 500,
      statusMessage: `Erreur interne du serveur: ${error.message || 'Erreur inconnue'}`
    })
  }
})
