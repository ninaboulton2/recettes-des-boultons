import { generateObject, type LanguageModel } from 'ai'
import { aiRecipeSchema, assertTranslationShape, type AiRecipe } from '#shared/schemas/ai'
import { aiTranslateExistingSchema } from '#shared/schemas/translation'
import { draftFromAi, normalizeDraft, type RecipeTexts, type TranslationDraft } from '#shared/utils/translation'
import type { RecipeLang } from '#shared/types'
import { buildSystemPrompt, buildTranslateSystemPrompt, buildTranslateUserPrompt, buildUserPrompt } from './prompt'

/**
 * Appels au modèle :
 *  - `translateRecipeText` : texte brut → `AiRecipe` bilingue (langue détectée +
 *    recette + traduction) validée par `aiRecipeSchema` ;
 *  - `translateRecipeTexts` : textes d'une recette existante → langue détectée +
 *    traduction vers l'autre langue (`aiTranslateExistingSchema`), pour l'édition.
 * Sortie structurée native du fournisseur quand elle existe, sinon validation
 * Zod côté SDK ; une réponse non conforme lève `NoObjectGeneratedError`.
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
  recipeText: string
): Promise<TranslateResult> {
  const result = await generateObject({
    model,
    schema: aiRecipeSchema,
    schemaName: 'recette',
    schemaDescription: 'Recette de cuisine structurée en sections (ingrédients et étapes).',
    system: buildSystemPrompt(),
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

export interface TranslateTextsResult {
  /** Langue du texte d'origine, détectée par le modèle. */
  sourceLanguage: RecipeLang
  /** Traduction vers l'autre langue, nettoyée et alignée sur les textes d'origine. */
  translation: TranslationDraft
  usage: TranslateUsage
}

/**
 * Traduit les textes d'une recette existante vers l'autre langue. Une seule
 * requête par recette ; lève `TranslationShapeError` si le modèle n'a pas
 * respecté la structure (la traduction sera refaite au prochain enregistrement).
 */
export async function translateRecipeTexts(model: LanguageModel, texts: RecipeTexts): Promise<TranslateTextsResult> {
  const result = await generateObject({
    model,
    schema: aiTranslateExistingSchema,
    schemaName: 'traduction',
    schemaDescription: 'Traduction français ↔ anglais d\'une recette, même structure que l\'original.',
    system: buildTranslateSystemPrompt(),
    prompt: buildTranslateUserPrompt(JSON.stringify(texts)),
    maxOutputTokens: 8_000,
    maxRetries: 1,
    abortSignal: AbortSignal.timeout(AI_TIMEOUT_MS)
  })

  const translation = normalizeDraft(texts, draftFromAi(result.object.translation))
  assertTranslationShape(texts, translation)
  return {
    sourceLanguage: result.object.sourceLanguage,
    translation,
    usage: {
      inputTokens: result.usage.inputTokens,
      outputTokens: result.usage.outputTokens
    }
  }
}
