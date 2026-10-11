import type { Recipe, RecipeInput } from '#shared/types'
import type { AiTargetLanguage, TranslateRecipeResponse, TranslateUsageInfo } from '#shared/schemas/ai'
import {
  classifyRecipeFile,
  RECIPE_FILE_MAX_BYTES,
  RECIPE_FILES_MAX_COUNT,
  RECIPE_UPLOAD_MAX_BYTES,
  type TranscribeRecipeResponse
} from '#shared/schemas/media'
import { apiFetch } from '~/composables/useApi'
import type { RecordedAudio } from '~/composables/useAudioRecorder'

/**
 * État et actions de la page /traducteur :
 *  1. `translate()` : texte collé → `POST /api/translate-recipe` → aperçu (`preview`, un `RecipeInput`) ;
 *  2. `addToRecipes()` : aperçu → `useRecipesStore().addRecipe()` → recette créée (`added`) ;
 *     l'aperçu est déjà un `RecipeInput` (schéma Zod) : il part tel quel ;
 *  3. `editText()` / `reset()` pour revenir en arrière.
 *
 * Entrées média (phase 5) :
 *  - `addFiles()` : fichiers déposés ou choisis. Un texte (.txt, .md) est lu dans
 *    le navigateur et rejoint `recipeText` (aucun appel serveur) ; une photo
 *    (allégée avant envoi) ou un PDF rejoint `pendingFiles`. Tant qu'il y en a,
 *    `translate()` appelle `POST /api/extract-recipe` à la place du texte ;
 *  - `transcribe()` : dictée enregistrée → `POST /api/transcribe-recipe` → le
 *    texte rejoint `recipeText` pour relecture avant la structuration.
 *  Leurs erreurs et annonces sont à part (`mediaError`, `mediaStatus`).
 *
 * Les erreurs passent par `toUserMessage` (messages serveur en français pour
 * les 4xx, générique sinon) ; les 502/504 du fournisseur IA, que
 * `toUserMessage` rendrait génériques, reçoivent un message i18n dédié.
 */

export type TranslatorStep = 'input' | 'preview' | 'done'

export const RECIPE_TEXT_MIN = 20
export const RECIPE_TEXT_MAX = 20000

const MIB = 1024 * 1024
const uploadMaxMb = Math.round(RECIPE_UPLOAD_MAX_BYTES / MIB)

