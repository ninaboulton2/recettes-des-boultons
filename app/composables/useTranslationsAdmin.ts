import type { RunTranslationsResponse, TranslationStatus } from '#shared/schemas/translation'
import { apiFetch } from '~/composables/useApi'

/**
 * État et actions de la page /traductions (administrateurs) : combien de
 * recettes sont traduites, périmées ou sans traduction, et lancement de la
 * traduction des recettes manquantes.
 *
 * `run()` appelle `POST /api/translations/run` en boucle, une recette à la fois
 * (une recette = un appel IA, une requête serveur est limitée à 30 s) :
 *  - reprenable : la file est recalculée par le serveur à chaque requête, on
 *    peut arrêter (`stop()`), recharger la page ou relancer plus tard ;
 *  - une recette en échec (non systémique) est ignorée pour cette exécution
 *    (`failed`), les suivantes continuent ;
 *  - un échec systémique (quota journalier, clé IA, crédit épuisé) arrête tout
 *    et son message est affiché (`stopped`).
 */

export interface TranslationLogEntry {
  id: string
  title: string
  status: 'translated' | 'unchanged' | 'failed'
  lang?: 'fr' | 'en'
  message?: string
}

export function useTranslationsAdmin() {
  const { apiErrorFromResponse, toUserMessage } = useApiError()
  const { t } = useI18n()

  const status = ref<TranslationStatus | null>(null)
  const loading = ref(false)
  const running = ref(false)
  const stopRequested = ref(false)
  const processed = ref(0)
  const log = ref<TranslationLogEntry[]>([])
  const failed = ref<TranslationLogEntry[]>([])
  /** Arrêt systémique (quota, clé, crédit) ou erreur réseau : message à afficher. */
  const stopped = ref<string | null>(null)
  const error = ref<string | null>(null)
  const finished = ref(false)

  const pendingCount = computed(() => (status.value ? status.value.missing + status.value.stale : 0))
  const progressPercent = computed(() =>
    status.value && status.value.total > 0 ? Math.round((status.value.translated / status.value.total) * 100) : 0)

  async function load(): Promise<void> {
    loading.value = true
    error.value = null
    try {
      const response = await apiFetch('/api/translations')
      if (!response.ok) throw await apiErrorFromResponse(response)
      status.value = ((await response.json()) as { status: TranslationStatus }).status
    } catch (err: unknown) {
      error.value = `${t('translationsAdmin.errors.load')} ${toUserMessage(err)}`
    } finally {
      loading.value = false
    }
  }

  async function run(): Promise<void> {
    if (running.value) return
    running.value = true
    stopRequested.value = false
    stopped.value = null
    error.value = null
    finished.value = false
    processed.value = 0
    log.value = []
    failed.value = []
    const exclude: string[] = []
    try {
      while (!stopRequested.value) {
        const response = await apiFetch('/api/translations/run', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ limit: 1, exclude })
        })
        if (!response.ok) throw await apiErrorFromResponse(response)
        const data = (await response.json()) as RunTranslationsResponse
        status.value = data.status
        for (const result of data.results) {
          const entry: TranslationLogEntry = {
            id: result.id,
            title: result.title,
            status: result.status,
            ...(result.lang ? { lang: result.lang } : {}),
            ...(result.message ? { message: result.message } : {})
          }
          log.value = [entry, ...log.value].slice(0, 12)
          processed.value++
          if (result.status === 'failed') {
            exclude.push(result.id)
            failed.value = [...failed.value, entry]
          }
        }
        if (data.stopped) {
          stopped.value = data.stopped.message
          return
        }
        // Plus rien à traiter (hors recettes en échec ignorées) : terminé.
        if (data.results.length === 0) {
          finished.value = failed.value.length === 0
          return
        }
      }
    } catch (err: unknown) {
      stopped.value = toUserMessage(err)
    } finally {
      running.value = false
    }
  }

  function stop(): void {
    stopRequested.value = true
  }

  return { status, loading, running, stopRequested, processed, log, failed, stopped, error, finished, pendingCount, progressPercent, load, run, stop }
}
