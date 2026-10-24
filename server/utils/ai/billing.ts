import { APICallError } from 'ai'

/**
 * Classification des erreurs du fournisseur IA (phase 7, dossier §6.5) : un 429 peut être un simple trop-plein de requêtes
 * (réessayer plus tard) OU un crédit / une limite de facturation épuisés (couper l'IA et prévenir Nina). Seul le second
 * déclenche l'alerte.
 *
 *  - `billing`    : 402, code ou type `insufficient_quota` / `billing_hard_limit_reached` / `billing_not_active`, ou message
 *                   « exceeded your current quota » / « credit balance is too low » (OpenAI, Anthropic, Google) ;
 *  - `rate_limit` : 429 sans signe de facturation (code `rate_limit_exceeded`, « Rate limit reached… ») ;
 *  - `auth`       : 401 / 403 (clé absente ou refusée) ;
 *  - `timeout`    : 408 / 504 ;
 *  - `other`      : le reste.
 */
export type AiErrorKind = 'billing' | 'rate_limit' | 'auth' | 'timeout' | 'other'

const BILLING_CODES = new Set([
  'insufficient_quota',
  'billing_hard_limit_reached',
  'billing_not_active',
  'billing_limit_reached',
  'credit_balance_too_low'
])
const BILLING_MESSAGE = /insufficient[_ ]quota|exceeded your current quota|billing[_ ]hard[_ ]limit|billing[_ ]not[_ ]active|credit balance is too low|check your plan and billing/i
const RATE_CODES = new Set(['rate_limit_exceeded', 'requests', 'tokens'])

interface ProviderErrorFields { code: string, type: string, message: string }

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null
const text = (value: unknown): string => (typeof value === 'string' ? value : '')

/** Extrait `code`, `type` et `message` du corps d'erreur du fournisseur (objet déjà décodé, ou JSON dans `responseBody`). */
function providerFields(error: APICallError): ProviderErrorFields {
  let body: unknown = error.data
  if (!isRecord(body) && typeof error.responseBody === 'string') {
    try {
      body = JSON.parse(error.responseBody)
    } catch {
      body = undefined
    }
  }
  const inner = isRecord(body) && isRecord(body.error) ? body.error : isRecord(body) ? body : {}
  return {
    code: text(inner.code).toLowerCase(),
    type: text(inner.type).toLowerCase(),
    message: text(inner.message) || error.message
  }
}

export function classifyAiError(error: unknown): AiErrorKind {
  if (!APICallError.isInstance(error)) return 'other'
  const status = error.statusCode
  const { code, type, message } = providerFields(error)

  if (status === 402) return 'billing'
  if (BILLING_CODES.has(code) || BILLING_CODES.has(type)) return 'billing'
  if (RATE_CODES.has(code) || RATE_CODES.has(type)) return status === 429 || status === undefined ? 'rate_limit' : 'other'
  if ((status === 429 || status === 400 || status === 403) && BILLING_MESSAGE.test(message)) return 'billing'
  if (status === 429) return 'rate_limit'
  if (status === 401 || status === 403) return 'auth'
  if (status === 408 || status === 504) return 'timeout'
  return 'other'
}
