import type { TranscriptionModel } from 'ai'
import { createOpenAI } from '@ai-sdk/openai'
import { AiConfigError, type AiConfig } from './provider'

/**
 * Phase 5 (préparation, pas d'interface ni d'endpoint pour l'instant) :
 * entrées audio et image pour le traducteur.
 *
 * 1. TRANSCRIPTION AUDIO — `experimental_transcribe` de l'AI SDK :
 *
 *    import { experimental_transcribe as transcribe } from 'ai'
 *    const { text } = await transcribe({
 *      model: getTranscriptionModel(getAiConfig(event)),
 *      audio: await readRawBody(event, false),      // Uint8Array / Buffer (mp3, m4a, wav, webm ≤ 25 Mo chez OpenAI)
 *      abortSignal: AbortSignal.timeout(AI_TIMEOUT_MS)
 *    })
 *    → puis `translateRecipeText(model, text, targetLanguage)` comme pour un collage.
 *
 *    Modèles OpenAI : `gpt-4o-mini-transcribe` (0,003 $/min, recommandé) ou
 *    `whisper-1` (0,006 $/min). Variables à prévoir : `AI_TRANSCRIBE_MODEL`.
 *    Journaliser dans `ai_usage` avec `feature = 'transcribe'` (coût au temps
 *    audio : `estimateCostUsd` devra accepter une durée, cf. pricing.ts).
 *    Endpoint à créer : `POST /api/transcribe-recipe` (multipart ou corps
 *    binaire, `requireAdmin`, même quota `check_ai_quota`).
 *
 * 2. EXTRACTION DEPUIS UNE IMAGE / UN PDF — modèle multimodal :
 *    `generateObject` accepte `messages` à la place de `prompt` ; on passe
 *    l'image comme partie de message :
 *
 *    generateObject({
 *      model, schema: aiRecipeSchema, system: buildSystemPrompt(lang),
 *      messages: [{ role: 'user', content: [
 *        { type: 'text', text: 'Voici la photo d\'une recette à structurer.' },
 *        { type: 'image', image: bytes, mediaType: 'image/jpeg' }   // ou { type: 'file', data, mediaType: 'application/pdf' }
 *      ] }]
 *    })
 *
 *    `gpt-4.1-mini`, `claude-haiku-4-5`, `gemini-2.5-flash` et
 *    `mistral-small-latest` acceptent les images ; le PDF natif est supporté
 *    par OpenAI, Anthropic et Google. Une image ≈ 1 000 à 1 500 tokens en
 *    entrée (voir docs/IA_MODELES.md). Limiter la taille (5 Mo) et le nombre
 *    (3 pages) côté endpoint.
 */

export const DEFAULT_TRANSCRIPTION_MODEL = 'gpt-4o-mini-transcribe'

/**
 * Modèle de transcription (OpenAI uniquement pour l'instant). Pour
 * `AI_PROVIDER` ≠ openai, il faudra une clé OpenAI dédiée ou un autre
 * fournisseur de transcription (Mistral `voxtral-mini-latest`, Google).
 */
export function getTranscriptionModel(config: AiConfig, modelId: string = DEFAULT_TRANSCRIPTION_MODEL): TranscriptionModel {
  if (config.provider !== 'openai' || !config.apiKey) {
    throw new AiConfigError('Transcription : fournisseur OpenAI et OPENAI_API_KEY requis')
  }
  return createOpenAI({ apiKey: config.apiKey }).transcription(modelId)
}
