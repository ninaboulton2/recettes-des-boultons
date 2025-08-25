import { defineEventHandler, readBody, createError } from 'h3'
import { supabase } from '~/utils/supabase'

export default defineEventHandler(async (event) => {
  try {
    const body = await readBody(event)
    const { dateString, mealType, recipeId, customTitle, userId = null } = body

    if (!dateString || !mealType) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Date et type de repas requis'
      })
    }

    if (!['lunch', 'dinner'].includes(mealType)) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Type de repas doit être "lunch" ou "dinner"'
      })
    }

    // Vérifier que soit recipeId soit customTitle est fourni
    if (!recipeId && !customTitle) {
      throw createError({
        statusCode: 400,
        statusMessage: 'ID de recette ou titre personnalisé requis'
      })
    }

    let recipeTitle = ''
    let finalRecipeId = null

    if (recipeId) {
      // Vérifier que la recette existe en utilisant la fonction SQL qui contourne RLS
      console.log('🔍 Debug API Planning - Recherche de la recette avec ID:', recipeId)
      
      const { data: recipeData, error: recipeError } = await supabase
        .rpc('get_recipe_by_id', { recipe_id_param: recipeId })

      console.log('🔍 Debug API Planning - Résultat de la recherche via fonction SQL:', { recipeData, recipeError })
      
      if (recipeError || !recipeData || recipeData.length === 0) {
        console.error('❌ Erreur lors de la recherche de la recette:', recipeError)
        console.error('❌ Recette trouvée:', recipeData)
        throw createError({
          statusCode: 404,
          statusMessage: 'Recette non trouvée'
        })
      }
      
      // Extraire la recette des données retournées par la fonction
      const recipe = recipeData[0]
      console.log('✅ Recette trouvée via fonction SQL:', recipe)
      recipeTitle = recipe.title
      finalRecipeId = recipeId
    } else {
      // Repas personnalisé
      recipeTitle = customTitle
      finalRecipeId = null
    }

    // Insérer le repas dans le planning
    const { data, error } = await supabase
      .from('planning')
      .insert({
        date_string: dateString,
        meal_type: mealType,
        recipe_id: finalRecipeId,
        custom_title: customTitle || null,
        user_id: userId
      })
      .select(`
        *,
        recipe:recipes(*)
      `)
      .single()

    if (error) {
      console.error('Erreur Supabase lors de l\'ajout au planning:', error)
      throw createError({
        statusCode: 500,
        statusMessage: `Erreur lors de l'ajout au planning: ${error.message}`
      })
    }

    // Formater la réponse
    const formattedMeal = {
      id: data.id,
      dateString: data.date_string,
      mealType: data.meal_type,
      recipeId: data.recipe_id,
      customTitle: data.custom_title,
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
      meal: formattedMeal,
      message: `${recipeId ? 'Recette' : 'Repas personnalisé'} "${recipeTitle}" ajouté au planning du ${dateString} (${mealType === 'lunch' ? 'déjeuner' : 'dîner'})`
    }

  } catch (error: any) {
    console.error('Erreur lors de l\'ajout au planning:', error)
    
    if (error.statusCode) {
      throw error
    }

    throw createError({
      statusCode: 500,
      statusMessage: `Erreur interne du serveur: ${error.message || 'Erreur inconnue'}`
    })
  }
})
