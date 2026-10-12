import { z } from 'zod'
import { AI_TARGET_LANGUAGES } from './ai'

/**
 * Entrées « média » du traducteur IA (phase 5) : fichier (PDF, image, texte)
 * et dictée vocale. Règles partagées par le navigateur (contrôle avant envoi)
 * et par le serveur (`POST /api/extract-recipe`, `POST /api/transcribe-recipe`).
 *
 * Limites :
 *  - un fichier source ≤ 10 Mo (`RECIPE_FILE_MAX_BYTES`) ; les photos sont
 *    réduites dans le navigateur avant l'envoi ;
 *  - la requête envoyée ≤ 4 Mo (`RECIPE_UPLOAD_MAX_BYTES`) : Vercel refuse
 *    toute requête de plus de 4,5 Mo avant même d'atteindre le serveur ;
 *  - 4 fichiers (images ou PDF) au plus par recette ;
 *  - dictée ≤ 5 minutes (`AUDIO_MAX_SECONDS`) et ≤ 4 Mo.
 *
 * Le type déclaré par le client n'est jamais cru : le serveur reconnaît le
 * format à l'en-tête des octets (`sniffImageOrPdfType`, `sniffAudioType`).
 */

const MIB = 1024 * 1024

export const RECIPE_FILE_MAX_BYTES = 10 * MIB
export const RECIPE_UPLOAD_MAX_BYTES = 4 * MIB
export const RECIPE_FILES_MAX_COUNT = 4
export const AUDIO_MAX_SECONDS = 300
export const AUDIO_MAX_BYTES = 4 * MIB
/** Marge de tolérance sur la durée annoncée par le navigateur (arrêt automatique, latence). */
export const AUDIO_DURATION_SLACK_SECONDS = 15

/** Types envoyés au modèle multimodal (après lecture de l'en-tête). */
export const UPLOAD_MEDIA_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'] as const
export type UploadMediaType = (typeof UPLOAD_MEDIA_TYPES)[number]

export const AUDIO_MEDIA_TYPES = ['audio/webm', 'audio/mp4', 'audio/ogg', 'audio/wav', 'audio/mpeg'] as const
export type AudioMediaType = (typeof AUDIO_MEDIA_TYPES)[number]

/** Type MIME d'un document Word récent (`.docx`). */
export const DOCX_MIME_TYPE = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
const LEGACY_DOC_MIME_TYPE = 'application/msword'

/** Valeur de l'attribut `accept` du sélecteur de fichiers (`image/*` propose l'appareil photo sur mobile). */
export const RECIPE_FILE_ACCEPT = `image/*,application/pdf,text/plain,text/markdown,${DOCX_MIME_TYPE},.pdf,.txt,.md,.markdown,.docx`

/**
 * Nature d'un fichier choisi par l'utilisateur : `null` = format non pris en charge.
 * `docx` : document Word, dont le texte est extrait dans le navigateur (comme un `.txt`).
 */
export type RecipeFileKind = 'text' | 'image' | 'pdf' | 'docx'

interface FileLike {
  name: string
  type: string
}

function extensionOf(name: string): string {
  const dot = name.lastIndexOf('.')
  return dot < 0 ? '' : name.slice(dot + 1).toLowerCase()
}

const TEXT_TYPES = new Set(['text/plain', 'text/markdown', 'text/x-markdown'])
const TEXT_EXTENSIONS = new Set(['txt', 'md', 'markdown'])
const IMAGE_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'webp', 'heic', 'heif'])
/** Types génériques que certains navigateurs ou systèmes donnent à un document Word. */
const GENERIC_TYPES = new Set(['', 'application/octet-stream', 'application/zip', 'application/x-zip-compressed'])

function mimeOf(file: FileLike): string {
  return file.type.toLowerCase().split(';')[0]?.trim() ?? ''
}

/**
 * Ancien format Word (`.doc`, binaire) : non pris en charge, mais l'interface
 * le reconnaît pour conseiller « Enregistrer sous .docx ou PDF ».
 */
export function isLegacyWordFile(file: FileLike): boolean {
  const type = mimeOf(file)
  return type === LEGACY_DOC_MIME_TYPE || (extensionOf(file.name) === 'doc' && (type === '' || type === 'application/octet-stream'))
}

/**
 * Classe un fichier d'après son type MIME, avec repli sur l'extension (certains
 * navigateurs laissent le type vide pour `.md` ou `.heic`).
 */
export function classifyRecipeFile(file: FileLike): RecipeFileKind | null {
  const type = mimeOf(file)
  const extension = extensionOf(file.name)
  if (type === DOCX_MIME_TYPE || (extension === 'docx' && GENERIC_TYPES.has(type))) return 'docx'
  if (type === 'application/pdf' || (type === '' && extension === 'pdf')) return 'pdf'
  if (type.startsWith('image/') || (type === '' && IMAGE_EXTENSIONS.has(extension))) return 'image'
  if (TEXT_TYPES.has(type) || (TEXT_EXTENSIONS.has(extension) && (type === '' || type === 'application/octet-stream'))) return 'text'
  return null
}

