import { defineEventHandler, getRouterParam, createError, getQuery } from 'h3'
import { supabase } from '~/utils/supabase'

export default defineEventHandler(async (event) => {
  try {
    const id = getRouterParam(event, 'id')
    const query = getQuery(event)
    const { userId } = query

    if (!id) {
      throw createError({
        statusCode: 400,
        statusMessage: 'ID du repas manquant'
      })
    }

    if (!userId) {
      throw createError({
        statusCode: 401,
        statusMessage: 'userId est requis pour supprimer un repas'
      })
    }

    // Vérifier que le repas appartient à l'utilisateur avant de le supprimer
    const { data: existingMeal, error: checkError } = await supabase
      .from('planning')
      .select('id, user_id')
      .eq('id', id)
      .single()

    if (checkError || !existingMeal) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Repas non trouvé'
      })
    }

    if (existingMeal.user_id !== userId) {
      throw createError({
        statusCode: 403,
        statusMessage: 'Vous n\'êtes pas autorisé à supprimer ce repas'
      })
    }

    // Supprimer le repas du planning
    const { error } = await supabase
      .from('planning')
      .delete()
      .eq('id', id)

    if (error) {
      console.error('Erreur Supabase lors de la suppression du repas:', error)
      throw createError({
        statusCode: 500,
        statusMessage: `Erreur lors de la suppression: ${error.message}`
      })
    }

    return {
      success: true,
      message: 'Repas supprimé du planning avec succès'
    }

  } catch (error: any) {
    console.error('Erreur lors de la suppression du repas:', error)
    
    if (error.statusCode) {
      throw error
    }

    throw createError({
      statusCode: 500,
      statusMessage: `Erreur interne du serveur: ${error.message || 'Erreur inconnue'}`
    })
  }
})
