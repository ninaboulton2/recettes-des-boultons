import { defineEventHandler, readBody, createError } from 'h3'

export default defineEventHandler(async (event) => {
  try {
    const { supabase } = await requireAdmin(event)

    const body = await readBody(event)
    const { sectionId } = body

    if (!sectionId) {
      throw createError({
        statusCode: 400,
        statusMessage: 'sectionId est requis'
      })
    }

    // Supprimer la section (les ingrédients et instructions seront supprimés en cascade)
    const { error } = await supabase
      .from('recipe_sections')
      .delete()
      .eq('id', sectionId)

    if (error) {
      console.error('Erreur Supabase:', error)
      throw createError({
        statusCode: 500,
        statusMessage: `Erreur lors de la suppression de la section: ${error.message}`
      })
    }

    return {
      success: true,
      message: 'Section supprimée'
    }

  } catch (error: any) {
    console.error('Erreur lors de la suppression de la section:', error)
    
    if (error.statusCode) {
      throw error
    }

    throw createError({
      statusCode: 500,
      statusMessage: `Erreur interne du serveur: ${error.message || 'Erreur inconnue'}`
    })
  }
})
