import { defineEventHandler } from 'h3'
import { similarRecipesBodySchema, type SimilarRecipesResponse } from '#shared/schemas/similar'
import { findSimilarRecipes } from '#shared/utils/similarRecipes'
import { loadRecipeFingerprints } from '../../utils/similarRecipes'

/**
 * POST /api/recipes/similar — recettes déjà en base qui ressemblent à une
 * recette donnée (détection de doublons, utilisée par l'aperçu du traducteur).
 *
 * Body : `{ title, ingredientNames?: string[], excludeId?: uuid }`.
 * Réponse : `{ similar: [{ id, title, score, titleScore, ingredientScore, reason }] }`
 * (au plus 3, la plus proche d'abord ; vide si rien de similaire). Règles et
 * seuils : `shared/utils/similarRecipes.ts` et DEVELOPER.md.
 *
 * Réservé aux administrateurs, comme le traducteur. Lecture seule, aucun appel IA.
 */
export default defineEventHandler(async (event): Promise<SimilarRecipesResponse> => {
  try {
    const { supabase } = await requireAdmin(event)
    const { title, ingredientNames, excludeId } = await validateBody(event, similarRecipesBodySchema)

    const corpus = await loadRecipeFingerprints(supabase)
    return { similar: findSimilarRecipes({ title, ingredientNames }, corpus, { excludeId }) }
  } catch (error: unknown) {
    handleApiError(error, 'recipes.similar')
  }
})
