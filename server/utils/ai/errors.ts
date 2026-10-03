import { createError } from 'h3'
import { APICallError, LoadAPIKeyError, NoObjectGeneratedError, NoSuchModelError } from 'ai'
import { AiConfigError } from './provider'

/**
 * Traduction des erreurs du fournisseur IA (AI SDK) en erreurs HTTP lisibles,
 * **sans détail technique** côté client. Le détail est journalisé ici
 * (`console.error('[api] ai …')`) puisque `handleApiError` ne verra pas
 * ces erreurs (elles sont relancées en H3Error).
 *
 *  - clé absente / refusée (401, 403, LoadAPIKeyError, AiConfigError) → 401
 *  - crédit ou quota du fournisseur épuisé (402, 429)                 → 402
 *  - modèle inconnu (404, NoSuchModelError), autre réponse 4xx/5xx     → 502
 *  - délai dépassé (abort / timeout)                                   → 504
 *  - réponse inexploitable (JSON invalide, schéma non respecté)        → 422
 *
 * Tout ce qui n'est pas reconnu est laissé à `handleApiError` (500 générique).
 */

export const AI_ERROR_MESSAGES = {
  apiKey: 'Service IA non configuré : la clé du fournisseur est absente ou refusée. Vérifiez la variable d\'environnement sur Vercel.',
  providerQuota: 'Crédit ou quota du fournisseur IA épuisé. Rechargez le compte du fournisseur puis réessayez.',
  unavailable: 'Service de traduction indisponible pour le moment (fournisseur IA).',
  timeout: 'Le fournisseur IA n\'a pas répondu à temps. Réessayez, ou collez une recette plus courte.',
  unusable: 'La recette n\'a pas pu être structurée. Vérifiez que le texte collé est bien une recette complète et réessayez.'
} as const

function isAbortError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false
  const name = (error as { name?: unknown }).name
  return name === 'AbortError' || name === 'TimeoutError'
}

export function throwAiProviderError(error: unknown, context: string): void {
  if (error instanceof AiConfigError || LoadAPIKeyError.isInstance(error)) {
    console.error(`[api] ${context} : configuration IA`, error.message)
    throw createError({ statusCode: 401, statusMessage: AI_ERROR_MESSAGES.apiKey })
  }

  if (isAbortError(error)) {
    console.error(`[api] ${context} : délai dépassé`)
    throw createError({ statusCode: 504, statusMessage: AI_ERROR_MESSAGES.timeout })
  }

  if (NoSuchModelError.isInstance(error)) {
    console.error(`[api] ${context} : modèle inconnu`, error.message)
    throw createError({ statusCode: 502, statusMessage: AI_ERROR_MESSAGES.unavailable })
  }

  if (NoObjectGeneratedError.isInstance(error)) {
    console.error(`[api] ${context} : réponse inexploitable`, error.message, error.finishReason)
    throw createError({ statusCode: 422, statusMessage: AI_ERROR_MESSAGES.unusable })
  }

  if (APICallError.isInstance(error)) {
    const status = error.statusCode
    console.error(`[api] ${context} : réponse ${status ?? '?'} du fournisseur`, error.message)
    if (status === 401 || status === 403) {
      throw createError({ statusCode: 401, statusMessage: AI_ERROR_MESSAGES.apiKey })
    }
    if (status === 402 || status === 429) {
      throw createError({ statusCode: 402, statusMessage: AI_ERROR_MESSAGES.providerQuota })
    }
    if (status === 408 || status === 504) {
      throw createError({ statusCode: 504, statusMessage: AI_ERROR_MESSAGES.timeout })
    }
    throw createError({ statusCode: 502, statusMessage: AI_ERROR_MESSAGES.unavailable })
  }
}
