/**
 * État de l'IA pour une personne (v2, phase 7) : quota du jour de CE compte, crédit du service épuisé, budget du mois atteint.
 * Fonctions pures partagées par le serveur (`/api/ai/status`, garde des routes IA) et l'interface (bandeaux, boutons désactivés).
 * Les données brutes viennent des RPC `ai_quota_status` et `ai_service_status` (migration 0028).
 */

/** Codes applicatifs (`data.code`) renvoyés par les routes IA en v2. */
export const AI_CODES = {
  /** Crédit du fournisseur épuisé OU budget du mois atteint : l'IA est coupée pour tout le monde. 503. */
  unavailable: 'AI_UNAVAILABLE',
  /** Plafond du jour de ce compte atteint. 429. */
  quotaReached: 'AI_QUOTA_REACHED',
  /** Le fournisseur demande de ralentir (limite de débit, passager). 503. */
  busy: 'AI_BUSY'
} as const
export type AiCode = (typeof AI_CODES)[keyof typeof AI_CODES]

export const AI_UNAVAILABLE_MESSAGE
  = 'L\'import automatique et la traduction sont momentanément indisponibles. Vous pouvez saisir la recette à la main : elle sera traduite dès que possible.'
export const AI_BUSY_MESSAGE = 'Le service d\'IA est très sollicité en ce moment. Réessayez dans une minute.'

export interface AiLimits {
  /** Plafond du jour des comptes existants (`AI_DAILY_QUOTA`). */
  dailyQuota: number
  /** Plafond du jour des comptes neufs (`AI_NEW_ACCOUNT_DAILY_QUOTA`). */
  newAccountQuota: number
  /** Un compte est « neuf » pendant ce nombre de jours (`AI_NEW_ACCOUNT_DAYS`). */
  newAccountDays: number
  /** Plafond d'appels IA du mois, tous comptes (`AI_MONTHLY_BUDGET_CALLS`), 0 = aucun. */
  monthlyBudgetCalls: number
  /** Plafond de dollars estimés du mois, tous comptes (`AI_MONTHLY_BUDGET_USD`), 0 = aucun. */
  monthlyBudgetUsd: number
}

export interface AiQuotaInfo {
  used: number
  quota: number
  remaining: number
  /** Prochaine remise à zéro (minuit, heure de Paris), ISO 8601. */
  resetsAt: string
  isNew: boolean
}

export interface AiServiceInfo {
  creditExhausted: boolean
  since: string | null
  budgetExceeded: boolean
}

export type AiUnavailableReason = 'credit' | 'budget' | 'quota'

export interface AiStatus {
  available: boolean
  /** `credit` et `budget` : service coupé pour tous (même message) ; `quota` : ce compte seulement. */
  reason: AiUnavailableReason | null
  quota: AiQuotaInfo | null
  since: string | null
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)
const asInt = (value: unknown): number | null => (typeof value === 'number' && Number.isFinite(value) ? Math.trunc(value) : null)

/** Lit la réponse de `ai_quota_status` ; `null` si elle n'a pas la forme attendue. */
export function parseQuotaInfo(raw: unknown): AiQuotaInfo | null {
  if (!isRecord(raw)) return null
  const used = asInt(raw.used)
  const quota = asInt(raw.quota)
  if (used === null || quota === null || typeof raw.resets_at !== 'string') return null
  return { used, quota, remaining: Math.max(quota - used, 0), resetsAt: raw.resets_at, isNew: raw.is_new === true }
}

/** Lit la réponse de `ai_service_status` ; `null` si elle n'a pas la forme attendue. */
export function parseServiceInfo(raw: unknown): AiServiceInfo | null {
  if (!isRecord(raw)) return null
  return {
    creditExhausted: raw.credit_exhausted === true,
    since: typeof raw.since === 'string' ? raw.since : null,
    budgetExceeded: raw.budget_exceeded === true
  }
}

/**
 * Décision : le service coupé (crédit, budget) prime sur le plafond personnel, parce qu'attendre minuit ne servirait à rien.
 * Une donnée absente (RPC indisponible) ne bloque jamais : le quota est un garde-fou, pas une barrière de sécurité.
 */
export function decideAiStatus(service: AiServiceInfo | null, quota: AiQuotaInfo | null): AiStatus {
  if (service?.creditExhausted) return { available: false, reason: 'credit', quota, since: service.since }
  if (service?.budgetExceeded) return { available: false, reason: 'budget', quota, since: null }
  if (quota && quota.used >= quota.quota) return { available: false, reason: 'quota', quota, since: null }
  return { available: true, reason: null, quota, since: null }
}

/** Vrai quand l'IA est coupée pour tout le monde (crédit épuisé ou budget du mois atteint), faux pour un simple plafond personnel. */
export function isServiceWide(reason: AiUnavailableReason | null): boolean {
  return reason === 'credit' || reason === 'budget'
}

/** Remise à zéro lisible, toujours en heure de Paris (le décompte des appels suit le jour de Paris), ex. « 25 octobre à 00:00 ». */
export function formatResetsAt(iso: string, locale: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat(locale, { timeZone: 'Europe/Paris', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(date)
}
