import { createError, defineEventHandler } from 'h3'
import { favoriteInputSchema } from '#shared/schemas'

/**
 * POST /api/favorites — ajoute une recette aux favoris de l'utilisateur connecté.
 * Body : `{ recipeId }`. Déjà en favori → 409. Recette inconnue → 404.
 */

interface FavoriteRecipeRow {
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

interface FavoriteRow {
  id: string
  created_at: string | null
  updated_at: string | null
}

export default defineEventHandler(async (event) => {
  try {
    const { supabase, user } = await requireUser(event)
    const { recipeId } = await validateBody(event, favoriteInputSchema)

    const { data: recipeData, error: recipeError } = await supabase
      .from('recipes')
      .select('id, title, description, category, prep_time, cook_time, servings, image, photo_path, tags, notes, created_at, updated_at')
      .eq('id', recipeId)
      .maybeSingle()
    if (recipeError) throwSupabaseError(recipeError, 'favorites.post check recipe')
    if (!recipeData) throw createError({ statusCode: 404, statusMessage: 'Recette introuvable' })
    const recipe = recipeData as FavoriteRecipeRow

    const { data, error } = await supabase
      .from('favorites')
      .insert({ user_id: user.id, recipe_id: recipeId })
      .select('id, created_at, updated_at')
      .single()
    if (error) {
      throwSupabaseError(error, 'favorites.post insert', { conflictMessage: 'Cette recette est déjà dans vos favoris' })
    }
    const favorite = data as FavoriteRow

    return {
      success: true,
      favorite: {
        id: favorite.id,
        recipeId,
        userId: user.id,
        createdAt: favorite.created_at,
        updatedAt: favorite.updated_at,
        recipe: {
          id: recipe.id,
          title: recipe.title,
          description: recipe.description ?? '',
          category: recipe.category,
          prepTime: recipe.prep_time,
          cookTime: recipe.cook_time,
          servings: recipe.servings,
          image: recipe.image,
          photoPath: recipe.photo_path,
          tags: recipe.tags ?? [],
          notes: recipe.notes ?? '',
          createdAt: recipe.created_at,
          updatedAt: recipe.updated_at
        }
      },
      message: `Recette « ${recipe.title} » ajoutée aux favoris`
    }
  } catch (error: unknown) {
    handleApiError(error, 'favorites.post')
  }
})
