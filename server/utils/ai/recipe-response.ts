import type { SupabaseClient } from '@supabase/supabase-js'
import { recipeInputSchema } from '#shared/schemas/recipe'
import { aiRecipeToRecipeInput, type AiRecipe, type TranslateRecipeResponse } from '#shared/schemas/ai'
import { isUnitCode, type UnitCode } from '#shared/schemas/units'
import type { AiConfig } from './provider'
import type { AiUsageLogged } from './usage'

/**
 * Passage commun à `translate-recipe` et `extract-recipe` : la recette produite
 * par le modèle devient un `RecipeInput` (libellés d'unité lus en base) et la
 * réponse de l'API est assemblée.
 */

/** Libellés canoniques (`units.abbr`) par code, lus en base (lecture publique). */
async function loadUnitLabels(supabase: SupabaseClient, context: string): Promise<Map<UnitCode, string>> {
  const labels = new Map<UnitCode, string>()
  const { data, error } = await supabase.from('units').select('code, abbr')
  if (error) {
    console.error(`[api] ${context} : lecture units`, error)
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

/** Vrai si la recette contient au moins un ingrédient ou une étape. */
export function hasRecipeContent(recipe: AiRecipe): boolean {
  return recipe.sections.some(section =>
    section.ingredients.some(ingredient => ingredient.name.trim() !== '')
    || section.instructions.some(step => step.trim() !== ''))
}

export async function buildRecipeResponse(
  supabase: SupabaseClient,
  context: string,
  config: AiConfig,
  aiRecipe: AiRecipe,
  logged: AiUsageLogged,
  durationMs: number
): Promise<TranslateRecipeResponse> {
  const unitLabels = await loadUnitLabels(supabase, context)
  const converted = aiRecipeToRecipeInput(aiRecipe, code => unitLabels.get(code) ?? code)
  // Garantit que l'aperçu renvoyé passera tel quel dans POST /api/add-recipe.
  const recipe = recipeInputSchema.parse(converted)

  return {
    success: true,
    recipe,
    aiRecipe,
    usage: {
      provider: config.provider,
      model: config.model,
      inputTokens: logged.inputTokens,
      outputTokens: logged.outputTokens,
      estimatedCostUsd: logged.estimatedCostUsd,
      durationMs
    }
  }
}
