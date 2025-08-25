import { defineEventHandler, createError, getQuery } from 'h3'
import { supabase } from '~/utils/supabase'

export default defineEventHandler(async (event) => {
  try {
    const query = getQuery(event)
    const { userId } = query

    // Vérifier que userId est fourni
    if (!userId) {
      throw createError({
        statusCode: 400,
        statusMessage: 'userId est requis pour récupérer les favoris'
      })
    }

    // Récupérer les favoris de l'utilisateur spécifique avec les détails des recettes
    let { data: favoritesData, error: favoritesError } = await supabase
      .rpc('get_user_favorites', { user_id_param: userId })

    if (favoritesError) {
      console.error('Erreur Supabase lors de la récupération des favoris:', favoritesError)
      
      // Fallback : essayer la requête directe si la fonction RPC n'existe pas
      const { data: fallbackData, error: fallbackError } = await supabase
        .from('favorites')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })

      if (fallbackError) {
        throw createError({
          statusCode: 500,
          statusMessage: `Erreur lors de la récupération des favoris: ${fallbackError.message}`
        })
      }

      favoritesData = fallbackData
    }

    if (!favoritesData || favoritesData.length === 0) {
      return {
        success: true,
        favorites: [],
        count: 0
      }
    }

    // Si on utilise la fonction RPC, les données sont déjà formatées
    if (favoritesData[0] && 'recipe_title' in favoritesData[0]) {
      const formattedFavorites = favoritesData.map(favorite => ({
        id: favorite.id,
        recipeId: favorite.recipe_id,
        userId: favorite.user_id,
        createdAt: favorite.created_at,
        updatedAt: favorite.updated_at,
        recipe: {
          id: favorite.recipe_id,
          title: favorite.recipe_title,
          description: favorite.recipe_description,
          category: favorite.recipe_category,
          image: favorite.recipe_image,
          prepTime: favorite.recipe_prep_time || 0,
          cookTime: favorite.recipe_cook_time || 0,
          servings: favorite.recipe_servings || 1,
          tags: favorite.recipe_tags || [],
          ingredients: [], // À récupérer séparément si nécessaire
          instructions: [], // À récupérer séparément si nécessaire
          notes: '',
          createdAt: favorite.created_at,
          updatedAt: favorite.updated_at
        }
      }))

      return {
        success: true,
        favorites: formattedFavorites,
        count: formattedFavorites.length
      }
    }

    // Fallback : récupérer les détails des recettes séparément
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

    // Formater les données pour correspondre à l'ancienne structure
    const formattedFavorites = favoritesData.map(favorite => {
      const recipe = recipesMap.get(favorite.recipe_id)
      
      return {
        id: favorite.id,
        recipeId: favorite.recipe_id,
        userId: favorite.user_id,
        createdAt: favorite.created_at,
        updatedAt: favorite.updated_at,
        // Inclure les détails de la recette
        recipe: recipe ? {
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
