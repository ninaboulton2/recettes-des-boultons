import { defineEventHandler, readBody, createError } from 'h3'

export default defineEventHandler(async (event) => {
  try {
    const { supabase } = await requireAdmin(event)

    const body = await readBody(event)
    const { sectionId, instruction } = body

    if (!sectionId || !instruction) {
      throw createError({
        statusCode: 400,
        statusMessage: 'sectionId et instruction sont requis'
      })
    }

    // Vérifier que la section existe
    const { data: section, error: sectionError } = await supabase
      .from('recipe_sections')
      .select('recipe_id')
      .eq('id', sectionId)
      .single()

    if (sectionError || !section) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Section non trouvée'
      })
    }

    // Créer l'instruction
    const { data, error } = await supabase
      .from('instructions')
      .insert({
        recipe_id: section.recipe_id,
        section_id: sectionId,
        content: instruction.content,
        order_index: instruction.orderIndex || 0
      })
      .select()
      .single()

    if (error) {
      console.error('Erreur Supabase:', error)
      throw createError({
        statusCode: 500,
        statusMessage: `Erreur lors de la création de l'instruction: ${error.message}`
      })
    }

    return {
      success: true,
      instruction: {
        id: data.id,
        content: data.content,
        orderIndex: data.order_index,
        sectionId: data.section_id
      },
      message: `Instruction ajoutée`
    }

  } catch (error: any) {
    console.error('Erreur lors de la création de l\'instruction:', error)
    
    if (error.statusCode) {
      throw error
    }

    throw createError({
      statusCode: 500,
      statusMessage: `Erreur interne du serveur: ${error.message || 'Erreur inconnue'}`
    })
  }
})
