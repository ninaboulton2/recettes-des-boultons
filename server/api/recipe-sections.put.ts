import { defineEventHandler, readBody, createError } from 'h3'

export default defineEventHandler(async (event) => {
  try {
    const { supabase } = await requireAdmin(event)

    const body = await readBody(event)
    const { sectionId, section } = body

    if (!sectionId || !section) {
      throw createError({
        statusCode: 400,
        statusMessage: 'sectionId et section sont requis'
      })
    }

    // Mettre à jour la section
    const { data, error } = await supabase
      .from('recipe_sections')
      .update({
        name: section.name,
        type: section.type,
        order_index: section.orderIndex
      })
      .eq('id', sectionId)
      .select()
      .single()

    if (error) {
      console.error('Erreur Supabase:', error)
      throw createError({
        statusCode: 500,
        statusMessage: `Erreur lors de la mise à jour de la section: ${error.message}`
      })
    }

    if (!data) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Section non trouvée'
      })
    }

    return {
      success: true,
      section: {
        id: data.id,
        recipeId: data.recipe_id,
        name: data.name,
        type: data.type,
        orderIndex: data.order_index,
        createdAt: data.created_at,
        updatedAt: data.updated_at
      },
      message: `Section "${section.name}" mise à jour`
    }

  } catch (error: any) {
    console.error('Erreur lors de la mise à jour de la section:', error)
    
    if (error.statusCode) {
      throw error
    }

    throw createError({
      statusCode: 500,
      statusMessage: `Erreur interne du serveur: ${error.message || 'Erreur inconnue'}`
    })
  }
})
