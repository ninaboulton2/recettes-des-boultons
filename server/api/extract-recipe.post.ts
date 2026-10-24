import { createError, defineEventHandler } from 'h3'
import type { TranslateRecipeResponse } from '#shared/schemas/ai'
import {
  extractRecipeFilesSchema,
  RECIPE_UPLOAD_MAX_BYTES,
  sniffImageOrPdfType
} from '#shared/schemas/media'
import { getAiConfig, getModel } from '../utils/ai/provider'
import { extractRecipeFromFiles, type UploadedRecipeFile } from '../utils/ai/media'
import { AI_ERROR_MESSAGES, throwAiProviderError } from '../utils/ai/errors'
import { assertAiQuota, trackAiCall } from '../utils/ai/usage'
import { buildRecipeResponse, hasRecipeContent } from '../utils/ai/recipe-response'
import { fileParts, readUploadParts } from '../utils/ai/upload'

/**
 * POST /api/extract-recipe — photo(s) ou PDF d'une recette → `RecipeInput`
 * structuré (même réponse que `POST /api/translate-recipe`, rien n'est
 * enregistré ici).
 *
 * Corps `multipart/form-data` : `files` (1 à 4 JPEG / PNG / WebP / PDF, 4 Mo au
 * total, 10 Mo chacun). La langue est détectée par le modèle (0016). Le format est reconnu
 * à l'en-tête des octets, jamais d'après le type annoncé par le navigateur.
 *
 * Étapes : auth admin → lecture et validation Zod → quota journalier (même
 * compteur que le texte, 429) → appel IA multimodal (`generateObject`) →
 * journalisation `ai_usage` (feature `extract`) → conversion et validation
 * `recipeInputSchema`. Aucun fichier n'est conservé.
 */
export default defineEventHandler(async (event): Promise<TranslateRecipeResponse> => {
  try {
    const { supabase, user } = await requireRecipeWriter(event)

    const parts = await readUploadParts(event, RECIPE_UPLOAD_MAX_BYTES)

    const rawFiles = fileParts(parts, 'files').map(part => ({
      filename: part.filename ?? 'fichier',
      data: new Uint8Array(part.data)
    }))
    const sniffed = rawFiles.map(file => sniffImageOrPdfType(file.data))
    const metadata = validateData(extractRecipeFilesSchema, rawFiles.map((file, index) => ({
      filename: file.filename,
      mediaType: sniffed[index] ?? 'inconnu',
      size: file.data.byteLength
    })))
    const files: UploadedRecipeFile[] = rawFiles.map((file, index) => ({
      filename: file.filename,
      mediaType: metadata[index]!.mediaType,
      data: file.data
    }))

    const config = getAiConfig(event)
    await assertAiQuota(supabase, config.dailyQuota)

    const model = getModel(config)
    const { result, logged, durationMs } = await trackAiCall(
      supabase,
      { userId: user.id, provider: config.provider, model: config.model, feature: 'extract' },
      () => extractRecipeFromFiles(model, files),
      ({ usage }) => usage
    )

    if (!hasRecipeContent(result.recipe)) {
      throw createError({ statusCode: 422, statusMessage: AI_ERROR_MESSAGES.noRecipe })
    }

    return await buildRecipeResponse(supabase, 'extract-recipe', config, result.recipe, logged, durationMs)
  } catch (error: unknown) {
    throwAiProviderError(error, 'extract-recipe')
    handleApiError(error, 'extract-recipe')
  }
})
