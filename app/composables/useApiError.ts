/**
 * Conversion des erreurs d'appels API en message affichable.
 *
 *  - 400 / 401 / 403 / 404 / 409 : `statusMessage` renvoyé par le serveur
 *    (toujours rédigé en français côté `server/api`) ;
 *  - 5xx, erreur réseau, réponse illisible : message générique i18n
 *    (`errors.generic` / `errors.network`), jamais le détail technique.
 *
 * Usage dans un store :
 *   const response = await apiFetch('/api/…', { … })
 *   if (!response.ok) throw await apiErrorFromResponse(response)
 *   …
 *   } catch (error) { return { success: false, error: toUserMessage(error) } }
 */

const FALLBACK_GENERIC = 'Une erreur est survenue, réessayez plus tard.'
const FALLBACK_NETWORK = 'Connexion impossible, vérifiez votre réseau puis réessayez.'

export class ApiError extends Error {
  readonly statusCode: number
  readonly statusMessage: string

  constructor(statusCode: number, statusMessage: string) {
    super(statusCode >= 500 || !statusMessage ? translateKey('errors.generic', FALLBACK_GENERIC) : statusMessage)
    this.name = 'ApiError'
    this.statusCode = statusCode
    this.statusMessage = statusMessage
  }
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError
}

/**
 * Traduction i18n si l'app Nuxt est disponible (stores, composables), sinon
 * repli français (tests unitaires sans Nuxt).
 */
export function translateKey(key: string, fallback: string): string {
  try {
    const translated = useNuxtApp().$i18n.t(key)
    return translated && translated !== key ? translated : fallback
  } catch {
    return fallback
  }
}

interface StatusLike {
  statusCode?: unknown
  status?: unknown
  statusMessage?: unknown
  statusText?: unknown
  data?: { statusMessage?: unknown, message?: unknown }
}

function readStatus(error: StatusLike): number | null {
  const candidates = [error.statusCode, error.status]
  for (const value of candidates) {
    if (typeof value === 'number' && Number.isFinite(value)) return value
  }
  return null
}

function readStatusMessage(error: StatusLike): string {
  const candidates = [error.statusMessage, error.data?.statusMessage, error.data?.message]
  for (const value of candidates) {
    if (typeof value === 'string' && value.trim() !== '') return value
  }
  return ''
}

/**
 * Message à afficher à l'utilisateur pour une erreur quelconque.
 * Ne laisse jamais passer un message technique (Supabase, réseau, 5xx).
 */
export function toUserMessage(error: unknown): string {
  const generic = translateKey('errors.generic', FALLBACK_GENERIC)

  if (isApiError(error)) {
    return error.statusCode < 500 && error.statusMessage ? error.statusMessage : generic
  }

  // Erreur réseau (fetch) : TypeError « Failed to fetch » / « fetch failed ».
  if (error instanceof TypeError) {
    return translateKey('errors.network', FALLBACK_NETWORK)
  }

  if (typeof error === 'object' && error !== null) {
    const status = readStatus(error as StatusLike)
    if (status !== null) {
      const statusMessage = readStatusMessage(error as StatusLike)
      return status < 500 && statusMessage ? statusMessage : generic
    }
    // Erreur « maison » levée par le code applicatif (ex. « Vous devez être connecté… »).
    if (error instanceof Error && error.message.trim() !== '') {
      return error.message
    }
  }

  if (typeof error === 'string' && error.trim() !== '') {
    return error
  }

  return generic
}

/**
 * Construit une `ApiError` à partir d'une réponse HTTP en échec (`!response.ok`),
 * en lisant le `statusMessage` JSON renvoyé par h3 (`{ statusCode, statusMessage, message }`).
 */
export async function apiErrorFromResponse(response: Response): Promise<ApiError> {
  let statusMessage = ''
  try {
    const payload: unknown = await response.json()
    if (typeof payload === 'object' && payload !== null) {
      statusMessage = readStatusMessage(payload as StatusLike)
    }
  } catch {
    // Corps absent ou non JSON : on s'en tient au statut.
  }
  return new ApiError(response.status, statusMessage)
}

export function useApiError() {
  return { toUserMessage, apiErrorFromResponse, isApiError }
}
