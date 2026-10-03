import { createError, defineEventHandler } from 'h3'
import { planningEntryInputSchema } from '#shared/schemas'

/**
 * POST /api/planning — ajoute un repas (recette OU titre personnalisé) au planning.
 * Body : `{ dateString: 'AAAA-MM-JJ', mealType: 'lunch'|'dinner', recipeId?, customTitle? }`.
 */

interface PlanningRecipeRow {
  id: string
  title: string
  description: string | null
  category: string
  prep_time: number | null
  cook_time: number | null
  servings: number | null
  image: string | null
  photo_path: string | null
  tags: string[] | null
  notes: string | null
  created_at: string | null
  updated_at: string | null
}

interface PlanningRow {
  id: string
  user_id: string
  date_string: string
  meal_type: string
  recipe_id: string | null
  custom_title: string | null
  created_at: string | null
  updated_at: string | null
  recipe: PlanningRecipeRow | null
}

const PLANNING_SELECT = '*, recipe:recipes(id, title, description, category, prep_time, cook_time, servings, image, photo_path, tags, notes, created_at, updated_at)'

export default defineEventHandler(async (event) => {
  try {
    const { supabase, user } = await requireUser(event)
    const input = await validateBody(event, planningEntryInputSchema)

    if (input.recipeId) {
      const { data: recipe, error: recipeError } = await supabase
        .from('recipes')
        .select('id')
        .eq('id', input.recipeId)
        .maybeSingle()
      if (recipeError) throwSupabaseError(recipeError, 'planning.post check recipe')
      if (!recipe) throw createError({ statusCode: 404, statusMessage: 'Recette introuvable' })
    }

    const { data, error } = await supabase
      .from('planning')
      .insert({
        date_string: input.dateString,
        meal_type: input.mealType,
        recipe_id: input.recipeId ?? null,
        custom_title: input.recipeId ? null : (input.customTitle ?? null),
        user_id: user.id
      })
      .select(PLANNING_SELECT)
      .single()

    if (error) {
      throwSupabaseError(error, 'planning.post insert')
    }

    const row = data as unknown as PlanningRow
    const meal = {
      id: row.id,
      dateString: row.date_string,
      mealType: row.meal_type,
      recipeId: row.recipe_id,
      customTitle: row.custom_title,
      userId: row.user_id,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      recipe: row.recipe
        ? {
            id: row.recipe.id,
            title: row.recipe.title,
            description: row.recipe.description ?? '',
            category: row.recipe.category,
            prepTime: row.recipe.prep_time,
            cookTime: row.recipe.cook_time,
            servings: row.recipe.servings,
            image: row.recipe.image,
            photoPath: row.recipe.photo_path,
            tags: row.recipe.tags ?? [],
            notes: row.recipe.notes ?? '',
            createdAt: row.recipe.created_at,
            updatedAt: row.recipe.updated_at
          }
        : null
    }

    const label = meal.recipe?.title ?? meal.customTitle ?? ''
    return {
      success: true,
      meal,
      message: `« ${label} » ajouté au planning du ${input.dateString} (${input.mealType === 'lunch' ? 'déjeuner' : 'dîner'})`
    }
  } catch (error: unknown) {
    handleApiError(error, 'planning.post')
  }
})
