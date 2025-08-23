import { defineEventHandler, readBody, getQuery, createError } from 'h3'
import { supabase } from '~/utils/supabase'

export default defineEventHandler(async (event) => {
  try {
    const query = getQuery(event)
    const recipeId = query.id
    const body = await readBody(event)
    const { updates } = body

    if (!recipeId) {
      throw createError({
        statusCode: 400,
        statusMessage: 'ID de recette manquant'
      })
    }

    if (!updates) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Données de mise à jour manquantes'
      })
    }

    // Vérifier d'abord que la recette existe
    const { data: existingRecipe, error: checkError } = await supabase
      .from('recipes')
      .select('id, title')
      .eq('id', recipeId)
      .single()

    if (checkError || !existingRecipe) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Recette non trouvée'
      })
    }

    // Mapper les noms de colonnes JavaScript vers Supabase
    const supabaseUpdates: any = {}
    
    if (updates.title !== undefined) supabaseUpdates.title = updates.title
    if (updates.description !== undefined) supabaseUpdates.description = updates.description
    if (updates.category !== undefined) supabaseUpdates.category = updates.category
    if (updates.ingredients !== undefined) supabaseUpdates.ingredients = updates.ingredients
    if (updates.instructions !== undefined) supabaseUpdates.instructions = updates.instructions
    if (updates.prepTime !== undefined) supabaseUpdates.prep_time = updates.prepTime
    if (updates.cookTime !== undefined) supabaseUpdates.cook_time = updates.cookTime
    if (updates.servings !== undefined) supabaseUpdates.servings = updates.servings
    if (updates.image !== undefined) supabaseUpdates.image = updates.image
    if (updates.tags !== undefined) supabaseUpdates.tags = updates.tags
    if (updates.notes !== undefined) supabaseUpdates.notes = updates.notes
    
    // Toujours mettre à jour la date de modification
    supabaseUpdates.updated_at = new Date().toISOString()

    // Mettre à jour la recette dans Supabase
    const { data, error } = await supabase
      .from('recipes')
      .update(supabaseUpdates)
      .eq('id', recipeId)
      .select()
      .single()

    if (error) {
      console.error('Erreur Supabase lors de la mise à jour:', error)
      throw createError({
        statusCode: 500,
        statusMessage: `Erreur lors de la mise à jour: ${error.message}`
      })
    }

    if (!data) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Recette non trouvée après mise à jour'
      })
    }

    // Formater la réponse pour correspondre au format JavaScript
    const formattedRecipe = {
      id: data.id,
      title: data.title,
      description: data.description,
      category: data.category,
      ingredients: data.ingredients,
      instructions: data.instructions,
      prepTime: data.prep_time,
      cookTime: data.cook_time,
      servings: data.servings,
      image: data.image,
      tags: data.tags || [],
      notes: data.notes || "",
      createdAt: data.created_at,
      updatedAt: data.updated_at
    }

    return {
      success: true,
      recipe: formattedRecipe,
      message: `Recette "${data.title}" mise à jour avec succès`
    }

  } catch (error: any) {
    console.error('Erreur lors de la mise à jour de la recette:', error)
    
    if (error.statusCode) {
      throw error
    }

    throw createError({
      statusCode: 500,
      statusMessage: `Erreur interne du serveur: ${error.message || 'Erreur inconnue'}`
    })
  }
}) 