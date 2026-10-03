import { defineEventHandler } from 'h3'
import type { SupabaseClient } from '@supabase/supabase-js'
import { recipeInputSchema } from '#shared/schemas/recipe'
import { aiRecipeToRecipeInput, translateRecipeBodySchema, type TranslateRecipeResponse } from '#shared/schemas/ai'
import { isUnitCode, type UnitCode } from '#shared/schemas/units'
import { getAiConfig, getModel } from '../utils/ai/provider'
import { translateRecipeText } from '../utils/ai/translate'
import { throwAiProviderError } from '../utils/ai/errors'
import { assertAiQuota, logAiUsage } from '../utils/ai/usage'

/**
 * POST /api/translate-recipe — texte brut d'une recette → `RecipeInput`
 * structuré, prêt pour `POST /api/add-recipe` (rien n'est enregistré ici).
 *
 * Body : `{ recipeText (20–20 000 car.), targetLanguage?: 'fr' | 'en' }`.
 * Réponse : `{ success, recipe: RecipeInput, aiRecipe, usage: { provider, model,
 *   inputTokens, outputTokens, estimatedCostUsd, durationMs } }`.
 *
 * Étapes : auth admin → validation → quota journalier (`check_ai_quota`, 429)
 * → appel IA (AI SDK, `generateObject`) → journalisation `ai_usage` (ok ou
 * error) → conversion et validation `recipeInputSchema`.
 *
 * Réservé aux administrateurs pour l'instant (facturation). Pour l'ouvrir
 * à tous les utilisateurs : remplacer `requireAdmin` par `requireUser` ;
 * le quota par personne et la journalisation sont déjà par utilisateur.
 */

/** Libellés canoniques (`units.abbr`) par code, lus en base (lecture publique). */
async function loadUnitLabels(supabase: SupabaseClient): Promise<Map<UnitCode, string>> {
  const labels = new Map<UnitCode, string>()
  const { data, error } = await supabase.from('units').select('code, abbr')
  if (error) {
    console.error('[api] translate-recipe : lecture units', error)
    return labels
  }
  const rows: unknown = data
  if (!Array.isArray(rows)) return labels
  for (const row of rows) {
    if (typeof row !== 'object' || row === null) continue
    const { code, abbr } = row as { code?: unknown, abbr?: unknown }
    if (isUnitCode(code) && typeof abbr === 'string' && abbr !== '') labels.set(code, abbr)
  }
  return labels
}

export default defineEventHandler(async (event): Promise<TranslateRecipeResponse> => {
  try {
    const { supabase, user } = await requireAdmin(event)
    const { recipeText, targetLanguage } = await validateBody(event, translateRecipeBodySchema)

    const config = getAiConfig(event)
    await assertAiQuota(supabase, config.dailyQuota)

    const model = getModel(config)
    const startedAt = Date.now()

    let result: Awaited<ReturnType<typeof translateRecipeText>>
    try {
      result = await translateRecipeText(model, recipeText, targetLanguage)
    } catch (error: unknown) {
      await logAiUsage(supabase, {
        userId: user.id,
        provider: config.provider,
        model: config.model,
        feature: 'translate',
        inputTokens: undefined,
        outputTokens: undefined,
        status: 'error',
        durationMs: Date.now() - startedAt
      })
      throw error
    }

    const durationMs = Date.now() - startedAt
    const logged = await logAiUsage(supabase, {
      userId: user.id,
      provider: config.provider,
      model: config.model,
      feature: 'translate',
      inputTokens: result.usage.inputTokens,
      outputTokens: result.usage.outputTokens,
      status: 'ok',
      durationMs
    })

    const unitLabels = await loadUnitLabels(supabase)
    const converted = aiRecipeToRecipeInput(result.recipe, code => unitLabels.get(code) ?? code)
    // Garantit que l'aperçu renvoyé passera tel quel dans POST /api/add-recipe.
    const recipe = recipeInputSchema.parse(converted)

    return {
      success: true,
      recipe,
      aiRecipe: result.recipe,
      usage: {
        provider: config.provider,
        model: config.model,
        inputTokens: logged.inputTokens,
        outputTokens: logged.outputTokens,
        estimatedCostUsd: logged.estimatedCostUsd,
        durationMs
      }
    }
  } catch (error: unknown) {
    throwAiProviderError(error, 'translate-recipe')
    handleApiError(error, 'translate-recipe')
  }
})