const startsWith = (bytes: Uint8Array, signature: readonly number[], offset = 0): boolean =>
  bytes.length >= offset + signature.length && signature.every((value, index) => bytes[offset + index] === value)

const ascii = (text: string): number[] => [...text].map(char => char.charCodeAt(0))

/** Reconnaît JPEG, PNG, WebP ou PDF à l'en-tête des octets ; `null` sinon. */
export function sniffImageOrPdfType(bytes: Uint8Array): UploadMediaType | null {
  if (startsWith(bytes, [0xFF, 0xD8, 0xFF])) return 'image/jpeg'
  if (startsWith(bytes, [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A])) return 'image/png'
  if (startsWith(bytes, ascii('RIFF')) && startsWith(bytes, ascii('WEBP'), 8)) return 'image/webp'
  if (startsWith(bytes, ascii('%PDF-'))) return 'application/pdf'
  return null
}

/**
 * Reconnaît l'audio à l'en-tête : WebM (Chrome, Firefox, Android), MP4/M4A
 * (Safari, iOS), Ogg, WAV, MP3.
 */
export function sniffAudioType(bytes: Uint8Array): AudioMediaType | null {
  if (startsWith(bytes, [0x1A, 0x45, 0xDF, 0xA3])) return 'audio/webm'
  if (startsWith(bytes, ascii('ftyp'), 4)) return 'audio/mp4'
  if (startsWith(bytes, ascii('OggS'))) return 'audio/ogg'
  if (startsWith(bytes, ascii('RIFF')) && startsWith(bytes, ascii('WAVE'), 8)) return 'audio/wav'
  if (startsWith(bytes, ascii('ID3')) || (bytes.length > 1 && bytes[0] === 0xFF && ((bytes[1] ?? 0) & 0xE0) === 0xE0)) return 'audio/mpeg'
  return null
}

/** Extension de fichier à donner à l'audio envoyé au fournisseur (certains la déduisent du nom). */
export const AUDIO_EXTENSIONS: Readonly<Record<AudioMediaType, string>> = {
  'audio/webm': 'webm',
  'audio/mp4': 'm4a',
  'audio/ogg': 'ogg',
  'audio/wav': 'wav',
  'audio/mpeg': 'mp3'
}

const mb = (bytes: number) => Math.round(bytes / MIB)

/** Un fichier reçu par le serveur (métadonnées, après lecture de l'en-tête). */
export const recipeUploadFileSchema = z.object({
  filename: z.string().max(255, 'nom trop long'),
  mediaType: z.enum(UPLOAD_MEDIA_TYPES, { errorMap: () => ({ message: 'format non pris en charge (PDF, JPG, PNG ou WebP)' }) }),
  size: z.number().int()
    .min(1, 'fichier vide')
    .max(RECIPE_FILE_MAX_BYTES, `fichier trop volumineux (max ${mb(RECIPE_FILE_MAX_BYTES)} Mo)`)
})

/** Liste des fichiers d'une requête `POST /api/extract-recipe`. */
export const extractRecipeFilesSchema = z.array(recipeUploadFileSchema)
  .min(1, 'ajoutez au moins un fichier')
  .max(RECIPE_FILES_MAX_COUNT, `trop de fichiers (max ${RECIPE_FILES_MAX_COUNT})`)
  .refine(files => files.reduce((sum, file) => sum + file.size, 0) <= RECIPE_UPLOAD_MAX_BYTES, {
    message: `fichiers trop volumineux au total (max ${mb(RECIPE_UPLOAD_MAX_BYTES)} Mo)`
  })

/** Champs texte (non fichiers) de `POST /api/extract-recipe`. */
export const extractRecipeFieldsSchema = z.object({
  targetLanguage: z.enum(AI_TARGET_LANGUAGES, { errorMap: () => ({ message: 'doit être fr ou en' }) }).default('fr')
})

/** Fichier audio reçu par `POST /api/transcribe-recipe` (+ durée annoncée par le navigateur). */
export const transcribeAudioSchema = z.object({
  filename: z.string().max(255, 'nom trop long'),
  mediaType: z.enum(AUDIO_MEDIA_TYPES, { errorMap: () => ({ message: 'format audio non pris en charge' }) }),
  size: z.number().int()
    .min(1, 'enregistrement vide')
    .max(AUDIO_MAX_BYTES, `enregistrement trop volumineux (max ${mb(AUDIO_MAX_BYTES)} Mo)`),
  /** Indicatif (le fournisseur renvoie la durée réelle quand il peut) : sert à estimer le coût. */
  durationSeconds: z.number().min(0, 'durée invalide')
    .max(AUDIO_MAX_SECONDS + AUDIO_DURATION_SLACK_SECONDS, `enregistrement trop long (max ${AUDIO_MAX_SECONDS / 60} minutes)`)
    .nullable()
})

export type TranscribeAudioMeta = z.infer<typeof transcribeAudioSchema>

/** Réponse de `POST /api/transcribe-recipe`. */
export interface TranscribeRecipeResponse {
  success: true
  text: string
  usage: {
    provider: string
    model: string
    audioSeconds: number
    /** USD, `null` si le modèle n'est pas dans la grille de prix. */
    estimatedCostUsd: number | null
    durationMs: number
  }
}