export function useTranslator() {
  const { t, locale } = useI18n()
  const recipesStore = useRecipesStore()
  const { toUserMessage, apiErrorFromResponse, isApiError } = useApiError()

  const recipeText = ref('')
  /** Langue cible proposée : celle de l'interface. */
  const defaultLanguage = (): AiTargetLanguage => (locale.value === 'en' ? 'en' : 'fr')
  const targetLanguage = ref<AiTargetLanguage>(defaultLanguage())
  const isTranslating = ref(false)
  const isAdding = ref(false)
  const preview = ref<RecipeInput | null>(null)
  const usage = ref<TranslateUsageInfo | null>(null)
  const added = ref<Recipe | null>(null)
  const error = ref<string | null>(null)

  /** Photos et PDF à analyser (déjà allégés), dans l'ordre d'ajout. */
  const pendingFiles = ref<File[]>([])
  const isPreparingFiles = ref(false)
  const isTranscribing = ref(false)
  /** Erreur liée aux fichiers ou à la dictée (affichée près de leur zone). */
  const mediaError = ref<string | null>(null)
  /** Annonce pour les lecteurs d'écran (zone `aria-live`). */
  const mediaStatus = ref('')

  const step = computed<TranslatorStep>(() => {
    if (added.value) return 'done'
    if (preview.value) return 'preview'
    return 'input'
  })

  const textLength = computed(() => recipeText.value.trim().length)
  const hasFiles = computed(() => pendingFiles.value.length > 0)
  /** Une opération est en cours : saisie, dépôt et envoi sont bloqués. */
  const isBusy = computed(() => isTranslating.value || isPreparingFiles.value || isTranscribing.value)
  const canTranslate = computed(() =>
    !isBusy.value
    && (hasFiles.value || (textLength.value >= RECIPE_TEXT_MIN && textLength.value <= RECIPE_TEXT_MAX)))

  function describeError(err: unknown): string {
    if (isApiError(err)) {
      if (err.statusCode === 502) return t('translator.errors.unavailable')
      if (err.statusCode === 504) return t('translator.errors.timeout')
      // Refus de la plateforme (corps > 4,5 Mo) : pas de JSON, donc pas de message du serveur.
      if (err.statusCode === 413) return t('translator.files.errors.uploadTooBig', { max: uploadMaxMb })
    }
    return toUserMessage(err)
  }

  /** Ajoute du texte à la zone de saisie, après le texte déjà présent. */
  function appendText(added: string): void {
    const clean = added.replace(/^\uFEFF/, '').trim()
    if (clean === '') return
    const current = recipeText.value.trimEnd()
    recipeText.value = current === '' ? clean : `${current}\n\n${clean}`
  }

  /**
   * Fichiers déposés ou choisis : tri par nature, contrôle des limites (mêmes
   * règles que le serveur, `shared/schemas/media.ts`), texte → zone de saisie,
   * photos et PDF → `pendingFiles`.
   */
  async function addFiles(incoming: File[]): Promise<void> {
    if (incoming.length === 0 || isBusy.value) return
    isPreparingFiles.value = true
    mediaError.value = null
    const problems: string[] = []
    const texts: string[] = []
    const toSend: File[] = []
    try {
      for (const file of incoming) {
        const kind = classifyRecipeFile(file)
        if (!kind) {
          problems.push(t('translator.files.errors.unsupported', { name: file.name }))
        } else if (file.size === 0) {
          problems.push(t('translator.files.errors.empty', { name: file.name }))
        } else if (file.size > RECIPE_FILE_MAX_BYTES) {
          problems.push(t('translator.files.errors.tooBig', { name: file.name, max: Math.round(RECIPE_FILE_MAX_BYTES / MIB) }))
        } else if (kind === 'text') {
          try {
            texts.push(await file.text())
          } catch {
            problems.push(t('translator.files.errors.readFailed', { name: file.name }))
          }
        } else if (kind === 'image') {
          try {
            toSend.push(await prepareImageForUpload(file))
          } catch {
            problems.push(t('translator.files.errors.imageFailed', { name: file.name }))
          }
        } else {
          toSend.push(file)
        }
      }

      const room = RECIPE_FILES_MAX_COUNT - pendingFiles.value.length
      const kept = toSend.slice(0, Math.max(0, room))
      if (kept.length < toSend.length) {
        problems.push(t('translator.files.errors.tooMany', { max: RECIPE_FILES_MAX_COUNT }))
      }
      const total = [...pendingFiles.value, ...kept].reduce((sum, file) => sum + file.size, 0)
      if (total > RECIPE_UPLOAD_MAX_BYTES) {
        problems.push(t('translator.files.errors.uploadTooBig', { max: uploadMaxMb }))
      } else if (kept.length > 0) {
        pendingFiles.value = [...pendingFiles.value, ...kept]
      }

      if (texts.length > 0) {
        appendText(texts.join('\n\n'))
        if (recipeText.value.trim().length > RECIPE_TEXT_MAX) {
          problems.push(t('translator.files.errors.textTooLong', { max: RECIPE_TEXT_MAX }))
        }
      }

      const addedCount = texts.length + (total > RECIPE_UPLOAD_MAX_BYTES ? 0 : kept.length)
      mediaStatus.value = addedCount > 0 ? t('translator.files.added', { n: addedCount }) : ''
    } finally {
      isPreparingFiles.value = false
    }
    mediaError.value = problems.length > 0 ? problems.join(' ') : null
  }

  /** Erreur venue d'une source de fichier extérieure (Google Drive), affichée près de la zone. */
  function setMediaError(message: string | null): void {
    mediaError.value = message
    if (message) mediaStatus.value = ''
  }

  function removeFile(index: number): void {
    pendingFiles.value = pendingFiles.value.filter((_, position) => position !== index)
    mediaStatus.value = t('translator.files.removed')
  }

  /** Dictée enregistrée → texte ajouté à la zone de saisie. */
  async function transcribe(audio: RecordedAudio): Promise<void> {
    if (isBusy.value) return
    isTranscribing.value = true
    mediaError.value = null
    mediaStatus.value = t('translator.audio.transcribing')
    try {
      const extension = audio.blob.type.includes('mp4') ? 'm4a' : audio.blob.type.includes('ogg') ? 'ogg' : 'webm'
      const form = new FormData()
      form.append('audio', audio.blob, `dictee.${extension}`)
      form.append('durationSeconds', String(audio.durationSeconds))
      const response = await apiFetch('/api/transcribe-recipe', { method: 'POST', body: form })
      if (!response.ok) throw await apiErrorFromResponse(response)
      const data = (await response.json()) as TranscribeRecipeResponse
      if (data.text.trim() === '') {
        mediaError.value = t('translator.audio.errors.empty')
        mediaStatus.value = ''
        return
      }
      appendText(data.text)
      mediaStatus.value = t('translator.audio.done')
    } catch (err: unknown) {
      mediaError.value = describeError(err)
      mediaStatus.value = ''
    } finally {
      isTranscribing.value = false
    }
  }

  function postText(): Promise<Response> {
    return apiFetch('/api/translate-recipe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ recipeText: recipeText.value.trim(), targetLanguage: targetLanguage.value })
    })
  }

  function postFiles(): Promise<Response> {
    const form = new FormData()
    for (const file of pendingFiles.value) form.append('files', file, file.name)
    form.append('targetLanguage', targetLanguage.value)
    return apiFetch('/api/extract-recipe', { method: 'POST', body: form })
  }

  async function translate(): Promise<void> {
    if (!canTranslate.value) return
    isTranslating.value = true
    error.value = null
    try {
      const response = hasFiles.value ? await postFiles() : await postText()
      if (!response.ok) throw await apiErrorFromResponse(response)
      const data = (await response.json()) as TranslateRecipeResponse
      preview.value = data.recipe
      usage.value = data.usage
    } catch (err: unknown) {
      error.value = describeError(err)
    } finally {
      isTranslating.value = false
    }
  }

  async function addToRecipes(): Promise<void> {
    if (!preview.value || isAdding.value) return
    isAdding.value = true
    error.value = null
    try {
      added.value = await recipesStore.addRecipe(preview.value)
    } catch (err: unknown) {
      error.value = describeError(err)
    } finally {
      isAdding.value = false
    }
  }

  /** Retour à la saisie en conservant le texte collé. */
  function editText(): void {
    preview.value = null
    usage.value = null
    error.value = null
  }

  function reset(): void {
    recipeText.value = ''
    pendingFiles.value = []
    mediaError.value = null
    mediaStatus.value = ''
    targetLanguage.value = defaultLanguage()
    preview.value = null
    usage.value = null
    added.value = null
    error.value = null
  }

  return {
    recipeText,
    targetLanguage,
    isTranslating,
    isAdding,
    preview,
    usage,
    added,
    error,
    pendingFiles,
    hasFiles,
    isPreparingFiles,
    isTranscribing,
    isBusy,
    mediaError,
    mediaStatus,
    step,
    textLength,
    canTranslate,
    addFiles,
    removeFile,
    setMediaError,
    transcribe,
    translate,
    addToRecipes,
    editText,
    reset
  }
}
