import { defineEventHandler, readBody, createError } from 'h3'

export default defineEventHandler(async (event) => {
  try {
    const { supabase, user } = await requireUser(event)
    const userId = user.id

    const body = await readBody(event)
    const { recipeId } = body

    if (!recipeId) {
      throw createError({
        statusCode: 400,
        statusMessage: 'ID de recette manquant'
      })
    }

    // Récupérer la recette (lecture publique sous RLS)
    const { data: recipe, error: recipeError } = await supabase
      .from('recipes')
      .select('*')
      .eq('id', recipeId)
      .single()

    if (recipeError || !recipe) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Recette non trouvée'
      })
    }

    // Insérer le favori (RLS : auth.uid() = user_id). L'identité vient du token.
    const { data: favorite, error } = await supabase
      .from('favorites')
      .insert({ user_id: userId, recipe_id: recipeId })
      .select('id, created_at, updated_at')
      .single()

    if (error) {
      // 23505 = violation de contrainte unique → déjà en favori
      if (error.code === '23505') {
        throw createError({
          statusCode: 409,
          statusMessage: 'Cette recette est déjà dans vos favoris'
        })
      }
      throw createError({
        statusCode: 500,
        statusMessage: `Erreur lors de l'ajout du favori: ${error.message}`
      })
    }

    const formattedFavorite = {
      id: favorite.id,
      recipeId,
      userId,
      createdAt: favorite.created_at,
      updatedAt: favorite.updated_at,
      recipe: {
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
      }
    }

    return {
      success: true,
      favorite: formattedFavorite,
      message: `Recette "${recipe.title}" ajoutée aux favoris`
    }

  } catch (error: any) {
    if (error.statusCode) {
      throw error
    }
    console.error('Erreur lors de l\'ajout du favori:', error)
    throw createError({
      statusCode: 500,
      statusMessage: `Erreur interne du serveur: ${error.message || 'Erreur inconnue'}`
    })
  }
})
