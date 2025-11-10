import { defineEventHandler, createError } from 'h3'
import { supabase } from '~/utils/supabase'

export default defineEventHandler(async (event) => {
  try {
    // Récupérer toutes les recettes de manière simple
    const { data: recipes, error: recipesError } = await supabase
      .from('recipes')
      .select('*')
      .order('created_at', { ascending: false })

    if (recipesError) {
      console.error('Erreur Supabase lors de la récupération des recettes:', recipesError)
      throw createError({
        statusCode: 500,
        statusMessage: `Erreur lors de la récupération des recettes: ${recipesError.message}`
      })
    }

    // Récupérer les sections séparément
    const { data: sections, error: sectionsError } = await supabase
      .from('recipe_sections')
      .select('*')
      .order('recipe_id, order_index')

    if (sectionsError) {
      console.error('Erreur Supabase lors de la récupération des sections:', sectionsError)
      // Continuer sans sections si erreur
    }

    // Récupérer les ingrédients par section
    let ingredientsBySection = {}
    if (sections && sections.length > 0) {
      const { data: ingredients, error: ingredientsError } = await supabase
        .from('recipe_ingredients')
        .select('*')
        .not('section_id', 'is', null)
        .order('section_id, order_index')

      if (ingredientsError) {
        console.error('Erreur Supabase lors de la récupération des ingrédients:', ingredientsError)
      } else {
        // Grouper les ingrédients par section
        ingredients?.forEach(ingredient => {
          if (!ingredientsBySection[ingredient.section_id]) {
            ingredientsBySection[ingredient.section_id] = []
          }
          ingredientsBySection[ingredient.section_id].push(ingredient)
        })
      }
    }

    // Récupérer les instructions par section
    let instructionsBySection = {}
    if (sections && sections.length > 0) {
      const { data: instructions, error: instructionsError } = await supabase
        .from('instructions')
        .select('*')
        .not('section_id', 'is', null)
        .order('section_id, order_index')

      if (instructionsError) {
        console.error('Erreur Supabase lors de la récupération des instructions:', instructionsError)
      } else {
        // Grouper les instructions par section
        instructions?.forEach(instruction => {
          if (!instructionsBySection[instruction.section_id]) {
            instructionsBySection[instruction.section_id] = []
          }
          instructionsBySection[instruction.section_id].push(instruction)
        })
      }
    }

    // Formater les données
    const formattedRecipes = recipes.map(recipe => {
      // Trouver les sections pour cette recette
      const recipeSections = sections?.filter(section => section.recipe_id === recipe.id) || []
      
      // Organiser les sections
      const formattedSections = recipeSections.map(section => ({
        id: section.id,
        recipeId: recipe.id,
        name: section.name,
        type: section.type,
        orderIndex: section.order_index,
        ingredients: ingredientsBySection[section.id]?.map(ing => ({
          id: ing.id,
          name: ing.name,
          amount: ing.amount,
          unit: ing.unit,
          optional: ing.optional,
          sectionId: section.id
        })) || [],
        instructions: instructionsBySection[section.id]?.map(inst => ({
          id: inst.id,
          content: inst.content,
          orderIndex: inst.order_index,
          sectionId: section.id
        })) || [],
        createdAt: section.created_at,
        updatedAt: section.updated_at
      })).sort((a, b) => a.orderIndex - b.orderIndex)

      return {
        id: recipe.id,
        title: recipe.title,
        description: recipe.description,
        category: recipe.category,
        ingredients: recipe.ingredients, // Garder pour compatibilité
        instructions: recipe.instructions, // Garder pour compatibilité
        sections: formattedSections,
        prepTime: recipe.prep_time,
        cookTime: recipe.cook_time,
        servings: recipe.servings,
        image: recipe.image,
        tags: recipe.tags || [],
        favorite: recipe.favorite,
        notes: recipe.notes || '',
        createdAt: recipe.created_at,
        updatedAt: recipe.updated_at
      }
    })

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
