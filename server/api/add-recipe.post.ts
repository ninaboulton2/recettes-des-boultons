import { defineEventHandler, readBody, createError } from 'h3'
import { supabase } from '~/utils/supabase'

export default defineEventHandler(async (event) => {
  try {
    const body = await readBody(event)
    const { recipe } = body

    if (!recipe) {
      throw createError({
        statusCode: 400,
        statusMessage: 'La recette est requise'
      })
    }

    // Mapper les noms de colonnes JavaScript vers Supabase
    const supabaseRecipe = {
      title: recipe.title,
      description: recipe.description,
      category: recipe.category,
      ingredients: recipe.ingredients,
      instructions: recipe.instructions,
      prep_time: recipe.prepTime,
      cook_time: recipe.cookTime,
      servings: recipe.servings,
      image: recipe.image,
      tags: recipe.tags || [],
      notes: recipe.notes || "",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }

    // Insérer la recette dans Supabase
    const { data, error } = await supabase
      .from('recipes')
      .insert(supabaseRecipe)
      .select()
      .single()

    if (error) {
      console.error('Erreur Supabase:', error)
      throw createError({
        statusCode: 500,
        statusMessage: `Erreur lors de l'insertion en base de données: ${error.message}`
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
      message: `Recette "${recipe.title}" ajoutée`
    }

  } catch (error: any) {
    console.error('Erreur lors de l\'ajout de la recette:', error)
    
    if (error.statusCode) {
      throw error
    }

    throw createError({
      statusCode: 500,
      statusMessage: `Erreur interne du serveur: ${error.message || 'Erreur inconnue'}`
    })
  }
}) 