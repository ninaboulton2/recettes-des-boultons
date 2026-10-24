import { defineEventHandler } from 'h3'
import {
  AUDIO_MAX_BYTES,
  AUDIO_MAX_SECONDS,
  sniffAudioType,
  transcribeAudioSchema,
  type TranscribeRecipeResponse
} from '#shared/schemas/media'
import { getAiConfig } from '../utils/ai/provider'
import { getTranscriptionModel, transcribeAudio } from '../utils/ai/media'
import { estimateTranscriptionCostUsd } from '../utils/ai/pricing'
import { trackAiCall } from '../utils/ai/usage'
import { assertAiAllowed, throwAiFailure } from '../utils/ai/guard'
import { fileParts, readUploadParts, textField } from '../utils/ai/upload'

/**
 * POST /api/transcribe-recipe — dictée d'une recette (audio) → texte.
 *
 * Corps `multipart/form-data` : `audio` (WebM, MP4/M4A, Ogg, WAV ou MP3 ;
 * 4 Mo au plus, 5 minutes au plus) et `durationSeconds?` (durée mesurée par le
 * navigateur, sert à estimer le coût si le fournisseur ne la renvoie pas).
 * Réponse : `{ success, text, usage: { provider, model, audioSeconds,
 * estimatedCostUsd, durationMs } }`. Le texte est destiné à la zone de saisie
 * du traducteur (relecture, puis `POST /api/translate-recipe`) ; rien n'est
 * enregistré et l'audio n'est pas conservé.
 *
 * Étapes : auth admin → lecture et validation Zod → quota journalier (même
 * compteur que la traduction, 429) → transcription (AI SDK) → journalisation
 * `ai_usage` (feature `transcribe`, coût à la minute d'audio).
 */
export default defineEventHandler(async (event): Promise<TranscribeRecipeResponse> => {
  try {
    const { supabase, user } = await requireRecipeWriter(event)

    const parts = await readUploadParts(event, AUDIO_MAX_BYTES)
    const [audioPart] = fileParts(parts, 'audio')
    const audio = audioPart ? new Uint8Array(audioPart.data) : new Uint8Array()
    const durationField = textField(parts, 'durationSeconds')
    const meta = validateData(transcribeAudioSchema, {
      filename: audioPart?.filename ?? 'dictee',
      mediaType: sniffAudioType(audio) ?? 'inconnu',
      size: audio.byteLength,
      durationSeconds: durationField === undefined || durationField.trim() === '' ? null : Number(durationField)
    })

    const config = getAiConfig(event)
    await assertAiAllowed(event, supabase, config)

    const model = getTranscriptionModel(config)
    const { result, logged, durationMs } = await trackAiCall(
      supabase,
      { userId: user.id, provider: config.provider, model: config.transcriptionModel, feature: 'transcribe' },
      () => transcribeAudio(model, audio),
      (transcript) => {
        const seconds = audioSecondsOf(transcript.durationInSeconds, meta.durationSeconds, audio.byteLength)
        return { inputTokens: 0, outputTokens: 0, estimatedCostUsd: estimateTranscriptionCostUsd(config.transcriptionModel, seconds) }
      }
    )

    return {
      success: true,
      text: result.text,
      usage: {
        provider: config.provider,
        model: config.transcriptionModel,
        audioSeconds: audioSecondsOf(result.durationInSeconds, meta.durationSeconds, audio.byteLength),
        estimatedCostUsd: logged.estimatedCostUsd,
        durationMs
      }
    }
  } catch (error: unknown) {
    await throwAiFailure(event, error, 'transcribe-recipe')
    handleApiError(error, 'transcribe-recipe')
  }
})

/** Débit moyen supposé (octets/s) quand ni le fournisseur ni le navigateur ne donnent la durée : ~ 32 kbit/s. */
const FALLBACK_BYTES_PER_SECOND = 4_000

/**
 * Durée d'audio facturée : celle du fournisseur, sinon celle du navigateur,
 * sinon une estimation d'après la taille. Bornée à la durée maximale.
 */
function audioSecondsOf(provider: number | undefined, client: number | null, bytes: number): number {
  const seconds = provider ?? client ?? bytes / FALLBACK_BYTES_PER_SECOND
  return Math.round(Math.min(seconds, AUDIO_MAX_SECONDS) * 10) / 10
}
