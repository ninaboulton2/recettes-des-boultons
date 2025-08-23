import { defineEventHandler, createError } from 'h3'
import { supabase } from '~/utils/supabase'

export default defineEventHandler(async (event) => {
  try {
    // Récupérer toutes les recettes depuis Supabase
    const { data, error } = await supabase
      .from('recipes')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Erreur Supabase lors de la récupération des recettes:', error)
      throw createError({
        statusCode: 500,
        statusMessage: `Erreur lors de la récupération des recettes: ${error.message}`
      })
    }

    // Formater les données pour correspondre à l'ancienne structure
    const formattedRecipes = data.map(recipe => ({
      id: recipe.id,
      title: recipe.title,
      description: recipe.description,
      category: recipe.category,
      ingredients: recipe.ingredients,
      instructions: recipe.instructions,
      prepTime: recipe.prep_time,
      cookTime: recipe.cook_time,
      servings: recipe.servings,
      image: recipe.image,
      tags: recipe.tags || [],
      favorite: recipe.favorite,
      notes: recipe.notes || '',
      createdAt: recipe.created_at,
      updatedAt: recipe.updated_at
    }))

    return {
      success: true,
      recipes: formattedRecipes,
      count: formattedRecipes.length
    }

  } catch (error: any) {
    console.error('Erreur lors de la récupération des recettes:', error)
    
    if (error.statusCode) {
      throw error
    }

    throw createError({
      statusCode: 500,
      statusMessage: `Erreur interne du serveur: ${error.message || 'Erreur inconnue'}`
    })
  }
})
