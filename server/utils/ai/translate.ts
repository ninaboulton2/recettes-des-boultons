import { generateObject, type LanguageModel } from 'ai'
import { aiRecipeSchema, type AiRecipe, type AiTargetLanguage } from '#shared/schemas/ai'
import { buildSystemPrompt, buildUserPrompt } from './prompt'

/**
 * Appel au modèle : texte brut → `AiRecipe` validée par `aiRecipeSchema`
 * (sortie structurée native du fournisseur quand elle existe, sinon
 * validation Zod côté SDK ; une réponse non conforme lève
 * `NoObjectGeneratedError`).
 */

/** Délai max d'un appel (Vercel : maxDuration 30 s sur server/api). */
export const AI_TIMEOUT_MS = 25_000

export interface TranslateUsage {
  inputTokens: number | undefined
  outputTokens: number | undefined
}

export interface TranslateResult {
  recipe: AiRecipe
  usage: TranslateUsage
}

export async function translateRecipeText(
  model: LanguageModel,
  recipeText: string,
  targetLanguage: AiTargetLanguage
): Promise<TranslateResult> {
  const result = await generateObject({
    model,
    schema: aiRecipeSchema,
    schemaName: 'recette',
    schemaDescription: 'Recette de cuisine structurée en sections (ingrédients et étapes).',
    system: buildSystemPrompt(targetLanguage),
    prompt: buildUserPrompt(recipeText),
    maxOutputTokens: 8_000,
    maxRetries: 1,
    abortSignal: AbortSignal.timeout(AI_TIMEOUT_MS)
  })

  return {
    recipe: result.object,
    usage: {
      inputTokens: result.usage.inputTokens,
      outputTokens: result.usage.outputTokens
    }
  }
}
