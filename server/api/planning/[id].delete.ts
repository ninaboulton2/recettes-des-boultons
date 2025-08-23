import { defineEventHandler, getRouterParam, createError } from 'h3'
import { supabase } from '~/utils/supabase'

export default defineEventHandler(async (event) => {
  try {
    const id = getRouterParam(event, 'id')

    if (!id) {
      throw createError({
        statusCode: 400,
        statusMessage: 'ID du repas manquant'
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
