import { defineEventHandler, readBody, createError } from 'h3'
import { supabase } from '~/utils/supabase'

export default defineEventHandler(async (event) => {
  try {
    const body = await readBody(event)
    const { recipeId, section } = body

    if (!recipeId || !section) {
      throw createError({
        statusCode: 400,
        statusMessage: 'recipeId et section sont requis'
      })
    }

    // Vérifier que la recette existe
    const { data: recipe, error: recipeError } = await supabase
      .from('recipes')
      .select('id')
      .eq('id', recipeId)
      .single()

    if (recipeError || !recipe) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Recette non trouvée'
      })
    }

    // Créer la section
    const { data, error } = await supabase
      .from('recipe_sections')
      .insert({
        recipe_id: recipeId,
        name: section.name,
        type: section.type,
        order_index: section.orderIndex || 0
      })
      .select()
      .single()

    if (error) {
      console.error('Erreur Supabase:', error)
      throw createError({
        statusCode: 500,
        statusMessage: `Erreur lors de la création de la section: ${error.message}`
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
        ingredients: [],
        instructions: [],
        createdAt: data.created_at,
        updatedAt: data.updated_at
      },
      message: `Section "${section.name}" créée`
    }

  } catch (error: any) {
    console.error('Erreur lors de la création de la section:', error)
    
    if (error.statusCode) {
      throw error
    }

    throw createError({
      statusCode: 500,
      statusMessage: `Erreur interne du serveur: ${error.message || 'Erreur inconnue'}`
    })
  }
})
