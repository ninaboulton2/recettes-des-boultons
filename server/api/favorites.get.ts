import { defineEventHandler, createError, getQuery } from 'h3'

export default defineEventHandler(async (event) => {
  try {
    const { supabase, user } = await requireUser(event)
    const userId = user.id

    // Récupérer les favoris de l'utilisateur
    const { data: favoritesData, error: favoritesError } = await supabase
      .from('favorites')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })

    if (favoritesError) {
      console.error('Erreur Supabase lors de la récupération des favoris:', favoritesError)
      throw createError({
        statusCode: 500,
        statusMessage: `Erreur lors de la récupération des favoris: ${favoritesError.message}`
      })
    }

    if (!favoritesData || favoritesData.length === 0) {
      return {
        success: true,
        favorites: [],
        count: 0
      }
    }

    // Récupérer les détails complets des recettes
    const recipeIds = favoritesData.map(fav => fav.recipe_id)
    const { data: recipesData, error: recipesError } = await supabase
      .from('recipes')
      .select('*')
      .in('id', recipeIds)

    if (recipesError) {
      console.error('Erreur Supabase lors de la récupération des recettes:', recipesError)
      throw createError({
        statusCode: 500,
        statusMessage: `Erreur lors de la récupération des recettes: ${recipesError.message}`
      })
    }

    // Créer un map des recettes pour un accès rapide
    const recipesMap = new Map(recipesData.map(recipe => [recipe.id, recipe]))

    // Formater les données pour correspondre à la structure des recettes
    const formattedFavorites = favoritesData.map(favorite => {
      const recipe = recipesMap.get(favorite.recipe_id)
      
      return {
        id: favorite.id,
        recipeId: favorite.recipe_id,
        userId: favorite.user_id,
        createdAt: favorite.created_at,
        updatedAt: favorite.updated_at,
        // Inclure les détails complets de la recette
        recipe: recipe ? {
          id: recipe.id,
          title: recipe.title,
          description: recipe.description,
          category: recipe.category,
          ingredients: recipe.ingredients, // Ingrédients complets
          instructions: recipe.instructions,
          prepTime: recipe.prep_time,
          cookTime: recipe.cook_time,
          servings: recipe.servings,
          image: recipe.image,
          tags: recipe.tags || [],
          notes: recipe.notes || '',
          createdAt: recipe.created_at,
          updatedAt: recipe.updated_at
        } : null
      }
    })

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
