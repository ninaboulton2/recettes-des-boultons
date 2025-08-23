import { defineEventHandler, createError } from 'h3'
import { supabase } from '~/utils/supabase'

export default defineEventHandler(async (event) => {
  try {
    // Récupérer tous les favoris avec les détails des recettes
    const { data, error } = await supabase
      .from('favorites')
      .select(`
        *,
        recipe:recipes(*)
      `)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Erreur Supabase lors de la récupération des favoris:', error)
      throw createError({
        statusCode: 500,
        statusMessage: `Erreur lors de la récupération des favoris: ${error.message}`
      })
    }

    // Formater les données pour correspondre à l'ancienne structure
    const formattedFavorites = data.map(favorite => ({
      id: favorite.id,
      recipeId: favorite.recipe_id,
      userId: favorite.user_id,
      createdAt: favorite.created_at,
      updatedAt: favorite.updated_at,
      // Inclure les détails de la recette
      recipe: favorite.recipe ? {
        id: favorite.recipe.id,
        title: favorite.recipe.title,
        description: favorite.recipe.description,
        category: favorite.recipe.category,
        ingredients: favorite.recipe.ingredients,
        instructions: favorite.recipe.instructions,
        prepTime: favorite.recipe.prep_time,
        cookTime: favorite.recipe.cook_time,
        servings: favorite.recipe.servings,
        image: favorite.recipe.image,
        tags: favorite.recipe.tags || [],
        notes: favorite.recipe.notes || '',
        createdAt: favorite.recipe.created_at,
        updatedAt: favorite.recipe.updated_at
      } : null
    }))

    return {
      success: true,
      favorites: formattedFavorites,
      count: formattedFavorites.length
    }

  } catch (error: any) {
    console.error('Erreur lors de la récupération des favoris:', error)
    
    if (error.statusCode) {
      throw error
    }

    throw createError({
      statusCode: 500,
      statusMessage: `Erreur interne du serveur: ${error.message || 'Erreur inconnue'}`
    })
  }
})
