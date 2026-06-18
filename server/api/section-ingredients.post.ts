import { defineEventHandler, readBody, createError } from 'h3'

export default defineEventHandler(async (event) => {
  try {
    const { supabase } = await requireAdmin(event)

    const body = await readBody(event)
    const { sectionId, ingredient } = body

    if (!sectionId || !ingredient) {
      throw createError({
        statusCode: 400,
        statusMessage: 'sectionId et ingredient sont requis'
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

    // Créer l'ingrédient
    const { data, error } = await supabase
      .from('recipe_ingredients')
      .insert({
        recipe_id: section.recipe_id,
        section_id: sectionId,
        name: ingredient.name,
        amount: ingredient.amount,
        unit: ingredient.unit,
        optional: ingredient.optional || false,
        order_index: ingredient.orderIndex || 0
      })
      .select()
      .single()

    if (error) {
      console.error('Erreur Supabase:', error)
      throw createError({
        statusCode: 500,
        statusMessage: `Erreur lors de la création de l'ingrédient: ${error.message}`
      })
    }

    return {
      success: true,
      ingredient: {
        id: data.id,
        name: data.name,
        amount: data.amount,
        unit: data.unit,
        optional: data.optional,
        sectionId: data.section_id,
        orderIndex: data.order_index
      },
      message: `Ingrédient "${ingredient.name}" ajouté`
    }

  } catch (error: any) {
    console.error('Erreur lors de la création de l\'ingrédient:', error)
    
    if (error.statusCode) {
      throw error
    }

    throw createError({
      statusCode: 500,
      statusMessage: `Erreur interne du serveur: ${error.message || 'Erreur inconnue'}`
    })
  }
})
