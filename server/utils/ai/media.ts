import { experimental_transcribe as transcribe, generateObject, type LanguageModel, type TranscriptionModel } from 'ai'
import { createOpenAI } from '@ai-sdk/openai'
import { aiRecipeSchema, type AiTargetLanguage } from '#shared/schemas/ai'
import type { UploadMediaType } from '#shared/schemas/media'
import { AiConfigError, type AiConfig } from './provider'
import { createMockTranscriptionModel } from './mock'
import { buildExtractSystemPrompt, buildExtractUserPrompt } from './prompt'
import { AI_TIMEOUT_MS, type TranslateResult } from './translate'

/**
 * Entrées « média » du traducteur (phase 5).
 *
 * 1. DICTÉE — `transcribeAudio` : audio du navigateur (WebM de Chrome, MP4 de
 *    Safari…) → texte, via `experimental_transcribe` de l'AI SDK. Modèle :
 *    `AI_TRANSCRIBE_MODEL` (défaut `gpt-4o-mini-transcribe`, 0,003 $/min ;
 *    `whisper-1` à 0,006 $/min). OpenAI uniquement pour l'instant ; avec
 *    `AI_PROVIDER=mock`, texte fixe sans appel réseau. Le texte rejoint la zone
 *    de saisie : l'utilisateur le relit puis lance la structuration normale.
 *
 * 2. PHOTO / PDF — `extractRecipeFromFiles` : `generateObject` avec des parties
 *    `file` et le même `aiRecipeSchema` que le texte collé.
 *    `gpt-4.1-mini`, `claude-haiku-4-5`, `gemini-2.5-flash` et
 *    `mistral-small-latest` lisent les images ; le PDF natif est supporté par
 *    OpenAI, Anthropic et Google. Une image coûte ≈ 1 000 à 1 500 tokens en
 *    entrée (voir docs/IA_MODELES.md).
 *
 * Tailles, formats et nombre de fichiers sont validés avant d'arriver ici
 * (`shared/schemas/media.ts`).
 */

/** Une image ou un PDF prêt à être envoyé au modèle. */
export interface UploadedRecipeFile {
  filename: string
  mediaType: UploadMediaType
  data: Uint8Array
}

/**
 * Modèle de transcription (OpenAI uniquement pour l'instant). Pour
 * `AI_PROVIDER` autre que openai/mock, il faudrait une clé OpenAI dédiée ou un
 * autre fournisseur de transcription (Mistral `voxtral-mini-latest`, Google).
 */
export function getTranscriptionModel(config: AiConfig): TranscriptionModel {
  if (config.provider === 'mock') return createMockTranscriptionModel()
  if (config.provider !== 'openai' || !config.apiKey) {
    throw new AiConfigError('Transcription : fournisseur OpenAI et OPENAI_API_KEY requis')
  }
  return createOpenAI({ apiKey: config.apiKey }).transcription(config.transcriptionModel)
}

export interface TranscribeResult {
  text: string
  /** Durée réelle renvoyée par le fournisseur, `undefined` s'il ne la donne pas. */
  durationInSeconds: number | undefined
}

/** Audio du navigateur → texte (le format est reconnu par le SDK à l'en-tête des octets). */
export async function transcribeAudio(model: TranscriptionModel, audio: Uint8Array): Promise<TranscribeResult> {
  const result = await transcribe({
    model,
    audio,
    maxRetries: 1,
    abortSignal: AbortSignal.timeout(AI_TIMEOUT_MS)
  })
  return { text: result.text.trim(), durationInSeconds: result.durationInSeconds }
}

/** Photo(s) ou PDF d'une recette → `AiRecipe` validée par `aiRecipeSchema`. */
export async function extractRecipeFromFiles(
  model: LanguageModel,
  files: UploadedRecipeFile[],
  targetLanguage: AiTargetLanguage
): Promise<TranslateResult> {
  const result = await generateObject({
    model,
    schema: aiRecipeSchema,
    schemaName: 'recette',
    schemaDescription: 'Recette de cuisine structurée en sections (ingrédients et étapes).',
    system: buildExtractSystemPrompt(targetLanguage),
    messages: [{
      role: 'user',
      content: [
        { type: 'text', text: buildExtractUserPrompt(files.length) },
        // Images et PDF : partie « file » (la partie « image » est dépréciée dans l'AI SDK 7).
        ...files.map(file => ({ type: 'file' as const, data: file.data, mediaType: file.mediaType, filename: file.filename }))
      ]
    }],
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
