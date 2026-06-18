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

    // Utiliser la fonction SQL qui contourne RLS
    const { data: recipeData, error: recipeError } = await supabase
      .rpc('get_recipe_by_id', { recipe_id_param: recipeId })
    
    if (recipeError || !recipeData || recipeData.length === 0) {
      console.error('❌ Erreur lors de la recherche de la recette:', recipeError)
      console.error('❌ Recette trouvée:', recipeData)
      
      // Essayer de récupérer toutes les recettes pour voir si RLS bloque
      const { data: allRecipes, error: allRecipesError } = await supabase
        .from('recipes')
        .select('id, title')
        .limit(5)
            
      throw createError({
        statusCode: 404,
        statusMessage: 'Recette non trouvée'
      })
    }
    
    // Extraire la recette des données retournées par la fonction
    const recipe = recipeData[0]

    // Insérer le favori en utilisant la fonction SQL simplifiée qui contourne RLS
    const { data: favoriteId, error } = await supabase
      .rpc('add_user_favorite', { 
        user_id_param: userId, 
        recipe_id_param: recipeId 
      })

    if (error) {
      console.error('Erreur avec la fonction SQL add_user_favorite:', error)
      throw createError({
        statusCode: 500,
        statusMessage: `Erreur lors de l'ajout du favori: ${error.message}`
      })
    }

    // Vérifier que nous avons bien un ID valide et l'extraire correctement
    let actualFavoriteId = favoriteId
    
    // Si favoriteId est un objet, essayer d'extraire l'ID
    if (favoriteId && typeof favoriteId === 'object' && favoriteId.id) {
      actualFavoriteId = favoriteId.id
    } else if (favoriteId && typeof favoriteId === 'object' && favoriteId.data) {
      actualFavoriteId = favoriteId.data
    } else if (typeof favoriteId === 'string') {
      actualFavoriteId = favoriteId
    }
    
    if (!actualFavoriteId) {
      console.error('ID du favori non trouvé dans la réponse:', favoriteId)
      throw createError({
        statusCode: 500,
        statusMessage: 'Erreur lors de l\'ajout du favori: ID non retourné par la fonction SQL'
      })
    }

    // SOLUTION DE CONTOURNEMENT TEMPORAIRE
    // Au lieu de récupérer le favori créé, retourner directement les données
    // Cela évite l'erreur de récupération tout en gardant la fonctionnalité
    const formattedFavorite = {
      id: actualFavoriteId,
      recipeId: recipeId,
      userId: userId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
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
