import { defineEventHandler, readBody, createError } from 'h3'
import { supabase } from '~/utils/supabase'

export default defineEventHandler(async (event) => {
  try {
    const body = await readBody(event)
    const { recipeId, userId = null } = body

    if (!recipeId) {
      throw createError({
        statusCode: 400,
        statusMessage: 'ID de recette manquant'
      })
    }

    // Vérifier que la recette existe
    const { data: recipe, error: recipeError } = await supabase
      .from('recipes')
      .select('id, title')
      .eq('id', recipeId)
      .single()

    if (recipeError || !recipe) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Recette non trouvée'
      })
    }

    // Vérifier si la recette est déjà en favori (peu importe l'utilisateur)
    const { data: existingFavorites, error: checkError } = await supabase
      .from('favorites')
      .select('id, user_id')
      .eq('recipe_id', recipeId)

    if (checkError) {
      console.error('Erreur lors de la vérification des favoris existants:', checkError)
      throw createError({
        statusCode: 500,
        statusMessage: `Erreur lors de la vérification: ${checkError.message}`
      })
    }

    // Si des favoris existent déjà pour cette recette
    if (existingFavorites && existingFavorites.length > 0) {
      // Vérifier si l'utilisateur actuel a déjà cette recette en favori
      const userAlreadyHasFavorite = existingFavorites.some(fav => fav.user_id === userId)
      
      if (userAlreadyHasFavorite) {
        throw createError({
          statusCode: 409, // Conflict
          statusMessage: `La recette "${recipe.title}" est déjà dans vos favoris`
        })
      }
      
      // Si pas d'utilisateur spécifié et qu'il y a déjà des favoris sans utilisateur
      if (!userId && existingFavorites.some(fav => fav.user_id === null)) {
        throw createError({
          statusCode: 409, // Conflict
          statusMessage: `La recette "${recipe.title}" est déjà dans les favoris généraux`
        })
      }
    }

    // Insérer le favori
    const { data, error } = await supabase
      .from('favorites')
      .insert({
        recipe_id: recipeId,
        user_id: userId
      })
      .select(`
        *,
        recipe:recipes(*)
      `)
      .single()

    if (error) {
      console.error('Erreur Supabase lors de l\'ajout du favori:', error)
      throw createError({
        statusCode: 500,
        statusMessage: `Erreur lors de l'ajout du favori: ${error.message}`
      })
    }

    // Formater la réponse
    const formattedFavorite = {
      id: data.id,
      recipeId: data.recipe_id,
      userId: data.user_id,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
      recipe: data.recipe ? {
        id: data.recipe.id,
        title: data.recipe.title,
        description: data.recipe.description,
        category: data.recipe.category,
        ingredients: data.recipe.ingredients,
        instructions: data.recipe.instructions,
        prepTime: data.recipe.prep_time,
        cookTime: data.recipe.cook_time,
        servings: data.recipe.servings,
        image: data.recipe.image,
        tags: data.recipe.tags || [],
        notes: data.recipe.notes || '',
        createdAt: data.recipe.created_at,
        updatedAt: data.recipe.updated_at
      } : null
    }

    return {
      success: true,
      favorite: formattedFavorite,
      message: `Recette "${recipe.title}" ajoutée aux favoris`
    }

  } catch (error: any) {
    console.error('Erreur lors de l\'ajout du favori:', error)
    
    if (error.statusCode) {
      throw error
    }

    throw createError({
      statusCode: 500,
      statusMessage: `Erreur interne du serveur: ${error.message || 'Erreur inconnue'}`
    })
  }
})
