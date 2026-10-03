import { defineEventHandler, createError } from 'h3'
import type { SupabaseClient } from '@supabase/supabase-js'
import { serverSupabaseClient } from '#supabase/server'

// TODO(phase 2): typer avec shared/types/database.ts (types générés)
interface IngredientRow {
  id: string
  section_id: string
  name: string
  amount: number | string | null
  unit: string | null
  optional: boolean | null
  order_index: number | null
}

interface InstructionRow {
  id: string
  section_id: string
  content: string
  order_index: number | null
}

export default defineEventHandler(async (event) => {
  try {
    // Lecture publique (RLS) ; utilise la session cookie si présente
    // TODO(phase 2): typer avec shared/types/database.ts
    const supabase: SupabaseClient = await serverSupabaseClient(event)

    // Récupérer toutes les recettes
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
    const ingredientsBySection: Record<string, IngredientRow[]> = {}
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
        ingredients?.forEach((ingredient: IngredientRow) => {
          ;(ingredientsBySection[ingredient.section_id] ??= []).push(ingredient)
        })
      }
    }

    // Récupérer les instructions par section
    const instructionsBySection: Record<string, InstructionRow[]> = {}
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
        instructions?.forEach((instruction: InstructionRow) => {
          ;(instructionsBySection[instruction.section_id] ??= []).push(instruction)
        })
      }
    }

    // Formater les données pour correspondre à la nouvelle structure
    const formattedRecipes = recipes.map(recipe => {
      // Trouver les sections pour cette recette
      const recipeSections = sections?.filter(section => section.recipe_id === recipe.id) || []
      
      // Organiser les sections par type et ordre
      const formattedSections = recipeSections.map(section => ({
        id: section.id,
        recipeId: recipe.id,
        name: section.name,
        type: section.type,
        orderIndex: section.order_index,
        ingredients: ingredientsBySection[section.id]?.sort((a, b) => (a.order_index || 0) - (b.order_index || 0)).map(ing => ({
          id: ing.id,
          name: ing.name,
          amount: ing.amount,
          unit: ing.unit,
          optional: ing.optional,
          sectionId: section.id
        })) || [],
        instructions: instructionsBySection[section.id]?.sort((a, b) => (a.order_index || 0) - (b.order_index || 0)).map(inst => ({
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
