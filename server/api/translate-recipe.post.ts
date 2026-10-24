import { defineEventHandler } from 'h3'
import { translateRecipeBodySchema, type TranslateRecipeResponse } from '#shared/schemas/ai'
import { getAiConfig, getModel } from '../utils/ai/provider'
import { translateRecipeText } from '../utils/ai/translate'
import { throwAiProviderError } from '../utils/ai/errors'
import { assertAiQuota, trackAiCall } from '../utils/ai/usage'
import { buildRecipeResponse } from '../utils/ai/recipe-response'

/**
 * POST /api/translate-recipe — texte brut d'une recette → `RecipeInput`
 * structuré, prêt pour `POST /api/add-recipe` (rien n'est enregistré ici).
 *
 * Body : `{ recipeText (20–20 000 car.) }`. Plus de langue cible (0016) : le modèle
 * détecte la langue du texte et renvoie la recette dans les DEUX langues.
 * Réponse : `{ success, recipe: RecipeInput (langue d'origine), lang, translation
 *   (l'autre langue, alignée), aiRecipe, usage: { provider, model,
 *   inputTokens, outputTokens, estimatedCostUsd, durationMs } }`.
 *
 * Étapes : auth admin → validation → quota journalier (`check_ai_quota`, 429)
 * → appel IA (AI SDK, `generateObject`) → journalisation `ai_usage` (ok ou
 * error) → conversion et validation `recipeInputSchema`.
 *
 * Variantes : `POST /api/extract-recipe` (photo, PDF) et
 * `POST /api/transcribe-recipe` (dictée) partagent le quota et le journal.
 *
 * Réservé aux administrateurs pour l'instant (facturation). Pour l'ouvrir
 * à tous les utilisateurs : remplacer `requireAdmin` par `requireUser` ;
 * le quota par personne et la journalisation sont déjà par utilisateur.
 */
export default defineEventHandler(async (event): Promise<TranslateRecipeResponse> => {
  try {
    const { supabase, user } = await requireRecipeWriter(event)
    const { recipeText } = await validateBody(event, translateRecipeBodySchema)

    const config = getAiConfig(event)
    await assertAiQuota(supabase, config.dailyQuota)

    const model = getModel(config)
    const { result, logged, durationMs } = await trackAiCall(
      supabase,
      { userId: user.id, provider: config.provider, model: config.model, feature: 'translate' },
      () => translateRecipeText(model, recipeText),
      ({ usage }) => usage
    )

    return await buildRecipeResponse(supabase, 'translate-recipe', config, result.recipe, logged, durationMs)
  } catch (error: unknown) {
    throwAiProviderError(error, 'translate-recipe')
    handleApiError(error, 'translate-recipe')
  }
})
